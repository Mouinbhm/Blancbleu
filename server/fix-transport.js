/**
 * One-shot fix: link TRS-20260506-0001 to the active shift
 * whose vehicle matches the transport's assigned vehicle.
 * Run: node server/fix-transport.js
 */
const mongoose = require("mongoose");
const path     = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const Transport  = require("./models/Transport");
const DriverShift = require("./models/DriverShift");
require("./models/Personnel");
require("./models/Vehicle");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connecté");

  const transport = await Transport.findOne({ numero: "TRS-20260506-0001" });
  if (!transport) {
    console.log("❌ Transport TRS-20260506-0001 introuvable");
    process.exit(1);
  }

  console.log("Transport trouvé :");
  console.log("  vehicule  :", transport.vehicule?.toString() ?? "null");
  console.log("  chauffeur :", transport.chauffeur?.toString() ?? "null");
  console.log("  shiftId   :", transport.shiftId?.toString() ?? "null");
  console.log("  statut    :", transport.statut);

  if (!transport.vehicule) {
    console.log("❌ Le transport n'a pas de véhicule assigné — assignez-le d'abord depuis le web.");
    process.exit(1);
  }

  const shift = await DriverShift.findOne({
    vehicleId: transport.vehicule,
    status: "ACTIVE",
  }).populate("personnelId", "prenom nom").populate("vehicleId", "immatriculation");

  if (!shift) {
    console.log("❌ Aucun shift ACTIVE trouvé pour ce véhicule.");
    console.log("\nTous les shifts existants :");
    const all = await DriverShift.find({})
      .populate("vehicleId", "immatriculation")
      .populate("personnelId", "prenom nom")
      .sort({ startTime: -1 })
      .limit(10);
    all.forEach((s) =>
      console.log(`  [${s.status}] ${s.vehicleId?.immatriculation ?? s.vehicleId} — ${s.personnelId?.prenom} ${s.personnelId?.nom} — ${s._id}`)
    );
    process.exit(1);
  }

  console.log(`\nShift ACTIVE trouvé : ${shift._id}`);
  console.log(`  Chauffeur : ${shift.personnelId?.prenom} ${shift.personnelId?.nom}`);
  console.log(`  Véhicule  : ${shift.vehicleId?.immatriculation}`);

  transport.shiftId   = shift._id;
  transport.chauffeur = shift.personnelId._id ?? shift.personnelId;
  await transport.save();

  console.log("\n✅ Transport lié au shift avec succès.");
  console.log(`  transport.shiftId   = ${transport.shiftId}`);
  console.log(`  transport.chauffeur = ${transport.chauffeur}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur :", err.message);
  process.exit(1);
});
