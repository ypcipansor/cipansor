/**
 * A test copy of the system (staging, `DOCUMENT_TEST_COPY=true`) says so on
 * screen and stamps every printed page "SALINAN UJI — BUKAN DOKUMEN SAH":
 * its demo accounts carry the names of the yayasan's real office holders and
 * its letterhead is the real one (decisions/spmb-2027-2028.md item 5).
 * Production shows neither. The page follows what the API answers, so this
 * runs as it is against both.
 */
import { test, expect } from "@playwright/test";
import { TEST_COPY_STAMP } from "../../../packages/shared/src/types/environment";

const API_URL = process.env.API_URL || "http://localhost:3001/api";

test("the screen and every printed page follow what the API says about this copy", async ({
  page,
}) => {
  const { data } = (await (await fetch(`${API_URL}/environment`)).json()) as {
    data: { testCopy: boolean };
  };

  const answered = page.waitForResponse((r) =>
    r.url().endsWith("/api/environment"),
  );
  await page.goto("/login");
  await answered;

  const label = page.getByTestId("test-copy-label");
  const stamp = page.getByTestId("test-copy-print-stamp");

  if (!data.testCopy) {
    await expect(label).toHaveCount(0);
    await expect(stamp).toHaveCount(0);
    return;
  }

  await expect(label).toHaveText("Lingkungan uji · data demo");
  await expect(stamp).toBeHidden();

  await page.emulateMedia({ media: "print" });
  await expect(label).toBeHidden();
  await expect(stamp).toBeVisible();
  await expect(stamp).toContainText(TEST_COPY_STAMP);
});
