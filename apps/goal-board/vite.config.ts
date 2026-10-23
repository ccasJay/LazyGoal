import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const apiPort = process.env.LAZYGOAL_E2E_API_PORT;

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: apiPort === undefined ? undefined : {
    proxy: {
      "/goals": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
      },
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
      },
    },
  },
});
