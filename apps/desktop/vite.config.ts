import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1470,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1471 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "safari15",
    minify: !process.env.TAURI_ENV_DEBUG ? "oxc" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
