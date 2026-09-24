import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

/**
 * Board-suspension RBAC, at the router.
 *
 * Items 1/2 of the review: the read, issue and lift grants used to be one
 * `PENGAWASAN_SUSPENSION_ROLES` list, so the Pembina — the organ that
 * *appoints* the Pengurus, and therefore must not be the one that freezes them
 * through oversight — could both mint a suspension and enumerate the Plh
 * candidates. The service re-enforces issuance, but the route is the edge and
 * deserves its own test: this drives the real router with the real `authorize`
 * middleware, replacing only `authenticate` with a header reader.
 */

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// `authenticate` is replaced by a header reader; `authorize` stays real.
vi.mock('@/middleware/auth', async (importOriginal) => {
  const asli = await importOriginal<typeof import('@/middleware/auth')>();
  return {
    ...asli,
    authenticate: (req: Request, _res: Response, next: NextFunction) => {
      const roleCode = String(req.headers['x-peran'] ?? '');
      req.user = {
        id: 'u-uji',
        sub: 'u-uji',
        roleCode,
        role: asli.deriveLegacyRole(roleCode),
        unitId: null,
      } as unknown as Request['user'];
      next();
    },
  };
});

const service = vi.hoisted(() => ({
  suspendBoardMember: vi.fn().mockResolvedValue({ id: 'susp-1', status: 'ACTIVE' }),
  liftBoardSuspension: vi.fn().mockResolvedValue({ id: 'susp-1', status: 'LIFTED' }),
  listBoardSuspensions: vi.fn().mockResolvedValue([]),
  getBoardSuspensions: vi.fn().mockResolvedValue([]),
  listSuspendableCandidates: vi.fn().mockResolvedValue([]),
  listPlhCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../board-suspension.service', () => ({ boardSuspensionService: service }));
vi.mock('../pengawasan.service', () => ({ pengawasanService: {} }));
vi.mock('../wbs.service', () => ({ wbsService: {} }));

// The controller re-resolves the actor's effective assignment before these
// endpoints run. These route-level tests are about the edge `authorize` gate,
// so the persistent re-check is stubbed to "actor holds the role"; its own
// behaviour has dedicated unit/integration tests.
vi.mock('@/utils/role-assignment-lock', async (importOriginal) => {
  const asli = await importOriginal<typeof import('@/utils/role-assignment-lock')>();
  return {
    ...asli,
    assertActorHoldsEffectiveRoleUnlocked: vi.fn().mockResolvedValue('YAYASAN_PENGAWAS'),
  };
});

import router from '../pengawasan.routes';
import { errorHandler } from '@/middleware/error';

const app = express();
app.use(express.json());
app.use('/pengawasan', router);
app.use(errorHandler);

const sebagai = (peran: string) => (req: request.Test) => req.set('x-peran', peran);

const BODY = {
  userId: '11111111-1111-4111-8111-111111111111',
  skNumber: 'SK/001',
  auditReason: 'Alasan audit yang cukup panjang untuk lolos validasi.',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /pengawasan/board-suspensions (issuance)', () => {
  it.each(['SUPER_ADMIN', 'YAYASAN_PENGAWAS'])(
    'allows %s to issue an SK Pembekuan',
    async (role) => {
      const res = await sebagai(role)(
        request(app).post('/pengawasan/board-suspensions').send(BODY)
      );
      expect(res.status).toBe(201);
      expect(service.suspendBoardMember).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['YAYASAN_PEMBINA', 'YAYASAN_SEKRETARIS', 'SDIT_ADMIN'])(
    'refuses %s and never reaches the service',
    async (role) => {
      const res = await sebagai(role)(
        request(app).post('/pengawasan/board-suspensions').send(BODY)
      );
      expect(res.status).toBe(403);
      expect(service.suspendBoardMember).not.toHaveBeenCalled();
    }
  );

  it('passes the actor role to the service so it can re-enforce the policy', async () => {
    await sebagai('YAYASAN_PENGAWAS')(
      request(app).post('/pengawasan/board-suspensions').send(BODY)
    );
    expect(service.suspendBoardMember).toHaveBeenCalledWith(
      expect.objectContaining({ skNumber: 'SK/001' }),
      'u-uji',
      'YAYASAN_PENGAWAS'
    );
  });
});

describe('candidate pickers (issuance-level read)', () => {
  it.each(['SUPER_ADMIN', 'YAYASAN_PENGAWAS'])('lets %s enumerate candidates', async (role) => {
    const a = await sebagai(role)(request(app).get('/pengawasan/board-suspensions/candidates'));
    const b = await sebagai(role)(request(app).get('/pengawasan/board-suspensions/plh-candidates'));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it.each(['YAYASAN_PEMBINA', 'YAYASAN_SEKRETARIS'])(
    'refuses %s the candidate lists',
    async (role) => {
      const a = await sebagai(role)(request(app).get('/pengawasan/board-suspensions/candidates'));
      const b = await sebagai(role)(
        request(app).get('/pengawasan/board-suspensions/plh-candidates')
      );
      expect(a.status).toBe(403);
      expect(b.status).toBe(403);
      expect(service.listSuspendableCandidates).not.toHaveBeenCalled();
      expect(service.listPlhCandidates).not.toHaveBeenCalled();
    }
  );
});

describe('register list (read) and lift', () => {
  it.each(['SUPER_ADMIN', 'YAYASAN_PENGAWAS', 'YAYASAN_PEMBINA'])(
    'lets %s read the register',
    async (role) => {
      const res = await sebagai(role)(request(app).get('/pengawasan/board-suspensions'));
      expect(res.status).toBe(200);
    }
  );

  it('refuses an unrelated role the register', async () => {
    const res = await sebagai('SDIT_ADMIN')(request(app).get('/pengawasan/board-suspensions'));
    expect(res.status).toBe(403);
  });

  it.each(['SUPER_ADMIN', 'YAYASAN_PEMBINA'])('lets %s lift a suspension', async (role) => {
    const res = await sebagai(role)(
      request(app)
        .post('/pengawasan/board-suspensions/11111111-1111-4111-8111-111111111111/lift')
        .send({ liftReason: 'Pemulihan status berdasarkan keputusan Pembina.' })
    );
    expect(res.status).toBe(200);
  });

  it('refuses the Pengawas the lift — it investigates, it does not thaw', async () => {
    const res = await sebagai('YAYASAN_PENGAWAS')(
      request(app)
        .post('/pengawasan/board-suspensions/11111111-1111-4111-8111-111111111111/lift')
        .send({ liftReason: 'Pemulihan status berdasarkan keputusan Pembina.' })
    );
    expect(res.status).toBe(403);
    expect(service.liftBoardSuspension).not.toHaveBeenCalled();
  });
});
