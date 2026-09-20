import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `/api` is proxied to the Node sidecar in dev so the frontend can use the same relative URL it
 * will use in production, where a Vercel Function answers it. Nothing in `src/` knows which one
 * is running.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8790",
        changeOrigin: true,
      },
    },
  },
  build: {
    // The wallet-standard packages ship modern syntax; targeting esnext keeps the bundle smaller
    // and this app is never the thing that breaks an old browser.
    target: "esnext",
    sourcemap: true,
  },
});
