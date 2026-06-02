/**
 * Formatters partagés (monnaie, dates).
 *
 * ⚠️ Plusieurs variantes coexistent VOLONTAIREMENT car les pages historiques
 * affichent des formats différents — les centraliser ne doit PAS changer le
 * rendu existant. Choisir la variante qui correspond au besoin :
 *
 *   Montants €
 *   - fmtEur(n)        → "1 234,56 €"  (Intl currency, 2 décimales)  [Comptabilité]
 *   - fmtMontant(n)    → "1 234,56 €"  (toLocaleString 2 déc.)        [Comptabilité tableau]
 *   - fmtEuroInt(n)    → "1 235 €"     (arrondi, 0 décimale)          [FleetDashboard]
 *   - fmtEuroFixed(n)  → "1234.56 €"   (toFixed, sans séparateur)     [PatientDetail]
 *
 *   Dates
 *   - fmtDate(d)         → "24/05/2026"            (court)            [Comptabilité]
 *   - fmtDateLong(d)     → "24 mai 2026"           (jour mois année)  [Fleet/Patient]
 *   - fmtDatetimeShort(d)→ "24 mai 14:30"          (sans année)       [FleetDashboard]
 *   - fmtDatetimeLong(d) → "24 mai 2026 14:30"     (avec année)       [PatientDetail]
 */

const DASH = "—";

// ── Montants ──────────────────────────────────────────────────────────────────
export const fmtEur = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

export const fmtMontant = (m) =>
  m != null ? `${Number(m).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €` : DASH;

export const fmtEuroInt = (n) =>
  n != null
    ? `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
    : DASH;

export const fmtEuroFixed = (n) => (n != null ? `${Number(n).toFixed(2)} €` : DASH);

// ── Dates ─────────────────────────────────────────────────────────────────────
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : DASH);

export const fmtDateLong = (d) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : DASH;

export const fmtDatetimeShort = (d) =>
  d
    ? new Date(d).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : DASH;

export const fmtDatetimeLong = (d) =>
  d
    ? new Date(d).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : DASH;
