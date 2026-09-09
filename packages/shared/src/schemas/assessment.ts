import { z } from "zod";
import { SecurityEventType } from "../types/assessment";

/**
 * Request contract for recording a CBT security event (tab switch, blur, copy,
 * paste, right-click). Shared between the API (edge validation) and the web
 * client so both sides agree on the request shape for `POST /cbt/attempts/:id/security-log`.
 */
export const recordSecurityLogSchema = z.object({
  eventType: z.nativeEnum(SecurityEventType).or(z.string()),
  details: z.string().max(500).nullable().optional(),
});

export type RecordSecurityLogInput = z.infer<typeof recordSecurityLogSchema>;
