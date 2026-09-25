import cors, { type CorsOptions } from 'cors';
import type { Request, RequestHandler, Response } from 'express';

/**
 * `CORS_ORIGIN` has always held a *list* — production runs
 * "https://cipansor.or.id,https://www.cipansor.or.id,http://localhost:3000" —
 * but the raw string was handed straight to the `cors` middleware, which treats
 * a string as one fixed origin and echoes it verbatim:
 *
 *   Access-Control-Allow-Origin: https://cipansor.or.id,https://www.cipansor.or.id,...
 *
 * The Fetch standard allows exactly one origin (or `*`) in that header, so every
 * browser rejects it and *every* listed origin is refused — the opposite of what
 * the setting reads like it does. It goes unnoticed because the web app calls the
 * API same-origin, so no browser ever sends an `Origin` the check applies to; the
 * first cross-origin client (admin subdomain, mobile app, partner integration)
 * would have hit a wall with a header that looked correctly configured.
 *
 * Parsing the list and letting `cors` reflect the single origin that matched is
 * the spec-conformant form, and `Vary: Origin` (added by `cors` for a list) keeps
 * caches from serving one origin's response to another.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const seen = new Set<string>();
  for (const entry of (raw ?? '').split(',')) {
    // An `Origin` header is scheme://host[:port] with no path and no trailing
    // slash, so "https://cipansor.or.id/" would never match anything. Normalise
    // it rather than let a stray slash silently deny a legitimate origin.
    const origin = entry.trim().replace(/\/+$/, '');
    if (origin) seen.add(origin);
  }
  return [...seen];
}

/**
 * Build the options for the `cors` middleware from an allowlist.
 *
 * Wildcards are refused rather than supported. This API answers with cookies
 * and `credentials: true`, and the two cannot be combined: browsers reject
 * `Access-Control-Allow-Origin: *` on a credentialed request, so a `*` here can
 * only be honoured by reflecting whatever origin asked — which is not a wildcard
 * but a blanket grant letting any site on the internet make authenticated
 * requests as a logged-in user. Failing at boot with an explanation is the
 * honest outcome; silently reflecting would be a vulnerability, and silently
 * denying would look like an unrelated outage.
 */
export function buildCorsOptions(origins: readonly string[]): CorsOptions {
  if (origins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN cannot be "*" because this API sends credentials. ' +
        'List the allowed origins explicitly, comma-separated.'
    );
  }
  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN resolved to an empty allowlist.');
  }

  return {
    // A function (not the array) so the allowlist check is explicit and the
    // echoed value is always a single, validated origin: CodeQL cannot see the
    // membership test inside `cors` for an array and reports
    // `js/cors-permissive-configuration`. The callback alone is NOT equivalent
    // to the array, though — see buildCorsMiddleware(), which is how the app
    // must mount it.
    origin: (origin, callback) => {
      if (origin && origins.includes(origin)) {
        callback(null, origin);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  };
}

/** Adds `Origin` to the response's `Vary` list unless it is already there. */
function varyOnOrigin(res: Response): void {
  const current = String(res.getHeader('Vary') ?? '');
  const listed = current.split(',').some((field) => field.trim().toLowerCase() === 'origin');
  if (!listed) res.setHeader('Vary', current ? `${current}, Origin` : 'Origin');
}

/**
 * The CORS middleware the app mounts.
 *
 * When the origin callback answers `false`, `cors` skips the request entirely.
 * With the array form it used to handle every request, so two things changed
 * with the callback (measured side by side on 2026-09-25) and are restored here:
 *
 * - `Vary: Origin` was sent on every response, including those with no Origin
 *   or a refused one. Without it a shared cache may store the header-less
 *   response and serve it to a listed origin, which the browser then refuses.
 * - Every OPTIONS request was answered by `cors` with 204. A refused preflight
 *   now fell through to the app's middleware and routes instead.
 */
export function buildCorsMiddleware(origins: readonly string[]): RequestHandler {
  const handle = cors(buildCorsOptions(origins));
  return (req: Request, res: Response, next) => {
    varyOnOrigin(res);
    handle(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (req.method === 'OPTIONS') {
        // A preflight `cors` did not answer: refused, so no Allow-* headers.
        res.statusCode = 204;
        res.setHeader('Content-Length', '0');
        res.end();
        return;
      }
      next();
    });
  };
}
