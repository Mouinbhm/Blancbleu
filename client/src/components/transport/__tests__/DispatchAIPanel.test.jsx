import { renderWithProviders, screen, fireEvent } from "../../../test-utils";
import { DispatchAIPanel } from "../DispatchAIPanel";

let mockTransport = null;
const mockAccepter  = jest.fn();
const mockRecommander = jest.fn();
const mockRefuser   = jest.fn();

jest.mock("../../../hooks/queries/useTransports", () => ({
  useTransport: () => ({ data: mockTransport, isLoading: false }),
}));

jest.mock("../../../hooks/queries/useDispatch", () => ({
  useDispatch: () => ({
    recommander: { mutate: mockRecommander, isPending: false },
    accepter:    { mutate: mockAccepter,    isPending: false },
    refuser:     { mutate: mockRefuser, mutateAsync: mockRefuser, isPending: false },
  }),
}));

describe("DispatchAIPanel", () => {
  beforeEach(() => {
    mockAccepter.mockReset();
    mockRecommander.mockReset();
    mockRefuser.mockReset();
  });

  test("affiche score, label de score et explications", () => {
    mockTransport = {
      aiDispatch: {
        generatedAt: "2026-05-22T10:00:00Z",
        vehicleName: "AB-123-CD",
        driverName: "Jean Dupont",
        score: 85,
        explanation: ["Excellent emplacement", "Chauffeur ponctuel"],
        risks: [],
      },
    };
    renderWithProviders(<DispatchAIPanel transportId="x" />);
    expect(screen.getByText(/85\/100/)).toBeInTheDocument();
    // "Excellent" apparaît dans le badge score ET dans l'explanation — au moins une fois
    expect(screen.getAllByText(/Excellent/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/AB-123-CD/)).toBeInTheDocument();
    expect(screen.getByText(/Chauffeur ponctuel/)).toBeInTheDocument();
  });

  test('bouton "Accepter" déclenche la mutation accepter', () => {
    mockTransport = {
      aiDispatch: {
        generatedAt: "2026-05-22T10:00:00Z",
        vehicleName: "X", score: 72, explanation: [],
      },
    };
    renderWithProviders(<DispatchAIPanel transportId="abc" />);
    fireEvent.click(screen.getByTestId("btn-accept-ia"));
    expect(mockAccepter).toHaveBeenCalledWith("abc");
  });

  test("affiche les risques si présents", () => {
    mockTransport = {
      aiDispatch: {
        generatedAt: "2026-05-22T10:00:00Z",
        vehicleName: "Y", score: 50,
        explanation: [],
        risks: ["Distance élevée"],
      },
    };
    renderWithProviders(<DispatchAIPanel transportId="x" />);
    expect(screen.getByText(/Distance élevée/)).toBeInTheDocument();
    expect(screen.getByTestId("dispatch-risks")).toBeInTheDocument();
  });
});
