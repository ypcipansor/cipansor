import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../roles.service', () => ({
  rolesService: {
    // The switch, the account-state re-validation, the token mint and the
    // refresh-token insert are one transaction inside the service
    // (`switchRoleAndIssueSession`); the controller only wires the result to
    // cookies and the response body. The scope rule these tests used to pin
    // lives in that transaction now and is covered by
    // `utils/resolve-unit-id.test.ts` (`tokenUnitId`) and
    // `roles.service.test.ts`.
    switchRoleAndIssueSession: vi.fn(),
  },
}));

vi.mock('@/lib/jwt', () => ({
  getExpirationDate: vi.fn(() => new Date()),
  // `sessionCookies` derives the routing hint from the access token's claims.
  decodeToken: vi.fn(() => null),
}));

import { rolesController } from '../roles.controller';
import { rolesService } from '../roles.service';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1' },
    ...overrides,
  } as unknown as Request;

  const headers: Record<string, unknown> = {};
  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    headers,
    status(code: number) {
      (this as any).statusCode = code;
      return this;
    },
    json(payload: unknown) {
      (this as any).jsonPayload = payload;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    setHeader(name: string, value: unknown) {
      headers[name] = value;
      return this;
    },
  } as unknown as Response & {
    statusCode: number;
    jsonPayload: any;
    headers: Record<string, unknown>;
  };

  return { req, res, next: vi.fn() };
}

describe('RolesController.switchRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates the switch to the locked transaction and returns its tokens', async () => {
    const mockSwitchResult = {
      user: { id: 'u-1', email: 'user@cipansor.or.id', role: 'TEACHER', unitId: 'unit-home-sd' },
      activeRole: {
        id: 'role-assign-1',
        roleId: 'r-smp-admin',
        unitId: 'unit-active-smp',
        role: { code: 'SMPIT_ADMIN', permissions: ['PERM_1'] },
        unit: { id: 'unit-active-smp', name: 'SMP IT' },
      },
      tokens: { accessToken: 'token-123', refreshToken: 'refresh-123' },
    };

    vi.mocked(rolesService.switchRoleAndIssueSession).mockResolvedValue(mockSwitchResult as any);

    const { req, res, next } = mockReqRes({
      body: { roleAssignmentId: 'role-assign-1' } as any,
    });

    await rolesController.switchRole(req, res, next);

    expect(rolesService.switchRoleAndIssueSession).toHaveBeenCalledWith('user-1', 'role-assign-1');
    expect(res.jsonPayload.success).toBe(true);
    expect(res.jsonPayload.data.accessToken).toBe('token-123');
    expect(res.jsonPayload.data.activeRole.id).toBe('role-assign-1');
  });

  it('sets the session cookies from the freshly minted pair', async () => {
    const mockSwitchResult = {
      user: { id: 'u-1', email: 'user@cipansor.or.id', role: 'TEACHER', unitId: 'unit-home-sd' },
      activeRole: {
        id: 'role-assign-2',
        roleId: 'r-global',
        unitId: null,
        role: { code: 'YAYASAN_KETUA', permissions: ['PERM_ALL'] },
        unit: null,
      },
      tokens: { accessToken: 'token-123', refreshToken: 'refresh-123' },
    };

    vi.mocked(rolesService.switchRoleAndIssueSession).mockResolvedValue(mockSwitchResult as any);

    const { req, res, next } = mockReqRes({
      body: { roleAssignmentId: 'role-assign-2' } as any,
    });

    await rolesController.switchRole(req, res, next);

    // The browser's HttpOnly access token and routing hint must carry the
    // newly active role, not the previous one.
    const setCookie = res.headers['Set-Cookie'];
    expect(setCookie).toBeTruthy();
    expect(JSON.stringify(setCookie)).toContain('token-123');
  });

  it('surfaces a service failure to the error handler instead of responding', async () => {
    vi.mocked(rolesService.switchRoleAndIssueSession).mockRejectedValue(
      new Error('Account is deactivated')
    );

    const { req, res, next } = mockReqRes({
      body: { roleAssignmentId: 'role-assign-3' } as any,
    });

    await rolesController.switchRole(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Account is deactivated' })
    );
    expect(res.jsonPayload).toBeUndefined();
  });
});
