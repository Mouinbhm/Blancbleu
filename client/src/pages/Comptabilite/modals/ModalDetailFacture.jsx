/**
 * ModalDetailFacture — détail + modification d'une facture.
 * Extrait du monolithe Factures.jsx (comportement identique).
 */
import { useState, useEffect } from "react";
import { factureService } from "../../../services/api";
import { fmtEur, fmtDate } from "../../../utils/formatters";
import { patientNom } from "../utils/factureMappers";
import { MODES_PAI, STATUT_STYLE, inputF, labelF } from "../utils/factureConstants";

export default function ModalDetailFacture({ facture, onClose, onUpdated }) {
  const readonly = ["payee", "annulee"].includes(facture.statut);
  const [form, setForm] = useState({
    montantTotal: String(facture.montantTotal || 0),
    tauxPriseEnCharge: String(facture.tauxPriseEnCharge || 65),
    statut: facture.statut,
    datePaiement: facture.datePaiement
      ? new Date(facture.datePaiement).toISOString().split("T")[0]
      : "",
    modePaiement: facture.modePaiement || "",
    notes: facture.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(null);
  const sf = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const montant = parseFloat(form.montantTotal) || 0;
  const taux = parseFloat(form.tauxPriseEnCharge) || 0;
  const partCPAM = Math.round(((montant * taux) / 100) * 100) / 100;
  const partPatient = Math.round((montant - partCPAM) * 100) / 100;

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleSave = async () => {
    if (montant <= 0) {
      setErreur("Montant obligatoire.");
      return;
    }
    setLoading(true);
    setErreur(null);
    try {
      await factureService.update(facture._id, {
        montantTotal: montant,
        tauxPriseEnCharge: taux,
        montantCPAM: partCPAM,
        montantPatient: partPatient,
        statut: form.statut,
        datePaiement:
          form.statut === "payee"
            ? form.datePaiement
              ? new Date(form.datePaiement)
              : new Date()
            : null,
        modePaiement: form.modePaiement,
        notes: form.notes,
      });
      onUpdated("success", facture.numero);
    } catch (err) {
      setErreur(err.response?.data?.message || "Erreur.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnnulerFacture = async () => {
    if (!window.confirm(`Annuler ${facture.numero} ? Cette action est irréversible.`)) return;
    try {
      await factureService.update(facture._id, { statut: "annulee" });
      onUpdated("annulee", facture.numero);
    } catch {
      setErreur("Erreur lors de l'annulation.");
    }
  };

  const statCfg = STATUT_STYLE[facture.statut] || STATUT_STYLE.en_attente;
  const nomPatient = patientNom(facture);

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
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-brand font-bold text-navy text-base">{facture.numero}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statCfg.cls}`}>
                  {statCfg.label}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {fmtDate(facture.dateEmission)} · {nomPatient}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {erreur}
            </div>
          )}

          {/* Infos transport/patient */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm border border-slate-100">
            <p className={labelF}>Informations</p>
            {facture.transportId?.numero && (
              <div className="flex justify-between">
                <span className="text-slate-500">Transport</span>
                <span className="font-mono text-navy">{facture.transportId.numero}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Patient</span>
              <span className="font-semibold text-navy">{nomPatient}</span>
            </div>
            {facture.motif && (
              <div className="flex justify-between">
                <span className="text-slate-500">Motif</span>
                <span className="text-slate-600">{facture.motif}</span>
              </div>
            )}
            {facture.typeVehicule && (
              <div className="flex justify-between">
                <span className="text-slate-500">Type</span>
                <span className="font-mono text-slate-600">{facture.typeVehicule}</span>
              </div>
            )}
            {facture.allerRetour !== undefined && (
              <div className="flex justify-between">
                <span className="text-slate-500">Aller-retour</span>
                <span className="text-slate-600">{facture.allerRetour ? "Oui" : "Non"}</span>
              </div>
            )}
          </div>

          {/* Montants — lecture seule si payée/annulée */}
          {readonly ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2 text-sm">
              <p className={labelF}>Montants</p>
              <div className="flex justify-between">
                <span className="text-slate-500">Montant total</span>
                <span className="font-mono font-bold text-navy">
                  {fmtEur(facture.montantTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Part CPAM ({facture.tauxPriseEnCharge}%)</span>
                <span className="font-mono text-emerald-600">{fmtEur(facture.montantCPAM)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Part patient</span>
                <span className="font-mono text-red-500">{fmtEur(facture.montantPatient)}</span>
              </div>
              {facture.statut === "payee" && facture.datePaiement && (
                <div className="flex justify-between pt-1 border-t border-blue-100">
                  <span className="text-slate-500">Payée le</span>
                  <span className="font-semibold text-emerald-600">
                    {fmtDate(facture.datePaiement)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className={labelF}>Montants (modifiables)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelF}>Montant total (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.montantTotal}
                    onChange={(e) => sf("montantTotal", e.target.value)}
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
          )}

          {/* Statut + mode paiement (modifiable uniquement) */}
          {!readonly && (
            <>
              <div>
                <label className={labelF}>Statut</label>
                <div className="flex gap-3 flex-wrap">
                  {["brouillon", "emise", "en_attente", "payee"].map((s) => {
                    const cfg = STATUT_STYLE[s];
                    return (
                      <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="statut-edit"
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
              {form.statut === "payee" && (
                <div>
                  <label className={labelF}>Date de paiement</label>
                  <input
                    type="date"
                    value={form.datePaiement}
                    onChange={(e) => sf("datePaiement", e.target.value)}
                    className={inputF}
                  />
                </div>
              )}
              <div>
                <label className={labelF}>Mode de paiement</label>
                <select
                  value={form.modePaiement}
                  onChange={(e) => sf("modePaiement", e.target.value)}
                  className={inputF}
                >
                  {MODES_PAI.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className={labelF}>Notes</label>
            {readonly ? (
              <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                {facture.notes || "—"}
              </p>
            ) : (
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => sf("notes", e.target.value)}
                placeholder="Référence CPAM, remarques…"
                className={`${inputF} resize-none`}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          {readonly ? (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                onClick={handleAnnulerFacture}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50"
              >
                <span className="material-symbols-outlined text-sm">delete</span>Annuler la facture
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? (
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
                ) : (
                  <span className="material-symbols-outlined text-base">save</span>
                )}
                {loading ? "Enregistrement…" : "Enregistrer"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
