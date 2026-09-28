import type { z } from 'zod';
import { listPermitsQuerySchema, permitDeciderQuerySchema } from '@cipansor/shared';

// The permit contract lives once, in @cipansor/shared (schemas/permits.ts);
// the web imports the same schemas and types.
export {
  createPermitSchema,
  updatePermitSchema,
  rejectPermitSchema,
  returnPermitSchema,
  listPermitsQuerySchema,
  permitDeciderQuerySchema,
} from '@cipansor/shared';

/** The list query after parsing: defaults filled, `outside` a boolean. */
export type ListPermitsQueryParsed = z.output<typeof listPermitsQuerySchema>;

/** The decider preview query after parsing: `offCampus` a boolean. */
export type PermitDeciderQueryParsed = z.output<typeof permitDeciderQuerySchema>;
