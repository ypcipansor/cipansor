import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

/**
 * Internal audit, risk and sharia compliance decided which units a request
 * reaches on the legacy `role`, where every YAYASAN_* code is UNIT_ADMIN. On
 * the rig (2026-09-28) the Pengawas and the Ketua opened Pengawasan Internal
 * and got "Unit ID required" — 400 on /pengawasan and /syariah, 401 on /risk —
 * while a unit's admin read another unit's audits by naming it in `?unitId=`,
 * and any staff account could edit a finding of any unit by its id.
 *
 * These tests drive the real routers with a stub token and pin the one rule
 * now in resolve-unit-id.ts: the yayasan's organs see every unit and may
 * narrow to one; everyone else sees their own, whatever the query or the body
 * says; a row out of reach is 404.
 */

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/prisma', () => {
  const model = () => ({
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });
  const prisma = {
    internalAudit: model(),
    auditFinding: model(),
    auditFollowUp: model(),
    risk: model(),
    riskMitigation: model(),
    shariaCompliance: model(),
    shariaAudit: model(),
    budget: model(),
    journalEntry: { ...model(), groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return { prisma };
});

// Stub token: `authenticate` reads two headers; `authorize` stays the real one.
vi.mock('@/middleware/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/middleware/auth')>();
  return {
    ...real,
    authenticate: (req: Request, _res: Response, next: NextFunction) => {
      const roleCode = String(req.headers['x-role'] ?? '');
      const unitId = req.headers['x-unit'] ? String(req.headers['x-unit']) : null;
      req.user = {
        sub: 'user-1',
        id: 'user-1',
        roleCode,
        role: real.deriveLegacyRole(roleCode),
        unitId,
      } as unknown as Request['user'];
      next();
    },
  };
});

import { prisma } from '@/lib/prisma';
import { errorHandler } from '@/middleware/error';
import pengawasanRoutes from './pengawasan.routes';
import riskRoutes from '../risk/risk.routes';
import syariahRoutes from '../syariah/syariah.routes';

type Model = Record<
  'findMany' | 'findUnique' | 'findFirst' | 'create' | 'update' | 'delete',
  ReturnType<typeof vi.fn>
>;
const db = prisma as unknown as Record<
  | 'internalAudit'
  | 'auditFinding'
  | 'auditFollowUp'
  | 'risk'
  | 'riskMitigation'
  | 'shariaCompliance'
  | 'shariaAudit',
  Model
>;

const SD = '11111111-1111-4111-8111-111111111111';
const SMP = '22222222-2222-4222-8222-222222222222';
const AUDIT_SD = '33333333-3333-4333-8333-333333333333';
const RISK_SD = '44444444-4444-4444-8444-444444444444';
const COMPLIANCE_SD = '55555555-5555-4555-8555-555555555555';
const AUDIT_SMP = '66666666-6666-4666-8666-666666666666';

const app = express();
app.use(express.json());
app.use('/pengawasan', pengawasanRoutes);
app.use('/risk', riskRoutes);
app.use('/syariah', syariahRoutes);
app.use(errorHandler);

const as = (roleCode: string, unit: string | null) => (req: request.Test) =>
  unit ? req.set('x-role', roleCode).set('x-unit', unit) : req.set('x-role', roleCode);

const PENGAWAS = as('YAYASAN_PENGAWAS', null);
const KETUA = as('YAYASAN_KETUA', null);
const SMP_ADMIN = as('SMPIT_ADMIN', SMP);
const SMP_GURU = as('SMPIT_GURU', SMP);

beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, m] of Object.entries(db)) {
    if (name === '$transaction' || name === 'journalEntry') continue;
    m.findMany.mockResolvedValue([]);
    m.findUnique.mockResolvedValue(null);
  }
});

const whereOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0][0].where;

describe('the yayasan organs oversee every unit', () => {
  it('the Pengawas lists the audits of every unit, or of one it names', async () => {
    const all = await PENGAWAS(request(app).get('/pengawasan'));
    expect(all.status).toBe(200);
    expect(whereOf(db.internalAudit.findMany)).toEqual({});

    vi.clearAllMocks();
    db.internalAudit.findMany.mockResolvedValue([]);
    const one = await PENGAWAS(request(app).get(`/pengawasan?unitId=${SD}`));
    expect(one.status).toBe(200);
    expect(whereOf(db.internalAudit.findMany)).toEqual({ unitId: SD });
  });

  it('the Ketua opens Manajemen Risiko — it answered 401 and looked like a lapsed session', async () => {
    const res = await KETUA(request(app).get('/risk'));
    expect(res.status).toBe(200);
    expect(whereOf(db.risk.findMany)).toEqual({});
  });

  it('the Pengawas reads sharia compliance and its summary across units', async () => {
    expect((await PENGAWAS(request(app).get('/syariah'))).status).toBe(200);
    expect(whereOf(db.shariaCompliance.findMany)).toEqual({});
    expect((await PENGAWAS(request(app).get('/syariah/summary'))).status).toBe(200);
    expect((await PENGAWAS(request(app).get('/pengawasan/suggestions?unitId=all'))).status).toBe(
      200
    );
  });

  it('the Pengawas opens an audit of any unit', async () => {
    db.internalAudit.findUnique.mockResolvedValue({ id: AUDIT_SD, unitId: SD });
    const res = await PENGAWAS(request(app).get(`/pengawasan/${AUDIT_SD}`));
    expect(res.status).toBe(200);
  });

  it('schedules an audit in the unit it names, and is asked for one when it names none', async () => {
    const body = {
      title: 'Audit kas',
      auditType: 'Keuangan',
      plannedDate: '2026-10-01T00:00:00.000Z',
    };
    const none = await PENGAWAS(request(app).post('/pengawasan').send(body));
    expect(none.status).toBe(400);
    expect(none.body.error?.message ?? none.body.message).toBe('Pilih unit');

    db.internalAudit.create.mockResolvedValue({ id: AUDIT_SD });
    const named = await PENGAWAS(
      request(app)
        .post('/pengawasan')
        .send({ ...body, unitId: SD })
    );
    expect(named.status).toBe(201);
    expect(db.internalAudit.create.mock.calls[0][0].data.unit).toEqual({ connect: { id: SD } });
  });
});

describe('everyone else is pinned to their own unit', () => {
  it("a unit's admin naming another unit in the query still gets their own", async () => {
    const res = await SMP_ADMIN(request(app).get(`/pengawasan?unitId=${SD}`));
    expect(res.status).toBe(200);
    expect(whereOf(db.internalAudit.findMany)).toEqual({ unitId: SMP });

    await SMP_ADMIN(request(app).get(`/syariah?unitId=${SD}`));
    expect(whereOf(db.shariaCompliance.findMany)).toEqual({ unitId: SMP });
    await SMP_ADMIN(request(app).get(`/risk?unitId=${SD}`));
    expect(whereOf(db.risk.findMany)).toEqual({ unitId: SMP });
  });

  it("a unit's admin cannot open, change or delete another unit's audit", async () => {
    db.internalAudit.findUnique.mockResolvedValue({ id: AUDIT_SD, unitId: SD });
    expect((await SMP_ADMIN(request(app).get(`/pengawasan/${AUDIT_SD}`))).status).toBe(404);
    expect(
      (await SMP_ADMIN(request(app).put(`/pengawasan/${AUDIT_SD}`).send({ title: 'x' }))).status
    ).toBe(404);
    expect((await SMP_ADMIN(request(app).delete(`/pengawasan/${AUDIT_SD}`))).status).toBe(404);
    expect(db.internalAudit.update).not.toHaveBeenCalled();
    expect(db.internalAudit.delete).not.toHaveBeenCalled();
  });

  it('writes to their own unit whatever the body names', async () => {
    db.internalAudit.create.mockResolvedValue({ id: AUDIT_SMP });
    const res = await SMP_ADMIN(
      request(app).post('/pengawasan').send({
        title: 'Audit kas',
        auditType: 'Keuangan',
        plannedDate: '2026-10-01T00:00:00.000Z',
        unitId: SD,
      })
    );
    expect(res.status).toBe(201);
    expect(db.internalAudit.create.mock.calls[0][0].data.unit).toEqual({ connect: { id: SMP } });
  });

  it("a teacher cannot add to, change or delete another unit's findings and follow-ups", async () => {
    db.internalAudit.findUnique.mockResolvedValue({ unitId: SD });
    db.auditFinding.findUnique.mockResolvedValue({ audit: { unitId: SD } });
    db.auditFollowUp.findUnique.mockResolvedValue({ finding: { audit: { unitId: SD } } });
    const id = '77777777-7777-4777-8777-777777777777';

    const created = await SMP_GURU(
      request(app).post('/pengawasan/findings').send({
        auditId: AUDIT_SD,
        findingNumber: 'T-1',
        title: 'Kas tidak cocok',
        description: 'Saldo kas berbeda',
        severity: 'MINOR',
        category: 'Keuangan',
      })
    );
    expect(created.status).toBe(404);
    expect(
      (await SMP_GURU(request(app).put(`/pengawasan/findings/${id}`).send({ title: 'x' }))).status
    ).toBe(404);
    expect((await SMP_GURU(request(app).delete(`/pengawasan/findings/${id}`))).status).toBe(404);
    expect(
      (
        await SMP_GURU(
          request(app)
            .post('/pengawasan/follow-ups')
            .send({ findingId: id, action: 'Rekonsiliasi kas' })
        )
      ).status
    ).toBe(404);
    expect(
      (
        await SMP_GURU(
          request(app).put(`/pengawasan/follow-ups/${id}`).send({ status: 'RESOLVED' })
        )
      ).status
    ).toBe(404);
    expect((await SMP_GURU(request(app).delete(`/pengawasan/follow-ups/${id}`))).status).toBe(404);

    expect(db.auditFinding.create).not.toHaveBeenCalled();
    expect(db.auditFinding.update).not.toHaveBeenCalled();
    expect(db.auditFinding.delete).not.toHaveBeenCalled();
    expect(db.auditFollowUp.create).not.toHaveBeenCalled();
    expect(db.auditFollowUp.update).not.toHaveBeenCalled();
    expect(db.auditFollowUp.delete).not.toHaveBeenCalled();
  });

  it("a finding in one's own audit cannot escalate another unit's risk", async () => {
    db.internalAudit.findUnique.mockResolvedValue({ unitId: SMP });
    db.risk.findUnique.mockResolvedValue({
      consequence: null,
      status: 'OPEN',
      impact: 'MINOR',
      unitId: SD,
    });
    const res = await SMP_GURU(
      request(app).post('/pengawasan/findings').send({
        auditId: AUDIT_SMP,
        findingNumber: 'T-2',
        title: 'Kas tidak cocok',
        description: 'Saldo kas berbeda',
        severity: 'CRITICAL',
        category: 'Keuangan',
        linkToRiskId: RISK_SD,
      })
    );
    expect(res.status).toBe(400);
    expect(db.auditFinding.create).not.toHaveBeenCalled();
    expect(db.risk.update).not.toHaveBeenCalled();
  });

  it("another unit's risk, mitigation and compliance are out of reach", async () => {
    db.risk.findUnique.mockResolvedValue({ id: RISK_SD, unitId: SD });
    expect((await SMP_ADMIN(request(app).get(`/risk/${RISK_SD}`))).status).toBe(404);

    db.shariaCompliance.findUnique.mockResolvedValue({ id: COMPLIANCE_SD, unitId: SD });
    expect((await SMP_ADMIN(request(app).get(`/syariah/${COMPLIANCE_SD}`))).status).toBe(404);
    const audit = await SMP_GURU(
      request(app).post('/syariah/audits').send({
        complianceId: COMPLIANCE_SD,
        auditDate: '2026-10-01T00:00:00.000Z',
        findings: 'Akad sesuai',
        score: 80,
      })
    );
    expect(audit.status).toBe(404);
    expect(db.shariaAudit.create).not.toHaveBeenCalled();
  });

  it('a unit role that carries no unit is refused, not shown everything', async () => {
    const res = await as('SMPIT_GURU', null)(request(app).get('/pengawasan'));
    expect(res.status).toBe(403);
    expect(db.internalAudit.findMany).not.toHaveBeenCalled();
  });
});
