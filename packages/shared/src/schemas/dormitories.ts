import { z } from "zod";
import { ADMIN_ROLE_CODES, GOVERNANCE_ROLE_CODES } from "../roles";

/**
 * Asrama, kamar and who sleeps where — the records the asrama pages write.
 *
 * Until 2026-09-26 the web and the API disagreed on almost every write here:
 * the forms sent `type` where the API wants `gender`, edits went out as PATCH
 * to a route that only answers PUT, and adding or deleting a kamar went to the
 * facilities module's rooms, a different table. One contract, read by both
 * sides, is what stops that from happening again.
 */

/** `Dormitory.gender` in Prisma; the contract test pins the two together. */
export const DORMITORY_GENDER_VALUES = ["MALE", "FEMALE"] as const;
export type DormitoryGender = (typeof DORMITORY_GENDER_VALUES)[number];

/**
 * Who creates and edits asrama and kamar, and places santri in them: exactly
 * the people the routes admitted before, as the legacy SUPER_ADMIN and
 * UNIT_ADMIN buckets — the super admin, every school's admin and the yayasan
 * organs. Whether the Pimpinan Pesantren or TU Pesantren should, and the
 * organs should not, is open with the yayasan; this list is where it changes.
 */
export const DORMITORY_MANAGER_ROLE_CODES: readonly string[] = [
  ...ADMIN_ROLE_CODES,
  ...GOVERNANCE_ROLE_CODES,
];

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createDormitorySchema = z.object({
  /**
   * Unit pengelola. Omitted or null means the asrama is run by the yayasan
   * across units, which is the normal case — see the Dormitory model.
   * The empty string is accepted because an unselected <Select> submits one.
   */
  unitId: z
    .union([z.uuid("Unit tidak valid"), z.literal("")])
    .nullish()
    .transform((v) => v || null),
  name: z.string().trim().min(2, "Nama asrama minimal 2 karakter").max(100),
  code: z
    .string()
    .trim()
    .min(2, "Kode asrama minimal 2 karakter")
    .max(20, "Kode asrama maksimal 20 karakter"),
  gender: z.enum(DORMITORY_GENDER_VALUES, "Jenis asrama wajib dipilih"),
  capacity: z
    .number()
    .int()
    .positive("Kapasitas minimal 1")
    .max(5000, "Kapasitas terlalu besar"),
  address: optionalText(500),
  description: optionalText(2000),
});
export type CreateDormitoryInput = z.input<typeof createDormitorySchema>;

export const updateDormitorySchema = createDormitorySchema.partial();
export type UpdateDormitoryInput = z.input<typeof updateDormitorySchema>;

export const createRoomSchema = z.object({
  dormitoryId: z.uuid("Asrama tidak valid"),
  name: z.string().trim().min(1, "Nama kamar wajib diisi").max(50),
  floor: z.number().int().positive("Lantai minimal 1").max(50).default(1),
  capacity: z
    .number()
    .int()
    .positive("Kapasitas minimal 1")
    .max(100, "Kapasitas kamar maksimal 100"),
  description: optionalText(500),
  isActive: z.boolean().default(true),
});
export type CreateRoomInput = z.input<typeof createRoomSchema>;
/** A kamar's asrama never changes; the API builds its update schema from this. */
export type UpdateRoomInput = Partial<Omit<CreateRoomInput, "dormitoryId">>;

export const createRoomAssignmentSchema = z.object({
  studentId: z.uuid("Santri tidak valid"),
  roomId: z.uuid("Kamar tidak valid"),
  notes: optionalText(500),
});
export type CreateRoomAssignmentInput = z.input<
  typeof createRoomAssignmentSchema
>;
