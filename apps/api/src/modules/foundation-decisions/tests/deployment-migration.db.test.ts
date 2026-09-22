/**
 * Finding A — the REAL production deployment path must be able to run migrations.
 *
 * `ci-provisioning.test.ts` only pins the *shape* of the configuration (the
 * Makefile calls `docker compose run … migrate`, the Dockerfile declares a
 * `migrate` stage, compose waits on `service_completed_successfully`). That is
 * necessary but not sufficient: it would pass even if the `migrate` image were
 * broken, or if the command it runs pointed at a config file that is not in the
 * image. This suite exercises the artifact itself.
 *
 * It builds the `migrate` stage from `apps/api/Dockerfile`, starts it against a
 * brand-new empty PostgreSQL database using the image's own default CMD, and
 * asserts:
 *   - the process exits 0 and reports "All migrations have been successfully applied";
 *   - the foundation tables the API needs actually exist afterwards;
 *   - the partial unique index that is the DB-level "at most one active e-seal"
 *     invariant exists (a `db push` image would not have it);
 *   - a failing migration (bad credentials) exits non-zero, so the compose
 *     `service_completed_successfully` gate would stop the API.
 *
 * Opt-in and Docker-gated: it needs a Docker daemon and builds a ~1GB image, so
 * it is not part of the default unit run. Enable with `RUN_DEPLOY_TESTS=1`.
 * Reuse a prebuilt image by setting `MIGRATE_IMAGE=<tag>` (skips the build).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import path from 'path';
import { Client } from 'pg';

const RUN = process.env.RUN_DEPLOY_TESTS === '1';
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const IMAGE =
  process.env.MIGRATE_IMAGE || `cipansor-api-migrate-test:${randomBytes(4).toString('hex')}`;

/**
 * Docker command prefix. CI runs the daemon as the current user, but an
 * unprivileged sandbox may need `sudo`; set `DOCKER_SUDO=1` there.
 */
const DOCKER = process.env.DOCKER_SUDO === '1' ? ['sudo', 'docker'] : ['docker'];

function dockerAvailable(): boolean {
  try {
    execFileSync(DOCKER[0], [...DOCKER.slice(1), 'info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Run a docker subcommand, transparently handling the sudo prefix. */
function docker(
  args: string[],
  opts: { timeout?: number; encoding?: 'utf8' } = {}
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(DOCKER[0], [...DOCKER.slice(1), ...args], {
    encoding: opts.encoding ?? 'utf8',
    timeout: opts.timeout,
  });
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') };
}

const HAS_DOCKER = dockerAvailable();
const SHOULD_RUN = RUN && HAS_DOCKER;

/**
 * Hosts that container→host loopback reaches. On Linux, `--network host` means
 * the container shares the host's 127.0.0.1, which is where the CI Postgres
 * service listens.
 */
function hostDatabaseUrl(dbName: string): string {
  const base = new URL(process.env.DATABASE_URL!);
  base.pathname = `/${dbName}`;
  // The container reaches the host's loopback directly under `--network host`.
  base.hostname = '127.0.0.1';
  return base.toString();
}

async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const base = new URL(process.env.DATABASE_URL!);
  base.pathname = '/postgres';
  const c = new Client({ connectionString: base.toString() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const created: string[] = [];

function buildMigrateImage(): void {
  const r = docker(
    ['build', '-f', 'apps/api/Dockerfile', '--target', 'migrate', '-t', IMAGE, '.'],
    {
      timeout: 15 * 60_000,
    }
  );
  if (r.status !== 0) throw new Error(`docker build failed (${r.status}):\n${r.stderr}`);
}

describe.skipIf(!SHOULD_RUN)('finding A — image deployment nyata menjalankan migrasi', () => {
  beforeAll(() => {
    if (!process.env.MIGRATE_IMAGE) buildMigrateImage();
  }, 15 * 60_000);

  afterAll(async () => {
    for (const db of created) {
      await withAdmin(async (c) => {
        await c.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [db]
        );
        await c.query(`DROP DATABASE IF EXISTS "${db}"`);
      });
    }
    if (!process.env.MIGRATE_IMAGE) {
      docker(['rmi', '-f', IMAGE]);
    }
  });

  it(
    'menjalankan seluruh migrasi pada database kosong lewat CMD image',
    async () => {
      const db = `cipansor_deploy_img_${randomBytes(4).toString('hex')}`;
      created.push(db);
      await withAdmin((c) => c.query(`CREATE DATABASE "${db}"`));

      const run = docker(
        ['run', '--rm', '--network', 'host', '-e', `DATABASE_URL=${hostDatabaseUrl(db)}`, IMAGE],
        {
          timeout: 5 * 60_000,
        }
      );
      const output = `${run.stdout}\n${run.stderr}`;
      expect(run.status, output).toBe(0);
      expect(output).toMatch(/migrations have been successfully applied/i);

      const c = new Client({ connectionString: hostDatabaseUrl(db) });
      await c.connect();
      try {
        const tables = await c.query<{ tablename: string }>(
          `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'foundation_decision%'`
        );
        expect(tables.rows.map((r) => r.tablename).sort()).toEqual([
          'foundation_decision_documents',
          'foundation_decision_members',
          'foundation_decision_rules',
          'foundation_decision_votes',
          'foundation_decisions',
        ]);

        const idx = await c.query<{ indexdef: string }>(
          `SELECT indexdef FROM pg_indexes WHERE indexname = 'foundation_eseals_single_active_key'`
        );
        expect(idx.rows).toHaveLength(1);
        expect(idx.rows[0].indexdef).toMatch(/WHERE \(revoked_at IS NULL\)/);
      } finally {
        await c.end();
      }
    },
    6 * 60_000
  );

  it(
    'migrasi yang gagal keluar non-zero sehingga deployment berhenti',
    () => {
      // Bad credentials stand in for any migration failure. The compose gate
      // (`service_completed_successfully`) turns a non-zero exit into a stopped
      // API, so this exit code is what prevents a stale-schema boot.
      const bad = hostDatabaseUrl('postgres').replace(/:[^:@/]*@/, ':definitely-wrong@');
      const run = docker(['run', '--rm', '--network', 'host', '-e', `DATABASE_URL=${bad}`, IMAGE], {
        timeout: 2 * 60_000,
      });
      expect(run.status).not.toBe(0);
      expect(run.stdout + run.stderr).toMatch(/P1000|Authentication failed/i);
    },
    3 * 60_000
  );
});
