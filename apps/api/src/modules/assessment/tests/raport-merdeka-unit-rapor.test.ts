import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Rapor terbit atas nama unit ROMBEL tahun ajarannya (audit #489 bagian 3).
 *
 * Santri yang naik dari SD IT ke SMP IT membawa `students.unit_id` SMP IT. Rapor
 * SD IT-nya yang dicetak ulang dulu berkop "SMP IT Cipansor", ditandatangani
 * "Kepala SMP IT", fasenya dihitung dari jenjang SMP — dan admin SD IT yang
 * menerbitkannya ditolak membukanya.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    reportCard: { findUnique: vi.fn() },
    grade: { findMany: vi.fn() },
    classEnrollment: { findMany: vi.fn() },
    userRoleAssignment: { findFirst: vi.fn() },
    teacher: { findFirst: vi.fn() },
    studentUnitIdentifier: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import type { JwtPayload } from '@/lib/jwt';
import { RaportMerdekaService } from '../raport-merdeka.service';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const SD = { id: 'unit-sd', name: 'SD IT Cipansor', type: 'SD' };
const SMP = { id: 'unit-smp', name: 'SMP IT Cipansor', type: 'SMP' };

const tahunLalu = {
  id: 'ay-2025',
  name: '2025/2026',
  startDate: new Date('2025-07-14'),
  endDate: new Date('2026-06-30'),
};

/** Santri kini di SMP IT; rombel tahun ajaran rapor adalah 6A SD IT. */
const santriPindah = {
  id: 's1',
  nis: 'SMP-0099',
  nisn: '0123456789',
  user: { name: 'Fulan' },
  unit: SMP,
  enrollments: [
    {
      classId: 'kelas-6a',
      class: {
        id: 'kelas-6a',
        name: '6A',
        level: '6',
        unitId: SD.id,
        unit: SD,
        academicYear: tahunLalu,
        homeroomTeacher: null,
      },
    },
  ],
};

const akun = (roleCode: string, unitId: string | null): JwtPayload =>
  ({
    id: 'u1',
    sub: 'u1',
    email: 'u1@cipansor.or.id',
    roleId: 'r1',
    roleCode,
    role: 'UNIT_ADMIN',
    unitId,
    permissions: [],
    type: 'access',
  }) as JwtPayload;

beforeEach(() => {
  db.student.findUnique.mockResolvedValue(santriPindah);
  db.reportCard.findUnique.mockResolvedValue(null);
  db.grade.findMany.mockResolvedValue([]);
  db.studentUnitIdentifier.findMany.mockResolvedValue([
    { studentId: 's1', unitId: SD.id, nis: 'SD-0007' },
    { studentId: 's1', unitId: SMP.id, nis: 'SMP-0099' },
  ]);
  db.classEnrollment.findMany.mockResolvedValue([{ classId: 'kelas-6a', class: { unitId: SD.id } }]);
  // Pembantu privat yang tidak diuji di sini (P5, ekskul, tahfidz, kehadiran).
  const svc = RaportMerdekaService as unknown as Record<
    'getP5Projects' | 'getEkstrakurikulerData' | 'getTahfidzSummary' | 'getAttendanceSummary',
    () => Promise<unknown>
  >;
  vi.spyOn(svc, 'getP5Projects').mockResolvedValue([]);
  vi.spyOn(svc, 'getEkstrakurikulerData').mockResolvedValue([]);
  vi.spyOn(svc, 'getTahfidzSummary').mockResolvedValue({});
  vi.spyOn(svc, 'getAttendanceSummary').mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const model of Object.values(db)) for (const fn of Object.values(model)) fn.mockReset();
});

describe('isi rapor Merdeka tahun lalu untuk santri yang sudah pindah unit', () => {
  it('kop, jenis unit, jabatan kepala, fase, dan NIS milik unit rombelnya', async () => {
    const rapor = await RaportMerdekaService.generateRaportMerdeka('s1', tahunLalu.id, 2, undefined, {
      skipScopeValidation: true,
    });
    expect(rapor.siswa).toMatchObject({
      unit: 'SD IT Cipansor',
      unitType: 'SD',
      fase: 'C',
      nis: 'SD-0007',
    });
    expect(rapor.pimpinanUnit.jabatan).toBe('Kepala SD IT Cipansor');
  });
});

describe('siapa boleh membuka rapor tahun lalu itu', () => {
  it('admin SD IT (unit penerbit) — dulu ditolak karena santrinya kini di SMP IT', async () => {
    db.student.findUnique.mockResolvedValue({ unitId: SMP.id });
    await expect(
      RaportMerdekaService.validateStudentScope(akun('SDIT_ADMIN', SD.id), 's1', tahunLalu.id)
    ).resolves.toBeUndefined();
  });

  it('admin SMP IT (unit santri sekarang) tetap boleh', async () => {
    db.student.findUnique.mockResolvedValue({ unitId: SMP.id });
    await expect(
      RaportMerdekaService.validateStudentScope(akun('SMPIT_ADMIN', SMP.id), 's1', tahunLalu.id)
    ).resolves.toBeUndefined();
  });

  it('admin unit ketiga tetap ditolak', async () => {
    db.student.findUnique.mockResolvedValue({ unitId: SMP.id });
    await expect(
      RaportMerdekaService.validateStudentScope(akun('SMAQ_ADMIN', 'unit-sma'), 's1', tahunLalu.id)
    ).rejects.toThrow(/unit lain/);
  });
});
