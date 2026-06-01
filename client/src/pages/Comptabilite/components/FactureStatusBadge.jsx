/**
 * FactureStatusBadge — pastille de statut facture (mémoïsé).
 * Extrait du monolithe Factures.jsx (rendu identique).
 */
import { memo } from "react";
import { STATUT_STYLE } from "../utils/factureConstants";

function FactureStatusBadge({ statut }) {
  const cfg = STATUT_STYLE[statut] || STATUT_STYLE.en_attente;
  return <span className={`px-2 py-1 rounded-full text-xs font-bold ${cfg.cls}`}>{cfg.label}</span>;
}

export default memo(FactureStatusBadge);
