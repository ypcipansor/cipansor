import { LetterNature, LetterType } from '@prisma/client';
import {
  LETTER_NATURE_LABELS,
  LETTER_TYPE_LABELS,
  isNatureAllowedForType,
  naturesForType,
} from '@cipansor/shared';

/**
 * Server-side enforcement of the jenis/sifat rule.
 *
 * The rule itself — which sifat each jenis may carry, and the labels — lives in
 * @cipansor/shared so the web form offers exactly what this accepts. A form
 * that offers a choice the server rejects is the class of bug this whole change
 * set exists to close, so there is deliberately no second copy here. This file
 * adds only the two things the client does not need: the throwing guard, and
 * the per-type agenda-numbering code.
 *
 * The @prisma/client and @cipansor/shared enums are distinct types with
 * identical string members, so a Prisma LetterType is passed to the shared
 * helpers through a cast that is a no-op at runtime.
 */

export { LETTER_NATURE_LABELS, LETTER_TYPE_LABELS, naturesForType };

export function naturesFor(type: LetterType): readonly LetterNature[] {
  return naturesForType(type as unknown as never) as unknown as LetterNature[];
}

export function isNatureAllowed(type: LetterType, nature: LetterNature): boolean {
  return isNatureAllowedForType(type as unknown as never, nature as unknown as never);
}

/**
 * Kode penomoran untuk tiap jenis, dipakai AgendaNumber.
 *
 * Setiap jenis punya buku nomornya sendiri: SK nomor 1 dan surat dinas nomor 1
 * hidup berdampingan, persis seperti di buku agenda kertas. Menyatukannya akan
 * membuat nomor SK melompat setiap kali ada surat biasa keluar. Server-only:
 * nomor tidak pernah dipilih di klien.
 *
 * Kodenya adalah singkatan yang benar-benar dipakai pada surat, bukan nama
 * enum. Versi pertama memakai nama enum apa adanya, sehingga menghasilkan
 * nomor seperti `001/SURAT_KETERANGAN/VII/2026` — sedangkan surat asli
 * Yayasan berbunyi:
 *
 *     434/Sket/Y-CPS/VII/2026
 *
 * `Sket` diambil langsung dari surat tersebut. Sisanya memakai singkatan yang
 * lazim dalam tata naskah dinas Indonesia (SK, ST, SE, BA, ND, Und); mohon
 * dikonfirmasi Tata Usaha sebelum dipakai luas, karena hanya `Sket` yang
 * terverifikasi dari dokumen nyata.
 */
export const AGENDA_TYPE_CODE: Record<LetterType, string> = {
  // Surat dinas biasa: cukup "S", agar tidak rancu dengan singkatan unit "SD".
  [LetterType.SURAT_DINAS]: 'S',
  [LetterType.NOTA_DINAS]: 'ND',
  [LetterType.SURAT_KEPUTUSAN]: 'SK',
  [LetterType.SURAT_TUGAS]: 'ST',
  [LetterType.SURAT_EDARAN]: 'SE',
  [LetterType.SURAT_UNDANGAN]: 'Und',
  [LetterType.SURAT_KETERANGAN]: 'Sket', // terverifikasi dari surat asli
  [LetterType.BERITA_ACARA]: 'BA',
  [LetterType.PENGUMUMAN]: 'Peng',
};

export class NaskahError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NaskahError';
  }
}

/**
 * Menolak pasangan jenis/sifat yang tidak sah.
 *
 * Pesannya menyebut pilihan yang tersedia, karena penolakan yang tidak
 * menawarkan jalan keluar hanya memindahkan kebingungan ke petugas tata usaha.
 */
export function assertNatureAllowed(type: LetterType, nature: LetterNature): void {
  if (isNatureAllowed(type, nature)) return;

  const allowed = naturesFor(type)
    .map((n) => LETTER_NATURE_LABELS[n as keyof typeof LETTER_NATURE_LABELS])
    .join(', ');

  throw new NaskahError(
    `Sifat "${LETTER_NATURE_LABELS[nature as keyof typeof LETTER_NATURE_LABELS]}" ` +
      `tidak berlaku untuk ${LETTER_TYPE_LABELS[type as keyof typeof LETTER_TYPE_LABELS]}. ` +
      `Pilihan yang tersedia: ${allowed}.`
  );
}
