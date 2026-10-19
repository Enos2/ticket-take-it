// New file: frontend/src/main.tsx
// Ticket Take It — frontend entry point.

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./pages/App.js";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
