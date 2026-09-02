import { Page } from '@playwright/test';
import { apiLogin, injectSession, SEED_USERS, type SeedRole } from './auth-api';

/**
 * Legacy auth helpers, now backed by REAL API authentication.
 *
 * These used to inject a fake user + 'mock-jwt-token' into localStorage, which
 * meant every real API call from the page returned 401 and specs could only
 * assert against page.route stubs. They now delegate to helpers/auth-api.ts
 * (apiLogin + injectSession), so pages render real seeded data.
 *
 * New specs should import { loginAs } from './auth-api' directly; this file
 * exists so the older mock-era specs keep working during migration.
 */

/** Map the RoleCode strings the legacy specs pass to seed roles. */
const ROLE_CODE_TO_SEED: Record<string, SeedRole> = {
  SUPER_ADMIN: 'superAdmin',
  UNIT_ADMIN: 'adminSdit',
  SDIT_ADMIN: 'adminSdit',
  TEACHER: 'teacher',
  SDIT_GURU: 'teacher',
  SDIT_SISWA: 'student',
  PARENT: 'parent',
  STUDENT: 'student',
};

function seedRoleFor(roleCode: string): SeedRole {
  const seedRole = ROLE_CODE_TO_SEED[roleCode];
  if (!seedRole) {
    throw new Error(
      `No seed user mapped for role code "${roleCode}" — add it to ROLE_CODE_TO_SEED in e2e/helpers/auth.ts`,
    );
  }
  return seedRole;
}

/**
 * Authenticate as the seed user for the given role code and land on the app
 * root. Kept for the legacy specs; equivalent to loginAs + goto('/').
 */
export async function setupAuthenticatedPage(page: Page, roleCode: string = 'SUPER_ADMIN') {
  const session = await apiLogin(SEED_USERS[seedRoleFor(roleCode)]);
  await injectSession(page, session);
  await page.goto('/');
}

/**
 * Real login for the given role code (despite the historical name). Only the
 * roleCode option is meaningful now — name/realm came from the fake user.
 */
export async function setupMockAuth(
  page: Page,
  options: { roleCode?: string; role?: string; name?: string; realm?: string } = {},
) {
  const session = await apiLogin(SEED_USERS[seedRoleFor(options.roleCode ?? 'SUPER_ADMIN')]);
  await injectSession(page, session);
}

/**
 * Prime auth BEFORE the first navigation so the Next middleware doesn't bounce
 * the spec to /login. Historically set a fake cookie; now injects a real
 * superAdmin session (cookies + localStorage), so subsequent API calls made by
 * the page are genuinely authenticated.
 */
export async function primeAuthCookies(page: Page) {
  const session = await apiLogin(SEED_USERS.superAdmin);
  await injectSession(page, session);
}
