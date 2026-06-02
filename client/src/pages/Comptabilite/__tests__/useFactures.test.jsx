import { renderHook, waitFor, act } from "@testing-library/react";

const mockGetAll = jest.fn();
const mockGetStats = jest.fn();
let socketHandler = null;
const mockUnsub = jest.fn();

jest.mock("../../../services/api", () => ({
  factureService: {
    getAll: (...a) => mockGetAll(...a),
    getStats: (...a) => mockGetStats(...a),
  },
}));

jest.mock("../../../hooks/useSocket", () => ({
  __esModule: true,
  default: () => ({
    subscribe: (event, cb) => {
      socketHandler = cb;
      return mockUnsub;
    },
  }),
}));

// eslint-disable-next-line import/first
import { useFactures } from "../hooks/useFactures";

describe("useFactures", () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockGetStats.mockReset();
    socketHandler = null;
  });

  test("charge factures + stats au montage", async () => {
    mockGetAll.mockResolvedValue({ data: { factures: [{ _id: "1" }] } });
    mockGetStats.mockResolvedValue({ data: { total: 1 } });

    const { result } = renderHook(() => useFactures("", jest.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.factures).toEqual([{ _id: "1" }]);
    expect(result.current.stats).toEqual({ total: 1 });
  });

  test("passe le filtre statut en query", async () => {
    mockGetAll.mockResolvedValue({ data: { factures: [] } });
    mockGetStats.mockResolvedValue({ data: {} });

    renderHook(() => useFactures("payee", jest.fn()));
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());
    expect(mockGetAll).toHaveBeenCalledWith({ limit: 100, statut: "payee" });
  });

  test("erreur API → loading retombe à false sans crash", async () => {
    mockGetAll.mockRejectedValue(new Error("boom"));
    mockGetStats.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useFactures("", jest.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.factures).toEqual([]);
  });

  test("socket facture:updated patche la facture + notifie", async () => {
    mockGetAll.mockResolvedValue({ data: { factures: [{ _id: "1", statut: "emise" }] } });
    mockGetStats.mockResolvedValue({ data: {} });
    const addToast = jest.fn();

    const { result } = renderHook(() => useFactures("", addToast));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      socketHandler({ _id: "1", numero: "FAC-1", statut: "payee", datePaiement: "2026-05-24" });
    });

    expect(result.current.factures[0].statut).toBe("payee");
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining("FAC-1"));
  });
});
