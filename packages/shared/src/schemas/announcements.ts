import { z } from "zod";

/**
 * Pengumuman — the one way to broadcast (`decisions/siaran-pengumuman.md`).
 * Publishing fills the audience's bell, and push follows from there; the board
 * keeps it to read again. Who may send to whom is a relation, checked by the
 * API: a guru to the classes they teach or homeroom, a musyrif to their santri
 * mukim, the head, TU or admin of a unit to that unit, the yayasan's organs
 * and the Pimpinan Pesantren to the yayasan or one unit.
 */

export const ANNOUNCEMENT_SCOPES = [
  "YAYASAN",
  "UNIT",
  "CLASSES",
  "BOARDERS",
] as const;
export type AnnouncementScopeCode = (typeof ANNOUNCEMENT_SCOPES)[number];

/** Who in the scope reads it; none named = everyone in the scope. */
export const ANNOUNCEMENT_AUDIENCES = [
  "STUDENT",
  "PARENT",
  "TEACHER",
  "STAFF",
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/** A class or a kamar reaches santri and their wali only. */
export const FAMILY_AUDIENCES: readonly AnnouncementAudience[] = [
  "STUDENT",
  "PARENT",
];

export const ANNOUNCEMENT_TYPES = [
  "ANNOUNCEMENT",
  "INFO",
  "REMINDER",
  "ALERT",
] as const;

/** 0 normal, 1 penting, 2 mendesak. */
const priority = z.number().int().min(0).max(2);

const content = {
  title: z.string().trim().min(1, "Judul wajib diisi").max(200),
  content: z.string().trim().min(1, "Isi wajib diisi").max(10_000),
  type: z.enum(ANNOUNCEMENT_TYPES),
  priority,
  expiresAt: z.coerce.date().nullable(),
  attachmentUrl: z.string().url().max(2048).nullable(),
};

export const createAnnouncementSchema = z
  .object({
    ...content,
    type: content.type.default("ANNOUNCEMENT"),
    priority: priority.default(0),
    expiresAt: content.expiresAt.optional(),
    attachmentUrl: content.attachmentUrl.optional(),
    scope: z.enum(ANNOUNCEMENT_SCOPES),
    /** UNIT: the unit. Only the yayasan's organs choose; everyone else sends to their own. */
    unitId: z.string().uuid().nullable().optional(),
    /** CLASSES: one or more of the sender's classes. */
    classIds: z.array(z.string().uuid()).max(60).default([]),
    targetRoles: z.array(z.enum(ANNOUNCEMENT_AUDIENCES)).max(4).default([]),
    /** Later than now: it waits, on the board and in the bell, until then. */
    publishedAt: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.scope === "CLASSES" && a.classIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["classIds"],
        message: "Pilih paling sedikit satu kelas",
      });
    }
    if (a.scope !== "CLASSES" && a.classIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["classIds"],
        message: "Kelas hanya dipilih untuk pengumuman kelas",
      });
    }
    if (
      (a.scope === "CLASSES" || a.scope === "BOARDERS") &&
      a.targetRoles.some((r) => !FAMILY_AUDIENCES.includes(r))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["targetRoles"],
        message: "Pengumuman kelas atau kamar hanya untuk santri dan wali",
      });
    }
    if (a.expiresAt && a.expiresAt <= (a.publishedAt ?? new Date())) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Berakhir harus sesudah waktu terbit",
      });
    }
  });

/** What can change after publication: the words, not who received them. */
export const updateAnnouncementSchema = z.object(content).partial().strict();

export type CreateAnnouncementInput = z.input<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.input<typeof updateAnnouncementSchema>;

export interface AnnouncementDTO {
  id: string;
  unitId: string | null;
  scope: AnnouncementScopeCode;
  classIds: string[];
  title: string;
  content: string;
  type: string;
  priority: number;
  attachmentUrl: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  targetRoles: string[];
  withdrawnAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  unit: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  /** The caller may revise or withdraw it. */
  canManage: boolean;
  /**
   * Bells it reached, and how many of those were read — per announcement, for
   * its sender and whoever oversees it (decisions/siaran-pengumuman.md, 5).
   * Absent for everyone else.
   */
  recipientCount?: number;
  readCount?: number;
}

/** `GET /announcements/compose` — what the caller may publish, and where. */
export interface AnnouncementComposeOptionsDTO {
  scopes: AnnouncementScopeCode[];
  /** UNIT: the units the caller may choose (organs: all; others: their own). */
  units: { id: string; name: string }[];
  /** CLASSES: the caller's classes (homeroom or an active lesson). */
  classes: { id: string; name: string; unitName: string | null }[];
  /** BOARDERS: how many santri mukim the musyrif looks after now. */
  boarders: number;
}

export interface AnnouncementStatsDTO {
  total: number;
  active: number;
  urgent: number;
  thisMonth: number;
}
