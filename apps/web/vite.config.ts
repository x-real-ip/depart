import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Lokaal gaat /api naar de api-container; in productie doet nginx dat.
    // Zo staat er nergens een hostnaam in de code.
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
