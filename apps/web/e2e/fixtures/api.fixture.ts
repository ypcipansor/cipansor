import { test as base } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

/**
 * API Mocking Fixtures
 * Provides utilities for mocking backend API responses
 */

export interface MockAPIResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
  meta?: any;
}

/**
 * Mock helper to intercept API calls
 */
export class APIMocker {
  constructor(private page: Page) {}

  /**
   * Mock successful API response
   */
  async mockSuccess(url: string | RegExp, data: any, meta?: any) {
    await this.page.route(url, async (route: Route) => {
      const response: MockAPIResponse = {
        success: true,
        data,
        ...(meta && { meta }),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: response,
      });
    });
  }

  /**
   * Mock API error response
   */
  async mockError(
    url: string | RegExp,
    code: string,
    message: string,
    status = 400,
  ) {
    await this.page.route(url, async (route: Route) => {
      const response: MockAPIResponse = {
        success: false,
        error: { code, message },
      };
      await route.fulfill({
        status,
        contentType: "application/json",
        json: response,
      });
    });
  }

  /**
   * Mock authentication endpoints
   */
  async mockAuth(
    user = {
      id: "test-user-id",
      email: "test@cipansor.or.id",
      name: "Test User",
      role: "SUPER_ADMIN",
    },
  ) {
    // Mock login. The browser session is an HttpOnly cookie now, so the body
    // carries the user only — no tokens.
    await this.mockSuccess("**/api/auth/login", { user });

    // Mock /me endpoint
    await this.mockSuccess("**/api/auth/me", user);
  }

  /**
   * Mock dashboard stats
   */
  async mockDashboardStats(
    stats = {
      totalStudents: 100,
      activeStudents: 95,
      totalTeachers: 20,
      todayAttendance: 85,
    },
  ) {
    await this.mockSuccess("**/api/dashboard/quick-stats", stats);
    await this.mockSuccess("**/api/dashboard-enhancement/overview*", stats);
  }

  /**
   * Mock units data
   */
  async mockUnits(
    units = [
      { id: "unit-1", name: "SD IT Cipansor", realm: "SD_IT" },
      { id: "unit-2", name: "SMP IT Cipansor", realm: "SMP_IT" },
    ],
  ) {
    await this.mockSuccess("**/api/units*", units);
  }

  /**
   * Clear all route mocks
   */
  async clearMocks() {
    await this.page.unrouteAll();
  }
}

/**
 * Extended test fixture with API mocking
 */
export const test = base.extend<{
  apiMocker: APIMocker;
}>({
  apiMocker: async ({ page }, use) => {
    const mocker = new APIMocker(page);
    await use(mocker);
    await mocker.clearMocks();
  },
});

export { expect } from "@playwright/test";
