import { factureService } from "../../../services/api";
import { STATUT_STYLE } from "../utils/factureConstants";
import { downloadBlob } from "../utils/downloadHelpers";

/**
 * Actions de mutation sur les factures (statut, annulation, PDF, reçu).
 * Logique identique au monolithe — on injecte les setters/utilitaires d'état
 * dont les handlers ont besoin pour rester découplés de l'orchestrateur.
 *
 * @param {object} deps
 * @param {Array}  deps.factures
 * @param {Function} deps.setFactures
 * @param {Function} deps.reloadFactures
 * @param {Function} deps.addToast
 * @param {Function} deps.setActionId
 * @param {Function} deps.setConfirmPay
 */
export function useFactureMutations({
  factures,
  setFactures,
  reloadFactures,
  addToast,
  setActionId,
  setConfirmPay,
}) {
  const handleStatut = async (id, statut) => {
    setActionId(id);
    setConfirmPay(null);
    try {
      const { data } = await factureService.updateStatut(id, statut);
      setFactures((prev) => prev.map((f) => (f._id === id ? data.facture : f)));
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
      await factureService.delete(id);
      reloadFactures();
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
