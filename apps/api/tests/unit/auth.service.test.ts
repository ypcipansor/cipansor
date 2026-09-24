/**
 * Auth Service Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserRole, RoleCode } from '@prisma/client';

// Use vi.hoisted to define mocks that will be available in vi.mock factories
const {
  mockPrisma,
  mockComparePassword,
  mockHashPassword,
  mockGenerateTokenPair,
  mockVerifyToken,
  mockGetExpirationDate,
  mockUserRole,
  mockRoleCode,
  mockGenerateSecret,
  mockGenerateURI,
  mockVerifyOtp,
  mockToDataURL,
} = vi.hoisted(() => {
  return {
    mockPrisma: {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      academicYear: {
        findFirst: vi.fn(),
      },
      refreshToken: {
        create: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      unit: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      role: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      userRoleAssignment: {
        create: vi.fn(),
        // The session-issuing paths re-read the effective assignment under the
        // assignment-row lock, so every issuance test needs this query.
        findMany: vi.fn(),
        findFirst: vi.fn(),
        // The legacy-role fallback only applies to an account with no
        // assignment *rows at all*, so issuance counts them too.
        count: vi.fn(),
      },
      boardMemberSuspension: {
        findFirst: vi.fn(),
      },
      // refreshToken() re-asserts the account state under a row lock before
      // rotating; the register()/2FA transaction runs its callback against the
      // mock client below.
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    },
    mockComparePassword: vi.fn(),
    mockHashPassword: vi.fn().mockResolvedValue('hashed-password'),
    mockGenerateTokenPair: vi.fn().mockReturnValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
    mockVerifyToken: vi.fn(),
    mockGetExpirationDate: vi.fn().mockReturnValue(new Date(Date.now() + 86400000)),
    mockUserRole: {
      SUPER_ADMIN: 'SUPER_ADMIN',
      UNIT_ADMIN: 'UNIT_ADMIN',
      TEACHER: 'TEACHER',
      STAFF: 'STAFF',
      STUDENT: 'STUDENT',
      PARENT: 'PARENT',
    },
    mockRoleCode: {
      SUPER_ADMIN: 'SUPER_ADMIN',
      TKQ_ADMIN: 'TKQ_ADMIN',
      SDIT_ADMIN: 'SDIT_ADMIN',
      SMPIT_ADMIN: 'SMPIT_ADMIN',
      SMAQ_ADMIN: 'SMAQ_ADMIN',
      UNIT_ADMIN: 'UNIT_ADMIN',
    },
    mockGenerateSecret: vi.fn(() => 'GENERATED_SECRET'),
    mockGenerateURI: vi.fn(
      () => 'otpauth://totp/Cipansor%20App:test@example.com?secret=GENERATED_SECRET'
    ),
    mockVerifyOtp: vi.fn(),
    mockToDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRCODE'),
  };
});

// Mock modules after hoisted definitions
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// NOTE: @prisma/client is intentionally NOT mocked — the real generated enums
// (UserRole/RoleCode/UnitType) are needed so the RoleCode legacy mapping in
// middleware/auth resolves correctly.

vi.mock('@/lib/password', () => ({
  hashPassword: mockHashPassword,
  comparePassword: mockComparePassword,
}));

vi.mock('@/lib/jwt', () => ({
  // Short-lived token handed out while the second factor is pending.
  generateAccessToken: vi.fn(() => 'mock-temp-token'),
  generateTokenPair: mockGenerateTokenPair,
  verifyToken: mockVerifyToken,
  getExpirationDate: mockGetExpirationDate,
}));

vi.mock('@/config', () => ({
  config: {
    env: 'test',
    port: 3001,
    jwt: {
      secret: 'test-secret',
      expiresIn: '7d',
      refreshExpiresIn: '7d',
    },
    bcrypt: {
      saltRounds: 10,
    },
    cors: {
      origin: 'http://localhost:3000',
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100,
    },
    log: {
      level: 'error',
    },
  },
}));

// otplib (functional API) and qrcode are used by the 2FA flow.
vi.mock('otplib', () => ({
  generateSecret: mockGenerateSecret,
  generateURI: mockGenerateURI,
  verify: mockVerifyOtp,
}));

vi.mock('qrcode', () => ({
  toDataURL: mockToDataURL,
}));

// Import after mocking
import { AuthService } from '@/modules/auth/auth.service';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService();
    // The transactions (register, refresh rotation, 2FA issuance) simply run
    // their callback against the mock client.
    (mockPrisma.$transaction as any).mockImplementation(async (cb: any) => cb(mockPrisma));
    // The account-state re-assertion returns the claimed row by default.
    (mockPrisma.$queryRaw as any).mockResolvedValue([{ id: 'user-1' }]);
    // Token-issuing paths re-read the persistent account state before minting.
    (mockPrisma.user.findUnique as any).mockResolvedValue({
      isActive: true,
      deletedAt: null,
    });
    (mockPrisma.boardMemberSuspension.findFirst as any).mockResolvedValue(null);
    // Session issuance re-reads the effective assignment under the lock. A
    // generic active assignment satisfies the happy paths; tests that exercise
    // a revoked role override it with `[]`.
    (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValue([
      {
        isPrimary: true,
        roleId: 'role-id-1',
        unitId: 'unit-1',
        role: { code: 'STUDENT', permissions: [] },
      },
    ]);
    // The happy-path account holds an assignment, so the legacy-role fallback
    // never applies. Tests that exercise the fallback override this.
    (mockPrisma.userRoleAssignment.count as any).mockResolvedValue(1);
  });

  describe('login', () => {
    const validLoginInput = {
      email: 'test@example.com',
      password: 'password123',
    };

    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed-password',
      role: UserRole.STUDENT,
      unitId: 'unit-1',
      isActive: true,
      unit: { id: 'unit-1', name: 'Test Unit' },
      userRoles: [
        {
          id: 'role-1',
          roleId: 'role-id-1',
          isPrimary: true,
          isActive: true,
          role: { id: 'role-id-1', name: 'Student', code: 'STUDENT' },
          unit: { id: 'unit-1', name: 'Test Unit' },
        },
      ],
    };

    it('should successfully login with valid credentials', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.login(validLoginInput);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect((result as any).user.email).toBe('test@example.com');
      expect((result as any).user).toHaveProperty('academicYearId', 'ay-1');
      expect((result as any).user).not.toHaveProperty('passwordHash');
    });

    it('strips all sensitive fields from the returned user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed-password',
        twoFactorSecret: 'SECRET',
        twoFactorSecretPending: 'PENDING',
        twoFactorRecoveryCodes: ['CODE1'],
        resetTokenHash: 'reset-hash',
        resetTokenExpiresAt: new Date(),
      });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const { user } = (await authService.login(validLoginInput)) as any;

      for (const field of [
        'passwordHash',
        'twoFactorSecret',
        'twoFactorSecretPending',
        'twoFactorRecoveryCodes',
        'resetTokenHash',
        'resetTokenExpiresAt',
      ]) {
        expect(user).not.toHaveProperty(field);
      }
    });

    it('should throw error for non-existent email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(authService.login(validLoginInput)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for deactivated account', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(authService.login(validLoginInput)).rejects.toThrow('Account is deactivated');
    });

    it('should throw error for incorrect password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(false);

      await expect(authService.login(validLoginInput)).rejects.toThrow('Invalid email or password');
    });

    // DEMO_MODE used to waive the second factor for every account, Super Admin
    // included, while the seeded passwords sat in a public repository. It was
    // removed; these pin that a stray DEMO_MODE=true no longer opens anything.
    describe('no demo exemption from 2FA', () => {
      const original = process.env.DEMO_MODE;
      beforeEach(() => {
        process.env.DEMO_MODE = 'true';
        mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
        mockComparePassword.mockResolvedValue(true);
        mockPrisma.refreshToken.create.mockResolvedValue({});
      });
      afterEach(() => {
        if (original === undefined) delete process.env.DEMO_MODE;
        else process.env.DEMO_MODE = original;
      });

      it('forces 2FA setup on an admin without it, even with DEMO_MODE=true', async () => {
        const admin = {
          ...mockUser,
          role: UserRole.SUPER_ADMIN,
          isTwoFactorEnabled: false,
          userRoles: [
            {
              ...mockUser.userRoles[0],
              role: { id: 'role-sa', name: 'Super Admin', code: 'SUPER_ADMIN' },
            },
          ],
        };
        mockPrisma.user.findFirst.mockResolvedValue(admin);
        mockPrisma.user.update.mockResolvedValue(admin);

        const result = (await authService.login(validLoginInput)) as any;

        expect(result.requiresTwoFactorSetup).toBe(true);
        expect(result).not.toHaveProperty('accessToken');
        expect(result).not.toHaveProperty('refreshToken');
      });

      it('asks for the second factor when 2FA is enabled, even with DEMO_MODE=true', async () => {
        const enrolled = { ...mockUser, isTwoFactorEnabled: true, twoFactorSecret: 'SECRET' };
        mockPrisma.user.findFirst.mockResolvedValue(enrolled);
        mockPrisma.user.update.mockResolvedValue(enrolled);

        const result = (await authService.login(validLoginInput)) as any;

        expect(result.requiresTwoFactor).toBe(true);
        expect(result).not.toHaveProperty('accessToken');
      });
    });
  });

  describe('register', () => {
    const baseInput = {
      name: 'New User',
      email: 'newuser@example.com',
      password: 'password123',
    };

    // Common happy-path lookups: the target unit and the requested role exist.
    const setupLookups = (code: RoleCode) => {
      (mockPrisma.unit.findUnique as any).mockResolvedValue({ type: 'SD_IT' });
      (mockPrisma.role.findFirst as any).mockResolvedValue({
        id: 'role-1',
        code,
        isActive: true,
        permissions: [],
      });
    };

    it('should successfully register a new user', async () => {
      setupLookups(RoleCode.SDIT_GURU);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        name: baseInput.name,
        email: baseInput.email,
        role: UserRole.TEACHER,
        unitId: 'unit-1',
        passwordHash: 'hashed-password',
        isActive: true,
      });
      (mockPrisma.userRoleAssignment.create as any).mockResolvedValue({ id: 'ura-1' });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });

      const result = await authService.register(
        { ...baseInput, roleCode: RoleCode.SDIT_GURU, unitId: 'unit-1' },
        RoleCode.SUPER_ADMIN
      );

      expect(result).toHaveProperty('id');
      expect(result.email).toBe('newuser@example.com');
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockHashPassword).toHaveBeenCalledWith('password123');
    });

    it('should throw error when email already exists', async () => {
      setupLookups(RoleCode.SDIT_GURU);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(
        authService.register(
          { ...baseInput, roleCode: RoleCode.SDIT_GURU, unitId: 'unit-1' },
          RoleCode.SUPER_ADMIN
        )
      ).rejects.toThrow('Email already registered');
    });

    it('should prevent non-super-admin from creating super-admin', async () => {
      (mockPrisma.role.findFirst as any).mockResolvedValue({
        id: 'role-sa',
        code: RoleCode.SUPER_ADMIN,
        isActive: true,
        permissions: [],
      });

      await expect(
        authService.register({ ...baseInput, roleCode: RoleCode.SUPER_ADMIN }, RoleCode.SDIT_ADMIN)
      ).rejects.toThrow('Only Super Admin can create Super Admin');
    });

    it('should require unit for non-super-admin roles', async () => {
      setupLookups(RoleCode.SDIT_GURU);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        authService.register({ ...baseInput, roleCode: RoleCode.SDIT_GURU }, RoleCode.SUPER_ADMIN)
      ).rejects.toThrow('Unit is required for this role');
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const mockStoredToken = {
        id: 'token-1',
        token: 'valid-refresh-token',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000),
        user: {
          id: 'user-1',
          email: 'test@example.com',
          role: UserRole.SUPER_ADMIN,
          unitId: 'unit-1',
          isActive: true,
          // refreshToken() reads the primary role assignment to mint new tokens.
          userRoles: [
            {
              isPrimary: true,
              roleId: 'role-1',
              unitId: 'unit-1',
              role: { code: RoleCode.SUPER_ADMIN, permissions: [] },
            },
          ],
        },
      };

      mockVerifyToken.mockReturnValue({
        sub: 'user-1',
        type: 'refresh',
      });
      mockPrisma.refreshToken.findFirst.mockResolvedValue(mockStoredToken);
      // Rotation consumes the presented row with a conditional `deleteMany`, so
      // the loser of a concurrent refresh is identified by rowcount rather than
      // crashing on P2025.
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.refreshToken('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw error for invalid token type', async () => {
      mockVerifyToken.mockReturnValue({
        sub: 'user-1',
        type: 'access',
      });

      await expect(authService.refreshToken('invalid-type-token')).rejects.toThrow(
        'Invalid token type'
      );
    });

    it('rejects a user left with no role and a nulled legacy role by the PT purge', async () => {
      // What the decommission migration produces for a PT-only user: their
      // assignment is gone and `users.role` was set to NULL (the legacy
      // UserRole enum has no PT member, so it previously held e.g. TEACHER and
      // kept the session alive). With both empty, refresh must reject.
      mockVerifyToken.mockReturnValue({ sub: 'user-pt', type: 'refresh' });
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'token-pt',
        token: 'pt-refresh-token',
        userId: 'user-pt',
        expiresAt: new Date(Date.now() + 86400000),
        user: {
          id: 'user-pt',
          email: 'pt@example.com',
          role: null,
          unitId: null,
          isActive: true,
          userRoles: [],
        },
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      // The decommission purge removed the assignment as well; nothing qualifies.
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([]);
      (mockPrisma.userRoleAssignment.count as any).mockResolvedValueOnce(0);

      await expect(authService.refreshToken('pt-refresh-token')).rejects.toThrow(
        'No active role assignment found'
      );
      // The token is consumed, but no new one is minted.
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a user whose assignment rows remain but are all inactive, despite a live legacy role', async () => {
      // CWE-863: `removeRoleAssignment` used to delete only the assignment row,
      // leaving the deprecated `users.role` column behind. Refresh fell back to
      // it and re-minted the very role that was revoked — a revoked SUPER_ADMIN
      // kept renewing sessions. The fallback is now gated on the account holding
      // no assignment rows at all; an inactive row keeps the count above zero,
      // so the role fails closed.
      mockVerifyToken.mockReturnValue({ sub: 'user-revoked', type: 'refresh' });
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'token-revoked',
        token: 'revoked-refresh-token',
        userId: 'user-revoked',
        expiresAt: new Date(Date.now() + 86400000),
        user: {
          id: 'user-revoked',
          email: 'revoked@example.com',
          role: UserRole.SUPER_ADMIN,
          unitId: null,
          isActive: true,
          userRoles: [],
        },
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([]);
      // A revoked-but-not-deleted row is still a row.
      (mockPrisma.userRoleAssignment.count as any).mockResolvedValueOnce(1);

      await expect(authService.refreshToken('revoked-refresh-token')).rejects.toThrow(
        'No active role assignment found'
      );
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a user whose assignments all expired, despite a live legacy role', async () => {
      // An assignment that expired is not "no assignment ever held": the
      // fallback must not resurrect the coarse legacy role. The count is of
      // *all* rows, so the expired row keeps it above zero.
      mockVerifyToken.mockReturnValue({ sub: 'user-expired', type: 'refresh' });
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'token-expired',
        token: 'expired-refresh-token',
        userId: 'user-expired',
        expiresAt: new Date(Date.now() + 86400000),
        user: {
          id: 'user-expired',
          email: 'expired@example.com',
          role: UserRole.SUPER_ADMIN,
          unitId: null,
          isActive: true,
          userRoles: [],
        },
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([]);
      (mockPrisma.userRoleAssignment.count as any).mockResolvedValueOnce(1);

      await expect(authService.refreshToken('expired-refresh-token')).rejects.toThrow(
        'No active role assignment found'
      );
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('still refreshes a genuine legacy account that never held an assignment', async () => {
      // The fallback has to keep working for the unmigrated case it exists for:
      // zero assignment rows, no active assignment, but a legacy `users.role`.
      mockVerifyToken.mockReturnValue({ sub: 'user-legacy', type: 'refresh' });
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'token-legacy',
        token: 'legacy-refresh-token',
        userId: 'user-legacy',
        expiresAt: new Date(Date.now() + 86400000),
        user: {
          id: 'user-legacy',
          email: 'legacy@example.com',
          role: UserRole.SUPER_ADMIN,
          unitId: null,
          isActive: true,
          userRoles: [],
        },
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({});
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([]);
      (mockPrisma.userRoleAssignment.count as any).mockResolvedValueOnce(0);

      const result = await authService.refreshToken('legacy-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  /**
   * Reviewer finding 1 (CWE-863): a session must be minted from the assignment
   * that exists at the commit point, not from the snapshot read before the
   * transaction opened. A revocation landing between the two used to leave the
   * new access + refresh pair stamped with a role the user no longer held.
   */
  describe('session issuance re-derives the role under the lock', () => {
    const validLoginInput = { email: 'test@example.com', password: 'password123' };
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed-password',
      role: UserRole.TEACHER,
      unitId: 'unit-1',
      isActive: true,
      isTwoFactorEnabled: false,
      unit: { id: 'unit-1', name: 'Test Unit' },
      userRoles: [
        {
          id: 'role-1',
          roleId: 'role-id-1',
          isPrimary: true,
          isActive: true,
          role: { id: 'role-id-1', name: 'Guru', code: 'SDIT_GURU' },
          unit: { id: 'unit-1', name: 'Test Unit' },
        },
      ],
    };

    it('login refuses and mints nothing when the assignment is gone by commit', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      // The pre-lock snapshot saw the SUPER_ADMIN assignment; by the time the
      // locked re-read runs it has been revoked. No token may carry it.
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([]);

      await expect(authService.login(validLoginInput)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockGenerateTokenPair).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('refresh refuses and mints nothing when the assignment is gone by commit', async () => {
      mockVerifyToken.mockReturnValue({ sub: 'user-1', type: 'refresh' });
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        token: 'valid-refresh-token',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000),
        // Legacy role null so the fallback cannot mask the missing assignment.
        user: { id: 'user-1', email: 'test@example.com', role: null, unitId: 'unit-1' },
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([]);

      await expect(authService.refreshToken('valid-refresh-token')).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockGenerateTokenPair).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('login refuses when an admin assignment becomes primary under the lock without 2FA', async () => {
      // The password step authenticated an ordinary (STUDENT) role, so the
      // snapshot decided no second factor was required. By commit the lock sees
      // the SUPER_ADMIN assignment primary and 2FA off. Minting now would hand
      // out an admin session with no second factor (CWE-287), so it must be
      // refused and leave no refresh token.
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      (mockPrisma.user.findUnique as any).mockResolvedValue({ isTwoFactorEnabled: false });
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([
        {
          isPrimary: true,
          // Same row as the snapshot — the role's *code* was edited to an admin
          // one, so the role-change guard cannot catch this and the 2FA
          // re-check is the branch that must.
          roleId: 'role-id-1',
          unitId: null,
          role: { id: 'role-id-1', code: 'SUPER_ADMIN', permissions: [] },
        },
      ]);

      await expect(authService.login(validLoginInput)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mockGenerateTokenPair).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('login refuses when the role differs from the password-verified snapshot', async () => {
      // A role change between the password check and the commit means this
      // request's authentication no longer describes the session it would mint,
      // so it is refused for any role — not just admin ones.
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      (mockPrisma.user.findUnique as any).mockResolvedValue({ isTwoFactorEnabled: true });
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce([
        {
          isPrimary: true,
          roleId: 'role-bendahara',
          unitId: null,
          role: { id: 'role-bendahara', code: 'YAYASAN_BENDAHARA', permissions: [] },
        },
      ]);

      await expect(authService.login(validLoginInput)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mockGenerateTokenPair).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('returns userRoles from the locked read so the response matches the token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      (mockPrisma.user.findUnique as any).mockResolvedValue({ isTwoFactorEnabled: false });
      const liveAssignments = [
        {
          isPrimary: true,
          roleId: 'role-id-1',
          unitId: 'unit-9',
          role: { id: 'role-id-1', code: 'SDIT_GURU', permissions: ['x'] },
        },
      ];
      (mockPrisma.userRoleAssignment.findMany as any).mockResolvedValueOnce(liveAssignments);

      const result = (await authService.login(validLoginInput)) as any;

      // The response must advertise the role the token carries, not the
      // pre-lock snapshot — the web derives its primary role from this field.
      expect(result.user.userRoles).toEqual(liveAssignments);
      expect(result.user.userRoles[0].role.code).toBe('SDIT_GURU');
    });
  });

  describe('logout', () => {
    it('should delete specific refresh token when provided', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await authService.logout('user-1', 'specific-token');

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          token: 'specific-token',
        },
      });
    });

    it('should delete all refresh tokens when no specific token provided', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      await authService.logout('user-1');

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('getCurrentUser', () => {
    it('should return user without password hash', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed-password',
        role: UserRole.SUPER_ADMIN,
        unitId: 'unit-1',
        unit: { id: 'unit-1', name: 'Test Unit' },
        student: null,
        userRoles: [],
      };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });

      const result = await authService.getCurrentUser('user-1');

      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('academicYearId', 'ay-1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should not leak the accountStateWriter ownership marker', async () => {
      // `accountStateWriter` records which writer owns the current `isActive`,
      // so the suspension lift can tell its own deactivation from a later admin
      // one. It is server-side bookkeeping: not part of the shared `User` DTO,
      // and shipping it spent bytes the web's `auth-storage` cookie does not
      // have (see apps/web/src/lib/auth-cookie.ts).
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed-password',
        role: UserRole.SUPER_ADMIN,
        unitId: 'unit-1',
        unit: { id: 'unit-1', name: 'Test Unit' },
        student: null,
        userRoles: [],
        accountStateWriter: 'suspension:abc-123',
      };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });

      const result = await authService.getCurrentUser('user-1');

      expect(result).not.toHaveProperty('accountStateWriter');
      expect(result).toHaveProperty('email');
    });

    it('should throw error for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(authService.getCurrentUser('invalid-user')).rejects.toThrow();
    });
  });

  describe('changePassword', () => {
    const changePasswordInput = {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    };

    it('should successfully change password', async () => {
      const mockUser = {
        id: 'user-1',
        passwordHash: 'old-hash',
      };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({});

      const result = await authService.changePassword('user-1', changePasswordInput);

      expect(result.message).toBe('Password changed successfully');
      expect(mockHashPassword).toHaveBeenCalledWith('new-password');
    });

    it('should throw error for incorrect current password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', passwordHash: 'hash' });
      mockComparePassword.mockResolvedValue(false);

      await expect(authService.changePassword('user-1', changePasswordInput)).rejects.toThrow(
        'Current password is incorrect'
      );
    });
  });

  describe('generateTwoFactorSecret', () => {
    it('generates a secret + QR code and stores the pending secret server-side', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isTwoFactorEnabled: false,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await authService.generateTwoFactorSecret('user-1');

      expect(result).toEqual({
        secret: 'GENERATED_SECRET',
        qrCodeUrl: 'data:image/png;base64,QRCODE',
      });
      expect(mockGenerateURI).toHaveBeenCalledWith({
        issuer: 'Cipansor App',
        label: 'test@example.com',
        secret: 'GENERATED_SECRET',
      });
      // The pending secret must be persisted so verification is server-side.
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorSecretPending: 'GENERATED_SECRET' },
      });
    });

    it('throws for a non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.generateTwoFactorSecret('ghost')).rejects.toThrow();
    });

    it('refuses to re-provision when 2FA is already enabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        isTwoFactorEnabled: true,
      });

      await expect(authService.generateTwoFactorSecret('user-1')).rejects.toThrow(
        '2FA is already enabled'
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('enableTwoFactor', () => {
    it('enables 2FA and returns recovery codes when the OTP is valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isTwoFactorEnabled: false,
        twoFactorSecretPending: 'PENDING_SECRET',
      });
      mockVerifyOtp.mockResolvedValue({ valid: true });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await authService.enableTwoFactor('user-1', '123456');

      expect(mockVerifyOtp).toHaveBeenCalledWith({ token: '123456', secret: 'PENDING_SECRET' });
      expect(result.recoveryCodes).toHaveLength(10);
      // The pending secret is promoted to the active secret and cleared.
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isTwoFactorEnabled: true,
          twoFactorSecret: 'PENDING_SECRET',
          twoFactorSecretPending: null,
          twoFactorRecoveryCodes: expect.any(Array),
        }),
      });
    });

    it('rejects when there is no pending 2FA setup', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isTwoFactorEnabled: false,
        twoFactorSecretPending: null,
      });

      await expect(authService.enableTwoFactor('user-1', '123456')).rejects.toThrow(
        'No pending 2FA setup found'
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid OTP and does not enable 2FA', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isTwoFactorEnabled: false,
        twoFactorSecretPending: 'PENDING_SECRET',
      });
      mockVerifyOtp.mockResolvedValue({ valid: false });

      await expect(authService.enableTwoFactor('user-1', '000000')).rejects.toThrow(
        'Invalid OTP code'
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses when 2FA is already enabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isTwoFactorEnabled: true,
        twoFactorSecretPending: 'PENDING_SECRET',
      });

      await expect(authService.enableTwoFactor('user-1', '123456')).rejects.toThrow(
        '2FA is already enabled'
      );
    });
  });

  describe('disableTwoFactor', () => {
    it('lets a non-admin user disable their own 2FA with a valid OTP', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: UserRole.STUDENT,
        unitId: 'unit-1',
        isTwoFactorEnabled: true,
        twoFactorSecret: 'ACTIVE_SECRET',
        userRoles: [{ isPrimary: true, role: { code: RoleCode.SDIT_SISWA } }],
      });
      mockVerifyOtp.mockResolvedValue({ valid: true });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await authService.disableTwoFactor('user-1', '123456');

      expect(result.message).toBe('2FA disabled successfully');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isTwoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorSecretPending: null,
          twoFactorRecoveryCodes: [],
        }),
      });
    });

    it('prevents an admin from self-disabling 2FA on their own account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: UserRole.UNIT_ADMIN,
        unitId: 'unit-1',
        isTwoFactorEnabled: true,
        twoFactorSecret: 'ACTIVE_SECRET',
        userRoles: [{ isPrimary: true, role: { code: RoleCode.SDIT_ADMIN } }],
      });

      await expect(authService.disableTwoFactor('admin-1', '123456')).rejects.toThrow(
        '2FA cannot be disabled for Admin accounts'
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid OTP when a user disables their own 2FA', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: UserRole.STUDENT,
        unitId: 'unit-1',
        isTwoFactorEnabled: true,
        twoFactorSecret: 'ACTIVE_SECRET',
        userRoles: [{ isPrimary: true, role: { code: RoleCode.SDIT_SISWA } }],
      });
      mockVerifyOtp.mockResolvedValue({ valid: false });

      await expect(authService.disableTwoFactor('user-1', '000000')).rejects.toThrow('Invalid OTP');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getTwoFactorStatus', () => {
    it('reports the enabled flag', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ isTwoFactorEnabled: true });

      const result = await authService.getTwoFactorStatus('user-1');

      expect(result).toEqual({ isEnabled: true });
    });

    it('throws for a non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.getTwoFactorStatus('ghost')).rejects.toThrow();
    });
  });
});
