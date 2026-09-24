import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { RoleCode } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

import { isAdmin, isAdminOrSelf } from './auth';
import { ApiError } from './error';

function mockReq(user?: Record<string, unknown>, params: Record<string, string> = {}) {
  return { user, params } as unknown as Request;
}
const res = {} as Response;

function expectForbidden(next: ReturnType<typeof vi.fn>) {
  const err = next.mock.calls[0][0];
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).statusCode).toBe(403);
}

function expectUnauthorized(next: ReturnType<typeof vi.fn>) {
  const err = next.mock.calls[0][0];
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).statusCode).toBe(401);
}

describe('isAdmin', () => {
  it('rejects unauthenticated requests with 401', () => {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    isAdmin(mockReq(undefined), res, next);
    expectUnauthorized(next);
  });

  it.each([RoleCode.SUPER_ADMIN, RoleCode.SDIT_ADMIN, RoleCode.SMPIT_ADMIN])(
    'allows admin roleCode %s',
    (roleCode) => {
      const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
      isAdmin(mockReq({ id: 'u1', roleCode }), res, next);
      expect(next).toHaveBeenCalledWith();
    }
  );

  it.each([
    RoleCode.SDIT_SISWA,
    RoleCode.SDIT_ORANG_TUA,
    RoleCode.SDIT_GURU,
    RoleCode.SDIT_KEPALA_SEKOLAH,
  ])('rejects non-admin roleCode %s with 403', (roleCode) => {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    isAdmin(mockReq({ id: 'u1', roleCode }), res, next);
    expectForbidden(next);
  });
});

describe('isAdminOrSelf', () => {
  const guard = isAdminOrSelf();

  it('rejects unauthenticated requests with 401', () => {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    guard(mockReq(undefined, { id: 'u1' }), res, next);
    expectUnauthorized(next);
  });

  it('allows a non-admin to access their own record', () => {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    guard(mockReq({ id: 'u1', roleCode: RoleCode.SDIT_SISWA }, { id: 'u1' }), res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a non-admin reading someone else's record with 403", () => {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    guard(mockReq({ id: 'u1', roleCode: RoleCode.SDIT_SISWA }, { id: 'u2' }), res, next);
    expectForbidden(next);
  });

  it("allows an admin to access someone else's record", () => {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    guard(mockReq({ id: 'u1', roleCode: RoleCode.SUPER_ADMIN }, { id: 'u2' }), res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('respects a custom param name', () => {
    const byUserId = isAdminOrSelf('userId');
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    byUserId(mockReq({ id: 'u1', roleCode: RoleCode.SDIT_SISWA }, { userId: 'u1' }), res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
