import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The role-switch service has exactly one public method that mutates
 * assignments and mints a session: `switchRoleAndIssueSession`, which runs the
 * lock protocol and the account-state re-check in one transaction.
 *
 * An earlier `switchRole(userId, roleAssignmentId)` — a plain read, an
 * `updateMany`, an `update`, no lock and no account-state check — was left
 * behind after the controller moved to the transactional method. It is
 * unreachable, but a dead writer that predates the protocol is a trap: the
 * lock protocol in `utils/role-assignment-lock.ts` is only sound if every
 * writer takes the same locks in the same order, and a future caller reaching
 * for the shorter name would silently reintroduce the suspension race this PR
 * closes. This test fails if the unlocked method is ever re-added.
 */
describe('RolesService exposes one assignment-writing switch path', () => {
  const source = readFileSync(join(__dirname, '..', 'roles.service.ts'), 'utf8');

  it('does not define the legacy unlocked `switchRole` method', () => {
    // Match a method declaration, not the transactional `switchRoleAndIssueSession`.
    expect(source).not.toMatch(/\basync\s+switchRole\s*\(/);
  });
});
