import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  publicDir: false,
  build: { outDir: "../../public", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
