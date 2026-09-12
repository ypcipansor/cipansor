/**
 * Which API is `API_URL` actually pointing at?
 *
 * The e2e suite's default API is `http://localhost:3001/api`, and CI sets the
 * same value — there it is a throwaway container, seeded and thrown away with
 * the job. On a developer machine the default is whatever happens to be
 * listening on 3001, and on this project's own host that is the LIVE API. A
 * spec that writes (creates an admission period, a registrant, a student) then
 * writes into real data, silently, and every run leaves more behind.
 *
 * The API answers the question itself: `GET /health` reports `environment`.
 * Specs that write can therefore refuse to run against production instead of
 * trusting whoever starts them to remember an env var.
 */
const API_URL = process.env.API_URL || "http://localhost:3001/api";

/** `/health` lives at the server root, not under `/api`. */
const HEALTH_URL = `${API_URL.replace(/\/api\/?$/, "")}/health`;

let cached: string | undefined;

/**
 * `production`, `development`, `test`, … or `"unreachable"` when the API does
 * not answer. Unreachable is deliberately NOT treated as production: a spec
 * that cannot reach the API will fail on its own, with a better message than a
 * skip would give.
 */
export async function apiEnvironment(): Promise<string> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(HEALTH_URL);
    const body = (await res.json()) as { environment?: string };
    cached = body.environment ?? "unknown";
  } catch {
    cached = "unreachable";
  }
  return cached;
}

/** True when API_URL points at a production API. */
export async function isProductionApi(): Promise<boolean> {
  return (await apiEnvironment()) === "production";
}
