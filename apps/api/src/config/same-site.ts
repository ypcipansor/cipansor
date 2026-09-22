/**
 * Fail fast on a cross-site deployment, because the session cookies are
 * `SameSite=Lax`.
 *
 * The API issues `access`, `refresh` and `cipansor_routing` cookies with a
 * hard `SameSite=Lax` (`packages/shared/src/auth-cookies.ts`). `Lax` is the
 * right posture for this product — production is same-origin (`NEXT_PUBLIC_API_URL`
 * is empty, so the bundle calls `/api` on whichever host served the page) — but
 * it means the browser attaches the cookie only when the request target is
 * *same-site* with the page that set it. Point the web app at an API on a
 * different registrable site and the cookies are silently dropped: login
 * "succeeds" and every subsequent request is anonymous. That looks like a
 * session bug, not a configuration one, so it is worth refusing to boot.
 *
 * This is Option A of the review finding: same-site deployment is the supported
 * topology, and a cross-site configuration is rejected with a clear message
 * instead of being half-supported by `SameSite=None` without CSRF protection
 * (see `docs/DEPLOYMENT.md`). Supporting cross-site would need a configurable
 * SameSite plus CSRF tokens on every cookie-authenticated unsafe method; the
 * repository has neither.
 *
 * The check is deliberately about the *registrable site*, not the exact host:
 * `cipansor.or.id` and `portal.cipansor.or.id` are one site, so an
 * `api.cipansor.or.id` API is same-site. (The routing cookie is additionally
 * host-scoped; production serves web and API from the same host through the
 * reverse proxy, which is what makes the middleware see it at all.) Loopback
 * origins are ignored so a `http://localhost:3000` entry left in a production
 * allowlist for local debugging does not fail the boot.
 *
 * The registrable-domain rule is a pragmatic heuristic rather than a public
 * suffix list. It folds the common multi-label suffixes (`co.id`, `or.id`,
 * `co.uk`, …) and otherwise keeps the last two labels. Anything more exotic
 * than the suffixes below is treated as a single-label domain, which errs
 * toward *accepting* a config — this guard is for the obvious mistake, not an
 * eTLD+1 oracle.
 */

/** Second-level labels that combine with a country TLD, e.g. `or.id`. */
const TWO_LABEL_SUFFIXES = new Set([
  'ac.id',
  'co.id',
  'go.id',
  'net.id',
  'or.id',
  'sch.id',
  'web.id',
  'ac.uk',
  'co.uk',
  'gov.uk',
  'ltd.uk',
  'me.uk',
  'net.uk',
  'org.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'co.kr',
  'com.my',
  'com.sg',
  'co.in',
  'com.br',
]);

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/** Strip scheme, credentials, port and any path — leave the hostname. */
export function hostnameOf(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return (
    LOOPBACK_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.startsWith('127.')
  );
}

/**
 * The registrable site of a hostname: `portal.cipansor.or.id` →
 * `cipansor.or.id`, `cipansor.example.com` → `example.com`, `localhost` →
 * `localhost`.
 */
export function registrableSite(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || isLoopbackHostname(host)) return host;

  const labels = host.split('.');
  if (labels.length <= 2) return host;

  const lastTwo = labels.slice(-2).join('.');
  if (TWO_LABEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

export interface SameSiteCheckInput {
  /** Origins allowed to call the API, from `CORS_ORIGIN`. */
  origins: readonly string[];
  env?: string;
}

/**
 * Throws in production when the configured browser origins do not all share one
 * registrable site. Silent everywhere else, and silent for an unparseable
 * origin (the allowlist already rejects those at request time; a boot failure
 * here would be a second, less clear error).
 */
export function assertSameSiteDeployment(input: SameSiteCheckInput): void {
  const env = input.env ?? process.env.NODE_ENV;
  if (env !== 'production') return;

  const sites = new Set<string>();
  for (const origin of input.origins) {
    const hostname = hostnameOf(origin);
    if (!hostname || isLoopbackHostname(hostname)) continue;
    sites.add(registrableSite(hostname));
  }

  if (sites.size <= 1) return;

  throw new Error(
    'Refusing to start: CORS_ORIGIN lists origins on different sites ' +
      `(${[...sites].sort().join(', ')}), but this API issues ` +
      'SameSite=Lax session cookies. A browser on one site will not send the ' +
      'cookie to an API on another, so login would appear to succeed and every ' +
      'subsequent request would be anonymous. Deploy the web app and the API ' +
      'on one registrable site (production is same-origin: leave ' +
      'NEXT_PUBLIC_API_URL empty), or implement SameSite=None with CSRF ' +
      'protection before supporting cross-site.'
  );
}
