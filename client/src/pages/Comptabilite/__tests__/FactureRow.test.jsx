import { render, screen, fireEvent } from "@testing-library/react";
import FactureRow from "../components/FactureRow";

const baseFacture = {
  _id: "f1",
  numero: "FAC-2026-0001",
  dateEmission: "2026-05-24T10:00:00Z",
  transportId: { numero: "TRS-1" },
  patientId: { nom: "Dupont", prenom: "Marie" },
  montantTotal: 100,
  montantCPAM: 65,
  montantPatient: 35,
  statut: "brouillon",
  paymentStatus: "UNPAID",
};

function mountRow(facture = baseFacture, handlers = {}) {
  const h = {
    onOpenDetail: jest.fn(),
    onConfirmPay: jest.fn(),
    onEmettre: jest.fn(),
    onDownloadPdf: jest.fn(),
    onDownloadReceipt: jest.fn(),
    onPrint: jest.fn(),
    onCancel: jest.fn(),
    ...handlers,
  };
  render(
    <table>
      <tbody>
        <FactureRow facture={facture} index={0} isPaying={false} {...h} />
      </tbody>
    </table>,
  );
  return h;
}

describe("FactureRow", () => {
  test("affiche numéro, patient et montants", () => {
    mountRow();
    expect(screen.getByText("FAC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Dupont Marie")).toBeInTheDocument();
  });

  test("clic sur la ligne ouvre le détail", () => {
    const handlers = mountRow();
    fireEvent.click(screen.getByText("FAC-2026-0001"));
    expect(handlers.onOpenDetail).toHaveBeenCalledWith(baseFacture);
  });

  test("statut brouillon → bouton « Émettre » présent", () => {
    const handlers = mountRow();
    fireEvent.click(screen.getByTitle("Émettre la facture"));
    expect(handlers.onEmettre).toHaveBeenCalledWith("f1", "emise");
  });

  test("statut payée → pas de bouton payer/émettre, reçu disponible si SUCCEEDED", () => {
    mountRow({ ...baseFacture, statut: "payee", paymentStatus: "SUCCEEDED" });
    expect(screen.queryByTitle("Marquer payée")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Émettre la facture")).not.toBeInTheDocument();
    expect(screen.getByTitle("Télécharger reçu PDF")).toBeInTheDocument();
  });

  test("statut annulée → pas de bouton annuler", () => {
    mountRow({ ...baseFacture, statut: "annulee" });
    expect(screen.queryByTitle("Annuler")).not.toBeInTheDocument();
  });

  test("clic « Marquer payée » remonte id+numero (sans ouvrir le détail)", () => {
    const handlers = mountRow();
    const payBtn = screen.getByTitle("Marquer payée");
    fireEvent.click(payBtn);
    expect(handlers.onConfirmPay).toHaveBeenCalledWith({ id: "f1", numero: "FAC-2026-0001" });
    expect(handlers.onOpenDetail).not.toHaveBeenCalled(); // stopPropagation sur la cellule actions
  });

  test("PDF toujours téléchargeable", () => {
    const handlers = mountRow();
    fireEvent.click(screen.getByTitle("Télécharger PDF facture"));
    expect(handlers.onDownloadPdf).toHaveBeenCalledWith("f1", "FAC-2026-0001");
  });
});
