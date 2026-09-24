import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';
import { STUDENT_STATUS } from '@cipansor/shared';

/**
 * Kandidat "santri lama" untuk satu pendaftaran (audit #489 bagian 3b-2).
 *
 * Lulusan SD IT yang mendaftar SMP IT adalah ORANG YANG SAMA. Tanpa daftar ini
 * petugas SMP IT tidak punya cara menemukannya, sehingga onboarding membuat
 * santri kedua (NIS baru, kartu baru, riwayat terputus) — atau ditolak 409
 * karena NISN-nya "sudah dipakai santri lain", yaitu dirinya sendiri.
 *
 * Sengaja LINTAS UNIT: yang mencari adalah unit tujuan, sedangkan datanya milik
 * unit asal. Yang dikembalikan karena itu dibatasi pada yang perlu untuk
 * memastikan orangnya — nama, tahun lahir, unit asal, tahun lulus, dan NISN yang
 * disamarkan — bukan alamat, telepon, atau NIK. Hanya santri berstatus ALUMNI
 * yang muncul: santri aktif unit lain tidak boleh ditarik lewat formulir SPMB.
 */
export interface KandidatSantriLama {
  studentId: string;
  nama: string;
  tahunLahir: number | null;
  unitAsal: string | null;
  tahunLulus: number | null;
  nisnTersamar: string | null;
  cocokLewat: Array<'nama+tanggal lahir' | 'telepon wali' | 'NISN'>;
}

/** 0061234567 → 006•••4567: cukup untuk mencocokkan, tidak cukup untuk disalin. */
function samarkanNisn(nisn: string | null): string | null {
  if (!nisn) return null;
  if (nisn.length <= 7) return nisn;
  return `${nisn.slice(0, 3)}•••${nisn.slice(-4)}`;
}

export async function findInternalCandidates(
  registrantId: string,
  /** NISN yang diketik petugas di formulir onboarding — `registrants` tidak menyimpannya. */
  nisnDiisi?: string
): Promise<KandidatSantriLama[]> {
  const pendaftar = await prisma.registrant.findUnique({
    where: { id: registrantId },
    select: { fullName: true, birthDate: true, parentPhone: true },
  });
  if (!pendaftar) {
    throw Errors.notFound('Registrant');
  }

  const nama = pendaftar.fullName?.trim() ?? '';
  const telepon = pendaftar.parentPhone?.trim() ?? '';
  const nisn = nisnDiisi?.trim() ?? '';

  const atau: Array<Record<string, unknown>> = [];
  // Nama saja terlalu longgar (banyak "Muhammad"); nama + tanggal lahir adalah
  // pasangan yang dipakai Dapodik untuk hal yang sama.
  if (nama && pendaftar.birthDate) {
    atau.push({
      user: { name: { equals: nama, mode: 'insensitive' } },
      birthDate: pendaftar.birthDate,
    });
  }
  if (telepon) atau.push({ parentPhone: telepon });
  if (nisn) atau.push({ nisn });
  if (atau.length === 0) return [];

  const kandidat = await prisma.student.findMany({
    where: { deletedAt: null, status: STUDENT_STATUS.ALUMNI, OR: atau },
    select: {
      id: true,
      nisn: true,
      birthDate: true,
      parentPhone: true,
      graduateYear: true,
      user: { select: { name: true } },
      unit: { select: { name: true } },
    },
    orderBy: { graduateYear: 'desc' },
    take: 10,
  });

  return kandidat.map((s) => {
    const cocokLewat: KandidatSantriLama['cocokLewat'] = [];
    if (
      nama &&
      pendaftar.birthDate &&
      s.user?.name?.toLowerCase() === nama.toLowerCase() &&
      s.birthDate?.getTime() === pendaftar.birthDate.getTime()
    ) {
      cocokLewat.push('nama+tanggal lahir');
    }
    if (telepon && s.parentPhone === telepon) cocokLewat.push('telepon wali');
    if (nisn && s.nisn === nisn) cocokLewat.push('NISN');
    return {
      studentId: s.id,
      nama: s.user?.name ?? '-',
      tahunLahir: s.birthDate ? s.birthDate.getFullYear() : null,
      unitAsal: s.unit?.name ?? null,
      tahunLulus: s.graduateYear ?? null,
      nisnTersamar: samarkanNisn(s.nisn),
      cocokLewat,
    };
  });
}
