import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import {
  FoundationDecisionService,
  canonicalDecisionPayload,
} from './foundation-decisions.service';
import { createKeyMaterial } from '@/utils/esign';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    foundationDecision: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    foundationDecisionMember: { create: vi.fn() },
    foundationDecisionVote: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    foundationDecisionRule: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    foundationEseal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    foundationDecisionDocument: { create: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
    userSigningKey: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb: any) => cb(prisma)),
  },
}));

const PASS = 'passphrase-anggota-2026';
const material = createKeyMaterial(PASS);
const signingKeyRow = {
  algorithm: material.algorithm,
  publicKey: material.publicKey,
  encryptedPrivateKey: material.encryptedPrivateKey,
  kdfSalt: material.kdfSalt,
  kdfParams: material.kdfParams,
  iv: material.iv,
  authTag: material.authTag,
  approvedAt: new Date(),
  expiresAt: new Date(Date.now() + 300 * 24 * 3600 * 1000),
  revokedAt: null,
  lockedUntil: null,
};

const dm = prisma as unknown as Record<string, any>;

function memberAssignments(count: number, roleCode = 'YAYASAN_PEMBINA') {
  return Array.from({ length: count }, (_, i) => ({
    userId: `user-${i}`,
    user: { id: `user-${i}`, name: `Anggota ${i}` },
    role: { code: roleCode },
  }));
}

function decisionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'dec-1',
    organType: 'PEMBINA',
    kind: 'CIRCULAR',
    decisionType: 'pengesahan-rencana-kerja',
    subject: 'Pengesahan Rencana Kerja',
    body: 'Rencana kerja tahunan disetujui seluruh anggota.',
    status: 'VOTING',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: 'user-0',
    decidedById: null,
    decidedAt: null,
    quorumSnapshot: {
      organType: 'PEMBINA',
      kind: 'CIRCULAR',
      activeCount: 3,
      presentMode: 'MUTLAK',
      presentValue: 1,
      decisionMode: 'MUTLAK',
      decisionValue: 1,
      decisionBasis: 'MUFTAKAT_FIRST',
    },
    voteSummary: { approve: 0, reject: 0, abstain: 0, present: 0, active: 3, totalVotes: 0 },
    finalPdfDigest: null,
    finalPdfByteSize: null,
    finalPdfSealSignature: null,
    verificationToken: 'tok-1',
    createdBy: { id: 'user-0', name: 'Anggota 0' },
    decidedBy: null,
    members: [
      {
        id: 'm0',
        userId: 'user-0',
        name: 'Anggota 0',
        roleCode: 'YAYASAN_PEMBINA',
        user: { id: 'user-0', name: 'Anggota 0' },
      },
      {
        id: 'm1',
        userId: 'user-1',
        name: 'Anggota 1',
        roleCode: 'YAYASAN_PEMBINA',
        user: { id: 'user-1', name: 'Anggota 1' },
      },
      {
        id: 'm2',
        userId: 'user-2',
        name: 'Anggota 2',
        roleCode: 'YAYASAN_PEMBINA',
        user: { id: 'user-2', name: 'Anggota 2' },
      },
    ],
    votes: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('canonicalDecisionPayload', () => {
  const base = {
    decisionId: 'dec-1',
    organType: 'PEMBINA',
    kind: 'CIRCULAR',
    decisionType: 'pengesahan-rencana-kerja',
    subject: 'Pengesahan',
    body: 'Isi keputusan.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    activeCount: 3,
    voterId: 'user-1',
    choice: 'APPROVE',
    signedAt: new Date('2026-01-02T00:00:00Z'),
  };

  it('deterministik untuk input yang sama', () => {
    expect(canonicalDecisionPayload(base)).toBe(canonicalDecisionPayload(base));
  });

  it('berubah bila isi keputusan berubah', () => {
    const changed = canonicalDecisionPayload({ ...base, body: 'Isi keputusan berbeda.' });
    expect(changed).not.toBe(canonicalDecisionPayload(base));
  });

  it('berubah bila pilihan suara berubah', () => {
    expect(canonicalDecisionPayload({ ...base, choice: 'REJECT' })).not.toBe(
      canonicalDecisionPayload(base)
    );
  });
});

describe('FoundationDecisionService.castVote', () => {
  it('mencatat suara + tanda tangan digital dan memperbarui ringkasan', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.foundationDecisionVote.create.mockResolvedValue({
      id: 'vote-1',
      decisionId: 'dec-1',
      userId: 'user-1',
      choice: 'APPROVE',
      signedAt: new Date(),
    });
    dm.foundationDecisionVote.findMany.mockResolvedValue([
      { choice: 'APPROVE' },
      { choice: 'APPROVE' },
      { choice: 'REJECT' },
    ]);
    dm.foundationDecision.update.mockResolvedValue({ ...d, status: 'VOTING' });
    dm.userSigningKey.findUnique.mockResolvedValue(signingKeyRow);
    dm.foundationEseal.findFirst.mockResolvedValue(null);

    const result = await FoundationDecisionService.castVote(
      { id: 'user-1', roleCode: 'YAYASAN_PEMBINA' },
      'dec-1',
      { choice: 'APPROVE', note: undefined, passphrase: PASS }
    );

    expect(result.voteId).toBe('vote-1');
    expect(dm.foundationDecisionVote.create).toHaveBeenCalledTimes(1);
    const created = dm.foundationDecisionVote.create.mock.calls[0][0].data;
    expect(created.choice).toBe('APPROVE');
    expect(created.signature).toBeTruthy();
    expect(created.publicKey).toBe(material.publicKey);
    expect(created.canonicalDigest).toBeTruthy();
    expect(result.voteSummary.approve).toBe(2);
    expect(result.voteSummary.reject).toBe(1);
  });

  it('menolak bila sudah pernah memberi suara', async () => {
    const d = decisionRow({
      votes: [
        {
          id: 'v',
          userId: 'user-1',
          choice: 'APPROVE',
          signedAt: new Date(),
          user: { id: 'user-1', name: 'Anggota 1' },
        },
      ],
    });
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/sudah memberikan suara/);
  });

  it('menolak pemilih yang bukan bagian organ', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.castVote({ id: 'outside', roleCode: 'STAFF' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/bukan anggota organ/);
  });

  it('mewajibkan alasan untuk REJECT pada keputusan sirkuler', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'REJECT',
        note: 'no',
        passphrase: PASS,
      })
    ).rejects.toThrow(/wajib disertai alasan/);
  });

  it('menolak pemilih tanpa kunci tanda tangan yang sah', async () => {
    const d = decisionRow();
    dm.foundationDecision.findUnique.mockResolvedValue(d);
    dm.userSigningKey.findUnique.mockResolvedValue(null);

    await expect(
      FoundationDecisionService.castVote({ id: 'user-1', roleCode: 'YAYASAN_PEMBINA' }, 'dec-1', {
        choice: 'APPROVE',
        passphrase: PASS,
      })
    ).rejects.toThrow(/belum memiliki kunci tanda tangan/);
  });
});

describe('FoundationDecisionService.create', () => {
  it('membuat keputusan + snapshot anggota organ dan mencatat audit', async () => {
    dm.userRoleAssignment.findMany.mockResolvedValue(memberAssignments(3));
    dm.foundationDecisionRule.findUnique.mockResolvedValue(null);
    dm.foundationDecision.create.mockResolvedValue({ id: 'dec-new' });

    const id = await FoundationDecisionService.create(
      { id: 'user-0', roleCode: 'YAYASAN_PEMBINA' },
      {
        organType: 'PEMBINA',
        kind: 'CIRCULAR',
        subject: 'Subjek Keputusan',
        body: 'Isi keputusan yang cukup panjang minimal sepuluh karakter.',
        decisionType: 'pengesahan-rencana-kerja',
      }
    );

    expect(id).toBe('dec-new');
    expect(dm.foundationDecision.create).toHaveBeenCalledTimes(1);
    const data = dm.foundationDecision.create.mock.calls[0][0].data;
    expect(data.status).toBe('VOTING');
    expect(data.quorumSnapshot.presentMode).toBe('MUTLAK');
    expect(data.members.create).toHaveLength(3);
    expect(dm.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('FoundationDecisionService.verifyByToken', () => {
  it('menolak bila token tidak dikenal / keputusan belum final', async () => {
    dm.foundationDecision.findUnique.mockResolvedValue(null);
    await expect(FoundationDecisionService.verifyByToken('nope')).resolves.toEqual({
      found: false,
    });
  });
});
