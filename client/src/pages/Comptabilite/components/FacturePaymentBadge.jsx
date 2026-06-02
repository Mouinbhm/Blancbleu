/**
 * FacturePaymentBadge — pastille de statut paiement Stripe (mémoïsé).
 * Extrait du monolithe Factures.jsx (rendu identique).
 */
import { memo } from "react";
import { PAYMENT_STATUS_STYLE } from "../utils/factureConstants";

function FacturePaymentBadge({ paymentStatus }) {
  const ps = paymentStatus || "UNPAID";
  const pCfg = PAYMENT_STATUS_STYLE[ps] || PAYMENT_STATUS_STYLE.UNPAID;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${pCfg.cls}`}
    >
      <span className="material-symbols-outlined text-[11px]">{pCfg.icon}</span>
      {pCfg.label}
    </span>
  );
}

export default memo(FacturePaymentBadge);
