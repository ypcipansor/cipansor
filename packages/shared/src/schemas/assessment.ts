import { z } from "zod";
import { SECURITY_EVENT_TYPES } from "../types/assessment";

/**
 * Request contract for recording a CBT exam-integrity event. Shared between the
 * API (edge validation) and the web client so both sides agree on the request
 * shape for `POST /cbt/attempts/:id/security-log`.
 *
 * The event name was previously `z.nativeEnum(SecurityEventType).or(z.string())`,
 * and that `.or(z.string())` defeated the whole check: every string passed, so an
 * unknown name travelled to the database and could only fail there. It is now a
 * closed list, drawn from the same `SECURITY_EVENT_TYPES` the table's CHECK
 * constraint is generated against.
 *
 * `details` is an object, not a sentence: it lands in a JSONB column, so what is
 * written there can be queried and aggregated afterwards. Something a person will
 * read goes in `{ note }`.
 */
export const recordSecurityLogSchema = z.object({
  eventType: z.enum(SECURITY_EVENT_TYPES),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type RecordSecurityLogInput = z.infer<typeof recordSecurityLogSchema>;
