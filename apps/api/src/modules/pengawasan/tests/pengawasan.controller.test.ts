import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

/**
 * Controller-level tests for the pengawasan module.
 *
 * The unit scope of findings and follow-ups is enforced in the controller — it
 * is the only layer that sees `req.user` — so testing the service alone would
 * not prove the guard is reachable. These drive the real handlers and assert
 * that an out-of-unit actor is refused with 403 before any write happens.
 */

vi.mock('../pengawasan.service', () => ({
  pengawasanService: {
    getAudits: vi.fn(),
    getAuditById: vi.fn(),
    createFinding: vi.fn(),
    updateFinding: vi.fn(),
    deleteFinding: vi.fn(),
    getFindingAuditUnitId: vi.fn(),
    createFollowUp: vi.fn(),
    updateFollowUp: vi.fn(),
    deleteFollowUp: vi.fn(),
    getFollowUpAuditUnitId: vi.fn(),
  },
}));

vi.mock('../wbs.service', () => ({ wbsService: {} }));
vi.mock('../board-suspension.service', () => ({ boardSuspensionService: {} }));

import { pengawasanService } from '../pengawasan.service';
import {
  listAudits,
  createFinding,
  updateFinding,
  deleteFinding,
  createFollowUp,
  updateFollowUp,
  deleteFollowUp,
} from '../pengawasan.controller';
import { RoleCode } from '@prisma/client';

const AUDIT_UUID = '11111111-1111-4111-8111-111111111111';
const FINDING_UUID = '22222222-2222-4222-8222-222222222222';

function mockRequest(
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  userOverriding: Record<string, unknown> = {}
): Request {
  return {
    body,
    params,
    query: {},
    user: {
      sub: 'actor-1',
      role: RoleCode.SDIT_ADMIN,
      roleCode: RoleCode.SDIT_ADMIN,
      unitId: 'unit-sdit',
      ...userOverriding,
    },
  } as unknown as Request;
}

function mockResponse() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/** Run an asyncHandler-wrapped handler and capture the error it forwards. */
async function runHandler(
  handler: (req: Request, res: Response, next: (e?: unknown) => void) => unknown,
  req: Request,
  res: Response
) {
  const next = vi.fn();
  await (handler as any)(req, res, next);
  return next;
}

describe('pengawasanController — finding/follow-up unit scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses to create a finding on another unit\'s audit', async () => {
    (pengawasanService.getAuditById as any).mockResolvedValue({ id: AUDIT_UUID, unitId: 'unit-lain' });
    const res = mockResponse();

    const next = await runHandler(
      createFinding,
      mockRequest({ auditId: AUDIT_UUID, findingNumber: 'F-1', title: 'Temuan', description: 'Deskripsi', severity: 'MINOR', category: 'KEUANGAN' }),
      res
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(pengawasanService.createFinding).not.toHaveBeenCalled();
  });

  it('allows creating a finding on the actor\'s own unit audit', async () => {
    (pengawasanService.getAuditById as any).mockResolvedValue({ id: AUDIT_UUID, unitId: 'unit-sdit' });
    (pengawasanService.createFinding as any).mockResolvedValue({ id: 'finding-1' });
    const res = mockResponse();

    const next = await runHandler(
      createFinding,
      mockRequest({ auditId: AUDIT_UUID, findingNumber: 'F-1', title: 'Temuan', description: 'Deskripsi', severity: 'MINOR', category: 'KEUANGAN' }),
      res
    );

    expect(next).not.toHaveBeenCalled();
    expect(pengawasanService.createFinding).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('lets a foundation-wide role write to any unit\'s audit', async () => {
    (pengawasanService.getAuditById as any).mockResolvedValue({ id: AUDIT_UUID, unitId: 'unit-lain' });
    (pengawasanService.createFinding as any).mockResolvedValue({ id: 'finding-1' });
    const res = mockResponse();

    const next = await runHandler(
      createFinding,
      mockRequest(
        { auditId: AUDIT_UUID, findingNumber: 'F-1', title: 'Temuan', description: 'Deskripsi', severity: 'MINOR', category: 'KEUANGAN' },
        {},
        { roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: null }
      ),
      res
    );

    expect(next).not.toHaveBeenCalled();
    expect(pengawasanService.createFinding).toHaveBeenCalled();
  });

  it.each([
    ['updateFinding', updateFinding],
    ['deleteFinding', deleteFinding],
  ])('refuses %s on a finding owned by another unit', async (_name, handler) => {
    (pengawasanService.getFindingAuditUnitId as any).mockResolvedValue('unit-lain');
    const res = mockResponse();

    const next = await runHandler(
      handler as any,
      mockRequest({}, { id: FINDING_UUID }),
      res
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(pengawasanService.updateFinding).not.toHaveBeenCalled();
    expect(pengawasanService.deleteFinding).not.toHaveBeenCalled();
  });

  it('answers 404 for a finding that does not exist', async () => {
    (pengawasanService.getFindingAuditUnitId as any).mockResolvedValue(null);
    const res = mockResponse();

    const next = await runHandler(updateFinding, mockRequest({}, { id: FINDING_UUID }), res);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('refuses to create a follow-up on another unit\'s finding', async () => {
    (pengawasanService.getFindingAuditUnitId as any).mockResolvedValue('unit-lain');
    const res = mockResponse();

    const next = await runHandler(
      createFollowUp,
      mockRequest({ findingId: FINDING_UUID, action: 'Rencana tindak lanjut', dueDate: '2026-12-31' }),
      res
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(pengawasanService.createFollowUp).not.toHaveBeenCalled();
  });

  it('refuses to update a follow-up on another unit\'s audit', async () => {
    (pengawasanService.getFollowUpAuditUnitId as any).mockResolvedValue('unit-lain');
    const res = mockResponse();

    const next = await runHandler(
      updateFollowUp,
      mockRequest({ status: 'IN_PROGRESS' }, { id: FINDING_UUID }),
      res
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(pengawasanService.updateFollowUp).not.toHaveBeenCalled();
  });

  it('refuses to delete a follow-up on another unit\'s audit', async () => {
    (pengawasanService.getFollowUpAuditUnitId as any).mockResolvedValue('unit-lain');
    const res = mockResponse();

    const next = await runHandler(deleteFollowUp, mockRequest({}, { id: FINDING_UUID }), res);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(pengawasanService.deleteFollowUp).not.toHaveBeenCalled();
  });
});

describe('pengawasanController — audit list unit scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pengawasanService.getAudits as any).mockResolvedValue([]);
  });

  it('lets a unitless foundation-wide Pengawas list across every unit', async () => {
    // `YAYASAN_PENGAWAS` passes `isFoundationWide` but carries no `unitId`.
    // The old code then demanded a unit and 400'd; the cross-unit view must be
    // the default for foundation-wide governance, not a Super-Admin-only perk.
    const res = mockResponse();

    await runHandler(
      listAudits,
      mockRequest({}, {}, { roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: undefined }),
      res
    );

    expect(pengawasanService.getAudits).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('still lists every unit for a foundation-wide actor that carries its own unit', async () => {
    // Foundation-wide means every unit. Falling back to the actor's own `unitId`
    // would have quietly narrowed a Pengawas to the foundation unit alone, which
    // is the same defect the explicit-unit check used to cause.
    const res = mockResponse();

    await runHandler(
      listAudits,
      mockRequest({}, {}, { roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: 'unit-yayasan' }),
      res
    );

    expect(pengawasanService.getAudits).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('treats the `all` sentinel as an explicit cross-unit request', async () => {
    const res = mockResponse();
    const req = mockRequest({}, {}, { roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: 'unit-yayasan' });
    (req.query as any).unitId = 'all';

    await runHandler(listAudits, req, res);

    expect(pengawasanService.getAudits).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('refuses a unit-scoped role that has no unit', async () => {
    const res = mockResponse();

    const next = await runHandler(
      listAudits,
      mockRequest({}, {}, { roleCode: RoleCode.SDIT_ADMIN, unitId: undefined }),
      res
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(pengawasanService.getAudits).not.toHaveBeenCalled();
  });

  it('keeps a unit-scoped role confined to its own unit', async () => {
    const res = mockResponse();

    await runHandler(
      listAudits,
      mockRequest({}, {}, { roleCode: RoleCode.SDIT_ADMIN, unitId: 'unit-sdit' }),
      res
    );

    expect(pengawasanService.getAudits).toHaveBeenCalledWith('unit-sdit', expect.anything());
  });

  it('narrows a foundation-wide actor to an explicitly requested unit', async () => {
    const res = mockResponse();
    const req = mockRequest({}, {}, { roleCode: RoleCode.YAYASAN_PENGAWAS, unitId: undefined });
    (req.query as any).unitId = 'unit-smp';

    await runHandler(listAudits, req, res);

    expect(pengawasanService.getAudits).toHaveBeenCalledWith('unit-smp', expect.anything());
  });
});
