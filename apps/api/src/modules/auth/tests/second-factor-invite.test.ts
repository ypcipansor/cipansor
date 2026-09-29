/**
 * Who is invited to turn 2FA on after signing in (decided 2026-09-28,
 * decisions/autentikasi-2fa-dan-sandi.md): every educator and staff member for
 * whom it is not already mandatory, and the wali santri — until they turn it
 * on. Santri are not invited; the decision names neither komite nor alumni. A
 * mandatory account is sent to set it up instead, so it is never "invited".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleCode } from '@prisma/client';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { invitesSecondFactor } from '@/middleware/auth';
import { authService } from '../auth.service';

function account(codes: RoleCode[], isTwoFactorEnabled = false) {
  return {
    isTwoFactorEnabled,
    userRoles: codes.map((code) => ({ role: { code } })),
  };
}

async function statusFor(codes: RoleCode[], isTwoFactorEnabled = false) {
  prismaMock.user.findUnique.mockResolvedValue(account(codes, isTwoFactorEnabled));
  return authService.getTwoFactorStatus('user-1');
}

beforeEach(() => vi.clearAllMocks());

describe('who is invited to turn 2FA on', () => {
  it.each([
    RoleCode.SDIT_GURU,
    RoleCode.SMAQ_GURU_BK,
    RoleCode.USTADZ,
    RoleCode.MUSYRIF,
    RoleCode.MUHAFIDZ,
    RoleCode.SMPIT_TATA_USAHA,
    RoleCode.PESANTREN_TATA_USAHA,
    RoleCode.TKQ_BENDAHARA,
    RoleCode.PERAWAT,
    RoleCode.BUSINESS_STAFF,
    RoleCode.TKQ_ORANG_TUA,
    RoleCode.SMAQ_ORANG_TUA,
  ])('%s, while 2FA is off', async (code) => {
    expect(invitesSecondFactor([code])).toBe(true);
    await expect(statusFor([code])).resolves.toEqual({
      isEnabled: false,
      isRequired: false,
      isInvited: true,
    });
  });

  it.each([RoleCode.SDIT_SISWA, RoleCode.SMPIT_SISWA, RoleCode.SMAQ_SISWA])(
    'not a santri (%s)',
    async (code) => {
      expect(invitesSecondFactor([code])).toBe(false);
      await expect(statusFor([code])).resolves.toMatchObject({ isInvited: false });
    }
  );

  it.each([RoleCode.SMPIT_KOMITE, RoleCode.SMAQ_ALUMNI])(
    'not a role the decision does not name (%s)',
    async (code) => {
      await expect(statusFor([code])).resolves.toMatchObject({ isInvited: false });
    }
  );

  it('not someone for whom 2FA is mandatory — they are sent to set it up', async () => {
    for (const code of [
      RoleCode.SMPIT_KEPALA_SEKOLAH,
      RoleCode.PESANTREN_PENGASUH,
      RoleCode.SDIT_ADMIN,
      RoleCode.YAYASAN_PEMBINA,
    ]) {
      await expect(statusFor([code])).resolves.toMatchObject({
        isRequired: true,
        isInvited: false,
      });
    }
    // A teacher who is also a kepala: mandatory wins over invited.
    await expect(
      statusFor([RoleCode.SDIT_GURU, RoleCode.SDIT_KEPALA_SEKOLAH])
    ).resolves.toMatchObject({ isRequired: true, isInvited: false });
  });

  it('no longer once 2FA is on', async () => {
    await expect(statusFor([RoleCode.SDIT_GURU], true)).resolves.toEqual({
      isEnabled: true,
      isRequired: false,
      isInvited: false,
    });
  });

  it('any active assignment counts: a santri who is also a wali is invited', async () => {
    await expect(statusFor([RoleCode.SMAQ_SISWA, RoleCode.SDIT_ORANG_TUA])).resolves.toMatchObject({
      isInvited: true,
    });
  });
});
