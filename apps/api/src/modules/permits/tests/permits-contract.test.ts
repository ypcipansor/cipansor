import { describe, it, expect } from 'vitest';
import { PermitStatus, PermitType } from '@prisma/client';
import {
  PERMIT_STATUS_VALUES,
  PERMIT_TYPE_VALUES,
  PERMIT_DECIDER_ROLE_CODES,
  PERMIT_STAFF_ROLE_CODES,
  GOVERNANCE_ROLE_CODES,
} from '@cipansor/shared';
import { RoleCode } from '@prisma/client';

// The web cannot import @prisma/client, so the permit vocabulary is repeated
// in @cipansor/shared. This is what keeps the copy honest: the web once sent
// SICK/FAMILY/EMERGENCY to a column that only knows SAKIT/KELUARGA/….
describe('the shared permit contract matches the database', () => {
  it('permit types', () => {
    expect([...PERMIT_TYPE_VALUES].sort()).toEqual(Object.values(PermitType).sort());
  });

  it('permit statuses', () => {
    expect([...PERMIT_STATUS_VALUES].sort()).toEqual(Object.values(PermitStatus).sort());
  });

  it('every role code in the permit lists exists', () => {
    const known = new Set<string>(Object.values(RoleCode));
    for (const code of [...PERMIT_STAFF_ROLE_CODES, ...PERMIT_DECIDER_ROLE_CODES]) {
      expect(known.has(code), code).toBe(true);
    }
  });

  it('deciders are staff, and no yayasan organ is either', () => {
    for (const code of PERMIT_DECIDER_ROLE_CODES) {
      expect(PERMIT_STAFF_ROLE_CODES).toContain(code);
    }
    for (const code of GOVERNANCE_ROLE_CODES) {
      expect(PERMIT_STAFF_ROLE_CODES).not.toContain(code);
    }
  });
});
