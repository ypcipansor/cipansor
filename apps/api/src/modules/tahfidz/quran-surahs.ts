/**
 * The 114 surahs with their verse counts and the juz each one *starts* in.
 *
 * Standalone (no imports) so the seed can use it without pulling in the app's
 * Prisma client: tahfidz analytics judges a surah memorised from ZIYADAH
 * records against `verses`, and the demo data has to agree with that.
 * A surah that spans several juz (Al-Baqarah, Ali 'Imran, …) is listed under
 * its first; resolve a verse's juz from the verse, not from this field.
 */
export interface QuranSurah {
  number: number;
  name: string;
  verses: number;
  juz: number;
}

export const QURAN_SURAHS: ReadonlyArray<QuranSurah> = [
  { number: 1, name: 'Al-Fatihah', verses: 7, juz: 1 },
  { number: 2, name: 'Al-Baqarah', verses: 286, juz: 1 },
  { number: 3, name: "Ali 'Imran", verses: 200, juz: 3 },
  { number: 4, name: 'An-Nisa', verses: 176, juz: 4 },
  { number: 5, name: "Al-Ma'idah", verses: 120, juz: 6 },
  { number: 6, name: "Al-An'am", verses: 165, juz: 7 },
  { number: 7, name: "Al-A'raf", verses: 206, juz: 8 },
  { number: 8, name: 'Al-Anfal', verses: 75, juz: 9 },
  { number: 9, name: 'At-Taubah', verses: 129, juz: 10 },
  { number: 10, name: 'Yunus', verses: 109, juz: 11 },
  { number: 11, name: 'Hud', verses: 123, juz: 11 },
  { number: 12, name: 'Yusuf', verses: 111, juz: 12 },
  { number: 13, name: "Ar-Ra'd", verses: 43, juz: 13 },
  { number: 14, name: 'Ibrahim', verses: 52, juz: 13 },
  { number: 15, name: 'Al-Hijr', verses: 99, juz: 14 },
  { number: 16, name: 'An-Nahl', verses: 128, juz: 14 },
  { number: 17, name: 'Al-Isra', verses: 111, juz: 15 },
  { number: 18, name: 'Al-Kahf', verses: 110, juz: 15 },
  { number: 19, name: 'Maryam', verses: 98, juz: 16 },
  { number: 20, name: 'Ta-Ha', verses: 135, juz: 16 },
  { number: 21, name: 'Al-Anbiya', verses: 112, juz: 17 },
  { number: 22, name: 'Al-Hajj', verses: 78, juz: 17 },
  { number: 23, name: "Al-Mu'minun", verses: 118, juz: 18 },
  { number: 24, name: 'An-Nur', verses: 64, juz: 18 },
  { number: 25, name: 'Al-Furqan', verses: 77, juz: 18 },
  { number: 26, name: "Ash-Shu'ara", verses: 227, juz: 19 },
  { number: 27, name: 'An-Naml', verses: 93, juz: 19 },
  { number: 28, name: 'Al-Qasas', verses: 88, juz: 20 },
  { number: 29, name: "Al-'Ankabut", verses: 69, juz: 20 },
  { number: 30, name: 'Ar-Rum', verses: 60, juz: 21 },
  { number: 31, name: 'Luqman', verses: 34, juz: 21 },
  { number: 32, name: 'As-Sajdah', verses: 30, juz: 21 },
  { number: 33, name: 'Al-Ahzab', verses: 73, juz: 21 },
  { number: 34, name: 'Saba', verses: 54, juz: 22 },
  { number: 35, name: 'Fatir', verses: 45, juz: 22 },
  { number: 36, name: 'Ya-Sin', verses: 83, juz: 22 },
  { number: 37, name: 'As-Saffat', verses: 182, juz: 23 },
  { number: 38, name: 'Sad', verses: 88, juz: 23 },
  { number: 39, name: 'Az-Zumar', verses: 75, juz: 23 },
  { number: 40, name: 'Ghafir', verses: 85, juz: 24 },
  { number: 41, name: 'Fussilat', verses: 54, juz: 24 },
  { number: 42, name: 'Ash-Shura', verses: 53, juz: 25 },
  { number: 43, name: 'Az-Zukhruf', verses: 89, juz: 25 },
  { number: 44, name: 'Ad-Dukhan', verses: 59, juz: 25 },
  { number: 45, name: 'Al-Jathiyah', verses: 37, juz: 25 },
  { number: 46, name: 'Al-Ahqaf', verses: 35, juz: 26 },
  { number: 47, name: 'Muhammad', verses: 38, juz: 26 },
  { number: 48, name: 'Al-Fath', verses: 29, juz: 26 },
  { number: 49, name: 'Al-Hujurat', verses: 18, juz: 26 },
  { number: 50, name: 'Qaf', verses: 45, juz: 26 },
  { number: 51, name: 'Adh-Dhariyat', verses: 60, juz: 26 },
  { number: 52, name: 'At-Tur', verses: 49, juz: 27 },
  { number: 53, name: 'An-Najm', verses: 62, juz: 27 },
  { number: 54, name: 'Al-Qamar', verses: 55, juz: 27 },
  { number: 55, name: 'Ar-Rahman', verses: 78, juz: 27 },
  { number: 56, name: "Al-Waqi'ah", verses: 96, juz: 27 },
  { number: 57, name: 'Al-Hadid', verses: 29, juz: 27 },
  { number: 58, name: 'Al-Mujadilah', verses: 22, juz: 28 },
  { number: 59, name: 'Al-Hashr', verses: 24, juz: 28 },
  { number: 60, name: 'Al-Mumtahanah', verses: 13, juz: 28 },
  { number: 61, name: 'As-Saff', verses: 14, juz: 28 },
  { number: 62, name: "Al-Jumu'ah", verses: 11, juz: 28 },
  { number: 63, name: 'Al-Munafiqun', verses: 11, juz: 28 },
  { number: 64, name: 'At-Taghabun', verses: 18, juz: 28 },
  { number: 65, name: 'At-Talaq', verses: 12, juz: 28 },
  { number: 66, name: 'At-Tahrim', verses: 12, juz: 28 },
  { number: 67, name: 'Al-Mulk', verses: 30, juz: 29 },
  { number: 68, name: 'Al-Qalam', verses: 52, juz: 29 },
  { number: 69, name: 'Al-Haqqah', verses: 52, juz: 29 },
  { number: 70, name: "Al-Ma'arij", verses: 44, juz: 29 },
  { number: 71, name: 'Nuh', verses: 28, juz: 29 },
  { number: 72, name: 'Al-Jinn', verses: 28, juz: 29 },
  { number: 73, name: 'Al-Muzzammil', verses: 20, juz: 29 },
  { number: 74, name: 'Al-Muddathir', verses: 56, juz: 29 },
  { number: 75, name: 'Al-Qiyamah', verses: 40, juz: 29 },
  { number: 76, name: 'Al-Insan', verses: 31, juz: 29 },
  { number: 77, name: 'Al-Mursalat', verses: 50, juz: 29 },
  { number: 78, name: 'An-Naba', verses: 40, juz: 30 },
  { number: 79, name: "An-Nazi'at", verses: 46, juz: 30 },
  { number: 80, name: "'Abasa", verses: 42, juz: 30 },
  { number: 81, name: 'At-Takwir', verses: 29, juz: 30 },
  { number: 82, name: 'Al-Infitar', verses: 19, juz: 30 },
  { number: 83, name: 'Al-Mutaffifin', verses: 36, juz: 30 },
  { number: 84, name: 'Al-Inshiqaq', verses: 25, juz: 30 },
  { number: 85, name: 'Al-Buruj', verses: 22, juz: 30 },
  { number: 86, name: 'At-Tariq', verses: 17, juz: 30 },
  { number: 87, name: "Al-A'la", verses: 19, juz: 30 },
  { number: 88, name: 'Al-Ghashiyah', verses: 26, juz: 30 },
  { number: 89, name: 'Al-Fajr', verses: 30, juz: 30 },
  { number: 90, name: 'Al-Balad', verses: 20, juz: 30 },
  { number: 91, name: 'Ash-Shams', verses: 15, juz: 30 },
  { number: 92, name: 'Al-Layl', verses: 21, juz: 30 },
  { number: 93, name: 'Ad-Duha', verses: 11, juz: 30 },
  { number: 94, name: 'Ash-Sharh', verses: 8, juz: 30 },
  { number: 95, name: 'At-Tin', verses: 8, juz: 30 },
  { number: 96, name: "Al-'Alaq", verses: 19, juz: 30 },
  { number: 97, name: 'Al-Qadr', verses: 5, juz: 30 },
  { number: 98, name: 'Al-Bayyinah', verses: 8, juz: 30 },
  { number: 99, name: 'Az-Zalzalah', verses: 8, juz: 30 },
  { number: 100, name: "Al-'Adiyat", verses: 11, juz: 30 },
  { number: 101, name: "Al-Qari'ah", verses: 11, juz: 30 },
  { number: 102, name: 'At-Takathur', verses: 8, juz: 30 },
  { number: 103, name: "Al-'Asr", verses: 3, juz: 30 },
  { number: 104, name: 'Al-Humazah', verses: 9, juz: 30 },
  { number: 105, name: 'Al-Fil', verses: 5, juz: 30 },
  { number: 106, name: 'Quraysh', verses: 4, juz: 30 },
  { number: 107, name: "Al-Ma'un", verses: 7, juz: 30 },
  { number: 108, name: 'Al-Kawthar', verses: 3, juz: 30 },
  { number: 109, name: 'Al-Kafirun', verses: 6, juz: 30 },
  { number: 110, name: 'An-Nasr', verses: 3, juz: 30 },
  { number: 111, name: 'Al-Masad', verses: 5, juz: 30 },
  { number: 112, name: 'Al-Ikhlas', verses: 4, juz: 30 },
  { number: 113, name: 'Al-Falaq', verses: 5, juz: 30 },
  { number: 114, name: 'An-Nas', verses: 6, juz: 30 },
];

/**
 * Jumlah ayat per juz (mushaf Madinah, riwayat Hafs), indeks 0 = juz 1.
 * Totalnya 6.236. Ukuran juz sangat tidak rata — juz 28 hanya 137 ayat, juz 30
 * 564 — jadi "ayat ÷ angka tetap" tidak pernah bisa menjadi hitungan juz.
 */
export const JUZ_AYAH_COUNTS: ReadonlyArray<number> = [
  148, 111, 126, 131, 124, 110, 149, 142, 159, 127, 151, 170, 154, 227, 185, 269, 190, 202, 339,
  171, 178, 169, 357, 175, 246, 195, 399, 137, 431, 564,
];

/**
 * Hafalan dalam satuan juz dari ayat yang disetor per juz: tiap juz dihitung
 * sebagai bagian dari ukurannya sendiri, paling banyak 1. Hasilnya pecahan —
 * juz 30 penuh ditambah separuh juz 29 bernilai 1,5, bukan "1" (ayat ÷ 600) dan
 * bukan "2" (juz yang pernah disentuh).
 */
export function memorizedJuz(ayahByJuz: Iterable<readonly [number, number]>): number {
  let total = 0;
  for (const [juz, ayah] of ayahByJuz) {
    const size = JUZ_AYAH_COUNTS[juz - 1];
    if (!size || ayah <= 0) continue;
    total += Math.min(1, ayah / size);
  }
  return total;
}

export type TahfidzMilestone =
  | { type: 'juz_complete'; juz: number; completedJuz: number }
  | { type: 'half_quran'; completedJuz: number }
  | { type: 'full_quran'; completedJuz: number };

const juzComplete = (juz: number, ayah: number): boolean => {
  const size = JUZ_AYAH_COUNTS[juz - 1];
  return size !== undefined && ayah >= size;
};

/**
 * Tonggak yang dicapai oleh SATU setoran ziyadah. Sebuah juz tuntas ketika ayat
 * yang tersetor di juz itu mencapai ukurannya sendiri (`JUZ_AYAH_COUNTS`, 137–564
 * ayat), jadi yang dihitung adalah juz tuntas, bukan ayat ÷ 600.
 *
 * `ayahByJuzAfter` adalah ayat ziyadah per juz SESUDAH setoran ini tersimpan. Posisi
 * "sebelum" diperoleh dengan mengurangi setoran ini dari juznya. Akibatnya setoran
 * ulang pada juz yang sudah tuntas tidak memicu apa pun, dan tonggak 15/30 juz
 * hanya muncul pada setoran yang melewatinya.
 */
export function tahfidzMilestones(
  ayahByJuzAfter: ReadonlyMap<number, number>,
  record: { juz: number; totalAyah: number }
): TahfidzMilestone[] {
  if (record.totalAyah <= 0 || JUZ_AYAH_COUNTS[record.juz - 1] === undefined) return [];

  const after = ayahByJuzAfter.get(record.juz) ?? 0;
  if (!juzComplete(record.juz, after) || juzComplete(record.juz, after - record.totalAyah))
    return [];

  let completedAfter = 0;
  for (const [juz, ayah] of ayahByJuzAfter) if (juzComplete(juz, ayah)) completedAfter++;
  const completedBefore = completedAfter - 1;

  const reached: TahfidzMilestone[] = [
    { type: 'juz_complete', juz: record.juz, completedJuz: completedAfter },
  ];
  if (completedBefore < 15 && completedAfter >= 15)
    reached.push({ type: 'half_quran', completedJuz: completedAfter });
  if (completedBefore < 30 && completedAfter >= 30)
    reached.push({ type: 'full_quran', completedJuz: completedAfter });
  return reached;
}
