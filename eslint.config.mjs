import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  globalIgnores([
    "node_modules/",
    ".next/",
    "dist/",
    ".git/",
    "next-env.d.ts",
    // Standalone CommonJS dev/debug scripts — not part of the Next.js app.
    "mcp-tools.js",
    "test-db.js",
    "test-fa.js",
  ]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Allow intentionally-unused identifiers when prefixed with `_` (project convention).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
