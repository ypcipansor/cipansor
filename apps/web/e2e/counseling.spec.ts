import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";
import { DEMO_ACCOUNTS } from "../../../packages/shared/src/types/demo-accounts";

test.describe("Counseling Module", () => {
  test("should load counseling dashboard correctly", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Real seeded counseling records + statistics
    const list = await apiRequest<{
      data: Array<{
        id: string;
        title: string;
        student?: { user?: { name: string } };
      }>;
    }>(session, "GET", "/counseling?limit=10");
    const stats = await apiRequest<{ data: { totalSessions: number } }>(
      session,
      "GET",
      "/counseling/statistics",
    );
    const firstSession = list.data?.[0];

    await page.goto("/counseling");

    await expect(
      page.getByRole("heading", { name: "Bimbingan Konseling" }),
    ).toBeVisible();
    await expect(page.getByText("Total Sesi")).toBeVisible();
    await expect(
      page
        .locator("p.text-2xl", { hasText: String(stats.data.totalSessions) })
        .first(),
    ).toBeVisible();

    // The seeded session renders in the list
    if (firstSession) {
      await expect(page.getByText(firstSession.title).first()).toBeVisible({
        timeout: 15000,
      });
      const studentName = firstSession.student?.user?.name;
      if (studentName) {
        await expect(page.getByText(studentName).first()).toBeVisible();
      }
    }
  });

  test("should navigate to create session page", async ({ page }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);
    await page.goto("/counseling");

    // The header action; an empty list shows a second one. The super admin
    // receives no confidential session, and seeded sessions are confidential.
    await page.getByRole("link", { name: "Buat Sesi" }).first().click();
    await expect(page).toHaveURL(/\/counseling\/new/);
  });
});

/**
 * A confidential session, as each reader sees it (decided 2026-09-26):
 * its counsellor and the unit's guru BK read all of it; the unit's kepala
 * sekolah sees that it exists and its referrals; other teachers and the
 * yayasan organs do not receive it; a student's history is a staff page.
 *
 * The guru BK writes the session, a note and a referral through the API,
 * then each account opens it. Accounts come from DEMO_ACCOUNTS.
 */
test.describe("Konseling rahasia — siapa membaca apa", () => {
  test.describe.configure({ mode: "serial" });

  const account = (roleCode: string) => {
    const found = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
    if (!found) throw new Error(`No demo account for ${roleCode}`);
    return { email: found.email, password: found.password };
  };
  const stamp = Date.now().toString(36).toUpperCase();
  const TITLE = `Sesi Uji Rahasia ${stamp}`;
  const CONTENT = `Isi uji rahasia ${stamp}`;
  const NOTE = `Catatan uji rahasia ${stamp}`;
  const REFERRED_TO = `Psikolog Uji ${stamp}`;

  let bk: AuthSession;
  let sessionId = "";
  let studentId = "";

  test.beforeAll(async () => {
    test.skip(
      await isProductionApi(),
      "API_URL menunjuk API produksi; uji ini menulis sesi konseling, jadi dilewati",
    );
    bk = await apiLogin(account("SMPIT_GURU_BK"));
    const students = await apiRequest<{ data: { id: string }[] }>(
      bk,
      "GET",
      "/students?limit=1",
    );
    studentId = students.data[0].id;
    const created = await apiRequest<{ data: { id: string } }>(
      bk,
      "POST",
      "/counseling",
      {
        studentId,
        category: "PERSONAL",
        priority: "HIGH",
        title: TITLE,
        description: CONTENT,
        scheduledAt: new Date().toISOString(),
        isConfidential: true,
      },
    );
    sessionId = created.data.id;
    await apiRequest(bk, "POST", `/counseling/${sessionId}/notes`, {
      content: NOTE,
    });
    await apiRequest(bk, "POST", `/counseling/${sessionId}/referrals`, {
      type: "EXTERNAL",
      referredTo: REFERRED_TO,
      reason: "Asesmen lanjutan",
    });
  });

  // The ⋯ menu of this session's row on the list.
  async function openRowMenu(page: Page) {
    await page.goto("/counseling");
    const row = page.getByTestId(`counseling-row-${sessionId}`);
    await row.getByRole("button").last().click();
    await expect(
      page.getByRole("menuitem", { name: "Lihat Detail" }),
    ).toBeVisible();
  }

  test.afterAll(async () => {
    if (bk && sessionId) {
      await apiRequest(bk, "DELETE", `/counseling/${sessionId}`).catch(
        () => undefined,
      );
    }
  });

  test("the guru BK reads all of it: content, notes, referrals", async ({
    page,
  }) => {
    await injectSession(page, bk);
    await page.goto(`/counseling/${sessionId}`);
    // The counsellors had no menu entry to their own page.
    await expect(
      page.getByRole("link", { name: "Bimbingan Konseling" }),
    ).toBeVisible();
    await expect(page.getByText(TITLE)).toBeVisible();
    await expect(page.getByText(CONTENT)).toBeVisible();
    await expect(page.getByText(NOTE)).toBeVisible();
    await page.getByRole("tab", { name: /Rujukan/ }).click();
    await expect(page.getByText(REFERRED_TO)).toBeVisible();
    await openRowMenu(page);
    await expect(page.getByRole("menuitem", { name: "Hapus" })).toBeVisible();
  });

  test("the kepala sekolah sees the referral and none of the content", async ({
    page,
  }) => {
    const kepala = await apiLogin(account("SMPIT_KEPALA_SEKOLAH"));
    await injectSession(page, kepala);
    await page.goto(`/counseling/${sessionId}`);
    await expect(
      page.getByRole("link", { name: "Bimbingan Konseling" }),
    ).toBeVisible();
    await expect(page.getByTestId("counseling-withheld")).toBeVisible();
    await expect(page.getByText(REFERRED_TO)).toBeVisible();
    await expect(page.getByRole("tab", { name: /Catatan/ })).toHaveCount(0);
    for (const secret of [TITLE, CONTENT, NOTE]) {
      await expect(page.getByText(secret)).toHaveCount(0);
    }
    // Nothing on the page may be changed from here, nor from the list.
    await expect(page.getByText("Aksi Cepat")).toHaveCount(0);
    await openRowMenu(page);
    await expect(
      page.getByRole("menuitem", { name: /^(Edit|Hapus)$/ }),
    ).toHaveCount(0);
    // The counts on the counselling page are theirs to read, and include it.
    const stats = await apiRequest<{ data: { totalSessions: number } }>(
      kepala,
      "GET",
      "/counseling/statistics",
    );
    expect(stats.data.totalSessions).toBeGreaterThan(0);
    await expect(
      apiRequest(kepala, "POST", `/counseling/${sessionId}/notes`, {
        content: "x",
      }),
    ).rejects.toThrow(/→ 403/);
  });

  test("another teacher and a yayasan organ do not receive it", async ({
    page,
  }) => {
    for (const roleCode of ["SMPIT_GURU", "YAYASAN_PEMBINA"]) {
      const who = await apiLogin(account(roleCode));
      await expect(
        apiRequest(who, "GET", `/counseling/${sessionId}`),
      ).rejects.toThrow(/→ 404/);
      const list = await apiRequest<{ data: { id: string }[] }>(
        who,
        "GET",
        "/counseling?limit=100",
      );
      expect(list.data.map((s) => s.id)).not.toContain(sessionId);
    }
    await injectSession(page, await apiLogin(account("SMPIT_GURU")));
    await page.goto(`/counseling/${sessionId}`);
    await expect(page.getByText("Gagal Memuat Data")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Bimbingan Konseling" }),
    ).toHaveCount(0);
    await expect(page.getByText(TITLE)).toHaveCount(0);
  });

  test("a wali does not read a student's counselling history here (403)", async () => {
    const wali = await apiLogin(account("SMPIT_ORANG_TUA"));
    await expect(
      apiRequest(wali, "GET", `/counseling/students/${studentId}/history`),
    ).rejects.toThrow(/→ 403/);
  });
});
