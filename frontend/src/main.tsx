// ==========================================
// FILE: frontend/src/main.tsx
// PURPOSE: App entry point.
// ==========================================
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { installErrorReporting } from "./lib/reportError";
import { queryClient } from "./lib/queryClient";

installErrorReporting();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary><App /></ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
// ==========================================
// END OF FILE: frontend/src/main.tsx
// ==========================================
