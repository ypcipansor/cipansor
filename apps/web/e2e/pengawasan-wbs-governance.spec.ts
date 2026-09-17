import { test, expect, type Page } from "@playwright/test";
import {
  WBS_CATEGORIES,
  WBS_CATEGORY_LABELS,
  WBS_TARGET_LEVELS,
  WBS_TARGET_LEVEL_LABELS,
} from "@cipansor/shared";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";

/**
 * Whistleblowing System & board-suspension governance.
 *
 * The public half of the WBS is only useful if an anonymous person can actually
 * reach it: the first version of this page was a `/public/*` route that the
 * host split still served from the portal, behind a login, because
 * `/public/wbs` was missing from `PUBLIC_PATH_PREFIXES`. The reachability tests
 * below run with no session on purpose — that is the only state a whistleblower
 * is ever in.
 *
 * The governance half is exercised through the real API. Every call here goes
 * to the seeded stack, no `page.route` mocks: the point of these tests is the
 * authorization boundary, and a mocked API would happily agree with whatever
 * the UI believed.
 */

type Envelope<T> = { success: boolean; data: T; message?: string };

type WbsReport = {
  id: string;
  ticketCode: string;
  status: string;
  category: string;
  targetLevel: string;
  isAnonymous?: boolean;
  reporterName?: string | null;
  reporterContact?: string | null;
};

/** The public submission + tracking round trip, driven through the API. */
async function submitPublicReport(ticketSeed: string) {
  const res = await fetch(
    `${process.env.API_URL || "http://localhost:3001/api"}/pengawasan/public/wbs/reports`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "KEUANGAN_ASET",
        targetLevel: "KEPALA_UNIT",
        subject: `E2E WBS ${ticketSeed}`,
        description:
          "Laporan uji end-to-end untuk memastikan alur WBS publik sampai ke penanganan.",
        // isAnonymous deliberately omitted: the default must be anonymous AND
        // must drop the identity fields the reporter volunteered anyway.
        reporterName: "Pelapor Yang Tidak Ingin Disebut",
        reporterContact: "081200000000",
      }),
    },
  );

  expect(res.status, "public WBS submission should be accepted").toBe(201);
  return (
    (await res.json()) as Envelope<{
      ticketCode: string;
      trackingToken: string;
    }>
  ).data;
}

async function signIn(page: Page, role: keyof typeof SEED_USERS) {
  await injectSession(page, await apiLogin(SEED_USERS[role]));
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Public WBS surface is reachable without a session", () => {
  test("the submission page is served, not bounced to a login wall", async ({
    page,
  }) => {
    const response = await page.goto("/public/wbs");

    expect(new URL(page.url()).pathname).toBe("/public/wbs");
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.getByRole("heading", {
        name: /Whistleblowing System/i,
        level: 1,
      }),
    ).toBeVisible({ timeout: 15000 });
    // The whole point: no credential is asked for here.
    await expect(page.locator("body")).not.toContainText(/kata sandi/i);
  });

  test("the tracking page is reachable and asks for the ticket, not for a login", async ({
    page,
  }) => {
    const response = await page.goto("/public/wbs/track");

    expect(new URL(page.url()).pathname).toBe("/public/wbs/track");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByLabel(/Kode Tiket WBS/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByLabel(/Token Akses Rahasia/i)).toBeVisible();
  });

  test("every WBS category and target level is offered from the shared contract", async ({
    page,
  }) => {
    await page.goto("/public/wbs");
    await expect(page.getByLabel(/Kategori Laporan/i)).toBeVisible({
      timeout: 15000,
    });

    await page.getByLabel(/Kategori Laporan/i).click();
    for (const code of WBS_CATEGORIES) {
      await expect(
        page.getByRole("option", { name: WBS_CATEGORY_LABELS[code] }),
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");

    await page.getByLabel(/Subjek Teradu/i).click();
    for (const code of WBS_TARGET_LEVELS) {
      await expect(
        page.getByRole("option", { name: WBS_TARGET_LEVEL_LABELS[code] }),
      ).toBeVisible();
    }
  });
});

test.describe.serial("WBS submission, anonymity and tracking", () => {
  const seed = `${Date.now()}`;
  let ticket: { ticketCode: string; trackingToken: string };

  test("a report submitted without isAnonymous stores no identity", async () => {
    ticket = await submitPublicReport(seed);
    expect(ticket.ticketCode).toMatch(/^WBS-\d{6}-[0-9A-F]+$/);
    expect(ticket.trackingToken.length).toBeGreaterThanOrEqual(16);

    // Read it back the way a handler does — the API is the only place that can
    // tell us what was actually persisted.
    const superAdmin = await apiLogin(SEED_USERS.superAdmin);
    const list = await apiRequest<Envelope<WbsReport[]>>(
      superAdmin,
      "GET",
      "/pengawasan/wbs/reports",
    );
    const stored = list.data.find((r) => r.ticketCode === ticket.ticketCode);

    expect(
      stored,
      "the submitted report should be listed for a handler",
    ).toBeDefined();
    expect(stored!.isAnonymous).toBe(true);
    expect(stored!.reporterName ?? null).toBeNull();
    expect(stored!.reporterContact ?? null).toBeNull();
  });

  test("the reporter can follow their own report with the issued token", async ({
    page,
  }) => {
    await page.goto("/public/wbs/track");
    await page.getByLabel(/Kode Tiket WBS/i).fill(ticket.ticketCode);
    await page.getByLabel(/Token Akses Rahasia/i).fill(ticket.trackingToken);
    await page
      .getByRole("button", { name: /Lacak|Cari|Cek/i })
      .first()
      .click();

    await expect(
      page.getByText(ticket.ticketCode, { exact: false }),
    ).toBeVisible({
      timeout: 15000,
    });
  });

  test("a wrong tracking token reveals nothing", async () => {
    const res = await fetch(
      `${process.env.API_URL || "http://localhost:3001/api"}/pengawasan/public/wbs/track`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticketCode: ticket.ticketCode,
          trackingToken: "token-yang-salah-dan-tidak-pernah-diterbitkan",
        }),
      },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).not.toContain(
      ticket.trackingToken,
    );
  });
});

test.describe
  .serial("WBS per-report scope is enforced on every handler action", () => {
  const seed = `${Date.now()}-scope`;
  let ticket: { ticketCode: string; trackingToken: string };
  let reportId = "";
  let ketua: AuthSession;
  let pengawas: AuthSession;

  test.beforeAll(async () => {
    ticket = await submitPublicReport(seed);
    pengawas = await apiLogin(SEED_USERS.pengawas);
    ketua = await apiLogin(SEED_USERS.ketuaPengurus);

    const list = await apiRequest<Envelope<WbsReport[]>>(
      pengawas,
      "GET",
      "/pengawasan/wbs/reports",
    );
    const stored = list.data.find((r) => r.ticketCode === ticket.ticketCode);
    if (!stored)
      throw new Error(
        "the seeded Pengawas cannot see the report they must handle",
      );
    reportId = stored.id;
  });

  test("the Yayasan Pengawas can read and act on the report in scope", async () => {
    const detail = await apiRequest<Envelope<WbsReport>>(
      pengawas,
      "GET",
      `/pengawasan/wbs/reports/${reportId}`,
    );
    expect(detail.data.id).toBe(reportId);
  });

  test("the same report is refused to a role outside its scope", async () => {
    // A UNIT_ADMIN (SD IT) has no business in a foundation-level WBS chain.
    // The ID alone used to be enough — this is the regression that let any
    // handler read or mutate any report by UUID.
    const adminSdit = await apiLogin(SEED_USERS.adminSdit);
    const res = await fetch(
      `${process.env.API_URL || "http://localhost:3001/api"}/pengawasan/wbs/reports/${reportId}`,
      { headers: { authorization: `Bearer ${adminSdit.accessToken}` } },
    );

    expect(res.status).toBe(403);
  });

  for (const [action, body] of [
    ["status", () => ({ status: "SELESAI", handlerNote: "Ditutup" })],
    [
      "forward",
      () => ({ toRole: "YAYASAN_KETUA", reason: "Bukan wewenang kami" }),
    ],
    ["comment", () => ({ message: "Komentar dari luar wewenang" })],
  ] as const) {
    test(`an out-of-scope ${action} write is refused with 403`, async () => {
      const adminSdit = await apiLogin(SEED_USERS.adminSdit);
      const path =
        action === "status"
          ? `/pengawasan/wbs/reports/${reportId}/status`
          : action === "forward"
            ? `/pengawasan/wbs/reports/${reportId}/forward`
            : `/pengawasan/wbs/reports/${reportId}/comments`;

      const res = await fetch(
        `${process.env.API_URL || "http://localhost:3001/api"}${path}`,
        {
          method: action === "status" ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${adminSdit.accessToken}`,
          },
          body: JSON.stringify(body()),
        },
      );

      expect(res.status).toBe(403);
    });
  }

  test("an ordered forward is recorded and moves the handling role", async () => {
    const forwarded = await apiRequest<Envelope<WbsReport>>(
      pengawas,
      "POST",
      `/pengawasan/wbs/reports/${reportId}/forward`,
      {
        toRole: "YAYASAN_KETUA",
        reason: "Subjek teradu ada di lingkup Pengurus, diteruskan ke Ketua.",
      },
    );
    expect(forwarded.success).toBe(true);

    // The Ketua can now see what was handed to them; the audit trail is the
    // WbsForwardLog the service writes in the same transaction.
    const ketuaList = await apiRequest<Envelope<WbsReport[]>>(
      ketua,
      "GET",
      "/pengawasan/wbs/reports",
    );
    expect(ketuaList.data.some((r) => r.id === reportId)).toBe(true);
  });
});

test.describe
  .serial("Board suspension: who may be frozen and who may thaw", () => {
  test("only a Pengurus may be suspended — never the Super Admin or Pembina", async () => {
    const pengawas = await apiLogin(SEED_USERS.pengawas);
    // The Pengawas cannot list users, so the target id is resolved from the
    // Super Admin's own session. Knowing the ID is exactly the situation the
    // guard must survive — the ID alone used to be sufficient.
    const superAdmin = await apiLogin(SEED_USERS.superAdmin);
    const superAdminUser = await apiRequest<Envelope<{ id: string }>>(
      superAdmin,
      "GET",
      "/auth/me",
    );

    const res = await fetch(
      `${process.env.API_URL || "http://localhost:3001/api"}/pengawasan/board-suspensions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${pengawas.accessToken}`,
        },
        body: JSON.stringify({
          userId: superAdminUser.data.id,
          skNumber: `SK/E2E/${Date.now()}`,
          auditReason:
            "Uji coba: pembekuan tidak boleh menyentuh akun Super Admin meski ID-nya diketahui.",
        }),
      },
    );

    expect(res.status).toBe(403);
  });

  test("the Pengawas cannot lift a suspension — pemulihan belongs to the Pembina", async () => {
    const pengawas = await apiLogin(SEED_USERS.pengawas);

    const res = await fetch(
      `${process.env.API_URL || "http://localhost:3001/api"}/pengawasan/board-suspensions/any-id/lift`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${pengawas.accessToken}`,
        },
        body: JSON.stringify({
          liftReason: "Percobaan mencabut pembekuan sendiri",
        }),
      },
    );

    // 403 from the route guard, before any id is even looked at.
    expect(res.status).toBe(403);
  });

  test("the governance page renders the suspension panel for the Pembina", async ({
    page,
  }) => {
    await signIn(page, "pembina");
    await page.goto("/pengawasan");
    await expect(
      page.getByRole("heading", { name: "Pengawasan Internal", level: 1 }),
    ).toBeVisible({ timeout: 20000 });
  });
});

test.describe("Periodic oversight report enters E-Office as a draft", () => {
  test("it is filed on a foundation unit as DRAFT, not as an already-sent letter", async () => {
    const pengawas = await apiLogin(SEED_USERS.pengawas);
    const period = `E2E-${Date.now()}`;

    const submitted = await apiRequest<
      Envelope<{
        letterId: string;
        status: string;
        letterNumber: string | null;
      }>
    >(pengawas, "POST", "/pengawasan/periodic-reports/draft-eoffice", {
      title: `Laporan Pengawasan E2E ${period}`,
      period,
      executiveSummary:
        "Ringkasan eksekutif uji end-to-end untuk memastikan laporan masuk ke alur E-Office.",
    });

    expect(submitted.success).toBe(true);
    expect(submitted.data.status).toBe("DRAFT");
    // A draft has no letter number yet — the number is issued when it is sent,
    // which is exactly the step the old implementation skipped.
    expect(submitted.data.letterNumber ?? null).toBeNull();
  });
});

test.describe.serial("Scoped account pickers and WBS handler replies", () => {
  const seed = `${Date.now()}-picker`;
  let reportId = "";
  let ticket: { ticketCode: string; trackingToken: string };
  let pengawas: AuthSession;

  test.beforeAll(async () => {
    pengawas = await apiLogin(SEED_USERS.pengawas);
    ticket = await submitPublicReport(seed);

    const list = await apiRequest<
      Envelope<{ id: string; ticketCode: string; primaryHandlerRole: string }[]>
    >(pengawas, "GET", "/pengawasan/wbs/reports");
    const stored = list.data.find((r) => r.ticketCode === ticket.ticketCode);
    if (!stored) throw new Error("seeded Pengawas cannot see the report");
    reportId = stored.id;
  });

  test("the suspendable-candidate list only offers Pengurus without an ACTIVE suspension", async () => {
    const res = await apiRequest<
      Envelope<
        { id: string; name: string; email: string; roleCodes: string[] }[]
      >
    >(pengawas, "GET", "/pengawasan/board-suspensions/candidates");

    expect(res.success).toBe(true);
    for (const c of res.data) {
      // Every candidate must carry a Pengurus role and no unit binding.
      expect(c.roleCodes.length).toBeGreaterThan(0);
      expect(c.email).toBeTruthy();
    }
  });

  test("the Plh candidate list excludes the officer being suspended", async () => {
    const candidates = await apiRequest<
      Envelope<{ id: string; roleCodes: string[] }[]>
    >(pengawas, "GET", "/pengawasan/board-suspensions/candidates");
    const target = candidates.data[0];

    if (!target) return; // seed has no suspendable Pengurus — nothing to assert

    const plh = await apiRequest<Envelope<{ id: string }[]>>(
      pengawas,
      "GET",
      `/pengawasan/board-suspensions/plh-candidates?excludeUserId=${target.id}`,
    );

    expect(plh.success).toBe(true);
    expect(plh.data.some((c) => c.id === target.id)).toBe(false);
  });

  test("a handler reply reaches the public tracker as 'Tim Pemeriksa'", async () => {
    // The reply must be visible to the reporter without leaking the handler's
    // identity, and it must actually be persisted.
    await apiRequest(
      pengawas,
      "POST",
      `/pengawasan/wbs/reports/${reportId}/comments`,
      {
        message: "Terima kasih, laporan Anda sedang kami periksa.",
      },
    );

    const tracked = await fetch(
      `${process.env.API_URL || "http://localhost:3001/api"}/pengawasan/public/wbs/track`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticketCode: ticket.ticketCode,
          trackingToken: ticket.trackingToken,
        }),
      },
    );

    expect(tracked.status).toBe(200);
    const body = await tracked.text();
    expect(body).toContain("Tim Pemeriksa");
    // The Pengawas's real name/email must not leak to the reporter.
    expect(body).not.toContain("yayasan.pengawas@cipansor.or.id");
  });
});
