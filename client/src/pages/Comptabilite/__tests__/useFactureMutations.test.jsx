import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUpdateStatut = jest.fn();
const mockDelete = jest.fn();
const mockDownloadPdf = jest.fn();

jest.mock("../../../services/api", () => ({
  factureService: {
    updateStatut: (...a) => mockUpdateStatut(...a),
    delete: (...a) => mockDelete(...a),
    downloadPdf: (...a) => mockDownloadPdf(...a),
    downloadReceipt: jest.fn(),
  },
}));

// downloadBlob ouvre un blob navigateur — on le neutralise.
jest.mock("../utils/downloadHelpers", () => ({
  downloadBlob: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line import/first
import { useFactureMutations } from "../hooks/useFactureMutations";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function setup(overrides = {}) {
  const deps = {
    factures: [{ _id: "1", numero: "FAC-1", statut: "brouillon" }],
    addToast: jest.fn(),
    setActionId: jest.fn(),
    setConfirmPay: jest.fn(),
    ...overrides,
  };
  const { result } = renderHook(() => useFactureMutations(deps), { wrapper: makeWrapper() });
  return { result, deps };
}

describe("useFactureMutations", () => {
  beforeEach(() => {
    mockUpdateStatut.mockReset();
    mockDelete.mockReset();
  });

  test("handleStatut appelle la mutation + toast + reset actionId", async () => {
    mockUpdateStatut.mockResolvedValue({ data: { facture: { _id: "1", statut: "emise" } } });
    const { result, deps } = setup();

    await act(async () => {
      await result.current.handleStatut("1", "emise");
    });

    expect(mockUpdateStatut).toHaveBeenCalledWith("1", "emise");
    expect(deps.addToast).toHaveBeenCalled();
    expect(deps.setActionId).toHaveBeenCalledWith(null); // finally
  });

  test("handleStatut en erreur → toast erreur", async () => {
    mockUpdateStatut.mockRejectedValue(new Error("nope"));
    const { result, deps } = setup();
    await act(async () => {
      await result.current.handleStatut("1", "emise");
    });
    expect(deps.addToast).toHaveBeenCalledWith(expect.stringMatching(/erreur/i), "error");
  });

  test("handleDelete : confirmé → delete + toast", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockDelete.mockResolvedValue({});
    const { result, deps } = setup();

    await act(async () => {
      await result.current.handleDelete("1");
    });

    expect(mockDelete).toHaveBeenCalledWith("1");
    expect(deps.addToast).toHaveBeenCalledWith(expect.any(String), "warning");
    window.confirm.mockRestore();
  });

  test("handleDelete : annulé (confirm=false) → pas d'appel", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const { result, deps } = setup();
    await act(async () => {
      await result.current.handleDelete("1");
    });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(deps.addToast).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });
});
