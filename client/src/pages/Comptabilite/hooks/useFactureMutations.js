import { factureService } from "../../../services/api";
import { useFactureMutation } from "../../../hooks/queries/useFactures";
import { STATUT_STYLE } from "../utils/factureConstants";
import { downloadBlob } from "../utils/downloadHelpers";

/**
 * Actions de mutation sur les factures (statut, annulation, PDF, reçu).
 *
 * Les mutations de données passent par `useFactureMutation()` (React Query) qui
 * invalide déjà `factureKeys` → la liste + les stats se rafraîchissent seules.
 * On ne garde ici que l'orchestration UI (toasts, spinner d'action, confirm,
 * téléchargements de blobs).
 *
 * @param {object} deps
 * @param {Array}  deps.factures      - pour retrouver le numéro à l'annulation
 * @param {Function} deps.addToast
 * @param {Function} deps.setActionId
 * @param {Function} deps.setConfirmPay
 */
export function useFactureMutations({ factures, addToast, setActionId, setConfirmPay }) {
  const { updateStatut, remove } = useFactureMutation();

  const handleStatut = async (id, statut) => {
    setActionId(id);
    setConfirmPay(null);
    try {
      await updateStatut.mutateAsync({ id, statut });
      addToast(`Facture marquée ${STATUT_STYLE[statut]?.label || statut}`);
    } catch {
      addToast("Erreur mise à jour statut.", "error");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id) => {
    const facture = factures.find((f) => f._id === id);
    const label = facture?.numero ? `la facture ${facture.numero}` : "cette facture";
    if (
      !window.confirm(`Êtes-vous sûr de vouloir annuler ${label} ?\nCette action est irréversible.`)
    )
      return;
    try {
      await remove.mutateAsync(id);
      addToast("Facture annulée.", "warning");
    } catch (err) {
      const msg = err?.response?.data?.message || "Erreur lors de l'annulation.";
      addToast(msg, "error");
    }
  };

  const handleDownloadPdf = async (factureId, numero) => {
    try {
      await downloadBlob(factureService.downloadPdf(factureId), `facture-${numero}.pdf`);
      addToast("PDF facture téléchargé");
    } catch (err) {
      addToast(err?.response?.data?.message || "Erreur téléchargement PDF", "error");
    }
  };

  const handleDownloadReceipt = async (factureId, numero) => {
    try {
      await downloadBlob(factureService.downloadReceipt(factureId), `recu-${numero}.pdf`);
      addToast("PDF reçu téléchargé");
    } catch (err) {
      addToast(
        err?.response?.data?.message || "Reçu disponible uniquement après paiement",
        "error",
      );
    }
  };

  return { handleStatut, handleDelete, handleDownloadPdf, handleDownloadReceipt };
}
