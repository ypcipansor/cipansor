/**
 * The API origin, shared by the Axios instance and the upload resolver.
 *
 * `NEXT_PUBLIC_API_URL` is the API *base* origin (no `/api` suffix). It is
 * inlined at build time, so an absolute origin baked here would make one of the
 * two production hosts cross-origin and put CORS on the critical path; an EMPTY
 * value is therefore meaningful. `??`, not `||`, keeps that empty string: the
 * bundle then talks to whichever origin served the page and the API is
 * same-origin on both.
 *
 * A stored local upload is a host-relative `/uploads/<file>` path (see
 * `uploadedFileRefSchema`). The browser would resolve that against the origin
 * that served the PAGE, which is only the API origin when they are the same
 * host — false in `pnpm dev` and the CI e2e stack (web :3000, API :3001). This
 * is the single definition of "which origin actually serves `/uploads`", used
 * by both the Axios base URL and the file resolver so they can never disagree.
 */
const RAW_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** API origin with any trailing slash stripped (`""` means same-origin). */
export const API_ORIGIN = RAW_API_BASE.replace(/\/+$/, "");

/** The Axios base URL (`<origin>/api`). */
export const API_BASE_URL = `${API_ORIGIN}/api`;
