// User Roles
export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  UNIT_ADMIN = "UNIT_ADMIN",
  TEACHER = "TEACHER",
  STUDENT = "STUDENT",
  PARENT = "PARENT",
  STAFF = "STAFF",
  YAYASAN_PENGAWAS = "YAYASAN_PENGAWAS",
}

// Unit Types
export enum UnitType {
  PESANTREN = "PESANTREN",
  PAUD = "PAUD",
  SD_IT = "SD_IT",
  SMP_IT = "SMP_IT",
  SMA_QURAN = "SMA_QURAN",
  TK_QURAN = "TK_QURAN",
  OTHER = "OTHER",
}

// Gender
export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
}

// Semester
export enum Semester {
  ODD = "ODD",
  EVEN = "EVEN",
}

// Day of Week
export enum DayOfWeek {
  MONDAY = "MONDAY",
  TUESDAY = "TUESDAY",
  WEDNESDAY = "WEDNESDAY",
  THURSDAY = "THURSDAY",
  FRIDAY = "FRIDAY",
  SATURDAY = "SATURDAY",
  SUNDAY = "SUNDAY",
}

/**
 * `Date.getDay()` index (0 = Sunday) to the enum the API expects.
 *
 * The API's schedule filter takes the enum name; passing the raw number is a
 * 400. Both the student and teacher "Jadwal Hari Ini" widgets did exactly
 * that, so neither ever showed a lesson. Convert here, once.
 */
export const DAY_OF_WEEK_BY_INDEX: readonly DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

// Attendance Status
export enum AttendanceStatus {
  PRESENT = "PRESENT",
  ABSENT = "ABSENT",
  LATE = "LATE",
  SICK = "SICK",
  EXCUSED = "EXCUSED",
}

// Memorization Quality
export enum MemorizationQuality {
  LANCAR = "LANCAR",
  KURANG_LANCAR = "KURANG_LANCAR",
  ULANG = "ULANG",
}

// Book Status
export enum BookStatus {
  AVAILABLE = "AVAILABLE",
  BORROWED = "BORROWED",
  RESERVED = "RESERVED",
  MAINTENANCE = "MAINTENANCE",
  LOST = "LOST",
}

// Borrowing Status
export enum BorrowingStatus {
  ACTIVE = "ACTIVE",
  RETURNED = "RETURNED",
  OVERDUE = "OVERDUE",
  LOST = "LOST",
}

// Enrollment Status
export enum EnrollmentStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  TRANSFERRED = "transferred",
  DROPPED = "dropped",
}

// Complaint Category
export enum ComplaintCategory {
  ACADEMIC = "ACADEMIC",
  FACILITY = "FACILITY",
  SERVICE = "SERVICE",
  BULLYING = "BULLYING",
  FINANCE = "FINANCE",
  OTHER = "OTHER",
}

// Complaint Status
export enum ComplaintStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  REJECTED = "REJECTED",
}

// Sharia Categories
export const SHARIA_CATEGORIES = [
  "MUAMALAH",
  "TARBIYAH",
  "IBADAH",
  "AKHLAQ",
  "GOVERNANCE",
] as const;

export type ShariaCategory = (typeof SHARIA_CATEGORIES)[number];

// BSC Perspectives
export enum BSCPerspective {
  FINANCIAL = "FINANCIAL",
  CUSTOMER = "CUSTOMER",
  PROCESS = "PROCESS",
  LEARNING = "LEARNING",
}

// Talent Categories
export enum TalentCategory {
  HIGH_POTENTIAL = "HIGH_POTENTIAL",
  KEY_TALENT = "KEY_TALENT",
  EMERGING = "EMERGING",
  SOLID_PERFORMER = "SOLID_PERFORMER",
  NEEDS_DEVELOPMENT = "NEEDS_DEVELOPMENT",
}
