import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next pulls in eslint-plugin-react 7.x, which calls the
    // `context.getFilename()` API ESLint 10 removed. Pinning a concrete React
    // version makes the plugin skip its version auto-detection — the only code
    // path that hits that API — and the react/* rules keep working.
    settings: { react: { version: "19.3.0" } },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    // Build output kept aside by hand during a deploy. `.next/**` is ignored
    // above, but a rollback copy under another name is not — and eslint reads
    // no `.gitignore`, so a developer who has one gets hundreds of errors from
    // generated bundles that CI, on a fresh checkout, never sees. Local lint
    // has to agree with CI's to be worth running.
    ".next.bak/**",
  ]),
]);

export default eslintConfig;
