import { z } from "zod";
import { SECURITY_EVENT_TYPES } from "../types/assessment";

export const recordSecurityLogSchema = z.object({
  attemptId: z.string().uuid(),
  eventType: z.enum(SECURITY_EVENT_TYPES),
  details: z.record(z.unknown()).optional().nullable(),
});

export type RecordSecurityLogInput = z.infer<typeof recordSecurityLogSchema>;
