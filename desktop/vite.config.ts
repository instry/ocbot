import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const versionPath = path.resolve(__dirname, "../browser/VERSION");
let version = "0.1.0";
if (existsSync(versionPath)) {
  version = readFileSync(versionPath, "utf-8").trim();
} else {
  const pkgPath = path.resolve(__dirname, "package.json");
  if (existsSync(pkgPath)) {
    version = JSON.parse(readFileSync(pkgPath, "utf-8")).version;
  }
}

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react(), tailwindcss()],
  define: {
    __OCBOT_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/renderer/index.html",
    },
  },
  publicDir: "../../resources/icons",
});
