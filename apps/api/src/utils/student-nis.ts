import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';

/**
 * NIS santri per unit — satu-satunya pintu tulis dan baca ke
 * `student_unit_identifiers`.
 *
 * NIS (di Dapodik: NIPD) diterbitkan satuan pendidikan. Rapor dan buku induk SD
 * IT memuat NIS SD IT; santri yang naik ke SMP IT menerima NIS SMP IT, dan
 * dokumen SD IT-nya tetap memuat NIS lama. `students.nis` hanya menyimpan satu
 * nomor, jadi selama kolom itu masih ada ia diperlakukan sebagai CUPLIKAN "NIS
 * unit sekarang": setiap penulis NIS memanggil `assignStudentNis` untuk unit
 * santri saat itu, dan dokumen resmi membaca lewat `nisMapForUnit` /
 * `nisForUnit` dengan unit dokumennya.
 */

type DbWrite = Pick<typeof prisma, 'studentUnitIdentifier'>;
type DbRead = Pick<typeof prisma, 'studentUnitIdentifier'>;

/** Santri seperti yang biasanya sudah dimuat pemanggil. */
export interface SantriNis {
  id: string;
  unitId: string;
  nis: string;
}

/**
 * Catat NIS santri untuk satu unit (buat atau ganti). Menolak 409 bila NIS itu
 * sudah milik santri lain DI UNIT YANG SAMA — unit lain boleh memakai nomor
 * yang sama, karena penomorannya memang milik tiap sekolah.
 */
export async function assignStudentNis(
  db: DbWrite,
  input: { studentId: string; unitId: string; nis: string }
): Promise<void> {
  const nis = input.nis.trim();
  if (!nis) throw Errors.badRequest('NIS tidak boleh kosong');

  const lain = await db.studentUnitIdentifier.findFirst({
    where: { unitId: input.unitId, nis, studentId: { not: input.studentId } },
    select: { id: true },
  });
  if (lain) {
    throw Errors.conflict('NIS ini sudah dipakai santri lain di unit yang sama.');
  }

  await db.studentUnitIdentifier.upsert({
    where: { studentId_unitId: { studentId: input.studentId, unitId: input.unitId } },
    create: { studentId: input.studentId, unitId: input.unitId, nis },
    update: { nis },
  });
}

/**
 * NIS tiap santri di satu unit, untuk dokumen yang terbit atas nama unit itu
 * (rapor rombel, leger, ekspor EMIS unit, kartu).
 *
 * Urutan jawaban:
 * 1. baris (santri, unit) di `student_unit_identifiers` — sumber sebenarnya;
 * 2. `students.nis`, bila unit dokumen adalah unit santri SEKARANG (keduanya
 *    selalu sama di sana — ini menutup baris yang ditulis image lama selama
 *    jendela rollback);
 * 3. `students.nis`, bila santri itu belum punya baris di unit MANA PUN (data
 *    sebelum tabel ini ada — satu-satunya NIS yang pernah diketahui);
 * 4. `null`: santri punya NIS di unit lain tapi tidak di unit ini. Dokumen
 *    menampilkan kosong alih-alih nomor induk sekolah lain — persis kesalahan
 *    yang tabel ini dibuat untuk menghapus.
 */
export async function nisMapForUnit(
  db: DbRead,
  unitId: string,
  students: SantriNis[]
): Promise<Map<string, string | null>> {
  const hasil = new Map<string, string | null>();
  if (students.length === 0) return hasil;

  const baris = await db.studentUnitIdentifier.findMany({
    where: { studentId: { in: [...new Set(students.map((s) => s.id))] } },
    select: { studentId: true, unitId: true, nis: true },
  });
  const diUnitIni = new Map<string, string>();
  const punyaBaris = new Set<string>();
  for (const b of baris) {
    punyaBaris.add(b.studentId);
    if (b.unitId === unitId) diUnitIni.set(b.studentId, b.nis);
  }

  for (const s of students) {
    const tercatat = diUnitIni.get(s.id);
    if (tercatat !== undefined) hasil.set(s.id, tercatat);
    else if (s.unitId === unitId || !punyaBaris.has(s.id)) hasil.set(s.id, s.nis);
    else hasil.set(s.id, null);
  }
  return hasil;
}

/** Satu santri — lihat `nisMapForUnit`. */
export async function nisForUnit(
  db: DbRead,
  student: SantriNis,
  unitId: string
): Promise<string | null> {
  return (await nisMapForUnit(db, unitId, [student])).get(student.id) ?? null;
}
