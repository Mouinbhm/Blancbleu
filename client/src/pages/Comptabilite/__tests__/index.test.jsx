import { render, screen, waitFor } from "@testing-library/react";

// API mockée : la page charge factures+stats (factureService) et le dashboard
// compta (api.get). On renvoie des réponses minimales.
const mockGetAll = jest.fn();
const mockGetStats = jest.fn();
const mockApiGet = jest.fn();

jest.mock("../../../services/api", () => ({
  __esModule: true,
  default: { get: (...a) => mockApiGet(...a) },
  factureService: {
    getAll: (...a) => mockGetAll(...a),
    getStats: (...a) => mockGetStats(...a),
  },
  comptabiliteService: { exportInvoicesCsv: jest.fn(), exportPaymentsCsv: jest.fn() },
}));

beforeEach(() => {
  mockGetAll.mockResolvedValue({ data: { factures: [] } });
  mockGetStats.mockResolvedValue({ data: { total: 0, parStatut: {} } });
  mockApiGet.mockResolvedValue({ data: null });
});

jest.mock("../../../hooks/useSocket", () => ({
  __esModule: true,
  default: () => ({ subscribe: () => () => {} }),
}));

// Chart.js n'aime pas jsdom (canvas) — on neutralise les graphiques.
jest.mock("react-chartjs-2", () => ({
  Bar: () => <div data-testid="bar-chart" />,
  Doughnut: () => <div data-testid="doughnut-chart" />,
}));

// eslint-disable-next-line import/first
import Comptabilite from "../index";

describe("Comptabilite (page) — smoke", () => {
  test("se monte et affiche le titre + le sous-titre factures", async () => {
    render(<Comptabilite />);
    // Titre dashboard
    expect(screen.getByRole("heading", { name: "Comptabilité" })).toBeInTheDocument();
    // Sous-section factures
    expect(screen.getByText("Factures — Facturation CPAM")).toBeInTheDocument();
    // Le chargement initial des factures est déclenché
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());
  });

  test("état vide → message « Aucune facture trouvée »", async () => {
    render(<Comptabilite />);
    expect(await screen.findByText("Aucune facture trouvée")).toBeInTheDocument();
  });
});
