import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./index.css";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initSentry } from "./lib/sentry";

// Init Sentry au tout début (no-op sans REACT_APP_SENTRY_DSN)
initSentry();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        {process.env.NODE_ENV === "development" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
