import { Page } from "@playwright/test";

/**
 * Mocks the authenticated user state via Playwright browser context.
 */
export async function setupMockUser(
  page: Page,
  user: { roleCode: string; unitId: string },
) {
  // Cookies the Next middleware reads must exist before the first navigation
  // (addInitScript/localStorage alone is too late → redirect to /login). The
  // cookie carries a role only to satisfy middleware routing; the page uses the
  // localStorage user below.
  const baseURL = process.env.BASE_URL || "http://localhost:3000";
  const cookieAuth = JSON.stringify({
    state: {
      isAuthenticated: true,
      user: {
        id: "mock-user-id",
        name: "Super Admin E2E",
        role: "SUPER_ADMIN",
      },
    },
    version: 0,
  });
  await page.context().addCookies([
    {
      name: "auth-storage",
      value: encodeURIComponent(cookieAuth),
      url: baseURL,
    },
  ]);

  await page.addInitScript((mockUser) => {
    const authState = {
      state: {
        isAuthenticated: true,
        user: {
          id: "mock-user-id",
          name: "Super Admin E2E",
          roleCode: mockUser.roleCode,
          unitId: mockUser.unitId,
          email: "admin@simkari.test",
        },
        token: "mock-jwt-token",
      },
      version: 0,
    };
    window.localStorage.setItem("auth-storage", JSON.stringify(authState));
    window.localStorage.setItem("accessToken", "mock-jwt-token");
  }, user);
}

/**
 * Fakes a login action.
 */
export async function login(page: Page) {
  // No credential cookie is set (finding F); `setupMockUser` seeds the
  // non-credential `auth-storage` cookie and the localStorage session.
  void page;
}
