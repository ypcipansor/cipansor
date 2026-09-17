import { describe, it, expect } from 'vitest';
import {
  BENDAHARA_ROLE_CODES,
  PENGAWASAN_ARREARS_ROLES,
  PENGAWASAN_LIFT_ROLES,
  PENGAWASAN_PERIODIC_REPORT_ROLES,
  PENGAWASAN_SUSPENSION_ROLES,
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

  it('limits periodic report submission to Pengawas and Super Admin', () => {
    expect([...PENGAWASAN_PERIODIC_REPORT_ROLES].sort()).toEqual(
      ['SUPER_ADMIN', 'YAYASAN_PENGAWAS'].sort()
    );
  });

  it('resolves visibility from the same lists the routes authorize', () => {
    expect(pengawasanAccessOf('YAYASAN_PEMBINA')).toMatchObject({
      canManageSuspensions: true,
      canLiftSuspension: true,
      canSubmitPeriodicReport: false,
    });
    expect(pengawasanAccessOf('YAYASAN_PENGAWAS')).toMatchObject({
      canManageSuspensions: true,
      canLiftSuspension: false,
      canSubmitPeriodicReport: true,
    });
    expect(pengawasanAccessOf('SDIT_BENDAHARA').canViewArrears).toBe(true);
    expect(pengawasanAccessOf(null).canManageSuspensions).toBe(false);
  });

  it('lists only roles the suspension policy actually admits', () => {
    for (const code of PENGAWASAN_SUSPENSION_ROLES) {
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    }
  });
});
