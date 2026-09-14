import { z } from "zod";

/**
 * Pengenal resmi santri dan kontrak formulir Kelengkapan Data Siswa.
 *
 * NISN: kode nasional 10 digit angka, satu untuk satu peserta didik seumur hidup
 * (Pusdatin Kemendikbudristek). NIK dan No. KK: 16 digit angka (Dukcapil).
 * Keduanya boleh kosong — NISN baru terbit setelah didata di Dapodik/EMIS — tapi
 * bila diisi harus berbentuk benar, dan di basis data dijaga unik.
 *
 * NIS (nomor induk dari satuan pendidikan) SENGAJA tidak diatur di sini: ia sah
 * dan berlaku per unit, bukan pengenal seumur hidup (lihat audit PR #489).
 */
export const NISN_PATTERN = /^\d{10}$/;
export const NIK_PATTERN = /^\d{16}$/;

/** String kosong berarti "kosongkan", bukan nilai: disimpan sebagai null. */
const kosongJadiNull = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? null : t;
};

const teksOpsional = (maks = 255) =>
  z.preprocess(kosongJadiNull, z.string().max(maks).nullable().optional());

export const nisnSchema = z.preprocess(
  kosongJadiNull,
  z
    .string()
    .regex(NISN_PATTERN, "NISN harus 10 digit angka")
    .nullable()
    .optional(),
);

export const nikSchema = z.preprocess(
  kosongJadiNull,
  z
    .string()
    .regex(NIK_PATTERN, "NIK harus 16 digit angka")
    .nullable()
    .optional(),
);

const noKkSchema = z.preprocess(
  kosongJadiNull,
  z
    .string()
    .regex(NIK_PATTERN, "Nomor KK harus 16 digit angka")
    .nullable()
    .optional(),
);

const angkaOpsional = (min: number, maks: number) =>
  z.preprocess(
    (v) => (v === "" ? null : v),
    z.number().min(min).max(maks).nullable().optional(),
  );

const bulatOpsional = (min: number, maks: number) =>
  z.preprocess(
    (v) => (v === "" ? null : v),
    z.number().int().min(min).max(maks).nullable().optional(),
  );

const tanggalOpsional = z.preprocess(
  (v) => (v === "" ? null : v),
  z.union([z.null(), z.coerce.date()]).optional(),
);

// ─── Pilihan: nilainya HARUS sama dengan enum Prisma (diuji di apps/api) ───

export const TRANSPORT_MODE_OPTIONS = [
  { value: "JALAN_KAKI", label: "Jalan kaki" },
  { value: "SEPEDA", label: "Sepeda" },
  { value: "SEPEDA_MOTOR", label: "Sepeda motor" },
  { value: "MOBIL_PRIBADI", label: "Mobil pribadi" },
  { value: "ANGKUTAN_UMUM", label: "Angkutan umum/bus" },
  { value: "ANTAR_JEMPUT", label: "Antar jemput sekolah" },
  { value: "PERAHU", label: "Perahu/sampan" },
  { value: "OJEK", label: "Ojek" },
  { value: "LAINNYA", label: "Lainnya" },
] as const;

export const BLOOD_TYPE_OPTIONS = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "AB", label: "AB" },
  { value: "O", label: "O" },
  { value: "TIDAK_TAHU", label: "Tidak tahu" },
] as const;

export const EDUCATION_LEVEL_OPTIONS = [
  { value: "TIDAK_SEKOLAH", label: "Tidak sekolah" },
  { value: "SD", label: "SD/MI/sederajat" },
  { value: "SMP", label: "SMP/MTs/sederajat" },
  { value: "SMA", label: "SMA/MA/SMK/sederajat" },
  { value: "D1", label: "Diploma 1" },
  { value: "D2", label: "Diploma 2" },
  { value: "D3", label: "Diploma 3" },
  { value: "D4", label: "Diploma 4/Sarjana terapan" },
  { value: "S1", label: "Sarjana (S1)" },
  { value: "S2", label: "Magister (S2)" },
  { value: "S3", label: "Doktor (S3)" },
  { value: "LAINNYA", label: "Lainnya" },
] as const;

export const OCCUPATION_OPTIONS = [
  { value: "PNS", label: "PNS/TNI/Polri" },
  { value: "PEGAWAI_SWASTA", label: "Pegawai swasta" },
  { value: "WIRASWASTA", label: "Wiraswasta" },
  { value: "PETANI", label: "Petani/pekebun" },
  { value: "NELAYAN", label: "Nelayan" },
  { value: "BURUH", label: "Buruh" },
  { value: "PEDAGANG", label: "Pedagang" },
  { value: "PENSIUNAN", label: "Pensiunan" },
  { value: "TIDAK_BEKERJA", label: "Tidak bekerja" },
  { value: "IBU_RUMAH_TANGGA", label: "Ibu rumah tangga" },
  { value: "GURU", label: "Guru/dosen" },
  { value: "DOKTER", label: "Dokter" },
  { value: "PENGACARA", label: "Pengacara/notaris" },
  { value: "LAINNYA", label: "Lainnya" },
  { value: "SUDAH_MENINGGAL", label: "Sudah meninggal" },
] as const;

export const INCOME_RANGE_OPTIONS = [
  { value: "TIDAK_BERPENGHASILAN", label: "Tidak berpenghasilan" },
  { value: "KURANG_500K", label: "Kurang dari Rp500.000" },
  { value: "RANGE_500K_1JT", label: "Rp500.000 – Rp1.000.000" },
  { value: "RANGE_1JT_2JT", label: "Rp1.000.000 – Rp2.000.000" },
  { value: "RANGE_2JT_5JT", label: "Rp2.000.000 – Rp5.000.000" },
  { value: "RANGE_5JT_10JT", label: "Rp5.000.000 – Rp10.000.000" },
  { value: "RANGE_10JT_20JT", label: "Rp10.000.000 – Rp20.000.000" },
  { value: "LEBIH_20JT", label: "Lebih dari Rp20.000.000" },
] as const;

type Opsi = readonly { value: string }[];
const nilaiDari = <T extends Opsi>(opsi: T) =>
  opsi.map((o) => o.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

export const TRANSPORT_MODE_VALUES = nilaiDari(TRANSPORT_MODE_OPTIONS);
export const BLOOD_TYPE_VALUES = nilaiDari(BLOOD_TYPE_OPTIONS);
export const EDUCATION_LEVEL_VALUES = nilaiDari(EDUCATION_LEVEL_OPTIONS);
export const OCCUPATION_VALUES = nilaiDari(OCCUPATION_OPTIONS);
export const INCOME_RANGE_VALUES = nilaiDari(INCOME_RANGE_OPTIONS);

const enumOpsional = <T extends [string, ...string[]]>(nilai: T) =>
  z.preprocess(kosongJadiNull, z.enum(nilai).nullable().optional());

/**
 * Kolom yang boleh diubah lewat PUT /student-compliance/:studentId.
 *
 * `.strict()` itu intinya. Sampai 2026-09-14 controller meneruskan seluruh
 * `req.body` ke `prisma.student.update`: kolom apa pun — unit, akun, penanda
 * hapus — bisa ditulis lewat endpoint ini (dibuktikan di rig: `religion` ikut
 * berubah). Dan karena formulirnya memakai nama sendiri (`fatherNIK`, `isKIP`,
 * `distance`) yang bukan nama kolom, setiap simpan dijawab 500. Nama di sini
 * adalah nama kolom Prisma; kunci lain ditolak 400 dengan namanya disebut.
 */
export const updateStudentComplianceSchema = z
  .object({
    // Identitas
    nisn: nisnSchema,
    nik: nikSchema,
    noAkta: teksOpsional(64),
    noKK: noKkSchema,

    // Domisili
    // Kolomnya NOT NULL: alamat boleh tidak dikirim, tapi tidak boleh dikosongkan.
    address: z.string().trim().min(5, "Alamat minimal 5 karakter").max(500).optional(),
    rt: teksOpsional(5),
    rw: teksOpsional(5),
    postalCode: teksOpsional(10),
    provinceId: teksOpsional(64),
    regencyId: teksOpsional(64),
    districtId: teksOpsional(64),
    villageId: teksOpsional(64),

    // Transportasi
    transportMode: enumOpsional(TRANSPORT_MODE_VALUES),
    distanceToSchool: angkaOpsional(0, 999.99),
    travelTime: bulatOpsional(0, 1440),

    // Kesejahteraan
    kipNumber: teksOpsional(64),
    isPkh: z.boolean().optional(),
    isKks: z.boolean().optional(),

    // Kesehatan
    bloodType: enumOpsional(BLOOD_TYPE_VALUES),
    height: angkaOpsional(0, 300),
    weight: angkaOpsional(0, 300),
    headCircumference: angkaOpsional(0, 100),
    specialNeeds: teksOpsional(255),

    // Keluarga
    numberOfSiblings: bulatOpsional(0, 50),
    childOrder: bulatOpsional(1, 50),
    livingWith: teksOpsional(64),

    // Ayah
    fatherName: teksOpsional(),
    fatherNik: z.preprocess(kosongJadiNull, z.string().regex(NIK_PATTERN, "NIK ayah harus 16 digit angka").nullable().optional()),
    fatherBirthPlace: teksOpsional(),
    fatherBirthDate: tanggalOpsional,
    fatherEducation: enumOpsional(EDUCATION_LEVEL_VALUES),
    fatherOccupation: enumOpsional(OCCUPATION_VALUES),
    fatherIncome: enumOpsional(INCOME_RANGE_VALUES),
    fatherPhone: teksOpsional(20),

    // Ibu
    motherName: teksOpsional(),
    motherNik: z.preprocess(kosongJadiNull, z.string().regex(NIK_PATTERN, "NIK ibu harus 16 digit angka").nullable().optional()),
    motherBirthPlace: teksOpsional(),
    motherBirthDate: tanggalOpsional,
    motherEducation: enumOpsional(EDUCATION_LEVEL_VALUES),
    motherOccupation: enumOpsional(OCCUPATION_VALUES),
    motherIncome: enumOpsional(INCOME_RANGE_VALUES),
    motherPhone: teksOpsional(20),

    // Wali
    guardianName: teksOpsional(),
    guardianNik: z.preprocess(kosongJadiNull, z.string().regex(NIK_PATTERN, "NIK wali harus 16 digit angka").nullable().optional()),
    guardianRelation: teksOpsional(64),
    guardianEducation: enumOpsional(EDUCATION_LEVEL_VALUES),
    guardianOccupation: enumOpsional(OCCUPATION_VALUES),
    guardianIncome: enumOpsional(INCOME_RANGE_VALUES),
    guardianPhone: teksOpsional(20),
  })
  .strict();

export type UpdateStudentComplianceInput = z.infer<typeof updateStudentComplianceSchema>;

/**
 * Bentuk yang dikirim peramban: sama dengan hasil skema, kecuali tanggal yang
 * masih berupa string `YYYY-MM-DD` dari `<input type="date">`.
 */
export type UpdateStudentComplianceRequest = Omit<
  UpdateStudentComplianceInput,
  "fatherBirthDate" | "motherBirthDate"
> & {
  fatherBirthDate?: string | null;
  motherBirthDate?: string | null;
};

/** POST /student-compliance/bulk-update — setiap baris memakai kontrak yang sama. */
export const bulkUpdateStudentComplianceSchema = z
  .object({
    updates: z
      .array(updateStudentComplianceSchema.extend({ studentId: z.string().uuid("studentId harus UUID") }))
      .min(1)
      .max(500),
  })
  .strict();
