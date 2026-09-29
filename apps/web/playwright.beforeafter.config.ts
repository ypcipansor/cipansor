import base from "./playwright.config";

/**
 * Config for the before/after PWA screenshot capture only. Reuses the main
 * config (and its global setup) but drops the `_*.spec.ts` ignore so
 * `_capture-beforeafter.spec.ts` is picked up. Never used by the gate.
 */
export default {
  ...base,
  testIgnore: [],
  testMatch: "**/_capture-beforeafter.spec.ts",
  projects: (base.projects ?? []).filter(
    (p: { name?: string }) => p.name === "setup" || p.name === "chromium",
  ),
  webServer: undefined,
};
