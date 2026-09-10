import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "./helpers/auth-api";

test.describe("End-to-End: Integrated Pesantren Modules (Tahfidz, Takhosus, Kitab, Rapor)", () => {
  test("should aggregate Tahfidz, Takhosus, and Kitab data into the Unified Rapor Pesantren", async ({
    page,
  }) => {
    const session = await apiLogin(SEED_USERS.superAdmin);
    await injectSession(page, session);

    // Use the real seeded, published rapor pesantren — its aggregated
    // tahfidz/takhosus/ibadah domains come from the real backend aggregator.
    const list = await apiRequest<{
      data: Array<{ id: string; status: string; studentName: string }>;
    }>(session, "GET", "/rapor-pesantren?limit=20");
    const summary =
      list.data?.find((r) => r.status === "PUBLISHED") ?? list.data?.[0];
    expect(summary, "seed should provide a rapor pesantren").toBeTruthy();
    if (!summary) return;

    const detail = await apiRequest<{
      data: {
        student?: { name: string; nisn: string };
        tahfidz?: { tahfidzScore?: number };
        takhosus?: { takhosusName?: string };
      };
    }>(session, "GET", `/rapor-pesantren/${summary.id}`);
    const studentName = detail.data.student?.name;
    const nisn = detail.data.student?.nisn;
    const takhosusName = detail.data.takhosus?.takhosusName;

    await page.goto(`/rapor-pesantren/unified/${summary.id}`);

    // Page title
    await expect(
      page.getByRole("heading", { name: "Rapor Pesantren Terpadu" }),
    ).toBeVisible({
      timeout: 15000,
    });

    // Student header data from the real record
    if (studentName)
      await expect(page.getByText(studentName).first()).toBeVisible();
    if (nisn) await expect(page.getByText(`NISN: ${nisn}`)).toBeVisible();
    if (summary.status === "PUBLISHED") {
      await expect(page.getByText("Dipublikasikan")).toBeVisible();
    }

    // Cross-module aggregation sections render
    await expect(
      page.getByRole("heading", { name: "Tahfidz Al-Quran" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Program Takhosus" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Kajian Kitab Kuning" }),
    ).toBeVisible();
    if (takhosusName) {
      await expect(page.getByText(takhosusName)).toBeVisible();
    }

    // Ibadah & Akhlak block (rendered as a CardTitle)
    await expect(page.getByText("Ibadah & Karakter (Akhlak)")).toBeVisible();

    // Print layout structure. The signature block is "hidden print:block", so
    // emulate print media to assert it renders.
    await expect(
      page.getByRole("button", { name: "Cetak Rapor" }),
    ).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByText("Mudirul Ma'had")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });
});
