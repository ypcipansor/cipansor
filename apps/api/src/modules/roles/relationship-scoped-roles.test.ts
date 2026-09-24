import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { permissionsForRoleCode } from './permissions';

/**
 * Wali, santri and alumni hold **no** permissions, and that is the design.
 *
 * It reads like an oversight — `permissions=0` on a live account is normally a
 * bug — so this file exists to stop someone "fixing" it.
 *
 * Their access is scoped by *relationship*, not by permission. A wali reaches
 * their child through the StudentParent link, checked in
 * parent.service.verifyParentAccess. Granting them a permission would be
 * strictly worse: STUDENT_VIEW is the permission guarding the admin student
 * CRUD, so handing it to a wali would let them list every santri in the unit
 * instead of their own children. The empty list is the tighter setting.
 *
 * The real hazard is the reverse: putting a `hasPermission` gate on a route
 * these roles depend on. They would be locked out instantly, silently, and
 * only in production — nothing in CI logs in as a wali. Both halves are
 * pinned below.
 */

const RELATIONSHIP_SCOPED = [
  'TKQ_ORANG_TUA',
  'SDIT_ORANG_TUA',
  'SMPIT_ORANG_TUA',
  'SMAQ_ORANG_TUA',
  'SDIT_SISWA',
  'SMPIT_SISWA',
  'SMAQ_SISWA',
  'SMPIT_ALUMNI',
  'SMAQ_ALUMNI',
];

/**
 * Modules serving those roles. A `hasPermission` gate added here locks out
 * every wali and santri, because their permission list is empty by design.
 */
const RELATIONSHIP_SCOPED_MODULES = ['parent'];

describe('relationship-scoped roles', () => {
  it('grants them no permissions, deliberately', () => {
    for (const roleCode of RELATIONSHIP_SCOPED) {
      expect(
        permissionsForRoleCode(roleCode),
        `${roleCode} must stay permissionless — its access comes from the ` +
          'StudentParent link, not a permission. Granting STUDENT_VIEW here ' +
          'would expose the whole unit roster.'
      ).toEqual([]);
    }
  });

  it('keeps the routes they depend on free of permission gates', () => {
    for (const moduleName of RELATIONSHIP_SCOPED_MODULES) {
      const routesPath = path.resolve(__dirname, '..', moduleName, `${moduleName}.routes.ts`);

      expect(fs.existsSync(routesPath), `${routesPath} should exist`).toBe(true);

      const source = fs.readFileSync(routesPath, 'utf8');

      expect(
        source.includes('hasPermission('),
        `${moduleName}.routes.ts gates on hasPermission, but the roles it ` +
          'serves hold no permissions — every wali and santri would get 403. ' +
          'Authorise by relationship (see parent.service.verifyParentAccess), ' +
          'or give these roles a permission of their own first.'
      ).toBe(false);
    }
  });

  // Guards the list itself: a new unit's wali role must be classified, not
  // left to fall through to the unknown-role default and look identical.
  it('covers every guardian and student role the enum defines', async () => {
    const { RoleCode } = await import('@prisma/client');
    const shouldBeListed = Object.keys(RoleCode).filter((code) =>
      /_ORANG_TUA$|_SISWA$|_MAHASISWA$|_ALUMNI$/.test(code)
    );

    for (const code of shouldBeListed) {
      expect(
        RELATIONSHIP_SCOPED,
        `${code} is a guardian/student/alumni role but is not listed here`
      ).toContain(code);
    }
  });
});
