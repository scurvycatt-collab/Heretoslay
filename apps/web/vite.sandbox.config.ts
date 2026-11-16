// Sandbox build: the app + the Worker engine in one static folder (no server). Relative base so it
// can be hosted anywhere, e.g. as a Claude artifact for owner testing. Never deployed to production.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { "import.meta.env.VITE_SANDBOX": JSON.stringify("1") },
  build: { outDir: "dist-sandbox", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
});
