const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Transport = require("../models/Transport");
const Prescription = require("../models/Prescription");
const Facture = require("../models/Facture");
const RefreshToken = require("../models/RefreshToken");

const safeMsg = (err) =>
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    ? err.message
    : "Erreur interne du serveur";

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Exporter toutes les données personnelles (RGPD Art. 20)
// @route   GET /api/gdpr/export
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const exportData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const payload = {
      exportedAt: new Date().toISOString(),
      notice: "Export de données personnelles — Ambulances Blanc Bleu (RGPD Art. 20)",
      compte: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        telephone: user.telephone,
        adresse: user.adresse,
        dateNaissance: user.dateNaissance,
        mobilite: user.mobilite,
        medecin: user.medecin,
        mutuelle: user.mutuelle,
        contactUrgence: user.contactUrgence,
        createdAt: user.createdAt,
      },
    };

    if (user.role === "patient") {
      const patient = await Patient.findOne({ email: user.email }).lean();

      if (patient) {
        payload.dossierMedical = {
          id: patient._id,
          numeroPatient: patient.numeroPatient,
          nom: patient.nom,
          prenom: patient.prenom,
          dateNaissance: patient.dateNaissance,
          telephone: patient.telephone,
          adresse: patient.adresse,
          numeroSecu: patient.numeroSecu,
          mobilite: patient.mobilite,
          mutuelle: patient.mutuelle,
          medecin: patient.medecin,
          contactUrgence: patient.contactUrgence,
        };

        const [transports, prescriptions, factures] = await Promise.all([
          Transport.find({ patientId: patient._id })
            .select("numero statut dateTransport adresseDepart adresseDestination motif typeTransport createdAt")
            .lean(),
          Prescription.find({ patientId: patient._id })
            .select("numero statut motif dateEmission medecin createdAt")
            .lean(),
          Facture.find({ patientId: patient._id })
            .select("numero montantTotal statut dateEmission datePaiement createdAt")
            .lean(),
        ]);

        payload.transports = transports;
        payload.prescriptions = prescriptions;
        payload.factures = factures;
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="blancbleu-mes-donnees-${Date.now()}.json"`,
    );
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Effacement des données personnelles (RGPD Art. 17)
//          Anonymise le compte — les dossiers médicaux/financiers sont conservés
//          pour conformité légale (obligation comptable 10 ans, Art. L123-22 Code de commerce)
// @route   DELETE /api/gdpr/me
// @access  Privé
// ─────────────────────────────────────────────────────────────────────────────
const eraseData = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Confirmation par mot de passe requise" });
    }

    const user = await User.findById(req.user._id).select("+password");
    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const anonEmail = `supprime-${user._id}@anonymise.local`;

    if (user.role === "patient") {
      const patient = await Patient.findOne({ email: user.email });

      if (patient) {
        // Anonymiser le sous-document patient embarqué dans chaque transport
        await Transport.updateMany(
          { patientId: patient._id },
          {
            $set: {
              "patient.nom": "[SUPPRIMÉ]",
              "patient.prenom": "[SUPPRIMÉ]",
              "patient.telephone": "",
              "patient.email": "",
            },
          },
        );

        // Anonymiser les champs dénormalisés dans les factures
        await Facture.updateMany(
          { patientId: patient._id },
          {
            $set: {
              patientNom: "[SUPPRIMÉ]",
              patientPrenom: "[SUPPRIMÉ]",
              patientNumeroSecu: "",
            },
          },
        );

        // Anonymiser le dossier Patient
        Object.assign(patient, {
          nom: "[SUPPRIMÉ]",
          prenom: "[SUPPRIMÉ]",
          email: anonEmail,
          telephone: "",
          adresse: { rue: "", ville: "", codePostal: "" },
          numeroSecu: "",
          contactUrgence: { nom: "", telephone: "" },
          actif: false,
        });
        await patient.save({ validateBeforeSave: false });
      }
    }

    // Anonymiser le compte User
    Object.assign(user, {
      nom: "[SUPPRIMÉ]",
      prenom: "[SUPPRIMÉ]",
      email: anonEmail,
      telephone: "",
      adresse: "",
      medecin: "",
      mutuelle: "",
      contactUrgence: { nom: "", telephone: "" },
      actif: false,
    });
    await user.save({ validateBeforeSave: false });

    // Révoquer toutes les sessions actives
    await RefreshToken.revokeAllForUser(req.user._id, "gdpr-erasure");

    // Effacer les cookies de session
    res.clearCookie("bb_access", { path: "/api" });
    res.clearCookie("bb_refresh", { path: "/api/auth" });

    res.json({
      message: "Vos données personnelles ont été supprimées conformément au RGPD",
    });
  } catch (err) {
    res.status(500).json({ message: safeMsg(err) });
  }
};

module.exports = { exportData, eraseData };
