import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Token issuance re-validates the *persistent* account state inside the
 * transaction that creates the tokens — not only in the pre-flight read.
 *
 * A suspension that commits between the read and the OTP verification would
 * otherwise leave a fresh access + refresh pair for an account that was
 * switched off a moment earlier. The suspension deletes the refresh tokens it
 * can see; a token created after that delete survives it.
 */
const { prismaMock, verifyOtp } = vi.hoisted(() => {
  const prismaMock: any = {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    boardMemberSuspension: { findFirst: vi.fn() },
    refreshToken: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (cb: (tx: any) => unknown) => cb(prismaMock)),
  };
  return { prismaMock, verifyOtp: vi.fn().mockResolvedValue({ valid: true }) };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('otplib', () => ({ generateSecret: vi.fn(), generateURI: vi.fn(), verify: verifyOtp }));
vi.mock('qrcode', () => ({ toDataURL: vi.fn() }));
vi.mock('@/lib/password', () => ({ hashPassword: vi.fn(), comparePassword: vi.fn() }));
vi.mock('@/lib/jwt', () => ({
  generateTokenPair: vi.fn(() => ({ accessToken: 'a', refreshToken: 'r' })),
  verifyToken: vi.fn(),
  getExpirationDate: vi.fn(() => new Date('2030-01-01')),
  generateAccessToken: vi.fn(),
}));

import { AuthService } from '../auth.service';
import { verifyToken } from '@/lib/jwt';

const service = new AuthService();

const twoFaUser = {
  id: 'user-1',
  email: 'board@cipansor.or.id',
  isActive: true,
  deletedAt: null,
  isTwoFactorEnabled: true,
  twoFactorSecret: 'SECRET',
  unitId: null,
  role: null,
  userRoles: [
    {
      isPrimary: true,
      roleId: 'role-1',
      unitId: null,
      role: { code: 'YAYASAN_KETUA', permissions: [] },
    },
  ],
};

describe('AuthService.verifyTwoFactorLogin — suspension race', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findFirst.mockResolvedValue(twoFaUser);
    prismaMock.user.findUnique.mockResolvedValue({ isActive: true, deletedAt: null });
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
  });

  it('refuses to mint tokens when the account is off at issuance time', async () => {
    // Pre-flight saw a live account; the locked re-read inside the transaction
    // sees it switched off. No tokens may be created.
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.verifyTwoFactorLogin('user-1', '123456', true)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('does not mint a refresh token when an ACTIVE suspension exists at issuance', async () => {
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValueOnce({ id: 'susp-1' });

    await expect(service.verifyTwoFactorLogin('user-1', '123456', true)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('locks the user row before reading the suspension state', async () => {
    await service.verifyTwoFactorLogin('user-1', '123456', true);

    const sql = (prismaMock.$queryRaw as any).mock.calls[0][0].join(' ');
    expect(sql).toMatch(/FOR UPDATE/i);
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a temporary-token-less call before touching the database', async () => {
    await expect(service.verifyTwoFactorLogin('user-1', '123456', false)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

/**
 * A recovery code is validated and consumed in the same locked transaction that
 * mints the tokens — not by a raw UPDATE ahead of it.
 *
 * The old order deleted the code first: a suspension or deactivation landing
 * before token issuance refused the login but destroyed the code, locking the
 * operator out of an account that never actually let them in. And because the
 * delete was outside the row lock, two parallel redemptions of the same code
 * could both observe `ANY(...) = true` and both succeed.
 */
describe('AuthService.verifyTwoFactorLogin — recovery codes are consumed atomically', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findFirst.mockResolvedValue(twoFaUser);
    prismaMock.user.findUnique.mockResolvedValue({ isActive: true, deletedAt: null });
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
    verifyOtp.mockResolvedValue({ valid: false });
  });

  it('consumes a valid recovery code inside the locked transaction', async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(1);

    await service.verifyTwoFactorLogin('user-1', 'RECOVERY-CODE', true);

    const sql = (prismaMock.$executeRaw as any).mock.calls[0][0].join(' ');
    expect(sql).toMatch(/array_remove/i);
    // The lock is taken before the code is removed: a parallel redemption
    // cannot observe the code as still present.
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('does not consume a recovery code when the account is suspended at issuance', async () => {
    // The account was live at the pre-flight read; an ACTIVE suspension lands
    // before the locked re-read. The login must fail *and* the code must
    // survive, so the operator can retry once the suspension is lifted.
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValueOnce({ id: 'susp-1' });

    await expect(
      service.verifyTwoFactorLogin('user-1', 'RECOVERY-CODE', true)
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('does not consume a recovery code when the locked re-read finds the account off', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.verifyTwoFactorLogin('user-1', 'RECOVERY-CODE', true)
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects an unknown code and mints no tokens', async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(0);

    await expect(service.verifyTwoFactorLogin('user-1', 'NOT-A-CODE', true)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('falls through to the recovery-code path when otplib throws on a malformed token', async () => {
    // otplib v13 throws `TokenLengthError` for a non-6-digit token; that must
    // not surface as a 500 and must not skip the recovery-code fallback.
    verifyOtp.mockRejectedValueOnce(new Error('Token must be 6 digits, got 10'));
    prismaMock.$executeRaw.mockResolvedValueOnce(1);

    await service.verifyTwoFactorLogin('user-1', 'ABCDEF1234', true);

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('never touches recovery codes when the TOTP itself is valid', async () => {
    verifyOtp.mockResolvedValueOnce({ valid: true });

    await service.verifyTwoFactorLogin('user-1', '123456', true);

    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService.refreshToken — rotation under suspension', () => {
  const storedToken = {
    id: 'rt-1',
    token: 'refresh-token',
    user: {
      id: 'user-1',
      email: 'board@cipansor.or.id',
      unitId: null,
      role: null,
      userRoles: [
        {
          isPrimary: true,
          roleId: 'role-1',
          unitId: null,
          role: { code: 'YAYASAN_KETUA', permissions: [] },
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isActive: true, deletedAt: null });
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);
    prismaMock.refreshToken.findFirst.mockResolvedValue(storedToken);
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.refreshToken.delete.mockResolvedValue({});
    prismaMock.academicYear.findFirst.mockResolvedValue(null);
    (verifyToken as any).mockReturnValue({ sub: 'user-1', type: 'refresh' });
  });

  it('rotates the token inside a locking transaction', async () => {
    const tokens = await service.refreshToken('refresh-token');

    expect(tokens).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
    const sql = (prismaMock.$queryRaw as any).mock.calls[0][0].join(' ');
    expect(sql).toMatch(/FOR UPDATE/i);
    expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('refuses when the account was switched off before the transaction', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ isActive: false, deletedAt: null });

    await expect(service.refreshToken('refresh-token')).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses when the locked re-read finds the account off', async () => {
    // The pre-check saw a live account; the suspension commits before the
    // rotation's row lock is taken, so no replacement token is minted.
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.refreshToken('refresh-token')).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.refreshToken.delete).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses when an ACTIVE suspension exists at rotation time', async () => {
    prismaMock.boardMemberSuspension.findFirst.mockResolvedValueOnce({ id: 'susp-1' });

    await expect(service.refreshToken('refresh-token')).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});
