import { cookies } from "next/headers";
import { spmbAnnouncementOf, type PublicIntakeDTO } from "@cipansor/shared";
import { BANNER_DISMISS_COOKIE } from "@/lib/announcement-cookies";

/**
 * How long the server waits for the intakes before rendering without them.
 *
 * The announcement is optional; the page is not. Every public page awaits this
 * before it can render, so a connection that stays open without answering would
 * hold the whole page — a hanging API must not become a hanging site. On expiry
 * the request is aborted and the announcement degrades to absent, exactly as a
 * network error already did.
 */
export const ANNOUNCEMENT_FETCH_TIMEOUT_MS = 2000;

/**
 * How long the server reuses the intakes it fetched, in seconds.
 *
 * Every public page awaits them, and they are the same for every visitor, so
 * one fetch serves every page view in the window instead of one API call (and
 * one database query) per view. Freshness is the client's job anyway:
 * `usePublicIntakes` fetches on mount and refetches every 15 minutes, so a
 * window opening is on screen within a second of the page loading.
 */
export const ANNOUNCEMENT_REVALIDATE_SECONDS = 60;

/**
 * The absolute origin the *server* uses to reach the API — from configuration
 * only, never from the request.
 *
 * - `API_INTERNAL_URL` when set: compose names the API `http://api:3001`.
 * - `NEXT_PUBLIC_API_URL` when it is an absolute origin: `pnpm dev`, where
 *   web (:3000) and API (:3001) differ.
 * - Otherwise `http://127.0.0.1:3001`. An **empty** `NEXT_PUBLIC_API_URL` means
 *   "same origin" to the bundle (`lib/api.ts`); Node's `fetch` cannot use a
 *   relative URL, and the API is on the loopback wherever web and API run side
 *   by side — the Azure App Service sidecars share it (`deploy/azure/nginx`
 *   proxies `/api` to `127.0.0.1:3001`).
 *
 * An earlier revision built the origin from the request's `Host` /
 * `X-Forwarded-Host` headers. That made the server fetch whatever host a
 * request named, and in the Azure deployment it sent every page view back out
 * through the public address and Cloudflare to reach an API on the same
 * machine.
 */
function apiOriginForServer(): string {
  if (process.env.API_INTERNAL_URL) return process.env.API_INTERNAL_URL;
  const browserOrigin = process.env.NEXT_PUBLIC_API_URL;
  if (browserOrigin) return browserOrigin;
  return "http://127.0.0.1:3001";
}

/**
 * Each unit's intake, fetched on the server for the SPMB announcement.
 *
 * Why the server and not the client: the banner is the first child of `<main>`
 * on every public page, so when it is inserted after hydration it pushes the
 * whole page down — a measured CLS of 0.035 on `/`, `/profil` and
 * `/wakaf-infaq`, with `SECTION#hero` as the shifted node. Rendering it in the
 * first paint removes the shift entirely, the same reason the hero photograph's
 * alt text and the page locale are resolved here rather than after hydration.
 *
 * The client still owns freshness (`usePublicIntakes` refetches every 15
 * minutes); this is only the value the first paint starts from.
 *
 * A failure — a network error, a non-OK response, or the deadline above — all
 * degrade to no announcement rather than a crashed or stalled page.
 */
export async function fetchPublicIntakes(): Promise<PublicIntakeDTO[]> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    ANNOUNCEMENT_FETCH_TIMEOUT_MS,
  );
  // Node timers carry `unref`; a pending deadline must not hold the process.
  (timer as unknown as { unref?: () => void }).unref?.();
  try {
    const origin = apiOriginForServer();
    const response = await fetch(`${origin}/api/admissions/public/intakes`, {
      next: { revalidate: ANNOUNCEMENT_REVALIDATE_SECONDS },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: PublicIntakeDTO[] };
    return body.data ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The intakes, plus whether this visitor already dismissed the banner for the
 * intake being announced.
 *
 * The dismissal lives in `localStorage`, which the server cannot read; the
 * cookie mirror (`announcement-cookies.ts`) carries it across. Without the
 * flag the server would send a banner this visitor had closed, the browser
 * would paint it, and hydration would remove it — a flash and a reverse shift,
 * trading the CLS this change fixes for another one.
 */
export async function loadPublicAnnouncement(): Promise<{
  intakes: PublicIntakeDTO[];
  bannerDismissed: boolean;
}> {
  const intakes = await fetchPublicIntakes();
  const periodId = spmbAnnouncementOf(intakes)?.period.id;
  if (!periodId) return { intakes, bannerDismissed: false };
  const store = await cookies();
  const value = store.get(BANNER_DISMISS_COOKIE)?.value;
  return { intakes, bannerDismissed: value === periodId };
}
