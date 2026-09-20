import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Lulus per unit (audit #489 bagian 3b-1).
 *
 * Santri TK → SD IT → SMP IT lulus tiga kali, dari tiga unit. Dulu
 * `alumni.student_id` unik (kelulusan kedua ditolak P2002), tahun lulus diambil dari
 * `students.graduate_year` lama, rombel unit itu tetap aktif, dan riwayat unit
 * tidak pernah ditutup — santri terhitung di unit asal selamanya.
 */

vi.mock('@/lib/prisma', () => {
  const db = {
    student: { findFirst: vi.fn(), update: vi.fn() },
    alumni: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    classEnrollment: { updateMany: vi.fn() },
    studentUnitEnrollment: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  // Kedua bentuk: fungsi (sekarang) dan larik (main sebelum 3b-1), supaya bukti
  // merah lawan main gagal karena perilaku, bukan karena bentuk mock.
  db.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db)
  );
  return { prisma: db };
});

import { prisma } from '@/lib/prisma';
import { convertFromStudent } from './alumni.service';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const SD = 'unit-sd';
const tuSd = { roleCode: 'SDIT_TATA_USAHA', role: 'STAFF', unitId: SD };

const santriSd = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  unitId: SD,
  status: 'active',
  gender: 'FEMALE',
  graduateYear: 2020, // lulus TK dulu
  birthPlace: null,
  birthDate: null,
  parentPhone: null,
  address: null,
  user: { name: 'Fulanah', email: null },
  unit: { name: 'SD IT Cipansor' },
  enrollments: [{ class: { name: '6A', unitId: SD } }],
  ...over,
});

beforeEach(() => {
  db.student.findFirst.mockResolvedValue(santriSd());
  db.alumni.findFirst.mockResolvedValue(null);
  db.alumni.count.mockResolvedValue(3);
  db.alumni.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', ...data }));
  db.studentUnitEnrollment.findMany.mockResolvedValue([{ id: 'sue-sd-2025', entryDate: new Date('2025-07-14') }]);
});

afterEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === 'function') continue;
    for (const fn of Object.values(model)) fn.mockClear();
  }
});

describe('meluluskan santri dari unitnya sekarang', () => {
  it('tahun lulus dari tanggal lulus, bukan students.graduate_year lama; kelas terakhir dari rombel aktif', async () => {
    const alumni = await convertFromStudent('s1', { graduationDate: '2026-06-20T12:00:00.000Z' }, tuSd);

    expect(alumni).toMatchObject({ unitId: SD, graduationYear: 2026, lastClass: '6A', registrationNo: 'ALM-2026-0004' });
    expect(db.student.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'alumni', graduateYear: 2026 },
    });
  });

  it('rombel unit itu selesai dan riwayat unitnya ditutup LULUS pada tanggal lulus', async () => {
    await convertFromStudent('s1', { graduationDate: '2026-06-20T12:00:00.000Z' }, tuSd);

    expect(db.classEnrollment.updateMany).toHaveBeenCalledWith({
      where: { studentId: 's1', status: 'active', class: { unitId: SD } },
      data: { status: 'completed' },
    });
    expect(db.studentUnitEnrollment.update).toHaveBeenCalledWith({
      where: { id: 'sue-sd-2025' },
      data: { exitDate: new Date('2026-06-20T12:00:00.000Z'), exitReason: 'LULUS' },
    });
  });

  it('santri yang sudah alumni tidak bisa diluluskan lagi → 409, tanpa menulis', async () => {
    db.student.findFirst.mockResolvedValue(santriSd({ status: 'alumni' }));

    await expect(convertFromStudent('s1', {}, tuSd)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.alumni.create).not.toHaveBeenCalled();
    expect(db.student.update).not.toHaveBeenCalled();
  });

  it('lulus dua kali dari unit yang sama pada tahun yang sama → 409 dengan pesan terbaca, bukan P2002 mentah', async () => {
    db.alumni.findFirst.mockResolvedValue({ id: 'sudah' });

    await expect(
      convertFromStudent('s1', { graduationDate: '2026-06-20T12:00:00.000Z' }, tuSd)
    ).rejects.toThrow('Santri ini sudah tercatat lulus dari SD IT Cipansor pada 2026.');
    expect(db.alumni.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 's1', unitId: SD, graduationYear: 2026 } })
    );
  });
});

describe('satu pintu kelulusan', () => {
  it('rute yang dipanggil tombol Luluskan ada dan dijaga peran pengelola alumni', () => {
    // Pasangannya di web: apps/web/src/hooks/use-students.test.tsx.
    const rute = fs.readFileSync(path.join(__dirname, 'alumni.routes.ts'), 'utf-8');
    expect(rute).toMatch(/router\.post\('\/from-student\/:studentId', manageAlumni, controller\.convertFromStudent\)/);
  });

  it('tidak ada jalur kelulusan massal tanpa penjaga lingkup unit dan riwayat', async () => {
    const svc = await import('./alumni.service');
    expect(Object.keys(svc)).not.toContain('batchGraduateStudents');
  });
});

describe('basis data mengizinkan satu kelulusan per unit per tahun', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../../../prisma/schema.prisma'), 'utf-8');
  const modelAlumni = schema.slice(schema.indexOf('model Alumni {'), schema.indexOf('}', schema.indexOf('model Alumni {')));

  it('schema: studentId tidak lagi unik sendirian; unik (studentId, unitId, graduationYear)', () => {
    const baris = modelAlumni.split('\n').find((l) => /^\s*studentId\s/.test(l)) ?? '';
    expect(baris).not.toContain('@unique');
    expect(modelAlumni).toContain('@@unique([studentId, unitId, graduationYear])');
  });

  it('migrasi membuang indeks unik lama dan membuat yang baru dengan nama yang dikira Prisma', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../../prisma/migrations/20260914020000_alumni_per_unit/migration.sql'),
      'utf-8'
    );
    expect(sql).toMatch(/DROP INDEX IF EXISTS "alumni_student_id_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "alumni_student_id_unit_id_graduation_year_key"/);
    // Hanya menambah/melonggarkan: image :rollback tetap jalan.
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/i);
  });
});
