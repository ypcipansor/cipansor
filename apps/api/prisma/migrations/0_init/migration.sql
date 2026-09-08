-- BASELINE. Satu titik awal untuk seluruh skema.
--
-- Riwayat sebelum ini (27 migrasi, s.d. 2026-07-25) TIDAK pernah bisa diputar
-- ulang dari basis data kosong: 20260709000000_add_pesantren_features_294 mati
-- dengan P3006, relation "complaints" does not exist. Karena itu produksi tidak
-- punya tabel _prisma_migrations sama sekali, setiap penggelaran memakai
-- `db push`, dan drift tidak pernah terlihat.
--
-- Berkas ini dihasilkan dari schema.prisma yang berlaku (prisma migrate diff
-- --from-empty --to-schema), lalu dibuktikan dua arah: dijalankan di basis data
-- kosong ia menghasilkan 294 tabel, dan hasilnya di-diff balik ke schema.prisma
-- menghasilkan "This is an empty migration." Produksi juga sudah nol drift
-- terhadap schema.prisma, sehingga ia di-baseline dengan
-- `migrate resolve --applied 0_init` — ditandai, bukan dijalankan.
--
-- SQL migrasi lama tetap ada di riwayat git; ia hanya tidak lagi berpura-pura
-- bisa dijalankan.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'UNIT_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "Realm" AS ENUM ('GLOBAL', 'YAYASAN', 'TK_QURAN', 'SD_IT', 'SMP_IT', 'SMA_QURAN', 'PESANTREN', 'PERGURUAN_TINGGI', 'UNIT_USAHA');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('SUPER_ADMIN', 'YAYASAN_PEMBINA', 'YAYASAN_KETUA', 'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA', 'YAYASAN_PENGAWAS', 'TKQ_ADMIN', 'TKQ_KEPALA_SEKOLAH', 'TKQ_WAKASEK', 'TKQ_GURU', 'TKQ_WALI_KELAS', 'TKQ_TATA_USAHA', 'TKQ_BENDAHARA', 'TKQ_KOMITE', 'TKQ_ORANG_TUA', 'SDIT_ADMIN', 'SDIT_KEPALA_SEKOLAH', 'SDIT_WAKASEK', 'SDIT_GURU', 'SDIT_WALI_KELAS', 'SDIT_TATA_USAHA', 'SDIT_BENDAHARA', 'SDIT_KOMITE', 'SDIT_ORANG_TUA', 'SDIT_SISWA', 'SMPIT_ADMIN', 'SMPIT_KEPALA_SEKOLAH', 'SMPIT_WAKASEK', 'SMPIT_GURU', 'SMPIT_WALI_KELAS', 'SMPIT_GURU_BK', 'SMPIT_TATA_USAHA', 'SMPIT_BENDAHARA', 'SMPIT_KOMITE', 'SMPIT_ORANG_TUA', 'SMPIT_SISWA', 'SMPIT_ALUMNI', 'SMAQ_ADMIN', 'SMAQ_KEPALA_SEKOLAH', 'SMAQ_WAKASEK', 'SMAQ_GURU', 'SMAQ_WALI_KELAS', 'SMAQ_GURU_BK', 'SMAQ_TATA_USAHA', 'SMAQ_BENDAHARA', 'SMAQ_KOMITE', 'SMAQ_ORANG_TUA', 'SMAQ_SISWA', 'SMAQ_ALUMNI', 'PT_REKTOR', 'PT_WAKIL_REKTOR', 'PT_DEKAN', 'PT_KAPRODI', 'PT_DOSEN', 'PT_MAHASISWA', 'PT_STAF_AKADEMIK', 'PT_TATA_USAHA', 'PT_ALUMNI', 'PESANTREN_PENGASUH', 'PESANTREN_DIREKTUR', 'PESANTREN_TATA_USAHA', 'USTADZ', 'MUSYRIF', 'MUSYRIFAH', 'MUHAFIDZ', 'MUHAFIDZAH', 'MURABBI', 'WALI_KAMAR', 'PUSTAKAWAN', 'PERAWAT', 'KEAMANAN', 'LABORAN', 'BUSINESS_MANAGER', 'BUSINESS_STAFF');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('PESANTREN', 'TK_QURAN', 'SD_IT', 'SMP_IT', 'SMA_QURAN', 'PERGURUAN_TINGGI', 'UNIT_USAHA', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'SICK', 'EXCUSED');

-- CreateEnum
CREATE TYPE "TahfidzActivityType" AS ENUM ('ZIYADAH', 'MUROJAAH', 'TASMI', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "PermitType" AS ENUM ('PULANG', 'KELUAR', 'SAKIT', 'KELUARGA', 'OTHER');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('MINOR', 'MODERATE', 'MAJOR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'EWALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "PAUDAspect" AS ENUM ('NAM', 'FM', 'KOG', 'BHS', 'SE', 'SNI');

-- CreateEnum
CREATE TYPE "PAUDAchievementLevel" AS ENUM ('BB', 'MB', 'BSH', 'BSB');

-- CreateEnum
CREATE TYPE "PAUDReportPeriod" AS ENUM ('HARIAN', 'MINGGUAN', 'BULANAN', 'SEMESTER');

-- CreateEnum
CREATE TYPE "DailyMood" AS ENUM ('HAPPY', 'NEUTRAL', 'SAD', 'TIRED', 'EXCITED', 'SICK');

-- CreateEnum
CREATE TYPE "MealConsumption" AS ENUM ('HABIS', 'SETENGAH', 'SEDIKIT', 'TIDAK_MAU');

-- CreateEnum
CREATE TYPE "MurojaahType" AS ENUM ('YAUMIYAH', 'USBUIYAH', 'SYAHRIYAH', 'TASMI');

-- CreateEnum
CREATE TYPE "TahfidzMistakeType" AS ENUM ('LAHIN_JALI', 'LAHIN_KHAFI', 'TAJWID', 'LUPA', 'URUTAN');

-- CreateEnum
CREATE TYPE "SimaanType" AS ENUM ('BIN_NAZHR', 'BIL_GHAIB', 'TAHDIR', 'TASMI', 'KHATAM');

-- CreateEnum
CREATE TYPE "PaymentVerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'TU_APPROVED', 'FINAL_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('REGISTERED', 'DOCUMENT_CHECK', 'TEST_SCHEDULED', 'TEST_COMPLETED', 'ACCEPTED', 'REJECTED', 'ENROLLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'MARRIAGE', 'BEREAVEMENT', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'SICK', 'LEAVE', 'REMOTE', 'DUTY');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('KTP', 'KK', 'NPWP', 'IJAZAH', 'TRANSKRIP_NILAI', 'SERTIFIKAT', 'SK_PENGANGKATAN', 'KONTRAK_KERJA', 'CV', 'LAINNYA');

-- CreateEnum
CREATE TYPE "EmploymentAction" AS ENUM ('HIRED', 'PROMOTED', 'DEMOTED', 'TRANSFERRED', 'TERMINATED', 'RESIGNED', 'RETIRED', 'SALARY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('AVAILABLE', 'BORROWED', 'RESERVED', 'MAINTENANCE', 'LOST');

-- CreateEnum
CREATE TYPE "BorrowingStatus" AS ENUM ('ACTIVE', 'RETURNED', 'OVERDUE', 'LOST');

-- CreateEnum
CREATE TYPE "MedicalRecordType" AS ENUM ('CHECKUP', 'ILLNESS', 'INJURY', 'FIRST_AID', 'REFERRAL', 'VACCINATION');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'SICK', 'RECOVERING', 'HOSPITALIZED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'ANNOUNCEMENT', 'REMINDER', 'ALERT', 'PAYMENT', 'ACADEMIC');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'DAMAGED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "AssetMaintenanceStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetDisposalReason" AS ENUM ('SOLD', 'LOST', 'DAMAGED', 'DONATED', 'OBSOLETE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'BROKEN');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('ACADEMIC', 'RELIGIOUS', 'TAHFIDZ', 'EXTRACURRICULAR');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('DAILY_TEST', 'QUIZ', 'MIDTERM', 'FINAL', 'PRACTICAL', 'PROJECT', 'TAHFIDZ_TEST');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'GRADED');

-- CreateEnum
CREATE TYPE "GradeType" AS ENUM ('EXAM', 'ASSIGNMENT', 'PARTICIPATION', 'ATTENDANCE', 'PROJECT', 'TAHFIDZ');

-- CreateEnum
CREATE TYPE "AlumniStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DECEASED');

-- CreateEnum
CREATE TYPE "DonationType" AS ENUM ('MONETARY', 'GOODS', 'SERVICE', 'SCHOLARSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "AlumniEventType" AS ENUM ('REUNION', 'SEMINAR', 'WORKSHOP', 'GATHERING', 'CHARITY', 'OTHER');

-- CreateEnum
CREATE TYPE "TakhosusStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "HalaqohDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "MuhasabahMood" AS ENUM ('EXCELLENT', 'GOOD', 'NEUTRAL', 'LOW', 'STRUGGLING');

-- CreateEnum
CREATE TYPE "PublicDonationType" AS ENUM ('INFAK', 'INFAK_BULANAN', 'ZAKAT_MAAL', 'ZAKAT_FITRAH', 'WAKAF', 'SEDEKAH_JARIYAH', 'PEMBANGUNAN', 'BEASISWA', 'OTHERS');

-- CreateEnum
CREATE TYPE "DonationPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'QRIS', 'EWALLET', 'OTHERS');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WaveStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED', 'FULL');

-- CreateEnum
CREATE TYPE "ExtracurricularCategory" AS ENUM ('SPORTS', 'ARTS', 'ACADEMIC', 'RELIGIOUS', 'SCOUTING', 'LEADERSHIP', 'LANGUAGE', 'TECHNOLOGY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtracurricularStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'WITHDRAWN', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CounselingCategory" AS ENUM ('ACADEMIC', 'CAREER', 'PERSONAL', 'SOCIAL', 'FAMILY', 'SPIRITUAL', 'PSYCHOLOGICAL_OBSERVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CounselingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CounselingPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ReferralType" AS ENUM ('INTERNAL', 'EXTERNAL', 'PARENT', 'MEDICAL');

-- CreateEnum
CREATE TYPE "DutyCategory" AS ENUM ('CLEANING', 'SECURITY', 'WORSHIP', 'KITCHEN', 'LIBRARY', 'DORMITORY', 'GARDEN', 'OTHER');

-- CreateEnum
CREATE TYPE "DutyStatus" AS ENUM ('PENDING', 'COMPLETED', 'ABSENT', 'SUBSTITUTED');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "MealAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'SICK', 'PERMIT');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('ACADEMIC', 'RELIGIOUS', 'EXTRACURRICULAR', 'MEETING', 'CEREMONY', 'HOLIDAY', 'OTHER');

-- CreateEnum
CREATE TYPE "EventScope" AS ENUM ('ALL_UNITS', 'SPECIFIC_UNIT', 'SPECIFIC_CLASS');

-- CreateEnum
CREATE TYPE "KitabLevel" AS ENUM ('PEMULA', 'DASAR', 'MENENGAH', 'LANJUT', 'MAHIR');

-- CreateEnum
CREATE TYPE "KitabCategory" AS ENUM ('TAUHID', 'FIQH', 'AKHLAQ', 'NAHWU', 'SHOROF', 'TAFSIR', 'HADITS', 'TARIKH', 'BALAGHAH', 'MANTIQ', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BIRTH_CERTIFICATE', 'FAMILY_CARD', 'ID_CARD', 'STUDENT_CARD', 'REPORT_CARD', 'DIPLOMA', 'CERTIFICATE', 'MEDICAL_RECORD', 'PHOTO', 'RECOMMENDATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('ACADEMIC', 'BEHAVIOR', 'ATTENDANCE', 'ACHIEVEMENT', 'CONCERN', 'HEALTH', 'SOCIAL', 'SPIRITUAL', 'PARENT_COMMUNICATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('HOMEROOM_ONLY', 'TEACHERS', 'STAFF', 'PARENTS');

-- CreateEnum
CREATE TYPE "BehaviorType" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "BehaviorCategory" AS ENUM ('DISCIPLINE', 'RESPECT', 'RESPONSIBILITY', 'COOPERATION', 'CLEANLINESS', 'PUNCTUALITY', 'RELIGIOUS', 'OTHER');

-- CreateEnum
CREATE TYPE "KitabAssessmentType" AS ENUM ('SOROGAN', 'BANDONGAN', 'MUSYAWARAH', 'WRITTEN', 'ORAL', 'HAFALAN');

-- CreateEnum
CREATE TYPE "KitabProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('JALAN_KAKI', 'SEPEDA', 'SEPEDA_MOTOR', 'MOBIL_PRIBADI', 'ANGKUTAN_UMUM', 'ANTAR_JEMPUT', 'PERAHU', 'OJEK', 'LAINNYA');

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('A', 'B', 'AB', 'O', 'TIDAK_TAHU');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('TIDAK_SEKOLAH', 'SD', 'SMP', 'SMA', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3', 'LAINNYA');

-- CreateEnum
CREATE TYPE "OccupationType" AS ENUM ('PNS', 'PEGAWAI_SWASTA', 'WIRASWASTA', 'PETANI', 'NELAYAN', 'BURUH', 'PEDAGANG', 'PENSIUNAN', 'TIDAK_BEKERJA', 'IBU_RUMAH_TANGGA', 'GURU', 'DOKTER', 'PENGACARA', 'LAINNYA', 'SUDAH_MENINGGAL');

-- CreateEnum
CREATE TYPE "IncomeRange" AS ENUM ('KURANG_500K', 'RANGE_500K_1JT', 'RANGE_1JT_2JT', 'RANGE_2JT_5JT', 'RANGE_5JT_10JT', 'RANGE_10JT_20JT', 'LEBIH_20JT', 'TIDAK_BERPENGHASILAN');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('PNS', 'PPPK', 'GTY', 'GTT', 'HONOR', 'KONTRAK');

-- CreateEnum
CREATE TYPE "TeacherCertification" AS ENUM ('BELUM_SERTIFIKASI', 'SUDAH_SERTIFIKASI', 'DALAM_PROSES');

-- CreateEnum
CREATE TYPE "LearningPhaseCode" AS ENUM ('FASE_A', 'FASE_B', 'FASE_C', 'FASE_D', 'FASE_E', 'FASE_F');

-- CreateEnum
CREATE TYPE "P5DimensionCode" AS ENUM ('BERIMAN', 'BERKEBINEKAAN', 'BERGOTONG_ROYONG', 'MANDIRI', 'BERNALAR_KRITIS', 'KREATIF');

-- CreateEnum
CREATE TYPE "AssessmentCategory" AS ENUM ('DIAGNOSTIK', 'FORMATIF', 'SUMATIF');

-- CreateEnum
CREATE TYPE "LandOwnership" AS ENUM ('MILIK_SENDIRI', 'SEWA', 'PINJAM_PAKAI', 'WAKAF', 'HIBAH', 'LAINNYA');

-- CreateEnum
CREATE TYPE "BuildingCondition" AS ENUM ('BAIK', 'RUSAK_RINGAN', 'RUSAK_SEDANG', 'RUSAK_BERAT');

-- CreateEnum
CREATE TYPE "BusinessUnitType" AS ENUM ('CANTEEN', 'LAUNDRY', 'COOPERATIVE', 'BOOKSTORE', 'CATERING', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChatbotEscalationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('RECEIVED', 'NOTIFIED', 'PICKED_UP', 'RETURNED');

-- CreateEnum
CREATE TYPE "LetterDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "LetterUrgency" AS ENUM ('NORMAL', 'IMMEDIATE', 'URGENT');

-- CreateEnum
CREATE TYPE "LetterType" AS ENUM ('SURAT_DINAS', 'NOTA_DINAS', 'SURAT_KEPUTUSAN', 'SURAT_TUGAS', 'SURAT_EDARAN', 'SURAT_UNDANGAN', 'SURAT_KETERANGAN', 'BERITA_ACARA', 'PENGUMUMAN');

-- CreateEnum
CREATE TYPE "LetterNature" AS ENUM ('PUBLIC', 'LIMITED', 'CONFIDENTIAL', 'STRICTLY_CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "LetterAuthoringTrack" AS ENUM ('GENERATED', 'UPLOADED');

-- CreateEnum
CREATE TYPE "LetterStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'REVISION_NEEDED', 'READY_TO_SIGN', 'SIGNED', 'SENT', 'ARCHIVED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "LetterFlowAction" AS ENUM ('CREATED', 'SUBMITTED', 'APPROVED', 'SIGNED', 'REVISION_REQUESTED', 'RESUBMITTED', 'DISPOSED', 'DISPOSITION_UPDATED', 'SENT', 'SIGNATURE_REVOKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SigningKeyRevocationCode" AS ENUM ('KEY_COMPROMISE', 'AFFILIATION_CHANGED', 'SUPERSEDED', 'CESSATION_OF_OPERATION', 'PRIVILEGE_WITHDRAWN');

-- CreateEnum
CREATE TYPE "SigningKeyRequestKind" AS ENUM ('ENROLLMENT', 'RENEWAL');

-- CreateEnum
CREATE TYPE "SigningKeyRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LetterRevocationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LetterDispatchChannel" AS ENUM ('HAND_DELIVERY', 'COURIER', 'POST', 'EMAIL', 'WHATSAPP', 'OTHER');

-- CreateEnum
CREATE TYPE "QualityStandardType" AS ENUM ('STANDAR_ISI', 'STANDAR_PROSES', 'STANDAR_KOMPETENSI_LULUSAN', 'STANDAR_PENDIDIK_DAN_TENAGA_KEPENDIDIKAN', 'STANDAR_SARANA_DAN_PRASARANA', 'STANDAR_PENGELOLAAN', 'STANDAR_PEMBIAYAAN', 'STANDAR_PENILAIAN_PENDIDIKAN');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'ESSAY', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('INDIVIDUAL', 'GROUP');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'LATE', 'GRADED', 'RETURNED');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('STRATEGIC', 'FINANCIAL', 'OPERATIONAL', 'COMPLIANCE', 'REPUTATIONAL', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'EXTREME');

-- CreateEnum
CREATE TYPE "RiskLikelihood" AS ENUM ('RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN');

-- CreateEnum
CREATE TYPE "RiskImpact" AS ENUM ('INSIGNIFICANT', 'MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC');

-- CreateEnum
CREATE TYPE "MitigationStrategy" AS ENUM ('AVOID', 'REDUCE', 'SHARE', 'ACCEPT');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('ACADEMIC', 'FACILITY', 'SERVICE', 'BULLYING', 'FINANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BSCPerspective" AS ENUM ('FINANCIAL', 'CUSTOMER', 'PROCESS', 'LEARNING');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('RPJP', 'RENSTRA', 'RKA');

-- CreateEnum
CREATE TYPE "PlanActivityKind" AS ENUM ('PROGRAM', 'KEGIATAN', 'SUBKEGIATAN');

-- CreateEnum
CREATE TYPE "PlanIndicatorLevel" AS ENUM ('IUP', 'IKU', 'IKP', 'IKK');

-- CreateEnum
CREATE TYPE "InternalAuditStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('OBSERVATION', 'MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ShariaCategory" AS ENUM ('MUAMALAH', 'TARBIYAH', 'IBADAH', 'AKHLAQ', 'GOVERNANCE');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'PARTIALLY', 'NON_COMPLIANT', 'UNDER_REVIEW', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "EnvironmentProgramStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WasteCategory" AS ENUM ('ORGANIC', 'INORGANIC', 'B3', 'PAPER', 'ELECTRONIC', 'OTHER');

-- CreateEnum
CREATE TYPE "TalentCategory" AS ENUM ('HIGH_POTENTIAL', 'KEY_TALENT', 'EMERGING', 'SOLID_PERFORMER', 'NEEDS_DEVELOPMENT');

-- CreateEnum
CREATE TYPE "PerformanceRating" AS ENUM ('OUTSTANDING', 'EXCEEDS', 'MEETS', 'BELOW', 'UNSATISFACTORY');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrgPositionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'VACANT');

-- CreateEnum
CREATE TYPE "SOPStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('PROPOSAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InnovationStatus" AS ENUM ('IDEA', 'EVALUATION', 'PILOT', 'IMPLEMENTED', 'SCALED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PracticumStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MustahikCategory" AS ENUM ('FAKIR', 'MISKIN', 'AMIL', 'MUALAF', 'RIQAB', 'GHARIMIN', 'FISABILILLAH', 'IBNU_SABIL');

-- CreateEnum
CREATE TYPE "SocialServiceType" AS ENUM ('FUNERAL', 'AMBULANCE', 'DISASTER_RELIEF', 'OTHER');

-- CreateEnum
CREATE TYPE "CascadingCategory" AS ENUM ('DIRECT', 'INDIRECT', 'NON_CASCADING');

-- CreateTable
CREATE TABLE "foundations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "founding_date" TIMESTAMP(3),
    "tax_id" TEXT,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo_url" TEXT,
    "vision" TEXT,
    "mission" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foundations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "reset_token_hash" TEXT,
    "reset_token_expires_at" TIMESTAMP(3),
    "phone" TEXT,
    "role" "UserRole",
    "unit_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" TEXT,
    "two_factor_secret_pending" TEXT,
    "two_factor_recovery_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_login_at" TIMESTAMP(3),
    "fcm_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "foundation_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "UnitType" NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "npsn" TEXT,
    "accreditation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "nip" TEXT,
    "nuptk" TEXT,
    "specialization" TEXT,
    "join_date" TIMESTAMP(3),
    "nik" TEXT,
    "no_kk" TEXT,
    "gender" "Gender",
    "birth_place" TEXT,
    "birth_date" TIMESTAMP(3),
    "religion" TEXT NOT NULL DEFAULT 'ISLAM',
    "nationality" TEXT NOT NULL DEFAULT 'Indonesia',
    "address" TEXT,
    "rt" TEXT,
    "rw" TEXT,
    "postal_code" TEXT,
    "province_id" TEXT,
    "regency_id" TEXT,
    "district_id" TEXT,
    "village_id" TEXT,
    "department_id" TEXT,
    "employment_status" "EmploymentStatus",
    "pangkat" TEXT,
    "golongan" TEXT,
    "tmt_pns" TIMESTAMP(3),
    "tmt_guru" TIMESTAMP(3),
    "sk_number" TEXT,
    "sk_date" TIMESTAMP(3),
    "last_education" "EducationLevel",
    "last_education_year" INTEGER,
    "last_education_major" TEXT,
    "last_education_institution" TEXT,
    "certification_status" "TeacherCertification",
    "certification_number" TEXT,
    "certification_year" INTEGER,
    "certification_subject" TEXT,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_account_name" TEXT,
    "weekly_hours" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "nip" TEXT,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "department_id" TEXT,
    "join_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "homeroom_teacher_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "nis" TEXT NOT NULL,
    "nisn" TEXT,
    "gender" "Gender" NOT NULL,
    "birth_place" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "parent_name" TEXT NOT NULL,
    "parent_phone" TEXT NOT NULL,
    "parent_email" TEXT,
    "photo_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "entry_year" INTEGER,
    "graduate_year" INTEGER,
    "nik" TEXT,
    "no_akta" TEXT,
    "no_kk" TEXT,
    "religion" TEXT NOT NULL DEFAULT 'ISLAM',
    "nationality" TEXT NOT NULL DEFAULT 'Indonesia',
    "rt" TEXT,
    "rw" TEXT,
    "postal_code" TEXT,
    "province_id" TEXT,
    "regency_id" TEXT,
    "district_id" TEXT,
    "village_id" TEXT,
    "transport_mode" "TransportMode",
    "distance_to_school" DECIMAL(5,2),
    "travel_time" INTEGER,
    "kip_number" TEXT,
    "is_pkh" BOOLEAN NOT NULL DEFAULT false,
    "is_kks" BOOLEAN NOT NULL DEFAULT false,
    "blood_type" "BloodType",
    "height" DECIMAL(5,2),
    "weight" DECIMAL(5,2),
    "head_circumference" DECIMAL(5,2),
    "special_needs" TEXT,
    "number_of_siblings" INTEGER,
    "child_order" INTEGER,
    "living_with" TEXT,
    "father_name" TEXT,
    "father_nik" TEXT,
    "father_birth_place" TEXT,
    "father_birth_date" TIMESTAMP(3),
    "father_education" "EducationLevel",
    "father_occupation" "OccupationType",
    "father_income" "IncomeRange",
    "father_phone" TEXT,
    "mother_name" TEXT,
    "mother_nik" TEXT,
    "mother_birth_place" TEXT,
    "mother_birth_date" TIMESTAMP(3),
    "mother_education" "EducationLevel",
    "mother_occupation" "OccupationType",
    "mother_income" "IncomeRange",
    "mother_phone" TEXT,
    "guardian_name" TEXT,
    "guardian_nik" TEXT,
    "guardian_relation" TEXT,
    "guardian_education" "EducationLevel",
    "guardian_occupation" "OccupationType",
    "guardian_income" "IncomeRange",
    "guardian_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_parents" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tahfidz_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "activity_type" "TahfidzActivityType" NOT NULL,
    "surah_number" INTEGER NOT NULL,
    "surah_name" TEXT NOT NULL,
    "ayah_start" INTEGER NOT NULL,
    "ayah_end" INTEGER NOT NULL,
    "juz" INTEGER NOT NULL,
    "total_ayah" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "audio_url" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tahfidz_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tahfidz_targets" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "target_juz" INTEGER NOT NULL,
    "target_ayah" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tahfidz_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hafidz_students" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hafidz_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dormitories" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "address" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dormitories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "dormitory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "capacity" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_assignments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permits" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "PermitType" NOT NULL,
    "reason" TEXT NOT NULL,
    "destination" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_note" TEXT,
    "departed_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "ViolationType" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "action" TEXT,
    "reported_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "given_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "given_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_types" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT,

    CONSTRAINT "payment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "payment_type_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "period" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference_no" TEXT,
    "proof_url" TEXT,
    "verification_status" "PaymentVerificationStatus" NOT NULL DEFAULT 'FINAL_APPROVED',
    "rejection_reason" TEXT,
    "tu_verified_at" TIMESTAMP(3),
    "tu_verified_by_id" TEXT,
    "final_verified_at" TIMESTAMP(3),
    "final_verified_by_id" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_members" (
    "id" TEXT NOT NULL,
    "foundation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "photo_url" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foundation_documents" (
    "id" TEXT NOT NULL,
    "foundation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "document_no" TEXT,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "file_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foundation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_periods" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "registration_fee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requirements" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrants" (
    "id" TEXT NOT NULL,
    "admission_period_id" TEXT NOT NULL,
    "wave_id" TEXT,
    "registration_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "gender" "Gender" NOT NULL,
    "birth_place" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "previous_school" TEXT,
    "quran_ability" TEXT,
    "memorized_juz" INTEGER,
    "parent_name" TEXT NOT NULL,
    "parent_phone" TEXT NOT NULL,
    "parent_email" TEXT,
    "parent_occupation" TEXT,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'REGISTERED',
    "test_score" DECIMAL(5,2),
    "interview_score" DECIMAL(5,2),
    "tahfidz_score" DECIMAL(5,2),
    "notes" TEXT,
    "accepted_at" TIMESTAMP(3),
    "enrolled_at" TIMESTAMP(3),
    "registration_fee_paid_at" TIMESTAMP(3),
    "registration_fee_amount" DECIMAL(12,2),
    "registration_fee_verified_by_id" TEXT,
    "registration_fee_note" TEXT,
    "student_id" TEXT,
    "campaign_id" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrant_documents" (
    "id" TEXT NOT NULL,
    "registrant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file_url" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT,
    "teacher_id" TEXT,
    "date" DATE NOT NULL,
    "status" "StaffAttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "check_in" TIMESTAMP(3),
    "check_out" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT,
    "teacher_id" TEXT,
    "type" "LeaveType" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "total_days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "total_days" INTEGER NOT NULL DEFAULT 12,
    "used_days" INTEGER NOT NULL DEFAULT 0,
    "remaining_days" INTEGER NOT NULL DEFAULT 12,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manager_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_contracts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contract_number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "document_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EmployeeDocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "EmploymentAction" NOT NULL,
    "previous_position" TEXT,
    "new_position" TEXT NOT NULL,
    "previous_department" TEXT,
    "new_department" TEXT,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "realm" "Realm" NOT NULL,
    "permissions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_categories" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publisher" TEXT,
    "publish_year" INTEGER,
    "language" TEXT NOT NULL DEFAULT 'Indonesia',
    "page_count" INTEGER,
    "shelf_location" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "available" INTEGER NOT NULL DEFAULT 1,
    "cover_url" TEXT,
    "description" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'AVAILABLE',
    "is_digital" BOOLEAN NOT NULL DEFAULT false,
    "file_url" TEXT,
    "file_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrowings" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "borrower_id" TEXT NOT NULL,
    "borrower_type" TEXT NOT NULL,
    "student_id" TEXT,
    "borrowed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "status" "BorrowingStatus" NOT NULL DEFAULT 'ACTIVE',
    "late_fee" DECIMAL(10,2),
    "notes" TEXT,
    "processed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "borrowings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT,
    "patient_id" TEXT,
    "type" "MedicalRecordType" NOT NULL,
    "visit_date" TIMESTAMP(3) NOT NULL,
    "complaint" TEXT NOT NULL,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "prescription" TEXT,
    "notes" TEXT,
    "referred_to" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "follow_up_date" TIMESTAMP(3),
    "status" "HealthStatus" DEFAULT 'HEALTHY',
    "temperature" DOUBLE PRECISION,
    "blood_pressure" TEXT,
    "heart_rate" INTEGER,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "type" TEXT NOT NULL,
    "dosage_form" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 10,
    "expiry_date" TIMESTAMP(3),
    "supplier" TEXT,
    "supplier_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_usage_logs" (
    "id" TEXT NOT NULL,
    "medication_id" TEXT NOT NULL,
    "student_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "given_by_id" TEXT NOT NULL,
    "given_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attachment_url" TEXT,
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "target_roles" TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "read_at" TIMESTAMP(3),
    "data" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "purchase_date" TIMESTAMP(3),
    "purchase_price" DECIMAL(15,2),
    "supplier" TEXT,
    "supplier_id" TEXT,
    "location" TEXT,
    "room_id" TEXT,
    "purchase_order_no" TEXT,
    "useful_life" INTEGER,
    "residual_value" DECIMAL(15,2),
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "warranty_expiry" TIMESTAMP(3),
    "notes" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "condition_before" "AssetCondition" NOT NULL,
    "condition_after" "AssetCondition",
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_audits" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_audit_items" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "system_status" TEXT NOT NULL,
    "actual_status" TEXT NOT NULL,
    "condition" "AssetCondition" NOT NULL,
    "notes" TEXT,
    "is_match" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_audit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "maintenance_date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AssetMaintenanceStatus" NOT NULL DEFAULT 'PENDING',
    "cost" DECIMAL(15,2),
    "vendor" TEXT,
    "performed_by" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "completion_date" TIMESTAMP(3),
    "invoice_url" TEXT,
    "next_schedule" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposals" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" "AssetDisposalReason" NOT NULL,
    "sale_price" DECIMAL(15,2),
    "book_value" DECIMAL(15,2),
    "notes" TEXT,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SubjectType" NOT NULL,
    "description" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 2,
    "level" TEXT,
    "passing_score" DECIMAL(5,2) NOT NULL DEFAULT 70,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "class_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "class_id" TEXT,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "objectives" TEXT NOT NULL,
    "materials" TEXT,
    "activities" TEXT,
    "assessment" TEXT,
    "resources" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 45,
    "planned_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "max_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "passing_score" DECIMAL(5,2) NOT NULL DEFAULT 70,
    "weight" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "question_bank_id" TEXT,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "exam_id" TEXT,
    "academic_year_id" TEXT NOT NULL,
    "type" "GradeType" NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "percentage" DECIMAL(5,2),
    "letter_grade" TEXT,
    "notes" TEXT,
    "graded_by_id" TEXT NOT NULL,
    "graded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_cards" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "total_score" DECIMAL(5,2),
    "average_score" DECIMAL(5,2),
    "rank" INTEGER,
    "total_students" INTEGER,
    "attendance" JSONB,
    "tahfidz_summary" JSONB,
    "teacher_notes" TEXT,
    "principal_notes" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_card_details" (
    "id" TEXT NOT NULL,
    "report_card_id" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "daily_score" DECIMAL(5,2),
    "midterm_score" DECIMAL(5,2),
    "final_score" DECIMAL(5,2),
    "average_score" DECIMAL(5,2),
    "letter_grade" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_card_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni" (
    "id" TEXT NOT NULL,
    "student_id" TEXT,
    "unit_id" TEXT NOT NULL,
    "registration_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "birth_place" TEXT,
    "birth_date" TIMESTAMP(3),
    "graduation_year" INTEGER NOT NULL,
    "graduation_date" TIMESTAMP(3),
    "last_class" TEXT,
    "tahfidz_level" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT DEFAULT 'Indonesia',
    "photo" TEXT,
    "status" "AlumniStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "alumni_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_careers" (
    "id" TEXT NOT NULL,
    "alumni_id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "industry" TEXT,
    "location" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_careers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_educations" (
    "id" TEXT NOT NULL,
    "alumni_id" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "location" TEXT,
    "start_year" INTEGER NOT NULL,
    "end_year" INTEGER,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "achievements" TEXT,
    "admission_path" TEXT,
    "scholarship_name" TEXT,
    "is_international" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_donations" (
    "id" TEXT NOT NULL,
    "alumni_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "type" "DonationType" NOT NULL,
    "amount" DECIMAL(15,2),
    "description" TEXT NOT NULL,
    "purpose" TEXT,
    "donated_at" TIMESTAMP(3) NOT NULL,
    "receipt_no" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_events" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "type" "AlumniEventType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "capacity" INTEGER,
    "fee" DECIMAL(12,2),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "organizer" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "alumni_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumni_event_attendees" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "alumni_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "attended_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alumni_event_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "halaqoh" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "capacity" INTEGER NOT NULL DEFAULT 15,
    "schedule_day" "HalaqohDay"[],
    "schedule_time" TEXT,
    "location" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "halaqoh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takhosus_enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "halaqoh_id" TEXT,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TakhosusStatus" NOT NULL DEFAULT 'ACTIVE',
    "target_juz" INTEGER NOT NULL DEFAULT 30,
    "target_completion_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_juz" INTEGER NOT NULL DEFAULT 0,
    "current_juz" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "takhosus_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanad_records" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "juz" INTEGER NOT NULL,
    "surah_start" INTEGER,
    "surah_end" INTEGER,
    "certified_at" TIMESTAMP(3) NOT NULL,
    "grade" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sanad_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_muhasabah" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sholat_subuh" BOOLEAN NOT NULL DEFAULT false,
    "sholat_dzuhur" BOOLEAN NOT NULL DEFAULT false,
    "sholat_ashar" BOOLEAN NOT NULL DEFAULT false,
    "sholat_maghrib" BOOLEAN NOT NULL DEFAULT false,
    "sholat_isya" BOOLEAN NOT NULL DEFAULT false,
    "sholat_tahajud" BOOLEAN NOT NULL DEFAULT false,
    "sholat_dhuha" BOOLEAN NOT NULL DEFAULT false,
    "sholat_rawatib" INTEGER NOT NULL DEFAULT 0,
    "puasa_sunnah" BOOLEAN NOT NULL DEFAULT false,
    "tilawah_pages" INTEGER NOT NULL DEFAULT 0,
    "tilawah_juz" INTEGER,
    "dzikir_pagi" BOOLEAN NOT NULL DEFAULT false,
    "dzikir_sore" BOOLEAN NOT NULL DEFAULT false,
    "istighfar" INTEGER NOT NULL DEFAULT 0,
    "shalawat" INTEGER NOT NULL DEFAULT 0,
    "murojaah_juz" INTEGER,
    "murojaah_pages" INTEGER NOT NULL DEFAULT 0,
    "ziyadah_ayat" INTEGER NOT NULL DEFAULT 0,
    "sedekah" BOOLEAN NOT NULL DEFAULT false,
    "membantu_orang_tua" BOOLEAN NOT NULL DEFAULT false,
    "berbaik_ke_teman" BOOLEAN NOT NULL DEFAULT false,
    "mood" "MuhasabahMood" NOT NULL DEFAULT 'NEUTRAL',
    "gratitude" TEXT,
    "improvement" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_muhasabah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_campaigns" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_amount" DECIMAL(15,2) NOT NULL,
    "collected_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "donor_count" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "image_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "donation_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "unit_id" TEXT,
    "donor_name" TEXT NOT NULL,
    "donor_phone" TEXT,
    "donor_email" TEXT,
    "donor_address" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "type" "PublicDonationType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "payment_method" "DonationPaymentMethod" NOT NULL,
    "payment_proof" TEXT,
    "receipt_number" TEXT,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "purpose" TEXT,
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "notes" TEXT,
    "donated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_waves" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "wave_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "quota" INTEGER NOT NULL,
    "registered_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "status" "WaveStatus" NOT NULL DEFAULT 'UPCOMING',
    "registration_fee" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracurriculars" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" "ExtracurricularCategory" NOT NULL,
    "description" TEXT,
    "schedule_day" "DayOfWeek"[],
    "schedule_time" TEXT,
    "venue" TEXT,
    "max_participants" INTEGER,
    "min_participants" INTEGER,
    "coach_id" TEXT,
    "assistant_coach_id" TEXT,
    "status" "ExtracurricularStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_compulsory" BOOLEAN NOT NULL DEFAULT false,
    "academic_year_id" TEXT NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "extracurriculars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracurricular_enrollments" (
    "id" TEXT NOT NULL,
    "extracurricular_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "grade" TEXT,
    "notes" TEXT,
    "graduated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracurricular_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracurricular_attendances" (
    "id" TEXT NOT NULL,
    "extracurricular_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracurricular_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracurricular_achievements" (
    "id" TEXT NOT NULL,
    "extracurricular_id" TEXT NOT NULL,
    "student_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" TEXT NOT NULL,
    "rank" TEXT,
    "organizer" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "certificate_url" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracurricular_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counseling_sessions" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "counselor_id" TEXT NOT NULL,
    "category" "CounselingCategory" NOT NULL,
    "priority" "CounselingPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "location" TEXT,
    "status" "CounselingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "summary" TEXT,
    "recommendations" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "is_confidential" BOOLEAN NOT NULL DEFAULT true,
    "parent_notified" BOOLEAN NOT NULL DEFAULT false,
    "psychology_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counseling_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counseling_notes" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "note_type" TEXT NOT NULL DEFAULT 'general',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counseling_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counseling_referrals" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" "ReferralType" NOT NULL,
    "referred_to" TEXT NOT NULL,
    "institution" TEXT,
    "reason" TEXT NOT NULL,
    "contact_info" TEXT,
    "referred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "follow_up_date" TIMESTAMP(3),
    "outcome" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counseling_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_types" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" "DutyCategory" NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_time" TEXT,
    "end_time" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_rosters" (
    "id" TEXT NOT NULL,
    "duty_type_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "status" "DutyStatus" NOT NULL DEFAULT 'PENDING',
    "substitute_id" TEXT,
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_menus" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "main_dish" TEXT NOT NULL,
    "side_dish" TEXT,
    "vegetable" TEXT,
    "soup" TEXT,
    "dessert" TEXT,
    "drink" TEXT,
    "notes" TEXT,
    "calories" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_attendances" (
    "id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "MealAttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "portions" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_diets" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "diet_type" TEXT NOT NULL,
    "allergies" TEXT[],
    "medical_notes" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "special_diets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "class_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_type" "EventType" NOT NULL,
    "scope" "EventScope" NOT NULL DEFAULT 'ALL_UNITS',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "online_url" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitab_kuning" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "category" "KitabCategory" NOT NULL,
    "level" "KitabLevel" NOT NULL,
    "total_pages" INTEGER,
    "total_bab" INTEGER,
    "description" TEXT,
    "cover_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitab_kuning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitab_progress" (
    "id" TEXT NOT NULL,
    "kitab_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "current_page" INTEGER NOT NULL DEFAULT 0,
    "current_bab" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "grade" TEXT,
    "notes" TEXT,
    "academic_year_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitab_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "muhadhoroh" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'Indonesian',
    "duration" INTEGER,
    "content_score" INTEGER,
    "delivery_score" INTEGER,
    "language_score" INTEGER,
    "total_score" INTEGER,
    "grade" TEXT,
    "feedback" TEXT,
    "evaluator_id" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "video_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "muhadhoroh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "muhadatsah" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "language" TEXT NOT NULL,
    "partner_id" TEXT,
    "topic" TEXT,
    "duration" INTEGER,
    "fluency_score" INTEGER,
    "grammar_score" INTEGER,
    "vocabulary_score" INTEGER,
    "pronunciation_score" INTEGER,
    "total_score" INTEGER,
    "grade" TEXT,
    "feedback" TEXT,
    "evaluator_id" TEXT,
    "evaluated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "recording_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "muhadatsah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "issue_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "document_number" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_certificates" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "certificate_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "certificate_number" TEXT NOT NULL,
    "qr_code" TEXT NOT NULL,
    "verification_url" TEXT NOT NULL,
    "grade" TEXT,
    "rank" INTEGER,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "signatory_name" TEXT NOT NULL,
    "signatory_title" TEXT NOT NULL,
    "signature_url" TEXT,
    "pdf_url" TEXT,
    "thumbnail_url" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_notes" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "category" "NoteCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" "NotePriority" NOT NULL DEFAULT 'MEDIUM',
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'HOMEROOM_ONLY',
    "requires_follow_up" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_date" TIMESTAMP(3),
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "behavior_type" "BehaviorType" NOT NULL,
    "category" "BehaviorCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "points" INTEGER,
    "action_taken" TEXT,
    "witnessed_by_id" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavior_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitab" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "author" TEXT,
    "category" "KitabCategory" NOT NULL,
    "level" "KitabLevel" NOT NULL,
    "description" TEXT,
    "total_bab" INTEGER,
    "total_halaman" INTEGER,
    "total_fashl" INTEGER,
    "target_duration" TEXT,
    "prerequisites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitab_assignments" (
    "id" TEXT NOT NULL,
    "kitab_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "schedule" JSONB,
    "target_bab" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitab_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitab_student_progress" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kitab_assignment_id" TEXT NOT NULL,
    "current_bab" INTEGER NOT NULL DEFAULT 0,
    "current_halaman" INTEGER,
    "current_fashl" INTEGER,
    "status" "KitabProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitab_student_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitab_progress_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kitab_assignment_id" TEXT NOT NULL,
    "kitab_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "assessment_type" "KitabAssessmentType" NOT NULL,
    "bab_number" INTEGER,
    "halaman_start" INTEGER,
    "halaman_end" INTEGER,
    "fashl_number" INTEGER,
    "topic" TEXT,
    "score" DOUBLE PRECISION,
    "predicate" TEXT,
    "is_passed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "teacher_feedback" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitab_progress_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provinces" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regencies" (
    "id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'KABUPATEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "regency_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "villages" (
    "id" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DESA',
    "postal_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "villages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_phases" (
    "id" TEXT NOT NULL,
    "code" "LearningPhaseCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "gradeRange" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_outcomes" (
    "id" TEXT NOT NULL,
    "phase_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "elements" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_objectives" (
    "id" TEXT NOT NULL,
    "learning_outcome_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "indicators" JSONB,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_modules" (
    "id" TEXT NOT NULL,
    "learning_objective_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "class_id" TEXT,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "objectives" TEXT NOT NULL,
    "prerequisites" TEXT,
    "targetLearners" TEXT,
    "materials" JSONB,
    "activities" JSONB,
    "assessment_plan" JSONB,
    "differentiation" JSONB,
    "reflection" TEXT,
    "attachments" JSONB,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p5_themes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "p5_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p5_projects" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "class_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectives" JSONB,
    "dimensions" JSONB NOT NULL,
    "activities" JSONB,
    "schedule" JSONB,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p5_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p5_assessments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "beriman" TEXT,
    "berkebinekaan" TEXT,
    "bergotong_royong" TEXT,
    "mandiri" TEXT,
    "bernalar_kritis" TEXT,
    "kreatif" TEXT,
    "overall_grade" TEXT,
    "notes" TEXT,
    "assessed_by_id" TEXT NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p5_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merdeka_assessments" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "learning_objective_id" TEXT,
    "teacher_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "AssessmentCategory" NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "assessment_date" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "max_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "weight" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "rubric" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merdeka_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merdeka_assessment_results" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "score" DECIMAL(5,2),
    "percentage" DECIMAL(5,2),
    "grade" TEXT,
    "feedback" TEXT,
    "attachments" JSONB,
    "graded_by_id" TEXT NOT NULL,
    "graded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merdeka_assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_components" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarships" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quota" INTEGER,
    "requirements" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_discounts" (
    "id" TEXT NOT NULL,
    "scholarship_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discount_value" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholarship_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_recipients" (
    "id" TEXT NOT NULL,
    "scholarship_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "total_score" DOUBLE PRECISION,
    "notes" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarship_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parent_id" TEXT,
    "unit_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "normal_balance" TEXT NOT NULL DEFAULT 'DEBIT',
    "cash_flow_category" TEXT,
    "net_asset_category" TEXT,
    "ziswaf_fund_type" TEXT,

    CONSTRAINT "account_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "used_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "period_type" TEXT NOT NULL DEFAULT 'YEARLY',
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_periods" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_notes" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "period_id" TEXT,
    "report_type" TEXT NOT NULL,
    "section_key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "reference_type" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lands" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area" DECIMAL(12,2) NOT NULL,
    "ownership" "LandOwnership" NOT NULL,
    "certificate_no" TEXT,
    "certificate_date" TIMESTAMP(3),
    "acquisition_date" TIMESTAMP(3),
    "acquisition_value" DECIMAL(15,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "land_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floors" INTEGER NOT NULL DEFAULT 1,
    "building_area" DECIMAL(12,2) NOT NULL,
    "year_built" INTEGER,
    "condition" "BuildingCondition" NOT NULL DEFAULT 'BAIK',
    "last_renovation" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_rooms" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "building_id" TEXT,
    "room_type_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "length" DECIMAL(8,2),
    "width" DECIMAL(8,2),
    "area" DECIMAL(10,2),
    "capacity" INTEGER,
    "condition" "BuildingCondition" NOT NULL DEFAULT 'BAIK',
    "facilities" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_schedule_templates" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activities" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "musyrifs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "teacher_id" TEXT,
    "code" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "join_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "musyrifs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "musyrif_assignments" (
    "id" TEXT NOT NULL,
    "musyrif_id" TEXT NOT NULL,
    "dormitory_id" TEXT NOT NULL,
    "room_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PEMBINA',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "musyrif_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "santri_wallets" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "last_top_up" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "santri_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balance_before" DECIMAL(15,2) NOT NULL,
    "balance_after" DECIMAL(15,2) NOT NULL,
    "reference" TEXT,
    "reference_type" TEXT,
    "description" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_units" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "BusinessUnitType" NOT NULL,
    "description" TEXT,
    "manager_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_categories" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_items" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "category_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(15,2) NOT NULL,
    "cost_price" DECIMAL(15,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 5,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_transactions" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "transaction_no" TEXT NOT NULL,
    "student_id" TEXT,
    "wallet_id" TEXT,
    "customer_name" TEXT,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "cashier_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_transaction_items" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "canteen_transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteen_stock_movements" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stock_before" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canteen_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laundry_pricings" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_per_kg" DECIMAL(15,2) NOT NULL,
    "min_weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "process_days" INTEGER NOT NULL DEFAULT 2,
    "is_express" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laundry_pricings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laundry_transactions" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "business_unit_id" TEXT,
    "transaction_no" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "wallet_id" TEXT,
    "pricing_id" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "price_per_kg" DECIMAL(15,2) NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimated_at" TIMESTAMP(3) NOT NULL,
    "ready_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "notes" TEXT,
    "received_by_id" TEXT NOT NULL,
    "delivered_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laundry_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laundry_items" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "laundry_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laundry_status_logs" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laundry_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "description" TEXT,
    "is_fixed" BOOLEAN NOT NULL DEFAULT true,
    "is_percentage" BOOLEAN NOT NULL DEFAULT false,
    "percentage_of" TEXT,
    "default_amount" DECIMAL(15,2),
    "default_rate" DECIMAL(5,4),
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salaries" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "base_salary" DECIMAL(15,2) NOT NULL,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "bank_holder" TEXT,
    "tax_status" TEXT NOT NULL DEFAULT 'TK/0',
    "npwp" TEXT,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary_items" (
    "id" TEXT NOT NULL,
    "salary_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_percentage" BOOLEAN NOT NULL DEFAULT false,
    "rate" DECIMAL(5,4),
    "notes" TEXT,

    CONSTRAINT "employee_salary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "pay_date" TIMESTAMP(3),
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "employee_no" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "department" TEXT,
    "position" TEXT,
    "base_salary" DECIMAL(15,2) NOT NULL,
    "total_earnings" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_salary" DECIMAL(15,2) NOT NULL,
    "taxable_income" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_status" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "bank_holder" TEXT,
    "work_days" INTEGER NOT NULL DEFAULT 0,
    "present_days" INTEGER NOT NULL DEFAULT 0,
    "absent_days" INTEGER NOT NULL DEFAULT 0,
    "late_days" INTEGER NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "payroll_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "component_code" TEXT NOT NULL,
    "component_name" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "is_percentage" BOOLEAN NOT NULL DEFAULT false,
    "rate" DECIMAL(5,4),
    "base_amount" DECIMAL(15,2),
    "notes" TEXT,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pkg_periods" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pkg_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pkg_evaluations" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "assessor_id" TEXT,
    "pedagogik_score" DECIMAL(3,2),
    "kepribadian_score" DECIMAL(3,2),
    "sosial_score" DECIMAL(3,2),
    "profesional_score" DECIMAL(3,2),
    "total_score" DECIMAL(5,2),
    "grade" TEXT,
    "credit_points" DECIMAL(5,2),
    "recommendation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "self_assessment_at" TIMESTAMP(3),
    "observed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pkg_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pkg_details" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "indicator" TEXT NOT NULL,
    "indicator_name" TEXT NOT NULL,
    "self_score" INTEGER,
    "assessor_score" INTEGER,
    "final_score" INTEGER,
    "evidence" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pkg_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pkg_documents" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pkg_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "reflection" TEXT,
    "academic_year_id" TEXT,
    "subject_id" TEXT,
    "class_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_showcase" BOOLEAN NOT NULL DEFAULT false,
    "score" DECIMAL(5,2),
    "feedback" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_files" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_comments" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "islamic_events" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "name" TEXT NOT NULL,
    "name_arabic" TEXT,
    "type" TEXT NOT NULL,
    "hijri_month" INTEGER NOT NULL,
    "hijri_day" INTEGER NOT NULL,
    "gregorian_date" TIMESTAMP(3),
    "gregorian_year" INTEGER,
    "description" TEXT,
    "activities" TEXT,
    "is_holiday" BOOLEAN NOT NULL DEFAULT false,
    "is_recurring" BOOLEAN NOT NULL DEFAULT true,
    "schedule_adjustment" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "islamic_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_ibadah_targets" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "points" INTEGER NOT NULL DEFAULT 10,
    "bonus_points" INTEGER NOT NULL DEFAULT 0,
    "target_type" TEXT NOT NULL,
    "target_count" INTEGER NOT NULL DEFAULT 1,
    "target_unit" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_ibadah_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_ibadah_records" (
    "id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "actual_count" INTEGER,
    "actual_minutes" INTEGER,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "bonus_earned" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_ibadah_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ibadah_leaderboards" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "bonus_points" INTEGER NOT NULL DEFAULT 0,
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "completion_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ibadah_leaderboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_secrets" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_personas" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_usage_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "model" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "unmetered_requests" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_conversations" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_escalations" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "question" TEXT NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "status" "ChatbotEscalationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "from_cache" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rapor_pesantren" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tahfidz_data" JSONB,
    "takhosus_data" JSONB,
    "ibadah_data" JSONB,
    "muhadhoroh_data" JSONB,
    "muhadatsah_data" JSONB,
    "kitab_progress_data" JSONB,
    "akhlak_data" JSONB,
    "attendance_data" JSONB,
    "academic_data" JSONB,
    "overall_score" DOUBLE PRECISION,
    "overall_grade" TEXT,
    "notes" TEXT,
    "head_teacher_notes" TEXT,
    "musyrif_notes" TEXT,
    "principal_notes" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rapor_pesantren_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paud_development_indicators" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "aspect" "PAUDAspect" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "age_group_min" INTEGER NOT NULL,
    "age_group_max" INTEGER NOT NULL,
    "order_number" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paud_development_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paud_development_assessments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "semester" TEXT,
    "period_type" "PAUDReportPeriod" NOT NULL,
    "period_date" DATE NOT NULL,
    "aspect" "PAUDAspect" NOT NULL,
    "indicator_id" TEXT,
    "achievement_level" "PAUDAchievementLevel" NOT NULL,
    "narrative_text" TEXT,
    "teacher_notes" TEXT,
    "recommendations" TEXT,
    "assessed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paud_development_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paud_assessment_evidences" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_name" TEXT,
    "caption" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paud_assessment_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paud_narrative_reports" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "narrative_nam" TEXT,
    "narrative_fm" TEXT,
    "narrative_kog" TEXT,
    "narrative_bhs" TEXT,
    "narrative_se" TEXT,
    "narrative_sni" TEXT,
    "overall_strengths" TEXT,
    "areas_for_development" TEXT,
    "parent_recommendations" TEXT,
    "tahfidz_summary" JSONB,
    "health_summary" JSONB,
    "teacher_signature" TEXT,
    "principal_signature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finalized_at" TIMESTAMP(3),
    "printed_at" TIMESTAMP(3),
    "total_days" INTEGER NOT NULL DEFAULT 0,
    "present_days" INTEGER NOT NULL DEFAULT 0,
    "sick_days" INTEGER NOT NULL DEFAULT 0,
    "excused_days" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paud_narrative_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paud_report_photos" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "caption" TEXT,
    "order_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paud_report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_student_reports" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT,
    "report_date" DATE NOT NULL,
    "unit_type" "UnitType" NOT NULL,
    "arrival_time" TIMESTAMP(3),
    "mood" "DailyMood",
    "health_status" TEXT,
    "temperature" DOUBLE PRECISION,
    "had_breakfast" BOOLEAN,
    "meal_status" "MealConsumption",
    "snack_status" "MealConsumption",
    "nap_duration" INTEGER,
    "toilet_notes" TEXT,
    "sholat_dhuha" BOOLEAN,
    "sholat_dzuhur" BOOLEAN,
    "sholat_ashar" BOOLEAN,
    "sholat_jamaah" BOOLEAN,
    "tahfidz_activity" TEXT,
    "activities_summary" TEXT,
    "achievements" TEXT,
    "behavior_notes" TEXT,
    "teacher_notes" TEXT,
    "home_activity" TEXT,
    "departure_time" TIMESTAMP(3),
    "picked_up_by" TEXT,
    "notified_at" TIMESTAMP(3),
    "notified_via" TEXT,
    "parent_read_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_student_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_photos" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_homework" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "murojaah_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "halaqoh_id" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "murojaah_type" "MurojaahType" NOT NULL,
    "murojaah_date" DATE NOT NULL,
    "juz_start" INTEGER NOT NULL,
    "juz_end" INTEGER NOT NULL,
    "pages_reviewed" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "quality_score" INTEGER NOT NULL,
    "mistake_count" INTEGER NOT NULL DEFAULT 0,
    "fluency_level" INTEGER NOT NULL DEFAULT 0,
    "tajwid_score" INTEGER,
    "notes" TEXT,
    "improvement_areas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "murojaah_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "murojaah_mistakes" (
    "id" TEXT NOT NULL,
    "murojaah_id" TEXT NOT NULL,
    "mistake_type" "TahfidzMistakeType" NOT NULL,
    "juz" INTEGER NOT NULL,
    "surah_number" INTEGER NOT NULL,
    "ayah_number" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "murojaah_mistakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simaan_exams" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "halaqoh_id" TEXT,
    "simaan_type" "SimaanType" NOT NULL,
    "exam_date" TIMESTAMP(3) NOT NULL,
    "session_number" INTEGER NOT NULL DEFAULT 1,
    "total_sessions" INTEGER NOT NULL DEFAULT 1,
    "juz_start" INTEGER NOT NULL,
    "juz_end" INTEGER NOT NULL,
    "overall_score" DOUBLE PRECISION,
    "tajwid_score" DOUBLE PRECISION,
    "fashoha_score" DOUBLE PRECISION,
    "tartil_score" DOUBLE PRECISION,
    "grade" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "recommendations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simaan_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simaan_examiners" (
    "id" TEXT NOT NULL,
    "simaan_id" TEXT NOT NULL,
    "examiner_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simaan_examiners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_metric_snapshots" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "academic_year_id" TEXT,
    "metric_type" TEXT NOT NULL,
    "metric_value" DOUBLE PRECISION NOT NULL,
    "metric_data" JSONB,
    "period_type" TEXT NOT NULL,
    "period_date" DATE NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "dashboard_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_comparison_reports" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "academic_year_id" TEXT,
    "report_type" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "report_data" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by_id" TEXT,

    CONSTRAINT "unit_comparison_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "record_date" DATE NOT NULL,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "head_circumference" DOUBLE PRECISION,
    "age_months" INTEGER NOT NULL,
    "weight_z_score" DOUBLE PRECISION,
    "height_z_score" DOUBLE PRECISION,
    "bmi_z_score" DOUBLE PRECISION,
    "nutrition_status" TEXT,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "growth_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "immunization_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "vaccine_name" TEXT NOT NULL,
    "vaccine_code" TEXT,
    "dose_number" INTEGER NOT NULL,
    "scheduled_date" DATE,
    "administered_date" DATE,
    "administered_at" TEXT,
    "batch_number" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "immunization_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_history" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contact_person" TEXT,
    "category" TEXT,
    "rating" INTEGER DEFAULT 0,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "preferred_supplier_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "total_estimated" DECIMAL(15,2) NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "ordered_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "estimated_price" DECIMAL(15,2) NOT NULL,
    "total_price" DECIMAL(15,2) NOT NULL,
    "asset_category_id" TEXT,
    "budget_id" TEXT,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_books" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "purpose" TEXT NOT NULL,
    "phone" TEXT,
    "check_in" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_out" TIMESTAMP(3),
    "visitor_count" INTEGER NOT NULL DEFAULT 1,
    "vehicle_number" TEXT,
    "received_by_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_visits" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "purpose" TEXT,
    "check_in" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_out" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_packages" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_phone" TEXT,
    "expedition" TEXT,
    "description" TEXT,
    "photo_url" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_id" TEXT NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'RECEIVED',
    "delivered_at" TIMESTAMP(3),
    "delivered_to" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "budget" DECIMAL(15,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_interactions" (
    "id" TEXT NOT NULL,
    "registrant_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "next_action_date" TIMESTAMP(3),
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_flow_events" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" "LetterFlowAction" NOT NULL,
    "target_id" TEXT,
    "from_status" "LetterStatus",
    "to_status" "LetterStatus",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_flow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_signing_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "public_key" TEXT NOT NULL,
    "encrypted_private_key" TEXT NOT NULL,
    "kdf_salt" TEXT NOT NULL,
    "kdf_params" JSONB NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "revocation_code" "SigningKeyRevocationCode",
    "revoked_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "nik" TEXT NOT NULL,
    "birth_place" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "verification_note" TEXT,
    "ktp_file_name" TEXT,
    "ktp_sha256" TEXT,
    "ktp_uploaded_at" TIMESTAMP(3),
    "ktp_retain_until" TIMESTAMP(3),
    "ktp_deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_key_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "SigningKeyRequestKind" NOT NULL,
    "status" "SigningKeyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "granted_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signing_key_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_signatures" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "signer_id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "verification_token" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_hash" TEXT,
    "pdf_signature" TEXT,
    "signer_role_code" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "revoked_by_id" TEXT,
    "revoked_by_role_code" TEXT,
    "revocation_digest" TEXT,
    "revocation_signature" TEXT,
    "revocation_public_key" TEXT,

    CONSTRAINT "letter_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_signed_documents" (
    "id" TEXT NOT NULL,
    "signature_id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "generator" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_signed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_revocation_requests" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "signature_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attachment_url" TEXT,
    "status" "LetterRevocationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_revocation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filing_classifications" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "retention_years" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filing_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_numbers" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "format" TEXT NOT NULL,
    "resetPeriod" TEXT NOT NULL DEFAULT 'YEARLY',

    CONSTRAINT "agenda_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letters" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "direction" "LetterDirection" NOT NULL,
    "type" "LetterType" NOT NULL DEFAULT 'SURAT_DINAS',
    "classification_id" TEXT,
    "agenda_number" TEXT,
    "letter_number" TEXT,
    "date" DATE NOT NULL,
    "received_at" TIMESTAMP(3),
    "subject" TEXT NOT NULL,
    "content" TEXT,
    "file_url" TEXT,
    "urgency" "LetterUrgency" NOT NULL DEFAULT 'NORMAL',
    "nature" "LetterNature" NOT NULL DEFAULT 'PUBLIC',
    "status" "LetterStatus" NOT NULL DEFAULT 'DRAFT',
    "authoring_track" "LetterAuthoringTrack" NOT NULL DEFAULT 'GENERATED',
    "sender_name" TEXT,
    "sender_title" TEXT,
    "sender_instance" TEXT,
    "recipient_name" TEXT,
    "recipient_instance" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_reviewers" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "is_signer" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_recipients" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "user_id" TEXT,
    "unit_id" TEXT,
    "is_cc" BOOLEAN NOT NULL DEFAULT false,
    "external_name" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_attachments" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 1,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_dispatches" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "dispatched_by_id" TEXT NOT NULL,
    "dispatched_at" TIMESTAMP(3) NOT NULL,
    "channel" "LetterDispatchChannel" NOT NULL,
    "received_by_name" TEXT,
    "tracking_number" TEXT,
    "receipt_url" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositions" (
    "id" TEXT NOT NULL,
    "letter_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "parent_disposition_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_standards" (
    "id" TEXT NOT NULL,
    "type" "QualityStandardType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_indicators" (
    "id" TEXT NOT NULL,
    "standard_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_score" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_evidences" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "indicator_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "description" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_audits" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PLANNED',
    "lead_auditor_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_audit_items" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "indicator_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "auditor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_audit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_banks" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "bank_id" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "content" TEXT NOT NULL,
    "options" JSONB,
    "answer_key" JSONB,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "learning_objective_id" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" JSONB,
    "is_correct" BOOLEAN,
    "score" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "class_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AssignmentType" NOT NULL DEFAULT 'INDIVIDUAL',
    "due_date" TIMESTAMP(3) NOT NULL,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "content" TEXT,
    "attachments" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "grade" DECIMAL(5,2),
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "RiskCategory" NOT NULL,
    "cause" TEXT,
    "consequence" TEXT,
    "likelihood" "RiskLikelihood" NOT NULL,
    "impact" "RiskImpact" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "residual_likelihood" "RiskLikelihood",
    "residual_impact" "RiskImpact",
    "residual_score" INTEGER,
    "residual_level" "RiskLevel",
    "owner_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "strategic_plan_id" TEXT,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_mitigations" (
    "id" TEXT NOT NULL,
    "risk_id" TEXT NOT NULL,
    "strategy" "MitigationStrategy" NOT NULL,
    "actionPlan" TEXT NOT NULL,
    "pic_id" TEXT,
    "deadline" TIMESTAMP(3),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_mitigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "user_id" TEXT,
    "category" "ComplaintCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "building_id" TEXT,
    "room_id" TEXT,
    "asset_id" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'NORMAL',
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "assigned_to_id" TEXT,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_comments" (
    "id" TEXT NOT NULL,
    "complaint_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "manager_id" TEXT NOT NULL,
    "budget" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_columns" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,

    CONSTRAINT "project_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "column_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "due_date" TIMESTAMP(3),
    "assignee_id" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "checklist" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategic_plans" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vision" TEXT,
    "mission" TEXT,
    "type" "PlanType" NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "budget" DECIMAL(15,2),
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategic_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_collaborators" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_objectives" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "perspective" "BSCPerspective" NOT NULL DEFAULT 'PROCESS',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "PlanPriority" NOT NULL DEFAULT 'MEDIUM',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_indicators" (
    "id" TEXT NOT NULL,
    "objective_id" TEXT,
    "activity_id" TEXT,
    "level" "PlanIndicatorLevel",
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION,
    "target_value" DOUBLE PRECISION NOT NULL,
    "current_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "definition" TEXT,
    "formula" TEXT,
    "data_source" TEXT,
    "frequency" TEXT,
    "pic_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_indicator_targets" (
    "id" TEXT NOT NULL,
    "indicator_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "target_value" DOUBLE PRECISION NOT NULL,
    "actual_value" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_indicator_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_activities" (
    "id" TEXT NOT NULL,
    "objective_id" TEXT,
    "parent_id" TEXT,
    "kind" "PlanActivityKind" NOT NULL DEFAULT 'KEGIATAN',
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "pic_id" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "schedule_months" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "budget" DECIMAL(15,2),
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "PlanPriority" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "budget_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_activity_budget_items" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL,
    "unit_price" DECIMAL(15,2),
    "amount" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_activity_budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_funding_sources" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "basis" TEXT,
    "amount" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_funding_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_audits" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audit_type" TEXT NOT NULL,
    "status" "InternalAuditStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_date" TIMESTAMP(3) NOT NULL,
    "executed_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "lead_auditor_id" TEXT NOT NULL,
    "scope" TEXT,
    "methodology" TEXT,
    "conclusion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "strategic_plan_id" TEXT,
    "risk_id" TEXT,

    CONSTRAINT "internal_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_findings" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "finding_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "category" TEXT NOT NULL,
    "evidence" TEXT,
    "root_cause" TEXT,
    "recommendation" TEXT,
    "responsible_id" TEXT,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "plan_objective_id" TEXT,
    "risk_id" TEXT,

    CONSTRAINT "audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_follow_ups" (
    "id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "evidence" TEXT,
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sharia_compliances" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "category" "ShariaCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "standard" TEXT,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "next_review_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sharia_compliances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sharia_audits" (
    "id" TEXT NOT NULL,
    "compliance_id" TEXT NOT NULL,
    "auditor_id" TEXT NOT NULL,
    "audit_date" TIMESTAMP(3) NOT NULL,
    "findings" TEXT NOT NULL,
    "recommendation" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sharia_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_programs" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "EnvironmentProgramStatus" NOT NULL DEFAULT 'PLANNED',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "budget" DECIMAL(15,2),
    "pic_id" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "course_id" TEXT,

    CONSTRAINT "environment_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_management" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "category" "WasteCategory" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "record_date" TIMESTAMP(3) NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_management_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "green_campus_indicators" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "target_value" DOUBLE PRECISION NOT NULL,
    "current_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "record_date" TIMESTAMP(3) NOT NULL,
    "carbon_emissions" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "green_campus_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "category" "TalentCategory" NOT NULL DEFAULT 'SOLID_PERFORMER',
    "current_role" TEXT NOT NULL,
    "potential_role" TEXT,
    "readiness_level" TEXT,
    "strengths" TEXT,
    "development_areas" TEXT,
    "career_aspiration" TEXT,
    "last_assessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_assessments" (
    "id" TEXT NOT NULL,
    "talent_id" TEXT NOT NULL,
    "assessor_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "performance_rating" "PerformanceRating" NOT NULL,
    "potential_rating" "PerformanceRating" NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "competencies" JSONB,
    "feedback" TEXT,
    "development_plan" TEXT,
    "assessed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "succession_plans" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "position_title" TEXT NOT NULL,
    "current_holder_id" TEXT,
    "successor_id" TEXT,
    "readiness_level" TEXT,
    "priority" "PlanPriority" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "target_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "succession_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_programs" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "trainer" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "max_participants" INTEGER,
    "budget" DECIMAL(15,2),
    "status" "TrainingStatus" NOT NULL DEFAULT 'PLANNED',
    "location" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_enrollments" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "completed_at" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "certificate" TEXT,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_units" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_positions" (
    "id" TEXT NOT NULL,
    "org_unit_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "status" "OrgPositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "holder_id" TEXT,
    "description" TEXT,
    "requirements" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_operating_procedures" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SOPStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_date" TIMESTAMP(3),
    "review_date" TIMESTAMP(3),
    "content" TEXT,
    "scope" TEXT,
    "responsibility" TEXT,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standard_operating_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_revisions" (
    "id" TEXT NOT NULL,
    "sop_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "change_notes" TEXT NOT NULL,
    "revised_by_id" TEXT NOT NULL,
    "revised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT,

    CONSTRAINT "sop_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_projects" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "category" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'PROPOSAL',
    "leader_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "budget" DECIMAL(15,2),
    "funding_source" TEXT,
    "methodology" TEXT,
    "findings" TEXT,
    "published_url" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "budget_id" TEXT,
    "business_unit_id" TEXT,
    "impact_score" DOUBLE PRECISION,
    "impact_notes" TEXT,

    CONSTRAINT "research_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practicum_lesson_plans" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "materials" TEXT NOT NULL,
    "objectives" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "status" "PracticumStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practicum_lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practicum_schedules" (
    "id" TEXT NOT NULL,
    "lesson_plan_id" TEXT NOT NULL,
    "target_class_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practicum_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practicum_evaluations" (
    "id" TEXT NOT NULL,
    "lesson_plan_id" TEXT NOT NULL,
    "evaluator_id" TEXT NOT NULL,
    "is_peer" BOOLEAN NOT NULL DEFAULT false,
    "method_score" DOUBLE PRECISION NOT NULL,
    "content_score" DOUBLE PRECISION NOT NULL,
    "language_score" DOUBLE PRECISION NOT NULL,
    "performance_score" DOUBLE PRECISION NOT NULL,
    "total_score" DOUBLE PRECISION NOT NULL,
    "feedback" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practicum_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_orgs" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_org_positions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_org_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_org_members" (
    "id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_org_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_org_logbooks" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "activity" TEXT NOT NULL,
    "result" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_org_logbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_themes" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_submissions" (
    "id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "feedback" TEXT,
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_references" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "book_title" TEXT NOT NULL,
    "author" TEXT,
    "volume" TEXT,
    "page" TEXT,
    "content_quote" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "innovation_proposals" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" "InnovationStatus" NOT NULL DEFAULT 'IDEA',
    "proposer_id" TEXT NOT NULL,
    "impact" TEXT,
    "resources" TEXT,
    "timeline" TEXT,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "innovation_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "duration" INTEGER,
    "instructor_id" TEXT,
    "teacher_id" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "max_participants" INTEGER,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "student_id" TEXT,
    "external_name" TEXT,
    "external_email" TEXT,
    "external_phone" TEXT,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "invoice_id" TEXT,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_certificates" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "certificate_no" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mustahik" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nik" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "category" "MustahikCategory" NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mustahik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zis_distributions" (
    "id" TEXT NOT NULL,
    "mustahik_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" "PublicDonationType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zis_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_service_orders" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "type" "SocialServiceType" NOT NULL,
    "requester_name" TEXT NOT NULL,
    "requester_phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "total_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_subsidized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_service_teams" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "social_service_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_service_materials" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "user_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "social_service_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "dean_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_programs" (
    "id" TEXT NOT NULL,
    "faculty_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "accreditation" TEXT,
    "head_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "higher_ed_courses" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 2,
    "semester" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "higher_ed_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "higher_ed_course_classes" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lecturer_id" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "higher_ed_course_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students_higher_ed" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "nim" TEXT NOT NULL,
    "current_semester" INTEGER NOT NULL DEFAULT 1,
    "gpa" DECIMAL(3,2),
    "total_credits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_higher_ed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "krs" (
    "id" TEXT NOT NULL,
    "student_he_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "krs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "krs_course_enrollments" (
    "id" TEXT NOT NULL,
    "krs_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "grade" DECIMAL(5,2),
    "letter_grade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "krs_course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_appointments" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "student_id" TEXT,
    "user_id" TEXT,
    "appointment_date" TIMESTAMP(3) NOT NULL,
    "complaint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "queue_number" INTEGER,
    "processed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "medical_record_id" TEXT,
    "patient_id" TEXT,
    "student_id" TEXT,
    "doctor_id" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescription_id" TEXT NOT NULL,
    "medication_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dosage" TEXT NOT NULL,
    "instructions" TEXT,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_criteria" (
    "id" TEXT NOT NULL,
    "scholarship_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "target_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarship_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_assessments" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholarship_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_agreements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "supervisor_id" TEXT,
    "supervisor_pk_id" TEXT,
    "strategic_plan_id" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "total_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "behavior_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "revision_notes" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pk_indicators" (
    "id" TEXT NOT NULL,
    "pk_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" "CascadingCategory" NOT NULL DEFAULT 'NON_CASCADING',
    "ref_indicator_id" TEXT,
    "ref_strategic_indicator_id" TEXT,
    "notes" TEXT,
    "realization" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pk_evaluations" (
    "id" TEXT NOT NULL,
    "pk_id" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "performance_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "behavior_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedback" TEXT,
    "notes" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pk_indicator_evaluations" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "indicator_id" TEXT NOT NULL,
    "realization" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activities" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_indicator_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavioral_values" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavioral_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pk_behavior_evaluations" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "behavior_value_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_behavior_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_unit_id_idx" ON "users"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "units_npsn_key" ON "units"("npsn");

-- CreateIndex
CREATE INDEX "units_type_idx" ON "units"("type");

-- CreateIndex
CREATE INDEX "units_foundation_id_idx" ON "units"("foundation_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_nip_key" ON "teachers"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_nuptk_key" ON "teachers"("nuptk");

-- CreateIndex
CREATE INDEX "teachers_unit_id_idx" ON "teachers"("unit_id");

-- CreateIndex
CREATE INDEX "teachers_province_id_idx" ON "teachers"("province_id");

-- CreateIndex
CREATE INDEX "teachers_regency_id_idx" ON "teachers"("regency_id");

-- CreateIndex
CREATE INDEX "teachers_employment_status_idx" ON "teachers"("employment_status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_nip_key" ON "staff"("nip");

-- CreateIndex
CREATE INDEX "staff_unit_id_idx" ON "staff"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_name_key" ON "academic_years"("name");

-- CreateIndex
CREATE INDEX "academic_years_is_active_idx" ON "academic_years"("is_active");

-- CreateIndex
CREATE INDEX "classes_level_idx" ON "classes"("level");

-- CreateIndex
CREATE UNIQUE INDEX "classes_unit_id_academic_year_id_name_key" ON "classes"("unit_id", "academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_nis_key" ON "students"("nis");

-- CreateIndex
CREATE INDEX "students_nis_idx" ON "students"("nis");

-- CreateIndex
CREATE INDEX "students_unit_id_idx" ON "students"("unit_id");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "students_province_id_idx" ON "students"("province_id");

-- CreateIndex
CREATE INDEX "students_regency_id_idx" ON "students"("regency_id");

-- CreateIndex
CREATE INDEX "student_parents_parent_id_idx" ON "student_parents"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_parents_student_id_parent_id_key" ON "student_parents"("student_id", "parent_id");

-- CreateIndex
CREATE INDEX "class_enrollments_status_idx" ON "class_enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "class_enrollments_student_id_class_id_key" ON "class_enrollments"("student_id", "class_id");

-- CreateIndex
CREATE INDEX "attendances_date_idx" ON "attendances"("date");

-- CreateIndex
CREATE INDEX "attendances_status_idx" ON "attendances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_student_id_class_id_date_key" ON "attendances"("student_id", "class_id", "date");

-- CreateIndex
CREATE INDEX "tahfidz_records_student_id_idx" ON "tahfidz_records"("student_id");

-- CreateIndex
CREATE INDEX "tahfidz_records_activity_type_idx" ON "tahfidz_records"("activity_type");

-- CreateIndex
CREATE INDEX "tahfidz_records_surah_number_idx" ON "tahfidz_records"("surah_number");

-- CreateIndex
CREATE INDEX "tahfidz_records_juz_idx" ON "tahfidz_records"("juz");

-- CreateIndex
CREATE UNIQUE INDEX "tahfidz_targets_student_id_academic_year_id_key" ON "tahfidz_targets"("student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "hafidz_students_student_id_key" ON "hafidz_students"("student_id");

-- CreateIndex
CREATE INDEX "hafidz_students_completed_at_idx" ON "hafidz_students"("completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "dormitories_code_key" ON "dormitories"("code");

-- CreateIndex
CREATE INDEX "dormitories_unit_id_idx" ON "dormitories"("unit_id");

-- CreateIndex
CREATE INDEX "dormitories_gender_idx" ON "dormitories"("gender");

-- CreateIndex
CREATE INDEX "rooms_is_active_idx" ON "rooms"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_dormitory_id_name_key" ON "rooms"("dormitory_id", "name");

-- CreateIndex
CREATE INDEX "room_assignments_student_id_idx" ON "room_assignments"("student_id");

-- CreateIndex
CREATE INDEX "room_assignments_room_id_idx" ON "room_assignments"("room_id");

-- CreateIndex
CREATE INDEX "room_assignments_is_active_idx" ON "room_assignments"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "permits_code_key" ON "permits"("code");

-- CreateIndex
CREATE INDEX "permits_student_id_idx" ON "permits"("student_id");

-- CreateIndex
CREATE INDEX "permits_status_idx" ON "permits"("status");

-- CreateIndex
CREATE INDEX "permits_start_date_end_date_idx" ON "permits"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "permits_code_idx" ON "permits"("code");

-- CreateIndex
CREATE INDEX "violations_student_id_idx" ON "violations"("student_id");

-- CreateIndex
CREATE INDEX "violations_type_idx" ON "violations"("type");

-- CreateIndex
CREATE INDEX "violations_occurred_at_idx" ON "violations"("occurred_at");

-- CreateIndex
CREATE INDEX "rewards_student_id_idx" ON "rewards"("student_id");

-- CreateIndex
CREATE INDEX "rewards_category_idx" ON "rewards"("category");

-- CreateIndex
CREATE INDEX "rewards_given_at_idx" ON "rewards"("given_at");

-- CreateIndex
CREATE INDEX "payment_types_is_active_idx" ON "payment_types"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payment_types_unit_id_code_key" ON "payment_types"("unit_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_student_id_idx" ON "invoices"("student_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE INDEX "payments_verification_status_idx" ON "payments"("verification_status");

-- CreateIndex
CREATE INDEX "board_members_foundation_id_idx" ON "board_members"("foundation_id");

-- CreateIndex
CREATE INDEX "board_members_is_active_idx" ON "board_members"("is_active");

-- CreateIndex
CREATE INDEX "foundation_documents_foundation_id_idx" ON "foundation_documents"("foundation_id");

-- CreateIndex
CREATE INDEX "foundation_documents_type_idx" ON "foundation_documents"("type");

-- CreateIndex
CREATE INDEX "admission_periods_unit_id_idx" ON "admission_periods"("unit_id");

-- CreateIndex
CREATE INDEX "admission_periods_academic_year_id_idx" ON "admission_periods"("academic_year_id");

-- CreateIndex
CREATE INDEX "admission_periods_is_active_idx" ON "admission_periods"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "registrants_registration_no_key" ON "registrants"("registration_no");

-- CreateIndex
CREATE UNIQUE INDEX "registrants_student_id_key" ON "registrants"("student_id");

-- CreateIndex
CREATE INDEX "registrants_admission_period_id_idx" ON "registrants"("admission_period_id");

-- CreateIndex
CREATE INDEX "registrants_campaign_id_idx" ON "registrants"("campaign_id");

-- CreateIndex
CREATE INDEX "registrants_source_idx" ON "registrants"("source");

-- CreateIndex
CREATE INDEX "registrants_wave_id_idx" ON "registrants"("wave_id");

-- CreateIndex
CREATE INDEX "registrants_status_idx" ON "registrants"("status");

-- CreateIndex
CREATE INDEX "registrants_registration_no_idx" ON "registrants"("registration_no");

-- CreateIndex
CREATE INDEX "registrant_documents_registrant_id_idx" ON "registrant_documents"("registrant_id");

-- CreateIndex
CREATE INDEX "registrant_documents_type_idx" ON "registrant_documents"("type");

-- CreateIndex
CREATE INDEX "staff_attendance_staff_id_idx" ON "staff_attendance"("staff_id");

-- CreateIndex
CREATE INDEX "staff_attendance_teacher_id_idx" ON "staff_attendance"("teacher_id");

-- CreateIndex
CREATE INDEX "staff_attendance_date_idx" ON "staff_attendance"("date");

-- CreateIndex
CREATE INDEX "staff_attendance_status_idx" ON "staff_attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_staff_id_teacher_id_date_key" ON "staff_attendance"("staff_id", "teacher_id", "date");

-- CreateIndex
CREATE INDEX "leaves_staff_id_idx" ON "leaves"("staff_id");

-- CreateIndex
CREATE INDEX "leaves_teacher_id_idx" ON "leaves"("teacher_id");

-- CreateIndex
CREATE INDEX "leaves_status_idx" ON "leaves"("status");

-- CreateIndex
CREATE INDEX "leaves_start_date_end_date_idx" ON "leaves"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "leave_balances_unit_id_idx" ON "leave_balances"("unit_id");

-- CreateIndex
CREATE INDEX "leave_balances_user_id_idx" ON "leave_balances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_user_id_academic_year_id_leave_type_key" ON "leave_balances"("user_id", "academic_year_id", "leave_type");

-- CreateIndex
CREATE INDEX "departments_unit_id_idx" ON "departments"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_unit_id_code_key" ON "departments"("unit_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employment_contracts_contract_number_key" ON "employment_contracts"("contract_number");

-- CreateIndex
CREATE INDEX "employment_contracts_user_id_idx" ON "employment_contracts"("user_id");

-- CreateIndex
CREATE INDEX "employment_contracts_status_idx" ON "employment_contracts"("status");

-- CreateIndex
CREATE INDEX "employment_contracts_end_date_idx" ON "employment_contracts"("end_date");

-- CreateIndex
CREATE INDEX "employee_documents_user_id_idx" ON "employee_documents"("user_id");

-- CreateIndex
CREATE INDEX "employee_documents_type_idx" ON "employee_documents"("type");

-- CreateIndex
CREATE INDEX "employment_history_user_id_idx" ON "employment_history"("user_id");

-- CreateIndex
CREATE INDEX "employment_history_effective_date_idx" ON "employment_history"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_realm_idx" ON "roles"("realm");

-- CreateIndex
CREATE INDEX "roles_is_active_idx" ON "roles"("is_active");

-- CreateIndex
CREATE INDEX "user_role_assignments_user_id_idx" ON "user_role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_role_id_idx" ON "user_role_assignments"("role_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_unit_id_idx" ON "user_role_assignments"("unit_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_is_primary_idx" ON "user_role_assignments"("is_primary");

-- CreateIndex
CREATE INDEX "user_role_assignments_is_active_idx" ON "user_role_assignments"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_user_id_role_id_unit_id_key" ON "user_role_assignments"("user_id", "role_id", "unit_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "book_categories_unit_id_idx" ON "book_categories"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_categories_unit_id_code_key" ON "book_categories"("unit_id", "code");

-- CreateIndex
CREATE INDEX "books_unit_id_idx" ON "books"("unit_id");

-- CreateIndex
CREATE INDEX "books_category_id_idx" ON "books"("category_id");

-- CreateIndex
CREATE INDEX "books_isbn_idx" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_title_idx" ON "books"("title");

-- CreateIndex
CREATE INDEX "books_author_idx" ON "books"("author");

-- CreateIndex
CREATE INDEX "borrowings_book_id_idx" ON "borrowings"("book_id");

-- CreateIndex
CREATE INDEX "borrowings_borrower_id_idx" ON "borrowings"("borrower_id");

-- CreateIndex
CREATE INDEX "borrowings_student_id_idx" ON "borrowings"("student_id");

-- CreateIndex
CREATE INDEX "borrowings_status_idx" ON "borrowings"("status");

-- CreateIndex
CREATE INDEX "borrowings_due_date_idx" ON "borrowings"("due_date");

-- CreateIndex
CREATE INDEX "medical_records_student_id_idx" ON "medical_records"("student_id");

-- CreateIndex
CREATE INDEX "medical_records_patient_id_idx" ON "medical_records"("patient_id");

-- CreateIndex
CREATE INDEX "medical_records_visit_date_idx" ON "medical_records"("visit_date");

-- CreateIndex
CREATE INDEX "medical_records_type_idx" ON "medical_records"("type");

-- CreateIndex
CREATE INDEX "medical_records_status_idx" ON "medical_records"("status");

-- CreateIndex
CREATE INDEX "medications_unit_id_idx" ON "medications"("unit_id");

-- CreateIndex
CREATE INDEX "medications_name_idx" ON "medications"("name");

-- CreateIndex
CREATE INDEX "medications_expiry_date_idx" ON "medications"("expiry_date");

-- CreateIndex
CREATE INDEX "medication_usage_logs_medication_id_idx" ON "medication_usage_logs"("medication_id");

-- CreateIndex
CREATE INDEX "medication_usage_logs_student_id_idx" ON "medication_usage_logs"("student_id");

-- CreateIndex
CREATE INDEX "medication_usage_logs_given_at_idx" ON "medication_usage_logs"("given_at");

-- CreateIndex
CREATE INDEX "announcements_unit_id_idx" ON "announcements"("unit_id");

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");

-- CreateIndex
CREATE INDEX "announcements_type_idx" ON "announcements"("type");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notifications_scheduled_at_idx" ON "notifications"("scheduled_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_recipient_id_idx" ON "messages"("recipient_id");

-- CreateIndex
CREATE INDEX "messages_parent_id_idx" ON "messages"("parent_id");

-- CreateIndex
CREATE INDEX "messages_category_idx" ON "messages"("category");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_code_key" ON "asset_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_code_key" ON "assets"("code");

-- CreateIndex
CREATE INDEX "assets_unit_id_idx" ON "assets"("unit_id");

-- CreateIndex
CREATE INDEX "assets_category_id_idx" ON "assets"("category_id");

-- CreateIndex
CREATE INDEX "assets_room_id_idx" ON "assets"("room_id");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_condition_idx" ON "assets"("condition");

-- CreateIndex
CREATE INDEX "asset_assignments_asset_id_idx" ON "asset_assignments"("asset_id");

-- CreateIndex
CREATE INDEX "asset_assignments_user_id_idx" ON "asset_assignments"("user_id");

-- CreateIndex
CREATE INDEX "asset_assignments_status_idx" ON "asset_assignments"("status");

-- CreateIndex
CREATE INDEX "asset_audits_unit_id_idx" ON "asset_audits"("unit_id");

-- CreateIndex
CREATE INDEX "asset_audits_date_idx" ON "asset_audits"("date");

-- CreateIndex
CREATE INDEX "asset_audit_items_audit_id_idx" ON "asset_audit_items"("audit_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_audit_items_audit_id_asset_id_key" ON "asset_audit_items"("audit_id", "asset_id");

-- CreateIndex
CREATE INDEX "asset_maintenance_asset_id_idx" ON "asset_maintenance"("asset_id");

-- CreateIndex
CREATE INDEX "asset_maintenance_maintenance_date_idx" ON "asset_maintenance"("maintenance_date");

-- CreateIndex
CREATE INDEX "asset_maintenance_status_idx" ON "asset_maintenance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposals_asset_id_key" ON "asset_disposals"("asset_id");

-- CreateIndex
CREATE INDEX "asset_disposals_date_idx" ON "asset_disposals"("date");

-- CreateIndex
CREATE INDEX "asset_disposals_reason_idx" ON "asset_disposals"("reason");

-- CreateIndex
CREATE INDEX "subjects_unit_id_idx" ON "subjects"("unit_id");

-- CreateIndex
CREATE INDEX "subjects_type_idx" ON "subjects"("type");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_unit_id_code_key" ON "subjects"("unit_id", "code");

-- CreateIndex
CREATE INDEX "teacher_subjects_teacher_id_idx" ON "teacher_subjects"("teacher_id");

-- CreateIndex
CREATE INDEX "teacher_subjects_subject_id_idx" ON "teacher_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subjects_teacher_id_subject_id_class_id_key" ON "teacher_subjects"("teacher_id", "subject_id", "class_id");

-- CreateIndex
CREATE INDEX "lesson_plans_subject_id_idx" ON "lesson_plans"("subject_id");

-- CreateIndex
CREATE INDEX "lesson_plans_teacher_id_idx" ON "lesson_plans"("teacher_id");

-- CreateIndex
CREATE INDEX "lesson_plans_class_id_idx" ON "lesson_plans"("class_id");

-- CreateIndex
CREATE INDEX "lesson_plans_planned_date_idx" ON "lesson_plans"("planned_date");

-- CreateIndex
CREATE INDEX "schedules_unit_id_idx" ON "schedules"("unit_id");

-- CreateIndex
CREATE INDEX "schedules_class_id_idx" ON "schedules"("class_id");

-- CreateIndex
CREATE INDEX "schedules_teacher_id_idx" ON "schedules"("teacher_id");

-- CreateIndex
CREATE INDEX "schedules_day_of_week_idx" ON "schedules"("day_of_week");

-- CreateIndex
CREATE INDEX "exams_unit_id_idx" ON "exams"("unit_id");

-- CreateIndex
CREATE INDEX "exams_subject_id_idx" ON "exams"("subject_id");

-- CreateIndex
CREATE INDEX "exams_class_id_idx" ON "exams"("class_id");

-- CreateIndex
CREATE INDEX "exams_scheduled_at_idx" ON "exams"("scheduled_at");

-- CreateIndex
CREATE INDEX "exams_status_idx" ON "exams"("status");

-- CreateIndex
CREATE INDEX "grades_student_id_idx" ON "grades"("student_id");

-- CreateIndex
CREATE INDEX "grades_subject_id_idx" ON "grades"("subject_id");

-- CreateIndex
CREATE INDEX "grades_exam_id_idx" ON "grades"("exam_id");

-- CreateIndex
CREATE INDEX "grades_academic_year_id_idx" ON "grades"("academic_year_id");

-- CreateIndex
CREATE INDEX "grades_type_idx" ON "grades"("type");

-- CreateIndex
CREATE INDEX "report_cards_student_id_idx" ON "report_cards"("student_id");

-- CreateIndex
CREATE INDEX "report_cards_class_id_idx" ON "report_cards"("class_id");

-- CreateIndex
CREATE INDEX "report_cards_academic_year_id_idx" ON "report_cards"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_student_id_class_id_academic_year_id_semester_key" ON "report_cards"("student_id", "class_id", "academic_year_id", "semester");

-- CreateIndex
CREATE INDEX "report_card_details_report_card_id_idx" ON "report_card_details"("report_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_student_id_key" ON "alumni"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_registration_no_key" ON "alumni"("registration_no");

-- CreateIndex
CREATE INDEX "alumni_unit_id_idx" ON "alumni"("unit_id");

-- CreateIndex
CREATE INDEX "alumni_graduation_year_idx" ON "alumni"("graduation_year");

-- CreateIndex
CREATE INDEX "alumni_status_idx" ON "alumni"("status");

-- CreateIndex
CREATE INDEX "alumni_careers_alumni_id_idx" ON "alumni_careers"("alumni_id");

-- CreateIndex
CREATE INDEX "alumni_educations_alumni_id_idx" ON "alumni_educations"("alumni_id");

-- CreateIndex
CREATE INDEX "alumni_donations_alumni_id_idx" ON "alumni_donations"("alumni_id");

-- CreateIndex
CREATE INDEX "alumni_donations_unit_id_idx" ON "alumni_donations"("unit_id");

-- CreateIndex
CREATE INDEX "alumni_donations_type_idx" ON "alumni_donations"("type");

-- CreateIndex
CREATE INDEX "alumni_donations_donated_at_idx" ON "alumni_donations"("donated_at");

-- CreateIndex
CREATE INDEX "alumni_events_unit_id_idx" ON "alumni_events"("unit_id");

-- CreateIndex
CREATE INDEX "alumni_events_event_date_idx" ON "alumni_events"("event_date");

-- CreateIndex
CREATE INDEX "alumni_events_type_idx" ON "alumni_events"("type");

-- CreateIndex
CREATE INDEX "alumni_events_status_idx" ON "alumni_events"("status");

-- CreateIndex
CREATE INDEX "alumni_event_attendees_event_id_idx" ON "alumni_event_attendees"("event_id");

-- CreateIndex
CREATE INDEX "alumni_event_attendees_alumni_id_idx" ON "alumni_event_attendees"("alumni_id");

-- CreateIndex
CREATE INDEX "alumni_event_attendees_status_idx" ON "alumni_event_attendees"("status");

-- CreateIndex
CREATE UNIQUE INDEX "alumni_event_attendees_event_id_alumni_id_key" ON "alumni_event_attendees"("event_id", "alumni_id");

-- CreateIndex
CREATE UNIQUE INDEX "halaqoh_code_key" ON "halaqoh"("code");

-- CreateIndex
CREATE INDEX "halaqoh_unit_id_idx" ON "halaqoh"("unit_id");

-- CreateIndex
CREATE INDEX "halaqoh_teacher_id_idx" ON "halaqoh"("teacher_id");

-- CreateIndex
CREATE INDEX "halaqoh_is_active_idx" ON "halaqoh"("is_active");

-- CreateIndex
CREATE INDEX "takhosus_enrollments_halaqoh_id_idx" ON "takhosus_enrollments"("halaqoh_id");

-- CreateIndex
CREATE INDEX "takhosus_enrollments_status_idx" ON "takhosus_enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "takhosus_enrollments_student_id_key" ON "takhosus_enrollments"("student_id");

-- CreateIndex
CREATE INDEX "sanad_records_teacher_id_idx" ON "sanad_records"("teacher_id");

-- CreateIndex
CREATE INDEX "sanad_records_juz_idx" ON "sanad_records"("juz");

-- CreateIndex
CREATE UNIQUE INDEX "sanad_records_enrollment_id_juz_key" ON "sanad_records"("enrollment_id", "juz");

-- CreateIndex
CREATE INDEX "daily_muhasabah_date_idx" ON "daily_muhasabah"("date");

-- CreateIndex
CREATE INDEX "daily_muhasabah_mood_idx" ON "daily_muhasabah"("mood");

-- CreateIndex
CREATE UNIQUE INDEX "daily_muhasabah_student_id_date_key" ON "daily_muhasabah"("student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "donation_campaigns_slug_key" ON "donation_campaigns"("slug");

-- CreateIndex
CREATE INDEX "donation_campaigns_unit_id_idx" ON "donation_campaigns"("unit_id");

-- CreateIndex
CREATE INDEX "donation_campaigns_status_idx" ON "donation_campaigns"("status");

-- CreateIndex
CREATE INDEX "donation_campaigns_start_date_idx" ON "donation_campaigns"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "donations_receipt_number_key" ON "donations"("receipt_number");

-- CreateIndex
CREATE INDEX "donations_campaign_id_idx" ON "donations"("campaign_id");

-- CreateIndex
CREATE INDEX "donations_unit_id_idx" ON "donations"("unit_id");

-- CreateIndex
CREATE INDEX "donations_type_idx" ON "donations"("type");

-- CreateIndex
CREATE INDEX "donations_status_idx" ON "donations"("status");

-- CreateIndex
CREATE INDEX "donations_donated_at_idx" ON "donations"("donated_at");

-- CreateIndex
CREATE INDEX "admission_waves_status_idx" ON "admission_waves"("status");

-- CreateIndex
CREATE INDEX "admission_waves_start_date_idx" ON "admission_waves"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "admission_waves_period_id_wave_number_key" ON "admission_waves"("period_id", "wave_number");

-- CreateIndex
CREATE INDEX "extracurriculars_unit_id_idx" ON "extracurriculars"("unit_id");

-- CreateIndex
CREATE INDEX "extracurriculars_category_idx" ON "extracurriculars"("category");

-- CreateIndex
CREATE INDEX "extracurriculars_status_idx" ON "extracurriculars"("status");

-- CreateIndex
CREATE UNIQUE INDEX "extracurriculars_unit_id_code_key" ON "extracurriculars"("unit_id", "code");

-- CreateIndex
CREATE INDEX "extracurricular_enrollments_extracurricular_id_idx" ON "extracurricular_enrollments"("extracurricular_id");

-- CreateIndex
CREATE INDEX "extracurricular_enrollments_student_id_idx" ON "extracurricular_enrollments"("student_id");

-- CreateIndex
CREATE INDEX "extracurricular_enrollments_status_idx" ON "extracurricular_enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "extracurricular_enrollments_extracurricular_id_student_id_key" ON "extracurricular_enrollments"("extracurricular_id", "student_id");

-- CreateIndex
CREATE INDEX "extracurricular_attendances_extracurricular_id_idx" ON "extracurricular_attendances"("extracurricular_id");

-- CreateIndex
CREATE INDEX "extracurricular_attendances_student_id_idx" ON "extracurricular_attendances"("student_id");

-- CreateIndex
CREATE INDEX "extracurricular_attendances_date_idx" ON "extracurricular_attendances"("date");

-- CreateIndex
CREATE UNIQUE INDEX "extracurricular_attendances_extracurricular_id_student_id_d_key" ON "extracurricular_attendances"("extracurricular_id", "student_id", "date");

-- CreateIndex
CREATE INDEX "extracurricular_achievements_extracurricular_id_idx" ON "extracurricular_achievements"("extracurricular_id");

-- CreateIndex
CREATE INDEX "extracurricular_achievements_student_id_idx" ON "extracurricular_achievements"("student_id");

-- CreateIndex
CREATE INDEX "extracurricular_achievements_event_date_idx" ON "extracurricular_achievements"("event_date");

-- CreateIndex
CREATE INDEX "counseling_sessions_unit_id_idx" ON "counseling_sessions"("unit_id");

-- CreateIndex
CREATE INDEX "counseling_sessions_student_id_idx" ON "counseling_sessions"("student_id");

-- CreateIndex
CREATE INDEX "counseling_sessions_counselor_id_idx" ON "counseling_sessions"("counselor_id");

-- CreateIndex
CREATE INDEX "counseling_sessions_category_idx" ON "counseling_sessions"("category");

-- CreateIndex
CREATE INDEX "counseling_sessions_status_idx" ON "counseling_sessions"("status");

-- CreateIndex
CREATE INDEX "counseling_sessions_scheduled_at_idx" ON "counseling_sessions"("scheduled_at");

-- CreateIndex
CREATE INDEX "counseling_notes_session_id_idx" ON "counseling_notes"("session_id");

-- CreateIndex
CREATE INDEX "counseling_referrals_session_id_idx" ON "counseling_referrals"("session_id");

-- CreateIndex
CREATE INDEX "counseling_referrals_type_idx" ON "counseling_referrals"("type");

-- CreateIndex
CREATE INDEX "duty_types_unit_id_idx" ON "duty_types"("unit_id");

-- CreateIndex
CREATE INDEX "duty_types_category_idx" ON "duty_types"("category");

-- CreateIndex
CREATE UNIQUE INDEX "duty_types_unit_id_code_key" ON "duty_types"("unit_id", "code");

-- CreateIndex
CREATE INDEX "duty_rosters_duty_type_id_idx" ON "duty_rosters"("duty_type_id");

-- CreateIndex
CREATE INDEX "duty_rosters_student_id_idx" ON "duty_rosters"("student_id");

-- CreateIndex
CREATE INDEX "duty_rosters_date_idx" ON "duty_rosters"("date");

-- CreateIndex
CREATE INDEX "duty_rosters_status_idx" ON "duty_rosters"("status");

-- CreateIndex
CREATE UNIQUE INDEX "duty_rosters_duty_type_id_student_id_date_key" ON "duty_rosters"("duty_type_id", "student_id", "date");

-- CreateIndex
CREATE INDEX "meal_menus_unit_id_idx" ON "meal_menus"("unit_id");

-- CreateIndex
CREATE INDEX "meal_menus_date_idx" ON "meal_menus"("date");

-- CreateIndex
CREATE INDEX "meal_menus_meal_type_idx" ON "meal_menus"("meal_type");

-- CreateIndex
CREATE UNIQUE INDEX "meal_menus_unit_id_date_meal_type_key" ON "meal_menus"("unit_id", "date", "meal_type");

-- CreateIndex
CREATE INDEX "meal_attendances_menu_id_idx" ON "meal_attendances"("menu_id");

-- CreateIndex
CREATE INDEX "meal_attendances_student_id_idx" ON "meal_attendances"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_attendances_menu_id_student_id_key" ON "meal_attendances"("menu_id", "student_id");

-- CreateIndex
CREATE INDEX "special_diets_student_id_idx" ON "special_diets"("student_id");

-- CreateIndex
CREATE INDEX "special_diets_is_active_idx" ON "special_diets"("is_active");

-- CreateIndex
CREATE INDEX "calendar_events_unit_id_idx" ON "calendar_events"("unit_id");

-- CreateIndex
CREATE INDEX "calendar_events_class_id_idx" ON "calendar_events"("class_id");

-- CreateIndex
CREATE INDEX "calendar_events_event_type_idx" ON "calendar_events"("event_type");

-- CreateIndex
CREATE INDEX "calendar_events_start_date_idx" ON "calendar_events"("start_date");

-- CreateIndex
CREATE INDEX "kitab_kuning_category_idx" ON "kitab_kuning"("category");

-- CreateIndex
CREATE INDEX "kitab_kuning_level_idx" ON "kitab_kuning"("level");

-- CreateIndex
CREATE INDEX "kitab_progress_kitab_id_idx" ON "kitab_progress"("kitab_id");

-- CreateIndex
CREATE INDEX "kitab_progress_student_id_idx" ON "kitab_progress"("student_id");

-- CreateIndex
CREATE INDEX "kitab_progress_teacher_id_idx" ON "kitab_progress"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "kitab_progress_kitab_id_student_id_academic_year_id_key" ON "kitab_progress"("kitab_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "muhadhoroh_unit_id_idx" ON "muhadhoroh"("unit_id");

-- CreateIndex
CREATE INDEX "muhadhoroh_student_id_idx" ON "muhadhoroh"("student_id");

-- CreateIndex
CREATE INDEX "muhadhoroh_scheduled_at_idx" ON "muhadhoroh"("scheduled_at");

-- CreateIndex
CREATE INDEX "muhadatsah_unit_id_idx" ON "muhadatsah"("unit_id");

-- CreateIndex
CREATE INDEX "muhadatsah_student_id_idx" ON "muhadatsah"("student_id");

-- CreateIndex
CREATE INDEX "muhadatsah_scheduled_at_idx" ON "muhadatsah"("scheduled_at");

-- CreateIndex
CREATE INDEX "muhadatsah_language_idx" ON "muhadatsah"("language");

-- CreateIndex
CREATE INDEX "student_documents_student_id_idx" ON "student_documents"("student_id");

-- CreateIndex
CREATE INDEX "student_documents_document_type_idx" ON "student_documents"("document_type");

-- CreateIndex
CREATE INDEX "student_documents_status_idx" ON "student_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "digital_certificates_certificate_number_key" ON "digital_certificates"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "digital_certificates_qr_code_key" ON "digital_certificates"("qr_code");

-- CreateIndex
CREATE INDEX "digital_certificates_student_id_idx" ON "digital_certificates"("student_id");

-- CreateIndex
CREATE INDEX "digital_certificates_certificate_type_idx" ON "digital_certificates"("certificate_type");

-- CreateIndex
CREATE INDEX "digital_certificates_issue_date_idx" ON "digital_certificates"("issue_date");

-- CreateIndex
CREATE INDEX "student_notes_student_id_idx" ON "student_notes"("student_id");

-- CreateIndex
CREATE INDEX "student_notes_class_id_idx" ON "student_notes"("class_id");

-- CreateIndex
CREATE INDEX "student_notes_category_idx" ON "student_notes"("category");

-- CreateIndex
CREATE INDEX "student_notes_priority_idx" ON "student_notes"("priority");

-- CreateIndex
CREATE INDEX "student_notes_created_by_id_idx" ON "student_notes"("created_by_id");

-- CreateIndex
CREATE INDEX "behavior_records_student_id_idx" ON "behavior_records"("student_id");

-- CreateIndex
CREATE INDEX "behavior_records_class_id_idx" ON "behavior_records"("class_id");

-- CreateIndex
CREATE INDEX "behavior_records_date_idx" ON "behavior_records"("date");

-- CreateIndex
CREATE INDEX "behavior_records_behavior_type_idx" ON "behavior_records"("behavior_type");

-- CreateIndex
CREATE INDEX "kitab_unit_id_idx" ON "kitab"("unit_id");

-- CreateIndex
CREATE INDEX "kitab_category_idx" ON "kitab"("category");

-- CreateIndex
CREATE INDEX "kitab_level_idx" ON "kitab"("level");

-- CreateIndex
CREATE INDEX "kitab_assignments_kitab_id_idx" ON "kitab_assignments"("kitab_id");

-- CreateIndex
CREATE INDEX "kitab_assignments_class_id_idx" ON "kitab_assignments"("class_id");

-- CreateIndex
CREATE INDEX "kitab_assignments_teacher_id_idx" ON "kitab_assignments"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "kitab_assignments_kitab_id_class_id_academic_year_id_semest_key" ON "kitab_assignments"("kitab_id", "class_id", "academic_year_id", "semester");

-- CreateIndex
CREATE INDEX "kitab_student_progress_student_id_idx" ON "kitab_student_progress"("student_id");

-- CreateIndex
CREATE INDEX "kitab_student_progress_kitab_assignment_id_idx" ON "kitab_student_progress"("kitab_assignment_id");

-- CreateIndex
CREATE INDEX "kitab_student_progress_status_idx" ON "kitab_student_progress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "kitab_student_progress_student_id_kitab_assignment_id_key" ON "kitab_student_progress"("student_id", "kitab_assignment_id");

-- CreateIndex
CREATE INDEX "kitab_progress_records_student_id_idx" ON "kitab_progress_records"("student_id");

-- CreateIndex
CREATE INDEX "kitab_progress_records_kitab_assignment_id_idx" ON "kitab_progress_records"("kitab_assignment_id");

-- CreateIndex
CREATE INDEX "kitab_progress_records_date_idx" ON "kitab_progress_records"("date");

-- CreateIndex
CREATE INDEX "kitab_progress_records_assessment_type_idx" ON "kitab_progress_records"("assessment_type");

-- CreateIndex
CREATE UNIQUE INDEX "provinces_code_key" ON "provinces"("code");

-- CreateIndex
CREATE INDEX "provinces_code_idx" ON "provinces"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regencies_code_key" ON "regencies"("code");

-- CreateIndex
CREATE INDEX "regencies_province_id_idx" ON "regencies"("province_id");

-- CreateIndex
CREATE INDEX "regencies_code_idx" ON "regencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE INDEX "districts_regency_id_idx" ON "districts"("regency_id");

-- CreateIndex
CREATE INDEX "districts_code_idx" ON "districts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "villages_code_key" ON "villages"("code");

-- CreateIndex
CREATE INDEX "villages_district_id_idx" ON "villages"("district_id");

-- CreateIndex
CREATE INDEX "villages_code_idx" ON "villages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "learning_phases_code_key" ON "learning_phases"("code");

-- CreateIndex
CREATE INDEX "learning_outcomes_phase_id_idx" ON "learning_outcomes"("phase_id");

-- CreateIndex
CREATE INDEX "learning_outcomes_subject_id_idx" ON "learning_outcomes"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_outcomes_phase_id_subject_id_code_key" ON "learning_outcomes"("phase_id", "subject_id", "code");

-- CreateIndex
CREATE INDEX "learning_objectives_learning_outcome_id_idx" ON "learning_objectives"("learning_outcome_id");

-- CreateIndex
CREATE INDEX "teaching_modules_learning_objective_id_idx" ON "teaching_modules"("learning_objective_id");

-- CreateIndex
CREATE INDEX "teaching_modules_teacher_id_idx" ON "teaching_modules"("teacher_id");

-- CreateIndex
CREATE INDEX "teaching_modules_class_id_idx" ON "teaching_modules"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "p5_themes_code_key" ON "p5_themes"("code");

-- CreateIndex
CREATE INDEX "p5_projects_unit_id_idx" ON "p5_projects"("unit_id");

-- CreateIndex
CREATE INDEX "p5_projects_academic_year_id_idx" ON "p5_projects"("academic_year_id");

-- CreateIndex
CREATE INDEX "p5_projects_theme_id_idx" ON "p5_projects"("theme_id");

-- CreateIndex
CREATE INDEX "p5_assessments_project_id_idx" ON "p5_assessments"("project_id");

-- CreateIndex
CREATE INDEX "p5_assessments_student_id_idx" ON "p5_assessments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "p5_assessments_project_id_student_id_key" ON "p5_assessments"("project_id", "student_id");

-- CreateIndex
CREATE INDEX "merdeka_assessments_unit_id_idx" ON "merdeka_assessments"("unit_id");

-- CreateIndex
CREATE INDEX "merdeka_assessments_class_id_idx" ON "merdeka_assessments"("class_id");

-- CreateIndex
CREATE INDEX "merdeka_assessments_subject_id_idx" ON "merdeka_assessments"("subject_id");

-- CreateIndex
CREATE INDEX "merdeka_assessments_category_idx" ON "merdeka_assessments"("category");

-- CreateIndex
CREATE INDEX "merdeka_assessment_results_assessment_id_idx" ON "merdeka_assessment_results"("assessment_id");

-- CreateIndex
CREATE INDEX "merdeka_assessment_results_student_id_idx" ON "merdeka_assessment_results"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "merdeka_assessment_results_assessment_id_student_id_key" ON "merdeka_assessment_results"("assessment_id", "student_id");

-- CreateIndex
CREATE INDEX "payment_components_unit_id_idx" ON "payment_components"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_components_unit_id_code_key" ON "payment_components"("unit_id", "code");

-- CreateIndex
CREATE INDEX "scholarships_unit_id_idx" ON "scholarships"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "scholarship_discounts_scholarship_id_component_id_key" ON "scholarship_discounts"("scholarship_id", "component_id");

-- CreateIndex
CREATE INDEX "scholarship_recipients_scholarship_id_idx" ON "scholarship_recipients"("scholarship_id");

-- CreateIndex
CREATE INDEX "scholarship_recipients_student_id_idx" ON "scholarship_recipients"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "scholarship_recipients_scholarship_id_student_id_academic_y_key" ON "scholarship_recipients"("scholarship_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_codes_code_key" ON "account_codes"("code");

-- CreateIndex
CREATE INDEX "account_codes_type_idx" ON "account_codes"("type");

-- CreateIndex
CREATE INDEX "account_codes_unit_id_idx" ON "account_codes"("unit_id");

-- CreateIndex
CREATE INDEX "budgets_unit_id_idx" ON "budgets"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_unit_id_academic_year_id_account_id_key" ON "budgets"("unit_id", "academic_year_id", "account_id");

-- CreateIndex
CREATE INDEX "financial_periods_unit_id_idx" ON "financial_periods"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_unit_id_start_date_end_date_key" ON "financial_periods"("unit_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "report_notes_unit_id_period_id_report_type_section_key_key" ON "report_notes"("unit_id", "period_id", "report_type", "section_key");

-- CreateIndex
CREATE UNIQUE INDEX "report_templates_unit_id_type_key" ON "report_templates"("unit_id", "type");

-- CreateIndex
CREATE INDEX "journal_entries_unit_id_idx" ON "journal_entries"("unit_id");

-- CreateIndex
CREATE INDEX "journal_entries_account_id_idx" ON "journal_entries"("account_id");

-- CreateIndex
CREATE INDEX "journal_entries_date_idx" ON "journal_entries"("date");

-- CreateIndex
CREATE INDEX "lands_unit_id_idx" ON "lands"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "lands_unit_id_code_key" ON "lands"("unit_id", "code");

-- CreateIndex
CREATE INDEX "buildings_unit_id_idx" ON "buildings"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_unit_id_code_key" ON "buildings"("unit_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_code_key" ON "room_types"("code");

-- CreateIndex
CREATE INDEX "facility_rooms_unit_id_idx" ON "facility_rooms"("unit_id");

-- CreateIndex
CREATE INDEX "facility_rooms_room_type_id_idx" ON "facility_rooms"("room_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "facility_rooms_unit_id_code_key" ON "facility_rooms"("unit_id", "code");

-- CreateIndex
CREATE INDEX "daily_schedule_templates_unit_id_idx" ON "daily_schedule_templates"("unit_id");

-- CreateIndex
CREATE INDEX "daily_activities_template_id_idx" ON "daily_activities"("template_id");

-- CreateIndex
CREATE INDEX "musyrifs_unit_id_idx" ON "musyrifs"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "musyrifs_unit_id_user_id_key" ON "musyrifs"("unit_id", "user_id");

-- CreateIndex
CREATE INDEX "musyrif_assignments_musyrif_id_idx" ON "musyrif_assignments"("musyrif_id");

-- CreateIndex
CREATE INDEX "musyrif_assignments_dormitory_id_idx" ON "musyrif_assignments"("dormitory_id");

-- CreateIndex
CREATE UNIQUE INDEX "santri_wallets_student_id_key" ON "santri_wallets"("student_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");

-- CreateIndex
CREATE INDEX "wallet_transactions_created_at_idx" ON "wallet_transactions"("created_at");

-- CreateIndex
CREATE INDEX "business_units_unit_id_idx" ON "business_units"("unit_id");

-- CreateIndex
CREATE INDEX "business_units_manager_id_idx" ON "business_units"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_units_unit_id_code_key" ON "business_units"("unit_id", "code");

-- CreateIndex
CREATE INDEX "canteen_categories_business_unit_id_idx" ON "canteen_categories"("business_unit_id");

-- CreateIndex
CREATE INDEX "canteen_categories_unit_id_idx" ON "canteen_categories"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_categories_unit_id_business_unit_id_name_key" ON "canteen_categories"("unit_id", "business_unit_id", "name");

-- CreateIndex
CREATE INDEX "canteen_items_unit_id_idx" ON "canteen_items"("unit_id");

-- CreateIndex
CREATE INDEX "canteen_items_business_unit_id_idx" ON "canteen_items"("business_unit_id");

-- CreateIndex
CREATE INDEX "canteen_items_category_id_idx" ON "canteen_items"("category_id");

-- CreateIndex
CREATE INDEX "canteen_items_is_available_idx" ON "canteen_items"("is_available");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_items_unit_id_business_unit_id_code_key" ON "canteen_items"("unit_id", "business_unit_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "canteen_transactions_transaction_no_key" ON "canteen_transactions"("transaction_no");

-- CreateIndex
CREATE INDEX "canteen_transactions_unit_id_idx" ON "canteen_transactions"("unit_id");

-- CreateIndex
CREATE INDEX "canteen_transactions_business_unit_id_idx" ON "canteen_transactions"("business_unit_id");

-- CreateIndex
CREATE INDEX "canteen_transactions_student_id_idx" ON "canteen_transactions"("student_id");

-- CreateIndex
CREATE INDEX "canteen_transactions_transaction_no_idx" ON "canteen_transactions"("transaction_no");

-- CreateIndex
CREATE INDEX "canteen_transactions_created_at_idx" ON "canteen_transactions"("created_at");

-- CreateIndex
CREATE INDEX "canteen_transactions_status_idx" ON "canteen_transactions"("status");

-- CreateIndex
CREATE INDEX "canteen_transaction_items_transaction_id_idx" ON "canteen_transaction_items"("transaction_id");

-- CreateIndex
CREATE INDEX "canteen_transaction_items_item_id_idx" ON "canteen_transaction_items"("item_id");

-- CreateIndex
CREATE INDEX "canteen_stock_movements_item_id_idx" ON "canteen_stock_movements"("item_id");

-- CreateIndex
CREATE INDEX "canteen_stock_movements_type_idx" ON "canteen_stock_movements"("type");

-- CreateIndex
CREATE INDEX "canteen_stock_movements_created_at_idx" ON "canteen_stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "laundry_pricings_business_unit_id_idx" ON "laundry_pricings"("business_unit_id");

-- CreateIndex
CREATE INDEX "laundry_pricings_unit_id_idx" ON "laundry_pricings"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "laundry_pricings_unit_id_business_unit_id_name_key" ON "laundry_pricings"("unit_id", "business_unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "laundry_transactions_transaction_no_key" ON "laundry_transactions"("transaction_no");

-- CreateIndex
CREATE INDEX "laundry_transactions_unit_id_idx" ON "laundry_transactions"("unit_id");

-- CreateIndex
CREATE INDEX "laundry_transactions_business_unit_id_idx" ON "laundry_transactions"("business_unit_id");

-- CreateIndex
CREATE INDEX "laundry_transactions_student_id_idx" ON "laundry_transactions"("student_id");

-- CreateIndex
CREATE INDEX "laundry_transactions_transaction_no_idx" ON "laundry_transactions"("transaction_no");

-- CreateIndex
CREATE INDEX "laundry_transactions_status_idx" ON "laundry_transactions"("status");

-- CreateIndex
CREATE INDEX "laundry_transactions_created_at_idx" ON "laundry_transactions"("created_at");

-- CreateIndex
CREATE INDEX "laundry_items_transaction_id_idx" ON "laundry_items"("transaction_id");

-- CreateIndex
CREATE INDEX "laundry_status_logs_transaction_id_idx" ON "laundry_status_logs"("transaction_id");

-- CreateIndex
CREATE INDEX "laundry_status_logs_created_at_idx" ON "laundry_status_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_code_key" ON "salary_components"("code");

-- CreateIndex
CREATE INDEX "salary_components_type_idx" ON "salary_components"("type");

-- CreateIndex
CREATE INDEX "salary_components_code_idx" ON "salary_components"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_salaries_staff_id_key" ON "employee_salaries"("staff_id");

-- CreateIndex
CREATE INDEX "employee_salaries_staff_id_idx" ON "employee_salaries"("staff_id");

-- CreateIndex
CREATE INDEX "employee_salary_items_salary_id_idx" ON "employee_salary_items"("salary_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_salary_items_salary_id_component_id_key" ON "employee_salary_items"("salary_id", "component_id");

-- CreateIndex
CREATE INDEX "payroll_periods_unit_id_idx" ON "payroll_periods"("unit_id");

-- CreateIndex
CREATE INDEX "payroll_periods_status_idx" ON "payroll_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_unit_id_month_year_key" ON "payroll_periods"("unit_id", "month", "year");

-- CreateIndex
CREATE INDEX "payrolls_period_id_idx" ON "payrolls"("period_id");

-- CreateIndex
CREATE INDEX "payrolls_staff_id_idx" ON "payrolls"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_period_id_staff_id_key" ON "payrolls"("period_id", "staff_id");

-- CreateIndex
CREATE INDEX "payroll_items_payroll_id_idx" ON "payroll_items"("payroll_id");

-- CreateIndex
CREATE INDEX "pkg_periods_unit_id_idx" ON "pkg_periods"("unit_id");

-- CreateIndex
CREATE INDEX "pkg_periods_academic_year_id_idx" ON "pkg_periods"("academic_year_id");

-- CreateIndex
CREATE INDEX "pkg_evaluations_period_id_idx" ON "pkg_evaluations"("period_id");

-- CreateIndex
CREATE INDEX "pkg_evaluations_teacher_id_idx" ON "pkg_evaluations"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "pkg_evaluations_period_id_teacher_id_key" ON "pkg_evaluations"("period_id", "teacher_id");

-- CreateIndex
CREATE INDEX "pkg_details_evaluation_id_idx" ON "pkg_details"("evaluation_id");

-- CreateIndex
CREATE INDEX "pkg_documents_evaluation_id_idx" ON "pkg_documents"("evaluation_id");

-- CreateIndex
CREATE INDEX "portfolios_student_id_idx" ON "portfolios"("student_id");

-- CreateIndex
CREATE INDEX "portfolios_type_idx" ON "portfolios"("type");

-- CreateIndex
CREATE INDEX "portfolios_academic_year_id_idx" ON "portfolios"("academic_year_id");

-- CreateIndex
CREATE INDEX "portfolio_files_portfolio_id_idx" ON "portfolio_files"("portfolio_id");

-- CreateIndex
CREATE INDEX "portfolio_comments_portfolio_id_idx" ON "portfolio_comments"("portfolio_id");

-- CreateIndex
CREATE INDEX "islamic_events_unit_id_idx" ON "islamic_events"("unit_id");

-- CreateIndex
CREATE INDEX "islamic_events_hijri_month_hijri_day_idx" ON "islamic_events"("hijri_month", "hijri_day");

-- CreateIndex
CREATE INDEX "daily_ibadah_targets_unit_id_idx" ON "daily_ibadah_targets"("unit_id");

-- CreateIndex
CREATE INDEX "daily_ibadah_targets_category_idx" ON "daily_ibadah_targets"("category");

-- CreateIndex
CREATE INDEX "daily_ibadah_records_target_id_idx" ON "daily_ibadah_records"("target_id");

-- CreateIndex
CREATE INDEX "daily_ibadah_records_student_id_idx" ON "daily_ibadah_records"("student_id");

-- CreateIndex
CREATE INDEX "daily_ibadah_records_date_idx" ON "daily_ibadah_records"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_ibadah_records_target_id_student_id_date_key" ON "daily_ibadah_records"("target_id", "student_id", "date");

-- CreateIndex
CREATE INDEX "ibadah_leaderboards_unit_id_idx" ON "ibadah_leaderboards"("unit_id");

-- CreateIndex
CREATE INDEX "ibadah_leaderboards_student_id_idx" ON "ibadah_leaderboards"("student_id");

-- CreateIndex
CREATE INDEX "ibadah_leaderboards_rank_idx" ON "ibadah_leaderboards"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "ibadah_leaderboards_unit_id_student_id_period_type_period_s_key" ON "ibadah_leaderboards"("unit_id", "student_id", "period_type", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "settings_unit_id_key_key" ON "settings"("unit_id", "key");

-- CreateIndex
CREATE INDEX "system_secrets_unit_id_idx" ON "system_secrets"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_secrets_unit_id_key_key" ON "system_secrets"("unit_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_personas_scope_key" ON "chatbot_personas"("scope");

-- CreateIndex
CREATE INDEX "chatbot_usage_daily_date_idx" ON "chatbot_usage_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_usage_daily_date_model_key" ON "chatbot_usage_daily"("date", "model");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_conversations_client_id_key" ON "chatbot_conversations"("client_id");

-- CreateIndex
CREATE INDEX "chatbot_conversations_last_message_at_idx" ON "chatbot_conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "chatbot_escalations_status_created_at_idx" ON "chatbot_escalations"("status", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_escalations_created_at_idx" ON "chatbot_escalations"("created_at");

-- CreateIndex
CREATE INDEX "chatbot_messages_conversation_id_created_at_idx" ON "chatbot_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_messages_created_at_idx" ON "chatbot_messages"("created_at");

-- CreateIndex
CREATE INDEX "rapor_pesantren_student_id_idx" ON "rapor_pesantren"("student_id");

-- CreateIndex
CREATE INDEX "rapor_pesantren_unit_id_idx" ON "rapor_pesantren"("unit_id");

-- CreateIndex
CREATE INDEX "rapor_pesantren_academic_year_id_idx" ON "rapor_pesantren"("academic_year_id");

-- CreateIndex
CREATE INDEX "rapor_pesantren_status_idx" ON "rapor_pesantren"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rapor_pesantren_student_id_academic_year_id_semester_key" ON "rapor_pesantren"("student_id", "academic_year_id", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "paud_development_indicators_code_key" ON "paud_development_indicators"("code");

-- CreateIndex
CREATE INDEX "paud_development_indicators_aspect_idx" ON "paud_development_indicators"("aspect");

-- CreateIndex
CREATE INDEX "paud_development_indicators_unit_id_idx" ON "paud_development_indicators"("unit_id");

-- CreateIndex
CREATE INDEX "paud_development_indicators_age_group_min_age_group_max_idx" ON "paud_development_indicators"("age_group_min", "age_group_max");

-- CreateIndex
CREATE INDEX "paud_development_assessments_student_id_idx" ON "paud_development_assessments"("student_id");

-- CreateIndex
CREATE INDEX "paud_development_assessments_unit_id_idx" ON "paud_development_assessments"("unit_id");

-- CreateIndex
CREATE INDEX "paud_development_assessments_academic_year_id_idx" ON "paud_development_assessments"("academic_year_id");

-- CreateIndex
CREATE INDEX "paud_development_assessments_aspect_idx" ON "paud_development_assessments"("aspect");

-- CreateIndex
CREATE INDEX "paud_development_assessments_period_date_idx" ON "paud_development_assessments"("period_date");

-- CreateIndex
CREATE INDEX "paud_assessment_evidences_assessment_id_idx" ON "paud_assessment_evidences"("assessment_id");

-- CreateIndex
CREATE INDEX "paud_narrative_reports_student_id_idx" ON "paud_narrative_reports"("student_id");

-- CreateIndex
CREATE INDEX "paud_narrative_reports_unit_id_idx" ON "paud_narrative_reports"("unit_id");

-- CreateIndex
CREATE INDEX "paud_narrative_reports_academic_year_id_idx" ON "paud_narrative_reports"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "paud_narrative_reports_student_id_academic_year_id_semester_key" ON "paud_narrative_reports"("student_id", "academic_year_id", "semester");

-- CreateIndex
CREATE INDEX "paud_report_photos_report_id_idx" ON "paud_report_photos"("report_id");

-- CreateIndex
CREATE INDEX "daily_student_reports_student_id_idx" ON "daily_student_reports"("student_id");

-- CreateIndex
CREATE INDEX "daily_student_reports_unit_id_idx" ON "daily_student_reports"("unit_id");

-- CreateIndex
CREATE INDEX "daily_student_reports_report_date_idx" ON "daily_student_reports"("report_date");

-- CreateIndex
CREATE INDEX "daily_student_reports_unit_type_idx" ON "daily_student_reports"("unit_type");

-- CreateIndex
CREATE UNIQUE INDEX "daily_student_reports_student_id_report_date_key" ON "daily_student_reports"("student_id", "report_date");

-- CreateIndex
CREATE INDEX "daily_report_photos_report_id_idx" ON "daily_report_photos"("report_id");

-- CreateIndex
CREATE INDEX "daily_homework_report_id_idx" ON "daily_homework"("report_id");

-- CreateIndex
CREATE INDEX "murojaah_records_student_id_idx" ON "murojaah_records"("student_id");

-- CreateIndex
CREATE INDEX "murojaah_records_murojaah_date_idx" ON "murojaah_records"("murojaah_date");

-- CreateIndex
CREATE INDEX "murojaah_records_murojaah_type_idx" ON "murojaah_records"("murojaah_type");

-- CreateIndex
CREATE INDEX "murojaah_mistakes_murojaah_id_idx" ON "murojaah_mistakes"("murojaah_id");

-- CreateIndex
CREATE INDEX "simaan_exams_student_id_idx" ON "simaan_exams"("student_id");

-- CreateIndex
CREATE INDEX "simaan_exams_exam_date_idx" ON "simaan_exams"("exam_date");

-- CreateIndex
CREATE INDEX "simaan_exams_simaan_type_idx" ON "simaan_exams"("simaan_type");

-- CreateIndex
CREATE INDEX "simaan_examiners_simaan_id_idx" ON "simaan_examiners"("simaan_id");

-- CreateIndex
CREATE INDEX "simaan_examiners_examiner_id_idx" ON "simaan_examiners"("examiner_id");

-- CreateIndex
CREATE INDEX "dashboard_metric_snapshots_unit_id_idx" ON "dashboard_metric_snapshots"("unit_id");

-- CreateIndex
CREATE INDEX "dashboard_metric_snapshots_metric_type_idx" ON "dashboard_metric_snapshots"("metric_type");

-- CreateIndex
CREATE INDEX "dashboard_metric_snapshots_period_date_idx" ON "dashboard_metric_snapshots"("period_date");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_metric_snapshots_unit_id_metric_type_period_type__key" ON "dashboard_metric_snapshots"("unit_id", "metric_type", "period_type", "period_date");

-- CreateIndex
CREATE INDEX "unit_comparison_reports_report_type_idx" ON "unit_comparison_reports"("report_type");

-- CreateIndex
CREATE INDEX "unit_comparison_reports_period_start_period_end_idx" ON "unit_comparison_reports"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "growth_records_student_id_idx" ON "growth_records"("student_id");

-- CreateIndex
CREATE INDEX "growth_records_unit_id_idx" ON "growth_records"("unit_id");

-- CreateIndex
CREATE INDEX "growth_records_record_date_idx" ON "growth_records"("record_date");

-- CreateIndex
CREATE INDEX "immunization_records_student_id_idx" ON "immunization_records"("student_id");

-- CreateIndex
CREATE INDEX "immunization_records_unit_id_idx" ON "immunization_records"("unit_id");

-- CreateIndex
CREATE INDEX "immunization_records_status_idx" ON "immunization_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "immunization_records_student_id_vaccine_name_dose_number_key" ON "immunization_records"("student_id", "vaccine_name", "dose_number");

-- CreateIndex
CREATE INDEX "dashboard_history_unit_id_idx" ON "dashboard_history"("unit_id");

-- CreateIndex
CREATE INDEX "dashboard_history_created_at_idx" ON "dashboard_history"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_code_key" ON "purchase_requests"("code");

-- CreateIndex
CREATE INDEX "purchase_requests_unit_id_idx" ON "purchase_requests"("unit_id");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_date_idx" ON "purchase_requests"("date");

-- CreateIndex
CREATE INDEX "purchase_request_items_request_id_idx" ON "purchase_request_items"("request_id");

-- CreateIndex
CREATE INDEX "guest_books_unit_id_idx" ON "guest_books"("unit_id");

-- CreateIndex
CREATE INDEX "guest_books_check_in_idx" ON "guest_books"("check_in");

-- CreateIndex
CREATE INDEX "student_visits_student_id_idx" ON "student_visits"("student_id");

-- CreateIndex
CREATE INDEX "student_visits_unit_id_idx" ON "student_visits"("unit_id");

-- CreateIndex
CREATE INDEX "student_visits_check_in_idx" ON "student_visits"("check_in");

-- CreateIndex
CREATE INDEX "student_packages_student_id_idx" ON "student_packages"("student_id");

-- CreateIndex
CREATE INDEX "student_packages_unit_id_idx" ON "student_packages"("unit_id");

-- CreateIndex
CREATE INDEX "student_packages_status_idx" ON "student_packages"("status");

-- CreateIndex
CREATE INDEX "student_packages_received_at_idx" ON "student_packages"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_campaigns_code_key" ON "marketing_campaigns"("code");

-- CreateIndex
CREATE INDEX "marketing_campaigns_unit_id_idx" ON "marketing_campaigns"("unit_id");

-- CreateIndex
CREATE INDEX "marketing_campaigns_is_active_idx" ON "marketing_campaigns"("is_active");

-- CreateIndex
CREATE INDEX "marketing_interactions_registrant_id_idx" ON "marketing_interactions"("registrant_id");

-- CreateIndex
CREATE INDEX "marketing_interactions_date_idx" ON "marketing_interactions"("date");

-- CreateIndex
CREATE INDEX "letter_flow_events_letter_id_created_at_idx" ON "letter_flow_events"("letter_id", "created_at");

-- CreateIndex
CREATE INDEX "letter_flow_events_actor_id_idx" ON "letter_flow_events"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_signing_keys_user_id_key" ON "user_signing_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_user_id_key" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_nik_key" ON "user_identities"("nik");

-- CreateIndex
CREATE INDEX "signing_key_requests_user_id_idx" ON "signing_key_requests"("user_id");

-- CreateIndex
CREATE INDEX "signing_key_requests_status_idx" ON "signing_key_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "letter_signatures_verification_token_key" ON "letter_signatures"("verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "letter_signatures_pdf_hash_key" ON "letter_signatures"("pdf_hash");

-- CreateIndex
CREATE INDEX "letter_signatures_letter_id_idx" ON "letter_signatures"("letter_id");

-- CreateIndex
CREATE INDEX "letter_signatures_pdf_hash_idx" ON "letter_signatures"("pdf_hash");

-- CreateIndex
CREATE UNIQUE INDEX "letter_signatures_letter_id_signer_id_key" ON "letter_signatures"("letter_id", "signer_id");

-- CreateIndex
CREATE UNIQUE INDEX "letter_signed_documents_signature_id_key" ON "letter_signed_documents"("signature_id");

-- CreateIndex
CREATE INDEX "letter_revocation_requests_letter_id_idx" ON "letter_revocation_requests"("letter_id");

-- CreateIndex
CREATE INDEX "letter_revocation_requests_status_idx" ON "letter_revocation_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "filing_classifications_code_key" ON "filing_classifications"("code");

-- CreateIndex
CREATE INDEX "filing_classifications_code_idx" ON "filing_classifications"("code");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_numbers_unit_id_academic_year_id_type_key" ON "agenda_numbers"("unit_id", "academic_year_id", "type");

-- CreateIndex
CREATE INDEX "letters_unit_id_idx" ON "letters"("unit_id");

-- CreateIndex
CREATE INDEX "letters_direction_idx" ON "letters"("direction");

-- CreateIndex
CREATE INDEX "letters_status_idx" ON "letters"("status");

-- CreateIndex
CREATE INDEX "letters_date_idx" ON "letters"("date");

-- CreateIndex
CREATE INDEX "letters_sent_at_idx" ON "letters"("sent_at");

-- CreateIndex
CREATE INDEX "letter_reviewers_letter_id_idx" ON "letter_reviewers"("letter_id");

-- CreateIndex
CREATE INDEX "letter_reviewers_reviewer_id_idx" ON "letter_reviewers"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "letter_reviewers_letter_id_reviewer_id_key" ON "letter_reviewers"("letter_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "letter_recipients_letter_id_order_idx" ON "letter_recipients"("letter_id", "order");

-- CreateIndex
CREATE INDEX "letter_recipients_user_id_idx" ON "letter_recipients"("user_id");

-- CreateIndex
CREATE INDEX "letter_attachments_letter_id_order_idx" ON "letter_attachments"("letter_id", "order");

-- CreateIndex
CREATE INDEX "letter_dispatches_letter_id_dispatched_at_idx" ON "letter_dispatches"("letter_id", "dispatched_at");

-- CreateIndex
CREATE INDEX "dispositions_letter_id_idx" ON "dispositions"("letter_id");

-- CreateIndex
CREATE INDEX "dispositions_sender_id_idx" ON "dispositions"("sender_id");

-- CreateIndex
CREATE INDEX "dispositions_recipient_id_idx" ON "dispositions"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_standards_type_key" ON "quality_standards"("type");

-- CreateIndex
CREATE INDEX "quality_indicators_standard_id_idx" ON "quality_indicators"("standard_id");

-- CreateIndex
CREATE INDEX "quality_evidences_unit_id_idx" ON "quality_evidences"("unit_id");

-- CreateIndex
CREATE INDEX "quality_evidences_indicator_id_idx" ON "quality_evidences"("indicator_id");

-- CreateIndex
CREATE INDEX "quality_evidences_academic_year_id_idx" ON "quality_evidences"("academic_year_id");

-- CreateIndex
CREATE INDEX "quality_audits_unit_id_idx" ON "quality_audits"("unit_id");

-- CreateIndex
CREATE INDEX "quality_audits_academic_year_id_idx" ON "quality_audits"("academic_year_id");

-- CreateIndex
CREATE INDEX "quality_audits_status_idx" ON "quality_audits"("status");

-- CreateIndex
CREATE INDEX "quality_audit_items_audit_id_idx" ON "quality_audit_items"("audit_id");

-- CreateIndex
CREATE INDEX "quality_audit_items_indicator_id_idx" ON "quality_audit_items"("indicator_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_audit_items_audit_id_indicator_id_key" ON "quality_audit_items"("audit_id", "indicator_id");

-- CreateIndex
CREATE INDEX "question_banks_unit_id_idx" ON "question_banks"("unit_id");

-- CreateIndex
CREATE INDEX "question_banks_teacher_id_idx" ON "question_banks"("teacher_id");

-- CreateIndex
CREATE INDEX "questions_bank_id_idx" ON "questions"("bank_id");

-- CreateIndex
CREATE INDEX "exam_attempts_exam_id_idx" ON "exam_attempts"("exam_id");

-- CreateIndex
CREATE INDEX "exam_attempts_student_id_idx" ON "exam_attempts"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_exam_id_student_id_key" ON "exam_attempts"("exam_id", "student_id");

-- CreateIndex
CREATE INDEX "exam_answers_attempt_id_idx" ON "exam_answers"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_attempt_id_question_id_key" ON "exam_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "assignments_unit_id_idx" ON "assignments"("unit_id");

-- CreateIndex
CREATE INDEX "assignments_teacher_id_idx" ON "assignments"("teacher_id");

-- CreateIndex
CREATE INDEX "assignments_subject_id_idx" ON "assignments"("subject_id");

-- CreateIndex
CREATE INDEX "assignments_class_id_idx" ON "assignments"("class_id");

-- CreateIndex
CREATE INDEX "assignment_submissions_assignment_id_idx" ON "assignment_submissions"("assignment_id");

-- CreateIndex
CREATE INDEX "assignment_submissions_student_id_idx" ON "assignment_submissions"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignment_id_student_id_key" ON "assignment_submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "risks_unit_id_idx" ON "risks"("unit_id");

-- CreateIndex
CREATE INDEX "risks_category_idx" ON "risks"("category");

-- CreateIndex
CREATE INDEX "risks_riskLevel_idx" ON "risks"("riskLevel");

-- CreateIndex
CREATE INDEX "risk_mitigations_risk_id_idx" ON "risk_mitigations"("risk_id");

-- CreateIndex
CREATE INDEX "complaints_unit_id_idx" ON "complaints"("unit_id");

-- CreateIndex
CREATE INDEX "complaints_user_id_idx" ON "complaints"("user_id");

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status");

-- CreateIndex
CREATE INDEX "complaints_category_idx" ON "complaints"("category");

-- CreateIndex
CREATE INDEX "complaint_comments_complaint_id_idx" ON "complaint_comments"("complaint_id");

-- CreateIndex
CREATE INDEX "projects_unit_id_idx" ON "projects"("unit_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "project_columns_project_id_idx" ON "project_columns"("project_id");

-- CreateIndex
CREATE INDEX "project_tasks_project_id_idx" ON "project_tasks"("project_id");

-- CreateIndex
CREATE INDEX "project_tasks_column_id_idx" ON "project_tasks"("column_id");

-- CreateIndex
CREATE INDEX "project_tasks_assignee_id_idx" ON "project_tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "task_comments_task_id_idx" ON "task_comments"("task_id");

-- CreateIndex
CREATE INDEX "strategic_plans_unit_id_idx" ON "strategic_plans"("unit_id");

-- CreateIndex
CREATE INDEX "strategic_plans_status_idx" ON "strategic_plans"("status");

-- CreateIndex
CREATE INDEX "strategic_plans_type_idx" ON "strategic_plans"("type");

-- CreateIndex
CREATE UNIQUE INDEX "plan_collaborators_plan_id_user_id_key" ON "plan_collaborators"("plan_id", "user_id");

-- CreateIndex
CREATE INDEX "plan_objectives_plan_id_idx" ON "plan_objectives"("plan_id");

-- CreateIndex
CREATE INDEX "plan_indicators_objective_id_idx" ON "plan_indicators"("objective_id");

-- CreateIndex
CREATE INDEX "plan_indicators_activity_id_idx" ON "plan_indicators"("activity_id");

-- CreateIndex
CREATE INDEX "plan_indicator_targets_indicator_id_idx" ON "plan_indicator_targets"("indicator_id");

-- CreateIndex
CREATE INDEX "plan_activities_objective_id_idx" ON "plan_activities"("objective_id");

-- CreateIndex
CREATE INDEX "plan_activities_parent_id_idx" ON "plan_activities"("parent_id");

-- CreateIndex
CREATE INDEX "plan_activities_status_idx" ON "plan_activities"("status");

-- CreateIndex
CREATE INDEX "plan_activity_budget_items_activity_id_idx" ON "plan_activity_budget_items"("activity_id");

-- CreateIndex
CREATE INDEX "plan_funding_sources_plan_id_idx" ON "plan_funding_sources"("plan_id");

-- CreateIndex
CREATE INDEX "internal_audits_unit_id_idx" ON "internal_audits"("unit_id");

-- CreateIndex
CREATE INDEX "internal_audits_status_idx" ON "internal_audits"("status");

-- CreateIndex
CREATE INDEX "audit_findings_audit_id_idx" ON "audit_findings"("audit_id");

-- CreateIndex
CREATE INDEX "audit_findings_severity_idx" ON "audit_findings"("severity");

-- CreateIndex
CREATE INDEX "audit_findings_plan_objective_id_idx" ON "audit_findings"("plan_objective_id");

-- CreateIndex
CREATE INDEX "audit_findings_risk_id_idx" ON "audit_findings"("risk_id");

-- CreateIndex
CREATE INDEX "audit_follow_ups_finding_id_idx" ON "audit_follow_ups"("finding_id");

-- CreateIndex
CREATE INDEX "audit_follow_ups_status_idx" ON "audit_follow_ups"("status");

-- CreateIndex
CREATE INDEX "sharia_compliances_unit_id_idx" ON "sharia_compliances"("unit_id");

-- CreateIndex
CREATE INDEX "sharia_compliances_category_idx" ON "sharia_compliances"("category");

-- CreateIndex
CREATE INDEX "sharia_compliances_status_idx" ON "sharia_compliances"("status");

-- CreateIndex
CREATE INDEX "sharia_audits_compliance_id_idx" ON "sharia_audits"("compliance_id");

-- CreateIndex
CREATE INDEX "environment_programs_unit_id_idx" ON "environment_programs"("unit_id");

-- CreateIndex
CREATE INDEX "environment_programs_status_idx" ON "environment_programs"("status");

-- CreateIndex
CREATE INDEX "waste_management_unit_id_idx" ON "waste_management"("unit_id");

-- CreateIndex
CREATE INDEX "waste_management_record_date_idx" ON "waste_management"("record_date");

-- CreateIndex
CREATE INDEX "green_campus_indicators_unit_id_idx" ON "green_campus_indicators"("unit_id");

-- CreateIndex
CREATE INDEX "green_campus_indicators_category_idx" ON "green_campus_indicators"("category");

-- CreateIndex
CREATE UNIQUE INDEX "talent_profiles_user_id_key" ON "talent_profiles"("user_id");

-- CreateIndex
CREATE INDEX "talent_profiles_unit_id_idx" ON "talent_profiles"("unit_id");

-- CreateIndex
CREATE INDEX "talent_profiles_category_idx" ON "talent_profiles"("category");

-- CreateIndex
CREATE INDEX "talent_assessments_talent_id_idx" ON "talent_assessments"("talent_id");

-- CreateIndex
CREATE INDEX "talent_assessments_assessor_id_idx" ON "talent_assessments"("assessor_id");

-- CreateIndex
CREATE INDEX "succession_plans_unit_id_idx" ON "succession_plans"("unit_id");

-- CreateIndex
CREATE INDEX "training_programs_unit_id_idx" ON "training_programs"("unit_id");

-- CreateIndex
CREATE INDEX "training_programs_status_idx" ON "training_programs"("status");

-- CreateIndex
CREATE INDEX "training_enrollments_program_id_idx" ON "training_enrollments"("program_id");

-- CreateIndex
CREATE INDEX "training_enrollments_user_id_idx" ON "training_enrollments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_enrollments_program_id_user_id_key" ON "training_enrollments"("program_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_code_key" ON "org_units"("code");

-- CreateIndex
CREATE INDEX "org_units_unit_id_idx" ON "org_units"("unit_id");

-- CreateIndex
CREATE INDEX "org_units_parent_id_idx" ON "org_units"("parent_id");

-- CreateIndex
CREATE INDEX "org_positions_org_unit_id_idx" ON "org_positions"("org_unit_id");

-- CreateIndex
CREATE INDEX "org_positions_holder_id_idx" ON "org_positions"("holder_id");

-- CreateIndex
CREATE UNIQUE INDEX "standard_operating_procedures_document_number_key" ON "standard_operating_procedures"("document_number");

-- CreateIndex
CREATE INDEX "standard_operating_procedures_unit_id_idx" ON "standard_operating_procedures"("unit_id");

-- CreateIndex
CREATE INDEX "standard_operating_procedures_status_idx" ON "standard_operating_procedures"("status");

-- CreateIndex
CREATE INDEX "standard_operating_procedures_category_idx" ON "standard_operating_procedures"("category");

-- CreateIndex
CREATE INDEX "sop_revisions_sop_id_idx" ON "sop_revisions"("sop_id");

-- CreateIndex
CREATE INDEX "research_projects_unit_id_idx" ON "research_projects"("unit_id");

-- CreateIndex
CREATE INDEX "research_projects_status_idx" ON "research_projects"("status");

-- CreateIndex
CREATE INDEX "research_projects_leader_id_idx" ON "research_projects"("leader_id");

-- CreateIndex
CREATE INDEX "research_milestones_project_id_idx" ON "research_milestones"("project_id");

-- CreateIndex
CREATE INDEX "practicum_lesson_plans_student_id_idx" ON "practicum_lesson_plans"("student_id");

-- CreateIndex
CREATE INDEX "practicum_lesson_plans_academic_year_id_idx" ON "practicum_lesson_plans"("academic_year_id");

-- CreateIndex
CREATE INDEX "practicum_lesson_plans_status_idx" ON "practicum_lesson_plans"("status");

-- CreateIndex
CREATE INDEX "practicum_schedules_lesson_plan_id_idx" ON "practicum_schedules"("lesson_plan_id");

-- CreateIndex
CREATE INDEX "practicum_evaluations_lesson_plan_id_idx" ON "practicum_evaluations"("lesson_plan_id");

-- CreateIndex
CREATE INDEX "student_orgs_unit_id_idx" ON "student_orgs"("unit_id");

-- CreateIndex
CREATE INDEX "student_org_positions_org_id_idx" ON "student_org_positions"("org_id");

-- CreateIndex
CREATE INDEX "student_org_members_student_id_idx" ON "student_org_members"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_org_members_position_id_student_id_key" ON "student_org_members"("position_id", "student_id");

-- CreateIndex
CREATE INDEX "student_org_logbooks_member_id_idx" ON "student_org_logbooks"("member_id");

-- CreateIndex
CREATE INDEX "student_org_logbooks_date_idx" ON "student_org_logbooks"("date");

-- CreateIndex
CREATE INDEX "research_themes_unit_id_idx" ON "research_themes"("unit_id");

-- CreateIndex
CREATE INDEX "research_submissions_theme_id_idx" ON "research_submissions"("theme_id");

-- CreateIndex
CREATE INDEX "research_submissions_student_id_idx" ON "research_submissions"("student_id");

-- CreateIndex
CREATE INDEX "research_references_submission_id_idx" ON "research_references"("submission_id");

-- CreateIndex
CREATE INDEX "innovation_proposals_unit_id_idx" ON "innovation_proposals"("unit_id");

-- CreateIndex
CREATE INDEX "innovation_proposals_status_idx" ON "innovation_proposals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_unit_id_idx" ON "courses"("unit_id");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_invoice_id_key" ON "course_enrollments"("invoice_id");

-- CreateIndex
CREATE INDEX "course_enrollments_course_id_idx" ON "course_enrollments"("course_id");

-- CreateIndex
CREATE INDEX "course_enrollments_student_id_idx" ON "course_enrollments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_certificates_enrollment_id_key" ON "course_certificates"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_certificates_certificate_no_key" ON "course_certificates"("certificate_no");

-- CreateIndex
CREATE UNIQUE INDEX "mustahik_nik_key" ON "mustahik"("nik");

-- CreateIndex
CREATE INDEX "zis_distributions_mustahik_id_idx" ON "zis_distributions"("mustahik_id");

-- CreateIndex
CREATE INDEX "zis_distributions_date_idx" ON "zis_distributions"("date");

-- CreateIndex
CREATE INDEX "social_service_orders_unit_id_idx" ON "social_service_orders"("unit_id");

-- CreateIndex
CREATE INDEX "social_service_orders_status_idx" ON "social_service_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "social_service_teams_order_id_user_id_key" ON "social_service_teams"("order_id", "user_id");

-- CreateIndex
CREATE INDEX "social_service_materials_order_id_idx" ON "social_service_materials"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_code_key" ON "faculties"("code");

-- CreateIndex
CREATE INDEX "faculties_unit_id_idx" ON "faculties"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_programs_code_key" ON "study_programs"("code");

-- CreateIndex
CREATE INDEX "study_programs_faculty_id_idx" ON "study_programs"("faculty_id");

-- CreateIndex
CREATE UNIQUE INDEX "higher_ed_courses_code_key" ON "higher_ed_courses"("code");

-- CreateIndex
CREATE INDEX "higher_ed_courses_program_id_idx" ON "higher_ed_courses"("program_id");

-- CreateIndex
CREATE INDEX "higher_ed_course_classes_course_id_idx" ON "higher_ed_course_classes"("course_id");

-- CreateIndex
CREATE INDEX "higher_ed_course_classes_academic_year_id_idx" ON "higher_ed_course_classes"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_higher_ed_student_id_key" ON "students_higher_ed"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_higher_ed_nim_key" ON "students_higher_ed"("nim");

-- CreateIndex
CREATE INDEX "students_higher_ed_program_id_idx" ON "students_higher_ed"("program_id");

-- CreateIndex
CREATE INDEX "krs_student_he_id_idx" ON "krs"("student_he_id");

-- CreateIndex
CREATE UNIQUE INDEX "krs_student_he_id_academic_year_id_semester_key" ON "krs"("student_he_id", "academic_year_id", "semester");

-- CreateIndex
CREATE INDEX "krs_course_enrollments_krs_id_idx" ON "krs_course_enrollments"("krs_id");

-- CreateIndex
CREATE INDEX "krs_course_enrollments_class_id_idx" ON "krs_course_enrollments"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "krs_course_enrollments_krs_id_class_id_key" ON "krs_course_enrollments"("krs_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id");

-- CreateIndex
CREATE INDEX "clinic_appointments_unit_id_idx" ON "clinic_appointments"("unit_id");

-- CreateIndex
CREATE INDEX "clinic_appointments_appointment_date_idx" ON "clinic_appointments"("appointment_date");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_medical_record_id_key" ON "prescriptions"("medical_record_id");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_idx" ON "prescriptions"("patient_id");

-- CreateIndex
CREATE INDEX "prescriptions_student_id_idx" ON "prescriptions"("student_id");

-- CreateIndex
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id");

-- CreateIndex
CREATE INDEX "scholarship_criteria_scholarship_id_idx" ON "scholarship_criteria"("scholarship_id");

-- CreateIndex
CREATE UNIQUE INDEX "scholarship_assessments_recipient_id_criterion_id_key" ON "scholarship_assessments"("recipient_id", "criterion_id");

-- CreateIndex
CREATE INDEX "performance_agreements_user_id_idx" ON "performance_agreements"("user_id");

-- CreateIndex
CREATE INDEX "performance_agreements_supervisor_id_idx" ON "performance_agreements"("supervisor_id");

-- CreateIndex
CREATE INDEX "performance_agreements_status_idx" ON "performance_agreements"("status");

-- CreateIndex
CREATE INDEX "pk_indicators_pk_id_idx" ON "pk_indicators"("pk_id");

-- CreateIndex
CREATE UNIQUE INDEX "pk_evaluations_pk_id_month_year_key" ON "pk_evaluations"("pk_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "pk_indicator_evaluations_evaluation_id_indicator_id_key" ON "pk_indicator_evaluations"("evaluation_id", "indicator_id");

-- CreateIndex
CREATE UNIQUE INDEX "behavioral_values_name_key" ON "behavioral_values"("name");

-- CreateIndex
CREATE UNIQUE INDEX "pk_behavior_evaluations_evaluation_id_behavior_value_id_key" ON "pk_behavior_evaluations"("evaluation_id", "behavior_value_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_foundation_id_fkey" FOREIGN KEY ("foundation_id") REFERENCES "foundations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_regency_id_fkey" FOREIGN KEY ("regency_id") REFERENCES "regencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_homeroom_teacher_id_fkey" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_regency_id_fkey" FOREIGN KEY ("regency_id") REFERENCES "regencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tahfidz_records" ADD CONSTRAINT "tahfidz_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tahfidz_records" ADD CONSTRAINT "tahfidz_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tahfidz_targets" ADD CONSTRAINT "tahfidz_targets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tahfidz_targets" ADD CONSTRAINT "tahfidz_targets_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hafidz_students" ADD CONSTRAINT "hafidz_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dormitories" ADD CONSTRAINT "dormitories_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_dormitory_id_fkey" FOREIGN KEY ("dormitory_id") REFERENCES "dormitories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_given_by_id_fkey" FOREIGN KEY ("given_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_types" ADD CONSTRAINT "payment_types_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_types" ADD CONSTRAINT "payment_types_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "payment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tu_verified_by_id_fkey" FOREIGN KEY ("tu_verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_final_verified_by_id_fkey" FOREIGN KEY ("final_verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_foundation_id_fkey" FOREIGN KEY ("foundation_id") REFERENCES "foundations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_documents" ADD CONSTRAINT "foundation_documents_foundation_id_fkey" FOREIGN KEY ("foundation_id") REFERENCES "foundations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_periods" ADD CONSTRAINT "admission_periods_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_periods" ADD CONSTRAINT "admission_periods_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrants" ADD CONSTRAINT "registrants_admission_period_id_fkey" FOREIGN KEY ("admission_period_id") REFERENCES "admission_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrants" ADD CONSTRAINT "registrants_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "admission_waves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrants" ADD CONSTRAINT "registrants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrants" ADD CONSTRAINT "registrants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrant_documents" ADD CONSTRAINT "registrant_documents_registrant_id_fkey" FOREIGN KEY ("registrant_id") REFERENCES "registrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "book_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_usage_logs" ADD CONSTRAINT "medication_usage_logs_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_usage_logs" ADD CONSTRAINT "medication_usage_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_usage_logs" ADD CONSTRAINT "medication_usage_logs_given_by_id_fkey" FOREIGN KEY ("given_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "facility_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_audits" ADD CONSTRAINT "asset_audits_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_audits" ADD CONSTRAINT "asset_audits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_audit_items" ADD CONSTRAINT "asset_audit_items_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "asset_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_audit_items" ADD CONSTRAINT "asset_audit_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_question_bank_id_fkey" FOREIGN KEY ("question_bank_id") REFERENCES "question_banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_details" ADD CONSTRAINT "report_card_details_report_card_id_fkey" FOREIGN KEY ("report_card_id") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni" ADD CONSTRAINT "alumni_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni" ADD CONSTRAINT "alumni_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_careers" ADD CONSTRAINT "alumni_careers_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_educations" ADD CONSTRAINT "alumni_educations_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_donations" ADD CONSTRAINT "alumni_donations_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_donations" ADD CONSTRAINT "alumni_donations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_events" ADD CONSTRAINT "alumni_events_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_event_attendees" ADD CONSTRAINT "alumni_event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "alumni_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumni_event_attendees" ADD CONSTRAINT "alumni_event_attendees_alumni_id_fkey" FOREIGN KEY ("alumni_id") REFERENCES "alumni"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqoh" ADD CONSTRAINT "halaqoh_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halaqoh" ADD CONSTRAINT "halaqoh_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takhosus_enrollments" ADD CONSTRAINT "takhosus_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takhosus_enrollments" ADD CONSTRAINT "takhosus_enrollments_halaqoh_id_fkey" FOREIGN KEY ("halaqoh_id") REFERENCES "halaqoh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanad_records" ADD CONSTRAINT "sanad_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "takhosus_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanad_records" ADD CONSTRAINT "sanad_records_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_muhasabah" ADD CONSTRAINT "daily_muhasabah_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_campaigns" ADD CONSTRAINT "donation_campaigns_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_campaigns" ADD CONSTRAINT "donation_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "donation_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_waves" ADD CONSTRAINT "admission_waves_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "admission_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurriculars" ADD CONSTRAINT "extracurriculars_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurriculars" ADD CONSTRAINT "extracurriculars_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurriculars" ADD CONSTRAINT "extracurriculars_assistant_coach_id_fkey" FOREIGN KEY ("assistant_coach_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurriculars" ADD CONSTRAINT "extracurriculars_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurricular_enrollments" ADD CONSTRAINT "extracurricular_enrollments_extracurricular_id_fkey" FOREIGN KEY ("extracurricular_id") REFERENCES "extracurriculars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurricular_enrollments" ADD CONSTRAINT "extracurricular_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurricular_attendances" ADD CONSTRAINT "extracurricular_attendances_extracurricular_id_fkey" FOREIGN KEY ("extracurricular_id") REFERENCES "extracurriculars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurricular_attendances" ADD CONSTRAINT "extracurricular_attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurricular_attendances" ADD CONSTRAINT "extracurricular_attendances_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurricular_achievements" ADD CONSTRAINT "extracurricular_achievements_extracurricular_id_fkey" FOREIGN KEY ("extracurricular_id") REFERENCES "extracurriculars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurricular_achievements" ADD CONSTRAINT "extracurricular_achievements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_sessions" ADD CONSTRAINT "counseling_sessions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_sessions" ADD CONSTRAINT "counseling_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_sessions" ADD CONSTRAINT "counseling_sessions_counselor_id_fkey" FOREIGN KEY ("counselor_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_notes" ADD CONSTRAINT "counseling_notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "counseling_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_notes" ADD CONSTRAINT "counseling_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_referrals" ADD CONSTRAINT "counseling_referrals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "counseling_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_referrals" ADD CONSTRAINT "counseling_referrals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_types" ADD CONSTRAINT "duty_types_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_rosters" ADD CONSTRAINT "duty_rosters_duty_type_id_fkey" FOREIGN KEY ("duty_type_id") REFERENCES "duty_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_rosters" ADD CONSTRAINT "duty_rosters_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_rosters" ADD CONSTRAINT "duty_rosters_substitute_id_fkey" FOREIGN KEY ("substitute_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_rosters" ADD CONSTRAINT "duty_rosters_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_menus" ADD CONSTRAINT "meal_menus_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_menus" ADD CONSTRAINT "meal_menus_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_attendances" ADD CONSTRAINT "meal_attendances_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "meal_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_attendances" ADD CONSTRAINT "meal_attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_attendances" ADD CONSTRAINT "meal_attendances_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_diets" ADD CONSTRAINT "special_diets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_diets" ADD CONSTRAINT "special_diets_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress" ADD CONSTRAINT "kitab_progress_kitab_id_fkey" FOREIGN KEY ("kitab_id") REFERENCES "kitab_kuning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress" ADD CONSTRAINT "kitab_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress" ADD CONSTRAINT "kitab_progress_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress" ADD CONSTRAINT "kitab_progress_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muhadhoroh" ADD CONSTRAINT "muhadhoroh_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muhadhoroh" ADD CONSTRAINT "muhadhoroh_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muhadhoroh" ADD CONSTRAINT "muhadhoroh_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muhadatsah" ADD CONSTRAINT "muhadatsah_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muhadatsah" ADD CONSTRAINT "muhadatsah_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muhadatsah" ADD CONSTRAINT "muhadatsah_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muhadatsah" ADD CONSTRAINT "muhadatsah_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_witnessed_by_id_fkey" FOREIGN KEY ("witnessed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_records" ADD CONSTRAINT "behavior_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab" ADD CONSTRAINT "kitab_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_assignments" ADD CONSTRAINT "kitab_assignments_kitab_id_fkey" FOREIGN KEY ("kitab_id") REFERENCES "kitab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_assignments" ADD CONSTRAINT "kitab_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_assignments" ADD CONSTRAINT "kitab_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_assignments" ADD CONSTRAINT "kitab_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_student_progress" ADD CONSTRAINT "kitab_student_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_student_progress" ADD CONSTRAINT "kitab_student_progress_kitab_assignment_id_fkey" FOREIGN KEY ("kitab_assignment_id") REFERENCES "kitab_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress_records" ADD CONSTRAINT "kitab_progress_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress_records" ADD CONSTRAINT "kitab_progress_records_kitab_assignment_id_fkey" FOREIGN KEY ("kitab_assignment_id") REFERENCES "kitab_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress_records" ADD CONSTRAINT "kitab_progress_records_kitab_id_fkey" FOREIGN KEY ("kitab_id") REFERENCES "kitab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitab_progress_records" ADD CONSTRAINT "kitab_progress_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regencies" ADD CONSTRAINT "regencies_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_regency_id_fkey" FOREIGN KEY ("regency_id") REFERENCES "regencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "learning_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_learning_outcome_id_fkey" FOREIGN KEY ("learning_outcome_id") REFERENCES "learning_outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_modules" ADD CONSTRAINT "teaching_modules_learning_objective_id_fkey" FOREIGN KEY ("learning_objective_id") REFERENCES "learning_objectives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_modules" ADD CONSTRAINT "teaching_modules_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_modules" ADD CONSTRAINT "teaching_modules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_projects" ADD CONSTRAINT "p5_projects_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_projects" ADD CONSTRAINT "p5_projects_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_projects" ADD CONSTRAINT "p5_projects_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "p5_themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_projects" ADD CONSTRAINT "p5_projects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_projects" ADD CONSTRAINT "p5_projects_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_assessments" ADD CONSTRAINT "p5_assessments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "p5_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_assessments" ADD CONSTRAINT "p5_assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p5_assessments" ADD CONSTRAINT "p5_assessments_assessed_by_id_fkey" FOREIGN KEY ("assessed_by_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessments" ADD CONSTRAINT "merdeka_assessments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessments" ADD CONSTRAINT "merdeka_assessments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessments" ADD CONSTRAINT "merdeka_assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessments" ADD CONSTRAINT "merdeka_assessments_learning_objective_id_fkey" FOREIGN KEY ("learning_objective_id") REFERENCES "learning_objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessments" ADD CONSTRAINT "merdeka_assessments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessments" ADD CONSTRAINT "merdeka_assessments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessment_results" ADD CONSTRAINT "merdeka_assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "merdeka_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessment_results" ADD CONSTRAINT "merdeka_assessment_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merdeka_assessment_results" ADD CONSTRAINT "merdeka_assessment_results_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_components" ADD CONSTRAINT "payment_components_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_discounts" ADD CONSTRAINT "scholarship_discounts_scholarship_id_fkey" FOREIGN KEY ("scholarship_id") REFERENCES "scholarships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_discounts" ADD CONSTRAINT "scholarship_discounts_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "payment_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_recipients" ADD CONSTRAINT "scholarship_recipients_scholarship_id_fkey" FOREIGN KEY ("scholarship_id") REFERENCES "scholarships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_recipients" ADD CONSTRAINT "scholarship_recipients_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_recipients" ADD CONSTRAINT "scholarship_recipients_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_recipients" ADD CONSTRAINT "scholarship_recipients_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_codes" ADD CONSTRAINT "account_codes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "account_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_codes" ADD CONSTRAINT "account_codes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_notes" ADD CONSTRAINT "report_notes_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "financial_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lands" ADD CONSTRAINT "lands_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_land_id_fkey" FOREIGN KEY ("land_id") REFERENCES "lands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_rooms" ADD CONSTRAINT "facility_rooms_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_rooms" ADD CONSTRAINT "facility_rooms_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_rooms" ADD CONSTRAINT "facility_rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_schedule_templates" ADD CONSTRAINT "daily_schedule_templates_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "daily_schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musyrifs" ADD CONSTRAINT "musyrifs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musyrifs" ADD CONSTRAINT "musyrifs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musyrifs" ADD CONSTRAINT "musyrifs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musyrifs" ADD CONSTRAINT "musyrifs_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musyrif_assignments" ADD CONSTRAINT "musyrif_assignments_musyrif_id_fkey" FOREIGN KEY ("musyrif_id") REFERENCES "musyrifs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musyrif_assignments" ADD CONSTRAINT "musyrif_assignments_dormitory_id_fkey" FOREIGN KEY ("dormitory_id") REFERENCES "dormitories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "musyrif_assignments" ADD CONSTRAINT "musyrif_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "santri_wallets" ADD CONSTRAINT "santri_wallets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "santri_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_categories" ADD CONSTRAINT "canteen_categories_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_categories" ADD CONSTRAINT "canteen_categories_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_items" ADD CONSTRAINT "canteen_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_items" ADD CONSTRAINT "canteen_items_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_items" ADD CONSTRAINT "canteen_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "canteen_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_transactions" ADD CONSTRAINT "canteen_transactions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_transactions" ADD CONSTRAINT "canteen_transactions_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_transactions" ADD CONSTRAINT "canteen_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_transactions" ADD CONSTRAINT "canteen_transactions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_transaction_items" ADD CONSTRAINT "canteen_transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "canteen_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_transaction_items" ADD CONSTRAINT "canteen_transaction_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "canteen_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_stock_movements" ADD CONSTRAINT "canteen_stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "canteen_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canteen_stock_movements" ADD CONSTRAINT "canteen_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_pricings" ADD CONSTRAINT "laundry_pricings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_pricings" ADD CONSTRAINT "laundry_pricings_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_transactions" ADD CONSTRAINT "laundry_transactions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_transactions" ADD CONSTRAINT "laundry_transactions_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_transactions" ADD CONSTRAINT "laundry_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_transactions" ADD CONSTRAINT "laundry_transactions_pricing_id_fkey" FOREIGN KEY ("pricing_id") REFERENCES "laundry_pricings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_transactions" ADD CONSTRAINT "laundry_transactions_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_transactions" ADD CONSTRAINT "laundry_transactions_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_items" ADD CONSTRAINT "laundry_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "laundry_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_status_logs" ADD CONSTRAINT "laundry_status_logs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "laundry_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_status_logs" ADD CONSTRAINT "laundry_status_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_items" ADD CONSTRAINT "employee_salary_items_salary_id_fkey" FOREIGN KEY ("salary_id") REFERENCES "employee_salaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_items" ADD CONSTRAINT "employee_salary_items_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pkg_periods" ADD CONSTRAINT "pkg_periods_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pkg_periods" ADD CONSTRAINT "pkg_periods_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pkg_evaluations" ADD CONSTRAINT "pkg_evaluations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "pkg_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pkg_evaluations" ADD CONSTRAINT "pkg_evaluations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pkg_evaluations" ADD CONSTRAINT "pkg_evaluations_assessor_id_fkey" FOREIGN KEY ("assessor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pkg_details" ADD CONSTRAINT "pkg_details_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "pkg_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pkg_documents" ADD CONSTRAINT "pkg_documents_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "pkg_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_files" ADD CONSTRAINT "portfolio_files_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_comments" ADD CONSTRAINT "portfolio_comments_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_comments" ADD CONSTRAINT "portfolio_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "islamic_events" ADD CONSTRAINT "islamic_events_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ibadah_targets" ADD CONSTRAINT "daily_ibadah_targets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ibadah_records" ADD CONSTRAINT "daily_ibadah_records_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "daily_ibadah_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ibadah_records" ADD CONSTRAINT "daily_ibadah_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_ibadah_records" ADD CONSTRAINT "daily_ibadah_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah_leaderboards" ADD CONSTRAINT "ibadah_leaderboards_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah_leaderboards" ADD CONSTRAINT "ibadah_leaderboards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_secrets" ADD CONSTRAINT "system_secrets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapor_pesantren" ADD CONSTRAINT "rapor_pesantren_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapor_pesantren" ADD CONSTRAINT "rapor_pesantren_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapor_pesantren" ADD CONSTRAINT "rapor_pesantren_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_development_indicators" ADD CONSTRAINT "paud_development_indicators_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_development_assessments" ADD CONSTRAINT "paud_development_assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_development_assessments" ADD CONSTRAINT "paud_development_assessments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_development_assessments" ADD CONSTRAINT "paud_development_assessments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_development_assessments" ADD CONSTRAINT "paud_development_assessments_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "paud_development_indicators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_development_assessments" ADD CONSTRAINT "paud_development_assessments_assessed_by_id_fkey" FOREIGN KEY ("assessed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_assessment_evidences" ADD CONSTRAINT "paud_assessment_evidences_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "paud_development_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_narrative_reports" ADD CONSTRAINT "paud_narrative_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_narrative_reports" ADD CONSTRAINT "paud_narrative_reports_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_narrative_reports" ADD CONSTRAINT "paud_narrative_reports_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_narrative_reports" ADD CONSTRAINT "paud_narrative_reports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paud_report_photos" ADD CONSTRAINT "paud_report_photos_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "paud_narrative_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_student_reports" ADD CONSTRAINT "daily_student_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_student_reports" ADD CONSTRAINT "daily_student_reports_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_student_reports" ADD CONSTRAINT "daily_student_reports_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_student_reports" ADD CONSTRAINT "daily_student_reports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_photos" ADD CONSTRAINT "daily_report_photos_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_student_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_homework" ADD CONSTRAINT "daily_homework_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_student_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "murojaah_records" ADD CONSTRAINT "murojaah_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "murojaah_records" ADD CONSTRAINT "murojaah_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "takhosus_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "murojaah_records" ADD CONSTRAINT "murojaah_records_halaqoh_id_fkey" FOREIGN KEY ("halaqoh_id") REFERENCES "halaqoh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "murojaah_records" ADD CONSTRAINT "murojaah_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "murojaah_mistakes" ADD CONSTRAINT "murojaah_mistakes_murojaah_id_fkey" FOREIGN KEY ("murojaah_id") REFERENCES "murojaah_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simaan_exams" ADD CONSTRAINT "simaan_exams_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simaan_exams" ADD CONSTRAINT "simaan_exams_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "takhosus_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simaan_exams" ADD CONSTRAINT "simaan_exams_halaqoh_id_fkey" FOREIGN KEY ("halaqoh_id") REFERENCES "halaqoh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simaan_examiners" ADD CONSTRAINT "simaan_examiners_simaan_id_fkey" FOREIGN KEY ("simaan_id") REFERENCES "simaan_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simaan_examiners" ADD CONSTRAINT "simaan_examiners_examiner_id_fkey" FOREIGN KEY ("examiner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_metric_snapshots" ADD CONSTRAINT "dashboard_metric_snapshots_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_metric_snapshots" ADD CONSTRAINT "dashboard_metric_snapshots_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_metric_snapshots" ADD CONSTRAINT "dashboard_metric_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_comparison_reports" ADD CONSTRAINT "unit_comparison_reports_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_comparison_reports" ADD CONSTRAINT "unit_comparison_reports_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_records" ADD CONSTRAINT "growth_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_records" ADD CONSTRAINT "growth_records_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_records" ADD CONSTRAINT "growth_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immunization_records" ADD CONSTRAINT "immunization_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immunization_records" ADD CONSTRAINT "immunization_records_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immunization_records" ADD CONSTRAINT "immunization_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_history" ADD CONSTRAINT "dashboard_history_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_asset_category_id_fkey" FOREIGN KEY ("asset_category_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_books" ADD CONSTRAINT "guest_books_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_books" ADD CONSTRAINT "guest_books_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_visits" ADD CONSTRAINT "student_visits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_visits" ADD CONSTRAINT "student_visits_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_packages" ADD CONSTRAINT "student_packages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_packages" ADD CONSTRAINT "student_packages_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_packages" ADD CONSTRAINT "student_packages_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_interactions" ADD CONSTRAINT "marketing_interactions_registrant_id_fkey" FOREIGN KEY ("registrant_id") REFERENCES "registrants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_interactions" ADD CONSTRAINT "marketing_interactions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_flow_events" ADD CONSTRAINT "letter_flow_events_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_flow_events" ADD CONSTRAINT "letter_flow_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_flow_events" ADD CONSTRAINT "letter_flow_events_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_signing_keys" ADD CONSTRAINT "user_signing_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_signing_keys" ADD CONSTRAINT "user_signing_keys_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_signing_keys" ADD CONSTRAINT "user_signing_keys_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_key_requests" ADD CONSTRAINT "signing_key_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_key_requests" ADD CONSTRAINT "signing_key_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_signatures" ADD CONSTRAINT "letter_signatures_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_signatures" ADD CONSTRAINT "letter_signatures_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_signatures" ADD CONSTRAINT "letter_signatures_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_signed_documents" ADD CONSTRAINT "letter_signed_documents_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "letter_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_revocation_requests" ADD CONSTRAINT "letter_revocation_requests_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_revocation_requests" ADD CONSTRAINT "letter_revocation_requests_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "letter_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_revocation_requests" ADD CONSTRAINT "letter_revocation_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_revocation_requests" ADD CONSTRAINT "letter_revocation_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_numbers" ADD CONSTRAINT "agenda_numbers_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "filing_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_reviewers" ADD CONSTRAINT "letter_reviewers_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_reviewers" ADD CONSTRAINT "letter_reviewers_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_recipients" ADD CONSTRAINT "letter_recipients_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_recipients" ADD CONSTRAINT "letter_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_recipients" ADD CONSTRAINT "letter_recipients_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_attachments" ADD CONSTRAINT "letter_attachments_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_attachments" ADD CONSTRAINT "letter_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_dispatches" ADD CONSTRAINT "letter_dispatches_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_dispatches" ADD CONSTRAINT "letter_dispatches_dispatched_by_id_fkey" FOREIGN KEY ("dispatched_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositions" ADD CONSTRAINT "dispositions_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositions" ADD CONSTRAINT "dispositions_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositions" ADD CONSTRAINT "dispositions_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositions" ADD CONSTRAINT "dispositions_parent_disposition_id_fkey" FOREIGN KEY ("parent_disposition_id") REFERENCES "dispositions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_indicators" ADD CONSTRAINT "quality_indicators_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "quality_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_evidences" ADD CONSTRAINT "quality_evidences_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_evidences" ADD CONSTRAINT "quality_evidences_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "quality_indicators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_evidences" ADD CONSTRAINT "quality_evidences_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_evidences" ADD CONSTRAINT "quality_evidences_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audits" ADD CONSTRAINT "quality_audits_lead_auditor_id_fkey" FOREIGN KEY ("lead_auditor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audit_items" ADD CONSTRAINT "quality_audit_items_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "quality_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audit_items" ADD CONSTRAINT "quality_audit_items_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "quality_indicators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_audit_items" ADD CONSTRAINT "quality_audit_items_auditor_id_fkey" FOREIGN KEY ("auditor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "question_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_learning_objective_id_fkey" FOREIGN KEY ("learning_objective_id") REFERENCES "learning_objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_strategic_plan_id_fkey" FOREIGN KEY ("strategic_plan_id") REFERENCES "strategic_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_mitigations" ADD CONSTRAINT "risk_mitigations_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_mitigations" ADD CONSTRAINT "risk_mitigations_pic_id_fkey" FOREIGN KEY ("pic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_mitigations" ADD CONSTRAINT "risk_mitigations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "facility_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_columns" ADD CONSTRAINT "project_columns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "project_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "strategic_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_plans" ADD CONSTRAINT "strategic_plans_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_collaborators" ADD CONSTRAINT "plan_collaborators_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "strategic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_collaborators" ADD CONSTRAINT "plan_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_objectives" ADD CONSTRAINT "plan_objectives_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "strategic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_indicators" ADD CONSTRAINT "plan_indicators_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "plan_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_indicators" ADD CONSTRAINT "plan_indicators_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "plan_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_indicator_targets" ADD CONSTRAINT "plan_indicator_targets_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "plan_indicators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "plan_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "plan_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_pic_id_fkey" FOREIGN KEY ("pic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activity_budget_items" ADD CONSTRAINT "plan_activity_budget_items_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "plan_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_funding_sources" ADD CONSTRAINT "plan_funding_sources_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "strategic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_lead_auditor_id_fkey" FOREIGN KEY ("lead_auditor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_strategic_plan_id_fkey" FOREIGN KEY ("strategic_plan_id") REFERENCES "strategic_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_audits" ADD CONSTRAINT "internal_audits_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "internal_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_plan_objective_id_fkey" FOREIGN KEY ("plan_objective_id") REFERENCES "plan_objectives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_follow_ups" ADD CONSTRAINT "audit_follow_ups_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "audit_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_follow_ups" ADD CONSTRAINT "audit_follow_ups_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sharia_compliances" ADD CONSTRAINT "sharia_compliances_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sharia_compliances" ADD CONSTRAINT "sharia_compliances_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sharia_audits" ADD CONSTRAINT "sharia_audits_compliance_id_fkey" FOREIGN KEY ("compliance_id") REFERENCES "sharia_compliances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sharia_audits" ADD CONSTRAINT "sharia_audits_auditor_id_fkey" FOREIGN KEY ("auditor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_programs" ADD CONSTRAINT "environment_programs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_programs" ADD CONSTRAINT "environment_programs_pic_id_fkey" FOREIGN KEY ("pic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_programs" ADD CONSTRAINT "environment_programs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "higher_ed_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_management" ADD CONSTRAINT "waste_management_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_management" ADD CONSTRAINT "waste_management_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "green_campus_indicators" ADD CONSTRAINT "green_campus_indicators_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_profiles" ADD CONSTRAINT "talent_profiles_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_assessments" ADD CONSTRAINT "talent_assessments_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_assessments" ADD CONSTRAINT "talent_assessments_assessor_id_fkey" FOREIGN KEY ("assessor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "succession_plans" ADD CONSTRAINT "succession_plans_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "succession_plans" ADD CONSTRAINT "succession_plans_current_holder_id_fkey" FOREIGN KEY ("current_holder_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "succession_plans" ADD CONSTRAINT "succession_plans_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "talent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_programs" ADD CONSTRAINT "training_programs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "training_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_positions" ADD CONSTRAINT "org_positions_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_positions" ADD CONSTRAINT "org_positions_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_operating_procedures" ADD CONSTRAINT "standard_operating_procedures_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_operating_procedures" ADD CONSTRAINT "standard_operating_procedures_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_operating_procedures" ADD CONSTRAINT "standard_operating_procedures_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_revisions" ADD CONSTRAINT "sop_revisions_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "standard_operating_procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_revisions" ADD CONSTRAINT "sop_revisions_revised_by_id_fkey" FOREIGN KEY ("revised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_milestones" ADD CONSTRAINT "research_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practicum_lesson_plans" ADD CONSTRAINT "practicum_lesson_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practicum_lesson_plans" ADD CONSTRAINT "practicum_lesson_plans_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practicum_lesson_plans" ADD CONSTRAINT "practicum_lesson_plans_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practicum_schedules" ADD CONSTRAINT "practicum_schedules_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "practicum_lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practicum_schedules" ADD CONSTRAINT "practicum_schedules_target_class_id_fkey" FOREIGN KEY ("target_class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practicum_evaluations" ADD CONSTRAINT "practicum_evaluations_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "practicum_lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practicum_evaluations" ADD CONSTRAINT "practicum_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_orgs" ADD CONSTRAINT "student_orgs_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_orgs" ADD CONSTRAINT "student_orgs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_org_positions" ADD CONSTRAINT "student_org_positions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "student_orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_org_members" ADD CONSTRAINT "student_org_members_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "student_org_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_org_members" ADD CONSTRAINT "student_org_members_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_org_logbooks" ADD CONSTRAINT "student_org_logbooks_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "student_org_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_themes" ADD CONSTRAINT "research_themes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_themes" ADD CONSTRAINT "research_themes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_submissions" ADD CONSTRAINT "research_submissions_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "research_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_submissions" ADD CONSTRAINT "research_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_submissions" ADD CONSTRAINT "research_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_references" ADD CONSTRAINT "research_references_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "research_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "innovation_proposals" ADD CONSTRAINT "innovation_proposals_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "innovation_proposals" ADD CONSTRAINT "innovation_proposals_proposer_id_fkey" FOREIGN KEY ("proposer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "innovation_proposals" ADD CONSTRAINT "innovation_proposals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_certificates" ADD CONSTRAINT "course_certificates_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zis_distributions" ADD CONSTRAINT "zis_distributions_mustahik_id_fkey" FOREIGN KEY ("mustahik_id") REFERENCES "mustahik"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zis_distributions" ADD CONSTRAINT "zis_distributions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_service_orders" ADD CONSTRAINT "social_service_orders_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_service_teams" ADD CONSTRAINT "social_service_teams_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "social_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_service_teams" ADD CONSTRAINT "social_service_teams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_service_materials" ADD CONSTRAINT "social_service_materials_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "social_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_service_materials" ADD CONSTRAINT "social_service_materials_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_service_materials" ADD CONSTRAINT "social_service_materials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_programs" ADD CONSTRAINT "study_programs_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "higher_ed_courses" ADD CONSTRAINT "higher_ed_courses_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "higher_ed_course_classes" ADD CONSTRAINT "higher_ed_course_classes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "higher_ed_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "higher_ed_course_classes" ADD CONSTRAINT "higher_ed_course_classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students_higher_ed" ADD CONSTRAINT "students_higher_ed_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students_higher_ed" ADD CONSTRAINT "students_higher_ed_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "krs" ADD CONSTRAINT "krs_student_he_id_fkey" FOREIGN KEY ("student_he_id") REFERENCES "students_higher_ed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "krs" ADD CONSTRAINT "krs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "krs_course_enrollments" ADD CONSTRAINT "krs_course_enrollments_krs_id_fkey" FOREIGN KEY ("krs_id") REFERENCES "krs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "krs_course_enrollments" ADD CONSTRAINT "krs_course_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "higher_ed_course_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_criteria" ADD CONSTRAINT "scholarship_criteria_scholarship_id_fkey" FOREIGN KEY ("scholarship_id") REFERENCES "scholarships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_assessments" ADD CONSTRAINT "scholarship_assessments_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "scholarship_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_assessments" ADD CONSTRAINT "scholarship_assessments_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "scholarship_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_agreements" ADD CONSTRAINT "performance_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_agreements" ADD CONSTRAINT "performance_agreements_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_agreements" ADD CONSTRAINT "performance_agreements_supervisor_pk_id_fkey" FOREIGN KEY ("supervisor_pk_id") REFERENCES "performance_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_agreements" ADD CONSTRAINT "performance_agreements_strategic_plan_id_fkey" FOREIGN KEY ("strategic_plan_id") REFERENCES "strategic_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_indicators" ADD CONSTRAINT "pk_indicators_pk_id_fkey" FOREIGN KEY ("pk_id") REFERENCES "performance_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_indicators" ADD CONSTRAINT "pk_indicators_ref_indicator_id_fkey" FOREIGN KEY ("ref_indicator_id") REFERENCES "pk_indicators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_indicators" ADD CONSTRAINT "pk_indicators_ref_strategic_indicator_id_fkey" FOREIGN KEY ("ref_strategic_indicator_id") REFERENCES "plan_indicators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_evaluations" ADD CONSTRAINT "pk_evaluations_pk_id_fkey" FOREIGN KEY ("pk_id") REFERENCES "performance_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_indicator_evaluations" ADD CONSTRAINT "pk_indicator_evaluations_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "pk_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_indicator_evaluations" ADD CONSTRAINT "pk_indicator_evaluations_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "pk_indicators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_behavior_evaluations" ADD CONSTRAINT "pk_behavior_evaluations_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "pk_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pk_behavior_evaluations" ADD CONSTRAINT "pk_behavior_evaluations_behavior_value_id_fkey" FOREIGN KEY ("behavior_value_id") REFERENCES "behavioral_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Objek yang TIDAK dimodelkan Prisma, jadi tidak ikut terbawa oleh
-- `migrate diff --from-empty`. Ia harus ditulis tangan di sini, atau basis
-- data yang dibangun dari baseline ini akan kehilangan aturannya diam-diam.
--
-- Aslinya dari 20260722110000_yayasan_organ_exclusivity: satu orang tidak boleh
-- menjabat di dua organ yayasan (Pembina / Pengawas / Pengurus) sekaligus.
-- Itu aturan tata kelola, bukan detail teknis — ditegakkan di basis data supaya
-- tidak bisa dilangkahi lewat jalur mana pun.
-- ---------------------------------------------------------------------------

-- A yayasan's three organs are mutually exclusive.
--
-- UU No. 16/2001 jo. UU No. 28/2004 Pasal 29: "Anggota Pembina tidak boleh
-- merangkap sebagai anggota Pengurus dan/atau anggota Pengawas." The
-- separation is the point of the structure: the organ that appoints cannot
-- also be the organ that executes, nor the one that audits.
--
-- The API enforces this too (utils/role-eligibility.ts), and that is where a
-- person doing data entry gets a readable message. This trigger exists because
-- bulk imports, restores and manual SQL repairs never pass through application
-- code — which is exactly how the current violation arrived: the seed gave
-- ketua@cipansor.or.id both YAYASAN_KETUA and YAYASAN_PEMBINA.
--
-- A trigger rather than a unique index: the rule is "at most one organ per
-- user", which depends on a join to `roles`, and an index predicate cannot
-- reach another table. Holding two roles *within* one organ stays allowed — a
-- small yayasan may have one person as both ketua and bendahara.

CREATE OR REPLACE FUNCTION assert_yayasan_organ_exclusive()
RETURNS TRIGGER AS $$
DECLARE
  incoming_organ text;
  conflicting_organ text;
BEGIN
  SELECT CASE
           WHEN r.code = 'YAYASAN_PEMBINA' THEN 'PEMBINA'
           WHEN r.code = 'YAYASAN_PENGAWAS' THEN 'PENGAWAS'
           WHEN r.code IN ('YAYASAN_KETUA', 'YAYASAN_SEKRETARIS',
                           'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA') THEN 'PENGURUS'
         END
    INTO incoming_organ
    FROM roles r
   WHERE r.id = NEW.role_id;

  -- Not a yayasan organ role, or the assignment is inactive: nothing to check.
  IF incoming_organ IS NULL OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT CASE
           WHEN r.code = 'YAYASAN_PEMBINA' THEN 'PEMBINA'
           WHEN r.code = 'YAYASAN_PENGAWAS' THEN 'PENGAWAS'
           ELSE 'PENGURUS'
         END
    INTO conflicting_organ
    FROM user_role_assignments ura
    JOIN roles r ON r.id = ura.role_id
   WHERE ura.user_id = NEW.user_id
     AND ura.id <> NEW.id
     AND ura.is_active
     AND r.code IN ('YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'YAYASAN_KETUA',
                    'YAYASAN_SEKRETARIS', 'YAYASAN_BENDAHARA', 'YAYASAN_ANGGOTA')
     AND CASE
           WHEN r.code = 'YAYASAN_PEMBINA' THEN 'PEMBINA'
           WHEN r.code = 'YAYASAN_PENGAWAS' THEN 'PENGAWAS'
           ELSE 'PENGURUS'
         END <> incoming_organ
   LIMIT 1;

  IF conflicting_organ IS NOT NULL THEN
    RAISE EXCEPTION
      'Yayasan organ conflict: % cannot also be % (UU 16/2001 Pasal 29)',
      incoming_organ, conflicting_organ
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yayasan_organ_exclusive ON user_role_assignments;

CREATE TRIGGER trg_yayasan_organ_exclusive
  BEFORE INSERT OR UPDATE ON user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION assert_yayasan_organ_exclusive();
