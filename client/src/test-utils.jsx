import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Render utility for RTL tests.
 * Wraps the UI in a fresh QueryClient (retry:false to avoid infinite loops on
 * mocked errors) and a MemoryRouter.
 *
 * Usage :
 *   const { qc } = renderWithProviders(<Component />);
 *   const { qc } = renderWithProviders(<Component />, { route: "/x/123" });
 */
export function renderWithProviders(ui, { route = "/" } = {}) {
  const qc = new QueryClient({
    defaultOptions: {
      queries:   { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}

export * from "@testing-library/react";
