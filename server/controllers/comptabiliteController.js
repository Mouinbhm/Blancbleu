/**
 * BlancBleu — Contrôleur Comptabilité
 * Agrège CA (factures), salaires (personnel), maintenances pour le dashboard financier.
 */
const Facture     = require("../models/Facture");
const Personnel   = require("../models/Personnel");
const Maintenance = require("../models/Maintenance");

// Taux URSSAF simplifiés
const TAUX_COT_SALARIALES  = 0.23; // 23% sur brut
const TAUX_COT_PATRONALES  = 0.42; // 42% sur brut

const getDashboard = async (req, res) => {
  try {
    const annee = parseInt(req.query.annee) || new Date().getFullYear();
    const mois  = parseInt(req.query.mois)  || (new Date().getMonth() + 1); // 1-12

    const debutMois = new Date(annee, mois - 1, 1);
    const finMois   = new Date(annee, mois, 0, 23, 59, 59);
    const debutAnnee = new Date(annee, 0, 1);
    const finAnnee   = new Date(annee, 11, 31, 23, 59, 59);

    // ── CA du mois (factures payées) ────────────────────────────────────────
    const facturesMois = await Facture.find({
      dateEmission: { $gte: debutMois, $lte: finMois },
      statut: { $ne: "annulee" },
    });

    const caTotal      = facturesMois.reduce((s, f) => s + (f.montantTotal || 0), 0);
    const caPartCPAM   = facturesMois.reduce((s, f) => s + (f.montantCPAM || 0), 0);
    const caPartPatient = facturesMois.reduce((s, f) => s + (f.montantPatient || 0), 0);

    // ── CA par mois (12 mois de l'année) ────────────────────────────────────
    const facturesAnnee = await Facture.find({
      dateEmission: { $gte: debutAnnee, $lte: finAnnee },
      statut: { $ne: "annulee" },
    });

    const caParMois = Array(12).fill(0);
    facturesAnnee.forEach((f) => {
      const m = new Date(f.dateEmission).getMonth();
      caParMois[m] += f.montantTotal || 0;
    });

    // ── Salaires (tout le personnel actif) ──────────────────────────────────
    const personnels = await Personnel.find({ actif: true });
    const masseSalariale        = personnels.reduce((s, p) => s + (p.salaireBrut || 0), 0);
    const totalSalaireNet       = personnels.reduce((s, p) => s + (p.salaireNet  || 0), 0);
    const cotisationsSalariales = Math.round(masseSalariale * TAUX_COT_SALARIALES * 100) / 100;
    const cotisationsPatronales = Math.round(masseSalariale * TAUX_COT_PATRONALES * 100) / 100;
    const coutTotalEmployeur    = Math.round((masseSalariale + cotisationsPatronales) * 100) / 100;

    // ── Maintenances du mois ────────────────────────────────────────────────
    const maintenancesMois = await Maintenance.find({
      dateDebut: { $gte: debutMois, $lte: finMois },
      statut: { $ne: "annulé" },
    });
    const totalMaintenances = maintenancesMois.reduce((s, m) => s + (m.cout || 0), 0);

    // ── Carburant (non géré — toujours 0) ──────────────────────────────────
    const carburant = 0;

    const totalCharges = Math.round((masseSalariale + cotisationsPatronales + totalMaintenances + carburant) * 100) / 100;
    const resultatNet  = Math.round((caTotal - totalCharges) * 100) / 100;
    const tauxMarge    = totalCharges > 0 ? Math.round((resultatNet / totalCharges) * 100 * 10) / 10 : 0;

    // ── Charges par mois (approximation : charges fixes × 12) ──────────────
    // Maintenances réelles par mois sur l'année
    const maintenancesAnnee = await Maintenance.find({
      dateDebut: { $gte: debutAnnee, $lte: finAnnee },
      statut: { $ne: "annulé" },
    });
    const maintParMois = Array(12).fill(0);
    maintenancesAnnee.forEach((m) => {
      const idx = new Date(m.dateDebut).getMonth();
      maintParMois[idx] += m.cout || 0;
    });

    const chargesParMois = Array(12).fill(0).map((_, i) => {
      const chargesFixesMois = masseSalariale + cotisationsPatronales;
      return Math.round((chargesFixesMois + maintParMois[i]) * 100) / 100;
    });

    // ── Récap annuel par mois ───────────────────────────────────────────────
    const recapAnnuel = Array(12).fill(null).map((_, i) => {
      const ca  = Math.round(caParMois[i] * 100) / 100;
      const ch  = chargesParMois[i];
      const res = Math.round((ca - ch) * 100) / 100;
      const marge = ch > 0 ? Math.round((res / ch) * 100 * 10) / 10 : null;
      return { mois: i + 1, ca, charges: ch, resultat: res, marge };
    });

    // ── URSSAF ──────────────────────────────────────────────────────────────
    const echeanceJour = new Date(annee, mois, 15); // 15 du mois suivant
    const urssaf = {
      masseSalariale,
      cotisationsSalariales,
      salaireNet: Math.round((masseSalariale - cotisationsSalariales) * 100) / 100,
      cotisationsPatronales,
      coutTotalEmployeur,
      statut: "a_payer",
      echeance: echeanceJour.toISOString().slice(0, 10),
    };

    // ── Alertes ─────────────────────────────────────────────────────────────
    const alertes = [];
    if (resultatNet < 0) {
      alertes.push({
        type: "danger",
        message: `Déficit ce mois : ${resultatNet.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`,
      });
    }
    const facturesEnAttente = facturesMois.filter((f) => ["en_attente", "emise"].includes(f.statut));
    if (facturesEnAttente.length > 0) {
      alertes.push({
        type: "warning",
        message: `${facturesEnAttente.length} facture(s) en attente de paiement`,
      });
    }
    const moisNom = new Date(annee, mois - 1, 1).toLocaleDateString("fr-FR", { month: "long" });
    alertes.push({
      type: "warning",
      message: `Déclaration URSSAF à payer avant le 15/${String(mois % 12 + 1).padStart(2, "0")}/${mois === 12 ? annee + 1 : annee}`,
    });
    const toutesPayees = facturesMois.length > 0 && facturesMois.every((f) => f.statut === "payee");
    if (toutesPayees) {
      alertes.push({ type: "success", message: "Taux recouvrement CPAM : 100% ✅" });
    }

    res.json({
      periode: { annee, mois, moisNom },
      ca: {
        total: Math.round(caTotal * 100) / 100,
        partCPAM: Math.round(caPartCPAM * 100) / 100,
        partPatient: Math.round(caPartPatient * 100) / 100,
        parMois: caParMois.map((v) => Math.round(v * 100) / 100),
      },
      charges: {
        salaires:     Math.round(masseSalariale * 100) / 100,
        urssaf:       cotisationsPatronales,
        maintenances: Math.round(totalMaintenances * 100) / 100,
        carburant,
        total:        totalCharges,
        parMois:      chargesParMois,
      },
      urssaf,
      recapAnnuel,
      resultatNet,
      tauxMarge,
      alertes,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getDashboard };
