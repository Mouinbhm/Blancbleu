require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const Unit = require("./models/Unit");
const Intervention = require("./models/Intervention");
const Personnel = require("./models/Personnel");
const Equipement = require("./models/Equipement");
const Maintenance = require("./models/Maintenance");

// ─── GPS réels à Nice ─────────────────────────────────────────────────────────
const NICE = [
  {
    lat: 43.7102,
    lng: 7.262,
    adresse: "59 Bd Madeleine, Nice (Base principale)",
  },
  { lat: 43.72, lng: 7.245, adresse: "Hôpital Pasteur, 30 Voie Romaine, Nice" },
  { lat: 43.6961, lng: 7.2692, adresse: "CHU de Nice, 4 Av. Reine Victoria" },
  { lat: 43.703, lng: 7.278, adresse: "Place Masséna, Nice" },
  { lat: 43.718, lng: 7.27, adresse: "Aéroport Nice Côte d'Azur, Terminal 1" },
  { lat: 43.705, lng: 7.255, adresse: "Gare de Nice-Ville, Av. Thiers" },
  { lat: 43.69, lng: 7.26, adresse: "Promenade des Anglais, Nice (face n°52)" },
  { lat: 43.73, lng: 7.28, adresse: "Secteur Nord Nice — Lingostière" },
  { lat: 43.71, lng: 7.29, adresse: "Secteur Est Nice — Saint-Roch" },
  { lat: 43.7, lng: 7.24, adresse: "Secteur Ouest Nice — Saint-Augustin" },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connecté");

    await Promise.all([
      User.deleteMany(),
      Unit.deleteMany(),
      Intervention.deleteMany(),
      Personnel.deleteMany(),
      Equipement.deleteMany(),
      Maintenance.deleteMany(),
    ]);
    console.log("🗑️  Collections nettoyées");

    // ── UTILISATEURS ─────────────────────────────────────────────────────────
    const salt = await bcrypt.genSalt(10);
    const users = await User.insertMany([
      {
        nom: "Ben Hadj Mohamed",
        prenom: "Mouine",
        email: "belhajmouin@gmail.com",
        password: await bcrypt.hash("admin123", salt),
        role: "admin",
        actif: true,
      },
      {
        nom: "Dupont",
        prenom: "Marie",
        email: "dispatcher@blancbleu.fr",
        password: await bcrypt.hash("dispatcher123", salt),
        role: "dispatcher",
        actif: true,
      },
      {
        nom: "Farhat",
        prenom: "Chokri",
        email: "superviseur@blancbleu.fr",
        password: await bcrypt.hash("superviseur123", salt),
        role: "superviseur",
        actif: true,
      },
    ]);
    console.log(`👤 ${users.length} utilisateurs créés`);

    // ── UNITÉS (toutes à Nice) ────────────────────────────────────────────────
    const units = await Unit.insertMany([
      {
        immatriculation: "AA-001-NI",
        nom: "VSAV-01",
        type: "VSAV",
        statut: "disponible",
        position: NICE[0],
        kilometrage: 48320,
        carburant: 95,
        annee: 2022,
        equipage: [
          { nom: "Durand Paul", role: "Ambulancier" },
          { nom: "Leroy Claire", role: "Secouriste" },
        ],
        notes: "Unité principale — secteur centre Nice",
      },
      {
        immatriculation: "AB-002-NI",
        nom: "SMUR-01",
        type: "SMUR",
        statut: "disponible",
        position: NICE[1],
        kilometrage: 61890,
        carburant: 88,
        annee: 2023,
        equipage: [
          { nom: "Moreau Dr Jean", role: "Médecin" },
          { nom: "Petit Marc", role: "Infirmier" },
        ],
        notes: "SMUR rattaché à Hôpital Pasteur Nice",
      },
      {
        immatriculation: "AC-003-NI",
        nom: "VSAV-02",
        type: "VSAV",
        statut: "en_mission",
        position: NICE[3],
        kilometrage: 29450,
        carburant: 62,
        annee: 2021,
        equipage: [{ nom: "Simon Antoine", role: "Ambulancier" }],
        notes: "Secteur Place Masséna — en mission",
      },
      {
        immatriculation: "AD-004-NI",
        nom: "VSL-01",
        type: "VSL",
        statut: "disponible",
        position: NICE[5],
        kilometrage: 38990,
        carburant: 78,
        annee: 2022,
        equipage: [{ nom: "Laurent Eva", role: "Ambulancier" }],
        notes: "Transport sanitaire — secteur gare Nice-Ville",
      },
      {
        immatriculation: "AE-005-NI",
        nom: "VSAV-03",
        type: "VSAV",
        statut: "disponible",
        position: NICE[7],
        kilometrage: 55780,
        carburant: 91,
        annee: 2023,
        equipage: [
          { nom: "Blanc Thomas", role: "Ambulancier" },
          { nom: "Martin Sophie", role: "Infirmier" },
        ],
        notes: "Secteur Nord Nice — Lingostière",
      },
      {
        immatriculation: "AF-006-NI",
        nom: "SMUR-02",
        type: "SMUR",
        statut: "disponible",
        position: NICE[2],
        kilometrage: 27330,
        carburant: 85,
        annee: 2024,
        equipage: [{ nom: "Rossi Dr Lucie", role: "Médecin" }],
        notes: "SMUR CHU Nice — Secteur Cimiez",
      },
      {
        immatriculation: "AG-007-NI",
        nom: "VSAV-04",
        type: "VSAV",
        statut: "maintenance",
        position: NICE[0],
        kilometrage: 71200,
        carburant: 30,
        annee: 2019,
        equipage: [],
        notes: "En révision — retour prévu le 10/04/2026",
      },
      {
        immatriculation: "AH-008-NI",
        nom: "VSL-02",
        type: "VSL",
        statut: "disponible",
        position: NICE[9],
        kilometrage: 44200,
        carburant: 70,
        annee: 2022,
        equipage: [{ nom: "Faure Nicolas", role: "Chauffeur" }],
        notes: "Secteur Ouest Nice — Saint-Augustin",
      },
    ]);
    console.log(`🚑 ${units.length} unités créées — toutes à Nice`);

    // ── INTERVENTIONS (toutes à Nice) ─────────────────────────────────────────
    const interventions = await Intervention.insertMany([
      {
        typeIncident: "Arrêt cardiaque",
        priorite: "P1",
        scoreIA: 92,
        statut: "EN_ROUTE",
        patient: {
          nom: "Dupuis Michel",
          age: 67,
          etat: "inconscient",
          symptomes: ["arrêt cardiaque"],
          nbVictimes: 1,
        },
        adresse: "14 Rue de la Préfecture, Nice",
        coordonnees: { lat: 43.697, lng: 7.272 },
        unitAssignee: units[1]._id,
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 900000),
        heureDepart: new Date(Date.now() - 720000),
      },
      {
        typeIncident: "Accident de la route",
        priorite: "P2",
        scoreIA: 68,
        statut: "CREATED",
        patient: {
          nom: "Inconnu",
          etat: "conscient",
          symptomes: ["fracture membre"],
          nbVictimes: 2,
        },
        adresse: "Promenade des Anglais, Nice (face n°52)",
        coordonnees: { lat: 43.6942, lng: 7.2567 },
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 600000),
      },
      {
        typeIncident: "AVC",
        priorite: "P1",
        scoreIA: 88,
        statut: "EN_ROUTE",
        patient: {
          nom: "Ferrero Anna",
          age: 72,
          etat: "conscient",
          symptomes: ["AVC"],
          nbVictimes: 1,
        },
        adresse: "Avenue Jean Médecin, Nice",
        coordonnees: { lat: 43.704, lng: 7.268 },
        unitAssignee: units[0]._id,
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 1200000),
        heureDepart: new Date(Date.now() - 1000000),
      },
      {
        typeIncident: "Malaise",
        priorite: "P3",
        scoreIA: 35,
        statut: "COMPLETED",
        patient: {
          nom: "Rosso Pierre",
          age: 45,
          etat: "stable",
          symptomes: ["vertiges"],
          nbVictimes: 1,
        },
        adresse: "Place Garibaldi, Nice",
        coordonnees: { lat: 43.703, lng: 7.28 },
        unitAssignee: units[3]._id,
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 7200000),
        heureDepart: new Date(Date.now() - 7000000),
        heureTerminee: new Date(Date.now() - 5400000),
      },
      {
        typeIncident: "Traumatisme grave",
        priorite: "P2",
        scoreIA: 71,
        statut: "COMPLETED",
        patient: {
          nom: "Garcia Luis",
          age: 28,
          etat: "conscient",
          symptomes: ["fracture"],
          nbVictimes: 1,
        },
        adresse: "Rue Masséna, Nice",
        coordonnees: { lat: 43.6961, lng: 7.2719 },
        unitAssignee: units[4]._id,
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 10800000),
        heureDepart: new Date(Date.now() - 10500000),
        heureTerminee: new Date(Date.now() - 9000000),
      },
      {
        typeIncident: "Détresse respiratoire",
        priorite: "P1",
        scoreIA: 85,
        statut: "CREATED",
        patient: {
          nom: "Inconnu",
          etat: "critique",
          symptomes: ["détresse respiratoire"],
          nbVictimes: 1,
        },
        adresse: "Boulevard Gambetta, Nice",
        coordonnees: { lat: 43.705, lng: 7.262 },
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 300000),
      },
    ]);
    console.log(
      `🚨 ${interventions.length} interventions créées — toutes à Nice`,
    );

    // ── PERSONNEL ────────────────────────────────────────────────────────────
    const personnel = await Personnel.insertMany([
      {
        nom: "Durand",
        prenom: "Paul",
        role: "Ambulancier",
        statut: "en-service",
        uniteAssignee: units[0]._id,
        telephone: "06 11 22 33 44",
        email: "p.durand@blancbleu.fr",
        dateEmbauche: new Date("2020-03-15"),
      },
      {
        nom: "Leroy",
        prenom: "Claire",
        role: "Secouriste",
        statut: "en-service",
        uniteAssignee: units[0]._id,
        telephone: "06 22 33 44 55",
        email: "c.leroy@blancbleu.fr",
        dateEmbauche: new Date("2021-06-01"),
      },
      {
        nom: "Moreau",
        prenom: "Jean",
        role: "Médecin",
        statut: "en-service",
        uniteAssignee: units[1]._id,
        telephone: "06 33 44 55 66",
        email: "j.moreau@blancbleu.fr",
        dateEmbauche: new Date("2019-09-10"),
      },
      {
        nom: "Petit",
        prenom: "Marc",
        role: "Infirmier",
        statut: "en-service",
        uniteAssignee: units[1]._id,
        telephone: "06 44 55 66 77",
        email: "m.petit@blancbleu.fr",
        dateEmbauche: new Date("2022-01-20"),
      },
      {
        nom: "Simon",
        prenom: "Antoine",
        role: "Ambulancier",
        statut: "conge",
        uniteAssignee: units[2]._id,
        telephone: "06 55 66 77 88",
        email: "a.simon@blancbleu.fr",
        dateEmbauche: new Date("2021-11-05"),
      },
      {
        nom: "Laurent",
        prenom: "Eva",
        role: "Ambulancier",
        statut: "en-service",
        uniteAssignee: units[3]._id,
        telephone: "06 66 77 88 99",
        email: "e.laurent@blancbleu.fr",
        dateEmbauche: new Date("2023-04-12"),
      },
      {
        nom: "Blanc",
        prenom: "Thomas",
        role: "Ambulancier",
        statut: "formation",
        uniteAssignee: units[4]._id,
        telephone: "06 77 88 99 00",
        email: "t.blanc@blancbleu.fr",
        dateEmbauche: new Date("2024-01-08"),
      },
      {
        nom: "Martin",
        prenom: "Sophie",
        role: "Infirmier",
        statut: "en-service",
        uniteAssignee: units[4]._id,
        telephone: "06 88 99 00 11",
        email: "s.martin@blancbleu.fr",
        dateEmbauche: new Date("2022-07-18"),
      },
      {
        nom: "Faure",
        prenom: "Nicolas",
        role: "Chauffeur",
        statut: "en-service",
        uniteAssignee: units[7]._id,
        telephone: "06 99 00 11 22",
        email: "n.faure@blancbleu.fr",
        dateEmbauche: new Date("2023-09-01"),
      },
      {
        nom: "Rossi",
        prenom: "Lucie",
        role: "Médecin",
        statut: "en-service",
        uniteAssignee: units[5]._id,
        telephone: "06 00 11 22 33",
        email: "l.rossi@blancbleu.fr",
        dateEmbauche: new Date("2020-05-22"),
      },
    ]);
    console.log(`👥 ${personnel.length} membres du personnel créés`);

    // ── ÉQUIPEMENTS ───────────────────────────────────────────────────────────
    await Equipement.insertMany([
      {
        nom: "Défibrillateur ZOLL AED",
        categorie: "Défibrillateur",
        uniteAssignee: units[0]._id,
        etat: "opérationnel",
        dernierControle: new Date("2026-04-01"),
        dateExpiration: new Date("2027-04-01"),
      },
      {
        nom: "Oxymètre de pouls Nonin",
        categorie: "Oxymétrie",
        uniteAssignee: units[0]._id,
        etat: "opérationnel",
        dernierControle: new Date("2026-03-28"),
        dateExpiration: new Date("2027-03-28"),
      },
      {
        nom: "Moniteur cardiaque Lifepak",
        categorie: "Monitoring",
        uniteAssignee: units[1]._id,
        etat: "opérationnel",
        dernierControle: new Date("2026-03-15"),
        dateExpiration: new Date("2027-03-15"),
      },
      {
        nom: "Bouteille O₂ 15L",
        categorie: "Ventilation",
        uniteAssignee: units[1]._id,
        etat: "à-vérifier",
        dernierControle: new Date("2026-02-10"),
        dateExpiration: new Date("2026-08-10"),
      },
      {
        nom: "Kit trauma avancé",
        categorie: "Autre",
        uniteAssignee: units[2]._id,
        etat: "opérationnel",
        dernierControle: new Date("2026-03-25"),
        dateExpiration: new Date("2027-03-25"),
      },
      {
        nom: "Tensiomètre automatique",
        categorie: "Monitoring",
        uniteAssignee: units[3]._id,
        etat: "opérationnel",
        dernierControle: new Date("2026-04-02"),
        dateExpiration: new Date("2027-04-02"),
      },
      {
        nom: "Défibrillateur Philips",
        categorie: "Défibrillateur",
        uniteAssignee: units[4]._id,
        etat: "opérationnel",
        dernierControle: new Date("2026-03-30"),
        dateExpiration: new Date("2027-03-30"),
      },
      {
        nom: "Respirateur de transport",
        categorie: "Ventilation",
        uniteAssignee: units[5]._id,
        etat: "en-panne",
        dernierControle: new Date("2026-03-01"),
        dateExpiration: new Date("2027-03-01"),
      },
    ]);
    console.log("🔧 8 équipements créés");

    // ── MAINTENANCES ──────────────────────────────────────────────────────────
    await Maintenance.insertMany([
      {
        unite: units[6]._id,
        type: "Révision complète",
        statut: "en-cours",
        dateDebut: new Date("2026-04-01"),
        dateFin: new Date("2026-04-10"),
        garage: "Garage Azur Nice — Bd Auguste Raynaud",
        kilometrage: 71200,
        cout: 850,
      },
      {
        unite: units[0]._id,
        type: "Vidange + filtres",
        statut: "planifié",
        dateDebut: new Date("2026-04-15"),
        dateFin: new Date("2026-04-15"),
        garage: "Garage Central Nice — Av. de la Victoire",
        kilometrage: 48320,
        cout: 180,
      },
      {
        unite: units[3]._id,
        type: "Contrôle technique",
        statut: "planifié",
        dateDebut: new Date("2026-04-20"),
        dateFin: new Date("2026-04-20"),
        garage: "Contrôle Auto 06 — Nice Nord",
        kilometrage: 38990,
        cout: 120,
      },
      {
        unite: units[1]._id,
        type: "Changement pneus",
        statut: "terminé",
        dateDebut: new Date("2026-03-20"),
        dateFin: new Date("2026-03-20"),
        garage: "Pneumatiques Nice — Rue de Roquebillière",
        kilometrage: 61500,
        cout: 420,
      },
    ]);
    console.log("🔩 4 maintenances créées");

    console.log("\n" + "━".repeat(50));
    console.log("  ✅ Seed Nice terminé !");
    console.log("━".repeat(50));
    console.log("  belhajmouin@gmail.com    / admin123");
    console.log("  dispatcher@blancbleu.fr  / dispatcher123");
    console.log("  superviseur@blancbleu.fr / superviseur123");
    console.log("━".repeat(50));
    console.log(`  🚑 ${units.length} ambulances à Nice`);
    console.log(`  👥 ${personnel.length} membres du personnel`);
    console.log(`  🚨 ${interventions.length} interventions à Nice`);
    console.log("━".repeat(50) + "\n");
  } catch (err) {
    console.error("❌ Erreur seed:", err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();
