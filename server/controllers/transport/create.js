/**
 * BlancBleu — Création de transports.
 *
 * POST /api/transports             — création unique avec géocodage + auto-Patient
 * POST /api/transports/recurrents  — série de transports récurrents (dialyse, etc.)
 */

const Transport = require("../../models/Transport");
const Patient = require("../../models/Patient");
const recurrenceService = require("../../services/recurrenceService");
const { hashDeterministic } = require("../../utils/hashing");
const { geocodeTransport } = require("../../utils/geocodeUtils");
const { audit } = require("../../services/auditService");
const { logger } = require("./_shared");

const createTransport = async (req, res, next) => {
  try {
    const body = { ...req.body };

    // ── Géocodage automatique (best-effort) ──────────────────────────────────
    // Si le formulaire a déjà envoyé des coordonnées (via autocomplétion BAN),
    // on ne refait pas d'appel réseau. Sinon, on tente de les obtenir côté serveur.
    const departSansGPS = !body.adresseDepart?.coordonnees?.lat;
    const destSansGPS = !body.adresseDestination?.coordonnees?.lat;

    if (departSansGPS || destSansGPS) {
      try {
        const [geoDepart, geoDest] = await geocodeTransport(
          departSansGPS ? body.adresseDepart : null,
          destSansGPS ? body.adresseDestination : null,
        );

        if (departSansGPS && geoDepart) {
          body.adresseDepart = {
            ...body.adresseDepart,
            coordonnees: { lat: geoDepart.lat, lng: geoDepart.lng },
          };
          logger.info("[Géocodage] Départ résolu", {
            label: geoDepart.label,
            score: geoDepart.score,
          });
        } else if (departSansGPS) {
          logger.warn("[Géocodage] Coordonnées départ indisponibles", {
            adresse: body.adresseDepart?.rue,
          });
        }

        if (destSansGPS && geoDest) {
          body.adresseDestination = {
            ...body.adresseDestination,
            coordonnees: { lat: geoDest.lat, lng: geoDest.lng },
          };
          logger.info("[Géocodage] Destination résolue", {
            label: geoDest.label,
            score: geoDest.score,
          });
        } else if (destSansGPS) {
          logger.warn("[Géocodage] Coordonnées destination indisponibles", {
            adresse: body.adresseDestination?.rue,
          });
        }
      } catch (geoErr) {
        // Géocodage non bloquant — le transport est créé même sans coordonnées
        logger.warn("[Géocodage] Erreur inattendue, coordonnées omises", {
          err: geoErr.message,
        });
      }
    }

    const transport = await Transport.create({
      ...body,
      createdBy: req.user._id,
    });

    // ── Auto-création du patient dans la collection Patient (best-effort) ─────
    const patientData = body.patient;
    if (patientData?.nom) {
      try {
        const conditions = [];
        if (patientData.numeroSecu?.trim()) {
          // Chercher par hash déterministe — numeroSecu est chiffré (AES-GCM non-déterministe)
          conditions.push({ numeroSecuHash: hashDeterministic(patientData.numeroSecu) });
        }
        const nomEsc = patientData.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const prenomEsc = (patientData.prenom || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        conditions.push({
          nom: { $regex: new RegExp(`^${nomEsc}$`, "i") },
          prenom: { $regex: new RegExp(`^${prenomEsc}$`, "i") },
        });

        const existant = await Patient.findOne({ $or: conditions });

        if (existant) {
          // Lier silencieusement si la référence était absente
          if (!transport.patientId) {
            await Transport.findByIdAndUpdate(transport._id, { patientId: existant._id });
          }
        } else {
          const nouveauPatient = await Patient.create({
            nom: patientData.nom,
            prenom: patientData.prenom || "",
            dateNaissance: patientData.dateNaissance || null,
            telephone: patientData.telephone || "",
            numeroSecu: patientData.numeroSecu?.trim() || "",
            mobilite: patientData.mobilite || "ASSIS",
            oxygene: patientData.oxygene || false,
            brancardage: patientData.brancardage || false,
            accompagnateur: patientData.accompagnateur || false,
            antecedents: patientData.antecedents || "",
            notes: patientData.notes || "",
            actif: true,
          });
          await Transport.findByIdAndUpdate(transport._id, { patientId: nouveauPatient._id });
          logger.info(`[Patient] Auto-créé : ${patientData.nom} ${patientData.prenom || ""}`, {
            patientId: nouveauPatient._id,
            transportId: transport._id,
          });
        }
      } catch (patientErr) {
        // Non bloquant — le transport est déjà créé
        logger.warn("[Patient] Auto-création échouée", {
          err: patientErr.message,
          transportId: transport._id,
        });
      }
    }

    await audit.transportCree(transport, req.user);

    res.status(201).json({ message: "Transport créé", transport });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    return next(err);
  }
};

const creerTransportsRecurrents = async (req, res, next) => {
  try {
    const { recurrence, ...baseData } = req.body;

    // Validation minimale avant de déléguer au service
    if (!recurrence || !recurrence.joursSemaine || !recurrence.dateFin) {
      return res.status(400).json({
        message: "Les paramètres de récurrence sont obligatoires : joursSemaine et dateFin",
      });
    }

    const resultat = await recurrenceService.creerSerieRecurrente(baseData, recurrence, req.user);

    res.status(201).json({
      message: `Série créée avec succès : ${resultat.nbOccurrences} transport(s) généré(s)${
        resultat.nbExclus > 0 ? `, ${resultat.nbExclus} jour(s) férié(s) exclu(s)` : ""
      }`,
      nbOccurrences: resultat.nbOccurrences,
      nbExclus: resultat.nbExclus,
      transportParentId: resultat.transportParentId,
      transports: resultat.transports,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: err.message });
    }
    // Erreurs métier levées explicitement par le service
    if (
      err.message.includes("Veuillez") ||
      err.message.includes("obligatoire") ||
      err.message.includes("Aucune occurrence") ||
      err.message.includes("postérieure") ||
      err.message.includes("invalide")
    ) {
      return res.status(400).json({ message: err.message });
    }
    return next(err);
  }
};

module.exports = { createTransport, creerTransportsRecurrents };
