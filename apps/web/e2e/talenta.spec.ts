import { test, expect } from "@playwright/test";
import { loginAs, apiLogin, apiRequest, SEED_USERS } from "./helpers/auth-api";

// Full CRUD against the real backend: the tests build on each other
// (create → edit → delete the same record), so run them serially.
test.describe.configure({ mode: "serial" });

// Unique per run so a failed earlier run can't collide, and cleanup can
// target exactly what this run created.
const POSITION_TITLE = `Direktur Operasional E2E ${Date.now()}`;
const POSITION_TITLE_UPDATED = `${POSITION_TITLE} (Updated)`;

test.describe("Talenta Module End-to-End", () => {
  test.afterAll(async () => {
    // Safety net: remove any succession plan left behind by a failed run.
    const session = await apiLogin(SEED_USERS.superAdmin);
    const res = await apiRequest<{
      data: Array<{ id: string; positionTitle: string }>;
    }>(session, "GET", "/talenta/successions");
    for (const succ of res.data ?? []) {
      if (succ.positionTitle.startsWith(POSITION_TITLE)) {
        await apiRequest(session, "DELETE", `/talenta/successions/${succ.id}`);
      }
    }
  });

  test("should render Talenta page properly and navigate tabs", async ({
    page,
  }) => {
    // Global super admin (no assigned unit) must see the cross-unit view
    await loginAs(page, "superAdmin");
    await page.goto("/talenta");
    await expect(
      page.getByRole("heading", { name: "Manajemen Talenta" }),
    ).toBeVisible();

    // Tab Profil Talenta
    const tabProfiles = page.getByRole("tab", { name: "Profil Talenta" });
    await expect(tabProfiles).toBeVisible();
    await tabProfiles.click();
    await expect(
      page.getByRole("button", { name: "Tambah Profil" }),
    ).toBeVisible();

    // Tab Suksesi — the seeded succession plan renders from the real API
    const tabSuccession = page.getByRole("tab", { name: "Suksesi" });
    await expect(tabSuccession).toBeVisible();
    await tabSuccession.click();

    await expect(
      page.getByText("Kepala Bidang Kurikulum SMP IT"),
    ).toBeVisible();
    // "HIGH" priority badge — exact match avoids clashing with the
    // "High Potential + Key Talent" stat-card description.
    await expect(page.getByText("HIGH", { exact: true }).first()).toBeVisible();
  });

  test("should open dialog and submit new succession plan", async ({
    page,
  }) => {
    // Unit admins create/manage succession plans for their own unit
    await loginAs(page, "adminSdit");
    await page.goto("/talenta");
    await page.getByRole("tab", { name: "Suksesi" }).click();

    // Open create dialog
    await page.getByRole("button", { name: "Tambah Suksesi" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tambah Rencana Suksesi" }),
    ).toBeVisible();

    // Fill the form. The priority Select is the only combobox in the dialog;
    // its placeholder ("Opsional") isn't exposed as an accessible name, so scope
    // to the dialog instead of matching by name.
    await page.getByLabel("Jabatan").fill(POSITION_TITLE);
    await page.getByRole("dialog").getByRole("combobox").click();
    await page.getByRole("option", { name: "Tinggi" }).click();

    // Submit — persists through the real API
    await page.getByRole("button", { name: "Simpan" }).click();

    // Verify toast success and that the new plan is actually rendered
    await expect(
      page.getByText("Rencana suksesi berhasil dibuat"),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText(POSITION_TITLE, { exact: true })).toBeVisible();
  });

  test("should open dialog and update existing succession plan", async ({
    page,
  }) => {
    // Unit admins create/manage succession plans for their own unit
    await loginAs(page, "adminSdit");
    await page.goto("/talenta");
    await page.getByRole("tab", { name: "Suksesi" }).click();

    // The plan created by the previous test is served by the real API
    await expect(page.getByText(POSITION_TITLE, { exact: true })).toBeVisible();

    // Hover over card and click edit button. Since we use Lucide Edit icon, let's find the button within the card.
    const card = page.locator(".group").filter({ hasText: POSITION_TITLE });
    await card.hover();

    // Click the Edit button (it should be visible on hover)
    const editBtn = card.locator("button.text-blue-500");
    await editBtn.click();

    // Dialog should be open with correct title
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Edit Rencana Suksesi" }),
    ).toBeVisible();

    // Expect the input to be pre-filled with the persisted value
    await expect(page.getByLabel("Jabatan")).toHaveValue(POSITION_TITLE);

    // Change value
    await page.getByLabel("Jabatan").fill(POSITION_TITLE_UPDATED);
    await page.getByRole("button", { name: "Simpan" }).click();

    // Verify toast success and the persisted update rendered
    await expect(
      page.getByText("Rencana suksesi berhasil diperbarui"),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText(POSITION_TITLE_UPDATED)).toBeVisible();
  });

  test("should open confirm dialog and delete succession plan", async ({
    page,
  }) => {
    // Unit admins create/manage succession plans for their own unit
    await loginAs(page, "adminSdit");
    await page.goto("/talenta");
    await page.getByRole("tab", { name: "Suksesi" }).click();

    // Hover over card and click delete button.
    const card = page
      .locator(".group")
      .filter({ hasText: POSITION_TITLE_UPDATED });
    await expect(card).toBeVisible();
    await card.hover();

    // Click the Delete button
    const deleteBtn = card.locator("button.text-destructive");
    await deleteBtn.click();

    // Confirm Dialog should be open (ConfirmDialog renders an AlertDialog).
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Hapus Data?" }),
    ).toBeVisible();

    // Confirm deletion
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Hapus" })
      .click();

    // Verify toast success and the card is really gone
    await expect(
      page.getByText("Rencana suksesi berhasil dihapus"),
    ).toBeVisible();
    await expect(page.getByText(POSITION_TITLE_UPDATED)).not.toBeVisible();
  });
});
