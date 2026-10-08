import { cookies, headers } from "next/headers";
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
 * The absolute origin the *server* uses to reach the API.
 *
 * `API_INTERNAL_URL` is where the server reaches the API — an absolute origin
 * under compose (`http://api:3001`), because a relative URL resolves against
 * nothing inside the web container. `NEXT_PUBLIC_API_URL` is the browser's base
 * and the fallback for `pnpm dev`, where web (:3000) and API (:3001) differ.
 *
 * Its **empty** value is meaningful (see `lib/api.ts`): the bundle then calls
 * the API same-origin. The server cannot reuse that — Node's `fetch` rejects a
 * relative URL — so an empty value is resolved to the request's own origin,
 * which is where the API is served in that deployment. Only the empty case
 * differs from the old `??` chain; a set value is used as before, and an unset
 * one still falls back to the API's dev origin.
 */
async function apiOriginForServer(): Promise<string> {
  if (process.env.API_INTERNAL_URL) return process.env.API_INTERNAL_URL;
  const browserOrigin = process.env.NEXT_PUBLIC_API_URL;
  if (browserOrigin) return browserOrigin;
  if (browserOrigin === "") {
    const requestHeaders = await headers();
    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    if (host) {
      const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
      return `${proto}://${host}`;
    }
  }
  return "http://localhost:3001";
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
    const origin = await apiOriginForServer();
    const response = await fetch(`${origin}/api/admissions/public/intakes`, {
      cache: "no-store",
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
