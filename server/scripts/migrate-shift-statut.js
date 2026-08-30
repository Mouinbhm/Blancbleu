require("../config/env");
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  // Fix Vehicle statut values
  const vehicleMap = {
    disponible: "Disponible",
    en_mission: "En service",
    maintenance: "Maintenance",
    hors_service: "Hors service",
  };
  for (const [old, newVal] of Object.entries(vehicleMap)) {
    const r = await mongoose.connection
      .collection("vehicles")
      .updateMany({ statut: old }, { $set: { statut: newVal } });
    console.log(`Vehicle ${old} → ${newVal}: ${r.modifiedCount} updated`);
  }

  // Fix Personnel statut values
  const personnelMap = {
    "en-service": "Disponible",
    conge: "Congé",
    formation: "Formation",
    maladie: "Maladie",
    inactif: "Inactif",
  };
  for (const [old, newVal] of Object.entries(personnelMap)) {
    const r = await mongoose.connection
      .collection("personnels")
      .updateMany({ statut: old }, { $set: { statut: newVal } });
    console.log(`Personnel ${old} → ${newVal}: ${r.modifiedCount} updated`);
  }

  // Rename driverId → personnelId in DriverShift documents
  const shiftResult = await mongoose.connection
    .collection("drivershifts")
    .updateMany({ driverId: { $exists: true } }, [{ $set: { personnelId: "$driverId" } }]);
  // Can't unset in same pipeline — do it in separate step
  await mongoose.connection
    .collection("drivershifts")
    .updateMany({ personnelId: { $exists: true } }, { $unset: { driverId: "" } });
  console.log(`DriverShift driverId→personnelId: ${shiftResult.modifiedCount} updated`);

  // Add shiftId to transports that have chauffeur assigned but no shiftId
  // Find shifts and match by personnelId + date overlap
  const transportsToFix = await mongoose.connection
    .collection("transports")
    .find({ chauffeur: { $ne: null }, shiftId: null })
    .toArray();

  let fixedTransports = 0;
  for (const t of transportsToFix) {
    if (!t.chauffeur || !t.dateTransport) continue;
    const transportDate = new Date(t.dateTransport);
    const dayStart = new Date(transportDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(transportDate);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const shift = await mongoose.connection.collection("drivershifts").findOne({
      personnelId: t.chauffeur,
      date: { $gte: dayStart, $lt: dayEnd },
    });
    if (shift) {
      await mongoose.connection
        .collection("transports")
        .updateOne({ _id: t._id }, { $set: { shiftId: shift._id } });
      fixedTransports++;
    }
  }
  console.log(`Transports linked to shiftId: ${fixedTransports}`);

  console.log("\nMigration complete.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
