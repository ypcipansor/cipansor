/**
 * Predikat kinerja — kuadran hasil kerja × perilaku kerja.
 *
 * PermenPANRB No. 6 Tahun 2022 tidak menjumlahkan hasil kerja dan perilaku
 * kerja menjadi satu angka. Keduanya dinilai terpisah terhadap **ekspektasi**
 * (di atas / sesuai / di bawah), lalu predikatnya diambil dari kuadran yang
 * terbentuk. Bedanya bukan gaya: penjumlahan berbobot membuat capaian KPI
 * yang tinggi bisa menutupi perilaku yang buruk secara konsisten — persis
 * yang dicegah oleh kuadran.
 *
 * `overallScore` tetap dihitung dan disimpan seperti sebelumnya; predikat ini
 * diturunkan di atasnya, jadi tidak ada kolom baru dan tidak ada migrasi.
 */

export type Ekspektasi = 'DI_ATAS' | 'SESUAI' | 'DI_BAWAH';

export type Predikat =
  | 'SANGAT_BAIK'
  | 'BAIK'
  | 'BUTUH_PERBAIKAN'
  | 'KURANG'
  | 'SANGAT_KURANG';

/**
 * Ambang terhadap ekspektasi. Angka ini adalah kebijakan yayasan, bukan
 * ketentuan peraturan — peraturannya berbicara tentang ekspektasi, bukan
 * tentang persentase. Ditaruh di satu tempat supaya bisa diubah tanpa
 * memburu perbandingan yang tersebar.
 */
export const EKSPEKTASI_ATAS = 90;
export const EKSPEKTASI_BAWAH = 70;

export function ratingOf(score: number): Ekspektasi {
  if (score >= EKSPEKTASI_ATAS) return 'DI_ATAS';
  if (score >= EKSPEKTASI_BAWAH) return 'SESUAI';
  return 'DI_BAWAH';
}

/**
 * Kuadran PermenPANRB 6/2022 Lampiran: baris = hasil kerja, kolom = perilaku.
 * Perilaku di bawah ekspektasi tidak pernah menghasilkan "Baik", berapa pun
 * hasil kerjanya — itu inti aturannya.
 */
const KUADRAN: Record<Ekspektasi, Record<Ekspektasi, Predikat>> = {
  DI_ATAS: {
    DI_ATAS: 'SANGAT_BAIK',
    SESUAI: 'BAIK',
    DI_BAWAH: 'BUTUH_PERBAIKAN',
  },
  SESUAI: {
    DI_ATAS: 'BAIK',
    SESUAI: 'BAIK',
    DI_BAWAH: 'BUTUH_PERBAIKAN',
  },
  DI_BAWAH: {
    DI_ATAS: 'BUTUH_PERBAIKAN',
    SESUAI: 'KURANG',
    DI_BAWAH: 'SANGAT_KURANG',
  },
};

export interface PredikatKinerja {
  hasilKerja: Ekspektasi;
  perilakuKerja: Ekspektasi;
  predikat: Predikat;
  label: string;
}

const LABEL: Record<Predikat, string> = {
  SANGAT_BAIK: 'Sangat Baik',
  BAIK: 'Baik',
  BUTUH_PERBAIKAN: 'Butuh Perbaikan',
  KURANG: 'Kurang',
  SANGAT_KURANG: 'Sangat Kurang',
};

export function predikatKinerja(
  performanceScore: number,
  behaviorScore: number
): PredikatKinerja {
  const hasilKerja = ratingOf(performanceScore);
  const perilakuKerja = ratingOf(behaviorScore);
  const predikat = KUADRAN[hasilKerja][perilakuKerja];
  return { hasilKerja, perilakuKerja, predikat, label: LABEL[predikat] };
}
