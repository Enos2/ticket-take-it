// ==========================================
// FILE: frontend/vite.config.ts
// PURPOSE: Vite configuration: React, Tailwind v4 and a dev proxy to the API.
// ==========================================
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development, /api/... is forwarded to the backend, so the browser never makes a cross-origin request.
    proxy: {
      "/api": { target: "http://localhost:5000", changeOrigin: true },
    },
  },
});
// ==========================================
// END OF FILE: frontend/vite.config.ts
// ==========================================
