import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../announcements.service', () => ({
  announcementService: {
    findAll: vi.fn(),
    getStats: vi.fn(),
    getRecent: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import * as controller from '../announcements.controller';
import { announcementService } from '../announcements.service';

/** Build a minimal Express req/res pair for controller unit tests. */
function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    query: {},
    params: {},
    body: {},
    user: { userId: 'user-1', unitId: 'unit-1' },
    ...overrides,
  } as unknown as Request;

  const res = {
    statusCode: 200,
    jsonPayload: undefined as unknown,
    status(code: number) {
      (this as any).statusCode = code;
      return this;
    },
    json(payload: unknown) {
      (this as any).jsonPayload = payload;
      return this;
    },
  } as unknown as Response & { statusCode: number; jsonPayload: any };

  return { req, res };
}

/** asyncHandler wraps handlers; invoke and swallow the returned promise. */
async function run(handler: any, req: Request, res: Response) {
  await handler(req, res, vi.fn());
}

describe('announcements controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list: passes query + falls back to the caller unit and spreads the result', async () => {
    (announcementService.findAll as any).mockResolvedValue({
      data: [{ id: 'a1' }],
      pagination: { page: 1 },
    });
    const { req, res } = mockReqRes({ query: { type: 'INFO', published: 'true' } as any });

    await run(controller.list, req, res);

    expect(announcementService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: 'unit-1', published: true, page: 1, limit: 20 })
    );
    expect((res as any).jsonPayload).toEqual({
      success: true,
      data: [{ id: 'a1' }],
      pagination: { page: 1 },
    });
  });

  it('getById: 404 when the announcement is missing', async () => {
    (announcementService.findById as any).mockResolvedValue(null);
    const { req, res } = mockReqRes({ params: { id: 'missing' } as any });

    await run(controller.getById, req, res);

    expect((res as any).statusCode).toBe(404);
    expect((res as any).jsonPayload.success).toBe(false);
  });

  it('create: injects createdById + unit and returns 201', async () => {
    (announcementService.create as any).mockResolvedValue({ id: 'new' });
    const { req, res } = mockReqRes({ body: { title: 'Hi', content: 'x' } as any });

    await run(controller.create, req, res);

    expect(announcementService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hi', unitId: 'unit-1', createdById: 'user-1' })
    );
    expect((res as any).statusCode).toBe(201);
    expect((res as any).jsonPayload).toEqual({ success: true, data: { id: 'new' } });
  });

  it('remove: delegates to the service and confirms deletion', async () => {
    (announcementService.delete as any).mockResolvedValue(undefined);
    const { req, res } = mockReqRes({ params: { id: 'a1' } as any });

    await run(controller.remove, req, res);

    expect(announcementService.delete).toHaveBeenCalledWith('a1');
    expect((res as any).jsonPayload).toEqual({ success: true, message: 'Announcement deleted' });
  });
});
