import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PublicIntakeDTO } from "@cipansor/shared";

/**
 * The server side of the SPMB announcement: fetch the intakes, read the
 * dismissal cookie, hand both to the component so the banner is in the first
 * paint. The CLS this fixes lives in the component; what is pinned here is that
 * a fetch failure degrades to no announcement (never a crashed page) and that
 * the dismissal is only honoured for the intake actually being announced.
 */

const cookieValue = { current: undefined as string | undefined };
const headersRead = { current: false };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieValue.current ? { value: cookieValue.current } : undefined,
  }),
  headers: async () => {
    headersRead.current = true;
    return { get: () => "attacker.example" };
  },
}));

import {
  ANNOUNCEMENT_FETCH_TIMEOUT_MS,
  ANNOUNCEMENT_REVALIDATE_SECONDS,
  fetchPublicIntakes,
  loadPublicAnnouncement,
} from "./public-intakes.server";

const ENV_KEYS = ["API_INTERNAL_URL", "NEXT_PUBLIC_API_URL"] as const;
let savedEnv: Record<string, string | undefined> = {};

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (key in values) process.env[key] = values[key];
    else delete process.env[key];
  }
}

function intake(
  over: Partial<PublicIntakeDTO["period"]> = {},
): PublicIntakeDTO {
  return {
    unit: {
      id: "u1",
      name: "SMP IT Cipansor",
      officialName: null,
      type: "SMP_IT",
    },
    period: {
      id: "p1",
      name: "SPMB",
      academicYear: "2027/2028",
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2027-07-10T00:00:00.000Z",
      window: "open",
      opensAt: null,
      closesAt: null,
      registrationFee: 0,
      requirements: [],
      minAgeMonths: null,
      ageReferenceDate: null,
      contactName: null,
      contactPhone: null,
      ...over,
    },
    waves: [],
    fees: [],
  };
}

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

beforeEach(() => {
  cookieValue.current = undefined;
  headersRead.current = false;
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  // A concrete origin by default, so a test that is not about the origin does
  // not accidentally exercise the empty-value resolution.
  setEnv({ API_INTERNAL_URL: "http://api.test:3001" });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** The URL the helper asked `fetch` for, from its first call. */
function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return String(fetchMock.mock.calls[0]?.[0]);
}

describe("fetchPublicIntakes", () => {
  it("returns the intakes from the API", async () => {
    const fetchMock = vi.fn(async () => ok({ data: [intake()] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPublicIntakes()).resolves.toHaveLength(1);
    expect(requestedUrl(fetchMock)).toBe(
      "http://api.test:3001/api/admissions/public/intakes",
    );
  });

  it("degrades to no intakes when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(fetchPublicIntakes()).resolves.toEqual([]);
  });

  it("degrades to no intakes on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    await expect(fetchPublicIntakes()).resolves.toEqual([]);
  });

  it("aborts a request that never answers, instead of holding the page", async () => {
    // A connection that stays open without a response: `fetch` never settles,
    // and the page that awaits this would hang with it. The deadline aborts it
    // and the announcement degrades to absent.
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchPublicIntakes();
    await vi.advanceTimersByTimeAsync(ANNOUNCEMENT_FETCH_TIMEOUT_MS);
    await expect(pending).resolves.toEqual([]);
    expect(aborted).toBe(true);
  });

  it("resolves an empty browser origin to the loopback API, never to the request's host", async () => {
    // `NEXT_PUBLIC_API_URL=''` means "same-origin" in the bundle (`lib/api.ts`),
    // but Node's `fetch` rejects a relative URL. The server must not borrow the
    // request's Host to fill the gap: that fetches whatever host a request
    // names. The mock answers every header with a foreign host to prove it.
    setEnv({ NEXT_PUBLIC_API_URL: "" });
    const fetchMock = vi.fn(async () => ok({ data: [intake()] }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchPublicIntakes();
    expect(requestedUrl(fetchMock)).toBe(
      "http://127.0.0.1:3001/api/admissions/public/intakes",
    );
    expect(headersRead.current).toBe(false);
  });

  it("uses an absolute browser origin when that is all it has (pnpm dev)", async () => {
    setEnv({ NEXT_PUBLIC_API_URL: "http://localhost:3001" });
    const fetchMock = vi.fn(async () => ok({ data: [intake()] }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchPublicIntakes();
    expect(requestedUrl(fetchMock)).toBe(
      "http://localhost:3001/api/admissions/public/intakes",
    );
  });

  it("shares one fetch across page views instead of one per view", async () => {
    // The intakes are the same for every visitor; the client refetches on
    // mount, so a minute of server cache costs no freshness.
    const fetchMock = vi.fn(async (_url: string, _init?: object) =>
      ok({ data: [intake()] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchPublicIntakes();
    const init = fetchMock.mock.calls[0]?.[1] as {
      cache?: string;
      next?: { revalidate?: number };
    };
    expect(init.cache).toBeUndefined();
    expect(init.next?.revalidate).toBe(ANNOUNCEMENT_REVALIDATE_SECONDS);
  });
});

describe("loadPublicAnnouncement", () => {
  it("reports the intake dismissed when the cookie names it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: [intake({ id: "p1" })] })),
    );
    cookieValue.current = "p1";
    await expect(loadPublicAnnouncement()).resolves.toMatchObject({
      bannerDismissed: true,
    });
  });

  it("ignores a cookie for a different intake", async () => {
    // Dismissal is per period: last year's cookie must not hide this year's.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: [intake({ id: "p1" })] })),
    );
    cookieValue.current = "p0";
    await expect(loadPublicAnnouncement()).resolves.toMatchObject({
      bannerDismissed: false,
    });
  });

  it("reports no dismissal when nothing is announced", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: [intake({ window: "closed" })] })),
    );
    cookieValue.current = "p1";
    await expect(loadPublicAnnouncement()).resolves.toMatchObject({
      bannerDismissed: false,
    });
  });
});
