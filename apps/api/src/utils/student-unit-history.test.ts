import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as fs from 'fs';
import * as path from 'path';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    studentUnitEnrollment: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    student: { findUnique: vi.fn() },
    class: { findUnique: vi.fn() },
    academicYear: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  unitAt,
  unitInAcademicYear,
  studentIdsInUnitAt,
  studentIdsInUnitForYear,
  recordUnitEnrollmentFromClass,
  ensureUnitEnrollment,
  studentInUnitAt,
  studentInUnitForYear,
  closeUnitEnrollments,
} from './student-unit-history';

/**
 * Yang diuji di sini adalah pembedaan yang jadi seluruh alasan tabel ini ada:
 * unit SEKARANG versus unit SAAT ITU. Seorang santri yang naik dari TK ke SD IT
 * punya satu `students.unit_id` (SD IT) dan dua baris riwayat, dan pertanyaan
 * "berapa santri TK tahun lalu" harus dijawab dari yang kedua.
 */
const TK = 'unit-tkq';
const SDIT = 'unit-sdit';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('unit santri pada satu tanggal', () => {
  it('menjawab dari riwayat, bukan dari unit sekarang', async () => {
    vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mockResolvedValue({ unitId: TK });
    // Sengaja disiapkan dan TIDAK boleh terpakai: kalau helper ini jatuh ke
    // `students.unit_id` padahal riwayatnya ada, jawabannya SD IT dan seluruh
    // angka TK tahun lalu pindah unit tanpa ada yang menyentuh data.
    vi.mocked(prisma.student.findUnique as any).mockResolvedValue({ unitId: SDIT });

    const hasil = await unitAt('santri-1', new Date('2025-03-01'));

    expect(hasil).toEqual({ unitId: TK, source: 'history' });
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });

  it('mencari baris yang periodenya mencakup tanggal itu, yang terbaru menang', async () => {
    vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mockResolvedValue({ unitId: SDIT });

    await unitAt('santri-1', new Date('2026-08-20'));

    const arg = vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mock.calls[0][0];
    expect(arg.where.studentId).toBe('santri-1');
    expect(arg.where.entryDate).toEqual({ lte: new Date('2026-08-20') });
    // Baris yang masih berjalan (exitDate null) ikut terhitung — kalau tidak,
    // setiap santri aktif hilang dari laporan hari ini.
    expect(arg.where.OR).toEqual([
      { exitDate: null },
      { exitDate: { gte: new Date('2026-08-20') } },
    ]);
    expect(arg.orderBy).toEqual([{ entryDate: 'desc' }]);
  });

  it('menandai jawaban yang terpaksa memakai unit sekarang', async () => {
    // Santri tanpa riwayat sama sekali (data lama yang tidak punya bukti kelas).
    vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mockResolvedValue(null);
    vi.mocked(prisma.student.findUnique as any).mockResolvedValue({ unitId: SDIT });

    const hasil = await unitAt('santri-2', new Date('2020-01-01'));

    // Jawabannya tetap diberikan, tapi sumbernya dikatakan apa adanya supaya
    // pemanggil yang butuh ketepatan bisa menolaknya.
    expect(hasil).toEqual({ unitId: SDIT, source: 'current' });
  });

  it('santri yang tidak ada menjawab unknown, bukan unit mana pun', async () => {
    vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mockResolvedValue(null);
    vi.mocked(prisma.student.findUnique as any).mockResolvedValue(null);

    expect(await unitAt('hantu', new Date())).toEqual({ unitId: null, source: 'unknown' });
  });
});

describe('unit santri pada satu tahun ajaran', () => {
  it('memakai tahun ajarannya, bukan tanggal', async () => {
    vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mockResolvedValue({ unitId: TK });

    const hasil = await unitInAcademicYear('santri-1', 'ta-2025');

    expect(hasil).toEqual({ unitId: TK, source: 'history' });
    const arg = vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mock.calls[0][0];
    expect(arg.where).toEqual({ studentId: 'santri-1', academicYearId: 'ta-2025' });
  });

  it('jatuh ke unit sekarang bila tahun itu tidak punya baris', async () => {
    vi.mocked(prisma.studentUnitEnrollment.findFirst as any).mockResolvedValue(null);
    vi.mocked(prisma.student.findUnique as any).mockResolvedValue({ unitId: SDIT });

    expect(await unitInAcademicYear('santri-1', 'ta-2019')).toEqual({
      unitId: SDIT,
      source: 'current',
    });
  });
});

describe('daftar santri satu unit', () => {
  it('pada satu tanggal: hanya yang periodenya mencakup tanggal itu', async () => {
    vi.mocked(prisma.studentUnitEnrollment.findMany as any).mockResolvedValue([
      { studentId: 's-1' },
      { studentId: 's-2' },
    ]);

    const ids = await studentIdsInUnitAt(TK, new Date('2025-03-01'));

    expect(ids).toEqual(['s-1', 's-2']);
    const arg = vi.mocked(prisma.studentUnitEnrollment.findMany as any).mock.calls[0][0];
    expect(arg.where.unitId).toBe(TK);
    expect(arg.where.entryDate).toEqual({ lte: new Date('2025-03-01') });
    // Satu santri bisa punya beberapa baris di unit yang sama (tahun demi
    // tahun); tanpa distinct ia terhitung berkali-kali.
    expect(arg.distinct).toEqual(['studentId']);
  });

  it('sepanjang satu tahun ajaran', async () => {
    vi.mocked(prisma.studentUnitEnrollment.findMany as any).mockResolvedValue([
      { studentId: 's-3' },
    ]);

    const ids = await studentIdsInUnitForYear(SDIT, 'ta-2026');

    expect(ids).toEqual(['s-3']);
    const arg = vi.mocked(prisma.studentUnitEnrollment.findMany as any).mock.calls[0][0];
    expect(arg.where).toEqual({ unitId: SDIT, academicYearId: 'ta-2026' });
    expect(arg.distinct).toEqual(['studentId']);
  });
});

describe('menulis riwayat dari pendaftaran kelas', () => {
  const TA = {
    startDate: new Date('2026-07-15'),
    endDate: new Date('2027-06-30'),
  };

  it('mencatat unit dan tahun ajaran rombelnya, dengan tanggal hari itu', async () => {
    vi.mocked(prisma.class.findUnique as any).mockResolvedValue({
      unitId: SDIT,
      academicYearId: 'ta-2026',
      level: '1',
      academicYear: TA,
    });

    await recordUnitEnrollmentFromClass(prisma as any, 's-1', 'kelas-1', new Date('2026-09-12'));

    const arg = vi.mocked(prisma.studentUnitEnrollment.upsert as any).mock.calls[0][0];
    expect(arg.create).toMatchObject({
      studentId: 's-1',
      unitId: SDIT,
      academicYearId: 'ta-2026',
      entryDate: new Date('2026-09-12'),
      gradeLevel: '1',
    });
  });

  it('mendaftar ke rombel tahun depan tidak berarti masuk unit itu hari ini', async () => {
    // Tanggal masuknya tanggal mulai tahun ajaran itu, bukan hari pendaftaran —
    // kalau tidak, santri tercatat sudah berada di unit itu berbulan-bulan
    // sebelum tahun ajarannya dimulai, dan setiap laporan "pada tanggal X"
    // ikut salah.
    vi.mocked(prisma.class.findUnique as any).mockResolvedValue({
      unitId: SDIT,
      academicYearId: 'ta-2027',
      level: '2',
      academicYear: { startDate: new Date('2027-07-15'), endDate: new Date('2028-06-30') },
    });

    await recordUnitEnrollmentFromClass(prisma as any, 's-1', 'kelas-depan', new Date('2026-09-12'));

    const arg = vi.mocked(prisma.studentUnitEnrollment.upsert as any).mock.calls[0][0];
    expect(arg.create.entryDate).toEqual(new Date('2027-07-15'));
  });

  it('tidak menimpa tanggal masuk baris yang sudah ada — hanya tingkatnya', async () => {
    vi.mocked(prisma.class.findUnique as any).mockResolvedValue({
      unitId: SDIT,
      academicYearId: 'ta-2026',
      level: '2',
      academicYear: TA,
    });

    await recordUnitEnrollmentFromClass(prisma as any, 's-1', 'kelas-2', new Date('2027-01-10'));

    const arg = vi.mocked(prisma.studentUnitEnrollment.upsert as any).mock.calls[0][0];
    // Pindah rombel di tengah tahun tidak membuat santri "baru masuk" unit itu.
    expect(arg.update).toEqual({ gradeLevel: '2' });
    expect(Object.keys(arg.update)).not.toContain('entryDate');
  });

  it('rombel yang tidak ada tidak menulis apa pun', async () => {
    vi.mocked(prisma.class.findUnique as any).mockResolvedValue(null);

    await recordUnitEnrollmentFromClass(prisma as any, 's-1', 'kelas-hantu');

    expect(prisma.studentUnitEnrollment.upsert).not.toHaveBeenCalled();
  });
});

describe('invarian riwayat dijaga basis data', () => {
  // Helper di atas adalah satu jalur tulis; impor dan perbaikan manual bukan.
  // Uji ini membaca SQL migrasinya, bukan salinan daftarnya, sehingga penjaga
  // yang dihapus di migrasi berikutnya tetap tertangkap di sini.
  const MIGRASI = path.resolve(
    __dirname,
    '../../prisma/migrations/20260912020000_student_unit_enrollment/migration.sql'
  );

  it('tanggal keluar tidak boleh mendahului tanggal masuk', () => {
    const sql = fs.readFileSync(MIGRASI, 'utf8');
    expect(sql).toMatch(/CHECK\s*\(\s*"exit_date"\s+IS\s+NULL\s+OR\s+"exit_date"\s*>=\s*"entry_date"\s*\)/i);
  });

  it('satu baris per santri per unit per tahun ajaran', () => {
    const sql = fs.readFileSync(MIGRASI, 'utf8');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?"student_unit_enrollments"\s*\(\s*"student_id",\s*"unit_id",\s*"academic_year_id"\s*\)/i
    );
  });

  it('alasan keluar dibatasi daftar yang dikenal', () => {
    const sql = fs.readFileSync(MIGRASI, 'utf8');
    const m = sql.match(/student_unit_enrollments_exit_reason_check[\s\S]*?IN \(([^)]*)\)/i);
    expect(m).toBeTruthy();
    const nilai = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(nilai).toContain('LULUS');
    expect(nilai).toContain('PINDAH_UNIT');
  });
});

describe('potongan penyaring untuk laporan', () => {
  const KAPAN = new Date('2025-03-01');

  it('menyaring lewat baris riwayat yang periodenya mencakup tanggal itu', () => {
    const f = studentInUnitAt(TK, KAPAN, { termasukTanpaRiwayat: false }) as any;

    expect(f.unitEnrollments.some).toEqual({
      unitId: TK,
      entryDate: { lte: KAPAN },
      OR: [{ exitDate: null }, { exitDate: { gte: KAPAN } }],
    });
    // Tanpa opsi itu, penyaringnya tidak boleh menyentuh `students.unit_id`
    // sama sekali — di situlah letak seluruh perbedaannya. Satu kunci di
    // tingkat atas berarti tidak ada penyaring kolom unit yang menyelinap.
    expect(Object.keys(f)).toEqual(['unitEnrollments']);
  });

  it('secara bawaan tetap memasukkan santri yang belum punya riwayat', () => {
    // Santri yang lahir lewat jalur yang belum menulis riwayat tidak boleh
    // menghilang dari laporan. Laporan yang diam-diam kehilangan orang lebih
    // berbahaya daripada laporan yang memakai unit sekarang.
    const f = studentInUnitAt(TK, KAPAN) as any;

    expect(f.OR).toHaveLength(2);
    expect(f.OR[1]).toEqual({ unitEnrollments: { none: {} }, unitId: TK });
  });

  it('bentuk per tahun ajaran memakai tahunnya, bukan tanggal', () => {
    const f = studentInUnitForYear(SDIT, 'ta-2026', { termasukTanpaRiwayat: false }) as any;
    expect(f).toEqual({ unitEnrollments: { some: { unitId: SDIT, academicYearId: 'ta-2026' } } });
  });
});

describe('santri yang dibuat tanpa rombel', () => {
  it('tetap dapat baris riwayat pada tahun ajaran aktif', async () => {
    vi.mocked(prisma.academicYear.findFirst as any).mockResolvedValue({
      id: 'ta-2026',
      startDate: new Date('2026-07-15'),
      endDate: new Date('2027-06-30'),
    });

    await ensureUnitEnrollment(prisma as any, 's-9', SDIT, new Date('2026-09-12'));

    const arg = vi.mocked(prisma.studentUnitEnrollment.upsert as any).mock.calls[0][0];
    expect(arg.create).toEqual({
      studentId: 's-9',
      unitId: SDIT,
      academicYearId: 'ta-2026',
      entryDate: new Date('2026-09-12'),
    });
    // Baris yang sudah ada tidak disentuh: santri ini memang sudah di sana.
    expect(arg.update).toEqual({});
  });

  it('tanpa tahun ajaran aktif tidak menulis apa pun, dan itu bukan kegagalan', async () => {
    vi.mocked(prisma.academicYear.findFirst as any).mockResolvedValue(null);

    await ensureUnitEnrollment(prisma as any, 's-9', SDIT);

    expect(prisma.studentUnitEnrollment.upsert).not.toHaveBeenCalled();
  });
});

describe('menutup keanggotaan unit (kelulusan)', () => {
  const db = prisma as unknown as {
    studentUnitEnrollment: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };

  it('hanya baris TERBUKA di unit itu, dengan tanggal dan alasan keluar', async () => {
    db.studentUnitEnrollment.findMany.mockResolvedValue([
      { id: 'sd-2025', entryDate: new Date('2025-07-14') },
    ]);

    const n = await closeUnitEnrollments(prisma, {
      studentId: 's1',
      unitId: SDIT,
      exitDate: new Date('2026-06-20'),
      exitReason: 'LULUS',
    });

    expect(n).toBe(1);
    expect(db.studentUnitEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 's1', unitId: SDIT, exitDate: null } })
    );
    expect(db.studentUnitEnrollment.update).toHaveBeenCalledWith({
      where: { id: 'sd-2025' },
      data: { exitDate: new Date('2026-06-20'), exitReason: 'LULUS' },
    });
  });

  it('baris yang masuknya SESUDAH tanggal keluar ditutup pada tanggal masuknya (CHECK exit >= entry)', async () => {
    db.studentUnitEnrollment.findMany.mockResolvedValue([
      { id: 'sd-2026', entryDate: new Date('2026-07-13') },
    ]);

    await closeUnitEnrollments(prisma, {
      studentId: 's1',
      unitId: SDIT,
      exitDate: new Date('2026-06-20'),
      exitReason: 'LULUS',
    });

    expect(db.studentUnitEnrollment.update).toHaveBeenCalledWith({
      where: { id: 'sd-2026' },
      data: { exitDate: new Date('2026-07-13'), exitReason: 'LULUS' },
    });
  });

  it('alasan keluar yang ditulis aplikasi termasuk daftar CHECK migrasinya', () => {
    const migrasi = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20260912020000_student_unit_enrollment/migration.sql'),
      'utf-8'
    );
    const sumber = fs.readFileSync(path.join(__dirname, 'student-unit-history.ts'), 'utf-8');
    const tipe = sumber.slice(sumber.indexOf('export type UnitExitReason'), sumber.indexOf(';', sumber.indexOf('export type UnitExitReason')));
    const nilai = [...tipe.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(nilai.length).toBeGreaterThan(0);
    for (const v of nilai) expect(migrasi, v).toContain(`'${v}'`);
  });
});
