/**
 * BlancBleu — Seed Transport Sanitaire Non Urgent
 * Données réalistes : dialyse, chimio, RDV médicaux, Nice
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const Vehicle = require("./models/Vehicle");
const Transport = require("./models/Transport");
const Patient = require("./models/Patient");
const Prescription = require("./models/Prescription");

const NICE_BASE = {
  lat: 43.7102,
  lng: 7.262,
  adresse: "59 Bd Madeleine, Nice",
};

const HOPITAUX_NICE = [
  {
    nom: "CHU Hôpital Pasteur",
    rue: "30 Voie Romaine",
    ville: "Nice",
    service: "Dialyse",
    lat: 43.72,
    lng: 7.245,
  },
  {
    nom: "Clinique Saint-George",
    rue: "2 Av. de Verdun",
    ville: "Nice",
    service: "Oncologie",
    lat: 43.715,
    lng: 7.26,
  },
  {
    nom: "Centre Hospitalier Cimiez",
    rue: "4 Av. Reine Victoria",
    ville: "Nice",
    service: "Rééducation",
    lat: 43.725,
    lng: 7.27,
  },
  {
    nom: "Clinique du Parc Impérial",
    rue: "8 Rue de la Buffa",
    ville: "Nice",
    service: "Consultation",
    lat: 43.705,
    lng: 7.255,
  },
  {
    nom: "CHU Hôpital de l'Archet",
    rue: "151 Route de Ginestière",
    ville: "Nice",
    service: "Chimiothérapie",
    lat: 43.69,
    lng: 7.235,
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connecté");

    // Nettoyage
    await Promise.all([
      User.deleteMany(),
      Vehicle.deleteMany(),
      Transport.deleteMany(),
      Patient.deleteMany(),
      Prescription.deleteMany(),
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
        nom: "Faure",
        prenom: "Nicolas",
        email: "chauffeur1@blancbleu.fr",
        password: await bcrypt.hash("chauffeur123", salt),
        role: "dispatcher",
        actif: true,
      },
      {
        nom: "Laurent",
        prenom: "Eva",
        email: "chauffeur2@blancbleu.fr",
        password: await bcrypt.hash("chauffeur123", salt),
        role: "dispatcher",
        actif: true,
      },
    ]);
    console.log(`👤 ${users.length} utilisateurs créés`);

    // ── VÉHICULES ─────────────────────────────────────────────────────────────
    const vehicles = await Vehicle.insertMany([
      {
        immatriculation: "AA-001-NI",
        nom: "VSL-01",
        type: "VSL",
        statut: "disponible",
        position: {
          lat: 43.7102,
          lng: 7.262,
          adresse: "Base — 59 Bd Madeleine, Nice",
        },
        baseAdresse: "59 Bd Madeleine, Nice",
        basePosition: { lat: 43.7102, lng: 7.262 },
        kilometrage: 48320,
        carburant: 95,
        annee: 2022,
        capacitePassagers: 3,
        tauxPonctualite: 97,
        chauffeurAssigne: users[2]._id,
        notes: "VSL principal — secteur centre Nice",
      },
      {
        immatriculation: "AB-002-NI",
        nom: "VSL-02",
        type: "VSL",
        statut: "disponible",
        position: {
          lat: 43.7,
          lng: 7.255,
          adresse: "Secteur Ouest Nice — Saint-Augustin",
        },
        baseAdresse: "59 Bd Madeleine, Nice",
        basePosition: { lat: 43.7102, lng: 7.262 },
        kilometrage: 38990,
        carburant: 78,
        annee: 2022,
        capacitePassagers: 3,
        tauxPonctualite: 93,
        chauffeurAssigne: users[3]._id,
        notes: "Secteur Ouest Nice",
      },
      {
        immatriculation: "AC-003-NI",
        nom: "TPMR-01",
        type: "TPMR",
        statut: "disponible",
        position: { lat: 43.718, lng: 7.27, adresse: "Secteur Nord Nice" },
        baseAdresse: "59 Bd Madeleine, Nice",
        basePosition: { lat: 43.7102, lng: 7.262 },
        kilometrage: 29450,
        carburant: 85,
        annee: 2021,
        capacitePassagers: 1,
        equipeFauteuil: true,
        tauxPonctualite: 91,
        notes: "Aménagé fauteuil roulant — rampe motorisée",
      },
      {
        immatriculation: "AD-004-NI",
        nom: "AMB-01",
        type: "AMBULANCE",
        statut: "disponible",
        position: { lat: 43.705, lng: 7.268, adresse: "Secteur Jean Médecin" },
        baseAdresse: "59 Bd Madeleine, Nice",
        basePosition: { lat: 43.7102, lng: 7.262 },
        kilometrage: 61890,
        carburant: 88,
        annee: 2023,
        capacitePassagers: 1,
        equipeBrancard: true,
        equipeOxygene: true,
        tauxPonctualite: 95,
        notes: "Ambulance équipée brancard + O2",
      },
      {
        immatriculation: "AE-005-NI",
        nom: "VSL-03",
        type: "VSL",
        statut: "maintenance",
        position: {
          lat: 43.7102,
          lng: 7.262,
          adresse: "Base — 59 Bd Madeleine, Nice",
        },
        baseAdresse: "59 Bd Madeleine, Nice",
        basePosition: { lat: 43.7102, lng: 7.262 },
        kilometrage: 71200,
        carburant: 30,
        annee: 2019,
        tauxPonctualite: 88,
        notes: "En révision — retour prévu le 10/04/2026",
      },
    ]);
    console.log(`🚐 ${vehicles.length} véhicules créés`);

    // ── PATIENTS ──────────────────────────────────────────────────────────────
    const patients = await Patient.insertMany([
      {
        nom: "Dubois", prenom: "Marcel",
        dateNaissance: new Date("1945-03-12"),
        telephone: "06 11 22 33 44",
        mobilite: "FAUTEUIL_ROULANT",
        brancardage: false,
        oxygene: false,
        exoneration: true,
        caisse: "CPAM Nice",
        numeroSecu: "1 45 03 06 001 001 00",
        contactUrgence: { nom: "Dubois Sylvie", telephone: "06 12 34 56 78", lien: "Épouse" },
        notes: "Dialysé 3x/semaine depuis 2019 — fauteuil motorisé",
        actif: true,
      },
      {
        nom: "Ferrero", prenom: "Anna",
        dateNaissance: new Date("1958-07-22"),
        telephone: "06 22 33 44 55",
        mobilite: "ASSIS",
        accompagnateur: true,
        exoneration: true,
        caisse: "CPAM Nice",
        numeroSecu: "2 58 07 06 002 002 00",
        contactUrgence: { nom: "Ferrero Jean", telephone: "06 23 45 67 89", lien: "Époux" },
        notes: "Accompagnateur autorisé — séance chimio toutes les 3 semaines",
        actif: true,
      },
      {
        nom: "Rosso", prenom: "Pierre",
        dateNaissance: new Date("1952-11-05"),
        telephone: "06 33 44 55 66",
        mobilite: "ASSIS",
        caisse: "CPAM Nice",
        numeroSecu: "1 52 11 06 003 003 00",
        actif: true,
      },
      {
        nom: "Garcia", prenom: "Luis",
        dateNaissance: new Date("1938-04-18"),
        telephone: "06 44 55 66 77",
        mobilite: "ALLONGE",
        brancardage: true,
        oxygene: false,
        exoneration: true,
        caisse: "CPAM Nice",
        numeroSecu: "1 38 04 06 004 004 00",
        notes: "Brancardage requis — patient ne peut pas marcher",
        actif: true,
      },
      {
        nom: "Martin", prenom: "Sophie",
        dateNaissance: new Date("1965-09-30"),
        mobilite: "ASSIS",
        telephone: "06 55 66 77 88",
        exoneration: true,
        caisse: "CPAM Nice",
        actif: true,
      },
      {
        nom: "Blanc", prenom: "Thomas",
        dateNaissance: new Date("1970-02-14"),
        mobilite: "ASSIS",
        telephone: "06 66 77 88 99",
        exoneration: true,
        caisse: "CPAM Nice",
        notes: "Radiothérapie — 25 séances protocole en cours (n°12)",
        actif: true,
      },
    ]);
    console.log(`👤 ${patients.length} patients créés`);

    // ── PRESCRIPTIONS ─────────────────────────────────────────────────────────
    const prescriptions = await Prescription.insertMany([
      {
        patientId: patients[0]._id,
        motif: "Dialyse",
        dateEmission: new Date("2025-01-10"),
        dateExpiration: new Date("2026-12-31"),
        medecin: { nom: "Martin", prenom: "Jean-Pierre", specialite: "Néphrologie", etablissement: "CHU Pasteur Nice" },
        statut: "active",
        validee: true,
        contenuExtrait: { diagnostic: "Insuffisance rénale chronique stade 5", frequence: "3x/semaine" },
      },
      {
        patientId: patients[1]._id,
        motif: "Chimiothérapie",
        dateEmission: new Date("2025-09-01"),
        dateExpiration: new Date("2026-06-30"),
        medecin: { nom: "Rossi", prenom: "Marco", specialite: "Oncologie", etablissement: "Hôpital de l'Archet" },
        statut: "active",
        validee: true,
        contenuExtrait: { diagnostic: "Cancer du sein — protocole AC", frequence: "Toutes les 3 semaines" },
      },
      {
        patientId: patients[2]._id,
        motif: "Consultation",
        dateEmission: new Date("2026-03-15"),
        dateExpiration: new Date("2026-09-15"),
        medecin: { nom: "Bernard", prenom: "Claire", specialite: "Cardiologie", etablissement: "Clinique du Parc Impérial" },
        statut: "active",
        validee: true,
      },
      {
        patientId: patients[3]._id,
        motif: "Hospitalisation",
        dateEmission: new Date("2026-04-20"),
        medecin: { nom: "Moreau", prenom: "Paul", specialite: "Cardiologie", etablissement: "CHU Pasteur Nice" },
        statut: "en_attente_validation",
        validee: false,
      },
      {
        patientId: patients[5]._id,
        motif: "Radiothérapie",
        dateEmission: new Date("2025-11-01"),
        dateExpiration: new Date("2026-07-31"),
        medecin: { nom: "Dupuis", prenom: "Henri", specialite: "Radiothérapie", etablissement: "Hôpital de l'Archet" },
        statut: "active",
        validee: true,
        contenuExtrait: { diagnostic: "Cancer de la prostate", nbSeances: 25, seanceActuelle: 12 },
      },
    ]);
    console.log(`📋 ${prescriptions.length} prescriptions créées`);

    // ── TRANSPORTS ────────────────────────────────────────────────────────────
    const aujourd_hui = new Date();
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const apres_demain = new Date();
    apres_demain.setDate(apres_demain.getDate() + 2);

    const transports = await Transport.insertMany([
      // 1. Dialyse récurrente — patient en fauteuil
      {
        patientId: patients[0]._id,
        prescriptionId: prescriptions[0]._id,
        patient: {
          nom: "Dubois",
          prenom: "Marcel",
          dateNaissance: new Date("1945-03-12"),
          telephone: "06 11 22 33 44",
          mobilite: "FAUTEUIL_ROULANT",
          brancardage: false,
        },
        typeTransport: "TPMR",
        motif: "Dialyse",
        dateTransport: aujourd_hui,
        heureRDV: "08:00",
        heureDepart: "07:15",
        allerRetour: true,
        adresseDepart: {
          rue: "12 Rue de France",
          ville: "Nice",
          codePostal: "06000",
          coordonnees: { lat: 43.698, lng: 7.262 },
        },
        adresseDestination: {
          nom: HOPITAUX_NICE[0].nom,
          rue: HOPITAUX_NICE[0].rue,
          ville: "Nice",
          service: "Dialyse — Bât. B",
          coordonnees: { lat: HOPITAUX_NICE[0].lat, lng: HOPITAUX_NICE[0].lng },
        },
        prescription: {
          medecin: "Dr. Martin",
          validee: true,
          motif: "Insuffisance rénale chronique",
        },
        recurrence: {
          active: true,
          frequence: "3x/semaine",
          joursSemaine: [1, 3, 5],
        },
        statut: "ASSIGNED",
        vehicule: vehicles[2]._id, // TPMR
        chauffeur: users[2]._id,
        tauxPriseEnCharge: 100,
        createdBy: users[1]._id,
        heureConfirmation: new Date(Date.now() - 86400000),
        heurePlanification: new Date(Date.now() - 86400000),
        heureAssignation: new Date(Date.now() - 3600000),
        notes: "Patient dialysé 3x/semaine depuis 2019",
      },

      // 2. Chimiothérapie — patient assis
      {
        patientId: patients[1]._id,
        prescriptionId: prescriptions[1]._id,
        patient: {
          nom: "Ferrero",
          prenom: "Anna",
          dateNaissance: new Date("1958-07-22"),
          telephone: "06 22 33 44 55",
          mobilite: "ASSIS",
          accompagnateur: true,
        },
        typeTransport: "VSL",
        motif: "Chimiothérapie",
        dateTransport: aujourd_hui,
        heureRDV: "10:00",
        heureDepart: "09:15",
        allerRetour: true,
        adresseDepart: {
          rue: "5 Avenue Jean Médecin",
          ville: "Nice",
          codePostal: "06000",
          coordonnees: { lat: 43.704, lng: 7.268 },
        },
        adresseDestination: {
          nom: HOPITAUX_NICE[4].nom,
          rue: HOPITAUX_NICE[4].rue,
          ville: "Nice",
          service: "Oncologie — Unité chimio",
          coordonnees: { lat: HOPITAUX_NICE[4].lat, lng: HOPITAUX_NICE[4].lng },
        },
        prescription: {
          medecin: "Dr. Rossi",
          validee: true,
          motif: "Cancer du sein — protocole AC",
        },
        statut: "EN_ROUTE_TO_PICKUP",
        vehicule: vehicles[0]._id, // VSL-01
        chauffeur: users[2]._id,
        tauxPriseEnCharge: 100,
        createdBy: users[1]._id,
        heureConfirmation: new Date(Date.now() - 86400000),
        heurePlanification: new Date(Date.now() - 86400000),
        heureAssignation: new Date(Date.now() - 7200000),
        heureEnRoute: new Date(Date.now() - 1800000),
        notes: "Accompagnateur autorisé — séance toutes les 3 semaines",
      },

      // 3. Consultation — patient assis
      {
        patientId: patients[2]._id,
        prescriptionId: prescriptions[2]._id,
        patient: {
          nom: "Rosso",
          prenom: "Pierre",
          dateNaissance: new Date("1952-11-05"),
          telephone: "06 33 44 55 66",
          mobilite: "ASSIS",
        },
        typeTransport: "VSL",
        motif: "Consultation",
        dateTransport: aujourd_hui,
        heureRDV: "14:30",
        heureDepart: "14:00",
        allerRetour: false,
        adresseDepart: {
          rue: "Place Garibaldi",
          ville: "Nice",
          codePostal: "06300",
          coordonnees: { lat: 43.703, lng: 7.28 },
        },
        adresseDestination: {
          nom: HOPITAUX_NICE[3].nom,
          rue: HOPITAUX_NICE[3].rue,
          ville: "Nice",
          service: "Cardiologie",
          coordonnees: { lat: HOPITAUX_NICE[3].lat, lng: HOPITAUX_NICE[3].lng },
        },
        prescription: {
          medecin: "Dr. Bernard",
          validee: true,
          motif: "Suivi cardiaque post-infarctus",
        },
        statut: "CONFIRMED",
        createdBy: users[1]._id,
        heureConfirmation: new Date(Date.now() - 43200000),
        tauxPriseEnCharge: 65,
        notes: "Patient autonome — RDV de contrôle",
      },

      // 4. Hospitalisation — patient allongé
      {
        patientId: patients[3]._id,
        prescriptionId: prescriptions[3]._id,
        patient: {
          nom: "Garcia",
          prenom: "Luis",
          dateNaissance: new Date("1938-04-18"),
          telephone: "06 44 55 66 77",
          mobilite: "ALLONGE",
          brancardage: true,
          oxygene: false,
        },
        typeTransport: "AMBULANCE",
        motif: "Hospitalisation",
        dateTransport: demain,
        heureRDV: "09:00",
        heureDepart: "08:30",
        allerRetour: false,
        adresseDepart: {
          rue: "14 Rue de la Préfecture",
          ville: "Nice",
          codePostal: "06000",
          coordonnees: { lat: 43.697, lng: 7.272 },
        },
        adresseDestination: {
          nom: HOPITAUX_NICE[0].nom,
          rue: HOPITAUX_NICE[0].rue,
          ville: "Nice",
          service: "Cardiologie — Chambre 214",
          coordonnees: { lat: HOPITAUX_NICE[0].lat, lng: HOPITAUX_NICE[0].lng },
        },
        prescription: {
          medecin: "Dr. Moreau",
          validee: false,
          motif: "Décompensation cardiaque",
        },
        statut: "REQUESTED",
        createdBy: users[1]._id,
        tauxPriseEnCharge: 100,
        notes: "Brancardage requis — patient ne peut pas marcher",
      },

      // 5. Transport complété
      {
        patientId: patients[4]._id,
        patient: {
          nom: "Martin",
          prenom: "Sophie",
          dateNaissance: new Date("1965-09-30"),
          mobilite: "ASSIS",
        },
        typeTransport: "VSL",
        motif: "Dialyse",
        dateTransport: new Date(Date.now() - 86400000),
        heureRDV: "08:00",
        heureDepart: "07:15",
        allerRetour: true,
        adresseDepart: {
          rue: "Promenade des Anglais",
          ville: "Nice",
          codePostal: "06000",
          coordonnees: { lat: 43.694, lng: 7.256 },
        },
        adresseDestination: {
          nom: HOPITAUX_NICE[0].nom,
          rue: HOPITAUX_NICE[0].rue,
          ville: "Nice",
          service: "Dialyse",
          coordonnees: { lat: HOPITAUX_NICE[0].lat, lng: HOPITAUX_NICE[0].lng },
        },
        prescription: {
          medecin: "Dr. Petit",
          validee: true,
          motif: "IRC stade 5",
        },
        statut: "COMPLETED",
        vehicule: vehicles[1]._id,
        chauffeur: users[3]._id,
        createdBy: users[1]._id,
        tauxPriseEnCharge: 100,
        heureConfirmation: new Date(Date.now() - 172800000),
        heurePlanification: new Date(Date.now() - 172800000),
        heureAssignation: new Date(Date.now() - 100000000),
        heureEnRoute: new Date(Date.now() - 93600000),
        heurePriseEnCharge: new Date(Date.now() - 90000000),
        heureArriveeDestination: new Date(Date.now() - 86400000),
        heureTerminee: new Date(Date.now() - 84000000),
        dureeReelleMinutes: 52,
      },

      // 6. Radiothérapie planifiée demain
      {
        patientId: patients[5]._id,
        prescriptionId: prescriptions[4]._id,
        patient: {
          nom: "Blanc",
          prenom: "Thomas",
          dateNaissance: new Date("1970-02-14"),
          mobilite: "ASSIS",
        },
        typeTransport: "VSL",
        motif: "Radiothérapie",
        dateTransport: demain,
        heureRDV: "11:00",
        heureDepart: "10:20",
        allerRetour: true,
        adresseDepart: {
          rue: "Avenue Thiers",
          ville: "Nice",
          codePostal: "06000",
          coordonnees: { lat: 43.705, lng: 7.255 },
        },
        adresseDestination: {
          nom: HOPITAUX_NICE[4].nom,
          rue: HOPITAUX_NICE[4].rue,
          ville: "Nice",
          service: "Radiothérapie",
          coordonnees: { lat: HOPITAUX_NICE[4].lat, lng: HOPITAUX_NICE[4].lng },
        },
        prescription: {
          medecin: "Dr. Dupuis",
          validee: true,
          motif: "Cancer prostate — 25 séances",
        },
        statut: "SCHEDULED",
        createdBy: users[1]._id,
        tauxPriseEnCharge: 100,
        heureConfirmation: new Date(Date.now() - 172800000),
        heurePlanification: new Date(Date.now() - 86400000),
        notes: "Séance n°12/25 — protocole en cours",
      },
    ]);

    console.log(`🚑 ${transports.length} transports créés`);
    console.log("\n✅ Seed BlancBleu terminé avec succès !");
    console.log("─────────────────────────────────────────");
    console.log(`   👤 Utilisateurs   : ${users.length}`);
    console.log(`   🚐 Véhicules      : ${vehicles.length}`);
    console.log(`   🧑‍⚕️  Patients       : ${patients.length}`);
    console.log(`   📋 Prescriptions  : ${prescriptions.length}`);
    console.log(`   🚑 Transports     : ${transports.length}`);
    console.log("─────────────────────────────────────────");
    console.log("   Admin  : belhajmouin@gmail.com / admin123");
    console.log("   Disp.  : dispatcher@blancbleu.fr / dispatcher123");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erreur seed :", err.message);
    process.exit(1);
  }
};

seed();
