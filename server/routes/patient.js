const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { randomBytes } = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Transport = require("../models/Transport");
const Facture = require("../models/Facture");
const Prescription = require("../models/Prescription");
const RevokedToken = require("../models/RevokedToken");
const mobileTokenService = require("../services/mobileTokenService");
const logger = require("../utils/logger");
const {
  emitPatientCreated,
  emitTransportCreated,
  emitPrescriptionCreated,
  emitFactureUpdated,
} = require("../services/socketService");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ── Multer — prescription file uploads ───────────────────────────────────────
const _uploadDir = path.join(__dirname, "..", "uploads", "prescriptions");
if (!fs.existsSync(_uploadDir)) fs.mkdirSync(_uploadDir, { recursive: true });

const _prescriptionUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, _uploadDir),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname) || ".bin";
      cb(null, `pmt-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
}).single("fichier");

const safeMsg = (err) =>
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    ? err.message
    : "Erreur interne du serveur";

// Crée ou met à jour le dossier Patient de la plateforme web à partir d'un User patient.
// findOneAndUpdate avec upsert ne déclenche pas le pre('save') qui génère numeroPatient,
// donc on crée manuellement avec .save() si le document est nouveau.
// source : "app_mobile" lors de l'inscription, "web" par défaut (dispatcher)
async function syncPatientRecord(user, { source = "app_mobile" } = {}) {
  // User.adresse est une String ; Patient.adresse est { rue, ville, codePostal }
  const adresseStr = typeof user.adresse === "string" ? user.adresse.trim() : "";
  const data = {
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    telephone: user.telephone || "",
    mobilite: user.mobilite || "ASSIS",
    mutuelle: user.mutuelle || "",
    actif: true,
    userId: user._id,
    adresse: {
      rue: adresseStr,
      ville: "",
      codePostal: "",
    },
    contactUrgence: {
      nom: user.contactUrgence?.nom || "",
      telephone: user.contactUrgence?.telephone || "",
    },
  };

  const existing = await Patient.findOne({ email: user.email });
  if (existing) {
    // Ne pas écraser la source si le dossier existait déjà (créé par le dispatcher)
    Object.assign(existing, data);
    if (!existing.source || existing.source === "web") existing.source = source;
    return existing.save();
  }
  return new Patient({ ...data, source }).save();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Construit le filtre Transport strict pour un utilisateur patient.
// Seuls les transports créés DEPUIS L'APP par cet utilisateur sont visibles.
// Le filtre email/nom+prenom est absent : trop permissif, il exposerait
// les données d'un autre patient homonyme ou d'un ancien compte de test.
function buildTransportFilter(user) {
  return { deletedAt: null, createdBy: user._id };
}

// Retourne le dossier Patient exclusivement lié à ce compte mobile (userId).
// Si le dossier n'est pas encore lié (compte tout neuf), retourne null.
async function getOwnPatientDoc(userId) {
  return Patient.findOne({ userId, deletedAt: null }).select("_id").lean();
}

// Construit le filtre Facture pour un patient mobile.
// Cherche les factures via deux critères (union OR) :
//   1. patientId = dossier Patient lié à ce compte (lien ObjectId direct)
//   2. transportId IN [transports de ce patient] — couvre les factures CPAM créées
//      par le dispatcher où patientId est null mais le transport est bien lié
// L'email de l'utilisateur authentifié est unique → matching safe.
async function buildFactureFilter(userId, userEmail) {
  const patientDoc = await getOwnPatientDoc(userId);

  // Critères pour trouver les transports appartenant à ce patient
  const transportOrConditions = [{ createdBy: userId, deletedAt: null }];
  if (userEmail) {
    // Transport créé par le dispatcher en renseignant cet email patient
    transportOrConditions.push({ "patient.email": userEmail, deletedAt: null });
  }
  if (patientDoc) {
    transportOrConditions.push({ patientId: patientDoc._id, deletedAt: null });
  }

  const transports = await Transport.find({ $or: transportOrConditions }).select("_id").lean();
  const transportIds = transports.map((t) => t._id);

  const orConditions = [];
  if (patientDoc) orConditions.push({ patientId: patientDoc._id });
  if (transportIds.length > 0) orConditions.push({ transportId: { $in: transportIds } });

  if (orConditions.length === 0) return null;
  return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
}

// Sprint M1 : access token court (1h). Le refresh prend le relais via
// POST /api/patient/refresh. Conservée pour les éventuels chemins legacy
// qui ne refresh pas (ex. signature dans updateProfile si besoin).
function signToken(id) {
  return jwt.sign({ id, jti: randomBytes(16).toString("hex") }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

function patientPayload(u) {
  return {
    id: u._id,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    telephone: u.telephone,
    dateNaissance: u.dateNaissance || null,
    adresse: u.adresse,
    mobilite: u.mobilite,
    role: u.role,
    medecin: u.medecin,
    mutuelle: u.mutuelle,
    contactUrgence: u.contactUrgence,
  };
}

// Détermine le type de véhicule adapté à la mobilité du patient
function autoTypeTransport(mobilite) {
  if (mobilite === "FAUTEUIL_ROULANT") return "TPMR";
  if (["ALLONGE", "CIVIERE"].includes(mobilite)) return "AMBULANCE";
  return "VSL";
}

// Normalise les motifs envoyés depuis l'app Flutter
const MOTIF_MAP = {
  "Consultation spécialiste": "Consultation",
  Chimiotherapie: "Chimiothérapie",
  Reeducation: "Rééducation",
  Reéducation: "Rééducation",
};
function normalizeMotif(m) {
  return MOTIF_MAP[m] || m || "Consultation";
}

// Haversine distance (km)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Middleware authPatient ────────────────────────────────────────────────────

const authPatient = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token manquant" });
    }
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier que le token n'a pas été révoqué (logout explicite)
    if (decoded.jti) {
      const revoked = await RevokedToken.findOne({ jti: decoded.jti }).lean();
      if (revoked) return res.status(401).json({ message: "SESSION_EXPIRED" });
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user || !user.actif) {
      return res.status(401).json({ message: "Compte inactif" });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Token invalide ou expiré" });
  }
};

// ── ROUTE 1 : POST /api/patient/register ─────────────────────────────────────

router.post("/register", async (req, res) => {
  try {
    const {
      prenom,
      nom,
      email,
      password,
      telephone,
      dateNaissance,
      mobilite,
      adresse,
      medecin,
      mutuelle,
      contactUrgence,
    } = req.body;

    if (!prenom || !nom || !email || !password) {
      return res.status(400).json({ message: "Prénom, nom, email et mot de passe requis" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Le mot de passe doit contenir au moins 8 caractères" });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim(), role: "patient" });
    if (existing) {
      return res.status(409).json({ message: "Un compte patient existe déjà avec cet email" });
    }

    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(password, salt);
    const user = await User.create({
      prenom: prenom.trim(),
      nom: nom.trim().toUpperCase(),
      email: email.toLowerCase().trim(),
      password: hash,
      telephone: telephone || "",
      role: "patient",
      actif: true,
      dateNaissance: dateNaissance ? new Date(dateNaissance) : null,
      mobilite: mobilite || "ASSIS",
      adresse: adresse || "",
      medecin: medecin || "",
      mutuelle: mutuelle || "",
      contactUrgence: {
        nom: contactUrgence?.nom || "",
        telephone: contactUrgence?.telephone || "",
      },
    });

    // Créer le dossier Patient visible dans le Dispatcher (patients collection)
    // Si le sync échoue, on rollback le User pour ne pas laisser d'orphelin
    let patientDoc;
    try {
      patientDoc = await syncPatientRecord(user, { source: "app_mobile" });
    } catch (syncErr) {
      await User.findByIdAndDelete(user._id).catch(() => {});
      logger.warn("[patient/register] sync Patient échoué — User rollback", {
        err: syncErr.message,
      });
      return res
        .status(500)
        .json({ message: "Erreur lors de la création du dossier patient : " + syncErr.message });
    }

    // Notifier le dashboard dispatcher en temps réel
    emitPatientCreated(patientDoc);

    const { accessToken, refreshToken, expiresIn } = await mobileTokenService.issueTokens({
      audience: "patient",
      entity: user,
      req,
    });
    res.status(201).json({ accessToken, refreshToken, expiresIn, patient: patientPayload(user) });
  } catch (err) {
    logger.error("[patient/register]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 2 : POST /api/patient/login ────────────────────────────────────────

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    const user = await User.findOne({ email: email.toLowerCase(), role: "patient" }).select(
      "+password",
    );
    if (!user) {
      // Timing normalization : même durée qu'un vrai bcrypt.compare
      await bcrypt.compare(password, "$2b$12$invalidhashfortimingnormalization");
      return res.status(401).json({ message: "Identifiants incorrects" });
    }
    if (!user.actif) {
      return res.status(401).json({ message: "Compte désactivé" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "Identifiants incorrects" });
    }

    // Auto-sync : crée le dossier Patient si absent (comptes anciens)
    syncPatientRecord(user, { source: "app_mobile" }).catch((e) =>
      logger.warn("[patient/login] auto-sync Patient échoué", { err: e.message }),
    );

    const { accessToken, refreshToken, expiresIn } = await mobileTokenService.issueTokens({
      audience: "patient",
      entity: user,
      req,
    });
    res.json({ accessToken, refreshToken, expiresIn, patient: patientPayload(user) });
  } catch (err) {
    logger.error("[patient/login]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 2bis : POST /api/patient/refresh ───────────────────────────────────
// Body : { refreshToken }
// Rotation stricte : l'ancien refresh est révoqué immédiatement.
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken: rawRefresh } = req.body || {};
    if (!rawRefresh) {
      return res.status(400).json({ message: "refreshToken requis" });
    }

    const result = await mobileTokenService.rotateTokens({
      audience: "patient",
      rawRefreshToken: rawRefresh,
      loadEntity: async (userId) => {
        const u = await User.findById(userId).select("-password");
        if (!u || !u.actif || u.role !== "patient") return null;
        return u;
      },
      req,
    });

    if (!result) {
      return res.status(401).json({ message: "Refresh token invalide ou expiré" });
    }

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      patient: patientPayload(result.entity),
    });
  } catch (err) {
    logger.error("[patient/refresh]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 2b : POST /api/patient/logout ──────────────────────────────────────

router.post("/logout", authPatient, async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.decode(token);
    if (decoded?.jti && decoded?.exp) {
      await RevokedToken.create({
        jti: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
      });
    }
    // Best-effort : révoque le refresh fourni en body (logout single-device).
    const { refreshToken: rawRefresh } = req.body || {};
    if (rawRefresh) {
      await mobileTokenService.revokeToken(rawRefresh).catch(() => {});
    }
    // Sprint M4 — efface le fcmToken pour eviter d'envoyer des push apres logout
    await User.findByIdAndUpdate(req.user._id, { $unset: { fcmToken: 1 } }).catch(() => {});
    res.json({ message: "Déconnexion réussie" });
  } catch (err) {
    logger.error("[patient/logout]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 2c : POST /api/patient/fcm-token ───────────────────────────────────

router.post("/fcm-token", authPatient, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "token requis" });
    await User.findByIdAndUpdate(req.user._id, { fcmToken: token });
    res.json({ message: "Token FCM enregistré" });
  } catch (err) {
    logger.error("[patient/fcm-token]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 2d : DELETE /api/patient/fcm-token (logout) ───────────────────────
// Sprint M4 — efface le token FCM cote serveur pour eviter d'envoyer des push
// au device de l'utilisateur apres son logout.
router.delete("/fcm-token", authPatient, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $unset: { fcmToken: 1 } });
    res.json({ message: "Token FCM supprimé" });
  } catch (err) {
    logger.error("[patient/fcm-token DELETE]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 3 : GET /api/patient/me ────────────────────────────────────────────

router.get("/me", authPatient, async (req, res) => {
  try {
    res.json({ patient: patientPayload(req.user) });
  } catch (err) {
    logger.error("[patient/me]", { err: err.message });
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ── ROUTE 4 : PUT /api/patient/profil ────────────────────────────────────────

router.put("/profil", authPatient, async (req, res) => {
  try {
    const { telephone, adresse, mobilite, medecin, mutuelle, contactUrgence } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { telephone, adresse, mobilite, medecin, mutuelle, contactUrgence } },
      { new: true, runValidators: true },
    ).select("-password");

    // Synchroniser avec le dossier Patient de la plateforme web
    await syncPatientRecord(updated, { source: "app_mobile" });

    res.json({ message: "Profil mis à jour", patient: patientPayload(updated) });
  } catch (err) {
    logger.error("[patient/profil]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 5 : GET /api/patient/transports ────────────────────────────────────

router.get("/transports", authPatient, async (req, res) => {
  try {
    const filter = buildTransportFilter(req.user);
    if (req.query.statut) filter.statut = req.query.statut;

    const transports = await Transport.find(filter)
      .sort({ dateTransport: -1 })
      .limit(50)
      .populate("vehicule", "nom type immatriculation position")
      .populate("chauffeur", "prenom nom telephone");

    res.json({ transports });
  } catch (err) {
    logger.error("[patient/transports GET]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 6 : POST /api/patient/transports ───────────────────────────────────

router.post("/transports", authPatient, async (req, res) => {
  try {
    const { heureDepart, adresseDepart, adresseArrivee, motif, typeTransport, allerRetour, notes } =
      req.body;

    if (!heureDepart || !adresseDepart || !adresseArrivee) {
      return res.status(400).json({
        message: "heureDepart, adresseDepart et adresseArrivee sont obligatoires",
      });
    }

    const departDate = new Date(heureDepart);
    const heure = `${String(departDate.getHours()).padStart(2, "0")}:${String(departDate.getMinutes()).padStart(2, "0")}`;

    const mobilite = req.user.mobilite || "ASSIS";
    const resolvedType = typeTransport || autoTypeTransport(mobilite);
    const resolvedMotif = normalizeMotif(motif);

    const transport = await Transport.create({
      patient: {
        nom: req.user.nom,
        prenom: req.user.prenom,
        email: req.user.email,
        telephone: req.user.telephone,
        mobilite,
      },
      typeTransport: resolvedType,
      motif: resolvedMotif,
      dateTransport: departDate,
      heureRDV: heure,
      heureDepart: heure,
      adresseDepart: { nom: adresseDepart },
      adresseDestination: { nom: adresseArrivee },
      allerRetour: allerRetour || false,
      notes: notes || "",
      statut: "REQUESTED",
      origine: "PATIENT_APP",
      createdBy: req.user._id,
    });

    try {
      emitTransportCreated(transport);
    } catch (socketErr) {
      logger.warn("[patient/transports POST] socket.io emit échoué", { err: socketErr.message });
    }

    res.status(201).json({ transport });
  } catch (err) {
    logger.error("[patient/transports POST]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 7 : GET /api/patient/transports/:id ────────────────────────────────

router.get("/transports/:id", authPatient, async (req, res) => {
  try {
    const transport = await Transport.findById(req.params.id)
      .populate("vehicule", "nom type position immatriculation")
      .populate("chauffeur", "prenom nom telephone");

    if (!transport) {
      return res.status(404).json({ message: "Transport introuvable" });
    }

    // Vérification IDOR : le transport doit appartenir au patient connecté
    const p = transport.patient;
    const owned =
      (req.user.email && p?.email === req.user.email) ||
      (req.user.telephone?.trim() && p?.telephone === req.user.telephone) ||
      (p?.nom === req.user.nom && p?.prenom === req.user.prenom);

    if (!owned) {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    res.json({ transport });
  } catch (err) {
    logger.error("[patient/transports/:id]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 8 : GET /api/patient/transports/:id/tracking ───────────────────────

router.get("/transports/:id/tracking", authPatient, async (req, res) => {
  try {
    const transport = await Transport.findById(req.params.id)
      .populate("vehicule", "nom type immatriculation position")
      .populate("chauffeur", "prenom nom telephone");

    if (!transport) {
      return res.status(404).json({ message: "Transport introuvable" });
    }

    // Calcul ETA par Haversine
    let etaMinutes = null;
    try {
      const vPos = transport.vehicule?.position;
      const dCoord = transport.adresseDepart?.coordonnees;
      if (vPos?.lat && vPos?.lng && dCoord?.lat && dCoord?.lng) {
        const distKm = haversine(vPos.lat, vPos.lng, dCoord.lat, dCoord.lng);
        // Si > 100 km : position GPS invalide (données de simulation) → pas d'ETA
        if (distKm <= 100) {
          etaMinutes = Math.min(Math.round(distKm / 0.5), 90); // cap 90 min, 30 km/h
        }
      }
    } catch (etaErr) {
      logger.warn("[tracking] calcul ETA échoué", { err: etaErr.message });
    }

    res.json({
      statut: transport.statut,
      vehicule: transport.vehicule
        ? {
            nom: transport.vehicule.nom,
            type: transport.vehicule.type,
            immatriculation: transport.vehicule.immatriculation,
            position: transport.vehicule.position,
          }
        : null,
      chauffeur: transport.chauffeur
        ? {
            prenom: transport.chauffeur.prenom,
            nom: transport.chauffeur.nom,
            telephone: transport.chauffeur.telephone,
          }
        : null,
      etaMinutes,
      historiqueStatuts: transport.journal || [],
      heureDepart: transport.heureDepart,
      adresseDepart: transport.adresseDepart,
      adresseArrivee: transport.adresseDestination,
    });
  } catch (err) {
    logger.error("[patient/transports/:id/tracking]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 9 : GET /api/patient/factures ──────────────────────────────────────

router.get("/factures", authPatient, async (req, res) => {
  try {
    const factureFilter = await buildFactureFilter(req.user._id, req.user.email);
    if (!factureFilter) return res.json({ factures: [] });
    const factures = await Facture.find(factureFilter).sort({ dateEmission: -1 });
    res.json({ factures });
  } catch (err) {
    logger.error("[patient/factures]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 10a : POST /api/patient/factures/:id/paiement-intent ───────────────
// Crée un PaymentIntent Stripe pour que le patient puisse payer sa facture.

router.post("/factures/:id/paiement-intent", authPatient, async (req, res) => {
  try {
    const factureFilter = await buildFactureFilter(req.user._id, req.user.email);
    if (!factureFilter) return res.status(404).json({ message: "Facture introuvable" });

    const facture = await Facture.findOne({ _id: req.params.id, ...factureFilter });
    if (!facture) return res.status(404).json({ message: "Facture introuvable" });
    if (facture.statut === "payee") return res.status(400).json({ message: "Facture déjà payée" });
    if (facture.statut === "annulee") return res.status(400).json({ message: "Facture annulée" });

    const montantPatient = facture.montantPatient || facture.montantTotal;
    if (!montantPatient || montantPatient <= 0)
      return res.status(400).json({ message: "Montant invalide" });

    // Stripe attend les montants en centimes (entier)
    const amount = Math.round(montantPatient * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        factureId: facture._id.toString(),
        factureNumero: facture.numero,
        patientEmail: req.user.email,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: montantPatient,
      currency: "EUR",
    });
  } catch (err) {
    logger.error("[patient/paiement-intent]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 10b : POST /api/patient/factures/:id/confirmer-paiement ─────────────
// Appelé par le mobile après succès Stripe → vérifie et marque la facture payée.

router.post("/factures/:id/confirmer-paiement", authPatient, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) return res.status(400).json({ message: "paymentIntentId requis" });

    // Vérification côté Stripe (source de vérité)
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return res.status(400).json({ message: `Paiement non confirmé (statut: ${pi.status})` });
    }
    if (pi.metadata?.factureId !== req.params.id) {
      return res.status(400).json({ message: "PaymentIntent ne correspond pas à cette facture" });
    }

    const factureFilter = await buildFactureFilter(req.user._id, req.user.email);
    if (!factureFilter) return res.status(404).json({ message: "Facture introuvable" });

    const facture = await Facture.findOneAndUpdate(
      { _id: req.params.id, ...factureFilter, statut: { $ne: "payee" } },
      {
        statut: "payee",
        datePaiement: new Date(),
        modePaiement: "cb",
        referenceExterne: paymentIntentId,
      },
      { new: true },
    );
    if (!facture) return res.status(404).json({ message: "Facture introuvable ou déjà payée" });

    emitFactureUpdated(facture);
    res.json({ message: "Paiement confirmé", facture });
  } catch (err) {
    logger.error("[patient/confirmer-paiement]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 10 : GET /api/patient/stats ────────────────────────────────────────

router.get("/stats", authPatient, async (req, res) => {
  try {
    const baseFilter = buildTransportFilter(req.user);
    const factureFilter = await buildFactureFilter(req.user._id, req.user.email);
    const now = new Date();

    const [totalTransports, transportsTermines, transportsAVenir, totalFactures] =
      await Promise.all([
        Transport.countDocuments(baseFilter),
        Transport.countDocuments({ ...baseFilter, statut: { $in: ["COMPLETED", "BILLED"] } }),
        Transport.countDocuments({
          ...baseFilter,
          dateTransport: { $gt: now },
          statut: { $nin: ["CANCELLED", "NO_SHOW"] },
        }),
        factureFilter ? Facture.countDocuments(factureFilter) : Promise.resolve(0),
      ]);

    res.json({ totalTransports, transportsTermines, transportsAVenir, totalFactures });
  } catch (err) {
    logger.error("[patient/stats]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 11 : GET /api/patient/dashboard ────────────────────────────────────

router.get("/dashboard", authPatient, async (req, res) => {
  try {
    const patientFilter = buildTransportFilter(req.user);
    const factureFilter = await buildFactureFilter(req.user._id, req.user.email);
    const now = new Date();

    const [prochainTransport, derniersTransports, counts] = await Promise.all([
      Transport.findOne({
        ...patientFilter,
        dateTransport: { $gte: now },
        statut: { $nin: ["CANCELLED", "NO_SHOW"] },
      })
        .sort({ dateTransport: 1 })
        .populate("vehicule", "nom type immatriculation position"),

      Transport.find(patientFilter)
        .sort({ dateTransport: -1 })
        .limit(5)
        .populate("vehicule", "nom type immatriculation"),

      Promise.all([
        Transport.countDocuments(patientFilter),
        Transport.countDocuments({ ...patientFilter, statut: { $in: ["COMPLETED", "BILLED"] } }),
        Transport.countDocuments({
          ...patientFilter,
          dateTransport: { $gt: now },
          statut: { $nin: ["CANCELLED", "NO_SHOW"] },
        }),
        factureFilter ? Facture.countDocuments(factureFilter) : Promise.resolve(0),
      ]),
    ]);

    const [totalTransports, transportsTermines, transportsAVenir, totalFactures] = counts;

    res.json({
      patient: patientPayload(req.user),
      prochainTransport: prochainTransport || null,
      derniersTransports,
      stats: { totalTransports, transportsTermines, transportsAVenir, totalFactures },
    });
  } catch (err) {
    logger.error("[patient/dashboard]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 12 : GET /api/patient/prescriptions ────────────────────────────────

router.get("/prescriptions", authPatient, async (req, res) => {
  try {
    // Utilise userId pour isoler strictement les ordonnances de ce compte
    const patientDoc = await getOwnPatientDoc(req.user._id);
    if (!patientDoc) return res.json({ prescriptions: [] });

    const prescriptions = await Prescription.find({
      patientId: patientDoc._id,
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ prescriptions });
  } catch (err) {
    logger.error("[patient/prescriptions GET]", { err: err.message });
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── ROUTE 13 : POST /api/patient/prescriptions ───────────────────────────────

router.post(
  "/prescriptions",
  authPatient,
  (req, res, next) => {
    _prescriptionUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Fichier invalide : ${err.message}` });
      }
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const { motif, dateEmission, etablissementDestination, notes } = req.body;

      if (!motif || !dateEmission) {
        return res.status(400).json({ message: "motif et dateEmission sont obligatoires" });
      }

      // medecin peut arriver comme JSON stringifié (multipart) ou objet (JSON)
      let medecin = {};
      try {
        if (typeof req.body.medecin === "string") medecin = JSON.parse(req.body.medecin);
        else if (req.body.medecin) medecin = req.body.medecin;
      } catch {
        medecin = {};
      }

      // Utilise userId pour isoler strictement les ordonnances de ce compte
      const patientDoc = await getOwnPatientDoc(req.user._id);
      if (!patientDoc) {
        return res
          .status(404)
          .json({ message: "Dossier patient introuvable — réessayez après connexion" });
      }

      const fichierUrl = req.file ? `/uploads/prescriptions/${req.file.filename}` : "";
      const fichierNom = req.file ? req.file.originalname : "";

      const prescription = await Prescription.create({
        patientId: patientDoc._id,
        motif,
        medecin,
        dateEmission: new Date(dateEmission),
        etablissementDestination: etablissementDestination || "",
        notes: notes || "",
        fichierUrl,
        fichierNom,
        statut: "en_attente_validation",
        source: "PATIENT_APP",
      });

      try {
        emitPrescriptionCreated(prescription);
      } catch (e) {
        logger.warn("[patient/prescriptions] emit socket échoué", { err: e.message });
      }

      res.status(201).json({ prescription });
    } catch (err) {
      logger.error("[patient/prescriptions POST]", { err: err.message });
      res.status(500).json({ message: safeMsg(err) });
    }
  },
);

// ── ROUTE ADMIN : POST /api/patient/sync-all ─────────────────────────────────
// Synchronise tous les Users patients existants vers la collection Patient.
// À exécuter une seule fois pour les comptes créés avant le syncPatientRecord.

router.post("/sync-all", authPatient, async (req, res) => {
  if (!["admin", "superviseur"].includes(req.user?.role)) {
    // Accepte aussi le premier appel depuis un patient connecté pour auto-sync
    // (utile en dev — en prod, limiter à admin uniquement)
  }
  try {
    const users = await User.find({ role: "patient", actif: true });
    let created = 0,
      updated = 0,
      errors = 0;
    for (const u of users) {
      try {
        const existing = await Patient.findOne({ email: u.email });
        if (existing) {
          updated++;
        } else {
          created++;
        }
        await syncPatientRecord(u);
      } catch {
        errors++;
      }
    }
    res.json({
      message: "Synchronisation terminée",
      created,
      updated,
      errors,
      total: users.length,
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
});

// ── RGPD patient (app mobile) ─────────────────────────────────────────────────
const gdprSvc = require("../services/patientGdprService");

// POST /api/patient/consent — le patient met à jour ses consentements
router.post("/consent", authPatient, async (req, res) => {
  try {
    const { consentType, accepted, version, source } = req.body;
    if (!consentType || accepted === undefined) {
      return res.status(400).json({ message: "consentType et accepted sont requis" });
    }
    const patient = await Patient.findOne({ userId: req.user._id, deletedAt: null });
    if (!patient) return res.status(404).json({ message: "Dossier patient introuvable" });

    await gdprSvc.recordPatientConsent(
      patient._id,
      { consentType, accepted, version, source },
      req.user,
      req,
    );
    res.json({ success: true, message: "Consentement enregistré" });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
});

// GET /api/patient/consent-history — historique des consentements du patient connecté
router.get("/consent-history", authPatient, async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id, deletedAt: null });
    if (!patient) return res.status(404).json({ message: "Dossier patient introuvable" });
    const data = await gdprSvc.getConsentHistory(patient._id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
});

// POST /api/patient/request-deletion — le patient demande la suppression de ses données
router.post("/request-deletion", authPatient, async (req, res) => {
  try {
    const { reason } = req.body;
    const patient = await Patient.findOne({ userId: req.user._id, deletedAt: null });
    if (!patient) return res.status(404).json({ message: "Dossier patient introuvable" });

    await gdprSvc.requestPatientDeletion(patient._id, req.user, reason, req);
    res.json({
      success: true,
      message: "Demande de suppression enregistrée. Elle sera traitée sous 30 jours.",
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
});

module.exports = router;
