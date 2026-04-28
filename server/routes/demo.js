const express = require("express");
const router = express.Router();
const Transport = require("../models/Transport");
const Vehicle = require("../models/Vehicle");

// Block en production
router.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Endpoint désactivé en production" });
  }
  next();
});

const DEMO_NOTES = "##DEMO_SEED##";

const DEMO_VEHICULES = [
  {
    immatriculation: "VSL-DEMO-01",
    nom: "VSL Démo 01",
    type: "VSL",
    statut: "disponible",
    capacitePassagers: 3,
    position: { lat: 43.7102, lng: 7.262 },
    basePosition: { lat: 43.7102, lng: 7.262 },
  },
  {
    immatriculation: "TPMR-DEMO-01",
    nom: "TPMR Démo 01",
    type: "TPMR",
    statut: "disponible",
    capacitePassagers: 1,
    equipeFauteuil: true,
    position: { lat: 43.7102, lng: 7.262 },
    basePosition: { lat: 43.7102, lng: 7.262 },
  },
  {
    immatriculation: "AMB-DEMO-01",
    nom: "Ambulance Démo 01",
    type: "AMBULANCE",
    statut: "disponible",
    capacitePassagers: 2,
    equipeBrancard: true,
    position: { lat: 43.7102, lng: 7.262 },
    basePosition: { lat: 43.7102, lng: 7.262 },
  },
];

function buildDemoTransports(today) {
  return [
    {
      patient: { nom: "Martin", prenom: "Jean", mobilite: "ASSIS" },
      typeTransport: "VSL",
      motif: "Dialyse",
      dateTransport: today,
      heureRDV: "08:00",
      adresseDepart: {
        nom: "Domicile Martin",
        rue: "Promenade des Anglais",
        ville: "Nice",
        coordonnees: { lat: 43.6963, lng: 7.2661 },
      },
      adresseDestination: {
        nom: "Hôpital Pasteur",
        rue: "30 Voie Romaine",
        ville: "Nice",
        coordonnees: { lat: 43.7102, lng: 7.262 },
      },
      statut: "CONFIRMED",
      notes: DEMO_NOTES,
    },
    {
      patient: { nom: "Dubois", prenom: "Marie", mobilite: "FAUTEUIL_ROULANT" },
      typeTransport: "TPMR",
      motif: "Chimiothérapie",
      dateTransport: today,
      heureRDV: "09:00",
      adresseDepart: {
        nom: "Domicile Dubois",
        rue: "Avenue de Cimiez",
        ville: "Nice",
        coordonnees: { lat: 43.7241, lng: 7.2731 },
      },
      adresseDestination: {
        nom: "Hôpital Saint-Roch",
        rue: "5 Rue Pierre Devoluy",
        ville: "Nice",
        coordonnees: { lat: 43.6955, lng: 7.2727 },
      },
      statut: "SCHEDULED",
      notes: DEMO_NOTES,
    },
    {
      patient: { nom: "Bernard", prenom: "Paul", mobilite: "ASSIS" },
      typeTransport: "VSL",
      motif: "Consultation",
      dateTransport: today,
      heureRDV: "10:00",
      adresseDepart: {
        nom: "Domicile Bernard",
        rue: "Route de Saint-Isidore",
        ville: "Nice",
        coordonnees: { lat: 43.7384, lng: 7.2271 },
      },
      adresseDestination: {
        nom: "Hôpital de Cimiez",
        rue: "4 Avenue Reine Victoria",
        ville: "Nice",
        coordonnees: { lat: 43.7208, lng: 7.2731 },
      },
      statut: "CONFIRMED",
      notes: DEMO_NOTES,
    },
    {
      patient: { nom: "Leroy", prenom: "Sophie", mobilite: "ALLONGE" },
      typeTransport: "AMBULANCE",
      motif: "Hospitalisation",
      dateTransport: today,
      heureRDV: "11:00",
      adresseDepart: {
        nom: "Aéroport Nice Côte d'Azur",
        rue: "Route de l'Aéroport",
        ville: "Nice",
        coordonnees: { lat: 43.7031, lng: 7.2441 },
      },
      adresseDestination: {
        nom: "Hôpital Saint-Roch",
        rue: "5 Rue Pierre Devoluy",
        ville: "Nice",
        coordonnees: { lat: 43.6955, lng: 7.2727 },
      },
      statut: "SCHEDULED",
      notes: DEMO_NOTES,
    },
    {
      patient: { nom: "Moreau", prenom: "Luc", mobilite: "FAUTEUIL_ROULANT" },
      typeTransport: "TPMR",
      motif: "Dialyse",
      dateTransport: today,
      heureRDV: "14:00",
      adresseDepart: {
        nom: "Domicile Moreau",
        rue: "Avenue Jean Médecin",
        ville: "Nice",
        coordonnees: { lat: 43.7108, lng: 7.2497 },
      },
      adresseDestination: {
        nom: "Hôpital Pasteur",
        rue: "30 Voie Romaine",
        ville: "Nice",
        coordonnees: { lat: 43.7102, lng: 7.262 },
      },
      statut: "CONFIRMED",
      notes: DEMO_NOTES,
    },
    {
      patient: { nom: "Petit", prenom: "Emma", mobilite: "ASSIS" },
      typeTransport: "VSL",
      motif: "Radiothérapie",
      dateTransport: today,
      heureRDV: "15:30",
      adresseDepart: {
        nom: "Domicile Petit",
        rue: "Boulevard du Mercantour",
        ville: "Nice",
        coordonnees: { lat: 43.6847, lng: 7.2408 },
      },
      adresseDestination: {
        nom: "Hôpital de Cimiez",
        rue: "4 Avenue Reine Victoria",
        ville: "Nice",
        coordonnees: { lat: 43.7208, lng: 7.2731 },
      },
      statut: "CONFIRMED",
      notes: DEMO_NOTES,
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

    // 2. Créer ou réutiliser les véhicules démo (upsert par immatriculation)
    const vehiculesCreated = [];
    for (const vDef of DEMO_VEHICULES) {
      const { immatriculation, ...fields } = vDef;
      const v = await Vehicle.findOneAndUpdate(
        { immatriculation },
        { $set: { immatriculation, ...fields } },
        { upsert: true, new: true },
      );
      vehiculesCreated.push(v);
    }

    // 3. Créer les 6 transports démo via .save() pour déclencher les hooks Mongoose
    const defs = buildDemoTransports(today);
    const transportsCreated = [];
    for (const def of defs) {
      const t = new Transport(def);
      await t.save();
      transportsCreated.push(t);
    }

    const dateStr = today.toLocaleDateString("fr-FR");
    return res.json({
      success: true,
      vehicules_crees: vehiculesCreated.length,
      transports_crees: transportsCreated.length,
      message: `Données démo chargées pour le ${dateStr}`,
      transports: transportsCreated.map((t) => t.numero),
    });
  } catch (err) {
    console.error("[demo/seed]", err.message);
    return res.status(500).json({ message: err.message || "Erreur seed démo" });
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
