// Fichier : client/src/components/transport/TransportCard.jsx
import { useNavigate } from "react-router-dom";
import StatutBadge from "./StatutBadge";
import { transportService } from "../../services/api";

const TYPE_ICON = {
  VSL: "directions_car",
  AMBULANCE: "airport_shuttle",
  TPMR: "accessible",
};

const fmtHeure = (h) => h || "—";
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      })
    : "—";

// Actions disponibles selon le statut courant
const ACTIONS = {
  REQUESTED:              [{ label: "Confirmer",    fn: "confirmer",  color: "blue"   }],
  CONFIRMED:              [{ label: "Planifier",    fn: "planifier",  color: "indigo" }],
  SCHEDULED:              [],
  ASSIGNED:               [],
  EN_ROUTE_TO_PICKUP:     [],
  ARRIVED_AT_PICKUP:      [{ label: "Patient à bord", fn: "patientABord", color: "cyan" }],
  PATIENT_ON_BOARD:       [],
  ARRIVED_AT_DESTINATION: [{ label: "Terminer",    fn: "completer",  color: "green"  }],
  COMPLETED:              [],
  CANCELLED:              [],
  NO_SHOW:                [],
  RESCHEDULED:            [{ label: "Confirmer",    fn: "confirmer",  color: "blue"   }],
};

const BTN_COLOR = {
  blue:   "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200",
  cyan:   "bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border-cyan-200",
  green:  "bg-green-50 text-green-700 hover:bg-green-100 border-green-200",
  red:    "bg-red-50 text-red-700 hover:bg-red-100 border-red-200",
};

export default function TransportCard({ transport, onRefresh }) {
  const navigate = useNavigate();
  const actions = ACTIONS[transport.statut] || [];

  const handleAction = async (e, fn) => {
    e.stopPropagation();
    try {
      await transportService[fn](transport._id);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de l'action");
    }
  };

  const handleAnnuler = async (e) => {
    e.stopPropagation();
    const raison = window.prompt("Raison de l'annulation :");
    if (raison === null) return;
    try {
      await transportService.annuler(transport._id, raison);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de l'annulation");
    }
  };

  const peutAnnuler = !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(
    transport.statut,
  );

  return (
    <div
      onClick={() => navigate(`/transports/${String(transport._id || transport.id)}`)}
      className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer group"
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-slate-500 text-base">
              {TYPE_ICON[transport.typeTransport] || "directions_car"}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-xs text-slate-400 truncate">
                {transport.numero}
              </p>
              {/* Badge série récurrente */}
              {transport.recurrence?.active && transport.recurrence?.joursSemaine?.length > 0 && (
                <span className="inline-flex items-center gap-0.5 bg-violet-100 text-violet-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">
                  <span className="material-symbols-outlined" style={{ fontSize: 10 }}>repeat</span>
                  Récurrent
                </span>
              )}
            </div>
            <p className="font-bold text-navy text-sm truncate">
              {transport.patient?.nom} {transport.patient?.prenom}
            </p>
          </div>
        </div>
        <StatutBadge statut={transport.statut} />
      </div>

      {/* Infos */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="material-symbols-outlined text-sm text-slate-400">
            medical_services
          </span>
          {transport.motif}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="material-symbols-outlined text-sm text-slate-400">
            schedule
          </span>
          {fmtDate(transport.dateTransport)} · {fmtHeure(transport.heureRDV)}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 col-span-2 truncate">
          <span className="material-symbols-outlined text-sm text-slate-400">
            location_on
          </span>
          <span className="truncate">
            {transport.adresseDestination?.nom ||
              transport.adresseDestination?.rue ||
              "—"}
            {transport.adresseDestination?.service
              ? ` · ${transport.adresseDestination.service}`
              : ""}
          </span>
        </div>
      </div>

      {/* Véhicule assigné */}
      {transport.vehicule && (
        <div className="flex items-center gap-1.5 text-xs text-purple-600 mb-3 bg-purple-50 rounded-lg px-3 py-1.5">
          <span className="material-symbols-outlined text-sm">
            airport_shuttle
          </span>
          {transport.vehicule?.nom || transport.vehicule?.immatriculation || "Véhicule assigné"}
        </div>
      )}

      {/* Actions rapides */}
      {(actions.length > 0 || peutAnnuler) && (
        <div
          className="flex gap-2 mt-2 pt-3 border-t border-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a) => (
            <button
              key={a.fn}
              onClick={(e) => handleAction(e, a.fn)}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-colors ${BTN_COLOR[a.color] || BTN_COLOR.blue}`}
            >
              {a.label}
            </button>
          ))}
          {peutAnnuler && (
            <button
              onClick={handleAnnuler}
              className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
            >
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
  );
}
