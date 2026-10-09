import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Production and staging run on Azure Database for PostgreSQL, which refuses
 * `CREATE EXTENSION` for any extension the server does not allow-list — and
 * ours allow none. CI and the local stack run stock Postgres, where every
 * contrib extension installs, so a migration that needs one passes every check
 * and then fails on the first managed server it meets.
 *
 * It happened on 2026-10-09: `20261009010100_signing_key_fingerprint` called
 * `CREATE EXTENSION pgcrypto` for `digest()`, staging refused it after the
 * column was already added, and every restart after that stopped on P3009.
 * PostgreSQL has `sha256()` built in since version 11; use built-ins.
 */

const MIGRATIONS = resolve(__dirname, '..', '..', 'prisma', 'migrations');

/** pgcrypto's own functions, which exist only once the extension is installed. */
const PGCRYPTO_ONLY =
  /\b(digest|hmac|crypt|gen_salt|pgp_sym_encrypt|pgp_sym_decrypt|pgp_pub_encrypt|pgp_pub_decrypt|armor|dearmor|gen_random_bytes)\s*\(/i;

function migrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      name: e.name,
      sql: readFileSync(join(MIGRATIONS, e.name, 'migration.sql'), 'utf8')
        // Comments may name the extension to explain why it is not used.
        .replace(/--.*$/gm, ''),
    }));
}

describe('migrations run on a managed Postgres', () => {
  it('reads every migration (the scan is not blind)', () => {
    const all = migrations();
    expect(all.length).toBeGreaterThan(40);
    expect(all.map((m) => m.name)).toContain('20261009010100_signing_key_fingerprint');
  });

  it('no migration installs an extension', () => {
    const offenders = migrations()
      .filter((m) => /\bCREATE\s+EXTENSION\b/i.test(m.sql))
      .map((m) => m.name);
    expect(
      offenders,
      'Azure Database for PostgreSQL refuses CREATE EXTENSION unless the server allow-lists it; use a built-in (sha256(), gen_random_uuid()) instead'
    ).toEqual([]);
  });

  it('no migration calls a function only pgcrypto provides', () => {
    const offenders = migrations()
      .filter((m) => PGCRYPTO_ONLY.test(m.sql))
      .map((m) => m.name);
    expect(
      offenders,
      'pgcrypto is not installed on the managed servers; use sha256() and friends'
    ).toEqual([]);
  });
});
