import { z } from 'zod';

// ==================== EXPORT QUERY SCHEMAS ====================

export const exportStudentsQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID format').optional(),
  academicYearId: z.string().uuid('Invalid academic year ID format').optional(),
  includeInactive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  format: z.enum(['json', 'excel', 'csv']).default('json'),
});

export const exportTeachersQuerySchema = z.object({
  unitId: z.string().uuid('Invalid unit ID format').optional(),
  includeInactive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  format: z.enum(['json', 'excel', 'csv']).default('json'),
});

export const unitIdParamSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID format'),
});

// ==================== EMIS STUDENT DATA SCHEMA ====================

export const emisStudentDataSchema = z.object({
  nis: z.string().min(1, 'NIS is required'),
  nisn: z.string().regex(/^\d{10}$/, 'NISN must be 10 digits'),
  nik: z.string().regex(/^\d{16}$/, 'NIK must be 16 digits'),
  nama: z.string().min(1, 'Nama is required').max(100),
  tempatLahir: z.string().min(1, 'Tempat lahir is required').max(100),
  tanggalLahir: z.string().datetime().or(z.date()),
  jenisKelamin: z.enum(['L', 'P']),
  agama: z.enum(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']),
  alamat: z.string().min(1).max(500),
  rt: z.string().max(3).optional(),
  rw: z.string().max(3).optional(),
  kelurahan: z.string().max(100).optional(),
  kecamatan: z.string().max(100).optional(),
  kabupaten: z.string().max(100).optional(),
  provinsi: z.string().max(100).optional(),
  kodePos: z
    .string()
    .regex(/^\d{5}$/, 'Kode pos must be 5 digits')
    .optional(),
  noTelepon: z.string().max(20).optional(),
  namaAyah: z.string().max(100).optional(),
  nikAyah: z
    .string()
    .regex(/^\d{16}$/)
    .optional(),
  pekerjaanAyah: z.string().max(50).optional(),
  namaIbu: z.string().max(100).optional(),
  nikIbu: z
    .string()
    .regex(/^\d{16}$/)
    .optional(),
  pekerjaanIbu: z.string().max(50).optional(),
  namaWali: z.string().max(100).optional(),
  nikWali: z
    .string()
    .regex(/^\d{16}$/)
    .optional(),
  hubunganWali: z.string().max(50).optional(),
  statusDalamKeluarga: z.enum(['KANDUNG', 'TIRI', 'ANGKAT']).optional(),
  anakKe: z.number().int().min(1).optional(),
  jumlahSaudara: z.number().int().min(0).optional(),
  kewarganegaraan: z.string().default('WNI'),
  // Education related
  statusSiswa: z.enum(['AKTIF', 'LULUS', 'MUTASI', 'DO', 'MENGUNDURKAN_DIRI']),
  kelasId: z.string().uuid().optional(),
  tingkat: z.number().int().min(1).max(12),
  rombel: z.string().max(20).optional(),
  tahunMasuk: z.number().int().min(2000),
  asalSekolah: z.string().max(200).optional(),
});

// ==================== EMIS TEACHER DATA SCHEMA ====================

export const emisTeacherDataSchema = z.object({
  nip: z.string().max(18).optional(),
  nuptk: z
    .string()
    .regex(/^\d{16}$/, 'NUPTK must be 16 digits')
    .optional(),
  nik: z.string().regex(/^\d{16}$/, 'NIK must be 16 digits'),
  nama: z.string().min(1, 'Nama is required').max(100),
  tempatLahir: z.string().min(1).max(100),
  tanggalLahir: z.string().datetime().or(z.date()),
  jenisKelamin: z.enum(['L', 'P']),
  agama: z.enum(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']),
  alamat: z.string().min(1).max(500),
  noTelepon: z.string().max(20).optional(),
  email: z.string().email().optional(),
  // Education & certification
  pendidikanTerakhir: z.enum(['SMA', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']),
  programStudi: z.string().max(100).optional(),
  universitas: z.string().max(200).optional(),
  tahunLulus: z.number().int().min(1950).optional(),
  sertifikasi: z.boolean().default(false),
  tahunSertifikasi: z.number().int().optional(),
  // Employment
  statusKepegawaian: z.enum(['PNS', 'GTY', 'GTT', 'HONORER']),
  tmtMengajar: z.string().datetime().or(z.date()),
  jabatan: z.string().max(100).optional(),
  golongan: z.string().max(20).optional(),
  bidangStudi: z.string().max(100),
  bebanMengajar: z.number().int().min(0).optional(), // Jam per minggu
});

// ==================== EMIS INSTITUTION DATA SCHEMA ====================

export const emisInstitutionDataSchema = z.object({
  npsn: z.string().regex(/^\d{8}$/, 'NPSN must be 8 digits'),
  nsm: z.string().max(20).optional(), // Nomor Statistik Madrasah
  namaLembaga: z.string().min(1).max(200),
  jenjang: z.enum(['PAUD', 'TK', 'SD', 'MI', 'SMP', 'MTs', 'SMA', 'MA', 'SMK']),
  status: z.enum(['NEGERI', 'SWASTA']),
  akreditasi: z.enum(['A', 'B', 'C', 'TT']).optional(), // TT = Tidak Terakreditasi
  tahunBerdiri: z.number().int().min(1800),
  alamat: z.string().min(1).max(500),
  kelurahan: z.string().max(100),
  kecamatan: z.string().max(100),
  kabupaten: z.string().max(100),
  provinsi: z.string().max(100),
  kodePos: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  noTelepon: z.string().max(20).optional(),
  noFax: z.string().max(20).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  namaKepalaSekolah: z.string().max(100),
  nipKepalaSekolah: z.string().max(18).optional(),
  namaYayasan: z.string().max(200).optional(),
  alamatYayasan: z.string().max(500).optional(),
  npwp: z.string().max(30).optional(),
  // Facilities
  luasTanah: z.number().min(0).optional(),
  statusTanah: z.enum(['MILIK', 'SEWA', 'PINJAM', 'WAKAF']).optional(),
  luasBangunan: z.number().min(0).optional(),
  jumlahRuangKelas: z.number().int().min(0).optional(),
  jumlahRuangLab: z.number().int().min(0).optional(),
  jumlahRuangPerpustakaan: z.number().int().min(0).optional(),
  // Statistics
  jumlahSiswaTotal: z.number().int().min(0).optional(),
  jumlahSiswaLaki: z.number().int().min(0).optional(),
  jumlahSiswaPerempuan: z.number().int().min(0).optional(),
  jumlahGuruTotal: z.number().int().min(0).optional(),
  jumlahGuruPNS: z.number().int().min(0).optional(),
  jumlahGuruNonPNS: z.number().int().min(0).optional(),
  jumlahRombel: z.number().int().min(0).optional(),
});

// ==================== VALIDATION RESULT SCHEMA ====================

export const validationIssueSchema = z.object({
  field: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  recordId: z.string().optional(),
  recordName: z.string().optional(),
});

export const validationResultSchema = z.object({
  isValid: z.boolean(),
  totalRecords: z.number().int(),
  validRecords: z.number().int(),
  invalidRecords: z.number().int(),
  issues: z.array(validationIssueSchema),
  completenessPercentage: z.number().min(0).max(100),
});

// ==================== SUMMARY SCHEMA ====================

export const emisSummarySchema = z.object({
  institution: z.object({
    name: z.string(),
    npsn: z.string().optional(),
    jenjang: z.string(),
    status: z.string(),
    akreditasi: z.string().optional(),
  }),
  students: z.object({
    total: z.number().int(),
    active: z.number().int(),
    male: z.number().int(),
    female: z.number().int(),
    byGrade: z.record(z.number().int()),
    withNisn: z.number().int(),
    withoutNisn: z.number().int(),
    dataCompleteness: z.number(),
  }),
  teachers: z.object({
    total: z.number().int(),
    active: z.number().int(),
    male: z.number().int(),
    female: z.number().int(),
    certified: z.number().int(),
    uncertified: z.number().int(),
    withNuptk: z.number().int(),
    withoutNuptk: z.number().int(),
    byStatus: z.record(z.number().int()),
    dataCompleteness: z.number(),
  }),
  lastUpdated: z.string().datetime(),
});

// ==================== TYPE EXPORTS ====================

export type ExportStudentsQueryInput = z.infer<typeof exportStudentsQuerySchema>;
export type ExportTeachersQueryInput = z.infer<typeof exportTeachersQuerySchema>;
export type UnitIdParam = z.infer<typeof unitIdParamSchema>;

export type EmisStudentData = z.infer<typeof emisStudentDataSchema>;
export type EmisTeacherData = z.infer<typeof emisTeacherDataSchema>;
export type EmisInstitutionData = z.infer<typeof emisInstitutionDataSchema>;

export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type EmisSummary = z.infer<typeof emisSummarySchema>;
