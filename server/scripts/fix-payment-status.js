/**
 * BlancBleu — Synchronisation paymentStatus ↔ statut facture
 *
 * Corrige les factures dont le statut est "payee" (ou autre)
 * mais dont paymentStatus n'a pas été mis à jour (bug dans updateStatut).
 *
 * Usage :
 *   node server/scripts/fix-payment-status.js [--dry-run]
 */

require("../config/env");

const mongoose = require("mongoose");
const Facture = require("../models/Facture");

const DRY_RUN = process.argv.includes("--dry-run");

const STATUT_TO_PAYMENT = {
  payee: "SUCCEEDED",
  payment_failed: "FAILED",
  remboursee: "REFUNDED",
  partiellement_remboursee: "PARTIALLY_REFUNDED",
  annulee: "UNPAID",
  brouillon: "UNPAID",
  emise: "UNPAID",
  en_attente: "PENDING",
  en_retard: "PENDING",
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connecté à MongoDB\n");

  let totalFixed = 0;

  for (const [statut, expectedPaymentStatus] of Object.entries(STATUT_TO_PAYMENT)) {
    const mismatched = await Facture.find({
      statut,
      paymentStatus: { $ne: expectedPaymentStatus },
    }).select("_id numero statut paymentStatus montantTotal");

    if (mismatched.length === 0) {
      console.log(`✓ ${statut} → ${expectedPaymentStatus} : aucune désynchronisation`);
      continue;
    }

    console.log(
      `\n⚠  ${mismatched.length} facture(s) avec statut="${statut}" mais paymentStatus≠"${expectedPaymentStatus}" :`,
    );
    mismatched.forEach((f) => {
      console.log(
        `   ${f.numero || f._id}  montantTotal=${f.montantTotal}  paymentStatus actuel="${f.paymentStatus}"`,
      );
    });

    if (!DRY_RUN) {
      const ids = mismatched.map((f) => f._id);
      const update = { $set: { paymentStatus: expectedPaymentStatus } };

      // Pour les payées : s'assurer que datePaiement est défini
      if (statut === "payee") {
        const withoutDate = mismatched.filter((f) => !f.datePaiement);
        if (withoutDate.length > 0) {
          await Facture.updateMany(
            { _id: { $in: withoutDate.map((f) => f._id) } },
            { $set: { paymentStatus: "SUCCEEDED", datePaiement: new Date() } },
          );
          const withDate = mismatched.filter((f) => f.datePaiement);
          if (withDate.length > 0) {
            await Facture.updateMany(
              { _id: { $in: withDate.map((f) => f._id) } },
              { $set: { paymentStatus: "SUCCEEDED" } },
            );
          }
        } else {
          await Facture.updateMany({ _id: { $in: ids } }, update);
        }
      } else {
        await Facture.updateMany({ _id: { $in: ids } }, update);
      }

      console.log(`   → ${mismatched.length} facture(s) corrigée(s)`);
      totalFixed += mismatched.length;
    }
  }

  console.log(
    `\n${DRY_RUN ? "[DRY-RUN]" : "RÉSULTAT"} : ${totalFixed} facture(s) corrigée(s) au total`,
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
