const mongoose = require("mongoose");

const factureSchema = new mongoose.Schema(
  {
    numero: { type: String, unique: true },
    date: { type: Date, required: true, default: Date.now },
    motif: { type: String, required: true, trim: true },
    lieu: { type: String, required: true, trim: true },
    montant: { type: Number, required: true, min: 0 },
    statut: {
      type: String,
      enum: ["payée", "en-attente", "annulée"],
      default: "en-attente",
    },
    patient: { type: String, trim: true, default: "" },
    intervention: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Intervention",
      default: null,
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

factureSchema.pre("save", async function (next) {
  if (!this.numero) {
    const count = await mongoose.model("Facture").countDocuments();
    const y = new Date().getFullYear();
    this.numero = `FAC-${y}-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Facture", factureSchema);
