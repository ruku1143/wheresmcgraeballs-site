import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  publicDir: "static",
  build: { outDir: "../../public", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
