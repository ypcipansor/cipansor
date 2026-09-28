import { createRequire } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The React this app is built with, read rather than written down, so the
// setting below cannot fall behind a React upgrade.
const reactVersion = createRequire(import.meta.url)(
  "react/package.json",
).version;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next pulls in eslint-plugin-react 7.x, which calls the
    // `context.getFilename()` API ESLint 10 removed. A concrete React version
    // makes the plugin skip its version auto-detection — the only code path
    // the rules enabled here reach — and the react/* rules keep working.
    // (`react/forward-ref-uses-ref` and `react/jsx-filename-extension` call
    // removed APIs too; enabling either needs @eslint/compat's fixupConfigRules
    // or an eslint-plugin-react that supports ESLint 10.)
    settings: { react: { version: reactVersion } },
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
