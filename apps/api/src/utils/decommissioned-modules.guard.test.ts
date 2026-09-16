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
  it('drops the removed delegates but keeps the live research ones', async () => {
    const client = createPrismaClient() as unknown as Record<string, unknown>;
    try {
      for (const model of REMOVED_MODELS) {
        const delegate = model[0].toLowerCase() + model.slice(1);
        expect(client[delegate]).toBeUndefined();
      }
      expect(client.researchTheme).toBeDefined();
    } finally {
      // The delegate inspection never opens a query, but the client still owns
      // the pg driver pool; release it rather than leaking a connection.
      await (client.$disconnect as () => Promise<void>).call(client);
    }
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

  it('closes the no-assignment PT shape via the pre-purge unit snapshot', () => {
    // Gap 1 of the PR #505 review: a PT user with no `user_role_assignments`
    // row leaves no PT assignment for the purge to find. Account creation is
    // not how the shape arises — those paths all write an assignment:
    //   - authService.register        -> auth.service.ts:388 (tx.userRoleAssignment.create)
    //   - userService.create          -> user.service.ts:224 (nested userRoles.create)
    //   - student-onboarding          -> student-onboarding.orchestrator.ts:341
    //   - parent-scope                -> parent-scope.ts:130
    //   - seed (DEMO_ACCOUNTS loop)   -> seed.ts, one create per entry
    // It arises through *offboarding*: `rolesService.removeRoleAssignment`
    // (roles.service.ts:243) deletes the row without revoking refresh tokens,
    // so the user keeps a rotatable token and a legacy `users.role`. The
    // migration closes it by snapshotting users still attached to a
    // PERGURUAN_TINGGI unit before the unit is deleted (`users.unit_id` is SET
    // NULL, so this marker only exists pre-delete), and unioning that with the
    // assignment-based set. Pinned end-to-end by
    // tests/integration/decommission-pt-session.integration.test.ts.
    const register = read(join(API_ROOT, 'src', 'modules', 'auth', 'auth.service.ts'));
    expect(register).toMatch(/userRoleAssignment\.create/);

    const users = read(join(API_ROOT, 'src', 'modules', 'users', 'user.service.ts'));
    expect(users).toMatch(/userRoles:\s*\{\s*create:/);

    const seed = read(join(API_ROOT, 'prisma', 'seed.ts'));
    expect(seed).toMatch(/userRoleAssignment\.create/);
    // The seed also fails loudly if any active account is left without an
    // active assignment.
    expect(seed).toMatch(/userRoles:\s*\{\s*none:\s*\{\s*isActive:\s*true/);

    // The offboarding path that produces the shape does not revoke tokens —
    // the migration therefore has to. Pinned so a future "tidy up" of
    // removeRoleAssignment is not mistaken for the fix.
    const roles = read(join(API_ROOT, 'src', 'modules', 'roles', 'roles.service.ts'));
    const remove = roles.slice(roles.indexOf('async removeRoleAssignment'));
    expect(remove.slice(0, 400)).not.toMatch(/refreshToken\.deleteMany/);

    // Migration: the unit-based snapshot is taken *before* the unit delete, and
    // the section-4 selection unions it with the assignment-based candidates.
    const code = DECOMMISSION.replace(/--[^\n]*/g, '');
    const unitSnapshot = code.indexOf('pt_unit_users_tmp');
    const deleteUnits = code.search(/DELETE FROM\s+%s/);
    expect(unitSnapshot).toBeGreaterThan(-1);
    expect(deleteUnits).toBeGreaterThan(-1);
    expect(unitSnapshot).toBeLessThan(deleteUnits);
    expect(code).toMatch(/UNION/);
    expect(code).toMatch(/FROM "pt_unit_users_tmp"/);
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

  it('deletes PT rows whose `SET NULL` unit FK would globalise them', () => {
    // Finding 1 of the PR #505 review: a `SET NULL` FK to `units` does not
    // delete the child row -- it nulls the column, and for these tables a
    // NULL `unit_id` is read as "all units"/foundation-wide. Letting the FK fire
    // would widen each PT row's audience instead of retiring it. The migration
    // captures those rows before the unit delete and folds them into the purge.
    //
    // The list is semantic (the catalog cannot tell "NULL means global" from
    // "NULL means orphan") but the mechanism is catalog-driven, and each entry
    // is pinned against the read path that proves the semantics.
    //
    // `system_secrets` belongs to this class too (secrets.service.ts:6-7 reads
    // `unitId: null` as the global/foundation-wide scope), but PR #504 owns that
    // module and #505's migration must not name it. It is caught instead by the
    // generic below.
    const GLOBAL_NULL_TABLES = [
      'announcements',
      'calendar_events',
      'dashboard_history',
      'islamic_events',
      'paud_development_indicators',
      'strategic_plans',
    ];
    expect(DECOMMISSION).toContain('pt_setnull_doomed_tmp');
    expect(DECOMMISSION).toMatch(/confdeltype\s*=\s*'n'/);
    expect(DECOMMISSION).toMatch(/c\.confrelid\s*=\s*'units'::regclass/);
    for (const table of GLOBAL_NULL_TABLES) {
      expect(DECOMMISSION, table).toContain(`'public.${table}'`);
    }
    // users.unit_id and user_role_assignments.unit_id must keep SET NULL: a
    // PT-only account survives the unit delete detached (section 4 then ends
    // its session). Pinned by their absence from the purge list.
    expect(DECOMMISSION).not.toContain("'public.users'");
    expect(DECOMMISSION).not.toContain("'public.user_role_assignments'");

    // Evidence that NULL means "global" for each pinned table (file:line).
    const announcements = read(
      join(API_ROOT, 'src', 'modules', 'announcements', 'announcements.service.ts')
    );
    expect(announcements).toMatch(/\{ unitId: null \}/); // "Global announcements"
    const calendar = read(join(API_ROOT, 'src', 'modules', 'calendar', 'calendar.service.ts'));
    expect(calendar).toMatch(/unitId: null/);
    const dashboard = read(join(API_ROOT, 'src', 'modules', 'dashboard', 'dashboard.service.ts'));
    expect(dashboard).toMatch(/unitId: unitId \|\| null/);
    const paudSchema = read(
      join(API_ROOT, 'src', 'modules', 'paud-assessment', 'paud-assessment.schema.ts')
    );
    expect(paudSchema).toMatch(/null = global indicator/);
    const perencanaan = read(
      join(API_ROOT, 'src', 'modules', 'perencanaan', 'perencanaan.service.ts')
    );
    expect(perencanaan).toMatch(/\{ unitId: null \}/);
  });

  it('captures unique-per-unit `SET NULL` children generically, without naming them', () => {
    // Finding 1's other half. A `SET NULL` child whose `(unit_id, ...)` is
    // UNIQUE models one row per unit, so a row belonging to the PT unit is
    // unit-owned -- not a foundation-wide row. It must be purged too. The
    // migration must NOT name them (PR #504 owns one of them), so it matches
    // the shape from the catalog: a unique index whose first key column is the
    // FK column. Today that matches `dashboard_metric_snapshots` and
    // `report_templates`, plus one table owned by PR #504.
    const code = DECOMMISSION.replace(/--[^\n]*/g, '');
    expect(code).toMatch(/pg_index/);
    expect(code).toMatch(/indisunique/);
    expect(code).toMatch(/i\.indkey\[0\]/);
    expect(code).toMatch(/ia\.attname\s*=\s*a\.attname/);
    // The tables the rule matches today must not be hard-coded anywhere in the
    // migration -- naming them would defeat the generic match.
    for (const table of [
      'dashboard_metric_snapshots',
      'report_templates',
      // Owned by PR #504; must stay out of #505's migration entirely.
      'system_secrets',
    ]) {
      expect(code, `${table} must not be pinned by literal name`).not.toContain(table);
    }

    // Evidence each is genuinely `@@unique([unitId, ...])` (the catalog rule
    // matches the leading key column being the FK column).
    for (const [model, unique] of [
      ['DashboardMetricSnapshot', '@@unique([unitId, metricType, periodType, periodDate])'],
      ['ReportTemplate', '@@unique([unitId, type])'],
      ['SystemSecret', '@@unique([unitId, key])'],
    ]) {
      const body = SCHEMA.slice(SCHEMA.indexOf(`model ${model} {`));
      expect(body.slice(0, body.indexOf('\n}')), model).toContain(unique);
    }
  });

  it('purges PT roles by realm, not only the hard-coded PT_* codes', () => {
    // Finding 2 of the PR #505 review: `roles.code` is TEXT (0_init), and
    // `createRoleSchema` accepts any uppercase code, so `POST /roles` can mint a
    // role with a non-standard code (e.g. PT_CUSTOM_X) and realm
    // PERGURUAN_TINGGI. Re-homing the realm (line ~283) would turn it into an
    // ordinary UNIT_USAHA role that survives, keeping its assignment, refresh
    // token and legacy `users.role`. The migration captures PT roles (realm OR
    // the known codes) BEFORE the realm rewrite, then deletes them by id.
    const rolesSchema = read(join(API_ROOT, 'src', 'modules', 'roles', 'roles.schema.ts'));
    expect(rolesSchema).toMatch(/code:[\s\S]*?z\.string\(\)/);
    expect(rolesSchema).toMatch(/\^\[A-Z0-9_\]\+\$/);

    const rolesService = read(join(API_ROOT, 'src', 'modules', 'roles', 'roles.service.ts'));
    expect(rolesService).toMatch(/async createRole/);

    const code = DECOMMISSION.replace(/--[^\n]*/g, '');
    expect(code).toContain('pt_roles_tmp');
    expect(code).toMatch(/"realm"::text\s*=\s*'PERGURUAN_TINGGI'/);
    // capture must precede the re-home, and deletion must use the captured set
    const capture = code.indexOf('pt_roles_tmp');
    const rehome = code.indexOf(`SET "realm" = 'UNIT_USAHA'`);
    const deleteRoles = code.indexOf('DELETE FROM "roles"');
    expect(rehome).toBeGreaterThan(capture);
    expect(deleteRoles).toBeGreaterThan(rehome);
    expect(code).toMatch(/DELETE FROM "roles" WHERE "id" IN \(SELECT "id" FROM "pt_roles_tmp"\)/);
  });
});
