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
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieValue.current ? { value: cookieValue.current } : undefined,
  }),
}));

import {
  fetchPublicIntakes,
  loadPublicAnnouncement,
} from "./public-intakes.server";

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchPublicIntakes", () => {
  it("returns the intakes from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ data: [intake()] })),
    );
    await expect(fetchPublicIntakes()).resolves.toHaveLength(1);
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
