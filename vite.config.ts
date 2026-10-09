import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves a project site under /<repo>/, so the build needs that
  // base. Local dev stays at the root.
  base: command === "build" ? "/solar-system/" : "/",
  server: {
    port: 5174,
    host: true,
  },
  build: {
    target: "es2022",
  },
}));
