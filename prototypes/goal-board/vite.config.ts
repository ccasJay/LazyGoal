import { defineConfig } from "vite";

const apiPort = process.env.LAZYGOAL_E2E_API_PORT;

export default defineConfig({
  server: apiPort === undefined ? undefined : {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
      },
    },
  },
});
