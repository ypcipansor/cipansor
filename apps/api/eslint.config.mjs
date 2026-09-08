import tseslint from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "dist",
      "node_modules",
      "coverage",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
    ],
  },
  ...tseslint.configs["flat/recommended"],
  {
    files: ["src/**/*.ts"],
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/ban-ts-comment": ["warn", {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": false,
      }],

      // General rules
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      "prefer-const": "warn",
      "no-var": "error",
      "eqeqeq": ["warn", "always"],

      // Allow some patterns common in Express apps
      "@typescript-eslint/no-empty-function": "off",
    },
  },
];
