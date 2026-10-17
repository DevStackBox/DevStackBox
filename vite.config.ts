import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = realpathSync(fileURLToPath(new URL(".", import.meta.url)));

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  root,
  plugins: [react()],
  
  // Allow importing package.json
  json: {
    stringify: false
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.join(root, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
}));
