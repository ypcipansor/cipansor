import { z } from "zod";
import {
  ADMIN_ROLE_CODES,
  PARENT_ROLE_CODES,
  PESANTREN_EDUCATOR_ROLE_CODES,
  PESANTREN_LEADER_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  SCHOOL_TEACHER_ROLE_CODES,
  TATA_USAHA_ROLE_CODES,
  VICE_PRINCIPAL_ROLE_CODES,
} from "../roles";

/**
 * Perizinan — a learner's leave: going home (pulang), stepping out for a few
 * hours (keluar), sick leave. One contract for the API and the web.
 *
 * Until 2026-09-25 the two sides had never agreed: the web sent `permitType`
 * with SICK/FAMILY/EMERGENCY/EVENT, the API expected `type` with the Prisma
 * enum; the web called approve/reject/return routes the API did not have and
 * read `student.name` from a response that carries `student.user.name`. The
 * values below are the Prisma enums (`PermitType`, `PermitStatus`);
 * `modules/permits/tests/permits-contract.test.ts` in the API fails if they
 * drift.
 */
export const PERMIT_TYPE_VALUES = [
  "PULANG",
  "KELUAR",
  "SAKIT",
  "KELUARGA",
  "OTHER",
] as const;
export type PermitType = (typeof PERMIT_TYPE_VALUES)[number];

/**
 * PENDING → APPROVED | REJECTED | CANCELLED; APPROVED → (departs) → COMPLETED
 * when the learner returns. See `permits.service.ts` for who moves it.
 */
export const PERMIT_STATUS_VALUES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type PermitStatus = (typeof PERMIT_STATUS_VALUES)[number];

/**
 * Who works with permits. The API's route guards and the web's buttons both
 * read these lists, so a button is shown exactly when its request is allowed.
 * Which *rows* each account sees is decided separately, by `studentScope` in
 * the API (a wali: their own children; staff: their unit; boarding and
 * cross-unit staff: every unit).
 *
 * Staff who deal with learners day to day read permits, file them on a
 * learner's behalf and record departure and return at the gate. Treasurers,
 * the library, the laboratory, the business units and the yayasan organs have
 * no part in a learner's leave and are left out.
 */
export const PERMIT_STAFF_ROLE_CODES: readonly string[] = [
  ...ADMIN_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...VICE_PRINCIPAL_ROLE_CODES,
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...TATA_USAHA_ROLE_CODES,
  "KEAMANAN",
  "PERAWAT",
];

/** A wali files leave for their own child. */
export const PERMIT_REQUESTER_ROLE_CODES: readonly string[] = [
  ...PERMIT_STAFF_ROLE_CODES,
  ...PARENT_ROLE_CODES,
];

/**
 * Who decides a learner's leave — decided 2026-09-25, after the first version
 * put it with the kepala sekolah and the unit admin.
 *
 * The learner's own mentor decides: for a boarder (an active kamar), the
 * musyrif assigned to that kamar or its asrama; otherwise the wali kelas of
 * their class. That is the practice of pesantren (musyrif / pengasuhan),
 * boarding schools (the housemaster, with parental consent) and day schools
 * (the wali kelas). The wali's own request is the parent's consent; the wali
 * does not decide, because the institution holds the child's care while they
 * are in it.
 *
 * The unit head — the kepala sekolah of the learner's unit, and for a boarder
 * or a Takhosus santri the Pimpinan Pesantren — decides leave longer than
 * `PERMIT_HEAD_AFTER_DAYS`, decides when no mentor is on record, and may take
 * a pending permit over (recorded as such). Admins do not decide: they run the
 * system, they do not look after the child.
 *
 * These lists are only the route guard. Whether *this* caller decides *this*
 * permit is `permit.decision.canDecide`, worked out by the API per permit.
 */
export const PERMIT_MENTOR_ROLE_CODES: readonly string[] = [
  ...SCHOOL_TEACHER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
];

export const PERMIT_HEAD_ROLE_CODES: readonly string[] = [
  ...PRINCIPAL_ROLE_CODES,
  ...PESANTREN_LEADER_ROLE_CODES,
];

export const PERMIT_DECIDER_ROLE_CODES: readonly string[] = [
  ...PERMIT_MENTOR_ROLE_CODES,
  ...PERMIT_HEAD_ROLE_CODES,
];

/**
 * Leave covering more calendar days than this goes to the unit head. A week,
 * after the day-school practice of asking the kepala sekolah for more than a
 * week (tata tertib SMA 1 Sukawati); the yayasan may set another number.
 */
export const PERMIT_HEAD_AFTER_DAYS = 7;

/** The capacity a permit was decided in — the Prisma enum `PermitDecider`. */
export const PERMIT_DECIDER_VALUES = [
  "MUSYRIF",
  "WALI_KELAS",
  "KEPALA_SEKOLAH",
  "PIMPINAN_PESANTREN",
] as const;
export type PermitDecider = (typeof PERMIT_DECIDER_VALUES)[number];

/**
 * Where a pending permit goes: to the learner's mentor, or to the unit head
 * because it is long (`LONG`) or because no mentor is on record (`NO_MENTOR`).
 */
export const PERMIT_ROUTE_VALUES = ["MENTOR", "LONG", "NO_MENTOR"] as const;
export type PermitRoute = (typeof PERMIT_ROUTE_VALUES)[number];

/** A date-time with offset (`2026-09-26T13:00:00+07:00`) or a calendar date. */
const moment = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

const permitFields = {
  type: z.enum(PERMIT_TYPE_VALUES),
  reason: z.string().trim().min(10, "Alasan minimal 10 karakter").max(1000),
  destination: z.string().trim().max(200).optional(),
  startDate: moment,
  endDate: moment,
};

const endAfterStart = (d: { startDate?: string; endDate?: string }) =>
  !d.startDate || !d.endDate || new Date(d.endDate) > new Date(d.startDate);
const endAfterStartIssue = {
  message: "Waktu kembali harus sesudah waktu berangkat",
  path: ["endDate"],
};

export const createPermitSchema = z
  .object({ studentId: z.uuid(), ...permitFields })
  .refine(endAfterStart, endAfterStartIssue);

/** Editable only while PENDING; the learner cannot change. */
export const updatePermitSchema = z
  .object(permitFields)
  .partial()
  .refine(endAfterStart, endAfterStartIssue);

export const rejectPermitSchema = z.object({
  rejectionNote: z
    .string()
    .trim()
    .min(3, "Alasan penolakan wajib diisi")
    .max(500),
});

export const returnPermitSchema = z
  .object({
    /** When the learner came back, if it is recorded after the fact. */
    returnedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .default({});

export const listPermitsQuerySchema = z.object({
  studentId: z.uuid().optional(),
  type: z.enum(PERMIT_TYPE_VALUES).optional(),
  status: z.enum(PERMIT_STATUS_VALUES).optional(),
  /** Only learners who left through the gate and have not come back. */
  outside: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Only pending permits that are the caller's own to decide. */
  awaitingMe: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreatePermitInput = z.infer<typeof createPermitSchema>;
export type UpdatePermitInput = z.infer<typeof updatePermitSchema>;
export type RejectPermitInput = z.infer<typeof rejectPermitSchema>;
export type ReturnPermitInput = z.infer<typeof returnPermitSchema>;
export type ListPermitsQuery = z.input<typeof listPermitsQuerySchema>;

/** A permit as the API sends it. Dates are ISO strings on the wire. */
export interface Permit {
  id: string;
  code: string | null;
  studentId: string;
  type: PermitType;
  reason: string;
  destination: string | null;
  startDate: string;
  endDate: string;
  status: PermitStatus;
  approvedAt: string | null;
  rejectionNote: string | null;
  departedAt: string | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    nis: string;
    /** Shown at the gate to recognise the learner. */
    photoUrl: string | null;
    unit: { id: string; name: string };
    user: { id: string; name: string };
  };
  /** Who approved or rejected it. */
  approvedBy: { id: string; name: string } | null;
  /** In what capacity they did; null for permits decided before 2026-09-26. */
  decidedAs: PermitDecider | null;
  /** A unit head decided what was the mentor's to decide. */
  tookOver: boolean;
  /** Who decides it, worked out for the learner and the caller. */
  decision: PermitDecision;
}

/**
 * Who decides a permit, as of now. The mentors are the learner's musyrif (a
 * boarder) or wali kelas (otherwise), whoever is on record today.
 */
export interface PermitDecision {
  route: PermitRoute;
  /** Which kind of mentor the learner has: a boarder's is the musyrif. */
  mentorKind: "MUSYRIF" | "WALI_KELAS";
  mentors: { id: string; name: string }[];
  /** The caller may approve or reject it now. */
  canDecide: boolean;
  /** …and would be doing so as a unit head over the mentor. */
  asTakeover: boolean;
}

/** GET /permits/summary — counts over the permits the caller may see. */
export interface PermitSummary {
  /** Waiting for a decision. */
  pending: number;
  /** Of those, the ones that are the caller's own to decide (not a takeover). */
  awaitingMe: number;
  /** Approved, still valid, not yet through the gate. */
  approved: number;
  /** Through the gate and not back. */
  outside: number;
  /** Outside past their return time. */
  overdue: number;
}

/** The shape `ApiResponse.paginated()` sends. */
export interface PageResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
