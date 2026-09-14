import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';

type KlienSantri = { student: Pick<typeof prisma.student, 'findFirst'> };

/**
 * NISN dan NIK santri dijaga unik oleh indeks basis data
 * (migrasi `20260914000000_student_identifier_uniqueness`). Pemeriksaan di sini
 * ada supaya penolakannya terbaca: tanpa ini petugas mendapat 409
 * "nisn already exists" — atau, sebelum indeksnya ada, NISN yang sama diam-diam
 * tercatat pada dua anak. Indeks tetap penjaga terakhir terhadap balapan.
 *
 * Baris santri yang sudah dihapus lunak IKUT diperiksa, karena indeksnya juga
 * menghitungnya: NISN berlaku seumur hidup, bukan selama santrinya aktif.
 */
export async function assertStudentIdentifiersAvailable(
  input: { nisn?: string | null; nik?: string | null },
  current?: { id: string; nisn: string | null; nik: string | null },
  client: KlienSantri = prisma
): Promise<void> {
  const kecualiDiri = current ? { id: { not: current.id } } : {};

  if (input.nisn && input.nisn !== current?.nisn) {
    const lain = await client.student.findFirst({
      where: { nisn: input.nisn, ...kecualiDiri },
      select: { id: true },
    });
    if (lain) {
      throw Errors.conflict(
        'NISN ini sudah tercatat pada santri lain. Satu NISN hanya untuk satu peserta didik — periksa kembali angkanya di Dapodik/EMIS.'
      );
    }
  }

  if (input.nik && input.nik !== current?.nik) {
    const lain = await client.student.findFirst({
      where: { nik: input.nik, ...kecualiDiri },
      select: { id: true },
    });
    if (lain) {
      throw Errors.conflict(
        'NIK ini sudah tercatat pada santri lain. Periksa kembali angkanya pada Kartu Keluarga.'
      );
    }
  }
}
