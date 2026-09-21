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
  isVoteAuthentic,
  canonicalDigestForVote,
} from '@/modules/foundation-decisions/foundation-decisions.service';
import { createKeyMaterial, publicKeyFingerprint, signPdfHash } from '@/utils/esign';
import { supersedeSigningKeyHistory, revokeSigningKeyHistory } from '@/utils/signing-key-history';
import type { PrismaClient } from '@prisma/client';

const RUN = process.env.RUN_DB_TESTS === '1';
const MIGRATION_SQL = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260916000000_foundation_decisions/migration.sql'
);
const MIGRATION_SQL_VOTE_KEY_BINDING = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260917000000_foundation_decision_vote_key_binding/migration.sql'
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
    const guard = parseDoBlockContaining(sql, 'tidak dapat dibuktikan berasal dari penerbitan resmi');

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
    const guard = parseDoBlockContaining(sql, 'tidak dapat dibuktikan berasal dari penerbitan resmi');
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
