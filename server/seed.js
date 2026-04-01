require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const Unit = require("./models/Unit");
const Intervention = require("./models/Intervention");

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connecté");

    await Promise.all([
      User.deleteMany(),
      Unit.deleteMany(),
      Intervention.deleteMany(),
    ]);
    console.log("🗑️  Collections nettoyées");

    // Hash manuel des mots de passe
    const salt = await bcrypt.genSalt(10);
    const users = await User.insertMany([
      {
        nom: "Dupont",
        prenom: "Marie",
        email: "admin@blancbleu.fr",
        password: await bcrypt.hash("admin123", salt),
        role: "admin",
        actif: true,
      },
      {
        nom: "Martin",
        prenom: "Lucas",
        email: "dispatcher@blancbleu.fr",
        password: await bcrypt.hash("dispatcher123", salt),
        role: "dispatcher",
        actif: true,
      },
      {
        nom: "Bernard",
        prenom: "Sophie",
        email: "superviseur@blancbleu.fr",
        password: await bcrypt.hash("superviseur123", salt),
        role: "superviseur",
        actif: true,
      },
    ]);
    console.log(`👤 ${users.length} utilisateurs créés`);

    const units = await Unit.insertMany([
      {
        immatriculation: "AB-123-CD",
        nom: "VSAV-01",
        type: "VSAV",
        statut: "disponible",
        position: { lat: 48.8566, lng: 2.3522, adresse: "Base Nord" },
        equipage: [{ nom: "Durand Paul", role: "Ambulancier" }],
        carburant: 95,
      },
      {
        immatriculation: "EF-456-GH",
        nom: "SMUR-01",
        type: "SMUR",
        statut: "disponible",
        position: { lat: 48.87, lng: 2.33, adresse: "Hôpital Lariboisière" },
        equipage: [{ nom: "Moreau Dr Jean", role: "Médecin" }],
        carburant: 88,
      },
      {
        immatriculation: "IJ-789-KL",
        nom: "VSAV-02",
        type: "VSAV",
        statut: "en_mission",
        position: { lat: 48.84, lng: 2.38, adresse: "Paris 12e" },
        equipage: [{ nom: "Simon Antoine", role: "Ambulancier" }],
        carburant: 62,
      },
      {
        immatriculation: "MN-012-OP",
        nom: "VSL-01",
        type: "VSL",
        statut: "maintenance",
        position: { lat: 48.86, lng: 2.34, adresse: "Garage central" },
        equipage: [{ nom: "Blanc Thomas", role: "Ambulancier" }],
        carburant: 40,
      },
    ]);
    console.log(`🚑 ${units.length} unités créées`);

    await Intervention.insertMany([
      {
        typeIncident: "Arrêt cardiaque",
        priorite: "P1",
        scoreIA: 85,
        statut: "en_cours",
        patient: {
          nom: "Lefebvre Michel",
          age: 67,
          etat: "inconscient",
          symptomes: ["arrêt cardiaque"],
          nbVictimes: 1,
        },
        adresse: "12 Rue de Rivoli, Paris 4e",
        coordonnees: { lat: 48.8553, lng: 2.3514 },
        unitAssignee: units[1]._id,
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 900000),
        heureDepart: new Date(Date.now() - 720000),
      },
      {
        typeIncident: "Accident de la route",
        priorite: "P2",
        scoreIA: 65,
        statut: "en_attente",
        patient: {
          nom: "Inconnu",
          etat: "conscient",
          symptomes: ["fracture membre"],
          nbVictimes: 2,
        },
        adresse: "Bd Périphérique, Porte de Vincennes",
        coordonnees: { lat: 48.8472, lng: 2.4028 },
        dispatcher: users[1]._id,
      },
      {
        typeIncident: "Malaise",
        priorite: "P3",
        scoreIA: 35,
        statut: "terminee",
        patient: {
          nom: "Girard Anne",
          age: 45,
          etat: "stable",
          symptomes: ["vertiges"],
          nbVictimes: 1,
        },
        adresse: "8 Avenue de l'Opéra, Paris 1er",
        coordonnees: { lat: 48.8699, lng: 2.3341 },
        unitAssignee: units[0]._id,
        dispatcher: users[1]._id,
        heureAppel: new Date(Date.now() - 7200000),
        heureTerminee: new Date(Date.now() - 3600000),
      },
    ]);
    console.log("🚨 3 interventions créées");

    console.log("\n✅ Seed terminé !");
    console.log("  admin@blancbleu.fr       / admin123");
    console.log("  dispatcher@blancbleu.fr  / dispatcher123");
    console.log("  superviseur@blancbleu.fr / superviseur123\n");
  } catch (err) {
    console.error("❌ Erreur seed:", err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();
