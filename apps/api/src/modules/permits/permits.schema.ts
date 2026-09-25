import type { z } from 'zod';
import { listPermitsQuerySchema } from '@cipansor/shared';

// The permit contract lives once, in @cipansor/shared (schemas/permits.ts);
// the web imports the same schemas and types.
export {
  createPermitSchema,
  updatePermitSchema,
  rejectPermitSchema,
  returnPermitSchema,
  listPermitsQuerySchema,
} from '@cipansor/shared';

/** The list query after parsing: defaults filled, `outside` a boolean. */
export type ListPermitsQueryParsed = z.output<typeof listPermitsQuerySchema>;
