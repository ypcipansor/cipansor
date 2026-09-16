import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import * as PrismaClientNS from '@prisma/client';
import { createPrismaClient } from '../../prisma/client';

/**
 * Regression guard for the higher-education / Litbang purge
 * (PR #505). Each removal here was silent: a deleted module whose Prisma model
 * survived only failed at runtime, and editing the already-deployed `0_init`
 * migration left old enum values in existing databases while the regenerated
 * client rejected them. This test pins the invariants that keep the purge
 * consistent.
 */

const API_ROOT = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(p, 'utf8');

const SCHEMA = read(join(API_ROOT, 'prisma', 'schema.prisma'));
const ZERO_INIT = read(join(API_ROOT, 'prisma', 'migrations', '0_init', 'migration.sql'));

const REMOVED_MODELS = ['ResearchProject', 'ResearchMilestone', 'InnovationProposal'];
const REMOVED_ENUMS = ['ResearchStatus', 'InnovationStatus'];
const REMOVED_ROLES = [
  'PT_REKTOR',
  'PT_WAKIL_REKTOR',
  'PT_DEKAN',
  'PT_KAPRODI',
  'PT_DOSEN',
  'PT_MAHASISWA',
  'PT_STAF_AKADEMIK',
  'PT_TATA_USAHA',
  'PT_ALUMNI',
];

const migrationDirs = readdirSync(join(API_ROOT, 'prisma', 'migrations'));
const DECOMMISSION_DIR = migrationDirs.find((d) => d.endsWith('_decommission_higher_ed_litbang'));
const DECOMMISSION = DECOMMISSION_DIR
  ? read(join(API_ROOT, 'prisma', 'migrations', DECOMMISSION_DIR, 'migration.sql'))
  : '';

describe('decommission purge — schema', () => {
  it.each(REMOVED_MODELS)('no model %s remains', (model) => {
    expect(SCHEMA).not.toMatch(new RegExp(`^model ${model}\\b`, 'm'));
  });

  it.each(REMOVED_ENUMS)('no enum %s remains', (name) => {
    expect(SCHEMA).not.toMatch(new RegExp(`^enum ${name}\\b`, 'm'));
  });

  it('no PERGURUAN_TINGGI / PT_* survives in the schema', () => {
    expect(SCHEMA).not.toContain('PERGURUAN_TINGGI');
    for (const role of REMOVED_ROLES) {
      expect(SCHEMA).not.toContain(role);
    }
  });

  it('retains the still-live research models', () => {
    expect(SCHEMA).toMatch(/^model ResearchTheme\b/m);
    expect(SCHEMA).toMatch(/^model ResearchSubmission\b/m);
  });
});

describe('decommission purge — generated Prisma client', () => {
  it('drops the removed delegates but keeps the live research ones', () => {
    const client = createPrismaClient() as unknown as Record<string, unknown>;
    for (const model of REMOVED_MODELS) {
      const delegate = model[0].toLowerCase() + model.slice(1);
      expect(client[delegate]).toBeUndefined();
    }
    expect(client.researchTheme).toBeDefined();
  });

  it('no longer exposes ResearchStatus / InnovationStatus', () => {
    const ns = PrismaClientNS as unknown as Record<string, unknown>;
    expect(ns.ResearchStatus).toBeUndefined();
    expect(ns.InnovationStatus).toBeUndefined();
  });

  it('Realm, UnitType and RoleCode carry no higher-ed values', () => {
    const { Realm, UnitType, RoleCode } = PrismaClientNS;
    expect(Object.values(Realm)).not.toContain('PERGURUAN_TINGGI');
    expect(Object.values(UnitType)).not.toContain('PERGURUAN_TINGGI');
    for (const role of REMOVED_ROLES) {
      expect(Object.values(RoleCode)).not.toContain(role);
    }
  });
});

describe('decommission purge — migrations', () => {
  it('leaves 0_init untouched so deployed databases are not desynced', () => {
    // The baseline has definitely shipped; rewriting it never re-runs on an
    // existing database. The legacy values must still be there, and the drift
    // must be corrected by a later migration instead.
    expect(ZERO_INIT).toContain('PERGURUAN_TINGGI');
    expect(ZERO_INIT).toContain('PT_DOSEN');
  });

  it('ships a new migration that reconciles data before dropping the enum values', () => {
    expect(DECOMMISSION).not.toBe('');
    // Data that still points at the dropped unit type / realm is re-homed
    // BEFORE the type is recreated, otherwise the ALTER fails on old rows.
    const reassign = DECOMMISSION.indexOf('PERGURUAN_TINGGI');
    const recreate = DECOMMISSION.indexOf('CREATE TYPE "UnitType"');
    expect(reassign).toBeGreaterThan(-1);
    expect(recreate).toBeGreaterThan(reassign);

    for (const table of ['research_projects', 'research_milestones', 'innovation_proposals']) {
      expect(DECOMMISSION).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
    // PR #504 owns the system-secrets removal; #505 must not touch it.
    expect(DECOMMISSION).not.toContain('system_secrets');
  });

  it('no longer references the removed modules from active source', () => {
    const appSource = read(join(API_ROOT, 'src', 'app.ts'));
    expect(appSource).not.toContain("'/litbang'");
    expect(appSource).toContain("'/research'");

    const removedDir = join(API_ROOT, 'src', 'modules', 'litbang');
    expect(() => readdirSync(removedDir)).toThrow();
  });

  it('deletes the PERGURUAN_TINGGI unit outright instead of re-typing it', () => {
    // Owner decision on PR #505: the PT unit is removed, not re-typed to OTHER.
    // A unit cannot simply be deleted while rows still point at it, so the
    // migration walks the live FK catalog. Pin the shape: no re-typing UPDATE,
    // a catalog-driven closure, and a real DELETE.
    expect(DECOMMISSION).not.toMatch(/UPDATE "units"[\s\S]{0,80}SET "type"\s*=\s*'OTHER'/);
    expect(DECOMMISSION).toContain('confdeltype');
    expect(DECOMMISSION).toMatch(/DELETE FROM %s WHERE id IN/);
    // The realm still has to be re-homed for the enum rewrite, which is a
    // different concern from the unit rows themselves.
    expect(DECOMMISSION).toMatch(/UPDATE "roles"[\s\S]*?SET "realm"\s*=\s*'UNIT_USAHA'/);
  });

  it('ends the sessions of users left without any role by the PT purge', () => {
    // Deleting the PT_* assignments alone does not end a PT user's session:
    // `authService.refreshToken` falls back to the legacy `users.role` column
    // when no assignment is active, so a user whose only role was PT keeps
    // rotating refresh tokens. The migration must therefore also identify the
    // affected users (before deleting their assignments), revoke their refresh
    // tokens and null the legacy role.
    const code = DECOMMISSION.replace(/--[^\n]*/g, '');
    expect(code).toMatch(/DELETE FROM "refresh_tokens"/);
    expect(code).toMatch(/UPDATE "users"[\s\S]*?SET "role"\s*=\s*NULL/);
    // The temp table must be populated before the PT assignments are removed,
    // otherwise the trace of who was PT-only is already gone.
    const snapshot = code.indexOf('CREATE TEMP TABLE');
    const deleteAssignments = code.indexOf('DELETE FROM "user_role_assignments"');
    expect(snapshot).toBeGreaterThan(-1);
    expect(deleteAssignments).toBeGreaterThan(snapshot);
    // Only users with no remaining active assignment qualify.
    expect(code).toMatch(/NOT EXISTS/);
    expect(code).toMatch(/"is_active"/);
  });

  it('documents why a later-expiring non-PT assignment is not a PT hole', () => {
    // Gap 2 of the PR #505 review: a "mixed" user whose surviving non-PT
    // assignment is active now but expires later would keep the legacy fallback
    // reachable once it lapses. That presupposes `expires_at` is ever written,
    // which no code path does — `assignRoleSchema` carries no `expiresAt` and
    // every assignment creation omits it. Pinned so the day that changes, this
    // reasoning is re-checked instead of silently rotting.
    const rolesSchema = read(join(API_ROOT, 'src', 'modules', 'roles', 'roles.schema.ts'));
    expect(rolesSchema).toMatch(/assignRoleSchema/);
    expect(rolesSchema).not.toMatch(/expiresAt/);

    for (const rel of [
      ['src', 'modules', 'roles', 'roles.service.ts'],
      ['src', 'utils', 'parent-scope.ts'],
      ['src', 'services', 'integration', 'student-onboarding.orchestrator.ts'],
    ]) {
      const source = read(join(API_ROOT, ...rel));
      expect(source, rel.join('/')).not.toMatch(
        /userRoleAssignment\.(create|update|updateMany)[\s\S]{0,200}expiresAt/
      );
    }
  });

  it('no code writes `expires_at` on a user_role_assignment (exhaustive)', () => {
    // The full set of assignment writers, confirmed by grepping every
    // `userRoleAssignment.create|update|updateMany|upsert` and every nested
    // `userRoles: { create/update }` in the API and the seed. None sets
    // `expiresAt`/`expires_at`; the only reads are active-role filters
    // (auth.service.ts activeRoleWhere, roles.service.ts switchRole). If one of
    // these starts writing an expiry, the "mixed user, future expiry" reasoning
    // above no longer holds and the PT purge must be revisited.
    const writers = [
      ['src', 'modules', 'auth', 'auth.service.ts'],
      ['src', 'modules', 'roles', 'roles.service.ts'],
      ['src', 'modules', 'users', 'user.service.ts'],
      ['src', 'utils', 'parent-scope.ts'],
      ['src', 'services', 'integration', 'student-onboarding.orchestrator.ts'],
      ['prisma', 'seed.ts'],
    ];
    for (const rel of writers) {
      const source = read(join(API_ROOT, ...rel));
      // A write site that reaches an `expiresAt` within a small window of the
      // assignment mutation is the only realistic way to set the column.
      expect(source, `${rel.join('/')} writes expiresAt`).not.toMatch(
        /(userRoleAssignment\.(create|createMany|update|updateMany|upsert)|userRoles:\s*\{\s*(create|update))[\s\S]{0,200}?expiresAt/
      );
    }
    // Raw SQL is the other way in; none of it touches user_role_assignments.
    const migrationSql = readdirSync(join(API_ROOT, 'prisma', 'migrations'))
      .filter((d) => d !== 'migration_lock.toml')
      .map((d) => join(API_ROOT, 'prisma', 'migrations', d, 'migration.sql'))
      .filter((p) => p.endsWith('.sql'))
      .map((p) => read(p))
      .join('\n');
    expect(migrationSql).not.toMatch(
      /(INSERT INTO|UPDATE)\s+"?user_role_assignments"?[\s\S]{0,300}?expires_at/
    );
  });

  it('documents the no-assignment PT shape as unreachable through account creation', () => {
    // Gap 1 of the PR #505 review: a PT user with no `user_role_assignments`
    // row leaves no PT trace for the purge to find. The account-creation paths
    // all write an assignment in the same transaction:
    //   - authService.register        -> auth.service.ts:388 (tx.userRoleAssignment.create)
    //   - userService.create          -> user.service.ts:224 (nested userRoles.create)
    //   - student-onboarding          -> student-onboarding.orchestrator.ts:341
    //   - parent-scope                -> parent-scope.ts:130
    //   - seed (DEMO_ACCOUNTS loop)   -> seed.ts, one create per entry
    // The paths that omit the assignment (students.service, hr.service) create
    // only non-PT legacy roles; and `login()` refuses a user with neither an
    // active assignment nor a legacy role, so no refresh token can exist for a
    // PT account with no assignment. Pinned so a new creation path that skips
    // the assignment fails here rather than only in production.
    const register = read(join(API_ROOT, 'src', 'modules', 'auth', 'auth.service.ts'));
    expect(register).toMatch(/userRoleAssignment\.create/);

    const users = read(join(API_ROOT, 'src', 'modules', 'users', 'user.service.ts'));
    expect(users).toMatch(/userRoles:\s*\{\s*create:/);

    const seed = read(join(API_ROOT, 'prisma', 'seed.ts'));
    expect(seed).toMatch(/userRoleAssignment\.create/);
    // The seed also fails loudly if any active account is left without an
    // active assignment.
    expect(seed).toMatch(/userRoles:\s*\{\s*none:\s*\{\s*isActive:\s*true/);
  });

  it('guards the purge block against a catalog that breaks its assumptions', () => {
    // The unit purge deletes rows with `ch.id IN (...)` per FK edge, which is
    // only correct while every followed edge is single-column, targets the
    // parent's `id`, and the child has an `id`. The block computes the table
    // closure from the catalog and asserts those three properties, failing
    // loudly instead of deleting the wrong rows or dying mid-deploy. Pinned so
    // the guards are not quietly removed by a future refactor.
    expect(DECOMMISSION).toMatch(/array_length\(c\.conkey,\s*1\)/);
    expect(DECOMMISSION).toMatch(/pa\.attnum\s*=\s*c\.confkey\[1\]/);
    expect(DECOMMISSION).toMatch(/edge\.parent_col\s*<>\s*'id'/);
    expect(DECOMMISSION).toMatch(/_decommission_tables/);
    expect(DECOMMISSION).toMatch(/IF edge\.conkey_len <> 1 THEN/);
    expect(DECOMMISSION).toMatch(/RAISE EXCEPTION/);
  });
});
