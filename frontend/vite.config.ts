// ==========================================
// FILE: frontend/vite.config.ts
// PURPOSE: Configures Vite to use Tailwind CSS v4 plugin.
// ==========================================
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
// ==========================================
// END OF FILE: frontend/vite.config.ts
// LOCATION: frontend/vite.config.ts
// LAST UPDATED: October 19, 2026
// ==========================================