import { describe, it, expect } from 'vitest';
import { SecurityEventType as PrismaSecurityEventType } from '@prisma/client';
import { SECURITY_EVENT_TYPES } from '@cipansor/shared';

// Shared cannot import @prisma/client (see packages/shared/AGENTS.md), so the
// const tuple is the API-visible contract and this test pins its values to the
// database enum — the same pattern as roles-sync.test.ts for RoleCode.
describe('shared SecurityEventType stays in sync with the Prisma enum', () => {
  const prismaCodes = Object.values(PrismaSecurityEventType) as string[];

  it('every shared value exists in the Prisma enum', () => {
    const unknown = SECURITY_EVENT_TYPES.filter((c) => !prismaCodes.includes(c));
    expect(unknown).toEqual([]);
  });

  it('every Prisma value is covered by a shared value', () => {
    const missing = prismaCodes.filter((c) => !SECURITY_EVENT_TYPES.includes(c as never));
    expect(missing).toEqual([]);
  });
});
