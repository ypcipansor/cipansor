/**
 * Atomicity of the signing-key lifecycle against REAL PostgreSQL.
 *
 * Two bugs were claimed on the head:
 *  - `revokeKey` updated the key, then stamped history and wrote the audit row
 *    outside a transaction, so a later failure left the key revoked with no
 *    audit trail and a request that looked like it had failed.
 *  - `activateKey` superseded history and deleted the old key before creating
 *    the replacement, so a failed create left the user with no key at all.
 *
 * A mocked Prisma cannot prove a rollback — the mock has no transaction to roll
 * back. This suite forces each write to fail with a real database trigger and
 * asserts that NONE of the lifecycle change survives. It also pins the success
 * paths so the transaction cannot be made to swallow a write.
 *
 * Opt-in via RUN_DB_TESTS=1 (the default unit env points DATABASE_URL at a
 * stub). Run it against a database created by `pnpm --filter api db:deploy`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { EsignService } from '@/modules/esign/esign.service';
import { createKeyMaterial, publicKeyFingerprint } from '@/utils/esign';
import { SigningKeyRequestStatus, SigningKeyRequestKind } from '@prisma/client';

const RUN = process.env.RUN_DB_TESTS === '1';
const describeDb = RUN ? describe : describe.skip;

/** A trigger that raises when `when` matches, used to force a write to fail. */
async function installFailingTrigger(
  name: string,
  table: string,
  when: string,
  event: 'INSERT' | 'UPDATE' = 'INSERT'
): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON "${table}"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${name}_fn"()`);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "${name}_fn"() RETURNS trigger AS $$
    BEGIN
      IF ${when} THEN
        RAISE EXCEPTION 'forced failure in ${name}';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${name}" BEFORE ${event} ON "${table}"
    FOR EACH ROW EXECUTE FUNCTION "${name}_fn"();
  `);
}

async function dropFailingTrigger(name: string, table: string): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON "${table}"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${name}_fn"()`);
}

describeDb('esign key lifecycle — atomicity on real PostgreSQL', () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const PASS = 'passphrase-integrasi-2026';

  let owner: { id: string };
  let actor: { id: string };

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Fresh users per test keeps FK cleanup trivial and avoids cross-test bleed.
    const stamp = `${suffix}-${Math.random().toString(36).slice(2, 8)}`;
    owner = await prisma.user.create({
      data: {
        id: `itest-esign-owner-${stamp}`,
        email: `itest-esign-owner-${stamp}@example.test`,
        name: 'Pemilik Kunci',
        passwordHash: 'x',
      },
      select: { id: true },
    });
    actor = await prisma.user.create({
      data: {
        id: `itest-esign-actor-${stamp}`,
        email: `itest-esign-actor-${stamp}@example.test`,
        name: 'Super Admin',
        passwordHash: 'x',
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await dropFailingTrigger('itest_fail_audit', 'audit_logs');
    await dropFailingTrigger('itest_fail_history', 'user_signing_key_history');
    await dropFailingTrigger('itest_fail_key', 'user_signing_keys');
    await prisma.$disconnect();
  });

  async function seedKey(opts: { expired?: boolean; revoked?: boolean } = {}) {
    const material = createKeyMaterial(PASS);
    const now = Date.now();
    const key = await prisma.userSigningKey.create({
      data: {
        userId: owner.id,
        algorithm: material.algorithm,
        publicKey: material.publicKey,
        encryptedPrivateKey: material.encryptedPrivateKey,
        kdfSalt: material.kdfSalt,
        kdfParams: material.kdfParams as never,
        iv: material.iv,
        authTag: material.authTag,
        approvedAt: new Date(now - 400 * 86400_000),
        expiresAt: new Date(now + (opts.expired ? -1 : 200) * 86400_000),
        revokedAt: opts.revoked ? new Date(now - 86400_000) : null,
        revokedReason: opts.revoked ? 'sebelumnya' : null,
      },
    });
    const history = await prisma.userSigningKeyHistory.create({
      data: {
        userId: owner.id,
        algorithm: material.algorithm,
        publicKey: material.publicKey,
        fingerprint: publicKeyFingerprint(material.publicKey),
      },
    });
    return { material, key, history };
  }

  async function cleanupOwner() {
    await prisma.auditLog.deleteMany({ where: { userId: { in: [owner.id, actor.id] } } });
    await prisma.foundationDecisionVote.deleteMany({ where: { userId: owner.id } });
    await prisma.userSigningKeyHistory.deleteMany({ where: { userId: owner.id } });
    await prisma.userSigningKey.deleteMany({ where: { userId: owner.id } });
    await prisma.signingKeyRequest.deleteMany({ where: { userId: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, actor.id] } } });
  }

  /**
   * BUG (B), failure point 1 — the audit write fails after the key update.
   * Before the fix the key stayed revoked with no audit record.
   */
  it('revokeKey rolls back the whole revocation when the audit write fails', async () => {
    const { key, history } = await seedKey();
    // Scope the trigger to THIS key so a parallel integration file's audit
    // write is never affected by a global trigger.
    await installFailingTrigger(
      'itest_fail_audit',
      'audit_logs',
      `NEW.entity = 'UserSigningKey' AND NEW.entity_id = '${key.id}'`
    );
    try {
      await expect(
        EsignService.revokeKey(owner.id, actor.id, 'Alasan pencabutan yang panjang')
      ).rejects.toThrow();
    } finally {
      await dropFailingTrigger('itest_fail_audit', 'audit_logs');
    }

    const afterKey = await prisma.userSigningKey.findUnique({ where: { id: key.id } });
    expect(afterKey?.revokedAt).toBeNull();
    const afterHistory = await prisma.userSigningKeyHistory.findUnique({ where: { id: history.id } });
    expect(afterHistory?.revokedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: key.id, action: 'REVOKE' } })).toBe(0);

    await cleanupOwner();
  });

  /**
   * BUG (B), failure point 2 — the history stamp fails after the key update.
   */
  it('revokeKey rolls back the key update when the history stamp fails', async () => {
    const { key, history } = await seedKey();
    await installFailingTrigger(
      'itest_fail_history',
      'user_signing_key_history',
      'NEW.revoked_at IS NOT NULL',
      'UPDATE'
    );
    try {
      await expect(
        EsignService.revokeKey(owner.id, actor.id, 'Alasan pencabutan yang panjang')
      ).rejects.toThrow();
    } finally {
      await dropFailingTrigger('itest_fail_history', 'user_signing_key_history');
    }

    const afterKey = await prisma.userSigningKey.findUnique({ where: { id: key.id } });
    expect(afterKey?.revokedAt).toBeNull();
    const afterHistory = await prisma.userSigningKeyHistory.findUnique({ where: { id: history.id } });
    expect(afterHistory?.revokedAt).toBeNull();

    await cleanupOwner();
  });

  it('revokeKey commits key, history, and audit together on success', async () => {
    const { key, history } = await seedKey();

    const result = await EsignService.revokeKey(owner.id, actor.id, 'Alasan pencabutan yang panjang');

    const afterKey = await prisma.userSigningKey.findUnique({ where: { id: key.id } });
    const afterHistory = await prisma.userSigningKeyHistory.findUnique({ where: { id: history.id } });
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: key.id, action: 'REVOKE' },
    });
    expect(afterKey?.revokedAt?.getTime()).toBe(result.revokedAt.getTime());
    expect(afterHistory?.revokedAt?.getTime()).toBe(result.revokedAt.getTime());
    expect(audit).not.toBeNull();

    await cleanupOwner();
  });

  /**
   * BUG (C) — the replacement create fails after the old key was superseded
   * and deleted. Before the fix the user was left with NO key.
   */
  it('activateKey keeps the old key and history intact when the replacement create fails', async () => {
    const { key, history } = await seedKey({ expired: true });
    await prisma.signingKeyRequest.create({
      data: {
        userId: owner.id,
        kind: SigningKeyRequestKind.ENROLLMENT,
        status: SigningKeyRequestStatus.APPROVED,
        decidedById: actor.id,
        decidedAt: new Date(),
        grantedDays: 365,
      },
    });
    await installFailingTrigger('itest_fail_key', 'user_signing_keys', 'TRUE');
    try {
      await expect(EsignService.activateKey(owner.id, PASS)).rejects.toThrow();
    } finally {
      await dropFailingTrigger('itest_fail_key', 'user_signing_keys');
    }

    const afterKey = await prisma.userSigningKey.findUnique({ where: { id: key.id } });
    expect(afterKey).not.toBeNull();
    expect(afterKey?.publicKey).toBe(key.publicKey);
    const afterHistory = await prisma.userSigningKeyHistory.findUnique({ where: { id: history.id } });
    expect(afterHistory?.supersededAt).toBeNull();

    await cleanupOwner();
  });

  /**
   * BUG (C) success half — exactly one new key exists and the old history row
   * is superseded at the same commit.
   */
  it('activateKey commits the replacement and supersedes the old history together', async () => {
    const { key, history } = await seedKey({ expired: true });
    await prisma.signingKeyRequest.create({
      data: {
        userId: owner.id,
        kind: SigningKeyRequestKind.ENROLLMENT,
        status: SigningKeyRequestStatus.APPROVED,
        decidedById: actor.id,
        decidedAt: new Date(),
        grantedDays: 365,
      },
    });

    const activated = await EsignService.activateKey(owner.id, PASS);

    const keys = await prisma.userSigningKey.findMany({ where: { userId: owner.id } });
    expect(keys).toHaveLength(1);
    expect(keys[0].id).toBe(activated.id);
    expect(keys[0].id).not.toBe(key.id);

    const afterHistory = await prisma.userSigningKeyHistory.findUnique({ where: { id: history.id } });
    expect(afterHistory?.supersededAt).not.toBeNull();

    await cleanupOwner();
  });
});
