/**
 * Whistleblowing System (WBS) & Board Suspension contracts.
 *
 * Single source for the values both apps must agree on. They were previously
 * spelled out three times — the API's Zod schema, the public submission page's
 * `<SelectItem value=…>` list, and the handler UI — so a category could be
 * added on the API and silently never become selectable, or the reverse.
 *
 * The database enums (`WbsCategory`, `WbsTargetLevel`, `WbsStatus` in
 * `schema.prisma`) remain the source of truth for storage; the literal lists
 * here must stay in step with them, and `pengawasan.validation.ts` asserts that
 * by building its Zod schemas from these same arrays.
 */

import {
  ADMIN_ROLE_CODES,
  PESANTREN_LEADER_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
} from "../roles";

export const WBS_CATEGORIES = [
  "KEUANGAN_ASET",
  "SOP_TATA_KELOLA",
  "ETIKA_PERILAKU",
  "PELAYANAN_AKADEMIK_PENGASUHAN",
  "LAINNYA",
] as const;

export type WbsCategoryCode = (typeof WBS_CATEGORIES)[number];

export const WBS_CATEGORY_LABELS: Record<WbsCategoryCode, string> = {
  KEUANGAN_ASET:
    "Keuangan & Aset (Penyalahgunaan Anggaran, Pungli, Penggelapan)",
  SOP_TATA_KELOLA:
    "SOP & Tata Kelola (Pelanggaran Prosedur, Penyalahgunaan Wewenang)",
  ETIKA_PERILAKU:
    "Etika, Kesusilaan & Perilaku (Pelecehan, Perundungan/Bullying)",
  PELAYANAN_AKADEMIK_PENGASUHAN:
    "Pelayanan Akademik & Pengasuhan (Keluhan Layanan, Keasramaan)",
  LAINNYA: "Lain-lain",
};

export const WBS_TARGET_LEVELS = [
  "PENGURUS_YAYASAN",
  "PENGAWAS_YAYASAN",
  "KEPALA_UNIT",
  "STAF_PEGAWAI",
  "SISWA_SANTRI",
] as const;

export type WbsTargetLevelCode = (typeof WBS_TARGET_LEVELS)[number];

export const WBS_TARGET_LEVEL_LABELS: Record<WbsTargetLevelCode, string> = {
  PENGURUS_YAYASAN: "Pengurus Yayasan (Ditangani Pengawas, CC Pembina)",
  PENGAWAS_YAYASAN: "Pengawas Yayasan (Ditangani Pembina)",
  KEPALA_UNIT:
    "Kepala Unit Organisasi / Kepsek / Pengasuh (Ditangani Pengurus, CC Pengawas)",
  STAF_PEGAWAI:
    "Staf / Guru / Pegawai Unit (Ditangani Kepsek/Kepala Unit, CC Pengurus & Pengawas)",
  SISWA_SANTRI:
    "Siswa / Santri / Murid (Ditangani Kepala Unit/BK, CC Pengurus & Pengawas)",
};

export const WBS_STATUSES = [
  "DIAJUKAN",
  "DALAM_PENYELIDIKAN",
  "DITINDAKLANJUTI",
  "SELESAI",
  "TIDAK_DAPAT_DITINDAKLANJUTI",
] as const;

export type WbsStatusCode = (typeof WBS_STATUSES)[number];

/**
 * The only roles a *Pelaksana Harian / Pelaksana Tugas* (Plh/Plt) delegation
 * may carry.
 *
 * `suspendBoardMember` used to accept whatever `plhRoleCode` the caller sent
 * and mint a `UserRoleAssignment` for it, so a Pengawas — whose whole job is
 * to audit the Pengurus — could issue `plhRoleCode: "SUPER_ADMIN"` and promote
 * an accomplice past the very oversight that suspended the incumbent. A Plh
 * stands in for a Pengurus organ, nothing else: not the Pembina that appoints
 * it, not the Pengawas that audits it, and certainly not the system
 * administrator. Kept in shared so the API's Zod schema, the service guard and
 * the web form cannot disagree about which codes are legal.
 */
export const PLH_ROLE_CODES = [
  "YAYASAN_KETUA",
  "YAYASAN_SEKRETARIS",
  "YAYASAN_BENDAHARA",
  "YAYASAN_ANGGOTA",
] as const;

export type PlhRoleCode = (typeof PLH_ROLE_CODES)[number];

/**
 * The roles a WBS report may be forwarded to.
 *
 * `forwardReport` used to accept any string for `toRole` and write it straight
 * into `WbsReport.primaryHandlerRole`. A one-letter typo — or a legacy name like
 * `primaryHandlerRole` sent in its place — then moved the report into a queue
 * that no role's scope query ever matches, and the report simply disappeared
 * from every handler's list. Each value here is a role (or the `UNIT_ADMIN`
 * bucket the unit-level branch resolves) whose scope query can actually match
 * the report it is handed. Kept in shared so the API validates and the web form
 * offers the same closed set.
 */
export const WBS_FORWARD_ROLE_CODES = [
  "YAYASAN_PEMBINA",
  "YAYASAN_PENGAWAS",
  "YAYASAN_KETUA",
  "UNIT_ADMIN",
] as const;

export type WbsForwardRoleCode = (typeof WBS_FORWARD_ROLE_CODES)[number];

/**
 * The effective role codes a forward target must hold, per destination bucket.
 *
 * `forwardReport` accepted a `toUserId` without checking it against `toRole`,
 * and `buildScopeWhere` then grants the `assignedUserId` read access
 * unconditionally — so naming any user as the assignee handed them the report
 * regardless of their role or unit. Each bucket now resolves to the concrete
 * role codes that legitimately sit in it: a foundation destination requires the
 * matching governance role, and `UNIT_ADMIN` is the unit-level bucket of school
 * administrators and heads (unit leadership, never foundation governance and
 * never the system administrator).
 */
export const WBS_FORWARD_ROLE_ALLOWED_ROLE_CODES: Record<
  WbsForwardRoleCode,
  readonly string[]
> = {
  YAYASAN_PEMBINA: ["YAYASAN_PEMBINA"],
  YAYASAN_PENGAWAS: ["YAYASAN_PENGAWAS"],
  YAYASAN_KETUA: ["YAYASAN_KETUA"],
  UNIT_ADMIN: [
    ...ADMIN_ROLE_CODES.filter((code) => code !== "SUPER_ADMIN"),
    ...PRINCIPAL_ROLE_CODES,
    ...PESANTREN_LEADER_ROLE_CODES,
  ],
};

/** True when `roleCode` may receive a report forwarded to `bucket`. */
export function isWbsForwardRecipientRole(
  bucket: WbsForwardRoleCode,
  roleCode: string,
): boolean {
  return (
    WBS_FORWARD_ROLE_ALLOWED_ROLE_CODES[bucket] as readonly string[]
  ).includes(roleCode);
}

// ---------------------------------------------------------------------------
// Response contracts
//
// The web hooks used to read these payloads through `any`, so a field renamed
// on the API broke a page silently at runtime instead of at build time. These
// mirror what the controllers actually return; keep them in step when a
// response shape changes.
// ---------------------------------------------------------------------------

export interface WbsCommentDto {
  id: string;
  senderType: string;
  senderName: string | null;
  message: string;
  attachments?: string[] | null;
  createdAt: string;
}

export interface WbsForwardLogDto {
  id: string;
  fromRole: string;
  toRole: string;
  reason: string | null;
  createdAt: string;
}

export interface WbsReportDto {
  id: string;
  ticketCode: string;
  category: string;
  targetLevel: string;
  targetName?: string | null;
  unitId?: string | null;
  unit?: { id: string; name: string } | null;
  subject: string;
  description: string;
  status: string;
  resolution?: string | null;
  primaryHandlerRole: string;
  assignedUserId?: string | null;
  assignedUser?: { id: string; name: string; email: string } | null;
  isAnonymous?: boolean;
  reporterName?: string | null;
  reporterContact?: string | null;
  createdAt: string;
  updatedAt: string;
  comments?: WbsCommentDto[];
  forwardLogs?: WbsForwardLogDto[];
}

/**
 * A finding as the audit list/detail returns it.
 *
 * The list projection selects only `id`, `severity`, `title`; the detail
 * include carries the responsible user and follow-ups. Optional fields model
 * the narrower projection so one type serves both without lying about what is
 * always present.
 */
export interface AuditFindingDto {
  id: string;
  findingNumber?: string;
  title: string;
  description?: string;
  severity: string;
  category?: string;
  recommendation?: string | null;
  dueDate?: string | null;
  responsible?: { id: string; name: string } | null;
  followUps?: AuditFollowUpDto[];
  createdAt?: string;
}

/** A follow-up on an audit finding. */
export interface AuditFollowUpDto {
  id: string;
  action?: string;
  status: string;
  dueDate?: string | null;
  verifiedBy?: { id: string; name: string } | null;
  createdAt?: string;
}

/**
 * An internal audit as returned by `getAudits` / `getAuditById`.
 *
 * The page previously read every audit through `any`, so a renamed API field
 * only surfaced as a blank cell at runtime. `findings` is present on both
 * projections but with different widths, hence the optional finding fields.
 */
export interface InternalAuditDto {
  id: string;
  unitId: string;
  title: string;
  description?: string | null;
  auditType: string;
  status: string;
  plannedDate: string;
  executedDate?: string | null;
  completedDate?: string | null;
  leadAuditorId?: string;
  scope?: string | null;
  methodology?: string | null;
  conclusion?: string | null;
  createdAt?: string;
  updatedAt?: string;
  unit?: { id: string; name: string } | null;
  leadAuditor?: { id: string; name: string } | null;
  strategicPlan?: { id: string; title: string } | null;
  risk?: {
    id: string;
    code: string;
    category: string;
    riskLevel?: string;
  } | null;
  findings?: AuditFindingDto[];
}

/** Public tracking payload — handler identities are anonymized before it is returned. */
export interface WbsTrackingDto {
  ticketCode: string;
  category: string;
  targetLevel: string;
  targetName?: string | null;
  unitName: string;
  subject: string;
  description: string;
  status: string;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
  comments: WbsCommentDto[];
  forwardTimeline: WbsForwardLogDto[];
}

export interface WbsPublicSubmissionResultDto {
  ticketCode: string;
  trackingToken: string;
  category: string;
  targetLevel: string;
  status: string;
  createdAt: string;
}

export interface BoardSuspensionDto {
  id: string;
  userId: string;
  skNumber: string;
  auditReason: string;
  documentUrl?: string | null;
  startDate: string;
  projectedEndDate?: string | null;
  status: string;
  suspendedById: string;
  plhUserId?: string | null;
  plhRoleCode?: string | null;
  liftedAt?: string | null;
  liftedById?: string | null;
  liftReason?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role?: string | null;
  } | null;
  suspendedBy?: { id: string; name: string } | null;
  plhUser?: { id: string; name: string; email: string } | null;
  liftedBy?: { id: string; name: string } | null;
}

export interface FinancialArrearsUnitDto {
  unitId: string;
  unitName: string;
  totalUnpaid: number;
  count: number;
  overdueCount: number;
}

export interface FinancialArrearsStudentDto {
  studentId: string;
  studentName: string;
  nis: string;
  unitName: string;
  totalUnpaid: number;
  invoiceCount: number;
}

export interface FinancialArrearsDto {
  summary: {
    totalUnpaidAmount: number;
    totalUnpaidInvoicesCount: number;
    overdueInvoicesCount: number;
  };
  unitBreakdown: FinancialArrearsUnitDto[];
  topArrearsStudents: FinancialArrearsStudentDto[];
}

/**
 * A selectable account in the suspension / Plh pickers.
 *
 * The form used to ask the operator to paste a raw UUID for both the Pengurus
 * being suspended and the Plh replacing them — a workflow that could not be
 * completed without a database query, and that made a mistyped ID look like a
 * valid submission until the API rejected it. The pickers are fed by scoped
 * endpoints instead: only accounts that can legally hold the role are listed,
 * and the chosen `id` is what the form submits. The server still validates.
 */
export interface PengawasanCandidateDto {
  id: string;
  name: string;
  email: string;
  roleCodes: string[];
  unit: { id: string; name: string } | null;
}

/**
 * Result of filing a periodic oversight report. `status` is always `DRAFT` and
 * `letterNumber` is null: the action creates the letter in the E-Office draft
 * workflow, and the number is issued when it is actually sent.
 */
export interface PeriodicReportDraftResultDto {
  letterId: string;
  letterNumber: string | null;
  title: string;
  status: string;
  contentPreview: string;
}
