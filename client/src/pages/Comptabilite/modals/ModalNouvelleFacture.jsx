/**
 * ModalNouvelleFacture — création d'une facture.
 * Extrait du monolithe Factures.jsx (comportement identique).
 */
import { useState, useEffect } from "react";
import { factureService, transportService } from "../../../services/api";
import { fmtEur } from "../../../utils/formatters";
import { patientNom } from "../utils/factureMappers";
import { MOTIFS_FAC, TYPES_VEH, STATUT_STYLE, inputF, labelF } from "../utils/factureConstants";

export default function ModalNouvelleFacture({ onClose, onCreated }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    transportId: "",
    patientId: null,
    patientNom: "",
    patientPrenom: "",
    typeVehicule: "VSL",
    motif: "Consultation",
    allerRetour: false,
    distanceKm: "",
    dateEmission: today,
    montantTotal: "",
    tauxPriseEnCharge: 65,
    statut: "emise",
    notes: "",
  });
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);
  const sf = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const montant = parseFloat(form.montantTotal) || 0;
  const taux = parseFloat(form.tauxPriseEnCharge) || 0;
  const partCPAM = Math.round(((montant * taux) / 100) * 100) / 100;
  const partPatient = Math.round((montant - partCPAM) * 100) / 100;

  useEffect(() => {
    transportService
      .getAll({ limit: 200 })
      .then((r) => setTransports(r.data?.transports || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleTransportSelect = (tId) => {
    const t = transports.find((tr) => tr._id === tId);
    if (t) {
      setForm((f) => ({
        ...f,
        transportId: tId,
        patientId: t.patientId || null,
        patientNom: t.patient?.nom || f.patientNom,
        patientPrenom: t.patient?.prenom || f.patientPrenom,
        typeVehicule: t.typeTransport || f.typeVehicule,
        motif: t.motif || f.motif,
        allerRetour: t.allerRetour || false,
      }));
    } else {
      sf("transportId", "");
    }
  };

  const handleSubmit = async () => {
    if (montant <= 0) {
      setErreur("Le montant total est obligatoire (> 0 €).");
      return;
    }
    if (!form.dateEmission) {
      setErreur("La date d'émission est obligatoire.");
      return;
    }
    setLoading(true);
    setErreur(null);
    try {
      const payload = {
        patientNom: form.patientNom,
        patientPrenom: form.patientPrenom,
        ...(form.patientId ? { patientId: form.patientId } : {}),
        typeVehicule: form.typeVehicule,
        motif: form.motif,
        allerRetour: form.allerRetour,
        distanceKm: parseFloat(form.distanceKm) || 0,
        dateEmission: new Date(form.dateEmission),
        montantTotal: montant,
        montantBase: montant,
        tauxPriseEnCharge: taux,
        montantCPAM: partCPAM,
        montantPatient: partPatient,
        statut: form.statut,
        notes: form.notes,
      };
      if (form.transportId) payload.transportId = form.transportId;
      const { data } = await factureService.create(payload);
      onCreated(data.facture?.numero || "—");
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {/* Inner panel: stop propagation pour ne pas fermer en cliquant dedans.
          Le keyDown reste pris en charge sur le wrapper externe (Escape). */}
      <div
        role="document"
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-lg">receipt_long</span>
            </div>
            <div>
              <h3 className="font-brand font-bold text-navy text-base">Nouvelle facture</h3>
              <p className="text-xs text-slate-400">Création manuelle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {erreur}
            </div>
          )}

          {/* Transport */}
          <div>
            <label className={labelF}>Transport associé (optionnel)</label>
            <select
              value={form.transportId}
              onChange={(e) => handleTransportSelect(e.target.value)}
              className={inputF}
            >
              <option value="">— Aucun transport —</option>
              {transports.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.numero} · {t.patient?.nom || "Patient"} {t.patient?.prenom || ""} · {t.motif}
                  {t.dateTransport
                    ? ` (${new Date(t.dateTransport).toLocaleDateString("fr-FR")})`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Patient */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelF}>Nom patient</label>
              <input
                type="text"
                value={form.patientNom}
                onChange={(e) => sf("patientNom", e.target.value)}
                placeholder="Dupont"
                className={inputF}
              />
            </div>
            <div>
              <label className={labelF}>Prénom</label>
              <input
                type="text"
                value={form.patientPrenom}
                onChange={(e) => sf("patientPrenom", e.target.value)}
                placeholder="Marie"
                className={inputF}
              />
            </div>
          </div>

          {/* Type + Motif */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelF}>Type de transport</label>
              <select
                value={form.typeVehicule}
                onChange={(e) => sf("typeVehicule", e.target.value)}
                className={inputF}
              >
                {TYPES_VEH.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelF}>Motif</label>
              <select
                value={form.motif}
                onChange={(e) => sf("motif", e.target.value)}
                className={inputF}
              >
                {MOTIFS_FAC.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Aller-retour + Distance */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-1">
              <input
                type="checkbox"
                checked={form.allerRetour}
                onChange={(e) => sf("allerRetour", e.target.checked)}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm font-medium text-slate-600">Aller-retour</span>
            </label>
            <div>
              <label className={labelF}>Distance (km)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.distanceKm}
                onChange={(e) => sf("distanceKm", e.target.value)}
                placeholder="0"
                className={inputF}
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className={labelF}>Date d'émission *</label>
            <input
              type="date"
              value={form.dateEmission}
              onChange={(e) => sf("dateEmission", e.target.value)}
              className={inputF}
            />
          </div>

          {/* Montants */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
            <p className={labelF}>Montants</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelF}>Montant total (€) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montantTotal}
                  onChange={(e) => sf("montantTotal", e.target.value)}
                  placeholder="0.00"
                  className={inputF}
                />
              </div>
              <div>
                <label className={labelF}>Taux CPAM (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.tauxPriseEnCharge}
                  onChange={(e) => sf("tauxPriseEnCharge", e.target.value)}
                  className={inputF}
                />
              </div>
            </div>
            {montant > 0 && (
              <div className="flex items-center gap-4 text-xs bg-white rounded-lg px-3 py-2 border border-slate-200">
                <span className="text-slate-500">
                  Part CPAM : <strong className="text-emerald-600">{fmtEur(partCPAM)}</strong>
                </span>
                <span className="text-slate-200">|</span>
                <span className="text-slate-500">
                  Part patient : <strong className="text-red-500">{fmtEur(partPatient)}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Statut */}
          <div>
            <label className={labelF}>Statut initial</label>
            <div className="flex gap-3 flex-wrap">
              {["brouillon", "emise", "en_attente", "payee"].map((s) => {
                const cfg = STATUT_STYLE[s];
                return (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="statut-init"
                      value={s}
                      checked={form.statut === s}
                      onChange={() => sf("statut", s)}
                      className="accent-primary"
                    />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelF}>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => sf("notes", e.target.value)}
              placeholder="Référence CPAM, remarques…"
              className={`${inputF} resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,.4)",
                    borderTop: "2px solid white",
                    borderRadius: "50%",
                    animation: "spin .7s linear infinite",
                  }}
                />
                Création…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">add</span>Créer la facture
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
