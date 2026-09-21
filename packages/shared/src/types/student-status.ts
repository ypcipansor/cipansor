/**
 * Dua kolom status di ranah santri yang bertipe `String` huruf kecil — satu
 * kosakata masing-masing, satu tempat.
 *
 * Diukur di produksi 2026-09-13:
 *
 *   students.status             = 'active' (14 baris)  → 20 penyaring 'ACTIVE'
 *   class_enrollments.status    = 'active' (11 baris)  → 19 penyaring 'ACTIVE'
 *   takhosus_enrollments.status = 'ACTIVE' (1 baris)   → BENAR, enum Prisma
 *   extracurricular_…status     = 'ACTIVE' (3 baris)   → BENAR, enum Prisma
 *
 * Postgres peka huruf, jadi ke-39 penyaring huruf besar pada dua kolom pertama
 * mengembalikan NOL — tanpa galat, tanpa peringatan, tanpa satu baris log.
 * Akibat yang terukur: `activeStudents` 0 padahal `totalStudents` 14,
 * `attendanceRate` selalu 0 karena ia membagi dengan angka itu, dan ekspor EMIS
 * ke Kemenag kosong.
 *
 * Kedua tabel yang ber-enum Prisma justru huruf besar dan benar. Itu bukan
 * kebetulan — itu sebabnya: enum membuat ejaan salah gagal dikompilasi,
 * sementara kolom `String` menerima apa pun dan diam. Jadi dua kosakata ini
 * ditaruh di satu tempat dan diturunkan oleh skema zod serta diikat oleh CHECK
 * di migrasi `20260913000000_student_and_enrollment_status_check`.
 *
 * Keduanya bersama karena ditemukan bersama, ukurannya sama, dan alasannya
 * satu. Yang dicari pembaca berikutnya adalah "di mana daftar nilainya" —
 * jawabannya harus satu berkas, bukan dua.
 *
 * **Sengaja TIDAK ditaruh di `types/enums.ts`.** Berkas itu sudah memegang
 * `UnitType` dan `UserRole` versinya sendiri yang menyimpang dari enum Prisma
 * (`UnitType` di sana punya `PAUD` yang tidak ada di Prisma), jadi ia contoh
 * persis dari penyakit yang berkas ini obati. Jangan tambah ke sana.
 */

/**
 * Status santri. Hanya `ACTIVE` dan `ALUMNI` punya penulis hari ini —
 * `student.service.create` dan `alumni.service`. `DROPPED` dan `TRANSFERRED`
 * ikut karena itu kosakata yang dimaksud skema (`schema.prisma:1028`), bukan
 * karena ada yang menulisnya.
 */
export const STUDENT_STATUS = {
  ACTIVE: "active",
  ALUMNI: "alumni",
  DROPPED: "dropped",
  TRANSFERRED: "transferred",
} as const;

export type StudentStatus = (typeof STUDENT_STATUS)[keyof typeof STUDENT_STATUS];

export const STUDENT_STATUS_VALUES = [
  STUDENT_STATUS.ACTIVE,
  STUDENT_STATUS.ALUMNI,
  STUDENT_STATUS.DROPPED,
  STUDENT_STATUS.TRANSFERRED,
] as const;

export function isStudentStatus(value: unknown): value is StudentStatus {
  return (
    typeof value === "string" &&
    (STUDENT_STATUS_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Status pendaftaran kelas (`schema.prisma:1282`). Kosakatanya BEDA dari status
 * santri — `COMPLETED` ada di sini dan `ALUMNI` tidak — jadi keduanya tidak
 * boleh dipertukarkan meski nilai `active`-nya sama.
 */
export const CLASS_ENROLLMENT_STATUS = {
  ACTIVE: "active",
  COMPLETED: "completed",
  TRANSFERRED: "transferred",
  DROPPED: "dropped",
} as const;

export type ClassEnrollmentStatus =
  (typeof CLASS_ENROLLMENT_STATUS)[keyof typeof CLASS_ENROLLMENT_STATUS];

export const CLASS_ENROLLMENT_STATUS_VALUES = [
  CLASS_ENROLLMENT_STATUS.ACTIVE,
  CLASS_ENROLLMENT_STATUS.COMPLETED,
  CLASS_ENROLLMENT_STATUS.TRANSFERRED,
  CLASS_ENROLLMENT_STATUS.DROPPED,
] as const;

export function isClassEnrollmentStatus(value: unknown): value is ClassEnrollmentStatus {
  return (
    typeof value === "string" &&
    (CLASS_ENROLLMENT_STATUS_VALUES as readonly string[]).includes(value)
  );
}
