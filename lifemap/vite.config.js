import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // All Anthropic calls go through the local backend so the API key
      // never reaches the browser.
      "/api": "http://localhost:3001",
    },
  },
});
