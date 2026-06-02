/**
 * NouvelleFactureForm — champs du formulaire de création de facture.
 * Sous-bloc de ModalNouvelleFacture (séparé pour respecter <300 LOC).
 */
import { fmtEur } from "../../../utils/formatters";
import { MOTIFS_FAC, TYPES_VEH, STATUT_STYLE, inputF, labelF } from "../utils/factureConstants";

export default function NouvelleFactureForm({
  form,
  sf,
  transports,
  handleTransportSelect,
  montant,
  partCPAM,
  partPatient,
}) {
  return (
    <>
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
              {t.dateTransport ? ` (${new Date(t.dateTransport).toLocaleDateString("fr-FR")})` : ""}
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
    </>
  );
}
