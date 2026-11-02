import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "WORKER_");
  const workerProxyTarget = env.WORKER_PROXY_TARGET || "http://127.0.0.1:8787";

  return {
    plugins: [react()],
    server: { proxy: { "/api": workerProxyTarget } },
  };
});
