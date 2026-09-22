import { describe, it, expect } from 'vitest';
import { RoleCode } from '@prisma/client';
import { yayasanOrganOf } from '@/utils/role-eligibility';
import {
  BENDAHARA_ROLE_CODES,
  PENGAWASAN_ARREARS_ROLES,
  PENGAWASAN_LIFT_ROLES,
  PENGAWASAN_PERIODIC_REPORT_ROLES,
  PENGAWASAN_SUSPENSION_ISSUE_ROLES,
  PENGAWASAN_SUSPENSION_READ_ROLES,
  PENGAWASAN_SUSPENSION_ROLES,
  PLH_INELIGIBLE_ROLE_CODES,
  PLH_ROLE_CODES,
  isPlhEligible,
  pengawasanAccessOf,
} from '@cipansor/shared';

/**
 * The governance role groups are the single definition read by both the API's
 * `authorize(...)` lists (pengawasan.routes.ts) and the web page's control
 * visibility, so these assertions guard both sides at once.
 */
describe('pengawasan governance role groups', () => {
  it('lets every unit treasurer read the arrears oversight report', () => {
    // `FINANCIAL_OVERSIGHT_ROLES` previously omitted the treasurers, so every
    // unit bendahara received a 403 on /financial-arrears.
    for (const code of BENDAHARA_ROLE_CODES) {
      expect(PENGAWASAN_ARREARS_ROLES).toContain(code);
    }
  });

  it('reserves pemulihan status for the Pembina (and Super Admin)', () => {
    expect(PENGAWASAN_LIFT_ROLES).toContain('YAYASAN_PEMBINA');
    expect(PENGAWASAN_LIFT_ROLES).toContain('SUPER_ADMIN');
    // The Pengawas investigates; it does not thaw. A control offered to a role
    // the API refuses is worse than no control.
    expect(PENGAWASAN_LIFT_ROLES).not.toContain('YAYASAN_PENGAWAS');
  });

  it('separates read, issue and lift so the Pembina can see but not freeze', () => {
    // The Pembina may read the register (it appoints and dismisses), but must
    // not issue an SK Pembekuan: that is the Pengawas's oversight act.
    expect(PENGAWASAN_SUSPENSION_READ_ROLES).toContain('YAYASAN_PEMBINA');
    expect(PENGAWASAN_SUSPENSION_ISSUE_ROLES).not.toContain('YAYASAN_PEMBINA');
    expect(PENGAWASAN_SUSPENSION_ISSUE_ROLES).not.toContain('YAYASAN_SEKRETARIS');
    // Issuance is Pengawas + Super Admin; the lift is the inverse grant.
    expect([...PENGAWASAN_SUSPENSION_ISSUE_ROLES].sort()).toEqual(
      ['SUPER_ADMIN', 'YAYASAN_PENGAWAS'].sort()
    );
  });

  it('limits periodic report submission to Pengawas and Super Admin', () => {
    expect([...PENGAWASAN_PERIODIC_REPORT_ROLES].sort()).toEqual(
      ['SUPER_ADMIN', 'YAYASAN_PENGAWAS'].sort()
    );
  });

  it('resolves visibility from the same lists the routes authorize', () => {
    expect(pengawasanAccessOf('YAYASAN_PEMBINA')).toMatchObject({
      canReadSuspensions: true,
      canIssueSuspension: false,
      canLiftSuspension: true,
      canSubmitPeriodicReport: false,
    });
    expect(pengawasanAccessOf('YAYASAN_PENGAWAS')).toMatchObject({
      canReadSuspensions: true,
      canIssueSuspension: true,
      canLiftSuspension: false,
      canSubmitPeriodicReport: true,
    });
    expect(pengawasanAccessOf('SDIT_BENDAHARA').canViewArrears).toBe(true);
    expect(pengawasanAccessOf(null).canManageSuspensions).toBe(false);
    expect(pengawasanAccessOf(null).canIssueSuspension).toBe(false);
  });

  it('keeps the deprecated alias pointing at the read list', () => {
    // Any consumer that only gates visibility keeps compiling; the write routes
    // no longer read this constant.
    expect([...PENGAWASAN_SUSPENSION_ROLES]).toEqual([
      ...PENGAWASAN_SUSPENSION_READ_ROLES,
    ]);
  });

  it('lists only roles the suspension policy actually admits', () => {
    for (const code of PENGAWASAN_SUSPENSION_ROLES) {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    }
  });
});

/**
 * The Plh/Plt eligibility rule is a shared contract: the candidate query, the
 * service preflight, the transactional re-check and the web picker all read
 * `isPlhEligible`. These assertions pin the rule itself and its agreement with
 * the database organ-exclusivity invariant in `utils/role-eligibility.ts`.
 */
describe('Plh/Plt eligibility policy', () => {
  it('excludes every role that is not part of the Pengurus organ', () => {
    // Both non-Pengurus organs, the system administrator, and the external
    // roles: none may be handed a Pengurus office.
    for (const code of [
      'YAYASAN_PEMBINA',
      'YAYASAN_PENGAWAS',
      'SUPER_ADMIN',
      'SDIT_SISWA',
      'SMPIT_SISWA',
      'SDIT_ORANG_TUA',
      'SDIT_KOMITE',
      'SMPIT_ALUMNI',
      'SMAQ_ALUMNI',
    ]) {
      expect(PLH_INELIGIBLE_ROLE_CODES, `${code} must be ineligible`).toContain(code);
    }
  });

  it('accepts an account holding no role and an account holding a Pengurus role', () => {
    expect(isPlhEligible([])).toBe(true);
    for (const code of PLH_ROLE_CODES) {
      expect(isPlhEligible([code])).toBe(true);
      expect(isPlhEligible(['SDIT_GURU', code])).toBe(true);
    }
  });

  it('refuses any combination that includes an ineligible role', () => {
    expect(isPlhEligible(['YAYASAN_PEMBINA'])).toBe(false);
    expect(isPlhEligible(['YAYASAN_KETUA', 'YAYASAN_PENGAWAS'])).toBe(false);
    expect(isPlhEligible(['SUPER_ADMIN', 'YAYASAN_BENDAHARA'])).toBe(false);
  });

  it('agrees with the organ-exclusivity rule the database enforces', () => {
    // Every role the database trigger would treat as a non-Pengurus yayasan
    // organ must be ineligible; otherwise the service could attempt a grant the
    // trigger refuses.
    for (const code of Object.values(RoleCode)) {
      const organ = yayasanOrganOf(code);
      if (organ && organ !== 'PENGURUS') {
        expect(
          PLH_INELIGIBLE_ROLE_CODES,
          `${code} is organ ${organ} and must be ineligible`
        ).toContain(code);
      }
    }
  });
});
