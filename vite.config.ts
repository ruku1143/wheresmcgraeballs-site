import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  root: "src/web",
  publicDir: "static",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: "../../public", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
