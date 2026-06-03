import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGetAll = jest.fn();
const mockGetStats = jest.fn();

jest.mock("../../../services/api", () => ({
  factureService: {
    getAll: (...a) => mockGetAll(...a),
    getStats: (...a) => mockGetStats(...a),
  },
  comptabiliteService: { getDashboard: jest.fn() },
}));

// Source unique React Query (l'ancien hook local Comptabilite a été supprimé).
// eslint-disable-next-line import/first
import { useFactures, useFactureStats } from "../../../hooks/queries/useFactures";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("queries/useFactures", () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockGetStats.mockReset();
  });

  test("charge la liste des factures", async () => {
    mockGetAll.mockResolvedValue({ data: { factures: [{ _id: "1" }] } });
    const { result } = renderHook(() => useFactures({ limit: 100 }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ factures: [{ _id: "1" }] });
  });

  test("passe le filtre statut en query", async () => {
    mockGetAll.mockResolvedValue({ data: { factures: [] } });
    renderHook(() => useFactures({ limit: 100, statut: "payee" }), { wrapper: makeWrapper() });
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());
    expect(mockGetAll).toHaveBeenCalledWith({ limit: 100, statut: "payee" });
  });

  test("useFactureStats charge les stats", async () => {
    mockGetStats.mockResolvedValue({ data: { total: 1 } });
    const { result } = renderHook(() => useFactureStats(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ total: 1 });
  });

  test("erreur API → isError (pas de crash, état visible)", async () => {
    mockGetAll.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useFactures({}), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
