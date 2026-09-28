import { z } from "zod";
import {
  ADMIN_ROLE_CODES,
  GOVERNANCE_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
} from "../roles";

/**
 * A unit's accreditation as its certificate states it (decided 2026-09-28,
 * decisions/akreditasi-unit.md). One record per certificate — BAN-PDM (now
 * BSANP) grants five years and sometimes extends a certificate without a new
 * rating — copied from it by the unit's admin or the Super Admin, with the PDF
 * as the proof. The unit's accreditation now is its latest certificate still
 * in force; the public site, the EMIS and Dapodik exports and the SKHUN all
 * read that one.
 *
 * The readiness self-assessment (Yayasan → Akreditasi) is not accreditation
 * and never writes here.
 */

export const ACCREDITATION_RATINGS = ["A", "B", "C"] as const;
export type AccreditationRating = (typeof ACCREDITATION_RATINGS)[number];

/** The unit's admin (their own unit) and the Super Admin keep the record. */
export const ACCREDITATION_WRITER_ROLE_CODES: readonly string[] =
  ADMIN_ROLE_CODES;

/** …and the unit's kepala sekolah and the yayasan's organs read it. */
export const ACCREDITATION_READER_ROLE_CODES: readonly string[] = [
  ...ADMIN_ROLE_CODES,
  ...PRINCIPAL_ROLE_CODES,
  ...GOVERNANCE_ROLE_CODES,
];

/** The kepala and the admin of the unit are told this long before it runs out. */
export const ACCREDITATION_REMINDER_MONTHS = 12;

/** The certificate PDF: BAN-PDM's are about half a megabyte. */
/** Where anyone checks a school's rating by its NPSN (BAN-PDM's public data). */
export const BAN_PDM_LOOKUP_URL = "https://ban-pdm.id/data-akreditasi-sekolah";

export const ACCREDITATION_PDF_MAX_BYTES = 5 * 1024 * 1024;

const day = z.iso.date({ message: "Tanggal tidak valid" });

const accreditationFields = {
  rating: z.enum(ACCREDITATION_RATINGS, { message: "Pilih peringkat" }),
  certificateNumber: z
    .string()
    .trim()
    .min(3, "Nomor sertifikat wajib diisi")
    .max(100),
  decreeNumber: z.string().trim().min(3, "Nomor SK wajib diisi").max(100),
  decreedAt: day,
  validUntil: day,
  issuer: z.string().trim().min(2).max(100).optional(),
};

const validAfterDecree = (d: { decreedAt?: string; validUntil?: string }) =>
  !d.decreedAt || !d.validUntil || d.validUntil > d.decreedAt;
const validAfterDecreeIssue = {
  message: "Tanggal berlaku harus sesudah tanggal SK",
  path: ["validUntil"],
};

/**
 * POST /units/:id/accreditations — sent as multipart form data with the PDF
 * in `certificate`; these are its text fields.
 */
export const createAccreditationSchema = z
  .object(accreditationFields)
  .refine(validAfterDecree, validAfterDecreeIssue);

/** PATCH /units/:id/accreditations/:accreditationId — a correction; the PDF may be replaced. */
export const updateAccreditationSchema = z
  .object(accreditationFields)
  .partial()
  .refine(validAfterDecree, validAfterDecreeIssue);

export type CreateAccreditationInput = z.infer<
  typeof createAccreditationSchema
>;
export type UpdateAccreditationInput = z.infer<
  typeof updateAccreditationSchema
>;

/** A certificate as the portal shows it; the PDF is fetched on its own. */
export interface UnitAccreditation {
  id: string;
  unitId: string;
  rating: AccreditationRating;
  certificateNumber: string;
  decreeNumber: string;
  /** Calendar days, yyyy-MM-dd. */
  decreedAt: string;
  validUntil: string;
  issuer: string;
  /** SHA-256 of the stored PDF, to tell a copy from another. */
  certificateSha256: string;
  /** In force today, and the unit's latest such certificate. */
  current: boolean;
  recordedBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

/** GET /units/:id/accreditations — newest certificate first. */
export interface UnitAccreditationList {
  unit: { id: string; name: string; npsn: string | null };
  /** Whether the caller may record, correct or delete. */
  canWrite: boolean;
  accreditations: UnitAccreditation[];
}

/**
 * GET /units/public/accreditations — what the public site states: each unit's
 * certificate in force and the unit's NPSN (decisions/akreditasi-unit.md).
 * Never a certificate that has run out, never who recorded it; a unit with
 * none in force is absent, not "belum".
 */
export interface PublicAccreditation {
  /** The record's id; the PDF is at `/units/public/accreditations/{id}/certificate`. */
  id: string;
  /** The unit's `UnitType`, which the public site's unit config carries too. */
  unitType: string;
  unitName: string;
  npsn: string | null;
  rating: AccreditationRating;
  certificateNumber: string;
  decreeNumber: string;
  /** yyyy-MM-dd */
  decreedAt: string;
  /** yyyy-MM-dd, the last day it holds */
  validUntil: string;
  issuer: string;
}
