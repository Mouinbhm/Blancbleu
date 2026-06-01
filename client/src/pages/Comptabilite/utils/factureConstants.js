/**
 * Constantes du domaine Comptabilité / Factures.
 * Extraites du monolithe Factures.jsx (refactor — comportement identique).
 */

// ── Période ───────────────────────────────────────────────────────────────────
export const MOIS_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

export const MOIS_NOMS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export const ANNEES = [2024, 2025, 2026, 2027];

// ── Statuts facture ───────────────────────────────────────────────────────────
export const STATUTS = [
  { value: "", label: "Tous" },
  { value: "brouillon", label: "Brouillon" },
  { value: "emise", label: "Émise" },
  { value: "en_attente", label: "En attente" },
  { value: "payee", label: "Payée" },
  { value: "payment_failed", label: "Échec paiement" },
  { value: "remboursee", label: "Remboursée" },
  { value: "partiellement_remboursee", label: "Part. remboursée" },
  { value: "en_retard", label: "En retard" },
  { value: "annulee", label: "Annulée" },
];

export const STATUT_STYLE = {
  brouillon: { cls: "bg-slate-100 text-slate-600", label: "Brouillon" },
  emise: { cls: "bg-blue-100 text-blue-700", label: "Émise" },
  en_attente: { cls: "bg-yellow-100 text-yellow-700", label: "En attente" },
  payee: { cls: "bg-emerald-100 text-emerald-700", label: "Payée" },
  payment_failed: { cls: "bg-red-100 text-red-700", label: "Échec paiement" },
  remboursee: { cls: "bg-purple-100 text-purple-700", label: "Remboursée" },
  partiellement_remboursee: { cls: "bg-violet-100 text-violet-700", label: "Part. remboursée" },
  en_retard: { cls: "bg-orange-100 text-orange-700", label: "En retard" },
  annulee: { cls: "bg-red-100 text-red-700", label: "Annulée" },
};

export const PAYMENT_STATUS_STYLE = {
  UNPAID: { cls: "bg-slate-100 text-slate-500", icon: "pending", label: "Non payé" },
  PENDING: { cls: "bg-yellow-100 text-yellow-700", icon: "hourglass_empty", label: "En attente" },
  SUCCEEDED: { cls: "bg-emerald-100 text-emerald-700", icon: "check_circle", label: "Payé" },
  FAILED: { cls: "bg-red-100 text-red-700", icon: "error", label: "Échec" },
  REFUNDED: { cls: "bg-purple-100 text-purple-700", icon: "undo", label: "Remboursé" },
  PARTIALLY_REFUNDED: {
    cls: "bg-violet-100 text-violet-700",
    icon: "undo",
    label: "Part. remboursé",
  },
};

// ── Modal création facture ────────────────────────────────────────────────────
export const MOTIFS_FAC = [
  "Consultation",
  "Hospitalisation",
  "Sortie hospitalisation",
  "Rééducation",
  "Analyse",
  "Autre",
];

export const TYPES_VEH = ["VSL", "TPMR", "AMBULANCE"];

export const MODES_PAI = [
  { value: "", label: "Non renseigné" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
  { value: "cb", label: "Carte bancaire" },
  { value: "especes", label: "Espèces" },
  { value: "cpam_direct", label: "CPAM direct" },
];

// ── Classes Tailwind partagées (champs de formulaire) ────────────────────────
export const inputF =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary bg-white";
export const labelF = "text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5";
