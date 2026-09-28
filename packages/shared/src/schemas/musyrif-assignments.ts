import { z } from "zod";
import {
  PESANTREN_EDUCATOR_ROLE_CODES,
  PESANTREN_LEADER_ROLE_CODES,
  SCHOOL_TEACHER_ROLE_CODES,
} from "../roles";

/**
 * Penugasan musyrif — who looks after which asrama or kamar. A santri mukim's
 * musyrif is whoever is assigned to their kamar, or to the whole asrama; that
 * is who decides their leave, and whose "santri saya" list they appear on.
 *
 * Until 2026-09-26 the only way to create an assignment was the seed: the
 * table existed and three features read it, but no screen or endpoint wrote
 * it.
 */

/** The duty, as stored in `musyrif_assignments.role`. */
export const MUSYRIF_DUTY_VALUES = [
  "PEMBINA",
  "KOORDINATOR",
  "PENGAWAS",
] as const;
export type MusyrifDuty = (typeof MUSYRIF_DUTY_VALUES)[number];

/**
 * Who assigns musyrif: the Pimpinan Pesantren, whose asrama they are, and the
 * super admin. An asrama is run at foundation level and houses santri of
 * several schools, so no school's admin assigns its musyrif.
 */
export const MUSYRIF_ASSIGNER_ROLE_CODES: readonly string[] = [
  "SUPER_ADMIN",
  ...PESANTREN_LEADER_ROLE_CODES,
];

/** Who reads an asrama's assignments: the assigners and the musyrif themselves. */
export const MUSYRIF_READER_ROLE_CODES: readonly string[] = [
  ...MUSYRIF_ASSIGNER_ROLE_CODES,
  ...PESANTREN_EDUCATOR_ROLE_CODES,
];

/**
 * Who can be assigned: pesantren educators, and school teachers — a guru who
 * also looks after a kamar is common.
 */
export const MUSYRIF_CANDIDATE_ROLE_CODES: readonly string[] = [
  ...PESANTREN_EDUCATOR_ROLE_CODES,
  ...SCHOOL_TEACHER_ROLE_CODES,
];

export const assignMusyrifSchema = z.object({
  userId: z.uuid(),
  /** A kamar of this asrama; absent or null for the whole asrama. */
  roomId: z.uuid().nullable().optional(),
  role: z.enum(MUSYRIF_DUTY_VALUES).default("PEMBINA"),
});
export type AssignMusyrifInput = z.input<typeof assignMusyrifSchema>;

export const musyrifCandidatesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

/** An active assignment as the API sends it. */
export interface MusyrifAssignment {
  id: string;
  role: MusyrifDuty;
  startDate: string;
  /** Null: the whole asrama. */
  room: { id: string; name: string } | null;
  user: { id: string; name: string };
}

export interface MusyrifCandidate {
  id: string;
  name: string;
  roleCodes: string[];
}
