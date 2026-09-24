/**
 * Integration test dengan PostgreSQL NYATA.
 *
 * Audit #7 (concurrency seal) dan #11 (guard drift migrasi) tidak dapat
 * dibuktikan dengan mock Prisma: yang sedang diuji adalah invariant yang
 * ditegakkan BASIS DATA — indeks unik parsial dan preflight SQL. Sebuah mock
 * yang "selalu mengembalikan objek Prisma global" hanya akan membuktikan bahwa
 * kode memanggil mock itu.
 *
 * Test ini di-skip kecuali `RUN_DB_TESTS=1` (sama dengan konvensi integration
 * test lain di repo), sehingga `pnpm --filter api test` tetap hijau tanpa
 * basis data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createPrismaClient } from '../../../../prisma/client';
import { createSealMaterial, sealCanSign } from '@/utils/foundation-eseal';
import { foundationDecisionListWhere } from '@/utils/foundation-decision-access';
import { selectSnapshotAssignments } from '@/utils/foundation-authority';
import {
  FoundationDecisionService,
  isVoteAuthentic,
  canonicalDigestForVote,
} from '@/modules/foundation-decisions/foundation-decisions.service';
import { createKeyMaterial, publicKeyFingerprint, signPdfHash } from '@/utils/esign';
import { supersedeSigningKeyHistory, revokeSigningKeyHistory } from '@/utils/signing-key-history';
import { userService } from '@/modules/users/user.service';
import { EsignService } from '@/modules/esign/esign.service';
import type { PrismaClient } from '@prisma/client';
import pg from 'pg';

const RUN = process.env.RUN_DB_TESTS === '1';
const MIGRATION_SQL = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260916000000_foundation_decisions/migration.sql'
);
const MIGRATION_SQL_VOTE_KEY_BINDING = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260917000000_foundation_decision_vote_key_binding/migration.sql'
);

/**
 * Tunggu sampai ADA transaksi yang menunggu kunci pada `user_role_assignments`.
 *
 * Dibaca dari `pg_locks` (level kunci, bukan teks query), sehingga probe ini
 * tidak bergantung pada kalimat SQL yang dipakai implementasi — `FOR UPDATE`
 * baris maupun `LOCK TABLE … SHARE ROW EXCLUSIVE` sama-sama terlihat sebagai
 * `granted = false` pada relasi yang sama.
 */
async function waitForLockWaiterOnAssignments(
  client: PrismaClient,
  timeoutMs: number
): Promise<boolean> {
  return waitForLockWaiterOnRelation(client, 'user_role_assignments', timeoutMs);
}

/** Sama seperti di atas, untuk kunci baris `users` (offboarding). */
async function waitForLockWaiterOnUsers(client: PrismaClient, timeoutMs: number): Promise<boolean> {
  return waitForLockWaiterOnRelation(client, 'users', timeoutMs);
}

/** Sama seperti di atas, untuk kunci tabel `foundation_decision_rules`. */
async function waitForLockWaiterOnRules(client: PrismaClient, timeoutMs: number): Promise<boolean> {
  return waitForLockWaiterOnRelation(client, 'foundation_decision_rules', timeoutMs);
}

/**
 * Tunggu sampai ADA backend yang menunggu ADVISORY LOCK (`granted = false`).
 *
 * Dipakai untuk membuktikan `castVote` benar-benar memakai protokol lock
 * transisi kunci yang SAMA dengan `revokeKey`/`activateKey`: bila pemeriksa
 * hanya melihat transaksi mana pun yang terparkir, penunggu kunci BARIS
 * (mis. `ensureSigningKeyHistory`) akan salah dihitung sebagai bukti. Probe ini
 * spesifik pada `locktype = 'advisory'`.
 */
async function waitForAdvisoryLockWaiter(
  client: PrismaClient,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await client.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM pg_locks
      WHERE locktype = 'advisory' AND granted = false AND pid <> pg_backend_pid()`;
    if (rows[0]?.n) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

async function waitForLockWaiterOnRelation(
  client: PrismaClient,
  relation: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // `pg_locks` saja tidak cukup: menunggu kunci BARIS (`FOR SHARE` melawan
    // `UPDATE` yang sudah menulis) muncul sebagai `transactionid` tanpa
    // `relation`, jadi ia tak terlihat lewat `pg_class`. `pg_stat_activity`
    // menangkap kedua bentuk — penunggu kunci ditandai `wait_event_type =
    // 'Lock'` dan `query`-nya memuat nama relasinya.
    const rows = await client.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE ${'%' + relation + '%'}
        AND pid <> pg_backend_pid()`;
    if (rows[0]?.n) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

describe.skipIf(!RUN)('foundation-decisions integrasi PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    // Test ini mencabut seluruh seal aktif dan menerbitkan seal dengan
    // passphrase khusus test. Tanpa pembersihan, basis data pengembangan
    // ditinggalkan dengan seal aktif yang TAK DAPAT DIPAKAI API (passphrase
    // berbeda), dan approval berikutnya gagal. `ensureSeal` memang memulihkan
    // dirinya sendiri sekarang, tetapi test tidak boleh mengotori state
    // bersama sejak awal.
    await prisma.$executeRawUnsafe(
      `UPDATE "foundation_eseals" SET "revoked_at" = NOW() WHERE "revoked_at" IS NULL`
    );
    await prisma.$disconnect();
  });

  /**
   * Audit #7 — paling banyak SATU seal aktif yang usable.
   *
   * `ensureSeal` melakukan find-then-create. Dua approval pertama yang paralel
   * sama-sama tidak menemukan seal, lalu sama-sama membuat baru. Indeks unik
   * parsial `(true) WHERE revoked_at IS NULL` membuat keadaan itu mustahil:
   * insert kedua ditolak, dan aplikasi membaca ulang pemenangnya.
   */
  it('indeks unik parsial menolak seal aktif kedua', async () => {
    // Mulai dari keadaan bersih untuk invariant ini.
    await prisma.$executeRawUnsafe(
      `UPDATE "foundation_eseals" SET "revoked_at" = NOW() WHERE "revoked_at" IS NULL`
    );
    const material = createSealMaterial('integration-passphrase-2026');
    const row = {
      algorithm: material.algorithm,
      publicKey: material.publicKey,
      encryptedPrivateKey: material.encryptedPrivateKey,
      kdfSalt: material.kdfSalt,
      kdfParams: material.kdfParams as never,
      iv: material.iv,
      authTag: material.authTag,
      activatedAt: new Date(),
    };
    const first = await prisma.foundationEseal.create({ data: row });
    await expect(prisma.foundationEseal.create({ data: row })).rejects.toMatchObject({
      code: 'P2002',
    });
    // Yang pertama tetap satu-satunya aktif.
    const active = await prisma.foundationEseal.findMany({ where: { revokedAt: null } });
    expect(active.map((s) => s.id)).toEqual([first.id]);
    expect(sealCanSign(material, 'integration-passphrase-2026')).toBe(true);
  });

  /**
   * Audit #7 (concurrency) — dua penerbitan seal PARALEL menyisakan satu seal.
   *
   * Inilah bentuk balapan yang sebenarnya: dua approval pertama berjalan
   * bersamaan, keduanya membaca "belum ada seal yang dapat dipakai", lalu
   * keduanya menulis. Indeks unik parsial harus membuat tepat satu menang, dan
   * jalur "baca ulang pemenangnya" di aplikasi memastikan kedua permintaan
   * memakai seal yang SAMA. Uji ini menjalankan insert paralel nyata.
   */
  it('dua penerbitan seal paralel menghasilkan tepat satu seal aktif', async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "foundation_eseals" SET "revoked_at" = NOW() WHERE "revoked_at" IS NULL`
    );
    const material = createSealMaterial('integration-passphrase-2026');
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
    const results = await Promise.allSettled([
      prisma.foundationEseal.create({ data }),
      prisma.foundationEseal.create({ data }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatchObject({ code: 'P2002' });

    // Jalur aplikasi membaca ulang pemenangnya: kedua permintaan berakhir pada
    // satu seal yang sama.
    const active = await prisma.foundationEseal.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    expect(active).toHaveLength(1);
  });

  /**
   * Audit #9 — predikat daftar dijalankan terhadap PostgreSQL NYATA.
   *
   * Uji unit membuktikan `foundationDecisionListWhere` setara dengan
   * `canReadFoundationDecision` di memori. Itu belum membuktikan bahwa
   * predikatnya benar saat benar-benar dieksekusi Prisma: `members.some` harus
   * lolos kompilasi query dan menghasilkan baris yang tepat. Mantan anggota
   * (mis. rolenya kini GURU) harus menemukan keputusan yang memuat dirinya,
   * dan orang luar tidak melihat apa pun.
   */
  it('daftar: mantan anggota menemukan keputusannya, orang luar tidak', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-list-creator-${suffix}`,
        email: `itest-list-creator-${suffix}@example.test`,
        name: 'Pembuat Keputusan',
        passwordHash: 'x',
      },
    });
    const member = await prisma.user.create({
      data: {
        id: `itest-list-member-${suffix}`,
        email: `itest-list-member-${suffix}@example.test`,
        name: 'Mantan Anggota',
        passwordHash: 'x',
      },
    });
    const decision = await prisma.foundationDecision.create({
      data: {
        organType: 'PENGAWAS',
        kind: 'CIRCULAR',
        subject: `Keputusan integrasi ${suffix}`,
        body: 'Naskah uji akses daftar.',
        decisionType: 'pemberhentian-pengurus',
        status: 'VOTING',
        quorumSnapshot: {} as never,
        voteSummary: {} as never,
        createdById: creator.id,
        verificationToken: suffix,
        members: {
          create: [{ userId: member.id, name: 'Mantan Anggota', roleCode: 'YAYASAN_PENGAWAS' }],
        },
      },
    });

    // Mantan anggota: perannya kini di luar READ, tetapi ia ada di snapshot.
    const asFormer = await prisma.foundationDecision.findMany({
      where: { AND: [foundationDecisionListWhere({ id: member.id, roleCode: 'GURU' })] },
      select: { id: true },
    });
    expect(asFormer.map((r) => r.id)).toEqual([decision.id]);

    // Orang luar: tidak ada hubungan sama sekali.
    const asOutsider = await prisma.foundationDecision.findMany({
      where: { AND: [foundationDecisionListWhere({ id: creator.id, roleCode: 'GURU' })] },
      select: { id: true },
    });
    const stillVisibleToOutsider = asOutsider.filter((r) => r.id === decision.id);
    expect(stillVisibleToOutsider).toEqual([]);

    // Peran READ tetap melihat seluruh daftar.
    const asReader = await prisma.foundationDecision.findMany({
      where: { AND: [foundationDecisionListWhere({ id: creator.id, roleCode: 'YAYASAN_KETUA' })] },
      select: { id: true },
    });
    expect(asReader.map((r) => r.id)).toContain(decision.id);

    await prisma.foundationDecision.delete({ where: { id: decision.id } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, member.id] } } });
  });

  /**
   * Audit #1 — suara terikat rekaman kunci tepercaya, dan riwayatnya append-only.
   *
   * Foreign key `signing_key_id -> user_signing_key_history(id)` dengan
   * ON DELETE RESTRICT berarti rekaman kunci yang masih dirujuk suara tidak
   * dapat dihapus — inilah yang menjaga verifikasi historis tetap bekerja
   * setelah rotasi/pencabutan.
   */
  it('rekaman kunci yang dirujuk suara tidak dapat dihapus (ON DELETE RESTRICT)', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-u-${suffix}`,
        email: `itest-${suffix}@example.test`,
        name: 'Anggota Integrasi',
        passwordHash: 'x',
      },
    });
    const key = await prisma.userSigningKeyHistory.create({
      data: {
        id: `itest-k-${suffix}`,
        userId: user.id,
        algorithm: 'Ed25519',
        publicKey: 'pk-1',
        fingerprint: `fp-${suffix}`,
      },
    });
    const decision = await prisma.foundationDecision.create({
      data: {
        id: `itest-d-${suffix}`,
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        status: 'VOTING',
        subject: 'Integrasi',
        body: 'Isi',
        decisionType: 'integrasi',
        quorumSnapshot: {} as never,
        voteSummary: {} as never,
        createdById: user.id,
      },
    });
    await prisma.foundationDecisionVote.create({
      data: {
        id: `itest-v-${suffix}`,
        decisionId: decision.id,
        userId: user.id,
        choice: 'APPROVE',
        canonicalDigest: 'digest',
        signature: 'sig',
        publicKey: 'pk-1',
        algorithm: 'Ed25519',
        signedAt: new Date(),
        signingKeyId: key.id,
        publicKeyFingerprint: key.fingerprint,
      },
    });

    await expect(
      prisma.userSigningKeyHistory.delete({ where: { id: key.id } })
    ).rejects.toMatchObject({ code: 'P2003' });

    // Bersihkan (urutan mengikuti FK).
    await prisma.foundationDecisionVote.deleteMany({ where: { decisionId: decision.id } });
    await prisma.foundationDecision.delete({ where: { id: decision.id } });
    await prisma.userSigningKeyHistory.delete({ where: { id: key.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Audit #11/#5 — preflight menolak tabel yang HANYA kehilangan kolom `id`.
   *
   * Regresi ini spesifik: daftar expected columns dulu TIDAK memuat `id`,
   * sehingga tabel hasil `db push` yang kehilangan primary identifier-nya
   * lolos preflight lalu gagal dipakai Prisma. Tabel uji di bawah memuat
   * SELURUH kolom lain dengan tipe dan nullability yang benar — sehingga satu-
   * satunya hal yang tersisa untuk ditolak adalah `id` yang hilang. Bila `id`
   * kembali dihapus dari daftar guard, test ini gagal.
   */
  it('preflight migrasi menolak tabel yang kehilangan kolom id saja', async () => {
    const guard = parsePreflightBlock(fs.readFileSync(MIGRATION_SQL, 'utf8'));
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "foundation_decisions_bad"');
    // Salinan `foundation_decision_members` TANPA `id` (5 kolom -> 4).
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "foundation_decisions_bad" (
        "decision_id" TEXT NOT NULL,
        "user_id"     TEXT NOT NULL,
        "role_code"   TEXT NOT NULL,
        "name"        TEXT NOT NULL
      )`);
    const faked = guard.replace(/foundation_decision_members\b/g, 'foundation_decisions_bad');
    await expect(prisma.$executeRawUnsafe(faked)).rejects.toThrowError(/tidak memiliki kolom id/);
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "foundation_decisions_bad"');
  });

  /**
   * Audit #8 — kegagalan audit TIDAK boleh meninggalkan tulisan bisnis
   * ter-commit.
   *
   * Temuan menyebut baris create; verifikasi head menunjukkan `create`,
   * `castVote`, `applyLocked`, dan `upsertRule` sudah memakai satu transaksi.
   * Yang tidak pernah dibuktikan adalah ATOMISITASNYA dengan basis data nyata:
   * mock Prisma akan selalu "berhasil" dan tidak dapat me-rollback apa pun.
   *
   * Uji ini memaksa `audit_logs` gagal lewat constraint nyata (kolom `action`
   * NOT NULL / enum yang menolak nilai kosong), lalu memastikan baris bisnis
   * benar-benar tidak ada. Karena `auditLog` adalah tabel nyata, kegagalan itu
   * terjadi di dalam transaksi yang sama — persis jalur yang diklaim.
   */
  it('kegagalan audit me-rollback perubahan aturan kuorum', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-audit-${suffix}`,
        email: `itest-audit-${suffix}@example.test`,
        name: 'Admin Integrasi',
        passwordHash: 'x',
      },
    });
    const before = await prisma.foundationDecisionRule.findUnique({
      where: {
        organType_decisionKind: { organType: 'PEMBINA', decisionKind: 'CIRCULAR' },
      },
    });

    // Transaksi yang meniru `upsertRule`, tetapi audit-nya sengaja gagal
    // (action null melanggar NOT NULL).
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.foundationDecisionRule.upsert({
          where: {
            organType_decisionKind: { organType: 'PEMBINA', decisionKind: 'CIRCULAR' },
          },
          create: {
            organType: 'PEMBINA',
            decisionKind: 'CIRCULAR',
            quorumPresentMode: 'MUTLAK',
            quorumPresentValue: 1,
            quorumDecisionMode: 'MUTLAK',
            quorumDecisionValue: 1,
            updatedById: user.id,
          },
          update: { quorumPresentValue: 0.123456, updatedById: user.id },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: null as never,
            entity: 'FoundationDecisionRule',
            entityId: 'x',
          },
        });
      })
    ).rejects.toThrow();

    const after = await prisma.foundationDecisionRule.findUnique({
      where: {
        organType_decisionKind: { organType: 'PEMBINA', decisionKind: 'CIRCULAR' },
      },
    });
    // Perubahan aturan TIDAK ter-commit bersama kegagalan audit.
    expect(after?.quorumPresentValue ?? null).toEqual(before?.quorumPresentValue ?? null);

    await prisma.foundationDecisionRule.deleteMany({ where: { updatedById: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Regresi BUG — satu orang dengan DUA peran pada organ yang SAMA.
   *
   * Inilah bentuk yang tidak dapat dibuktikan mock: `distinct: ['userId']` di
   * PostgreSQL memilih baris mana yang bertahan TANPA urutan yang dijanjikan,
   * sehingga `roleCode` pada snapshot immutable (dan jabatan di PDF ber-e-seal)
   * dapat berubah mengikuti rencana query. Uji ini membuat dua penugasan nyata
   * (Bendahara lalu Ketua, TANPA primary) pada satu pengguna, menjalankan query
   * snapshot yang sama seperti `create`, lalu menyusutkannya dengan fungsi
   * produksi dan memastikan jabatannya Ketua — bukan kebetulan urutan baris.
   *
   * Barisnya sengaja di-insert dengan urutan "Bendahara dulu" supaya bila
   * penyusutan kembali bergantung pada urutan kembalian, yang menang adalah
   * Bendahara dan uji ini gagal.
   */
  it('satu orang dua peran satu organ → satu jabatan deterministik (Ketua)', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-multi-${suffix}`,
        email: `itest-multi-${suffix}@example.test`,
        name: 'Rangkap Dua Organ',
        passwordHash: 'x',
      },
    });
    // Pakai RoleCode NYATA (upsert, agar aman bila seed sudah membuatnya):
    // daftar prioritas jabatan memetakan nilai enum, jadi kode bersuffix akan
    // jatuh ke peringkat yang sama dan tie-break leksikografis yang menang.
    const bendahara = await prisma.role.upsert({
      where: { code: 'YAYASAN_BENDAHARA' },
      create: { code: 'YAYASAN_BENDAHARA', name: 'Bendahara', realm: 'YAYASAN' },
      update: {},
    });
    const ketua = await prisma.role.upsert({
      where: { code: 'YAYASAN_KETUA' },
      create: { code: 'YAYASAN_KETUA', name: 'Ketua', realm: 'YAYASAN' },
      update: {},
    });
    // Sengaja tanpa `isPrimary`, dan Bendahara di-insert lebih dulu.
    await prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: bendahara.id, isPrimary: false },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: ketua.id, isPrimary: false },
    });

    const rows = await prisma.userRoleAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        id: true,
        userId: true,
        isPrimary: true,
        user: { select: { id: true, name: true } },
        role: { select: { code: true } },
      },
    });
    // Prasyarat uji: barisnya benar-benar dua, dan urutan kembalian PostgreSQL
    // bukan yang menentukan hasil.
    expect(rows).toHaveLength(2);
    const collapsed = selectSnapshotAssignments(
      'PENGURUS',
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        isPrimary: r.isPrimary,
        roleCode: r.role.code,
        user: r.user,
      }))
    );
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].roleCode).toBe('YAYASAN_KETUA');

    await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Pasangan dari uji di atas: penugasan PRIMARY menang atas senioritas.
   *
   * Aturan organ yang sebenarnya adalah `isPrimary` penugasan resmi — daftar
   * prioritas hanya menengahi ketika tidak ada primary yang jelas. Uji ini
   * memaku bahwa Bendahara yang ditandai primary TETAP menang walau Ketua
   * (tanpa primary) lebih senior.
   */
  it('penugasan primary menang atas senioritas jabatan', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-primary-${suffix}`,
        email: `itest-primary-${suffix}@example.test`,
        name: 'Primary Menang',
        passwordHash: 'x',
      },
    });
    const bendahara = await prisma.role.upsert({
      where: { code: 'YAYASAN_BENDAHARA' },
      create: { code: 'YAYASAN_BENDAHARA', name: 'Bendahara', realm: 'YAYASAN' },
      update: {},
    });
    const ketua = await prisma.role.upsert({
      where: { code: 'YAYASAN_KETUA' },
      create: { code: 'YAYASAN_KETUA', name: 'Ketua', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: ketua.id, isPrimary: false },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: user.id, roleId: bendahara.id, isPrimary: true },
    });

    const rows = await prisma.userRoleAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: {
        id: true,
        userId: true,
        isPrimary: true,
        user: { select: { id: true, name: true } },
        role: { select: { code: true } },
      },
    });
    const collapsed = selectSnapshotAssignments(
      'PENGURUS',
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        isPrimary: r.isPrimary,
        roleCode: r.role.code,
        user: r.user,
      }))
    );
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].roleCode).toBe('YAYASAN_BENDAHARA');

    await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Flags–Investigation #7 — daur hidup `UserSigningKeyHistory` ditulis, dan
   * suara historis tetap terverifikasi setelah kunci digantikan/dicabut.
   *
   * Tidak dapat dibuktikan dengan mock: yang diuji adalah baris NYATA di
   * `user_signing_key_history` yang di-`UPDATE` oleh jalur supersede/revoke,
   * dan verifikasi tanda tangan Ed25519 atas digest kanonis lewat rekaman
   * riwayat itu — bukan sekadar bahwa sebuah fungsi mock dipanggil.
   */
  it('daur hidup kunci: supersede/revoke menstempel riwayat, suara lama tetap sah', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const PASS = 'integrasi-passphrase-2026';
    const material = createKeyMaterial(PASS);
    const user = await prisma.user.create({
      data: {
        id: `itest-key-${suffix}`,
        email: `itest-key-${suffix}@example.test`,
        name: 'Pemilik Kunci Integrasi',
        passwordHash: 'x',
      },
    });
    const fingerprint = publicKeyFingerprint(material.publicKey);
    const history = await prisma.userSigningKeyHistory.create({
      data: {
        id: `itest-kh-${suffix}`,
        userId: user.id,
        algorithm: material.algorithm,
        publicKey: material.publicKey,
        fingerprint,
      },
    });
    const decision = await prisma.foundationDecision.create({
      data: {
        id: `itest-kd-${suffix}`,
        organType: 'PEMBINA',
        kind: 'MEETING',
        status: 'VOTING',
        subject: 'Integrasi daur hidup kunci',
        body: 'Isi keputusan yang cukup panjang.',
        decisionType: 'umum',
        quorumSnapshot: { activeCount: 1, kind: 'MEETING' } as never,
        voteSummary: {} as never,
        createdById: user.id,
      },
    });
    await prisma.foundationDecisionMember.create({
      data: {
        id: `itest-km-${suffix}`,
        decisionId: decision.id,
        userId: user.id,
        roleCode: 'YAYASAN_PEMBINA',
        name: user.name,
      },
    });

    const signedAt = new Date();
    const digest = canonicalDigestForVote(
      { ...decision, members: [{ userId: user.id }] } as never,
      { userId: user.id, choice: 'APPROVE', signedAt }
    );
    const vote = await prisma.foundationDecisionVote.create({
      data: {
        id: `itest-kv-${suffix}`,
        decisionId: decision.id,
        userId: user.id,
        choice: 'APPROVE',
        canonicalDigest: digest,
        signature: signPdfHash(material, PASS, digest),
        publicKey: material.publicKey,
        algorithm: material.algorithm,
        signedAt,
        signingKeyId: history.id,
        publicKeyFingerprint: fingerprint,
      },
      include: { signingKey: true },
    });

    const context = {
      ...decision,
      members: [{ userId: user.id }],
    };
    expect(
      isVoteAuthentic(context as never, { ...vote, signingKey: vote.signingKey } as never)
    ).toBe(true);

    // Kunci digantikan: riwayatnya distempel, bukan dihapus.
    await supersedeSigningKeyHistory(prisma, {
      userId: user.id,
      publicKey: material.publicKey,
    });
    const superseded = await prisma.userSigningKeyHistory.findUnique({
      where: { id: history.id },
    });
    expect(superseded?.supersededAt).toBeInstanceOf(Date);

    // Kunci dicabut: `revokedAt` pula, tanpa menghapus `supersededAt`.
    const revokedAt = new Date(Date.now() + 1000);
    await revokeSigningKeyHistory(
      prisma,
      { userId: user.id, publicKey: material.publicKey },
      revokedAt
    );
    const revoked = await prisma.userSigningKeyHistory.findUnique({
      where: { id: history.id },
    });
    expect(revoked?.revokedAt?.getTime()).toBe(revokedAt.getTime());
    expect(revoked?.supersededAt).toBeInstanceOf(Date);

    // Suara yang sudah sah TETAP terverifikasi lewat kunci publik lamanya.
    const reloadedVote = await prisma.foundationDecisionVote.findUnique({
      where: { id: vote.id },
      include: { signingKey: true },
    });
    expect(
      isVoteAuthentic(
        context as never,
        { ...reloadedVote!, signingKey: reloadedVote!.signingKey } as never
      )
    ).toBe(true);

    await prisma.foundationDecisionVote.deleteMany({ where: { decisionId: decision.id } });
    await prisma.foundationDecisionMember.deleteMany({ where: { decisionId: decision.id } });
    await prisma.foundationDecision.delete({ where: { id: decision.id } });
    await prisma.userSigningKeyHistory.delete({ where: { id: history.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Flag Investigation (D) — migrasi tidak boleh MEMPROMOSIKAN public key yang
   * di-assert suara menjadi kunci tepercaya.
   *
   * Versi lama migrasi membuat baris `user_signing_key_history` dari
   * `foundation_decision_votes.public_key`. Bila baris suara disisipkan di luar
   * jalur aplikasi (kunci karangan penyerang), migrasi mengangkatnya menjadi
   * rekaman tepercaya — dan suara palsu yang seharusnya ditolak `isVoteAuthentic`
   * berubah menjadi "sah" hanya karena migrasi dijalankan. Uji ini menjalankan
   * blok migrasi terhadap PostgreSQL nyata pada baris suara dengan kunci
   * arbitrer, dan membuktikan (a) migrasi MENOLAK dengan keras, dan (b) bila
   * guard dilonggarkan, kunci itu tidak akan pernah menjadi tepercaya karena
   * `signing_key_id` tetap NULL.
   */
  it('guard migrasi menolak suara dengan public key yang tidak dapat dibuktikan', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-backfill-${suffix}`,
        email: `itest-backfill-${suffix}@example.test`,
        name: 'Pemilih Tanpa Terbitan',
        passwordHash: 'x',
      },
    });
    const decision = await prisma.foundationDecision.create({
      data: {
        id: `itest-backfill-d-${suffix}`,
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        status: 'VOTING',
        subject: 'Integrasi backfill',
        body: 'Isi',
        decisionType: 'umum',
        quorumSnapshot: {} as never,
        voteSummary: {} as never,
        createdById: user.id,
      },
    });
    const arbitraryPublicKey = `arbitrary-public-key-${suffix}`;
    const vote = await prisma.foundationDecisionVote.create({
      data: {
        id: `itest-backfill-v-${suffix}`,
        decisionId: decision.id,
        userId: user.id,
        choice: 'APPROVE',
        canonicalDigest: 'digest',
        signature: 'sig',
        publicKey: arbitraryPublicKey,
        algorithm: 'Ed25519',
        signedAt: new Date(),
      },
    });

    const sql = fs.readFileSync(MIGRATION_SQL_VOTE_KEY_BINDING, 'utf8');
    const guard = parseDoBlockContaining(
      sql,
      'tidak dapat dibuktikan berasal dari penerbitan resmi'
    );

    // (a) Migrasi MENOLAK: baris suara ber-kunci arbitrer tidak boleh ada.
    await expect(prisma.$executeRawUnsafe(guard)).rejects.toThrowError(
      /tidak dapat dibuktikan berasal dari penerbitan resmi/
    );

    // (b) Kunci arbitrer itu TIDAK pernah menjadi rekaman tepercaya, dan
    //     baris suara tetap tanpa pengikat.
    const leaked = await prisma.userSigningKeyHistory.findFirst({
      where: { userId: user.id, publicKey: arbitraryPublicKey },
    });
    expect(leaked).toBeNull();

    const reloadedVote = await prisma.foundationDecisionVote.findUnique({
      where: { id: vote.id },
      include: { signingKey: { select: { publicKey: true } } },
    });
    expect(reloadedVote?.signingKeyId).toBeNull();
    expect(reloadedVote?.signingKey).toBeNull();
    // Fail closed: `trustedKeyForVote` mengembalikan null untuk baris tanpa
    // pengikat, sehingga suara ini tidak pernah dihitung ke kuorum.
    expect(
      isVoteAuthentic(
        {
          id: decision.id,
          organType: 'PEMBINA',
          kind: 'CIRCULAR',
          decisionType: 'umum',
          subject: 'Integrasi backfill',
          body: 'Isi',
          createdAt: decision.createdAt,
          quorumSnapshot: { activeCount: 1 },
          members: [{ userId: user.id }],
        } as never,
        reloadedVote as never
      )
    ).toBe(false);

    await prisma.foundationDecisionVote.deleteMany({ where: { decisionId: decision.id } });
    await prisma.foundationDecision.delete({ where: { id: decision.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Sisi lain: suara yang public key-nya MEMANG milik kunci yang sedang
   * diterbitkan (rekaman backfill dari `user_signing_keys`) tidak membuat
   * guard menyala, dan barisnya juga tidak dipromosikan — pengikatnya tetap
   * NULL sampai aplikasi menuliskannya sendiri.
   */
  it('guard migrasi tidak menyala untuk suara yang kuncinya ada di riwayat resmi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-backfill-ok-${suffix}`,
        email: `itest-backfill-ok-${suffix}@example.test`,
        name: 'Pemilih Resmi',
        passwordHash: 'x',
      },
    });
    const material = createKeyMaterial(`pass-${suffix}`);
    const fingerprint = publicKeyFingerprint(material.publicKey);
    await prisma.userSigningKeyHistory.create({
      data: {
        id: `itest-backfill-k-${suffix}`,
        userId: user.id,
        algorithm: material.algorithm,
        publicKey: material.publicKey,
        fingerprint,
      },
    });
    const decision = await prisma.foundationDecision.create({
      data: {
        id: `itest-backfill-okd-${suffix}`,
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        status: 'VOTING',
        subject: 'Integrasi backfill ok',
        body: 'Isi',
        decisionType: 'umum',
        quorumSnapshot: {} as never,
        voteSummary: {} as never,
        createdById: user.id,
      },
    });
    const vote = await prisma.foundationDecisionVote.create({
      data: {
        id: `itest-backfill-okv-${suffix}`,
        decisionId: decision.id,
        userId: user.id,
        choice: 'APPROVE',
        canonicalDigest: 'digest',
        signature: 'sig',
        publicKey: material.publicKey,
        algorithm: material.algorithm,
        signedAt: new Date(),
      },
    });

    const sql = fs.readFileSync(MIGRATION_SQL_VOTE_KEY_BINDING, 'utf8');
    const guard = parseDoBlockContaining(
      sql,
      'tidak dapat dibuktikan berasal dari penerbitan resmi'
    );
    // `$executeRawUnsafe` returns a command tag/count for a `DO` block, not
    // `undefined`, so assert only that it does NOT throw.
    await expect(prisma.$executeRawUnsafe(guard)).resolves.not.toThrow();

    // Guard tidak menulis pengikat apa pun: baris suara tetap NULL.
    const reloadedVote = await prisma.foundationDecisionVote.findUnique({
      where: { id: vote.id },
    });
    expect(reloadedVote?.signingKeyId).toBeNull();
    expect(reloadedVote?.publicKeyFingerprint).toBeNull();

    await prisma.foundationDecisionVote.deleteMany({ where: { decisionId: decision.id } });
    await prisma.foundationDecision.delete({ where: { id: decision.id } });
    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
  /**
   * Bug A — backfill migrasi WAJIB berjalan pada PostgreSQL kosong.
   *
   * Temuan Devin Review menduga `sha256(...)` di
   * `apps/api/prisma/migrations/20260917000000_foundation_decision_vote_key_binding/migration.sql`
   * tidak tersedia pada baseline sehingga `prisma migrate deploy` selalu gagal
   * di basis data baru. Itu TIDAK benar untuk PostgreSQL 16 (lihat laporan
   * audit), tetapi tebakannya menyentuh invariant yang nyata: fingerprint yang
   * direkonstruksi migrasi HARUS sama persis dengan `publicKeyFingerprint()`
   * yang dipakai aplikasi, dan mekanismenya harus benar-benar ada di server.
   *
   * Uji ini menjalankan pernyataan backfill ASLI dari berkas migrasi (bukan
   * salinannya) terhadap basis data nyata, lalu membandingkan hasilnya dengan
   * fingerprint aplikasi. Mengganti `sha256(convert_to(...,'UTF8'))` dengan
   * sesuatu yang tidak setara — termasuk `sha256(text)` yang tidak ada — akan
   * menggagalkannya.
   */
  it('backfill migrasi merekonstruksi fingerprint yang sama dengan aplikasi', async () => {
    const sql = fs.readFileSync(MIGRATION_SQL_VOTE_KEY_BINDING, 'utf8');
    const insertStart = sql.indexOf('INSERT INTO "user_signing_key_history"');
    const insertEnd = sql.indexOf(
      'ON CONFLICT ("user_id", "fingerprint") DO NOTHING;',
      insertStart
    );
    expect(insertStart).toBeGreaterThan(-1);
    expect(insertEnd).toBeGreaterThan(insertStart);
    const backfill = sql.slice(
      insertStart,
      insertEnd + 'ON CONFLICT ("user_id", "fingerprint") DO NOTHING;'.length
    );

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-backfill-${suffix}`,
        email: `itest-backfill-${suffix}@example.test`,
        name: 'Backfill Integrasi',
        passwordHash: 'x',
      },
    });
    const material = createKeyMaterial('backfill-passphrase-2026');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-key-${suffix}`,
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

    await prisma.$executeRawUnsafe(backfill);

    const history = await prisma.userSigningKeyHistory.findFirst({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
    });
    expect(history).not.toBeNull();
    // Inti invariant: fingerprint yang ditulis SQL identik dengan yang dihitung
    // aplikasi. Kalau tidak, setiap suara yang menunjuk rekaman ini akan
    // ditolak `trustedKeyForVote` (fail closed) — fitur diam-diam mati.
    expect(history!.fingerprint).toBe(publicKeyFingerprint(material.publicKey));

    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });
    await prisma.userSigningKey.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Audit B — rotasi kunci paralel tidak boleh menyisakan suara TAK AUTENTIK.
   *
   * Race yang diklaim: `castVote` membaca kunci, menandatangani, lalu menulis.
   * Bila rotasi (`esign.activateKey` — `supersededSigningKeyHistory` + ganti
   * `UserSigningKey`) commit di sela-selanya, baris suara yang terlanjur ditulis
   * ditolak `isVoteAuthentic` (kunci tidak berlaku pada `signedAt`) tetapi tetap
   * ada, sehingga retry diblokir.
   *
   * Perbaikannya dibuktikan di sini tanpa akses ke internal service: ambil
   * kunci pertama, tanda tangani satu suara, lalu ROTASI kunci SEBELUM menulis.
   * Baris suara yang menunjuk kunci lama harus ditolak `isVoteAuthentic` setelah
   * rotasi (membuktikan rotasi benar-benar membuat suara lama tak sah), dan
   * seorang pemilih yang belum menulis dapat mencoba lagi dengan kunci baru dan
   * menghasilkan suara yang DITERIMA.
   */
  it('rotasi kunci menolak suara kunci lama dan tidak memblokir retry dengan kunci baru', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-rotate-u-${suffix}`,
        email: `itest-rotate-${suffix}@example.test`,
        name: 'Pemilih Rotasi',
        passwordHash: 'x',
      },
    });
    const decision = await prisma.foundationDecision.create({
      data: {
        id: `itest-rotate-d-${suffix}`,
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        status: 'VOTING',
        subject: 'Rotasi kunci',
        body: 'Naskah uji race rotasi.',
        decisionType: 'uji-rotasi',
        quorumSnapshot: { activeCount: 1 } as never,
        voteSummary: {} as never,
        createdById: user.id,
        members: {
          create: [{ userId: user.id, name: 'Pemilih Rotasi', roleCode: 'YAYASAN_PEMBINA' }],
        },
      },
      include: { members: true },
    });

    // Kunci pertama.
    const first = createKeyMaterial('rotate-pass-1');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-rotate-k1-${suffix}`,
        userId: user.id,
        algorithm: first.algorithm,
        publicKey: first.publicKey,
        encryptedPrivateKey: first.encryptedPrivateKey,
        kdfSalt: first.kdfSalt,
        kdfParams: first.kdfParams as never,
        iv: first.iv,
        authTag: first.authTag,
      },
    });
    const record = await prisma.userSigningKeyHistory.create({
      data: {
        id: `itest-rotate-h1-${suffix}`,
        userId: user.id,
        algorithm: first.algorithm,
        publicKey: first.publicKey,
        fingerprint: publicKeyFingerprint(first.publicKey),
        issuedAt: new Date(Date.now() - 60_000),
      },
    });

    // Suara ditandatangani dengan kunci PERTAMA.
    const signedAt = new Date();
    const ctx = {
      id: decision.id,
      organType: decision.organType,
      kind: decision.kind,
      decisionType: decision.decisionType,
      subject: decision.subject,
      body: decision.body,
      createdAt: decision.createdAt,
      quorumSnapshot: { activeCount: 1 },
      members: [{ userId: user.id }],
    };
    const digest = canonicalDigestForVote(ctx, { userId: user.id, choice: 'APPROVE', signedAt });
    const signature = signPdfHash(first, 'rotate-pass-1', digest);

    // ROTASI: kunci pertama digantikan SEBELUM suara ditulis, dengan cap waktu
    // rotasi yang jatuh pada/sebelum `signedAt` — bentuk yang ditemukan review:
    // kunci dibaca, rotasi commit, lalu `castVote` tetap menandatangani dengan
    // kunci lama dan menulis `signedAt` setelah cap rotasi. Inilah keadaan yang
    // dulu meninggalkan suara tersimpan-tetapi-tak-sah.
    const rotatedAt = new Date(signedAt.getTime() - 1000);
    await supersedeSigningKeyHistory(
      prisma,
      { userId: user.id, publicKey: first.publicKey },
      rotatedAt
    );

    const vote = await prisma.foundationDecisionVote.create({
      data: {
        id: `itest-rotate-v-${suffix}`,
        decisionId: decision.id,
        userId: user.id,
        choice: 'APPROVE',
        canonicalDigest: digest,
        signature,
        publicKey: first.publicKey,
        algorithm: first.algorithm,
        signedAt,
        signingKeyId: record.id,
        publicKeyFingerprint: record.fingerprint,
      },
      include: { signingKey: true },
    });

    // Suara itu TIDAK autentik setelah rotasi — inilah bahaya yang harus
    // dicegah agar tidak pernah ter-commit.
    expect(isVoteAuthentic(ctx, vote as never)).toBe(false);

    // Retry tetap MUNGKIN: baris lama dapat dihapus (itulah yang dilakukan
    // transaksi `castVote` saat rollback), lalu pemilih menandatangani ulang
    // dengan kunci baru dan suaranya diterima.
    await prisma.foundationDecisionVote.delete({ where: { id: vote.id } });
    const second = createKeyMaterial('rotate-pass-2');
    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });
    await prisma.userSigningKey.deleteMany({ where: { userId: user.id } });
    await prisma.userSigningKey.create({
      data: {
        id: `itest-rotate-k2-${suffix}`,
        userId: user.id,
        algorithm: second.algorithm,
        publicKey: second.publicKey,
        encryptedPrivateKey: second.encryptedPrivateKey,
        kdfSalt: second.kdfSalt,
        kdfParams: second.kdfParams as never,
        iv: second.iv,
        authTag: second.authTag,
      },
    });
    const record2 = await prisma.userSigningKeyHistory.create({
      data: {
        id: `itest-rotate-h2-${suffix}`,
        userId: user.id,
        algorithm: second.algorithm,
        publicKey: second.publicKey,
        fingerprint: publicKeyFingerprint(second.publicKey),
        issuedAt: new Date(),
      },
    });
    const signedAt2 = new Date(Date.now() + 2000);
    const digest2 = canonicalDigestForVote(ctx, {
      userId: user.id,
      choice: 'APPROVE',
      signedAt: signedAt2,
    });
    const vote2 = await prisma.foundationDecisionVote.create({
      data: {
        id: `itest-rotate-v2-${suffix}`,
        decisionId: decision.id,
        userId: user.id,
        choice: 'APPROVE',
        canonicalDigest: digest2,
        signature: signPdfHash(second, 'rotate-pass-2', digest2),
        publicKey: second.publicKey,
        algorithm: second.algorithm,
        signedAt: signedAt2,
        signingKeyId: record2.id,
        publicKeyFingerprint: record2.fingerprint,
      },
      include: { signingKey: true },
    });
    expect(isVoteAuthentic(ctx, vote2 as never)).toBe(true);

    await prisma.foundationDecisionVote.deleteMany({ where: { decisionId: decision.id } });
    await prisma.foundationDecision.delete({ where: { id: decision.id } });
    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: user.id } });
    await prisma.userSigningKey.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * Audit C — dua transisi publication PARALEL harus menghasilkan audit yang
   * berurutan, bukan `oldValues` basi yang sama.
   *
   * Sebelum perbaikan, `publication` dibaca di luar transaksi lalu ditulis apa
   * adanya sebagai `oldValues`; dua request paralel mencatat nilai sebelumnya
   * yang sama. Sekarang baris dikunci dan nilai dibaca setelah lock, sehingga
   * baris audit kedua harus memakai hasil baris pertama.
   */
  it('transisi publication paralel menghasilkan rantai audit oldValues→newValues yang konsisten', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        id: `itest-pub-u-${suffix}`,
        email: `itest-pub-${suffix}@example.test`,
        name: 'Publisher',
        passwordHash: 'x',
      },
    });
    // The single-active-seal partial unique index means an earlier test may
    // have left an active seal behind. Reuse it if so, otherwise create one.
    const activeSeal = await prisma.foundationEseal.findFirst({ where: { revokedAt: null } });
    const seal =
      activeSeal ??
      (await (async () => {
        const sealMat = createSealMaterial('integration-passphrase-2026');
        return prisma.foundationEseal.create({
          data: {
            algorithm: sealMat.algorithm,
            publicKey: sealMat.publicKey,
            encryptedPrivateKey: sealMat.encryptedPrivateKey,
            kdfSalt: sealMat.kdfSalt,
            kdfParams: sealMat.kdfParams as never,
            iv: sealMat.iv,
            authTag: sealMat.authTag,
            activatedAt: new Date(),
          },
        });
      })());
    const createdSeal = !activeSeal;
    const decision = await prisma.foundationDecision.create({
      data: {
        id: `itest-pub-d-${suffix}`,
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        status: 'APPROVED',
        subject: 'Publikasi paralel',
        body: 'Naskah uji audit publication.',
        decisionType: 'uji-publikasi',
        quorumSnapshot: { activeCount: 1 } as never,
        voteSummary: {} as never,
        createdById: user.id,
        publication: 'PRIVATE',
        decidedAt: new Date(),
        finalPdfDigest: 'digest-uji',
        finalPdfSealSignature: 'sig-uji',
        esealId: seal.id,
      },
    });
    const actor = { id: user.id, roleCode: 'SUPER_ADMIN' };

    // Dua transisi bersamaan: PUBLIC lalu PRIVATE. Keduanya menyentuh baris
    // yang sama, jadi lock harus menyerialkannya.
    await Promise.allSettled([
      FoundationDecisionService.setPublication(actor, decision.id, 'PUBLIC'),
      FoundationDecisionService.setPublication(actor, decision.id, 'PRIVATE'),
    ]);

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'FoundationDecision', entityId: decision.id },
      orderBy: { createdAt: 'asc' },
    });
    // Rantai audit harus terhubung: `newValues` suatu baris = `oldValues` baris
    // berikutnya, dan tidak boleh ada dua baris dengan `oldValues` PRIVATE
    // (bukti snapshot basi ganda).
    const changes = audits
      .map((a) => ({
        old: (a.oldValues as { publication?: string } | null)?.publication,
        next: (a.newValues as { publication?: string } | null)?.publication,
      }))
      .filter((c) => c.old !== undefined);
    for (let i = 1; i < changes.length; i += 1) {
      expect(changes[i].old).toBe(changes[i - 1].next);
    }
    const duplicateOld = changes.filter((c) => c.old === 'PRIVATE');
    expect(duplicateOld.length).toBeLessThanOrEqual(1);

    await prisma.auditLog.deleteMany({ where: { entityId: decision.id } });
    await prisma.foundationDecision.delete({ where: { id: decision.id } });
    if (createdSeal) await prisma.foundationEseal.delete({ where: { id: seal.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  /**
   * BUG SEVERE (real PostgreSQL) — pengangkatan konkuren TIDAK boleh hilang dari
   * snapshot keputusan.
   *
   * Bentuk balapan yang sebenarnya, dengan DUA transaksi yang benar-benar
   * tumpang tindih pada koneksi BERBEDA:
   *
   *  1. Koneksi B membuka transaksi dan meng-INSERT pengangkatan baru, lalu
   *     DITAHAN (belum commit) — memegang `ROW EXCLUSIVE` pada
   *     `user_role_assignments`.
   *  2. `FoundationDecisionService.create` membaca penugasan pra-transaksi
   *     (pengangkatan B belum terlihat), lalu mencoba kunci tabel → MEMBLOKIR.
   *  3. Test memastikan pemblokiran itu lewat `pg_stat_activity`
   *     (`wait_event_type = 'Lock'`), bukan sekadar sleep.
   *  4. B commit; create lanjut, membaca ULANG himpunan penuh, melihat himpunan
   *     berubah, dan menolaknya sebagai konflik — snapshot basi tidak pernah
   *     ditulis. Percobaan ulang sesudahnya memasukkan anggota baru.
   *
   * Pada implementasi lama (`FOR UPDATE` atas daftar ID hasil pembacaan awal),
   * langkah 2 TIDAK memblokir dan create berhasil dengan snapshot yang kehilangan
   * anggota baru — test gagal pada assertion pemblokiran maupun konflik.
   */
  it('pengangkatan konkuren: create memblokir lalu menolak snapshot basi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-appt-creator-${suffix}`,
        email: `itest-appt-creator-${suffix}@example.test`,
        name: 'Pembuat',
        passwordHash: 'x',
      },
    });
    const appointee = await prisma.user.create({
      data: {
        id: `itest-appt-new-${suffix}`,
        email: `itest-appt-new-${suffix}@example.test`,
        name: 'Diangkat Kemudian',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });

    // Koneksi B: transaksi terbuka yang meng-INSERT anggota baru lalu DITAHAN.
    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    await b.query(
      `INSERT INTO "user_role_assignments"
         (id, user_id, role_id, is_active, is_primary, assigned_at, created_at, updated_at)
       VALUES ($1, $2, $3, true, false, NOW(), NOW(), NOW())`,
      [`itest-appt-asg-${suffix}`, appointee.id, pembina.id]
    );

    let decisionId: string | null = null;
    try {
      const input = {
        organType: 'PEMBINA' as const,
        kind: 'CIRCULAR' as const,
        subject: 'Uji pengangkatan konkuren',
        body: 'Naskah uji pengangkatan konkuren saat keputusan dibuat.',
        decisionType: 'pengesahan-rencana-kerja' as const,
      };
      const createPromise = FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );

      // Tunggu deterministik sampai create benar-benar terblokir (bukan sleep:
      // kita membaca pg_locks). Diuji pada LEVEL KUNCI, bukan teks SQL-nya,
      // supaya probe ini mengukur perilaku (transaksi create menunggu) dan tidak
      // terikat pada kalimat `LOCK TABLE` yang kebetulan dipakai implementasi.
      const blocked = await waitForLockWaiterOnAssignments(prisma, 8000);
      expect(blocked).toBe(true);

      // Lepas kunci dari koneksi B. create lanjut dan menolak snapshot basi.
      await b.query('COMMIT');
      await expect(createPromise).rejects.toThrow(/Keanggotaan organ .* berubah/);

      // Percobaan ulang sesudah B commit: snapshot MEMUAT anggota baru.
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );
      const members = await prisma.foundationDecisionMember.findMany({
        where: { decisionId },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId).sort();
      // Inti invariant: anggota BARU ikut ke dalam snapshot. Anggota seed lain
      // boleh ada, jadi yang dipaku adalah kehadiran keduanya, bukan panjang
      // persisnya.
      expect(memberIds).toContain(appointee.id);
      expect(memberIds).toContain(creator.id);
      expect(memberIds.length).toBeGreaterThanOrEqual(2);
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, appointee.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, appointee.id] } } });
    }
  });

  /**
   * BUG SEVERE (real PostgreSQL) — pencabutan konkuren tidak boleh membuat
   * snapshot kedaluwarsa.
   *
   * Cerminan test pengangkatan, arah sebaliknya: koneksi B meng-UPDATE
   * penugasan menjadi non-aktif lalu DITAHAN sebelum commit (memegang
   * `ROW EXCLUSIVE`); create memblokir, lalu setelah B commit ia membaca ulang
   * himpunan tanpa anggota yang dicabut dan menolak snapshot basi.
   */
  it('pencabutan konkuren: create memblokir lalu menolak snapshot basi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-rev-creator-${suffix}`,
        email: `itest-rev-creator-${suffix}@example.test`,
        name: 'Pembuat',
        passwordHash: 'x',
      },
    });
    const leaving = await prisma.user.create({
      data: {
        id: `itest-rev-leaving-${suffix}`,
        email: `itest-rev-leaving-${suffix}@example.test`,
        name: 'Akan Dicabut',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    const leavingAssignment = await prisma.userRoleAssignment.create({
      data: { userId: leaving.id, roleId: pembina.id, isActive: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });

    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    await b.query(
      `UPDATE "user_role_assignments" SET "is_active" = false, "updated_at" = NOW()
       WHERE "id" = $1`,
      [leavingAssignment.id]
    );

    let decisionId: string | null = null;
    try {
      const input = {
        organType: 'PEMBINA' as const,
        kind: 'CIRCULAR' as const,
        subject: 'Uji pencabutan konkuren',
        body: 'Naskah uji pencabutan konkuren saat keputusan dibuat.',
        decisionType: 'pengesahan-rencana-kerja' as const,
      };
      const createPromise = FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );

      // Tunggu deterministik sampai create benar-benar terblokir (bukan sleep:
      // kita membaca pg_locks). Diuji pada LEVEL KUNCI, bukan teks SQL-nya,
      // supaya probe ini mengukur perilaku (transaksi create menunggu) dan tidak
      // terikat pada kalimat `LOCK TABLE` yang kebetulan dipakai implementasi.
      const blocked = await waitForLockWaiterOnAssignments(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      await expect(createPromise).rejects.toThrow(/Keanggotaan organ .* berubah/);

      // Percobaan ulang: snapshot TIDAK memuat anggota yang sudah dicabut.
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );
      const members = await prisma.foundationDecisionMember.findMany({
        where: { decisionId },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      expect(memberIds).toContain(creator.id);
      expect(memberIds).not.toContain(leaving.id);
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, leaving.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, leaving.id] } } });
    }
  });

  /**
   * BUG 2 (real PostgreSQL) — urutan relasi anggota tidak boleh mengubah
   * digest PDF tersegel.
   *
   * `renderPdf` memakai urutan kanonis, jadi baris yang relasinya sengaja
   * dibalik harus menghasilkan byte PDF yang IDENTIK. Sebelum perbaikan,
   * roster mengikuti urutan baca dan byte-nya berbeda.
   */
  it('byte PDF tidak berubah ketika urutan relasi anggota dibalik', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-order-creator-${suffix}`,
        email: `itest-order-creator-${suffix}@example.test`,
        name: 'Pembuat Urutan',
        passwordHash: 'x',
      },
    });
    const member = await prisma.user.create({
      data: {
        id: `itest-order-member-${suffix}`,
        email: `itest-order-member-${suffix}@example.test`,
        name: 'Anggota Urutan',
        passwordHash: 'x',
      },
    });
    const created = await prisma.foundationDecision.create({
      data: {
        id: `itest-order-d-${suffix}`,
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        status: 'VOTING',
        subject: 'Uji urutan anggota',
        body: 'Naskah uji determinisme.',
        decisionType: 'pengesahan-rencana-kerja',
        quorumSnapshot: { activeCount: 2 } as never,
        voteSummary: {} as never,
        createdById: creator.id,
        members: {
          create: [
            { userId: creator.id, name: 'Pembuat Urutan', roleCode: 'YAYASAN_PEMBINA' },
            { userId: member.id, name: 'Anggota Urutan', roleCode: 'YAYASAN_PEMBINA' },
          ],
        },
      },
    });
    const loaded = await prisma.foundationDecision.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        members: true,
        votes: true,
        createdBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
        document: { select: { id: true } },
      },
    });
    const asRich = {
      ...loaded,
      createdBy: { id: creator.id, name: 'Pembuat Urutan' },
      decidedBy: null,
      document: null,
    } as never;

    const straight = await FoundationDecisionService.renderPdf(asRich);
    const reversed = await FoundationDecisionService.renderPdf({
      ...(asRich as any),
      members: [...(asRich as any).members].reverse(),
    } as never);
    expect(reversed.equals(straight)).toBe(true);

    await prisma.foundationDecisionMember.deleteMany({ where: { decisionId: created.id } });
    await prisma.foundationDecision.delete({ where: { id: created.id } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, member.id] } } });
  });

  /**
   * SECURITY CRITICAL (real PostgreSQL) — deaktivasi konkuren tidak boleh
   * membekukan anggota ke dalam snapshot.
   *
   * Deaktivasi akun (`UPDATE users SET is_active = false`) TIDAK menyentuh
   * `user_role_assignments`, sehingga kunci tabel penugasan melewatkannya.
   * Sebelum `lockOrganMemberRowsForSnapshot`, anggota yang dinonaktifkan tepat
   * sebelum `create` commit tetap masuk snapshot beserta hak suaranya.
   *
   * Koneksi B menonaktifkan anggota lalu DITAHAN; `create` harus memblokir pada
   * kunci baris `users` (terlihat di `pg_locks`), lalu setelah B commit menolak
   * snapshot basi.
   */
  it('deaktivasi konkuren: create memblokir lalu menolak snapshot basi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-off-creator-${suffix}`,
        email: `itest-off-creator-${suffix}@example.test`,
        name: 'Pembuat Offboard',
        passwordHash: 'x',
      },
    });
    const leaving = await prisma.user.create({
      data: {
        id: `itest-off-leaving-${suffix}`,
        email: `itest-off-leaving-${suffix}@example.test`,
        name: 'Akan Dinonaktifkan',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: leaving.id, roleId: pembina.id, isActive: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });

    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    await b.query(`UPDATE "users" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = $1`, [
      leaving.id,
    ]);

    let decisionId: string | null = null;
    try {
      const input = {
        organType: 'PEMBINA' as const,
        kind: 'CIRCULAR' as const,
        subject: 'Uji deaktivasi konkuren',
        body: 'Naskah uji deaktivasi akun konkuren saat keputusan dibuat.',
        decisionType: 'pengesahan-rencana-kerja' as const,
      };
      const createPromise = FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );

      // Deterministik: `create` menunggu kunci baris `users` yang dipegang B.
      const blocked = await waitForLockWaiterOnUsers(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      // B menang lebih dulu → snapshot pasca-lock kehilangan anggota itu dan
      // operasi dibatalkan, bukan membekukannya.
      await expect(createPromise).rejects.toThrow(/Keanggotaan organ .* berubah/);

      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );
      const members = await prisma.foundationDecisionMember.findMany({
        where: { decisionId },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      expect(memberIds).toContain(creator.id);
      expect(memberIds).not.toContain(leaving.id);
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, leaving.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, leaving.id] } } });
    }
  });

  /**
   * SECURITY CRITICAL (real PostgreSQL) — "token lama" tidak boleh bertahan
   * setelah offboarding.
   *
   * Token AKSES stateless tak dapat dicabut, jadi jalur yang HARUS ditutup
   * adalah refresh: bila `refresh_tokens` masih hidup setelah akun
   * dinonaktifkan/dihapus, pemegangnya memperpanjang sesi tanpa batas.
   * `userService.update(isActive:false)` dan `userService.delete` mencabut
   * seluruh refresh token DI DALAM transaksi yang sama dengan perubahan status.
   * Uji ini memakai `userService` NYATA terhadap PostgreSQL nyata dan
   * membuktikan token hilang, bukan hanya bahwa kode memanggil mock.
   */
  it('deaktivasi & soft-delete mencabut refresh token (token lama mati)', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const deactivated = await prisma.user.create({
      data: {
        id: `itest-rt-deact-${suffix}`,
        email: `itest-rt-deact-${suffix}@example.test`,
        name: 'Akan Dinonaktifkan',
        passwordHash: 'x',
      },
    });
    const deleted = await prisma.user.create({
      data: {
        id: `itest-rt-del-${suffix}`,
        email: `itest-rt-del-${suffix}@example.test`,
        name: 'Akan Dihapus',
        passwordHash: 'x',
      },
    });
    await prisma.refreshToken.createMany({
      data: [
        {
          token: `itest-rt-deact-token-${suffix}`,
          userId: deactivated.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
        {
          token: `itest-rt-del-token-${suffix}`,
          userId: deleted.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
      ],
    });
    // Prasyarat: token memang ada sebelum mutasi.
    expect(await prisma.refreshToken.count({ where: { userId: deactivated.id } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { userId: deleted.id } })).toBe(1);

    try {
      await userService.update(
        deactivated.id,
        { isActive: false },
        { roleCode: 'SUPER_ADMIN', unitId: null, sub: 'itest-admin' }
      );
      expect(await prisma.refreshToken.count({ where: { userId: deactivated.id } })).toBe(0);

      await userService.delete(deleted.id);
      expect(await prisma.refreshToken.count({ where: { userId: deleted.id } })).toBe(0);
      // Soft-delete menandai, bukan menghapus baris user.
      const row = await prisma.user.findUnique({ where: { id: deleted.id } });
      expect(row?.deletedAt).not.toBeNull();
    } finally {
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [deactivated.id, deleted.id] } },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [deactivated.id, deleted.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [deactivated.id, deleted.id] } } });
    }
  });

  /**
   * BUG SEVERE (real PostgreSQL) — SOFT-DELETE akun anggota tidak boleh lolos
   * dari kunci snapshot.
   *
   * `users.deleted_at` mengeluarkan anggota dari organ, tetapi ia TIDAK
   * menyentuh `user_role_assignments` maupun `roles`, sehingga kunci tabel
   * penugasan/peran saja melewatkannya. `lockOrganMemberRowsForSnapshot`
   * (`FOR SHARE` atas baris `users`) menahan `UPDATE users` yang konkuren;
   * baca ulang setelahnya melihat `deleted_at IS NOT NULL` dan pembuatan
   * dibatalkan, bukan membekukan anggota yang sudah dihapus.
   *
   * Deaktivasi (`is_active`) sudah punya uji sendiri; penghapusan lunak adalah
   * kelas mutasi yang BERBEDA (kolom berbeda, jalur service berbeda —
   * `userService.delete`), jadi ia butuh uji yang benar-benar overlap sendiri.
   */
  it('soft-delete akun konkuren: create memblokir lalu menolak snapshot basi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-del-creator-${suffix}`,
        email: `itest-del-creator-${suffix}@example.test`,
        name: 'Pembuat Hapus',
        passwordHash: 'x',
      },
    });
    const leaving = await prisma.user.create({
      data: {
        id: `itest-del-leaving-${suffix}`,
        email: `itest-del-leaving-${suffix}@example.test`,
        name: 'Akan Dihapus',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: leaving.id, roleId: pembina.id, isActive: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });

    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    // Soft-delete nyata: HANYA `deleted_at` (bukan `is_active`), persis seperti
    // `userService.delete`. `is_active` tetap true supaya pemeriksaan yang
    // keliru hanya melihat status aktif tidak akan lolos.
    await b.query(`UPDATE "users" SET "deleted_at" = NOW(), "updated_at" = NOW() WHERE "id" = $1`, [
      leaving.id,
    ]);

    let decisionId: string | null = null;
    try {
      const input = {
        organType: 'PEMBINA' as const,
        kind: 'CIRCULAR' as const,
        subject: 'Uji soft-delete konkuren',
        body: 'Naskah uji penghapusan lunak akun konkuren saat keputusan dibuat.',
        decisionType: 'pengesahan-rencana-kerja' as const,
      };
      const createPromise = FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );

      // Deterministik: `create` menunggu kunci baris `users` yang dipegang B.
      const blocked = await waitForLockWaiterOnUsers(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      // B menang → snapshot pasca-lock kehilangan anggota terhapus itu.
      await expect(createPromise).rejects.toThrow(/Keanggotaan organ .* berubah/);

      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );
      const members = await prisma.foundationDecisionMember.findMany({
        where: { decisionId },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      expect(memberIds).toContain(creator.id);
      expect(memberIds).not.toContain(leaving.id);
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, leaving.id] } },
      });
      // Hard delete to clear the soft-deleted row too.
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, leaving.id] } } });
    }
  });

  /**
   * BUG SEVERE (real PostgreSQL) — mematikan PERAN organ tidak boleh lolos dari
   * kunci snapshot.
   *
   * `roles.is_active = false` mengeluarkan SELURUH pemegang peran itu dari organ,
   * tetapi ia tidak menyentuh `user_role_assignments` sama sekali — sehingga
   * kunci tabel penugasan saja melewatkannya. Snapshot yang membaca sebelum
   * commit `roles` lalu menulis setelahnya akan membekukan anggota yang sudah
   * tidak lagi memegang peran. `lockOrganRoleRowsForSnapshot` (`FOR SHARE`)
   * menahan `UPDATE roles` yang konkuren; baca ulang setelahnya melihat
   * `is_active = false` dan pembuatan dibatalkan.
   */
  it('deaktivasi PERAN konkuren: create memblokir lalu menolak snapshot basi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-roledeact-creator-${suffix}`,
        email: `itest-roledeact-creator-${suffix}@example.test`,
        name: 'Pembuat Peran',
        passwordHash: 'x',
      },
    });
    const member = await prisma.user.create({
      data: {
        id: `itest-roledeact-member-${suffix}`,
        email: `itest-roledeact-member-${suffix}@example.test`,
        name: 'Pemegang Peran',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: { isActive: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: member.id, roleId: pembina.id, isActive: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });

    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    // Matikan peran organ. Tidak ada `user_role_assignments` yang tersentuh,
    // sehingga kunci tabel penugasan saja tidak akan menahan ini.
    await b.query(`UPDATE "roles" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = $1`, [
      pembina.id,
    ]);

    try {
      const input = {
        organType: 'PEMBINA' as const,
        kind: 'MEETING' as const,
        subject: 'Uji deaktivasi peran konkuren',
        body: 'Naskah uji peran organ dimatikan saat keputusan dibuat.',
        decisionType: 'pengesahan-rencana-kerja' as const,
      };
      const createPromise = FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        input
      );

      // `create` menunggu kunci baris `roles` (`FOR SHARE`) milik B.
      const blocked = await waitForLockWaiterOnRelation(prisma, 'roles', 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      // B menang → peran mati → snapshot pasca-lock kehilangan seluruh anggota,
      // operasi dibatalkan alih-alih membekukan pemegang peran yang dicabut.
      await expect(createPromise).rejects.toThrow(/Keanggotaan organ .* berubah/);
      expect(await prisma.foundationDecision.count({ where: { subject: input.subject } })).toBe(0);
    } finally {
      await b.end().catch(() => {});
      await prisma.role.update({ where: { id: pembina.id }, data: { isActive: true } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, member.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, member.id] } } });
    }
  });

  /**
   * F4 (SECURITY critical, real PostgreSQL) — peran aktor dibuktikan ULANG di
   * dalam transaksi, di bawah protokol kunci yang sama dengan snapshot.
   *
   * Skenario yang TIDAK dapat ditangkap `assertSnapshotStillMatches`: aktor
   * adalah SUPER_ADMIN yang membuat keputusan organ PEMBINA (diizinkan lewat
   * `allowSuperAdmin`). Pencabutan peran SUPER_ADMIN-nya TIDAK mengubah snapshot
   * anggota PEMBINA, jadi konflik snapshot tidak menyala — hanya pembacaan ulang
   * peran di dalam transaksi yang dapat menolaknya. Tanpa F4, mantan Super Admin
   * tetap dapat membuka keputusan (dan menutup rapat) lewat token lama.
   */
  it('pencabutan peran SUPER_ADMIN konkuren: create memblokir lalu menolak 403', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const superAdmin = await prisma.user.create({
      data: {
        id: `itest-f4-super-${suffix}`,
        email: `itest-f4-super-${suffix}@example.test`,
        name: 'Super Admin Konkuren',
        passwordHash: 'x',
      },
    });
    const member = await prisma.user.create({
      data: {
        id: `itest-f4-member-${suffix}`,
        email: `itest-f4-member-${suffix}@example.test`,
        name: 'Anggota Pembina',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: { isActive: true },
    });
    const superRole = await prisma.role.upsert({
      where: { code: 'SUPER_ADMIN' },
      create: { code: 'SUPER_ADMIN', name: 'Super Admin', realm: 'GLOBAL' },
      update: { isActive: true },
    });
    // Snapshot PEMBINA harus non-kosong, tetapi TIDAK memuat Super Admin.
    await prisma.userRoleAssignment.create({
      data: { userId: member.id, roleId: pembina.id, isActive: true },
    });
    const superAssignment = await prisma.userRoleAssignment.create({
      data: { userId: superAdmin.id, roleId: superRole.id, isActive: true, isPrimary: true },
    });

    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    await b.query(
      `UPDATE "user_role_assignments" SET "is_active" = false, "updated_at" = NOW()
       WHERE "id" = $1`,
      [superAssignment.id]
    );

    let decisionId: string | null = null;
    try {
      const input = {
        organType: 'PEMBINA' as const,
        kind: 'CIRCULAR' as const,
        subject: 'Uji pencabutan super admin konkuren',
        body: 'Naskah uji peran super admin dicabut saat keputusan dibuat.',
        decisionType: 'pengesahan-rencana-kerja' as const,
      };
      const createPromise = FoundationDecisionService.create(
        { id: superAdmin.id, roleCode: 'SUPER_ADMIN' },
        input
      );

      // create menunggu kunci tabel penugasan yang ditahan koneksi B.
      const blocked = await waitForLockWaiterOnAssignments(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      // Snapshot PEMBINA tidak berubah (Super Admin bukan anggotanya), jadi
      // yang menolak adalah pembacaan ulang PERAN — 403, bukan konflik snapshot.
      await expect(createPromise).rejects.toThrow(/tidak berwenang memutus/);
      expect(await prisma.foundationDecision.count({ where: { subject: input.subject } })).toBe(0);
      void decisionId;
    } finally {
      await b.end().catch(() => {});
      // Sapu juga keputusan yang mungkin LOLOS saat guard dinonaktifkan untuk
      // membuktikan gagal-sebelum: baris itu akan membuat eksekusi berikutnya
      // (dengan guard aktif) gagal `count === 0` karena polusi, bukan regresi.
      await prisma.foundationDecision.deleteMany({
        where: { subject: 'Uji pencabutan super admin konkuren' },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [superAdmin.id, member.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [superAdmin.id, member.id] } } });
    }
  });

  /**
   * F4 (SECURITY critical, real PostgreSQL) — `upsertRule` juga membuktikan
   * ulang peran SUPER_ADMIN di dalam transaksi. Pencabutan peran konkuren
   * menahan transaksi (kunci tabel penugasan) lalu menolaknya 403, dan tidak
   * ada baris aturan yang tertulis.
   */
  it('pencabutan peran SUPER_ADMIN konkuren: upsertRule memblokir lalu menolak 403', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const superAdmin = await prisma.user.create({
      data: {
        id: `itest-f4-rule-super-${suffix}`,
        email: `itest-f4-rule-super-${suffix}@example.test`,
        name: 'Super Admin Aturan',
        passwordHash: 'x',
      },
    });
    const superRole = await prisma.role.upsert({
      where: { code: 'SUPER_ADMIN' },
      create: { code: 'SUPER_ADMIN', name: 'Super Admin', realm: 'GLOBAL' },
      update: { isActive: true },
    });
    const superAssignment = await prisma.userRoleAssignment.create({
      data: { userId: superAdmin.id, roleId: superRole.id, isActive: true, isPrimary: true },
    });

    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    await b.query(
      `UPDATE "user_role_assignments" SET "is_active" = false, "updated_at" = NOW()
       WHERE "id" = $1`,
      [superAssignment.id]
    );

    try {
      const upsertPromise = FoundationDecisionService.upsertRule(
        { id: superAdmin.id, roleCode: 'SUPER_ADMIN' },
        {
          organType: 'PEMBINA' as const,
          decisionKind: 'MEETING' as const,
          quorumPresentMode: 'MAJORITY' as const,
          quorumPresentValue: 0.5,
          quorumDecisionMode: 'MAJORITY' as const,
          quorumDecisionValue: 0.5,
        }
      );

      const blocked = await waitForLockWaiterOnAssignments(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      await expect(upsertPromise).rejects.toThrow(/Hanya Super Admin/);
    } finally {
      await b.end().catch(() => {});
      await prisma.foundationDecisionRule.deleteMany({
        where: { organType: 'PEMBINA', decisionKind: 'MEETING' },
      });
      await prisma.userRoleAssignment.deleteMany({ where: { userId: superAdmin.id } });
      await prisma.user.deleteMany({ where: { id: superAdmin.id } });
    }
  });

  /**
   * SECURITY CRITICAL (real PostgreSQL) — akun yang dinonaktifkan/dihapus TIDAK
   * dapat memberi suara, walau token akses stateless-nya masih berlaku dan
   * namanya masih ada di snapshot.
   *
   * `castVote` memeriksa status hidup akun DI DALAM transaksi
   * (`assertUserActiveInTx`). Snapshot immutable tetap memuat anggota itu,
   * sehingga tanpa pemeriksaan ini ia masih dapat menandatangani suara dan
   * memicu e-seal Yayasan setelah offboarding.
   */
  it('akun non-aktif dan soft-deleted ditolak saat memberi suara', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-vote-creator-${suffix}`,
        email: `itest-vote-creator-${suffix}@example.test`,
        name: 'Pembuat Suara',
        passwordHash: 'x',
      },
    });
    const member = await prisma.user.create({
      data: {
        id: `itest-vote-member-${suffix}`,
        email: `itest-vote-member-${suffix}@example.test`,
        name: 'Anggota Suara',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: member.id, roleId: pembina.id, isActive: true },
    });
    // Kunci tanda tangan nyata dan SUDAH DISETUJUI untuk KEDUA anggota: tanpa
    // `approvedAt`/`expiresAt`, `assertCanSign` menolaknya sebagai
    // PENDING_APPROVAL dan penolakan offboarding tidak pernah dievaluasi.
    const memberKey = createKeyMaterial('offboard-vote-pass');
    const creatorKey = createKeyMaterial('offboard-control-pass');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-vote-key-${suffix}`,
        userId: member.id,
        algorithm: memberKey.algorithm,
        publicKey: memberKey.publicKey,
        encryptedPrivateKey: memberKey.encryptedPrivateKey,
        kdfSalt: memberKey.kdfSalt,
        kdfParams: memberKey.kdfParams as never,
        iv: memberKey.iv,
        authTag: memberKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
    await prisma.userSigningKey.create({
      data: {
        id: `itest-control-key-${suffix}`,
        userId: creator.id,
        algorithm: creatorKey.algorithm,
        publicKey: creatorKey.publicKey,
        encryptedPrivateKey: creatorKey.encryptedPrivateKey,
        kdfSalt: creatorKey.kdfSalt,
        kdfParams: creatorKey.kdfParams as never,
        iv: creatorKey.iv,
        authTag: creatorKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });

    let decisionId: string | null = null;
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          // MEETING, bukan CIRCULAR: sirkuler menutup dirinya otomatis begitu
          // mufakat mustahil, sehingga kendali positif di bawah akan mengubah
          // status dan penolakan offboarding tidak lagi dievaluasi. Rapat tetap
          // VOTING sampai difinalisasi manual.
          kind: 'MEETING',
          subject: 'Uji suara akun non-aktif',
          body: 'Naskah uji penolakan suara akun yang sudah dinonaktifkan.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );
      const snapshot = await prisma.foundationDecisionMember.findMany({
        where: { decisionId },
        select: { userId: true },
      });
      // Prasyarat: anggota itu MEMANG ada di snapshot — jadi penolakan di bawah
      // datang dari pemeriksaan status hidup, bukan dari ketiadaan keanggotaan.
      expect(snapshot.map((m) => m.userId)).toContain(member.id);

      // Kendali positif: akun aktif + kunci sah memang DAPAT memberi suara,
      // sehingga penolakan setelah offboarding di bawah benar-benar disebabkan
      // oleh status akun, bukan sebab lain.
      const controlVote = await FoundationDecisionService.castVote(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'ABSTAIN', passphrase: 'offboard-control-pass' }
      );
      expect(controlVote).toBeTruthy();

      await prisma.user.update({ where: { id: member.id }, data: { isActive: false } });
      await expect(
        FoundationDecisionService.castVote(
          { id: member.id, roleCode: 'YAYASAN_PEMBINA' },
          decisionId,
          { choice: 'APPROVE', passphrase: 'offboard-vote-pass' }
        )
      ).rejects.toThrow(/tidak aktif atau telah dihapus/);
      expect(
        await prisma.foundationDecisionVote.count({ where: { decisionId, userId: member.id } })
      ).toBe(0);

      // Soft-delete: jalur kedua, hasil yang sama.
      await prisma.user.update({
        where: { id: member.id },
        data: { isActive: true, deletedAt: new Date() },
      });
      await expect(
        FoundationDecisionService.castVote(
          { id: member.id, roleCode: 'YAYASAN_PEMBINA' },
          decisionId,
          { choice: 'APPROVE', passphrase: 'offboard-vote-pass' }
        )
      ).rejects.toThrow(/tidak aktif atau telah dihapus/);
      expect(
        await prisma.foundationDecisionVote.count({ where: { decisionId, userId: member.id } })
      ).toBe(0);
    } finally {
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({
        where: { userId: { in: [creator.id, member.id] } },
      });
      await prisma.userSigningKey.deleteMany({
        where: { userId: { in: [creator.id, member.id] } },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, member.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, member.id] } } });
    }
  });

  /**
   * SECURITY CRITICAL (real PostgreSQL) — race suara melawan offboarding.
   *
   * Koneksi B menonaktifkan pemilih lalu DITAHAN (memegang kunci baris
   * `users`); suara dari pemilih itu harus MEMBLOKIR pada kunci baris tersebut,
   * lalu DITOLAK setelah B commit. Bukti bahwa suara tidak pernah ter-commit
   * setelah offboarding menang.
   */
  it('race suara melawan offboarding: suara ditolak setelah deaktivasi commit', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-race-creator-${suffix}`,
        email: `itest-race-creator-${suffix}@example.test`,
        name: 'Pembuat Race',
        passwordHash: 'x',
      },
    });
    const voter = await prisma.user.create({
      data: {
        id: `itest-race-voter-${suffix}`,
        email: `itest-race-voter-${suffix}@example.test`,
        name: 'Pemilih Race',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: voter.id, roleId: pembina.id, isActive: true },
    });
    // Kunci tanda tangan nyata dan sudah disetujui, supaya `castVote` sampai ke
    // pemeriksaan status hidup akun alih-alih berhenti pada lifecycle kunci.
    const voterKey = createKeyMaterial('race-vote-pass');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-race-key-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        encryptedPrivateKey: voterKey.encryptedPrivateKey,
        kdfSalt: voterKey.kdfSalt,
        kdfParams: voterKey.kdfParams as never,
        iv: voterKey.iv,
        authTag: voterKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });

    let decisionId: string | null = null;
    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji race offboarding',
          body: 'Naskah uji balapan antara pemberian suara dan penonaktifan akun.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      await b.connect();
      await b.query('BEGIN');
      await b.query(
        `UPDATE "users" SET "is_active" = false, "updated_at" = NOW() WHERE "id" = $1`,
        [voter.id]
      );

      // Suara dijalankan pada koneksi Prisma lain; ia akan memblokir di kunci
      // baris `users` milik B saat masuk transaksi.
      const votePromise = FoundationDecisionService.castVote(
        { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'APPROVE', passphrase: 'race-vote-pass' }
      );
      const blocked = await waitForLockWaiterOnUsers(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      await expect(votePromise).rejects.toThrow(/tidak aktif atau telah dihapus/);
      expect(await prisma.foundationDecisionVote.count({ where: { decisionId } })).toBe(0);
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: voter.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: voter.id } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, voter.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, voter.id] } } });
    }
  });

  /**
   * BUG SEVERE (real PostgreSQL) — aturan kuorum yang diganti secara konkuren
   * tidak boleh disimpan basi oleh `create`.
   *
   * Koneksi B meng-UPDATE baris aturan lalu DITAHAN (memegang `ROW EXCLUSIVE`);
   * `create` harus memblokir pada kunci TABEL `foundation_decision_rules`, lalu
   * setelah B commit membaca ulang nilai BARU dan membekukannya di snapshot —
   * bukan ambang yang sudah diganti. Snapshot yang diuji adalah
   * `quorumSnapshot.presentValue`, satu-satunya tempat ambang disimpan.
   */
  it('perubahan aturan kuorum konkuren: snapshot memakai nilai pasca-commit, bukan basi', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-rule-creator-${suffix}`,
        email: `itest-rule-creator-${suffix}@example.test`,
        name: 'Pembuat Aturan',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    // Aturan MEETING awal: mayoritas 0.5 (nilai default legal untuk rapat).
    await prisma.foundationDecisionRule.upsert({
      where: { organType_decisionKind: { organType: 'PEMBINA', decisionKind: 'MEETING' } },
      create: {
        organType: 'PEMBINA',
        decisionKind: 'MEETING',
        quorumPresentMode: 'MAJORITY',
        quorumPresentValue: 0.5,
        quorumDecisionMode: 'MAJORITY',
        quorumDecisionValue: 0.5,
      },
      update: {
        quorumPresentMode: 'MAJORITY',
        quorumPresentValue: 0.5,
        quorumDecisionMode: 'MAJORITY',
        quorumDecisionValue: 0.5,
      },
    });

    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await b.connect();
    await b.query('BEGIN');
    await b.query(
      `UPDATE "foundation_decision_rules"
         SET "quorum_present_mode" = 'MUTLAK', "quorum_present_value" = 1,
             "quorum_decision_mode" = 'MUTLAK', "quorum_decision_value" = 1,
             "updated_at" = NOW()
       WHERE "organ_type" = 'PEMBINA' AND "decision_kind" = 'MEETING'`
    );

    let decisionId: string | null = null;
    try {
      const createPromise = FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji aturan konkuren',
          body: 'Naskah uji perubahan aturan kuorum yang konkuren.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      const blocked = await waitForLockWaiterOnRules(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      decisionId = await createPromise;
      const row = await prisma.foundationDecision.findUniqueOrThrow({
        where: { id: decisionId },
        select: { quorumSnapshot: true },
      });
      const snap = row.quorumSnapshot as { presentMode: string; decisionMode: string };
      // Nilai pasca-commit (MUTLAK), bukan 0.5 yang basi.
      expect(snap.presentMode).toBe('MUTLAK');
      expect(snap.decisionMode).toBe('MUTLAK');
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.foundationDecisionRule.deleteMany({
        where: { organType: 'PEMBINA', decisionKind: 'MEETING' },
      });
      await prisma.userRoleAssignment.deleteMany({ where: { userId: creator.id } });
      await prisma.user.deleteMany({ where: { id: creator.id } });
    }
  });

  /**
   * F1 (SECURITY CRITICAL, real PostgreSQL) — mantan anggota organ kehilangan
   * hak suara begitu seluruh peran organnya dicabut.
   *
   * Snapshot tetap memuatnya (itu benar sebagai catatan historis), akunnya
   * masih aktif, dan kuncinya masih sah — jadi satu-satunya alasan penolakan
   * adalah ketiadaan penugasan organ yang SAAT INI aktif.
   */
  it('mantan anggota organ ditolak memberi suara setelah penugasannya dicabut', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-rev-vote-creator-${suffix}`,
        email: `itest-rev-vote-creator-${suffix}@example.test`,
        name: 'Pembuat Rev Vote',
        passwordHash: 'x',
      },
    });
    const member = await prisma.user.create({
      data: {
        id: `itest-rev-vote-member-${suffix}`,
        email: `itest-rev-vote-member-${suffix}@example.test`,
        name: 'Mantan Anggota',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    const memberAssignment = await prisma.userRoleAssignment.create({
      data: { userId: member.id, roleId: pembina.id, isActive: true },
    });
    const memberKey = createKeyMaterial('rev-vote-pass');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-rev-vote-key-${suffix}`,
        userId: member.id,
        algorithm: memberKey.algorithm,
        publicKey: memberKey.publicKey,
        encryptedPrivateKey: memberKey.encryptedPrivateKey,
        kdfSalt: memberKey.kdfSalt,
        kdfParams: memberKey.kdfParams as never,
        iv: memberKey.iv,
        authTag: memberKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });

    let decisionId: string | null = null;
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji hak suara mantan anggota',
          body: 'Naskah uji hak suara setelah penugasan organ dicabut.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );
      const snapshot = await prisma.foundationDecisionMember.findMany({
        where: { decisionId },
        select: { userId: true },
      });
      expect(snapshot.map((m) => m.userId)).toContain(member.id);

      // Cabut HANYA peran organnya; akun tetap aktif, kunci tetap sah, snapshot
      // tetap memuatnya.
      await prisma.userRoleAssignment.update({
        where: { id: memberAssignment.id },
        data: { isActive: false },
      });

      await expect(
        FoundationDecisionService.castVote(
          { id: member.id, roleCode: 'YAYASAN_PEMBINA' },
          decisionId,
          { choice: 'APPROVE', passphrase: 'rev-vote-pass' }
        )
      ).rejects.toThrow(/tidak lagi memegang peran organ yang aktif/);
      expect(
        await prisma.foundationDecisionVote.count({ where: { decisionId, userId: member.id } })
      ).toBe(0);
    } finally {
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({
        where: { userId: { in: [creator.id, member.id] } },
      });
      await prisma.userSigningKey.deleteMany({
        where: { userId: { in: [creator.id, member.id] } },
      });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, member.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, member.id] } } });
    }
  });

  /**
   * F1 (real PostgreSQL) — race suara melawan PENCABUTAN PERAN.
   *
   * Koneksi B menonaktifkan penugasan organ pemilih lalu DITAHAN; suara harus
   * MEMBLOKIR pada kunci tabel `user_role_assignments`, lalu DITOLAK setelah B
   * commit. Bukti bahwa `castVote` benar-benar menyerialkan diri terhadap
   * mutasi eligibility peran (bukan sekadar membaca lalu menulis).
   */
  it('race suara melawan pencabutan peran: suara ditolak setelah pencabutan commit', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-role-race-creator-${suffix}`,
        email: `itest-role-race-creator-${suffix}@example.test`,
        name: 'Pembuat Role Race',
        passwordHash: 'x',
      },
    });
    const voter = await prisma.user.create({
      data: {
        id: `itest-role-race-voter-${suffix}`,
        email: `itest-role-race-voter-${suffix}@example.test`,
        name: 'Pemilih Role Race',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    const voterAssignment = await prisma.userRoleAssignment.create({
      data: { userId: voter.id, roleId: pembina.id, isActive: true },
    });
    const voterKey = createKeyMaterial('role-race-pass');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-role-race-key-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        encryptedPrivateKey: voterKey.encryptedPrivateKey,
        kdfSalt: voterKey.kdfSalt,
        kdfParams: voterKey.kdfParams as never,
        iv: voterKey.iv,
        authTag: voterKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });

    let decisionId: string | null = null;
    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji race pencabutan peran',
          body: 'Naskah uji balapan suara melawan pencabutan peran organ.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      await b.connect();
      await b.query('BEGIN');
      await b.query(
        `UPDATE "user_role_assignments" SET "is_active" = false, "updated_at" = NOW()
         WHERE "id" = $1`,
        [voterAssignment.id]
      );

      const votePromise = FoundationDecisionService.castVote(
        { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'APPROVE', passphrase: 'role-race-pass' }
      );
      const blocked = await waitForLockWaiterOnAssignments(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      await expect(votePromise).rejects.toThrow(/tidak lagi memegang peran organ yang aktif/);
      expect(await prisma.foundationDecisionVote.count({ where: { decisionId } })).toBe(0);
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: voter.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: voter.id } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, voter.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, voter.id] } } });
    }
  });

  /**
   * SECURITY (real PostgreSQL) — race suara melawan PENCABUTAN KUNCI.
   *
   * `castVote` membaca `UserSigningKey` dan menandatangani SEBELUM transaksi.
   * `esign.revokeKey` menstempel `revokedAt` lalu menulis riwayat. Sebelum
   * perbaikan, `revokedAt` diambil SEBELUM advisory lock dan `castVote` tidak
   * mengambil lock itu, sehingga transaksi suara dapat berjalan di antara
   * pembacaan dan penulisan `revokedAt` yang tertunda: suara ter-commit dengan
   * `signedAt >= revokedAt`, menjadi TIDAK autentik sesudahnya, dan—karena
   * menempati slot unik `(decisionId, userId)`—mengunci pemilih dari percobaan
   * ulang.
   *
   * Bukti overlap: koneksi B memegang advisory lock pemilih (mensimulasikan
   * `revokeKey` yang sedang berjalan), `castVote` harus MEMBLOKIR pada advisory
   * lock itu (`waitForAdvisoryLockWaiter`), lalu setelah B menstempel
   * `revokedAt` pada baris kunci/riwayat dan COMMIT, suara DITOLAK sebagai
   * konflik — bukan ter-commit sebagai baris tak autentik.
   */
  it('race suara melawan pencabutan kunci: suara ditolak, bukan tersimpan tak autentik', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-krev-creator-${suffix}`,
        email: `itest-krev-creator-${suffix}@example.test`,
        name: 'Pembuat Cabut',
        passwordHash: 'x',
      },
    });
    const voter = await prisma.user.create({
      data: {
        id: `itest-krev-voter-${suffix}`,
        email: `itest-krev-voter-${suffix}@example.test`,
        name: 'Pemilih Cabut',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: voter.id, roleId: pembina.id, isActive: true },
    });
    const voterKey = createKeyMaterial('krev-vote-pass');
    const key = await prisma.userSigningKey.create({
      data: {
        id: `itest-krev-key-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        encryptedPrivateKey: voterKey.encryptedPrivateKey,
        kdfSalt: voterKey.kdfSalt,
        kdfParams: voterKey.kdfParams as never,
        iv: voterKey.iv,
        authTag: voterKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
    await prisma.userSigningKeyHistory.create({
      data: {
        id: `itest-krev-hist-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        fingerprint: publicKeyFingerprint(voterKey.publicKey),
        issuedAt: new Date(Date.now() - 60_000),
      },
    });

    let decisionId: string | null = null;
    // Koneksi B: memegang advisory lock yang SAMA dengan `lockSigningKeyTransition`
    // (hashtextextended(userId, 0)) supaya `castVote` benar-benar terparkir.
    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji race pencabutan kunci',
          body: 'Naskah uji balapan antara pemberian suara dan pencabutan kunci.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      await b.connect();
      await b.query('BEGIN');
      await b.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [voter.id]);

      // Suara dijalankan pada koneksi Prisma lain; ia harus MEMBLOKIR di
      // advisory lock yang dipegang B sebelum menulis apa pun.
      const votePromise = FoundationDecisionService.castVote(
        { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'APPROVE', passphrase: 'krev-vote-pass' }
      );
      const blocked = await waitForAdvisoryLockWaiter(prisma, 8000);
      expect(blocked).toBe(true);

      // B mencabut kunci pada baris + riwayat dengan cap waktu jauh di masa
      // lalu, sehingga begitu lock dilepas suara ini PASTI tidak boleh ditulis
      // (bukan sekadar "tidak autentik"), lalu melepas lock.
      await b.query(
        `UPDATE "user_signing_keys" SET "revoked_at" = NOW() - INTERVAL '60 seconds' WHERE "id" = $1`,
        [key.id]
      );
      await b.query(
        `UPDATE "user_signing_key_history" SET "revoked_at" = NOW() - INTERVAL '60 seconds' WHERE "user_id" = $1`,
        [voter.id]
      );
      await b.query('COMMIT');

      // Serialisasi terjamin: suara ditolak sebagai konflik, dan TIDAK ada baris
      // tersimpan yang menempati slot unik sekaligus tak autentik. Inilah yang
      // mencegah "tersimpan-tetapi-tak-sah lalu terkunci dari percobaan ulang".
      await expect(votePromise).rejects.toThrow();
      expect(await prisma.foundationDecisionVote.count({ where: { decisionId } })).toBe(0);
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: voter.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: voter.id } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, voter.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, voter.id] } } });
    }
  });

  /**
   * Finding #1 (SECURITY critical, CWE-367) — pencabutan yang menstempel
   * `revokedAt` SETELAH `signedAt` tetapi SEBELUM suara menulis tetap harus
   * menolak suara, bukan menyimpannya sebagai baris yang tak lagi autentik.
   *
   * Bentuk jendela TOCTOU yang tepat: `assertCanSign` di LUAR transaksi sudah
   * melewati kunci (masih aktif), lalu penguji menahan advisory lock pemilih
   * supaya transaksi suara berhenti TEPAT setelah pra-cek tetapi sebelum lock —
   * dan menstempel `revokedAt = NOW()` (LEBIH BESAR dari `signedAt`). Dengan
   * pemeriksaan lama (`keyUsableAt(history, signedAt)` saja) suara itu LOLOS
   * (karena `signedAt < revokedAt`) dan ter-commit sebagai baris tak autentik.
   * Perbaikan membaca ulang status kunci di dalam lock dan menolak bila riwayat
   * sudah dicabut pada waktu mana pun.
   */
  it('revokedAt setelah signedAt tetap menolak suara (CWE-367)', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-krev2-creator-${suffix}`,
        email: `itest-krev2-creator-${suffix}@example.test`,
        name: 'Pembuat Cabut 2',
        passwordHash: 'x',
      },
    });
    const voter = await prisma.user.create({
      data: {
        id: `itest-krev2-voter-${suffix}`,
        email: `itest-krev2-voter-${suffix}@example.test`,
        name: 'Pemilih Cabut 2',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: voter.id, roleId: pembina.id, isActive: true },
    });
    const voterKey = createKeyMaterial('krev2-vote-pass');
    const key = await prisma.userSigningKey.create({
      data: {
        id: `itest-krev2-key-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        encryptedPrivateKey: voterKey.encryptedPrivateKey,
        kdfSalt: voterKey.kdfSalt,
        kdfParams: voterKey.kdfParams as never,
        iv: voterKey.iv,
        authTag: voterKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
    await prisma.userSigningKeyHistory.create({
      data: {
        id: `itest-krev2-hist-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        fingerprint: publicKeyFingerprint(voterKey.publicKey),
        issuedAt: new Date(Date.now() - 60_000),
      },
    });

    let decisionId: string | null = null;
    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji race pencabutan setelah signedAt',
          body: 'Naskah uji balapan antara pemberian suara dan pencabutan kunci pasca signedAt.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      // Koneksi B memegang advisory lock pemilih SEBELUM `castVote` masuk ke
      // transaksinya, sehingga transaksi suara berhenti tepat setelah pra-cek
      // `assertCanSign` (yang masih melihat kunci aktif).
      await b.connect();
      await b.query('BEGIN');
      await b.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [voter.id]);

      const votePromise = FoundationDecisionService.castVote(
        { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'APPROVE', passphrase: 'krev2-vote-pass' }
      );
      const blocked = await waitForAdvisoryLockWaiter(prisma, 8000);
      expect(blocked).toBe(true);

      // Pencabutan dengan cap waktu = SEKARANG: LEBIH BESAR dari `signedAt`
      // yang sudah dibekukan `castVote` saat pra-cek. Inilah jendela yang dulu
      // lolos — `keyUsableAt` menerima karena `signedAt < revokedAt`.
      //
      // `clock_timestamp()`, BUKAN `NOW()`: `NOW()` adalah waktu MULAI transaksi
      // B, yang sudah lebih awal dari `signedAt` sehingga jalur pemeriksaan lama
      // kebetulan ikut menolaknya. Cap waktu harus benar-benar jatuh SETELAH
      // `signedAt` agar tepat mereproduksi pencabutan yang commit di sela.
      await b.query(
        `UPDATE "user_signing_keys" SET "revoked_at" = clock_timestamp() WHERE "id" = $1`,
        [key.id]
      );
      await b.query(
        `UPDATE "user_signing_key_history" SET "revoked_at" = clock_timestamp() WHERE "user_id" = $1`,
        [voter.id]
      );
      await b.query('COMMIT');

      // Suara ditolak sebagai konflik — bukan tersimpan sebagai baris yang tak
      // lagi autentik (dan sekaligus mengunci pemilih dari percobaan ulang).
      await expect(votePromise).rejects.toThrow();
      expect(await prisma.foundationDecisionVote.count({ where: { decisionId } })).toBe(0);
      // Tidak ada e-seal yang dibubuhkan (keputusan tetap VOTING, bukan APPROVED).
      const decision = await prisma.foundationDecision.findUnique({ where: { id: decisionId } });
      expect(decision?.status).toBe('VOTING');
      expect(decision?.esealId).toBeNull();
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: voter.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: voter.id } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, voter.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, voter.id] } } });
    }
  });

  /**
   * Finding 1 (SECURITY critical) — riwayat kunci TIDAK boleh dibuat di luar
   * lock, dan pencabutan atas kunci yang BELUM punya rekaman tidak boleh hilang.
   *
   * Skenario: kunci dibuat, tetapi belum pernah menandatangani apa pun sehingga
   * BELUM ada baris `UserSigningKeyHistory`. `EsignService.revokeKey` dijalankan
   * sampai commit. Baru sesudah itu pemilih mencoba memberi suara.
   *
   * Sebelum perbaikan, `ensureSigningKeyHistory` membuat baris riwayat BARU
   * (bersih, tanpa `revokedAt`) DI LUAR lock, sehingga kunci yang sudah dicabut
   * memperoleh rekaman yang tampak berlaku — dan `assertSigningKeyStillCurrent`
   * hanya memeriksa rekaman yang baru dibuat itu, bukan pencabutan yang sudah
   * commit. Suara pun lolos menunjuk kunci mati.
   *
   * Sesudah perbaikan: `revokeKey` meng-upsert rekaman dengan `revokedAt`
   * terisi, dan `castVote` membuat/membaca riwayat DI DALAM lock sehingga
   * `revokedAt` itu terlihat — suara ditolak, dan TIDAK ADA rekaman riwayat
   * tanpa `revokedAt` untuk kunci tersebut.
   */
  it('pencabutan sebelum riwayat lahir: castVote ditolak, tanpa riwayat revokedAt NULL', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-f1b-creator-${suffix}`,
        email: `itest-f1b-creator-${suffix}@example.test`,
        name: 'Pembuat F1b',
        passwordHash: 'x',
      },
    });
    const voter = await prisma.user.create({
      data: {
        id: `itest-f1b-voter-${suffix}`,
        email: `itest-f1b-voter-${suffix}@example.test`,
        name: 'Pemilih F1b',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: voter.id, roleId: pembina.id, isActive: true },
    });
    const voterKey = createKeyMaterial('f1b-vote-pass');
    const key = await prisma.userSigningKey.create({
      data: {
        id: `itest-f1b-key-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        encryptedPrivateKey: voterKey.encryptedPrivateKey,
        kdfSalt: voterKey.kdfSalt,
        kdfParams: voterKey.kdfParams as never,
        iv: voterKey.iv,
        authTag: voterKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
    // PENTING: TIDAK ada UserSigningKeyHistory di sini — itulah inti temuan.
    expect(await prisma.userSigningKeyHistory.count({ where: { userId: voter.id } })).toBe(0);

    let decisionId: string | null = null;
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji pencabutan sebelum riwayat',
          body: 'Naskah uji pencabutan kunci yang belum pernah menandatangani.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      // Cabut kunci SEBELUM riwayat apa pun lahir. Ini commit penuh.
      await EsignService.revokeKey(voter.id, creator.id, 'Pemegang berhenti menjabat');

      // Perbaikan inti: pencabutan atas kunci tanpa riwayat WAJIB meninggalkan
      // rekaman ber-`revokedAt` — kalau tidak, pencabutannya tak terlihat.
      const history = await prisma.userSigningKeyHistory.findMany({
        where: { userId: voter.id },
      });
      expect(history.length).toBeGreaterThan(0);
      for (const rec of history) {
        expect(rec.revokedAt).not.toBeNull();
      }

      // Suara ditolak: kunci sudah dicabut. Sebelum perbaikan, suara LOLOS.
      await expect(
        FoundationDecisionService.castVote(
          { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
          decisionId,
          { choice: 'APPROVE', passphrase: 'f1b-vote-pass' }
        )
      ).rejects.toThrow();
      expect(await prisma.foundationDecisionVote.count({ where: { decisionId } })).toBe(0);

      // Invariant paling penting: TIDAK ADA rekaman riwayat tanpa revokedAt
      // untuk kunci ini. Inilah yang gagal sebelum perbaikan (baris baru dibuat
      // bersih oleh `ensureSigningKeyHistory` di luar lock).
      const cleanHistory = await prisma.userSigningKeyHistory.count({
        where: { userId: voter.id, revokedAt: null },
      });
      expect(cleanHistory).toBe(0);
    } finally {
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: voter.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: voter.id } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, voter.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, voter.id] } } });
    }
  });

  /**
   * F4 (BUG non-severe, real PostgreSQL) — pencatatan percobaan gagal
   * diserialkan oleh advisory lock per-pengguna yang SAMA dengan jalur sukses.
   *
   * Sebelum perbaikan, `recordFailedAttempt` menaikkan penghitung TANPA
   * mengambil `lockSigningKeyTransition`, sedangkan `clearFailedAttempts`
   * (jalur sukses) berjalan DI DALAM transaksi `castVote` yang memegang lock
   * itu. Akibatnya penulisan-ulang penghitung dan reset-nya dapat saling
   * mendahului tanpa urutan yang pasti.
   *
   * Test ini membuktikan perilakunya pada LEVEL KUNCI: koneksi B memegang
   * advisory lock pemilih (persis yang dipakai `activateKey`/`revokeKey`/
   * `castVote`), lalu panggilan suara dengan passphrase SALAH harus MEMBLOKIR
   * pada lock yang sama. Sebelum perbaikan tidak ada penunggu advisory sama
   * sekali, sehingga assertion pemblokiran gagal.
   */
  it('percobaan gagal menunggu advisory lock transisi kunci yang sama', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-f4-creator-${suffix}`,
        email: `itest-f4-creator-${suffix}@example.test`,
        name: 'Pembuat F4',
        passwordHash: 'x',
      },
    });
    const voter = await prisma.user.create({
      data: {
        id: `itest-f4-voter-${suffix}`,
        email: `itest-f4-voter-${suffix}@example.test`,
        name: 'Pemilih F4',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: voter.id, roleId: pembina.id, isActive: true },
    });
    const voterKey = createKeyMaterial('f4-vote-pass');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-f4-key-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        encryptedPrivateKey: voterKey.encryptedPrivateKey,
        kdfSalt: voterKey.kdfSalt,
        kdfParams: voterKey.kdfParams as never,
        iv: voterKey.iv,
        authTag: voterKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });

    let decisionId: string | null = null;
    const b = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          kind: 'MEETING',
          subject: 'Uji lock pencacah gagal',
          body: 'Naskah uji serialisasi pencatatan percobaan gagal.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      await b.connect();
      await b.query('BEGIN');
      // Ambil advisory lock per-pengguna yang SAMA dengan
      // `lockSigningKeyTransition` (hashtextextended(userId, 0)).
      await b.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [voter.id]);

      const wrong = FoundationDecisionService.castVote(
        { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'APPROVE', passphrase: 'passphrase-yang-jelas-salah' }
      );
      // Bukti overlap: panggilan itu benar-benar menunggu advisory lock, bukan
      // sleep. Sebelum perbaikan tidak ada penunggu advisory sama sekali.
      const blocked = await waitForAdvisoryLockWaiter(prisma, 8000);
      expect(blocked).toBe(true);

      await b.query('COMMIT');
      await expect(wrong).rejects.toThrow(/Sisa percobaan: 4/);

      // Pencacah TETAP ter-commit walau suaranya ditolak (tidak gratis).
      const afterWrong = await prisma.userSigningKey.findUniqueOrThrow({
        where: { id: `itest-f4-key-${suffix}` },
      });
      expect(afterWrong.failedAttempts).toBe(1);

      // Sukses dengan passphrase benar membuka penghitung di bawah lock yang
      // SAMA; kunci TIDAK boleh tertinggal terkunci.
      const ok = await FoundationDecisionService.castVote(
        { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'ABSTAIN', passphrase: 'f4-vote-pass' }
      );
      expect(ok).toBeTruthy();
      const afterOk = await prisma.userSigningKey.findUniqueOrThrow({
        where: { id: `itest-f4-key-${suffix}` },
      });
      expect(afterOk.failedAttempts).toBe(0);
      expect(afterOk.lockedUntil).toBeNull();
    } finally {
      await b.end().catch(() => {});
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: voter.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: voter.id } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, voter.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, voter.id] } } });
    }
  });

  /**
   * BUG (real PostgreSQL) — suara PERTAMA sebuah kunci harus AUTENTIK dan
   * masuk hitungan kuorum.
   *
   * Baris `user_signing_key_history` lahir pada suara pertama kunci itu bila
   * migrasi backfill belum membuatnya. Sebelum perbaikan, `issuedAt`-nya
   * dibiarkan jatuh ke default `now()` basis data — TERTUNDA beberapa
   * milidetik setelah `signedAt` suara — dan `keyUsableAt` menolak tanda
   * tangan yang mendahului penerbitan. Suara TERSIMPAN (slot unik
   * `(decisionId, userId)` terisi), tetapi selamanya dikecualikan dari rekap
   * kuorum, dan pemilih tidak dapat mengulang. Sebuah keputusan dengan suara
   * penentu seperti ini menggantung VOTING tanpa akhir.
   *
   * Sesudah perbaikan, `issuedAt` diambil dari `UserSigningKey.createdAt`,
   * sehingga `issuedAt <= signedAt` dan suara itu autentik sejak baris pertama.
   */
  it('suara pertama tanpa riwayat kunci tetap autentik dan dihitung kuorum', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const creator = await prisma.user.create({
      data: {
        id: `itest-firstvote-creator-${suffix}`,
        email: `itest-firstvote-creator-${suffix}@example.test`,
        name: 'Pembuat Suara Pertama',
        passwordHash: 'x',
      },
    });
    const voter = await prisma.user.create({
      data: {
        id: `itest-firstvote-voter-${suffix}`,
        email: `itest-firstvote-voter-${suffix}@example.test`,
        name: 'Pemilih Suara Pertama',
        passwordHash: 'x',
      },
    });
    const pembina = await prisma.role.upsert({
      where: { code: 'YAYASAN_PEMBINA' },
      create: { code: 'YAYASAN_PEMBINA', name: 'Pembina', realm: 'YAYASAN' },
      update: {},
    });
    await prisma.userRoleAssignment.create({
      data: { userId: creator.id, roleId: pembina.id, isActive: true, isPrimary: true },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: voter.id, roleId: pembina.id, isActive: true },
    });
    // Kunci NYATA, sudah disetujui, dan `createdAt` yang jelas di masa lalu —
    // kunci yang sudah terbit beberapa saat sebelum orangnya memberi suara.
    const voterKey = createKeyMaterial('first-vote-pass');
    await prisma.userSigningKey.create({
      data: {
        id: `itest-firstvote-key-${suffix}`,
        userId: voter.id,
        algorithm: voterKey.algorithm,
        publicKey: voterKey.publicKey,
        encryptedPrivateKey: voterKey.encryptedPrivateKey,
        kdfSalt: voterKey.kdfSalt,
        kdfParams: voterKey.kdfParams as never,
        iv: voterKey.iv,
        authTag: voterKey.authTag,
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    // PENTING: TIDAK ada riwayat kunci — inilah suara pertama kunci itu.
    expect(await prisma.userSigningKeyHistory.count({ where: { userId: voter.id } })).toBe(0);

    let decisionId: string | null = null;
    try {
      decisionId = await FoundationDecisionService.create(
        { id: creator.id, roleCode: 'YAYASAN_PEMBINA' },
        {
          organType: 'PEMBINA',
          // MEETING: keputusan tidak menutup diri, sehingga rekap dapat
          // diperiksa pada baris yang tetap VOTING.
          kind: 'MEETING',
          subject: 'Uji suara pertama',
          body: 'Naskah uji suara pertama sebuah kunci tanpa riwayat.',
          decisionType: 'pengesahan-rencana-kerja',
        }
      );

      const result = await FoundationDecisionService.castVote(
        { id: voter.id, roleCode: 'YAYASAN_PEMBINA' },
        decisionId,
        { choice: 'APPROVE', passphrase: 'first-vote-pass' }
      );
      expect(result).toBeTruthy();

      const saved = await prisma.foundationDecisionVote.findFirst({
        where: { decisionId, userId: voter.id },
        include: { signingKey: true },
      });
      expect(saved).not.toBeNull();
      // Inti temuan: riwayat kunci menunjuk PENERBITAN kunci, bukan waktu
      // suara. Waktu riwayat tidak boleh lebih lambat dari tanda tangannya.
      expect(saved!.signingKey).not.toBeNull();
      expect(saved!.signingKey!.issuedAt.getTime()).toBeLessThanOrEqual(saved!.signedAt.getTime());

      // Bukti kedua: predikat keaslian yang SAMA dengan yang dipakai kuorum
      // meloloskan baris ini. Sebelum perbaikan ia `false`, dan suara penentu
      // karena itu tak pernah dihitung.
      const row = await prisma.foundationDecision.findUniqueOrThrow({
        where: { id: decisionId },
      });
      const members = await prisma.foundationDecisionMember.findMany({ where: { decisionId } });
      const votes = await prisma.foundationDecisionVote.findMany({
        where: { decisionId },
        include: { signingKey: true },
      });
      const authentic = votes.filter((v) =>
        isVoteAuthentic(
          {
            id: row.id,
            organType: row.organType,
            kind: row.kind,
            decisionType: row.decisionType,
            subject: row.subject,
            body: row.body,
            createdAt: row.createdAt,
            quorumSnapshot: row.quorumSnapshot,
            members,
          } as never,
          v as never
        )
      );
      expect(authentic.map((v) => v.userId)).toContain(voter.id);

      // Dan rekap kuorum benar-benar memuat suara itu.
      const summary = row.voteSummary as { approve?: number } | null;
      expect(summary?.approve).toBeGreaterThanOrEqual(1);
    } finally {
      if (decisionId) {
        await prisma.foundationDecisionVote.deleteMany({ where: { decisionId } });
        await prisma.foundationDecisionMember.deleteMany({ where: { decisionId } });
        await prisma.auditLog.deleteMany({ where: { entityId: decisionId } });
        await prisma.foundationDecision.delete({ where: { id: decisionId } });
      }
      await prisma.userSigningKeyHistory.deleteMany({ where: { userId: voter.id } });
      await prisma.userSigningKey.deleteMany({ where: { userId: voter.id } });
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: { in: [creator.id, voter.id] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [creator.id, voter.id] } } });
    }
  });
});

/** Ambil blok `DO $$ ... $$;` pertama dari SQL migrasi. */
function parsePreflightBlock(sql: string): string {
  const start = sql.indexOf('DO $$');
  const end = sql.indexOf('END $$;', start);
  if (start === -1 || end === -1) throw new Error('Blok preflight tidak ditemukan.');
  return sql.slice(start, end + 'END $$'.length);
}

/** Ambil blok `DO $$ ... $$;` yang memuat `marker` (bukan selalu yang pertama). */
function parseDoBlockContaining(sql: string, marker: string): string {
  let from = 0;
  for (;;) {
    const start = sql.indexOf('DO $$', from);
    if (start === -1) {
      throw new Error(`Blok DO yang memuat "${marker}" tidak ditemukan.`);
    }
    const end = sql.indexOf('END $$;', start);
    const block = sql.slice(start, end + 'END $$;'.length);
    if (block.includes(marker)) return block;
    from = end + 'END $$;'.length;
  }
}
