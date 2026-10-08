import { cookies } from "next/headers";
import { spmbAnnouncementOf, type PublicIntakeDTO } from "@cipansor/shared";
import { BANNER_DISMISS_COOKIE } from "@/lib/announcement-cookies";

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
 * `API_INTERNAL_URL` is where the *server* reaches the API — a relative URL
 * resolves against nothing inside the web container, so it is an absolute
 * origin under compose (`http://api:3001`). `NEXT_PUBLIC_API_URL` is the
 * fallback for `pnpm dev`, where the web (:3000) and API (:3001) differ. A
 * failure degrades to no announcement rather than a crashed page.
 */
export async function fetchPublicIntakes(): Promise<PublicIntakeDTO[]> {
  const origin =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001";
  try {
    const response = await fetch(`${origin}/api/admissions/public/intakes`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: PublicIntakeDTO[] };
    return body.data ?? [];
  } catch {
    return [];
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
