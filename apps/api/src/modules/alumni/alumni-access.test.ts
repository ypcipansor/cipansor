import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

/**
 * Modul alumni dulu hanya memasang `authenticate`. Di rig (2026-09-14) akun
 * santri SD IT membaca alumni SMP IT lengkap dengan email/telepon/alamat,
 * membuat dan menghapus alumni, dan meluluskan santri SMP IT lewat
 * `POST /alumni/from-student/:id` — semuanya 200. Uji ini memaku ketiga
 * tingkat akses di alumni-access.ts lewat router yang sesungguhnya.
 */

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    alumni: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    student: { findFirst: vi.fn(), update: vi.fn() },
    alumniDonation: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    alumniEvent: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// Token uji: `authenticate` diganti pembaca header, sisanya (authorize) asli.
vi.mock('@/middleware/auth', async (importOriginal) => {
  const asli = await importOriginal<typeof import('@/middleware/auth')>();
  return {
    ...asli,
    authenticate: (req: Request, _res: Response, next: NextFunction) => {
      const roleCode = String(req.headers['x-peran'] ?? '');
      const unitId = req.headers['x-unit'] ? String(req.headers['x-unit']) : null;
      req.user = {
        id: 'u-uji',
        roleCode,
        role: asli.deriveLegacyRole(roleCode),
        unitId,
      } as unknown as Request['user'];
      next();
    },
  };
});

import { prisma } from '@/lib/prisma';
import { errorHandler } from '@/middleware/error';
import router from './alumni.routes';
import { redactAlumniFor } from './alumni-access';
import * as service from './alumni.service';

const db = prisma as unknown as {
  alumni: Record<
    'findMany' | 'findFirst' | 'count' | 'create' | 'update',
    ReturnType<typeof vi.fn>
  >;
  student: Record<'findFirst' | 'update', ReturnType<typeof vi.fn>>;
  alumniDonation: Record<'findMany' | 'count' | 'aggregate', ReturnType<typeof vi.fn>>;
  alumniEvent: Record<'create' | 'findFirst' | 'update', ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

const SD = '11111111-1111-4111-8111-111111111111';
const SMP = '22222222-2222-4222-8222-222222222222';
const ALUMNI_SMP = '33333333-3333-4333-8333-333333333333';
const SANTRI_SMP = '44444444-4444-4444-8444-444444444444';

const app = express();
app.use(express.json());
app.use('/alumni', router);
app.use(errorHandler);

const sebagai = (peran: string, unit: string | null) => (req: request.Test) =>
  unit ? req.set('x-peran', peran).set('x-unit', unit) : req.set('x-peran', peran);

const barisAlumni = (over: Record<string, unknown> = {}) => ({
  id: ALUMNI_SMP,
  unitId: SMP,
  studentId: SANTRI_SMP,
  registrationNo: 'ALM-2025-0001',
  name: 'Fulanah',
  gender: 'FEMALE',
  graduationYear: 2025,
  email: 'fulanah@contoh.id',
  phone: '081200000001',
  address: 'Jl. Contoh 1',
  city: 'Depok',
  birthPlace: 'Bogor',
  birthDate: '2008-01-01',
  notes: 'catatan BK',
  student: { id: SANTRI_SMP, nis: '2025SMP1' },
  donations: [{ id: 'd1', amount: '500000' }],
  ...over,
});

beforeEach(() => {
  db.alumni.findMany.mockResolvedValue([barisAlumni()]);
  db.alumni.count.mockResolvedValue(1);
});

afterEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === 'function') model.mockReset();
    else for (const fn of Object.values(model)) fn.mockReset();
  }
});

describe('akun santri (SDIT_SISWA) di modul alumni', () => {
  const siswa = sebagai('SDIT_SISWA', SD);

  it.each([
    ['post', '/alumni'],
    ['put', `/alumni/${ALUMNI_SMP}`],
    ['delete', `/alumni/${ALUMNI_SMP}`],
    ['post', `/alumni/from-student/${SANTRI_SMP}`],
    ['post', `/alumni/${ALUMNI_SMP}/careers`],
    ['post', `/alumni/${ALUMNI_SMP}/education`],
    ['post', `/alumni/${ALUMNI_SMP}/donations`],
    ['get', '/alumni/donations/list'],
    ['post', '/alumni/events'],
    ['delete', '/alumni/events/attendees/abc'],
    ['get', '/alumni/stats/outcome'],
  ] as const)('%s %s → 403, tanpa menyentuh basis data', async (method, path) => {
    const res = await siswa(request(app)[method](path).send({}));
    expect(res.status).toBe(403);
    expect(db.student.findFirst).not.toHaveBeenCalled();
    expect(db.alumni.create).not.toHaveBeenCalled();
    expect(db.alumni.update).not.toHaveBeenCalled();
    expect(db.alumniDonation.findMany).not.toHaveBeenCalled();
  });

  it('direktori tetap terbuka, tetapi kontak, data diri, NIS, dan donasi dibuang', async () => {
    const res = await siswa(request(app).get('/alumni'));
    expect(res.status).toBe(200);
    const [baris] = res.body.data;
    expect(baris).toMatchObject({ name: 'Fulanah', graduationYear: 2025, city: 'Depok' });
    for (const kolom of [
      'email',
      'phone',
      'address',
      'birthPlace',
      'birthDate',
      'notes',
      'student',
      'studentId',
    ]) {
      expect(baris[kolom], kolom).toBeNull();
    }
    expect(baris.donations).toEqual([]);
  });
});

describe('pengelola alumni', () => {
  it('tata usaha SMP IT membaca data diri alumni unitnya', async () => {
    const res = await sebagai('SMPIT_TATA_USAHA', SMP)(request(app).get('/alumni'));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      email: 'fulanah@contoh.id',
      student: { nis: '2025SMP1' },
    });
  });

  it('admin SD IT TIDAK membaca data diri alumni SMP IT (baris tetap tampil di direktori)', async () => {
    const res = await sebagai('SDIT_ADMIN', SD)(request(app).get('/alumni'));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ name: 'Fulanah', email: null, phone: null });
  });

  it('admin SD IT meluluskan santri SMP IT → 404, statusnya tidak disentuh', async () => {
    db.student.findFirst.mockResolvedValue({ id: SANTRI_SMP, unitId: SMP, user: { name: 'X' } });
    const res = await sebagai(
      'SDIT_ADMIN',
      SD
    )(request(app).post(`/alumni/from-student/${SANTRI_SMP}`).send({}));
    expect(res.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.student.update).not.toHaveBeenCalled();
  });

  it('admin SD IT mengubah alumni SMP IT → 404', async () => {
    db.alumni.findFirst.mockResolvedValue({ id: ALUMNI_SMP, unitId: SMP });
    const res = await sebagai(
      'SDIT_ADMIN',
      SD
    )(request(app).put(`/alumni/${ALUMNI_SMP}`).send({ name: 'Diganti' }));
    expect(res.status).toBe(404);
    expect(db.alumni.update).not.toHaveBeenCalled();
  });

  it('admin SD IT membuat alumni untuk unit SMP IT → 403', async () => {
    const res = await sebagai(
      'SDIT_ADMIN',
      SD
    )(
      request(app)
        .post('/alumni')
        .send({ unitId: SMP, name: 'Titipan', gender: 'MALE', graduationYear: 2020 })
    );
    expect(res.status).toBe(403);
    expect(db.alumni.create).not.toHaveBeenCalled();
  });

  it('tata usaha SMP IT meluluskan santri unitnya sendiri → sampai ke transaksi', async () => {
    db.student.findFirst.mockResolvedValue({
      id: SANTRI_SMP,
      unitId: SMP,
      status: 'active',
      gender: 'FEMALE',
      user: { name: 'Fulanah', email: null },
      unit: { name: 'SMP IT Cipansor' },
      enrollments: [],
    });
    db.alumni.count.mockResolvedValue(0);
    db.$transaction.mockResolvedValue([{ id: 'baru', unitId: SMP }]);
    const res = await sebagai(
      'SMPIT_TATA_USAHA',
      SMP
    )(request(app).post(`/alumni/from-student/${SANTRI_SMP}`).send({}));
    expect(res.status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('kepala sekolah boleh membaca analisis outcome, tidak boleh menulis', async () => {
    const kepala = sebagai('SMPIT_KEPALA_SEKOLAH', SMP);
    db.alumni.findMany.mockResolvedValue([]);
    expect((await kepala(request(app).get('/alumni/stats/outcome'))).status).toBe(200);
    expect((await kepala(request(app).delete(`/alumni/${ALUMNI_SMP}`))).status).toBe(403);
  });

  it('pengawas yayasan (tanpa unit) membaca outcome semua unit — dulu 403 karena hanya SUPER_ADMIN dikenal', async () => {
    db.alumni.findMany.mockResolvedValue([]);
    const res = await sebagai('YAYASAN_PENGAWAS', null)(request(app).get('/alumni/stats/outcome'));
    expect(res.status).toBe(200);
    expect(db.alumni.findMany.mock.calls[0][0].where).not.toHaveProperty('unitId');
  });
});

describe('lingkup unit di service', () => {
  it('daftar donasi pengelola satu unit hanya donasi untuk unitnya atau dari alumninya', async () => {
    db.alumniDonation.findMany.mockResolvedValue([]);
    db.alumniDonation.count.mockResolvedValue(0);
    db.alumniDonation.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });
    await service.getDonations({ page: 1, limit: 10 } as never, {
      roleCode: 'SDIT_ADMIN',
      role: 'UNIT_ADMIN',
      unitId: SD,
    });
    expect(db.alumniDonation.findMany.mock.calls[0][0].where.OR).toEqual([
      { unitId: SD },
      { alumni: { unitId: SD } },
    ]);
  });

  it('acara yang dibuat pengelola satu unit tanpa menyebut unit menjadi acara unitnya', async () => {
    db.alumniEvent.create.mockResolvedValue({});
    await service.createEvent(
      { name: 'Reuni', type: 'REUNION', eventDate: '2026-12-01T00:00:00.000Z' } as never,
      { roleCode: 'SDIT_TATA_USAHA', role: 'STAFF', unitId: SD }
    );
    expect(db.alumniEvent.create.mock.calls[0][0].data.unitId).toBe(SD);
  });

  it('akun ber-peran pengelola tanpa unit tidak bisa membuat acara', async () => {
    await expect(
      service.createEvent(
        { name: 'Reuni', type: 'REUNION', eventDate: '2026-12-01T00:00:00.000Z' } as never,
        { roleCode: 'SDIT_TATA_USAHA', role: 'STAFF', unitId: null }
      )
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.alumniEvent.create).not.toHaveBeenCalled();
  });
});

describe('redactAlumniFor', () => {
  it('bentuk objeknya tetap (kolom null, bukan hilang) supaya layar menampilkan "-"', () => {
    const hasil = redactAlumniFor({ roleCode: 'SMPIT_ALUMNI', unitId: SMP }, barisAlumni());
    expect(Object.keys(hasil).sort()).toEqual(Object.keys(barisAlumni()).sort());
  });
});
