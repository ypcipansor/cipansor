/**
 * The migration chain must replay through the *real* migrator.
 *
 * Prisma `migrate deploy` does not execute a migration file the way
 * `pg.query(wholeFile)` does. A file without dollar-quoted blocks is split into
 * individual statements and run in autocommit; PostgreSQL wraps only the
 * whole-file form in one implicit transaction. That difference is not academic:
 * `20260921130000_plh_assignment_effective_unique` used a
 * `CREATE TEMP TABLE ... ON COMMIT DROP` referenced by four later statements.
 * Every `pg.query(wholeFile)` test passed — the implicit transaction kept the
 * temp table alive — while `prisma migrate deploy` aborted with
 * `relation "_plh_dedup_map" does not exist`, taking the whole deploy with it.
 *
 * A hand-rolled splitter is not a substitute: it has to reproduce Prisma's own
 * handling of dollar-quoted bodies to be faithful, and matching that by reading
 * source is how the emulator drifts from the thing it emulates. This suite runs
 * the real CLI, on a clean database, which is the only ground truth for
 * "does `migrate deploy` succeed here".
 *
 * Opt-in via RUN_DB_TESTS=1.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { Client } from 'pg';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 300_000 });

const API_ROOT = join(__dirname, '../..');
const PRISMA_BIN = join(API_ROOT, 'node_modules', '.bin', 'prisma');
const PRISMA_CONFIG = join(API_ROOT, 'prisma', 'prisma.config.ts');

describeDb('prisma migrate deploy on a clean database (real CLI)', () => {
  const dbName = `cipansor_migrate_deploy_${Date.now()}`;
  const baseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const targetUrl = (() => {
    const u = new URL(baseUrl);
    u.pathname = `/${dbName}`;
    return u.toString();
  })();

  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  it('applies every migration with no P3018', () => {
    expect(existsSync(PRISMA_BIN), `prisma binary missing at ${PRISMA_BIN}`).toBe(true);

    const result = spawnSync(PRISMA_BIN, ['migrate', 'deploy', '--config', PRISMA_CONFIG], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: targetUrl },
      encoding: 'utf8',
    });

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(output).not.toMatch(/P3018|failed to apply|relation ".*" does not exist/i);
    expect(result.status, output).toBe(0);
    expect(output).toMatch(/All migrations have been successfully applied/);
  });
});
