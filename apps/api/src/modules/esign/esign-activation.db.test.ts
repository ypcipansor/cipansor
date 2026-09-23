/**
 * Finding — aktivasi kunci konkuren saling menimpa, dengan PostgreSQL NYATA.
 *
 * `activateKey` melakukan baca-lalu-tulis (findUnique → deleteMany → create)
 * per pengguna. Dua permintaan yang benar-benar berjalan bersamaan dapat
 * sama-sama membaca "tidak ada kunci aktif", lalu yang kalah menghapus kunci
 * yang baru saja dibuat pemenangnya — sehingga kunci yang dikembalikan ke
 * pemanggil pemenang sudah tidak berlaku sebelum responsnya diterima.
 *
 * Uji ini tidak dapat dibuktikan dengan mock Prisma: yang diuji adalah
 * serialisasi transaksi NYATA, dan hasilnya bergantung pada urutan commit
 * PostgreSQL. Karena itu ia memakai basis data sungguhan dan benar-benar
 * menjalankan dua permintaan yang OVERLAP — dipaksa oleh table lock
 * `ACCESS EXCLUSIVE` pada `signing_key_requests` yang ditahan koneksi kontrol,
 * bukan sekadar `Promise.all` yang bisa saja kebetulan berurutan.
 *
 * Barrier-nya sengaja memakai kunci RELASI, bukan advisory lock implementasi:
 * ia menahan implementasi lama maupun baru pada titik yang sama (pembacaan
 * pengajuan), sehingga uji ini gagal SEBELUM perbaikan dan lulus SESUDAHNYA,
 * tanpa bergantung pada cara serialisasinya.
 *
 * Di-skip kecuali `RUN_DB_TESTS=1`, konsisten dengan suite integrasi lain.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPrismaClient } from '../../../prisma/client';
import { EsignService } from './esign.service';
import { SigningKeyRequestKind, SigningKeyRequestStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import pg from 'pg';

const RUN = process.env.RUN_DB_TESTS === '1';

/** Jumlah backend (selain milik kita) yang sedang menunggu kunci/relasi. */
async function blockedBackends(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
  return rows[0]?.n ?? 0;
}

async function waitForBlocked(
  prisma: PrismaClient,
  atLeast: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await blockedBackends(prisma)) >= atLeast) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

describe.skipIf(!RUN)('esign activateKey — balapan aktivasi (PostgreSQL nyata)', () => {
  let prisma: PrismaClient;
  const created: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const userId of created) {
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId } });
      await prisma.userSigningKey.deleteMany({ where: { userId } });
      await prisma.signingKeyRequest.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  /** Pengguna + satu pengajuan ENROLLMENT yang sudah disetujui. */
  async function approvedUser(prefix: string): Promise<string> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const id = `itest-${prefix}-${suffix}`;
    await prisma.user.create({
      data: { id, email: `${id}@example.test`, name: `Aktivasi ${prefix}`, passwordHash: 'x' },
    });
    await prisma.signingKeyRequest.create({
      data: {
        userId: id,
        kind: SigningKeyRequestKind.ENROLLMENT,
        status: SigningKeyRequestStatus.APPROVED,
        decidedAt: new Date(),
        grantedDays: 365,
      },
    });
    created.push(id);
    return id;
  }

  /**
   * Balapan sesungguhnya: table lock menahan kedua permintaan SEBELUM salah
   * satunya sempat membuat kunci, sehingga keduanya benar-benar overlap.
   */
  it(
    'hanya satu aktivasi konkuren yang sukses; kunci pemenang tetap menjadi kunci aktif',
    async () => {
      const userId = await approvedUser('race');

      // Koneksi kontrol menahan seluruh tabel `signing_key_requests`; kedua
      // permintaan aktivasi membacanya lebih dahulu, jadi keduanya MEMBLOKIR —
      // benar-benar overlap, bukan berurutan.
      const control = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await control.connect();
      await control.query('BEGIN');
      await control.query('LOCK TABLE "signing_key_requests" IN ACCESS EXCLUSIVE MODE');

      const first = EsignService.activateKey(userId, 'passphrase-first');
      expect(await waitForBlocked(prisma, 1, 8000)).toBe(true);
      const second = EsignService.activateKey(userId, 'passphrase-second');
      // Keduanya terparkir: bukti overlap.
      expect(await waitForBlocked(prisma, 2, 8000)).toBe(true);

      // Lepaskan latch: kedua permintaan lanjut dan saling berbaris.
      await control.query('COMMIT');
      await control.end().catch(() => {});

      const results = await Promise.allSettled([first, second]);
      const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
        id: string;
      }>[];
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      // Tepat satu pemenang; yang kalah mendapat konflik yang jelas.
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      const loserMessage = String(failed[0].reason?.message ?? failed[0].reason);
      expect(loserMessage).toMatch(/sudah memiliki kunci tanda tangan yang aktif/i);

      const winnerId = ok[0].value.id;
      // Kunci pemenang HARUS masih menjadi kunci aktif — tidak dihapus oleh
      // yang kalah sebelum respons pemenang diterima.
      const active = await prisma.userSigningKey.findUnique({ where: { userId } });
      expect(active?.id).toBe(winnerId);
      expect(active?.userId).toBe(userId);

      // Hanya satu kunci per pengguna, dan tidak ada riwayat kunci yang
      // tertandai digantikan (kunci ini belum pernah menerbitkan/menandatangani
      // apa pun, sehingga riwayatnya memang belum ada).
      const superseded = await prisma.userSigningKeyHistory.count({
        where: { userId, supersededAt: { not: null } },
      });
      expect(superseded).toBe(0);
    },
    30000
  );

  /**
   * Tanpa latch eksternal: N permintaan bersamaan tetap harus menyisakan satu
   * kunci aktif, yang `id`-nya sama dengan kunci yang dikembalikan pemenang.
   */
  it(
    'delapan aktivasi paralel tetap menyisakan satu kunci aktif milik pemenang',
    async () => {
      const userId = await approvedUser('storm');
      const calls = Array.from({ length: 8 }, (_, i) =>
        EsignService.activateKey(userId, `passphrase-${i}`)
      );
      const results = await Promise.allSettled(calls);
      const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
        id: string;
      }>[];
      expect(ok).toHaveLength(1);

      const active = await prisma.userSigningKey.findUnique({ where: { userId } });
      expect(active?.id).toBe(ok[0].value.id);

      const superseded = await prisma.userSigningKeyHistory.count({
        where: { userId, supersededAt: { not: null } },
      });
      expect(superseded).toBe(0);
    },
    30000
  );
});
