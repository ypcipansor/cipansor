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
