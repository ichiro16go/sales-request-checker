import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  root: "static/review-panel",
  base: "./",
  resolve:
    command === "serve"
      ? {
          alias: {
            "@forge/bridge": path.resolve(
              __dirname,
              "static/review-panel/forge-bridge-mock.js"
            ),
          },
        }
      : {},
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
