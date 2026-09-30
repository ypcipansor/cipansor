import { test, expect } from "@playwright/test";

test("verify reception pages", async ({ page }) => {
  // Mock API responses
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "admin-1",
          name: "Super Admin",
          email: "admin@cipansor.or.id",
          role: "SUPER_ADMIN",
          unitId: "unit-1",
        },
      }),
    });
  });

  await page.route("**/api/reception/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          guestsToday: 5,
          activeVisits: 2,
          pendingPackages: 3,
        },
      }),
    });
  });

  await page.route("**/api/reception/guests*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: "1",
            name: "John Doe",
            institution: "Kemdikbud",
            purpose: "Dinas",
            checkIn: new Date().toISOString(),
            visitorCount: 1,
            receivedBy: { name: "Admin" },
          },
        ],
      }),
    });
  });

  await page.route("**/api/reception/visits*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: "1",
            student: {
              name: "Ahmad",
              enrollments: [{ class: { name: "7A" } }],
            },
            visitorName: "Budi",
            relation: "AYAH",
            purpose: "Jenguk",
            checkIn: new Date().toISOString(),
            status: "CHECKED_IN",
          },
        ],
      }),
    });
  });

  await page.route("**/api/reception/packages*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: "1",
            student: { name: "Siti", enrollments: [{ class: { name: "8B" } }] },
            senderName: "Kurir JNE",
            description: "Paket Buku",
            receivedAt: new Date().toISOString(),
            status: "RECEIVED",
          },
        ],
      }),
    });
  });

  // The session is an HttpOnly cookie; nothing token-like belongs in JS storage.
  await page.addInitScript(() => {
    window.localStorage.removeItem("accessToken");
  });

  // Login simulation (optional if we go straight to page with mocked auth)
  // But let's try direct navigation first
  await page.goto("/reception");

  // Wait for dashboard content
  await expect(page.getByText("Dashboard Resepsionis")).toBeVisible();
  await expect(page.getByText("Tamu Hari Ini")).toBeVisible();
  await expect(page.getByText("5")).toBeVisible(); // Stats check

  await page.screenshot({ path: "apps/web/e2e/reception-dashboard.png" });

  // Navigate to Guest Book
  await page.click("text=Tamu Hari Ini");
  await expect(page.getByText("Buku Tamu")).toBeVisible();
  await expect(page.getByText("John Doe")).toBeVisible();

  await page.screenshot({ path: "apps/web/e2e/reception-guest-book.png" });
});
