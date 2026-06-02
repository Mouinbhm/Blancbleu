/**
 * ModalNouvelleFacture — création d'une facture.
 * Extrait du monolithe Factures.jsx (comportement identique).
 */
import { useState, useEffect } from "react";
import { factureService, transportService } from "../../../services/api";
import { patientNom } from "../utils/factureMappers";
import NouvelleFactureForm from "./NouvelleFactureForm";

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

          <NouvelleFactureForm
            form={form}
            sf={sf}
            transports={transports}
            handleTransportSelect={handleTransportSelect}
            montant={montant}
            partCPAM={partCPAM}
            partPatient={partPatient}
          />
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
