import { renderWithProviders, screen } from "../../../test-utils";
import { TransportHeader } from "../TransportHeader";

let mockTransport = null;
let mockLoading = false;
jest.mock("../../../hooks/queries/useTransports", () => ({
  useTransport: () => ({ data: mockTransport, isLoading: mockLoading }),
  useTransportMutation: () => ({
    transition: { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false },
  }),
  transportKeys: { all: ["transports"], detail: (id) => ["transports", "detail", id], timeline: (id) => ["transports", "timeline", id] },
}));

describe("TransportHeader", () => {
  test("affiche un skeleton pendant le chargement", () => {
    mockLoading = true; mockTransport = null;
    renderWithProviders(<TransportHeader transportId="42" />);
    // Skeleton blocks have aria-hidden=true and no readable text — assert no numero rendered
    expect(screen.queryByText(/TRS-/)).not.toBeInTheDocument();
  });

  test("affiche le numéro et le badge de statut", () => {
    mockLoading = false;
    mockTransport = { numero: "TRS-20260522-0001", statut: "SCHEDULED" };
    renderWithProviders(<TransportHeader transportId="42" />);
    expect(screen.getByText("TRS-20260522-0001")).toBeInTheDocument();
    expect(screen.getByText("SCHEDULED")).toBeInTheDocument();
  });

  test('cache le bouton "Annuler" si transport terminal', () => {
    mockLoading = false;
    mockTransport = { numero: "TRS-X", statut: "COMPLETED" };
    renderWithProviders(<TransportHeader transportId="42" />);
    expect(screen.queryByTestId("btn-annuler-transport")).not.toBeInTheDocument();
  });

  test('affiche le bouton "Annuler" pour un statut actif', () => {
    mockLoading = false;
    mockTransport = { numero: "TRS-Y", statut: "ASSIGNED" };
    renderWithProviders(<TransportHeader transportId="42" />);
    expect(screen.getByTestId("btn-annuler-transport")).toBeInTheDocument();
  });
});
