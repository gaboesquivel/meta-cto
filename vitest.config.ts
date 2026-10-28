import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "node",
    exclude: ["node_modules/**", ".agents/**", ".next/**", ".eve/**", "mcp-app/**"],
    include: ["**/*.test.ts"],
    pool: "forks",
  },
});
