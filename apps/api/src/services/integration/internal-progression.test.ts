import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Progresi internal: lulusan satu unit mendaftar ke unit berikutnya lewat SPMB
 * (audit #489 bagian 3b-2).
 *
 * Di main, orkestrator SELALU membuat akun baru, sehingga
 * `student.findUnique({ userId })` selalu null dan cabang "santri lama" mati:
 * lulusan SD IT yang mendaftar SMP IT menjadi ORANG KEDUA (NIS baru, kartu baru,
 * riwayat terputus) — atau ditolak 409 karena NISN-nya "sudah dipakai santri
 * lain", yaitu dirinya sendiri.
 */

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));
vi.mock('../../lib/event-bus', () => ({ eventBus: { emit: emitMock } }));
vi.mock('@/lib/event-bus', () => ({ eventBus: { emit: emitMock } }));
vi.mock('../../lib/prisma', () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: vi.fn() } }));

import { prisma } from '../../lib/prisma';
import { StudentOnboardingOrchestrator } from './student-onboarding.orchestrator';

const SD = 'unit-sd';
const SMP = 'unit-smp';

/** Alumni SD IT 2026 yang kini mendaftar SMP IT. */
const alumniSd = (over: Record<string, unknown> = {}) => ({
  id: 'stud-1',
  userId: 'user-1',
  unitId: SD,
  status: 'alumni',
  nis: 'NIS-2020-SD_IT-0007',
  nisn: '0123456789',
  graduateYear: 2026,
  user: { id: 'user-1', role: 'STUDENT', email: 'fulan@student.cipansor.local' },
  unit: { name: 'SD IT Cipansor' },
  ...over,
});

function buatTx(over: Record<string, unknown> = {}) {
  const tx: Record<string, any> = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    registrant: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'reg-1',
        status: 'ACCEPTED',
        fullName: 'Fulan',
        gender: 'MALE',
        birthPlace: 'Tasikmalaya',
        birthDate: new Date('2014-05-02'),
        address: 'Jl. Santri 1',
        parentName: 'Ayah Fulan',
        parentPhone: '08123456789',
        parentEmail: 'ayah@contoh.id',
        admissionPeriodId: 'period-smp',
        registrationFeePaidAt: new Date('2026-07-01'),
        admissionPeriod: { unitId: SMP, academicYearId: 'ay-2027', registrationFee: 0 },
      }),
      update: vi.fn().mockResolvedValue({ id: 'reg-1' }),
    },
    admissionPeriod: { findUnique: vi.fn().mockResolvedValue({ unitId: SMP, academicYearId: 'ay-2027' }) },
    unit: { findUnique: vi.fn().mockResolvedValue({ type: 'SMP_IT' }) },
    user: { create: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
    role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-smpit-siswa' }) },
    userRoleAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'ura-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    student: {
      findFirst: vi.fn().mockResolvedValue(alumniSd()),
      findUnique: vi.fn().mockResolvedValue(alumniSd()),
      create: vi.fn(),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...alumniSd(), ...data, id: 'stud-1' })),
    },
    studentUnitIdentifier: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    studentUnitEnrollment: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([
        { id: 'sue-sd-2025', entryDate: new Date('2025-07-14'), academicYearId: 'ay-2025' },
      ]),
      update: vi.fn().mockResolvedValue({}),
    },
    studentParent: { count: vi.fn().mockResolvedValue(1), upsert: vi.fn(), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    classEnrollment: { create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    class: { findUnique: vi.fn().mockResolvedValue(null) },
    academicYear: { findFirst: vi.fn().mockResolvedValue({ id: 'ay-2027', startDate: new Date('2027-07-15'), endDate: new Date('2028-06-30') }) },
    medicalRecord: { findFirst: vi.fn().mockResolvedValue({ id: 'med-1' }), create: vi.fn() },
    santriWallet: { findUnique: vi.fn().mockResolvedValue({ id: 'wallet-1' }), create: vi.fn() },
    ...over,
  };
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(tx));
  return tx;
}

const onboard = (opsi: Record<string, unknown> = {}) =>
  StudentOnboardingOrchestrator.processEnrollment('reg-1', SMP, 'admin-1', {
    existingStudentId: 'stud-1',
    academicYearId: 'ay-2027',
    ...opsi,
  });

beforeEach(() => vi.clearAllMocks());

describe('lulusan yang melanjutkan ke unit berikutnya', () => {
  it('memakai akun dan baris santri yang sama — tidak ada orang kedua', async () => {
    const tx = buatTx();

    const hasil = await onboard();

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.student.create).not.toHaveBeenCalled();
    expect(hasil).toMatchObject({ success: true, studentId: 'stud-1', userId: 'user-1', santriLanjutan: true });
    expect(tx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stud-1' },
        data: expect.objectContaining({
          unitId: SMP,
          status: 'active',
          registrants: { connect: { id: 'reg-1' } },
        }),
      })
    );
  });

  it('NIS unit baru diterbitkan; NIS unit lama tidak dibawa', async () => {
    const tx = buatTx();

    await onboard();

    const data = tx.student.update.mock.calls[0][0].data;
    expect(data.nis).toMatch(/^NIS-\d{4}-SMP_IT-/);
    expect(data.nis).not.toBe('NIS-2020-SD_IT-0007');
    expect(tx.studentUnitIdentifier.upsert).toHaveBeenCalled();
  });

  it('riwayat unit lama ditutup LULUS (tahun ajaran berbeda), unit barunya dibiarkan', async () => {
    const tx = buatTx();

    await onboard();

    expect(tx.studentUnitEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ exitDate: null, unitId: { not: SMP } }) })
    );
    expect(tx.studentUnitEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sue-sd-2025' }, data: expect.objectContaining({ exitReason: 'LULUS' }) })
    );
  });

  it('pindah di tengah tahun ajaran yang sama ditandai PINDAH_UNIT', async () => {
    const tx = buatTx();
    tx.studentUnitEnrollment.findMany.mockResolvedValue([
      { id: 'sue-sd-2027', entryDate: new Date('2027-07-15'), academicYearId: 'ay-2027' },
    ]);

    await onboard();

    expect(tx.studentUnitEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ exitReason: 'PINDAH_UNIT' }) })
    );
  });

  it('penugasan peran santri di unit lama dinonaktifkan', async () => {
    const tx = buatTx();

    await onboard();

    expect(tx.userRoleAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', unitId: { not: SMP }, isActive: true }),
        data: { isActive: false },
      })
    );
  });

  it('wali yang sudah tertaut tidak digandakan, dan tidak ada surel "akun baru"', async () => {
    const tx = buatTx();

    await onboard();

    expect(tx.studentParent.upsert).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    const peristiwa = emitMock.mock.calls.map(([nama]) => nama);
    expect(peristiwa).not.toContain('user.password-reset-requested');
  });
});

describe('penjaga: siapa yang boleh ditautkan', () => {
  it('santri AKTIF unit lain tidak bisa ditarik lewat formulir SPMB → 409', async () => {
    const tx = buatTx();
    tx.student.findFirst.mockResolvedValue(alumniSd({ status: 'active' }));

    await expect(onboard()).rejects.toThrow(/alumni/i);
    expect(tx.student.update).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('NISN pendaftaran berbeda dengan NISN santri yang dipilih → 409', async () => {
    const tx = buatTx();

    await expect(onboard({ nisn: '9999999999' })).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('id santri yang tidak ada → 404, bukan membuat santri baru', async () => {
    const tx = buatTx();
    tx.student.findFirst.mockResolvedValue(null);

    await expect(onboard()).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.student.create).not.toHaveBeenCalled();
  });
});

describe('basis data mengizinkan satu santri punya beberapa pendaftaran', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../../../prisma/schema.prisma'), 'utf-8');

  it('schema: registrants 1:n, studentId tidak lagi unik', () => {
    const modelRegistrant = schema.slice(
      schema.indexOf('model Registrant {'),
      schema.indexOf('@@map("registrants")')
    );
    const baris = modelRegistrant.split('\n').find((l) => /^\s*studentId\s/.test(l)) ?? '';
    expect(baris).not.toContain('@unique');
    expect(modelRegistrant).toContain('@@index([studentId])');
    expect(schema).toContain('registrants                 Registrant[]');
  });

  it('migrasi membuang indeks unik lama dan hanya melonggarkan', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../../prisma/migrations/20260920120000_registrant_per_enrollment/migration.sql'),
      'utf-8'
    );
    expect(sql).toMatch(/DROP INDEX IF EXISTS "registrants_student_id_key"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "registrants_student_id_idx"/);
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/i);
  });
});
