/**
 * `getFinancialArrears` aggregates in the database — real PostgreSQL.
 *
 * The method used to load every unpaid invoice and its relations into Node and
 * sum in a loop. The rewrite moves the summary, the per-unit breakdown and the
 * top-15 rows into three `GROUP BY` queries, keeping only the rows it returns.
 * A mock cannot prove the SQL is valid or that the figures are identical; this
 * suite seeds a mixed book (partially paid, fully paid, overpaid, two invoice
 * units for one transferred pupil) and asserts the exact output.
 *
 * Opt-in via RUN_DB_TESTS=1, like the other DB suites.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

const describeDb = process.env.RUN_DB_TESTS ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const SEED = `
INSERT INTO units (id, name, type, address, updated_at) VALUES
  ('unit-sdit',  'SD IT',        'SD_IT',   'Alamat', now()),
  ('unit-smpit', 'SMP IT',       'SMP_IT',  'Alamat', now()),
  ('unit-pusat', 'Yayasan Pusat','OTHER',   'Alamat', now());

INSERT INTO users (id, name, email, is_active, updated_at) VALUES
  ('u-santri', 'Santri Pindah', 'santri@example.com', true, now());

-- The pupil is now in SMP IT.
INSERT INTO students
  (id, user_id, unit_id, nis, gender, birth_place, birth_date, address,
   parent_name, parent_phone, updated_at)
VALUES
  ('s1', 'u-santri', 'unit-smpit', '999', 'MALE', 'Cipansor', '2012-01-01',
   'Alamat', 'Orang Tua', '0812', now());

INSERT INTO payment_types (id, unit_id, name, code, amount, updated_at) VALUES
  ('pt-sdit',  'unit-sdit',  'SPP SD IT',  'SPP-SDIT',  100000, now()),
  ('pt-smpit', 'unit-smpit', 'SPP SMP IT', 'SPP-SMPIT', 100000, now());

-- inv-old: the pupil's debt from the unit it left. Overdue.
-- inv-settled: fully paid PENDING — must not count anywhere.
-- inv-overpaid: overpaid PARTIAL — must not count anywhere.
-- inv-new: current unit, partially paid, not yet due.
INSERT INTO invoices
  (id, student_id, payment_type_id, unit_id, invoice_number, amount, due_date,
   status, paid_amount, updated_at)
VALUES
  ('inv-old',      's1', 'pt-sdit',  'unit-sdit',  'INV-OLD',      500000, '2026-01-01', 'PENDING', 0,      now()),
  ('inv-settled',  's1', 'pt-sdit',  'unit-sdit',  'INV-SETTLED',  100000, '2026-01-02', 'PENDING', 100000, now()),
  ('inv-overpaid', 's1', 'pt-sdit',  'unit-sdit',  'INV-OVERPAID', 100000, '2026-01-03', 'PARTIAL', 150000, now()),
  ('inv-new',      's1', 'pt-smpit', 'unit-smpit', 'INV-NEW',      200000, '2030-01-01', 'PARTIAL', 50000,  now());
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

describeDb('Pengawasan financial arrears aggregation (real PostgreSQL)', () => {
  const dbName = `cipansor_arrears_${Date.now()}`;
  const baseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const targetUrl = (() => {
    const u = new URL(baseUrl);
    u.pathname = `/${dbName}`;
    return u.toString();
  })();

  let admin: Client;

  async function resetState(): Promise<void> {
    await withClient(targetUrl, async (db) => {
      await db.query(`UPDATE students SET unit_id = 'unit-smpit' WHERE id = 's1'`);
    });
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);

    await withClient(targetUrl, async (db) => {
      const dirs = readdirSync(MIGRATIONS)
        .filter((d) => d !== 'migration_lock.toml')
        .sort();
      for (const dir of dirs) {
        await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
      }
      await db.query(SEED);
    });
  }, 180_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(async () => {
    vi.resetModules();
    await resetState();
  });

  const loadService = async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = targetUrl;
    vi.resetModules();
    const mod = await import('../../src/modules/pengawasan/pengawasan.service');
    return { service: mod.pengawasanService, previousUrl };
  };

  const unloadService = async (previousUrl: string | undefined) => {
    process.env.DATABASE_URL = previousUrl;
    vi.resetModules();
  };

  it('matches the looped computation on a mixed book', async () => {
    const { service, previousUrl } = await loadService();
    try {
      const result = await service.getFinancialArrears();

      // inv-old (500000) + inv-new (150000); settled and overpaid excluded.
      expect(result.summary).toEqual({
        totalUnpaidAmount: 650000,
        totalUnpaidInvoicesCount: 2,
        overdueInvoicesCount: 1,
      });

      const byUnit = Object.fromEntries(result.unitBreakdown.map((u: any) => [u.unitId, u]));
      expect(byUnit['unit-sdit']).toMatchObject({
        unitName: 'SD IT',
        totalUnpaid: 500000,
        count: 1,
        overdueCount: 1,
      });
      expect(byUnit['unit-smpit']).toMatchObject({
        unitName: 'SMP IT',
        totalUnpaid: 150000,
        count: 1,
        overdueCount: 0,
      });
      // No unit for the settled/overpaid rows: they must not appear at all.
      expect(Object.keys(byUnit).sort()).toEqual(['unit-sdit', 'unit-smpit']);

      // One row per (pupil, invoice unit), largest first; the pupil's current
      // unit travels beside the invoice unit.
      expect(result.topArrearsStudents).toHaveLength(2);
      expect(result.topArrearsStudents[0]).toMatchObject({
        studentId: 's1',
        studentName: 'Santri Pindah',
        nis: '999',
        unitId: 'unit-sdit',
        unitName: 'SD IT',
        currentUnitId: 'unit-smpit',
        currentUnitName: 'SMP IT',
        totalUnpaid: 500000,
        invoiceCount: 1,
      });
      expect(result.topArrearsStudents[1]).toMatchObject({
        unitId: 'unit-smpit',
        totalUnpaid: 150000,
      });
    } finally {
      await unloadService(previousUrl);
    }
  });

  it('scopes every figure to the invoice unit of record', async () => {
    const { service, previousUrl } = await loadService();
    try {
      const result = await service.getFinancialArrears('unit-sdit');

      expect(result.summary).toEqual({
        totalUnpaidAmount: 500000,
        totalUnpaidInvoicesCount: 1,
        overdueInvoicesCount: 1,
      });
      expect(result.unitBreakdown).toHaveLength(1);
      expect(result.unitBreakdown[0]).toMatchObject({ unitId: 'unit-sdit', count: 1 });
      expect(result.topArrearsStudents).toHaveLength(1);
      expect(result.topArrearsStudents[0].unitId).toBe('unit-sdit');
    } finally {
      await unloadService(previousUrl);
    }
  });
});
