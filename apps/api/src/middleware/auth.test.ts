import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { RoleCode, UserRole } from '@prisma/client';

// Mock infra so importing the middleware has no side effects (no DB/redis/jwt).
vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    teacher: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(), setex: vi.fn() } }));

import {
  authorize,
  isAdmin,
  isSuperAdmin,
  isTeacherOrAbove,
  sameUnit,
  deriveLegacyRole,
  isAdminRoleCode,
  isGovernanceRoleCode,
  requireUser,
  requireStudentId,
  findStudentIdForUser,
  findTeacherIdForUser,
} from './auth';
import { prisma } from '@/lib/prisma';

// Minimal express mocks
const makeRes = () => ({}) as Response;
const makeReq = (user?: Record<string, unknown>, extra?: Partial<Request>) =>
  ({ user, params: {}, body: {}, query: {}, ...extra }) as unknown as Request;

const lastError = (next: ReturnType<typeof vi.fn>) => next.mock.calls[0]?.[0];

describe('middleware/auth RBAC', () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
  });

  describe('pure role helpers', () => {
    it('deriveLegacyRole maps granular RoleCodes to legacy UserRole', () => {
      expect(deriveLegacyRole(RoleCode.SDIT_ADMIN)).toBe('UNIT_ADMIN');
      expect(deriveLegacyRole(RoleCode.SDIT_GURU)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.SUPER_ADMIN)).toBe('SUPER_ADMIN');
    });

    it('deriveLegacyRole maps the expanded hierarchy roles (rebuilt #319)', () => {
      // Granular school roles
      expect(deriveLegacyRole(RoleCode.SDIT_WAKASEK)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.SMPIT_WALI_KELAS)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.SMAQ_GURU_BK)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.TKQ_BENDAHARA)).toBe('STAFF');
      // Pesantren leadership + gender-segregated pembina
      expect(deriveLegacyRole(RoleCode.PESANTREN_PENGASUH)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.USTADZ)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.MUSYRIFAH)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.MUHAFIDZAH)).toBe('TEACHER');
      expect(deriveLegacyRole(RoleCode.PESANTREN_TATA_USAHA)).toBe('STAFF');
      // Business units map to STAFF — never to an admin bucket
      expect(deriveLegacyRole(RoleCode.BUSINESS_MANAGER)).toBe('STAFF');
      expect(deriveLegacyRole(RoleCode.BUSINESS_STAFF)).toBe('STAFF');
      // Cross-unit support staff (library/UKS/security/labs)
      expect(deriveLegacyRole(RoleCode.PUSTAKAWAN)).toBe('STAFF');
      expect(deriveLegacyRole(RoleCode.PERAWAT)).toBe('STAFF');
      expect(deriveLegacyRole(RoleCode.KEAMANAN)).toBe('STAFF');
      expect(deriveLegacyRole(RoleCode.LABORAN)).toBe('STAFF');
      // Komite/alumni are deliberately unmapped: fall back to the code itself
      expect(deriveLegacyRole(RoleCode.SDIT_KOMITE)).toBe(RoleCode.SDIT_KOMITE);
      // SDIT_ALUMNI was the second example here; primary-school alumni no
      // longer have a role, so SMPIT_ALUMNI now stands in for the alumni case.
      expect(deriveLegacyRole(RoleCode.SMPIT_ALUMNI)).toBe(RoleCode.SMPIT_ALUMNI);
    });

    it('business administration roles are NOT system admins', () => {
      expect(isAdminRoleCode(RoleCode.BUSINESS_MANAGER)).toBe(false);
      expect(isAdminRoleCode(RoleCode.PESANTREN_PENGASUH)).toBe(false);
    });

    it('isAdminRoleCode recognises per-unit admins but not teachers/governance', () => {
      expect(isAdminRoleCode(RoleCode.SUPER_ADMIN)).toBe(true);
      expect(isAdminRoleCode(RoleCode.SDIT_ADMIN)).toBe(true);
      expect(isAdminRoleCode(RoleCode.SDIT_GURU)).toBe(false);
      expect(isAdminRoleCode(RoleCode.YAYASAN_PEMBINA)).toBe(false);
    });

    it('isGovernanceRoleCode recognises Yayasan governance roles', () => {
      expect(isGovernanceRoleCode(RoleCode.YAYASAN_PEMBINA)).toBe(true);
      expect(isGovernanceRoleCode(RoleCode.YAYASAN_PENGAWAS)).toBe(true);
      expect(isGovernanceRoleCode(RoleCode.SDIT_ADMIN)).toBe(false);
    });
  });

  describe('authorize() legacy forward expansion', () => {
    it('allows an exact RoleCode match', () => {
      authorize(RoleCode.SDIT_ADMIN)(
        makeReq({ roleCode: RoleCode.SDIT_ADMIN }),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(next).toHaveBeenCalledWith();
    });

    it('forward-expands a legacy role: authorize(UNIT_ADMIN) admits a per-unit admin', () => {
      authorize(UserRole.UNIT_ADMIN)(
        makeReq({ roleCode: RoleCode.SDIT_ADMIN }),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(next).toHaveBeenCalledWith();
    });

    it('no reverse expansion: tokens always carry a real RoleCode, so a raw bucket string is denied', () => {
      authorize(RoleCode.SDIT_ADMIN)(
        makeReq({ roleCode: 'UNIT_ADMIN' }),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(lastError(next)).toBeDefined();
      expect(lastError(next).statusCode).toBe(403);
    });

    it('denies an insufficient role with FORBIDDEN', () => {
      authorize(RoleCode.SDIT_ADMIN)(
        makeReq({ roleCode: RoleCode.SDIT_GURU }),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(lastError(next)).toBeDefined();
      expect(lastError(next).statusCode).toBe(403);
    });

    it('rejects an unauthenticated request with UNAUTHORIZED', () => {
      authorize(RoleCode.SDIT_ADMIN)(
        makeReq(undefined),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(lastError(next).statusCode).toBe(401);
    });
  });

  describe('role-level guards', () => {
    it('isSuperAdmin only admits SUPER_ADMIN', () => {
      isSuperAdmin(
        makeReq({ roleCode: RoleCode.SUPER_ADMIN }),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(next).toHaveBeenCalledWith();
      const n2 = vi.fn();
      isSuperAdmin(
        makeReq({ roleCode: RoleCode.SDIT_ADMIN }),
        makeRes(),
        n2 as unknown as NextFunction
      );
      expect(n2.mock.calls[0][0].statusCode).toBe(403);
    });

    it('isAdmin admits admin-level roles but not teachers', () => {
      isAdmin(
        makeReq({ roleCode: RoleCode.SDIT_ADMIN }),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(next).toHaveBeenCalledWith();
      const n2 = vi.fn();
      isAdmin(makeReq({ roleCode: RoleCode.SDIT_GURU }), makeRes(), n2 as unknown as NextFunction);
      expect(n2.mock.calls[0][0].statusCode).toBe(403);
    });

    it('isTeacherOrAbove admits teachers and admins, denies students', () => {
      isTeacherOrAbove(
        makeReq({ roleCode: RoleCode.SDIT_GURU }),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(next).toHaveBeenCalledWith();
      const n2 = vi.fn();
      isTeacherOrAbove(
        makeReq({ roleCode: RoleCode.SDIT_SISWA }),
        makeRes(),
        n2 as unknown as NextFunction
      );
      expect(n2.mock.calls[0][0].statusCode).toBe(403);
    });

    it('isTeacherOrAbove admits the expanded educator roles, denies business staff', () => {
      for (const code of [
        RoleCode.SDIT_WAKASEK,
        RoleCode.SMPIT_WALI_KELAS,
        RoleCode.SMAQ_GURU_BK,
        RoleCode.USTADZ,
        RoleCode.MUSYRIFAH,
        RoleCode.MUHAFIDZAH,
        RoleCode.PESANTREN_PENGASUH,
      ]) {
        const n = vi.fn();
        isTeacherOrAbove(makeReq({ roleCode: code }), makeRes(), n as unknown as NextFunction);
        expect(n, code).toHaveBeenCalledWith();
      }
      const denied = vi.fn();
      isTeacherOrAbove(
        makeReq({ roleCode: RoleCode.BUSINESS_STAFF }),
        makeRes(),
        denied as unknown as NextFunction
      );
      expect(denied.mock.calls[0][0].statusCode).toBe(403);
    });
  });

  describe('sameUnit()', () => {
    it('lets SUPER_ADMIN access any unit', () => {
      sameUnit('unitId')(
        makeReq(
          { roleCode: RoleCode.SUPER_ADMIN, unitId: 'unit-a' },
          { params: { unitId: 'unit-b' } as any }
        ),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(next).toHaveBeenCalledWith();
    });

    it('blocks access to a different unit', () => {
      sameUnit('unitId')(
        makeReq(
          { roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-a' },
          { params: { unitId: 'unit-b' } as any }
        ),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(lastError(next).statusCode).toBe(403);
    });

    it('allows access to the user own unit', () => {
      sameUnit('unitId')(
        makeReq(
          { roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-a' },
          { params: { unitId: 'unit-a' } as any }
        ),
        makeRes(),
        next as unknown as NextFunction
      );
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('requireUser()', () => {
    it('returns the authenticated user attached by authenticate()', () => {
      const user = { id: 'u1', roleCode: RoleCode.SUPER_ADMIN };
      expect(requireUser(makeReq(user))).toBe(user);
    });

    it('throws 401 when no user is attached', () => {
      expect(() => requireUser(makeReq(undefined))).toThrowError(
        expect.objectContaining({ statusCode: 401 })
      );
    });
  });

  describe('student/teacher profile resolution', () => {
    beforeEach(() => {
      vi.mocked(prisma.student.findUnique).mockReset();
      vi.mocked(prisma.teacher.findUnique).mockReset();
    });

    it('findStudentIdForUser resolves the linked student id', async () => {
      vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: 's1' } as never);
      await expect(findStudentIdForUser('u1')).resolves.toBe('s1');
      expect(prisma.student.findUnique).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: { id: true },
      });
    });

    it('findStudentIdForUser returns null when no profile is linked', async () => {
      vi.mocked(prisma.student.findUnique).mockResolvedValue(null as never);
      await expect(findStudentIdForUser('u1')).resolves.toBeNull();
    });

    it('requireStudentId returns the id for a linked student', async () => {
      vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: 's1' } as never);
      await expect(requireStudentId(makeReq({ id: 'u1' }))).resolves.toBe('s1');
    });

    it('requireStudentId throws 403 for a user without a student profile', async () => {
      vi.mocked(prisma.student.findUnique).mockResolvedValue(null as never);
      await expect(requireStudentId(makeReq({ id: 'u1' }))).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('requireStudentId throws 401 before hitting the DB when unauthenticated', async () => {
      await expect(requireStudentId(makeReq(undefined))).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(prisma.student.findUnique).not.toHaveBeenCalled();
    });

    it('findTeacherIdForUser resolves the linked teacher id or null', async () => {
      vi.mocked(prisma.teacher.findUnique).mockResolvedValue({ id: 't1' } as never);
      await expect(findTeacherIdForUser('u1')).resolves.toBe('t1');
      vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null as never);
      await expect(findTeacherIdForUser('u1')).resolves.toBeNull();
    });
  });
});
