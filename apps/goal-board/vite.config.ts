import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const apiPort = process.env.LAZYGOAL_E2E_API_PORT;

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Client-only SPA: "use client" in third-party packages has no runtime meaning.
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          warning.message.includes('"use client"')
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
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
