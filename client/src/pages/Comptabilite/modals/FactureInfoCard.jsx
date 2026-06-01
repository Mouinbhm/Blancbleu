/**
 * FactureInfoCard — bloc « Informations » (transport/patient/motif) en lecture.
 * Sous-bloc de ModalDetailFacture (séparé pour respecter <300 LOC).
 */
import { labelF } from "../utils/factureConstants";

export default function FactureInfoCard({ facture, nomPatient }) {
  return (
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
  );
}
