import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../roles.service', () => ({
  rolesService: {
    switchRole: vi.fn(),
  },
}));

vi.mock('@/lib/jwt', () => ({
  generateTokenPair: vi.fn(() => ({ accessToken: 'token-123', refreshToken: 'refresh-123' })),
  getExpirationDate: vi.fn(() => new Date()),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    refreshToken: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// The real tokenUnitId runs here (resolve-unit-id is pure): the switchRole
// scope rule is exactly what these tests pin, so mocking it would test the mock.

import { rolesController } from '../roles.controller';
import { rolesService } from '../roles.service';
import { generateTokenPair } from '@/lib/jwt';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1' },
    ...overrides,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    status(code: number) { (this as any).statusCode = code; return this; },
    json(payload: unknown) { (this as any).jsonPayload = payload; return this; },
  } as unknown as Response & { statusCode: number; jsonPayload: any };

  return { req, res, next: vi.fn() };
}

describe('RolesController.switchRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates tokens using activeRole.unitId when present', async () => {
    const mockSwitchResult = {
      user: { id: 'u-1', email: 'user@cipansor.or.id', role: 'TEACHER', unitId: 'unit-home-sd' },
      activeRole: {
        id: 'role-assign-1',
        roleId: 'r-smp-admin',
        unitId: 'unit-active-smp',
        role: { code: 'SMPIT_ADMIN', permissions: ['PERM_1'] },
        unit: { id: 'unit-active-smp', name: 'SMP IT' },
      },
    };

    vi.mocked(rolesService.switchRole).mockResolvedValue(mockSwitchResult as any);

    const { req, res, next } = mockReqRes({
      body: { roleAssignmentId: 'role-assign-1' } as any,
    });

    await rolesController.switchRole(req, res, next);

    expect(rolesService.switchRole).toHaveBeenCalledWith('user-1', 'role-assign-1');
    expect(generateTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'u-1',
        roleCode: 'SMPIT_ADMIN',
        unitId: 'unit-active-smp',
      })
    );
    expect(res.jsonPayload.success).toBe(true);
    expect(res.jsonPayload.data.accessToken).toBe('token-123');
  });

  it('keeps unitId null when switching to a foundation role', async () => {
    // Role yayasan adalah peran lintas-unit. Sebelum perbaikan, fallback ke
    // user.unitId menjadikannya unit-scoped — pengurus yayasan yang seharusnya
    // melihat seluruh unit malah terkunci pada unit asalnya.
    const mockSwitchResult = {
      user: { id: 'u-1', email: 'user@cipansor.or.id', role: 'TEACHER', unitId: 'unit-home-sd' },
      activeRole: {
        id: 'role-assign-2',
        roleId: 'r-global',
        unitId: null,
        role: { code: 'YAYASAN_KETUA', permissions: ['PERM_ALL'] },
        unit: null,
      },
    };

    vi.mocked(rolesService.switchRole).mockResolvedValue(mockSwitchResult as any);

    const { req, res, next } = mockReqRes({
      body: { roleAssignmentId: 'role-assign-2' } as any,
    });

    await rolesController.switchRole(req, res, next);

    expect(generateTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'u-1',
        roleCode: 'YAYASAN_KETUA',
        unitId: null,
      })
    );
  });

  it('falls back to user.unitId for a unit role whose assignment names no unit', async () => {
    // Peran yang memang unit-scoped tetapi kebetulan unitId-nya null harus
    // tetap memakai unit home; yang boleh null hanya peran yang bekerja lintas
    // unit (seesAllUnits true).
    const mockSwitchResult = {
      user: { id: 'u-1', email: 'user@cipansor.or.id', role: 'TEACHER', unitId: 'unit-home-sd' },
      activeRole: {
        id: 'role-assign-3',
        roleId: 'r-unit',
        unitId: null,
        role: { code: 'SDIT_GURU', permissions: ['PERM_1'] },
        unit: null,
      },
    };

    vi.mocked(rolesService.switchRole).mockResolvedValue(mockSwitchResult as any);

    const { req, res, next } = mockReqRes({
      body: { roleAssignmentId: 'role-assign-3' } as any,
    });

    await rolesController.switchRole(req, res, next);

    expect(generateTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'u-1',
        roleCode: 'SDIT_GURU',
        unitId: 'unit-home-sd',
      })
    );
  });

  it('keeps a cross-unit service role on its home unit — only foundation roles carry no unit', async () => {
    // Perawat bekerja lintas unit, tetapi lebarnya datang dari seesAllUnits di
    // kueri, bukan dari unitId kosong. Sebelum tokenUnitId, switchRole
    // mengosongkannya sementara refresh mengembalikan unit asal — cakupannya
    // berganti sendiri pada penyegaran token berikutnya.
    const mockSwitchResult = {
      user: { id: 'u-1', email: 'perawat@cipansor.or.id', role: 'STAFF', unitId: 'unit-home-smp' },
      activeRole: {
        id: 'role-assign-4',
        roleId: 'r-perawat',
        unitId: null,
        role: { code: 'PERAWAT', permissions: ['PERM_1'] },
        unit: null,
      },
    };

    vi.mocked(rolesService.switchRole).mockResolvedValue(mockSwitchResult as any);

    const { req, res, next } = mockReqRes({
      body: { roleAssignmentId: 'role-assign-4' } as any,
    });

    await rolesController.switchRole(req, res, next);

    expect(generateTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: 'PERAWAT', unitId: 'unit-home-smp' })
    );
  });
});
