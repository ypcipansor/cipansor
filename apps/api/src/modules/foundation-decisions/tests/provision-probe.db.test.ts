/**
 * Bukti PostgreSQL NYATA untuk probe seed di `scripts/db-provision.sh`.
 *
 * Laporan Devin Review mengklaim XPath `/row/cnt/text()` pada
 * `query_to_xml(..., false, true, '')` mengembalikan 0 untuk basis data yang
 * sudah berisi data, sehingga seed destruktif (TRUNCATE) tetap berjalan.
 *
 * Klaim itu tidak dapat dinilai dari mock: yang menentukan hasil adalah parser
 * XML PostgreSQL sungguhan atas dokumen yang dihasilkan `query_to_xml`. Karena
 * itu tes ini mengeksekusi QUERY PROBE PERSIS yang diambil dari script — dibaca
 * dari file, bukan disalin — terhadap basis data nyata, lalu membandingkan
 * basis data berisi data dengan basis data kosong.
 *
 * Di-skip kecuali `RUN_DB_TESTS=1` (konvensi integration test lain di repo).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const RUN = process.env.RUN_DB_TESTS === '1';
const SCRIPT = path.resolve(__dirname, '../../../../../../scripts/db-provision.sh');

/**
 * Ambil string SQL PROBE dari script apa adanya.
 *
 * Diekstrak dari file sehingga perubahan query di script otomatis ikut teruji;
 * salinan literal di tes akan tetap hijau walau script diubah, yang justru
 * menghapus nilai regresinya.
 */
function extractProbeSql(): string {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const m = src.match(/SELECT COALESCE\(sum\(\(xpath\([\s\S]*?;\s*"/);
  if (!m) throw new Error('Probe SQL tidak ditemukan di scripts/db-provision.sh');
  return m[0].replace(/;\s*"$/, ';');
}

const PROBE_SQL = extractProbeSql();

function adminClient(): pg.Client {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = '/postgres';
  return new pg.Client({ connectionString: u.toString() });
}

function dbClient(name: string): pg.Client {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = `/${name}`;
  return new pg.Client({ connectionString: u.toString() });
}

async function dropDb(name: string): Promise<void> {
  const admin = adminClient();
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

describe.skipIf(!RUN)('db-provision.sh — probe seed menghitung baris nyata (bukan 0)', () => {
  const populated = `probe_populated_${Date.now()}`;
  const empty = `probe_empty_${Date.now()}`;

  beforeAll(async () => {
    const admin = adminClient();
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${populated}" WITH (FORCE)`);
      await admin.query(`DROP DATABASE IF EXISTS "${empty}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${populated}"`);
      await admin.query(`CREATE DATABASE "${empty}"`);
    } finally {
      await admin.end();
    }

    const full = dbClient(populated);
    await full.connect();
    try {
      await full.query('CREATE TABLE alpha(id int)');
      await full.query('CREATE TABLE beta(id int)');
      await full.query('INSERT INTO alpha VALUES (1),(2),(3)');
      await full.query('INSERT INTO beta VALUES (1)');
    } finally {
      await full.end();
    }

    const blank = dbClient(empty);
    await blank.connect();
    try {
      await blank.query('CREATE TABLE alpha(id int)');
      await blank.query('CREATE TABLE beta(id int)');
    } finally {
      await blank.end();
    }
  });

  afterAll(async () => {
    await dropDb(populated).catch(() => {});
    await dropDb(empty).catch(() => {});
  });

  /**
   * Inti laporan: database BERISI data (4 baris) harus dibaca > 0. Bila XPath
   * benar-benar mengembalikan 0 seperti klaim, pernyataan ini GAGAL.
   */
  it('basis data berisi data → probe > 0 (bukan 0)', async () => {
    const c = dbClient(populated);
    await c.connect();
    try {
      const r = await c.query(PROBE_SQL);
      const total = Number(r.rows[0]?.coalesce ?? r.rows[0]?.coalesce_0 ?? 0);
      expect(total).toBeGreaterThan(0);
      expect(total).toBe(4);
    } finally {
      await c.end();
    }
  });

  it('basis data benar-benar kosong → probe = 0', async () => {
    const c = dbClient(empty);
    await c.connect();
    try {
      const r = await c.query(PROBE_SQL);
      const total = Number(r.rows[0]?.coalesce ?? r.rows[0]?.coalesce_0 ?? 0);
      expect(total).toBe(0);
    } finally {
      await c.end();
    }
  });

  /**
   * `xpath('/row/cnt/text()', …)` harus membaca teks simpul. Dokumen XML yang
   * dihasilkan `query_to_xml` berbentuk `<row><cnt>N</cnt></row>`, jadi ekspresi
   * absolut ini valid; `/row/cnt/text()` dan `//cnt/text()` menghasilkan nilai
   * yang sama. Uji ini mengunci bentuk itu supaya klaim "selalu 0" tidak dapat
   * kembali tanpa bukti.
   */
  it('dokumen query_to_xml berbentuk <row><cnt>N</cnt></row>', async () => {
    const c = dbClient(populated);
    await c.connect();
    try {
      const r = await c.query(
        `SELECT (xpath('/row/cnt/text()', query_to_xml('SELECT count(*) AS cnt FROM alpha', false, true, '')))[1]::text AS slash,
                (xpath('//cnt/text()', query_to_xml('SELECT count(*) AS cnt FROM alpha', false, true, '')))[1]::text AS anylevel`
      );
      expect(r.rows[0].slash).toBe('3');
      expect(r.rows[0].anylevel).toBe('3');
    } finally {
      await c.end();
    }
  });
});
