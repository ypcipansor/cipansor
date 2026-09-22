/**
 * Finding A — provisioning a TRULY EMPTY database must succeed end-to-end.
 *
 * Devin Review flagged the key-binding migration's `sha256(...)` as depending on
 * a function that may not exist on an empty PostgreSQL. The concrete risk is
 * real even though the conclusion ("always fails on PG 16") was wrong:
 *
 *  - `sha256(bytea)` is a CORE function since PostgreSQL 11 (it is NOT part of
 *    the `pgcrypto` extension), so a plain `migrate deploy` works on the
 *    production `postgres:16-alpine` image with no `CREATE EXTENSION`.
 *  - An UNQUALIFIED `sha256` is resolved through `search_path`, so a user schema
 *    placed ahead of `pg_catalog` can shadow it with a function that returns a
 *    different digest. The migration would then "succeed" while writing
 *    fingerprints that never match `publicKeyFingerprint()` — the feature dies
 *    with no error at all.
 *  - PostgreSQL 18 adds a `sha256(text)` overload, so `sha256(public_key)` (no
 *    `convert_to`) happens to work there but raises `function sha256(text) does
 *    not exist` on PG 16. The correct, version-stable form is
 *    `pg_catalog.sha256(pg_catalog.convert_to(..., 'UTF8'))`.
 *
 * A mocked Prisma cannot prove any of this. This suite provisions an ephemeral
 * database and drives the REAL deployment mechanism (`prisma migrate deploy`),
 * then asserts the backfill fingerprint equals the application's own digest.
 *
 * Opt-in via RUN_DB_TESTS=1, consistent with the other DB integration suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { createPrismaClient } from '../../../../prisma/client';
import { createKeyMaterial, publicKeyFingerprint } from '@/utils/esign';
import type { PrismaClient } from '@prisma/client';

const RUN = process.env.RUN_DB_TESTS === '1';
const API_DIR = path.resolve(__dirname, '../../../..');
const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260917000000_foundation_decision_vote_key_binding/migration.sql'
);

/**
 * Build a DATABASE_URL for a brand-new database from the configured one.
 * The configured URL is the real one under RUN_DB_TESTS, so only the database
 * name changes.
 */
function urlForDatabase(name: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required for the provisioning suite.');
  const parsed = new URL(base);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/** Admin connection (to the always-present `postgres` maintenance database). */
function adminClient(): Client {
  const base = new URL(process.env.DATABASE_URL!);
  base.pathname = '/postgres';
  return new Client({ connectionString: base.toString() });
}

async function withAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = adminClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createDatabase(name: string): Promise<void> {
  await withAdmin((c) => c.query(`CREATE DATABASE "${name}"`));
}

async function dropDatabase(name: string): Promise<void> {
  await withAdmin(async (c) => {
    await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name]
    );
    await c.query(`DROP DATABASE IF EXISTS "${name}"`);
  });
}

/** Run the real deployment mechanism and return its combined output. */
function migrateDeploy(databaseUrl: string): string {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl };
  // `migrate deploy` never uses a shadow database; leaving one configured that
  // equals the target makes Prisma abort before running anything.
  delete env.SHADOW_DATABASE_URL;
  // The workspace-local Prisma binary, not `npx` — `npx` may fetch a different
  // major from the registry (it resolved an 8.x release candidate here) and
  // fail before any migration runs.
  const prismaBin = path.resolve(API_DIR, 'node_modules/.bin/prisma');
  return execFileSync(prismaBin, ['migrate', 'deploy', '--config', 'prisma/prisma.config.ts'], {
    cwd: API_DIR,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Extract the migration's backfill INSERT verbatim, so the test exercises the
 * SQL that actually ships rather than a hand-written copy.
 */
function backfillSql(): string {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const start = sql.indexOf('INSERT INTO "user_signing_key_history"');
  const end = sql.indexOf('ON CONFLICT ("user_id", "fingerprint") DO NOTHING;', start);
  if (start === -1 || end === -1) throw new Error('Backfill INSERT not found in migration.');
  const tail = 'ON CONFLICT ("user_id", "fingerprint") DO NOTHING;';
  return sql.slice(start, end + tail.length);
}

describe.skipIf(!RUN)('finding A — provisioning dari database kosong', () => {
  let prisma: PrismaClient;
  const databases: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    for (const db of databases) {
      await dropDatabase(db);
    }
  });

  function freshName(prefix: string): string {
    const name = `cipansor_mig_${prefix}_${randomBytes(4).toString('hex')}`;
    databases.push(name);
    return name;
  }

  /**
   * The headline regression: `prisma migrate deploy` against a database that
   * has never existed before must finish with EVERY migration applied. This is
   * what proves no extension or pre-installed helper is secretly required.
   */
  it('migrate deploy menyelesaikan seluruh rangkaian migrasi pada database kosong', async () => {
    const db = freshName('empty');
    await createDatabase(db);
    const output = migrateDeploy(urlForDatabase(db));
    expect(output).toMatch(/All migrations have been successfully applied/);

    const client = new Client({ connectionString: urlForDatabase(db) });
    await client.connect();
    try {
      // `_prisma_migrations` exists and no migration is left unapplied/failed.
      const { rows: applied } = await client.query<{
        count: string;
        unfinished: string;
      }>(
        `SELECT count(*)::text AS count,
                count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)::text AS unfinished
           FROM "_prisma_migrations"`
      );
      const migrationCount = fs
        .readdirSync(path.resolve(API_DIR, 'prisma/migrations'))
        .filter((entry) =>
          fs.statSync(path.resolve(API_DIR, 'prisma/migrations', entry)).isDirectory()
        ).length;
      expect(Number(applied[0].count)).toBe(migrationCount);
      expect(applied[0].unfinished).toBe('0');

      // The two tables this migration is responsible for actually exist.
      const { rows: tables } = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('user_signing_key_history', 'foundation_decision_votes')
          ORDER BY table_name`
      );
      expect(tables.map((t) => t.table_name)).toEqual([
        'foundation_decision_votes',
        'user_signing_key_history',
      ]);

      // Audit E — the partial unique index that enforces "at most one active
      // e-seal" lives ONLY in the migration SQL; `schema.prisma` cannot express
      // it. Prove the officially provisioned database actually carries it, so a
      // `db push`-shaped database would fail this assertion.
      const { rows: indexDef } = await client.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'foundation_eseals_single_active_key'`
      );
      expect(indexDef).toHaveLength(1);
      expect(indexDef[0].indexdef).toMatch(/UNIQUE/);
      expect(indexDef[0].indexdef).toMatch(/WHERE \(revoked_at IS NULL\)/);
    } finally {
      await client.end();
    }
  });

  /**
   * Audit E — on the OFFICIALLY provisioned database, two concurrent active
   * seals cannot coexist. The index is the enforcement; this drives two real
   * parallel INSERTs against the fresh database and asserts exactly one wins.
   */
  it('provisioning resmi: dua seal aktif paralel menyisakan tepat satu', async () => {
    const db = freshName('eseal');
    await createDatabase(db);
    migrateDeploy(urlForDatabase(db));

    const material = createKeyMaterial(`provisioning-seal-${db}`);
    const data = {
      algorithm: material.algorithm,
      publicKey: material.publicKey,
      encryptedPrivateKey: material.encryptedPrivateKey,
      kdfSalt: material.kdfSalt,
      kdfParams: material.kdfParams as never,
      iv: material.iv,
      authTag: material.authTag,
      activatedAt: new Date(),
    };
    const a = new Client({ connectionString: urlForDatabase(db) });
    const b = new Client({ connectionString: urlForDatabase(db) });
    await a.connect();
    await b.connect();
    try {
      const insert = (c: Client, id: string) =>
        c.query(
          `INSERT INTO "foundation_eseals"
             (id, algorithm, public_key, encrypted_private_key, kdf_salt, kdf_params, iv, auth_tag, activated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            id,
            data.algorithm,
            data.publicKey,
            data.encryptedPrivateKey,
            data.kdfSalt,
            JSON.stringify(data.kdfParams),
            data.iv,
            data.authTag,
          ]
        );
      const results = await Promise.allSettled([
        insert(a, 'prov-seal-a'),
        insert(b, 'prov-seal-b'),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect((failed[0].reason as { code?: string }).code).toBe('23505');

      const { rows: active } = await a.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "foundation_eseals" WHERE "revoked_at" IS NULL`
      );
      expect(active[0].count).toBe('1');
    } finally {
      await a.end();
      await b.end();
    }
  });

  /**
   * Backfill parity on a real database: the fingerprint the migration writes
   * must equal `publicKeyFingerprint()` byte for byte. A `user_signing_keys`
   * row is created first (the table exists after `0_init`), exactly the state
   * the backfill sees during deployment.
   */
  it('backfill migrasi merekonstruksi fingerprint yang sama dengan aplikasi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `mig-prov-u-${suffix}`,
        email: `mig-prov-${suffix}@example.test`,
        name: 'Provisioning',
        passwordHash: 'x',
      },
    });
    const material = createKeyMaterial(`provisioning-pass-${suffix}`);
    await prisma.userSigningKey.create({
      data: {
        id: `mig-prov-k-${suffix}`,
        userId: user.id,
        algorithm: material.algorithm,
        publicKey: material.publicKey,
        encryptedPrivateKey: material.encryptedPrivateKey,
        kdfSalt: material.kdfSalt,
        kdfParams: material.kdfParams as never,
        iv: material.iv,
        authTag: material.authTag,
      },
    });

    // Drop any pre-existing history so only the INSERT under test can create it.
    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });
    await prisma.$executeRawUnsafe(backfillSql());

    const history = await prisma.userSigningKeyHistory.findFirst({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
    });
    expect(history).not.toBeNull();
    expect(history!.fingerprint).toBe(publicKeyFingerprint(material.publicKey));

    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });
    await prisma.userSigningKey.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Shadowing guard: a hostile `sha256(bytea)` in a schema ahead of
   * `pg_catalog` must NOT be able to hijack the backfill. The migration
   * qualifies the call precisely so this test passes; an unqualified call would
   * silently write the wrong fingerprint.
   *
   * The backfill text the test executes is read from the shipped migration
   * file, but this check only proves the `pg_catalog.` qualifier works — it
   * cannot fail merely because somebody later drops the qualifier from the
   * file. The structural guard that keeps the file qualified lives in
   * `migration-header.test.ts`; this test proves the qualified form is
   * functionally immune to a hostile `search_path`.
   */
  it('fungsi sha256 yang menaungi search_path tidak dapat membajak backfill', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `mig-shadow-u-${suffix}`,
        email: `mig-shadow-${suffix}@example.test`,
        name: 'Shadow',
        passwordHash: 'x',
      },
    });
    const material = createKeyMaterial(`shadow-pass-${suffix}`);
    await prisma.userSigningKey.create({
      data: {
        id: `mig-shadow-k-${suffix}`,
        userId: user.id,
        algorithm: material.algorithm,
        publicKey: material.publicKey,
        encryptedPrivateKey: material.encryptedPrivateKey,
        kdfSalt: material.kdfSalt,
        kdfParams: material.kdfParams as never,
        iv: material.iv,
        authTag: material.authTag,
      },
    });
    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });

    const schema = `shadow_${randomBytes(3).toString('hex')}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    try {
      // A decoy with the same signature that always returns 32 zero bytes.
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION "${schema}".sha256(bytea) RETURNS bytea AS $$
           SELECT decode(repeat('00', 32), 'hex')
         $$ LANGUAGE sql IMMUTABLE`
      );

      await prisma.$transaction(async (tx) => {
        // Put the decoy schema first and `pg_catalog` explicitly AFTER it — the
        // realistic misconfiguration. An unqualified `sha256` then resolves to
        // the decoy; the migration's `pg_catalog.sha256` is immune.
        await tx.$executeRawUnsafe(`SET LOCAL search_path = "${schema}", pg_catalog, public`);

        // Sanity: the decoy really does shadow the unqualified name.
        const hijacked = await tx.$queryRawUnsafe<{ fp: string }[]>(
          `SELECT encode(sha256(convert_to('probe', 'UTF8')), 'hex') AS fp`
        );
        expect(hijacked[0].fp).toBe('00'.repeat(32));

        // The shipped backfill must ignore the decoy.
        await tx.$executeRawUnsafe(backfillSql());
      });

      const history = await prisma.userSigningKeyHistory.findFirst({
        where: { userId: user.id },
        orderBy: { issuedAt: 'desc' },
      });
      expect(history).not.toBeNull();
      expect(history!.fingerprint).toBe(publicKeyFingerprint(material.publicKey));
    } finally {
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${schema}".sha256(bytea)`);
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
