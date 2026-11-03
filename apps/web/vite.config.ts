import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "WORKER_");
  const workerProxyTarget = env.WORKER_PROXY_TARGET || "http://127.0.0.1:8787";

  return {
    base: "/herotoslay/",
    plugins: [react()],
    server: {
      proxy: {
        "/api": workerProxyTarget,
        // Dev only: the app runs under /herotoslay/ (production gateway strips the prefix).
        "/herotoslay/api": { target: workerProxyTarget, rewrite: (path: string) => path.replace(/^\/herotoslay/, "") },
      },
    },
  };
});
