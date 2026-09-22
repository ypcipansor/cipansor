import { describe, it, expect } from 'vitest';
import { WbsCategory, WbsStatus, WbsTargetLevel } from '@prisma/client';
import { WBS_CATEGORIES, WBS_STATUSES, WBS_TARGET_LEVELS } from '@cipansor/shared';

/**
 * The shared value lists and the database enums describe the same thing.
 *
 * `pengawasan.validation.ts` builds its Zod schemas from the shared arrays, so
 * an enum value added to `schema.prisma` without a matching entry in
 * `@cipansor/shared` would be rejected at the edge while the database accepts
 * it — or, worse, a removed value would keep validating in API code that no
 * longer has a column. The repo settles this class of drift with a sync test
 * (`middleware/roles-sync.test.ts`), and these lists get the same treatment.
 */
describe('WBS shared enums stay in step with Prisma', () => {
  it('WBS_CATEGORIES matches WbsCategory', () => {
    expect([...WBS_CATEGORIES].sort()).toEqual(Object.values(WbsCategory).sort());
  });

  it('WBS_TARGET_LEVELS matches WbsTargetLevel', () => {
    expect([...WBS_TARGET_LEVELS].sort()).toEqual(Object.values(WbsTargetLevel).sort());
  });

  it('WBS_STATUSES matches WbsStatus', () => {
    expect([...WBS_STATUSES].sort()).toEqual(Object.values(WbsStatus).sort());
  });
});
