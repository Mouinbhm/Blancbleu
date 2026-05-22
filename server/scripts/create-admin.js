

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const {
  MONGO_URI,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_NOM = "Admin",
  ADMIN_PRENOM = "BlancBleu",
} = process.env;

// ─── Validation des variables d'environnement ─────────────────────────────────
if (!MONGO_URI) {
  console.error("❌ MONGO_URI manquant dans .env");
  process.exit(1);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "❌ ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans .env",
  );
  console.error("   Exemple : ADMIN_EMAIL=admin@blancbleu.fr");
  console.error("             ADMIN_PASSWORD=MonMotDePasse123!");
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.error("❌ ADMIN_PASSWORD doit contenir au moins 8 caractères");
  process.exit(1);
}

async function run() {
  console.log("🔗 Connexion à MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connecté");

  // Vérifier si un admin existe déjà
  const existant = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });

  if (existant) {
    if (existant.role === "admin") {
      console.log(`ℹ️  Un compte admin existe déjà pour : ${ADMIN_EMAIL}`);
      console.log("   Aucune modification effectuée.");
    } else {
      // Upgrader le compte existant en admin
      existant.role = "admin";
      await existant.save();
      console.log(`✅ Compte existant ${ADMIN_EMAIL} promu au rôle admin`);
    }
  } else {
    const salt = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, salt);

    await User.create({
      nom: ADMIN_NOM,
      prenom: ADMIN_PRENOM,
      email: ADMIN_EMAIL.toLowerCase(),
      password: hashed,
      role: "admin",
      actif: true,
    });

    console.log("✅ Compte administrateur créé avec succès");
    console.log(`   Email    : ${ADMIN_EMAIL}`);
    console.log(`   Nom      : ${ADMIN_PRENOM} ${ADMIN_NOM}`);
    console.log(`   Rôle     : admin`);
    console.log("");
    console.log(
      "⚠️  Retirez ADMIN_PASSWORD de votre .env après cette opération.",
    );
  }

  await mongoose.disconnect();
  console.log("🔌 Déconnexion MongoDB");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Erreur :", err.message);
  mongoose.disconnect();
  process.exit(1);
});
