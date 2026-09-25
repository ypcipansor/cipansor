/**
 * Regresi lock-contention — kontensi kunci serialisasi snapshot HARUS muncul
 * sebagai konflik yang dapat diulang (409), bukan 500.
 *
 * `create` menyerialkan dirinya terhadap seluruh mutasi `user_role_assignments`
 * lewat `LOCK TABLE … SHARE ROW EXCLUSIVE` dengan `lock_timeout` 5 detik. Bila
 * penugasan lain menahan kunci lebih lama, PostgreSQL melempar `55P03`.
 *
 * Galat itu TIDAK sampai ke pemanggil sebagai `err.code === '55P03'`: dengan
 * driver adapter Prisma 7 (`@prisma/adapter-pg`) ia dibungkus menjadi
 * `PrismaClientKnownRequestError` berkode `P2010`, dengan SQLSTATE asli tersimpan
 * di `meta.driverAdapterError.cause.originalCode`. Sebelum perbaikan,
 * `isLockConflictError` hanya memeriksa `err.code`, sehingga kontensi lolos ke
 * handler galat umum sebagai 500 — dan pesan "silakan ulangi" yang dijanjikan
 * komentar tidak pernah muncul.
 *
 * Test ini memegang kunci dari transaksi KEDUA yang benar-benar overlap (bukan
 * sleep), lalu memaku: `55P03` terdeteksi, dan `create` gagal sebagai konflik.
 */
import { describe, it, expect, afterEach } from 'vitest';
import pg from 'pg';
import { prisma } from '@/lib/prisma';
import {
  FoundationDecisionService,
  isLockConflictError,
} from '@/modules/foundation-decisions/foundation-decisions.service';

const RUN = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!RUN)('lock contention pada snapshot anggota', () => {
  const created: { userIds: string[]; decisionIds: string[] } = { userIds: [], decisionIds: [] };

  afterEach(async () => {
    if (created.decisionIds.length) {
      await prisma.foundationDecisionMember.deleteMany({
        where: { decisionId: { in: created.decisionIds } },
      });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: created.decisionIds } } });
      await prisma.foundationDecision.deleteMany({ where: { id: { in: created.decisionIds } } });
      created.decisionIds = [];
    }
    if (created.userIds.length) {
      await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: created.userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
      created.userIds = [];
    }
  });

  /**
   * Helper: `isLockConflictError` harus mengenali galat apa adanya dari Prisma.
   * Diuji langsung (tanpa DB) supaya bentuk pembungkusan yang berubah tertangkap
   * sebagai kegagalan unit, bukan hanya lewat efek sampingnya.
   */
  it('mengenali SQLSTATE yang dibungkus driver adapter Prisma 7', () => {
    expect(isLockConflictError({ code: '55P03' })).toBe(true);
    expect(isLockConflictError({ code: '40P01' })).toBe(true);
    expect(
      isLockConflictError({
        name: 'PrismaClientKnownRequestError',
        code: 'P2010',
        meta: {
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: { originalCode: '55P03', kind: 'postgres', code: '55P03' },
          },
        },
      })
    ).toBe(true);
    expect(isLockConflictError({ code: 'P2025' })).toBe(false);
    expect(isLockConflictError(new Error('boom'))).toBe(false);
    expect(isLockConflictError(null)).toBe(false);
  });

  it('create yang menunggu kunci lebih lama gagal sebagai konflik, bukan galat mentah', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creatorId = `itest-lock-creator-${suffix}`;
    const otherId = `itest-lock-other-${suffix}`;
    created.userIds.push(creatorId, otherId);

    await prisma.user.create({
      data: {
        id: creatorId,
        email: `${creatorId}@example.test`,
        name: 'Pembuat',
        passwordHash: 'x',
      },
    });
    await prisma.user.create({
      data: { id: otherId, email: `${otherId}@example.test`, name: 'Penahan', passwordHash: 'x' },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creatorId, roleId: pembina.id, isActive: true, isPrimary: true },
    });

    // Transaksi kedua memegang `ROW EXCLUSIVE` pada tabel penugasan tanpa
    // commit, sehingga `create` terblokir sampai `lock_timeout` habis.
    const blocker = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await blocker.connect();
    await blocker.query('BEGIN');
    await blocker.query(
      `INSERT INTO "user_role_assignments"
           (id, user_id, role_id, is_active, is_primary, assigned_at, created_at, updated_at)
         VALUES ($1, $2, $3, true, false, NOW(), NOW(), NOW())`,
      [`itest-lock-asg-${suffix}`, otherId, pembina.id]
    );

    const startedAt = Date.now();
    let caught: unknown = null;
    try {
      await FoundationDecisionService.create(
        { id: creatorId, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'CIRCULAR',
          subject: 'Uji kontensi kunci',
          body: 'Naskah uji kontensi kunci snapshot anggota.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );
    } catch (err) {
      caught = err;
    } finally {
      await blocker.query('ROLLBACK').catch(() => {});
      await blocker.end().catch(() => {});
    }

    expect(caught).not.toBeNull();
    // Inti regresi: bentuk galat NYATA dari Prisma harus dikenali oleh
    // `isLockConflictError` di dalam `.catch`, sehingga pemanggil menerima
    // konflik yang dapat diulang — bukan galat mentah 500.
    const e = caught as { statusCode?: number; status?: number; code?: string };
    expect(e.statusCode ?? e.status).toBe(409);
    expect(e.code).toBe('CONFLICT');
    // `lock_timeout` 5 detik harus menang atas timeout transaksi Prisma,
    // supaya penunggu tidak menggantung sampai 500.
    expect(Date.now() - startedAt).toBeLessThan(15_000);
    // Tidak ada keputusan parsial yang ter-commit.
    const leftovers = await prisma.foundationDecision.count({
      where: { createdById: creatorId },
    });
    expect(leftovers).toBe(0);
  }, 60_000);
});
