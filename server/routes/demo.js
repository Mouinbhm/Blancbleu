const express = require("express");
const router = express.Router();
const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");
const logger = require("../utils/logger");
const {
  planifierTransport,
  assignerVehicule,
} = require("../services/transportLifecycle");

// Block en production
router.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Endpoint désactivé en production" });
  }
  next();
});

const DEMO_NOTES = "##DEMO_SEED##";
const SYSTEM_USER = { email: "demo@blancbleu.fr", role: "admin" };

// 6 véhicules démo — un par transport pour éviter les conflits de disponibilité
const DEMO_VEHICULES = [
  {
    immatriculation: "VSL-DEMO-01", nom: "VSL Démo 01", type: "VSL",
    statut: "Disponible", capacitePassagers: 3,
    position: { lat: 43.7102, lng: 7.262 }, basePosition: { lat: 43.7102, lng: 7.262 },
  },
  {
    immatriculation: "VSL-DEMO-02", nom: "VSL Démo 02", type: "VSL",
    statut: "Disponible", capacitePassagers: 3,
    position: { lat: 43.7102, lng: 7.262 }, basePosition: { lat: 43.7102, lng: 7.262 },
  },
  {
    immatriculation: "VSL-DEMO-03", nom: "VSL Démo 03", type: "VSL",
    statut: "Disponible", capacitePassagers: 3,
    position: { lat: 43.7102, lng: 7.262 }, basePosition: { lat: 43.7102, lng: 7.262 },
  },
  {
    immatriculation: "TPMR-DEMO-01", nom: "TPMR Démo 01", type: "TPMR",
    statut: "Disponible", capacitePassagers: 1, equipeFauteuil: true,
    position: { lat: 43.7102, lng: 7.262 }, basePosition: { lat: 43.7102, lng: 7.262 },
  },
  {
    immatriculation: "TPMR-DEMO-02", nom: "TPMR Démo 02", type: "TPMR",
    statut: "Disponible", capacitePassagers: 1, equipeFauteuil: true,
    position: { lat: 43.7102, lng: 7.262 }, basePosition: { lat: 43.7102, lng: 7.262 },
  },
  {
    immatriculation: "AMB-DEMO-01", nom: "Ambulance Démo 01", type: "AMBULANCE",
    statut: "Disponible", capacitePassagers: 2, equipeBrancard: true,
    position: { lat: 43.7102, lng: 7.262 }, basePosition: { lat: 43.7102, lng: 7.262 },
  },
];

// Chaque transport est associé à un véhicule démo dédié.
// prescription: { validee: true } est requis pour les motifs
// Dialyse / Chimiothérapie / Radiothérapie (guard CONFIRMED_SCHEDULED).
function buildDemoEntries(today) {
  return [
    {
      vehicleImmat: "VSL-DEMO-01",
      transport: {
        patient: { nom: "Martin", prenom: "Jean", mobilite: "ASSIS" },
        typeTransport: "VSL",
        motif: "Dialyse",
        dateTransport: today,
        heureRDV: "08:00",
        adresseDepart: {
          nom: "Domicile Martin", rue: "Promenade des Anglais", ville: "Nice",
          coordonnees: { lat: 43.6963, lng: 7.2661 },
        },
        adresseDestination: {
          nom: "Hôpital Pasteur", rue: "30 Voie Romaine", ville: "Nice",
          coordonnees: { lat: 43.7102, lng: 7.262 },
        },
        statut: "CONFIRMED",
        prescription: { validee: true },
        notes: DEMO_NOTES,
      },
    },
    {
      vehicleImmat: "TPMR-DEMO-01",
      transport: {
        patient: { nom: "Dubois", prenom: "Marie", mobilite: "FAUTEUIL_ROULANT" },
        typeTransport: "TPMR",
        motif: "Chimiothérapie",
        dateTransport: today,
        heureRDV: "09:00",
        adresseDepart: {
          nom: "Domicile Dubois", rue: "Avenue de Cimiez", ville: "Nice",
          coordonnees: { lat: 43.7241, lng: 7.2731 },
        },
        adresseDestination: {
          nom: "Hôpital Saint-Roch", rue: "5 Rue Pierre Devoluy", ville: "Nice",
          coordonnees: { lat: 43.6955, lng: 7.2727 },
        },
        statut: "CONFIRMED",
        prescription: { validee: true },
        notes: DEMO_NOTES,
      },
    },
    {
      vehicleImmat: "VSL-DEMO-02",
      transport: {
        patient: { nom: "Bernard", prenom: "Paul", mobilite: "ASSIS" },
        typeTransport: "VSL",
        motif: "Consultation",
        dateTransport: today,
        heureRDV: "10:00",
        adresseDepart: {
          nom: "Domicile Bernard", rue: "Route de Saint-Isidore", ville: "Nice",
          coordonnees: { lat: 43.7384, lng: 7.2271 },
        },
        adresseDestination: {
          nom: "Hôpital de Cimiez", rue: "4 Avenue Reine Victoria", ville: "Nice",
          coordonnees: { lat: 43.7208, lng: 7.2731 },
        },
        statut: "CONFIRMED",
        notes: DEMO_NOTES,
      },
    },
    {
      vehicleImmat: "AMB-DEMO-01",
      transport: {
        patient: { nom: "Leroy", prenom: "Sophie", mobilite: "ALLONGE" },
        typeTransport: "AMBULANCE",
        motif: "Hospitalisation",
        dateTransport: today,
        heureRDV: "11:00",
        adresseDepart: {
          nom: "Aéroport Nice Côte d'Azur", rue: "Route de l'Aéroport", ville: "Nice",
          coordonnees: { lat: 43.7031, lng: 7.2441 },
        },
        adresseDestination: {
          nom: "Hôpital Saint-Roch", rue: "5 Rue Pierre Devoluy", ville: "Nice",
          coordonnees: { lat: 43.6955, lng: 7.2727 },
        },
        statut: "CONFIRMED",
        notes: DEMO_NOTES,
      },
    },
    {
      vehicleImmat: "TPMR-DEMO-02",
      transport: {
        patient: { nom: "Moreau", prenom: "Luc", mobilite: "FAUTEUIL_ROULANT" },
        typeTransport: "TPMR",
        motif: "Dialyse",
        dateTransport: today,
        heureRDV: "14:00",
        adresseDepart: {
          nom: "Domicile Moreau", rue: "Avenue Jean Médecin", ville: "Nice",
          coordonnees: { lat: 43.7108, lng: 7.2497 },
        },
        adresseDestination: {
          nom: "Hôpital Pasteur", rue: "30 Voie Romaine", ville: "Nice",
          coordonnees: { lat: 43.7102, lng: 7.262 },
        },
        statut: "CONFIRMED",
        prescription: { validee: true },
        notes: DEMO_NOTES,
      },
    },
    {
      vehicleImmat: "VSL-DEMO-03",
      transport: {
        patient: { nom: "Petit", prenom: "Emma", mobilite: "ASSIS" },
        typeTransport: "VSL",
        motif: "Radiothérapie",
        dateTransport: today,
        heureRDV: "15:30",
        adresseDepart: {
          nom: "Domicile Petit", rue: "Boulevard du Mercantour", ville: "Nice",
          coordonnees: { lat: 43.6847, lng: 7.2408 },
        },
        adresseDestination: {
          nom: "Hôpital de Cimiez", rue: "4 Avenue Reine Victoria", ville: "Nice",
          coordonnees: { lat: 43.7208, lng: 7.2731 },
        },
        statut: "CONFIRMED",
        prescription: { validee: true },
        notes: DEMO_NOTES,
      },
    },
  ];
}

// ── POST /api/demo/seed ───────────────────────────────────────────────────────
router.post("/seed", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Supprimer les anciens transports démo
    await Transport.deleteMany({ notes: DEMO_NOTES });

    // 2. Remettre les véhicules démo existants en disponible avant l'upsert
    //    (évite qu'un re-seed échoue car un véhicule est encore en_mission)
    await Vehicle.updateMany(
      { immatriculation: { $regex: /DEMO/ } },
      { $set: { statut: "Disponible", transportEnCours: null } },
    );

    // 3. Créer ou réutiliser les 6 véhicules démo (upsert par immatriculation)
    const vehiculeMap = {};
    for (const vDef of DEMO_VEHICULES) {
      const { immatriculation, ...fields } = vDef;
      const v = await Vehicle.findOneAndUpdate(
        { immatriculation },
        { $set: { immatriculation, ...fields } },
        { upsert: true, new: true },
      );
      vehiculeMap[immatriculation] = v;
    }

    // 4. Créer chaque transport + chaîner CONFIRMED → SCHEDULED → ASSIGNED
    const entries = buildDemoEntries(today);
    const resultats = [];

    for (const entry of entries) {
      // Créer via .save() pour déclencher les hooks Mongoose (numérotation auto)
      const t = new Transport(entry.transport);
      await t.save();

      const vehicule = vehiculeMap[entry.vehicleImmat];
      let statut_final = t.statut;
      let erreur = null;

      try {
        // CONFIRMED → SCHEDULED (valide la PMT si motif le requiert)
        await planifierTransport(t._id, SYSTEM_USER);

        // SCHEDULED → ASSIGNED (set transport.vehicule + transition state machine)
        await assignerVehicule(
          t._id,
          { vehiculeId: vehicule._id },
          SYSTEM_USER,
        );

        statut_final = "ASSIGNED";
      } catch (err) {
        erreur = err.message;
        logger.error(
          `[demo/seed] Assignation échouée — ${t.numero} (${entry.transport.patient.prenom} ${entry.transport.patient.nom}):`,
          err.message,
        );
      }

      resultats.push({
        numero: t.numero,
        patient: `${entry.transport.patient.prenom} ${entry.transport.patient.nom}`,
        vehicule: entry.vehicleImmat,
        statut: statut_final,
        erreur,
      });
    }

    const assignes = resultats.filter((r) => r.statut === "ASSIGNED").length;
    const dateStr = today.toLocaleDateString("fr-FR");

    return res.json({
      success: true,
      date: dateStr,
      vehicules_crees: Object.keys(vehiculeMap).length,
      transports_crees: entries.length,
      transports_assignes: assignes,
      message: `${assignes}/${entries.length} transports assignés pour le ${dateStr}`,
      detail: resultats,
    });
  } catch (err) {
    logger.error("[demo/seed]", err.message);
    return res.status(500).json({ message: err.message || "Erreur seed démo" });
  }
});

// ── POST /api/demo/simulate/:id ──────────────────────────────────────────────
// Remet le transport à ASSIGNED puis lance la simulation GPS complète.
router.post("/simulate/:id", async (req, res) => {
  try {
    const { demarrerSimulation, arreterSimulation } = require("../services/simulationGPS");

    const transport = await Transport.findById(req.params.id).populate("vehicule");
    if (!transport) return res.status(404).json({ message: "Transport introuvable" });
    if (!transport.vehicule) return res.status(400).json({ message: "Aucun véhicule assigné à ce transport" });

    // Stopper une simulation déjà active sur ce transport
    arreterSimulation(req.params.id);

    // Remettre le véhicule en_mission + position de départ (légèrement décalé du pickup)
    const pickup = transport.adresseDepart?.coordonnees;
    const startPos = pickup?.lat
      ? { lat: pickup.lat + 0.02, lng: pickup.lng + 0.015 }
      : { lat: 43.7302, lng: 7.2770 };

    await Vehicle.findByIdAndUpdate(transport.vehicule._id, {
      statut: "En service",
      "position.lat": startPos.lat,
      "position.lng": startPos.lng,
      "position.updatedAt": new Date(),
      transportEnCours: transport._id,
    });

    // Remettre le transport à ASSIGNED + effacer les coordonnées mal geocodées
    // pour forcer une re-geocodisation propre avec sanity check au démarrage de la simulation
    await Transport.findByIdAndUpdate(req.params.id, {
      statut: "ASSIGNED",
      "adresseDepart.coordonnees": null,
      "adresseDestination.coordonnees": null,
    });

    // Lancer la simulation GPS
    await demarrerSimulation(req.params.id);

    return res.json({ success: true, message: "Simulation lancée", transportId: req.params.id });
  } catch (err) {
    logger.error("[demo/simulate]", err.message);
    return res.status(500).json({ message: err.message || "Erreur simulation" });
  }
});

// ── POST /api/demo/simulate/:id/stop ─────────────────────────────────────────
router.post("/simulate/:id/stop", async (req, res) => {
  try {
    const { arreterSimulation } = require("../services/simulationGPS");
    arreterSimulation(req.params.id);
    return res.json({ success: true, message: "Simulation arrêtée" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/demo/reset ──────────────────────────────────────────────────────
router.post("/reset", async (req, res) => {
  try {
    const { deletedCount: transports } = await Transport.deleteMany({ notes: DEMO_NOTES });
    const { deletedCount: vehicules } = await Vehicle.deleteMany({
      immatriculation: { $regex: /DEMO/ },
    });
    return res.json({ success: true, deleted: { transports, vehicules } });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Erreur reset démo" });
  }
});

module.exports = router;
