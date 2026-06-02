/**
 * FactureFilters — chips de statut + bouton « Nouvelle facture » + recherche.
 * Extrait du monolithe Factures.jsx (comportement identique).
 */
import { STATUTS } from "../utils/factureConstants";

export default function FactureFilters({
  filterStatut,
  onFilterStatut,
  search,
  onSearch,
  onNouvelle,
}) {
  return (
    <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUTS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onFilterStatut(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filterStatut === value ? "bg-navy text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-navy"}`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={onNouvelle}
          style={{
            background: "#1D6EF5",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Nouvelle facture
        </button>
      </div>
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 w-56">
        <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="N°, transport, patient…"
          className="bg-transparent text-sm outline-none w-full text-slate-700 placeholder-slate-400"
        />
      </div>
    </div>
  );
}
