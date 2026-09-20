import { prisma } from '@/lib/prisma';

/**
 * "Unit santri ini apa?" dan "saat itu unitnya apa?" adalah dua pertanyaan.
 *
 * `students.unit_id` hanya menjawab yang pertama: unit SEKARANG. Sekitar 85
 * tempat di API ini menyaring lewat `student: { unitId }`, dan hampir semuanya
 * sebenarnya menanyakan yang kedua — berapa santri TK tahun lalu, siapa yang
 * dirawat di unit itu semester itu, berapa penghargaan yang terbit di SD IT.
 * Begitu seorang santri naik dari TK ke SD IT, seluruh riwayat TK-nya ikut
 * berpindah ke SD IT di setiap laporan itu. Tidak ada yang mengubah data; yang
 * salah pertanyaannya.
 *
 * `StudentUnitEnrollment` menyimpan jawabannya (satu baris per santri × unit ×
 * tahun ajaran, dengan tanggal masuk dan tanggal keluar), dan berkas ini satu-
 * satunya pintu ke sana. Laporan tidak menulis kuerinya sendiri: kalau aturan
 * "baris mana yang berlaku pada tanggal X" tersebar, ia akan menyimpang lagi.
 */

/** Klien Prisma atau transaksi — supaya pemanggil bisa ikut transaksinya. */
type Db = Pick<typeof prisma, 'studentUnitEnrollment' | 'student'>;
type DbWrite = Pick<typeof prisma, 'studentUnitEnrollment' | 'class'>;
type DbWriteDirect = Pick<typeof prisma, 'studentUnitEnrollment' | 'academicYear'>;

export type UnitAtSource =
  /** Dari riwayat: ada baris yang periodenya mencakup tanggal itu. */
  | 'history'
  /** Tidak ada baris yang mencakup; dipakai unit santri yang sekarang. */
  | 'current'
  /** Santrinya tidak ada. */
  | 'unknown';

export interface UnitAtResult {
  unitId: string | null;
  source: UnitAtSource;
}

/**
 * Unit santri pada satu tanggal.
 *
 * Sumbernya ikut dikembalikan, dan itu disengaja. Jatuh ke `students.unit_id`
 * adalah jawaban yang MUNGKIN salah — persis kesalahan yang tabel ini dibuat
 * untuk menghapus — jadi pemanggil yang peduli ketepatan (laporan tahun lalu,
 * angka akreditasi) bisa memperlakukan `current` sebagai "tidak diketahui",
 * sementara pemanggil yang cuma butuh label di layar boleh memakainya.
 *
 * Baris dipilih dengan `entry_date <= tanggal` dan (`exit_date` kosong atau
 * `exit_date >= tanggal`). Bila ada lebih dari satu yang cocok — pindah unit di
 * tengah tahun meninggalkan dua baris yang bersinggungan di tanggal peralihan —
 * yang tanggal masuknya paling baru yang menang: itu keadaan paling akhir yang
 * diketahui pada tanggal itu.
 */
export async function unitAt(
  studentId: string,
  at: Date,
  db: Db = prisma
): Promise<UnitAtResult> {
  const row = await db.studentUnitEnrollment.findFirst({
    where: {
      studentId,
      entryDate: { lte: at },
      OR: [{ exitDate: null }, { exitDate: { gte: at } }],
    },
    orderBy: [{ entryDate: 'desc' }],
    select: { unitId: true },
  });

  if (row) return { unitId: row.unitId, source: 'history' };

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { unitId: true },
  });

  if (!student) return { unitId: null, source: 'unknown' };
  return { unitId: student.unitId, source: 'current' };
}

/**
 * Unit santri pada satu tahun ajaran — bentuk yang lebih sering dibutuhkan
 * laporan, karena hampir semuanya dihitung per tahun ajaran, bukan per tanggal.
 */
export async function unitInAcademicYear(
  studentId: string,
  academicYearId: string,
  db: Db = prisma
): Promise<UnitAtResult> {
  const row = await db.studentUnitEnrollment.findFirst({
    where: { studentId, academicYearId },
    orderBy: [{ entryDate: 'desc' }],
    select: { unitId: true },
  });

  if (row) return { unitId: row.unitId, source: 'history' };

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { unitId: true },
  });

  if (!student) return { unitId: null, source: 'unknown' };
  return { unitId: student.unitId, source: 'current' };
}

/**
 * Santri yang ada di satu unit pada satu tanggal.
 *
 * Ini bentuk yang dipakai penyaring laporan: `where: { studentId: { in: … } }`
 * menggantikan `where: { student: { unitId } }`. Sengaja mengembalikan daftar
 * id, bukan potongan `where` Prisma — potongan `where` akan menyeret bentuk
 * relasi tiap modul ke sini, dan tiap modul menamai relasinya berbeda.
 */
export async function studentIdsInUnitAt(
  unitId: string,
  at: Date,
  db: Db = prisma
): Promise<string[]> {
  const rows = await db.studentUnitEnrollment.findMany({
    where: {
      unitId,
      entryDate: { lte: at },
      OR: [{ exitDate: null }, { exitDate: { gte: at } }],
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  return rows.map((r) => r.studentId);
}

/** Santri yang ada di satu unit sepanjang satu tahun ajaran. */
export async function studentIdsInUnitForYear(
  unitId: string,
  academicYearId: string,
  db: Db = prisma
): Promise<string[]> {
  const rows = await db.studentUnitEnrollment.findMany({
    where: { unitId, academicYearId },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  return rows.map((r) => r.studentId);
}

/**
 * Catat keanggotaan unit yang tersirat dari sebuah pendaftaran kelas.
 *
 * Tabel riwayat ini diisi sekali oleh migrasinya, tapi ia akan basi pada santri
 * BERIKUTNYA kalau tidak ada yang menulisnya. Pendaftaran kelas adalah hulu yang
 * benar: rombel selalu tahu unit dan tahun ajarannya, dan setiap santri yang
 * masuk unit pasti mendarat di sebuah rombel. Jadi keempat tempat yang membuat
 * `ClassEnrollment` memanggil fungsi ini.
 *
 * Idempoten. Baris yang sudah ada TIDAK diubah tanggal masuknya — santri itu
 * memang sudah di sana sejak tanggal tersebut; yang diperbarui hanya tingkatnya,
 * karena rombel bisa berganti di tengah tahun.
 */
export async function recordUnitEnrollmentFromClass(
  db: DbWrite,
  studentId: string,
  classId: string,
  now: Date = new Date()
): Promise<void> {
  const kelas = await db.class.findUnique({
    where: { id: classId },
    select: {
      unitId: true,
      academicYearId: true,
      level: true,
      academicYear: { select: { startDate: true, endDate: true } },
    },
  });
  if (!kelas) return;

  // Mendaftarkan santri ke rombel tahun depan tidak berarti ia masuk unit itu
  // hari ini; tanggal masuknya tanggal mulai tahun ajarannya. Aturan yang sama
  // dipakai backfill di migrasi 20260912020000.
  const mulai = kelas.academicYear?.startDate;
  const selesai = kelas.academicYear?.endDate;
  const masukAkal = mulai && selesai ? now >= mulai && now <= selesai : true;
  const entryDate = masukAkal ? now : (mulai ?? now);

  await db.studentUnitEnrollment.upsert({
    where: {
      studentId_unitId_academicYearId: {
        studentId,
        unitId: kelas.unitId,
        academicYearId: kelas.academicYearId,
      },
    },
    create: {
      studentId,
      unitId: kelas.unitId,
      academicYearId: kelas.academicYearId,
      entryDate,
      gradeLevel: kelas.level ?? null,
    },
    update: { gradeLevel: kelas.level ?? null },
  });
}

/**
 * Potongan `where` untuk menyaring lewat unit SAAT ITU.
 *
 * Dipakai menggantikan `student: { unitId }` di laporan:
 *
 * ```ts
 * where: { student: studentInUnitAt(unitId, tanggal) }
 * ```
 *
 * Sengaja potongan `where`, bukan daftar id. Daftar id memaksa satu kueri
 * tambahan lalu `IN (…)` sepanjang jumlah santri — di unit dengan ribuan santri
 * itu kueri yang berbeda kelas beratnya. Potongan ini tetap satu kueri dengan
 * join, dan bentuk relasinya sama di setiap model yang punya `student`.
 *
 * `termasukTanpaRiwayat` (bawaan: true) memasukkan santri yang BELUM punya satu
 * baris riwayat pun — mereka disaring memakai `students.unit_id` seperti dulu.
 * Itu bukan kelalaian: tanpa itu, satu santri yang dibuat lewat jalur yang belum
 * menulis riwayat akan HILANG dari setiap laporan, dan laporan yang diam-diam
 * kehilangan orang lebih berbahaya daripada laporan yang memakai unit sekarang.
 * Laporan historis (akreditasi, angka tahun lalu) sebaiknya menyetelnya `false`:
 * di sana "tidak tahu" memang jawaban yang lebih jujur daripada "unit sekarang".
 */
export function studentInUnitAt(
  unitId: string,
  at: Date,
  options: { termasukTanpaRiwayat?: boolean } = {}
) {
  const { termasukTanpaRiwayat = true } = options;
  const punyaRiwayat = {
    unitEnrollments: {
      some: {
        unitId,
        entryDate: { lte: at },
        OR: [{ exitDate: null }, { exitDate: { gte: at } }],
      },
    },
  };

  if (!termasukTanpaRiwayat) return punyaRiwayat;

  return {
    OR: [punyaRiwayat, { unitEnrollments: { none: {} }, unitId }],
  };
}

/** Sama, tetapi untuk pertanyaan yang dihitung per tahun ajaran. */
export function studentInUnitForYear(
  unitId: string,
  academicYearId: string,
  options: { termasukTanpaRiwayat?: boolean } = {}
) {
  const { termasukTanpaRiwayat = true } = options;
  const punyaRiwayat = { unitEnrollments: { some: { unitId, academicYearId } } };

  if (!termasukTanpaRiwayat) return punyaRiwayat;

  return {
    OR: [punyaRiwayat, { unitEnrollments: { none: {} }, unitId }],
  };
}

/**
 * Catat keanggotaan unit untuk santri yang dibuat TANPA rombel.
 *
 * `student.service.create` menerima `classId` sebagai pilihan, jadi santri bisa
 * lahir tanpa rombel — pindahan yang rombelnya belum ditentukan, atau santri TK
 * yang rombelnya diatur belakangan. Tanpa baris riwayat, santri itu menghilang
 * dari setiap laporan yang sudah ditukar ke penyaring riwayat; laporan yang
 * diam-diam kehilangan orang lebih berbahaya daripada laporan yang memakai unit
 * sekarang.
 *
 * Tahun ajarannya diambil yang sedang aktif. Kalau tidak ada satu pun tahun
 * ajaran aktif, tidak ada yang bisa dijadikan sandaran dan fungsinya diam —
 * penyaring `studentInUnitAt` masih memasukkan santri tanpa riwayat lewat
 * `students.unit_id`, jadi ia tetap terlihat.
 */
export async function ensureUnitEnrollment(
  db: DbWriteDirect,
  studentId: string,
  unitId: string,
  now: Date = new Date()
): Promise<void> {
  const tahun = await db.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!tahun) return;

  const masukAkal = now >= tahun.startDate && now <= tahun.endDate;
  const entryDate = masukAkal ? now : tahun.startDate;

  await db.studentUnitEnrollment.upsert({
    where: {
      studentId_unitId_academicYearId: { studentId, unitId, academicYearId: tahun.id },
    },
    create: { studentId, unitId, academicYearId: tahun.id, entryDate },
    update: {},
  });
}

/** Nilai yang diizinkan CHECK `student_unit_enrollments_exit_reason_check`. */
export type UnitExitReason =
  | 'LULUS'
  | 'PINDAH_UNIT'
  | 'PINDAH_SEKOLAH'
  | 'MENGUNDURKAN_DIRI'
  | 'DIKELUARKAN'
  | 'MENINGGAL'
  | 'TAHUN_AJARAN_SELESAI';

/**
 * Tutup keanggotaan santri di satu unit: setiap baris riwayat unit itu yang
 * masih terbuka mendapat tanggal dan alasan keluar.
 *
 * Sampai fungsi ini ada, satu-satunya penulis `exit_date` adalah migrasi
 * backfill — produksi 14 baris, 0 tertutup — sehingga santri yang naik ke SD IT
 * tetap terhitung di TK pada setiap tanggal sesudahnya, di dua unit sekaligus.
 *
 * Tanggal keluar tidak boleh mendahului tanggal masuk (CHECK
 * `student_unit_enrollments_exit_after_entry`): baris yang masuknya sesudah
 * tanggal keluar (rombel tahun depan yang sudah didaftarkan) ditutup pada
 * tanggal masuknya sendiri, yaitu periode nol hari — bukan ditolak.
 */
export async function closeUnitEnrollments(
  db: Pick<typeof prisma, 'studentUnitEnrollment'>,
  input: { studentId: string; unitId: string; exitDate: Date; exitReason: UnitExitReason }
): Promise<number> {
  const terbuka = await db.studentUnitEnrollment.findMany({
    where: { studentId: input.studentId, unitId: input.unitId, exitDate: null },
    select: { id: true, entryDate: true },
  });
  for (const baris of terbuka) {
    const exitDate = input.exitDate < baris.entryDate ? baris.entryDate : input.exitDate;
    await db.studentUnitEnrollment.update({
      where: { id: baris.id },
      data: { exitDate, exitReason: input.exitReason },
    });
  }
  return terbuka.length;
}
