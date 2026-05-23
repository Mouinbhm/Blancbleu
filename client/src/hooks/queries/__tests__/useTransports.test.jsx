import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTransports } from "../useTransports";

const mockGetAll = jest.fn();
jest.mock("../../../services/api", () => ({
  transportService: { getAll: (...args) => mockGetAll(...args) },
}));

function wrapper({ children }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useTransports", () => {
  beforeEach(() => { mockGetAll.mockReset(); });

  test("renvoie data quand l'API répond", async () => {
    mockGetAll.mockResolvedValueOnce({ data: { transports: [{ _id: "1" }, { _id: "2" }] } });
    const { result } = renderHook(() => useTransports({ page: 1 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ transports: [{ _id: "1" }, { _id: "2" }] });
    expect(mockGetAll).toHaveBeenCalledWith({ page: 1 });
  });

  test("renvoie isError quand l'API throw", async () => {
    mockGetAll.mockRejectedValueOnce(new Error("net fail"));
    const { result } = renderHook(() => useTransports(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe("net fail");
  });
});
