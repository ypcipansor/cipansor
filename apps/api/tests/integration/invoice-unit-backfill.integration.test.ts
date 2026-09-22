/**
 * Invoice unit-of-record backfill — real PostgreSQL.
 *
 * `20260922100000_invoice_unit_backfill` fills `invoices.unit_id` from the
 * invoice's payment type. `PaymentType.unit_id` is NOT NULL and
 * `invoices.payment_type_id` is a NOT NULL FK, so every legacy invoice resolves
 * its issuing unit with no guesswork. The migration then goes further than the
 * original column: it makes `unit_id` NOT NULL and switches the FK to RESTRICT,
 * which removes the read-time fallback to the pupil's current unit altogether.
 *
 * A mock cannot prove a correlated `UPDATE ... FROM`, the NOT NULL, the FK
 * change, or the abort on an unresolved row, so this runs the real SQL. As with
 * the other migration suites, the migration is applied through the *whole chain*
 * (from `0_init`) so the tables and FKs are real.
 *
 * Opt-in via RUN_DB_TESTS=1.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const CUTOFF = '20260922100000_invoice_unit_backfill';

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const SEED = `
INSERT INTO units (id, name, type, address, updated_at) VALUES
  ('unit-sd', 'SD IT', 'SD_IT', 'Alamat', now()),
  ('unit-smp', 'SMP IT', 'SMP_IT', 'Alamat', now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-1', 'Wali', 'wali@example.com', true, now());

INSERT INTO students (id, user_id, unit_id, nis, gender, birth_place, birth_date, address, parent_name, parent_phone, updated_at) VALUES
  ('s-1', 'u-1', 'unit-smp', '123', 'MALE', 'Cianjur', '2012-01-01', 'Alamat', 'Ayah', '0800', now());

INSERT INTO payment_types (id, unit_id, name, code, amount, updated_at) VALUES
  ('pt-sd',  'unit-sd',  'SPP SD IT',  'SPP-SD',  350000, now()),
  ('pt-smp', 'unit-smp', 'SPP SMP IT', 'SPP-SMP', 400000, now());

-- Legacy rows: no unit_id yet (the column is added by the migration under test).
INSERT INTO invoices (id, student_id, payment_type_id, invoice_number, amount, due_date, updated_at) VALUES
  ('inv-sd',  's-1', 'pt-sd',  'INV-SD-1',  350000, now(), now()),
  ('inv-smp', 's-1', 'pt-smp', 'INV-SMP-1', 400000, now(), now());
`;

async function withClient<T>(url: string, fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function migrateUpTo(db: Client, beforeDir?: string): Promise<void> {
  const dirs = readdirSync(MIGRATIONS)
    .filter((d) => d !== 'migration_lock.toml')
    .sort();
  for (const dir of dirs) {
    if (beforeDir && dir >= beforeDir) continue;
    await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
  }
}

describeDb('invoice unit backfill migration (real PostgreSQL)', () => {
  const dbName = `cipansor_invoice_backfill_${Date.now()}`;
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
    await admin.query(`CREATE DATABASE "${dbName}"`);

    await withClient(targetUrl, async (db) => {
      // Apply the chain up to (but not including) the migration under test, so
      // `unit_id` exists (added by 20260916100000, nullable + SET NULL) but is
      // unpopulated. Insert legacy rows, then run the migration.
      await migrateUpTo(db, CUTOFF);
      await db.query(SEED);
      await db.query(readFileSync(join(MIGRATIONS, CUTOFF, 'migration.sql'), 'utf8'));
    });
  }, 180_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  it('backfills each legacy invoice from its issuing payment type', async () => {
    await withClient(targetUrl, async (db) => {
      const rows = await db.query(
        `SELECT id, unit_id FROM invoices WHERE id IN ('inv-sd', 'inv-smp') ORDER BY id`
      );
      expect(rows.rows).toEqual([
        { id: 'inv-sd', unit_id: 'unit-sd' },
        { id: 'inv-smp', unit_id: 'unit-smp' },
      ]);
    });
  });

  it('does not attribute the invoice to the student’s current unit', async () => {
    await withClient(targetUrl, async (db) => {
      // The pupil is in SMP IT, but the SD IT bill stays on SD IT's books.
      const row = await db.query(`SELECT unit_id FROM invoices WHERE id = 'inv-sd'`);
      expect(row.rows[0].unit_id).toBe('unit-sd');
      expect(row.rows[0].unit_id).not.toBe('unit-smp');
    });
  });

  it('leaves invoice unit attribution unchanged after a student transfer', async () => {
    await withClient(targetUrl, async (db) => {
      await db.query(`UPDATE students SET unit_id = 'unit-sd' WHERE id = 's-1'`);
      const row = await db.query(`SELECT unit_id FROM invoices WHERE id = 'inv-smp'`);
      // The SMP IT invoice is frozen on the invoice row; moving the pupil does
      // not move it.
      expect(row.rows[0].unit_id).toBe('unit-smp');
    });
  });

  it('enforces unit_id NOT NULL', async () => {
    await withClient(targetUrl, async (db) => {
      const col = await db.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'invoices' AND column_name = 'unit_id'`
      );
      expect(col.rows[0].is_nullable).toBe('NO');
      await expect(
        db.query(`INSERT INTO invoices (id, student_id, payment_type_id, invoice_number, amount, due_date, unit_id)
                  VALUES ('inv-null', 's-1', 'pt-sd', 'INV-NULL', 1, now(), NULL)`)
      ).rejects.toThrow(/null value in column "unit_id"/i);
    });
  });

  it('refuses to hard-delete a unit that has issued invoices (RESTRICT)', async () => {
    await withClient(targetUrl, async (db) => {
      await expect(db.query(`DELETE FROM units WHERE id = 'unit-sd'`)).rejects.toThrow(
        /violates foreign key constraint/i
      );
    });
  });

  it('is idempotent — re-running the migration leaves data unchanged', async () => {
    await withClient(targetUrl, async (db) => {
      await db.query(readFileSync(join(MIGRATIONS, CUTOFF, 'migration.sql'), 'utf8'));
      const row = await db.query(`SELECT unit_id FROM invoices WHERE id = 'inv-smp'`);
      expect(row.rows[0].unit_id).toBe('unit-smp');
    });
  });
});
