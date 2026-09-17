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
import type { PrismaClient } from '@prisma/client';

const RUN = process.env.RUN_DB_TESTS === '1';
const MIGRATION_SQL = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260916000000_foundation_decisions/migration.sql'
);

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
    await expect(prisma.$executeRawUnsafe(faked)).rejects.toThrowError(
      /tidak memiliki kolom id/
    );
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
});

/** Ambil blok `DO $$ ... $$;` pertama dari SQL migrasi. */
function parsePreflightBlock(sql: string): string {
  const start = sql.indexOf('DO $$');
  const end = sql.indexOf('END $$;', start);
  if (start === -1 || end === -1) throw new Error('Blok preflight tidak ditemukan.');
  return sql.slice(start, end + 'END $$'.length);
}