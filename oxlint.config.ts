import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    ".agents/**",
    ".claude/**",
    ".eve/**",
    "components/**",
    "mcp-app/dist/**",
  ],
  overrides: [
    {
      files: ["providers/query-provider.tsx"],
      rules: {
        "react/hook-use-state": "off",
      },
    },
    {
      files: ["hooks/use-mobile.ts"],
      rules: {
        "react/set-state-in-effect": "off",
      },
    },
    {
      files: ["lib/genui/orchestration/stream.ts"],
      rules: {
        "eslint/no-await-in-loop": "off",
      },
    },
  ],
  rules: {
    curly: "off",
    "eslint/no-use-before-define": "off",
    "func-style": "off",
    "no-alert": "off",
    "react/function-component-definition": "off",
  },
});
