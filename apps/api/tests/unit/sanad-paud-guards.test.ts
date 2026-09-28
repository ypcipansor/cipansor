import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Found while auditing PR #545 (2026-09-25):
// - GET /sanad/:id/certificate needed only a login, and its first call mints
//   the santri's permanent certificate with the signatory taken from
//   ?signedBy= — a santri could issue their own, "signed" by anyone, and the
//   public verify page then attested it;
// - GET /sanad/:id returned the santri's NISN, birth date and place to anyone;
// - every PAUD assessment write (and its photo upload) accepted any account.

vi.mock('@/lib/jwt', () => ({ verifyToken: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock('@/lib/prisma', () => {
  const defaults: Record<string, unknown> = { findMany: [], groupBy: [], count: 0 };
  const models = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  const model = (name: string) => {
    if (!models.has(name)) {
      const fns: Record<string, ReturnType<typeof vi.fn>> = {};
      models.set(
        name,
        new Proxy(fns, {
          get: (t, k: string) => (t[k] ??= vi.fn(async () => defaults[k] ?? null)),
        })
      );
    }
    return models.get(name)!;
  };
  const raw = vi.fn(async () => []);
  return {
    prisma: new Proxy({}, { get: (_t, k: string) => (k.startsWith('$') ? raw : model(k)) }),
  };
});

import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { errorHandler } from '@/middleware/error';
import paudAssessmentRoutes from '@/modules/paud-assessment/paud-assessment.routes';
import { sanadCertificateRouter } from '@/modules/sanad-certificate/sanad-certificate.routes';
import { generateCertificate } from '@/modules/sanad-certificate/sanad-certificate.service';

const ACCOUNTS: Record<string, Record<string, unknown>> = {
  santri: { sub: 'u-santri', roleCode: 'SMPIT_SISWA', unitId: 'unit-smp' },
  wali: { sub: 'u-wali', roleCode: 'TKQ_ORANG_TUA', unitId: 'unit-tk' },
  alumni: { sub: 'u-alumni', roleCode: 'SMAQ_ALUMNI', unitId: 'unit-sma' },
  guru: { sub: 'u-guru', roleCode: 'TKQ_GURU', unitId: 'unit-tk' },
  ustadz: { sub: 'u-ustadz', roleCode: 'USTADZ', unitId: 'unit-pst' },
  tu: { sub: 'u-tu', roleCode: 'TKQ_TATA_USAHA', unitId: 'unit-tk' },
};

const app = express();
app.use(express.json());
app.use('/paud-assessment', paudAssessmentRoutes);
app.use('/sanad', sanadCertificateRouter);
app.use(errorHandler);

type Method = 'get' | 'post' | 'put' | 'delete';
const call = (method: Method, path: string, who: string) =>
  request(app)[method](path).set('Authorization', `Bearer ${who}`).send({});

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  vi.mocked(verifyToken).mockImplementation(((token: string) => {
    const account = ACCOUNTS[token];
    if (!account) throw new Error('bad token');
    return { type: 'access', permissions: [], ...account };
  }) as any);
});

describe('sanad certificates are issued by teachers and leadership', () => {
  it.each(['santri', 'wali', 'alumni', 'tu'])(
    '%s cannot open (and so mint) a certificate',
    async (who) => {
      const res = await call('get', '/sanad/s-1/certificate?signedBy=Kiai%20Palsu', who);
      expect(res.status).toBe(403);
      expect(db.digitalCertificate.create).not.toHaveBeenCalled();
    }
  );

  it('an ustadz passes the guard', async () => {
    const res = await call('get', '/sanad/s-1/certificate', 'ustadz');
    expect([401, 403]).not.toContain(res.status);
  });

  it.each(['/sanad/s-1', '/sanad/students/st-1/summary'])(
    'GET %s (NISN, birth date and place) is staff-only',
    async (path) => {
      for (const who of ['santri', 'wali', 'alumni']) {
        expect((await call('get', path, who)).status, who).toBe(403);
      }
    }
  );

  it('the alumni directory still reads the list and the tree', async () => {
    for (const path of ['/sanad', '/sanad/tree']) {
      expect([401, 403]).not.toContain((await call('get', path, 'alumni')).status);
    }
  });
});

describe('a reprint names the signatory stored at minting', () => {
  const sanad = {
    id: 's-1',
    juz: 30,
    grade: 'MUMTAZ',
    certifiedAt: new Date('2026-09-01'),
    teacher: { id: 't-1', name: 'Ustadz Ahmad', email: 'a@x' },
    enrollment: {
      student: { id: 'st-1', nis: '123', user: { name: 'Santri' }, unit: { name: 'Pesantren' } },
      halaqoh: { id: 'h-1', name: 'Halaqoh 1' },
    },
  };
  const existing = (signatoryName: string, signatoryTitle: string) => ({
    id: 'c-1',
    certificateNumber: 'SNP-1',
    qrCode: 'ABC',
    signatoryName,
    signatoryTitle,
  });

  beforeEach(() => {
    db.sanadRecord.findUnique.mockResolvedValue(sanad);
  });

  it('ignores a later ?signedBy= and prints what the verify page attests', async () => {
    db.digitalCertificate.findFirst.mockResolvedValue(
      existing('K.H. Pimpinan', 'Pimpinan Pesantren')
    );
    const data = await generateCertificate(
      { sanadId: 's-1', signedBy: 'Nama Karangan', signedByTitle: 'Kepala' } as any,
      { userId: 'u-ustadz' }
    );
    expect(data.signedBy).toBe('K.H. Pimpinan');
    expect(data.signedByTitle).toBe('Pimpinan Pesantren');
  });

  it('leaves the second box blank when the teacher was the only signatory', async () => {
    db.digitalCertificate.findFirst.mockResolvedValue(existing('Ustadz Ahmad', 'Guru Tahfidz'));
    const data = await generateCertificate({ sanadId: 's-1', signedBy: 'Nama Karangan' } as any, {
      userId: 'u-ustadz',
    });
    expect(data.signedBy).toBeUndefined();
    expect(data.signedByTitle).toBeUndefined();
  });
});

describe('PAUD assessments are the TK teachers’ work', () => {
  const WRITES: Array<[Method, string]> = [
    ['post', '/paud-assessment/assessments'],
    ['put', '/paud-assessment/assessments/a-1'],
    ['delete', '/paud-assessment/assessments/a-1'],
    ['post', '/paud-assessment/evidences'],
    ['delete', '/paud-assessment/evidences/e-1'],
    ['post', '/paud-assessment/indicators'],
    ['post', '/paud-assessment/reports/r-1/finalize'],
  ];

  it.each(WRITES)('%s %s refuses santri, wali and TU', async (method, path) => {
    for (const who of ['santri', 'wali', 'tu']) {
      expect((await call(method, path, who)).status, who).toBe(403);
    }
  });

  it.each(WRITES)('%s %s lets a TK teacher through the guard', async (method, path) => {
    expect([401, 403]).not.toContain((await call(method, path, 'guru')).status);
  });

  it('reads are for staff: a wali is refused, TU is not', async () => {
    expect((await call('get', '/paud-assessment/assessments', 'wali')).status).toBe(403);
    expect([401, 403]).not.toContain(
      (await call('get', '/paud-assessment/assessments', 'tu')).status
    );
  });
});
