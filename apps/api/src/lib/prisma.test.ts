import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
// Importing builds the real client; the adapter connects lazily, so no database is needed.
import { USER_SECRET_OMIT } from './prisma';

// Proven against a real Postgres on 2026-09-25: with this omit, a plain read,
// `include: { users: true }`, a create's result and a transaction all come
// back without these columns, while `select: { passwordHash: true }` and
// `omit: { passwordHash: false }` still return them. What this test adds is the
// other direction: a credential column added to User later is omitted too.
describe('USER_SECRET_OMIT', () => {
  const columns = Object.values(Prisma.UserScalarFieldEnum) as string[];
  const secrets = columns.filter((c) => /hash|secret|recovery/i.test(c));

  it('the pattern still finds the credentials (the test is not vacuous)', () => {
    expect(secrets).toEqual(
      expect.arrayContaining(['passwordHash', 'twoFactorSecret', 'resetTokenHash'])
    );
  });

  it('omits every credential column of User', () => {
    for (const column of secrets) {
      expect(USER_SECRET_OMIT.user, column).toHaveProperty(column, true);
    }
  });

  it('names only columns that exist', () => {
    for (const column of Object.keys(USER_SECRET_OMIT.user)) {
      expect(columns).toContain(column);
    }
  });
});
