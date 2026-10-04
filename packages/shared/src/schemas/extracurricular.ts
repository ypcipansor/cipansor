import { z } from "zod";
import { DayOfWeek } from "../types/enums";

/**
 * An extracurricular as a unit keeps it: what it is, who coaches it, when and
 * where it meets. One contract for the API's validation and the portal's
 * create and edit forms — the forms had their own idea of it (categories
 * `SPORT`/`ART`/`SCIENCE`, a list of `schedules`, `maxMembers`), so a sport
 * could not be created at all and every schedule and capacity typed in was
 * silently dropped.
 *
 * The values mirror the Prisma enums `ExtracurricularCategory` and
 * `ExtracurricularStatus`; a test in the API module fails when they part.
 */

export const EXTRACURRICULAR_CATEGORIES = [
  "SPORTS",
  "ARTS",
  "ACADEMIC",
  "RELIGIOUS",
  "SCOUTING",
  "LEADERSHIP",
  "LANGUAGE",
  "TECHNOLOGY",
  "OTHER",
] as const;
export type ExtracurricularCategory =
  (typeof EXTRACURRICULAR_CATEGORIES)[number];

export const EXTRACURRICULAR_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
] as const;
export type ExtracurricularStatus = (typeof EXTRACURRICULAR_STATUSES)[number];

/** "15:00-17:00" — the meeting time, start before end, on the 24-hour clock. */
const HOUR_MINUTE = "([01]\\d|2[0-3]):[0-5]\\d";
export const SCHEDULE_TIME_PATTERN = new RegExp(
  `^(${HOUR_MINUTE})\\s*[-–]\\s*(${HOUR_MINUTE})$`,
);

/** The start and end of a stored schedule time, or null when it has none. */
export function splitScheduleTime(
  value: string | null | undefined,
): { start: string; end: string } | null {
  const match = value?.trim().match(SCHEDULE_TIME_PATTERN);
  return match ? { start: match[1], end: match[3] } : null;
}

const scheduleTime = z
  .string()
  .trim()
  .regex(SCHEDULE_TIME_PATTERN, "Isi jam mulai dan jam selesai")
  .refine((value) => {
    const parts = splitScheduleTime(value);
    return !parts || parts.start < parts.end;
  }, "Jam selesai harus sesudah jam mulai");

/** Optional text a form sends as "" when left empty. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional();

const fields = {
  unitId: z.string().uuid({ message: "Pilih unit" }),
  academicYearId: z.string().uuid({ message: "Pilih tahun ajaran" }),
  name: z.string().trim().min(1, "Nama wajib diisi").max(100),
  code: optionalText(20),
  category: z.enum(EXTRACURRICULAR_CATEGORIES, { message: "Pilih kategori" }),
  description: optionalText(2000),
  scheduleDay: z.array(z.enum(DayOfWeek)).max(7),
  scheduleTime: scheduleTime.optional(),
  venue: optionalText(100),
  maxParticipants: z.number().int().positive().max(1000).optional(),
  minParticipants: z.number().int().positive().max(1000).optional(),
  coachId: z.string().uuid().optional(),
  assistantCoachId: z.string().uuid().optional(),
  isCompulsory: z.boolean(),
  imageUrl: z.string().url().optional(),
};

/** POST /extracurricular — created active, in the given unit. */
export const createExtracurricularSchema = z.object({
  ...fields,
  scheduleDay: fields.scheduleDay.default([]),
  isCompulsory: fields.isCompulsory.default(false),
});

/**
 * PUT /extracurricular/:id — only the fields sent change; `null` empties an
 * optional one. The unit is not among them: an extracurricular stays in the
 * unit it was created in.
 */
export const updateExtracurricularSchema = z
  .object({
    ...fields,
    description: fields.description.nullable(),
    scheduleTime: fields.scheduleTime.nullable(),
    venue: fields.venue.nullable(),
    maxParticipants: fields.maxParticipants.nullable(),
    minParticipants: fields.minParticipants.nullable(),
    coachId: fields.coachId.nullable(),
    assistantCoachId: fields.assistantCoachId.nullable(),
    imageUrl: fields.imageUrl.nullable(),
    status: z.enum(EXTRACURRICULAR_STATUSES),
  })
  .omit({ unitId: true })
  .partial();

export type CreateExtracurricularInput = z.input<
  typeof createExtracurricularSchema
>;
export type UpdateExtracurricularInput = z.input<
  typeof updateExtracurricularSchema
>;

/** An extracurricular as GET /extracurricular and /extracurricular/:id return it. */
export interface ExtracurricularDTO {
  id: string;
  unitId: string;
  academicYearId: string;
  name: string;
  code: string | null;
  category: ExtracurricularCategory;
  description: string | null;
  scheduleDay: DayOfWeek[];
  scheduleTime: string | null;
  venue: string | null;
  maxParticipants: number | null;
  minParticipants: number | null;
  coachId: string | null;
  assistantCoachId: string | null;
  status: ExtracurricularStatus;
  isCompulsory: boolean;
  imageUrl: string | null;
  unit?: { id: string; name: string; type?: string };
  academicYear?: { id: string; name: string; isActive?: boolean };
  /** The coach's name only — never the teacher's record. */
  coach?: { id: string; user: { id: string; name: string } } | null;
  assistantCoach?: { id: string; user: { id: string; name: string } } | null;
  /** Active members, and achievements recorded. */
  _count?: { enrollments: number; achievements: number };
  createdAt: string;
  updatedAt: string;
}
