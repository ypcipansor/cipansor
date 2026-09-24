/**
 * HR employee-directory contracts shared by the API (`apps/api`) and the web
 * client (`apps/web`).
 *
 * There is no standalone `Employee` table: an employee is a `User` that has a
 * `Teacher` or `Staff` profile (the same split the DB uses). The API flattens
 * both profiles into this one DTO so the web list/detail pages describe a
 * teacher and a tendik with a single shape, and neither side can drift.
 */

export type HrEmployeeRole = "TEACHER" | "STAFF";
export type HrEmployeeStatus =
  "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "RESIGNED" | "RETIRED";
export type HrEmployeeType = "PERMANENT" | "CONTRACT" | "PART_TIME" | "INTERN";
export type HrEmployeeGender = "MALE" | "FEMALE";

/** One row of `GET /hr/employees` and the payload of `GET /hr/employees/:id`. */
export interface HrEmployee {
  /** The `User.id` — the identifier the detail route and document routes take. */
  id: string;
  nip: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  unitId: string;
  unit: {
    id: string;
    name: string;
  };
  departmentId?: string;
  department?: {
    id: string;
    name: string;
  };

  // Personal info. Nullable fields are the ones the database genuinely leaves
  // empty (a Staff profile has no gender, for instance) — the API reports that
  // honestly rather than inventing a value.
  fullName: string;
  gender: HrEmployeeGender | null;
  birthPlace: string | null;
  birthDate: string | null;
  nationalId?: string;
  /**
   * Sensitive identity/bank fields are only present when the caller may see
   * them (the person themselves, a personnel administrator for their unit, or
   * a foundation role). For anyone else the field is omitted entirely rather
   * than sent empty — an absent key cannot leak a value that a later refactor
   * forgets to mask.
   */
  nik?: string | null;
  taxId?: string;
  npwp?: string;
  maritalStatus: string | null;
  religion: string | null;

  // Contact
  phone: string | null;
  email: string;
  address: string | null;

  // Employment
  role: HrEmployeeRole;
  position: string;
  employeeType: HrEmployeeType;
  status: HrEmployeeStatus;
  joinDate: string;
  endDate?: string;
  resignDate?: string;

  // Education
  lastEducation: string | null;
  educationMajor: string | null;
  educationInstitution: string | null;
  graduationYear: number | null;

  // Bank info — omitted for callers who may not read personnel data (see nik).
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;

  // Insurance
  bpjsKesehatan?: string;
  bpjsKetenagakerjaan?: string;

  // Leave
  leaveBalance?: number;

  createdAt: string;
  updatedAt: string;
}

/** Paginated envelope of `GET /hr/employees`. */
export interface HrEmployeeListResult {
  data: HrEmployee[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * `EmployeeDocumentType` mirrors the DB enum of the same name.
 *
 * Values must stay in exact sync with the Prisma enum. It is repeated here
 * rather than imported from `@prisma/client` because this package must stay
 * free of Prisma/Node imports so the web bundle can consume it; the backend
 * still validates against the Prisma enum at the edge.
 */
export type EmployeeDocumentType =
  | "KTP"
  | "KK"
  | "NPWP"
  | "IJAZAH"
  | "TRANSKRIP_NILAI"
  | "SERTIFIKAT"
  | "SK_PENGANGKATAN"
  | "KONTRAK_KERJA"
  | "CV"
  | "LAINNYA";

/** A stored employee document, as returned by the HR document endpoints. */
export interface EmployeeDocument {
  id: string;
  userId: string;
  name: string;
  type: EmployeeDocumentType;
  fileUrl: string;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body of `POST /hr/documents`.
 *
 * The API module imports the Zod schema (`createEmployeeDocumentSchema`) rather
 * than redeclaring it, so the web form and the API parse the same fields
 * (golden rule #8).
 */
export interface CreateEmployeeDocumentInput {
  userId: string;
  name: string;
  type: EmployeeDocumentType;
  fileUrl: string;
  expiryDate?: string;
  notes?: string;
}
