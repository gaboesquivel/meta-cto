import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "genui-preview.html"),
    },
    target: "es2022",
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, ".."),
    },
  },
  root: path.resolve(import.meta.dirname),
});
