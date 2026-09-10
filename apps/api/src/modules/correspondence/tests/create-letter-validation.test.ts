import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CorrespondenceService } from '../correspondence.service';
import { prisma } from '@/lib/prisma';
import { RoleCode } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    academicYear: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
    letterNumberBook: { findUnique: vi.fn(), update: vi.fn() },
    agendaNumber: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    letter: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    letterReviewer: { createMany: vi.fn(), deleteMany: vi.fn() },
    letterRecipient: { createMany: vi.fn(), updateMany: vi.fn() },
    letterAttachment: { create: vi.fn(), createMany: vi.fn() },
  },
}));

vi.mock('@/lib/event-bus', () => ({
  EventBusToken: {},
  eventBus: { publish: vi.fn() },
}));

vi.mock('@/utils/letter-access', () => ({
  handlesUnitCorrespondence: vi.fn(),
  letterScopeWhere: vi.fn(() => ({})),
  assertLetterAccess: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/utils/resolve-unit-id', () => ({
  seesAllUnits: vi.fn(() => false),
}));

vi.mock('@/utils/letter-verification', () => ({
  verifyLetterByToken: vi.fn(),
}));

import { handlesUnitCorrespondence } from '@/utils/letter-access';
import { seesAllUnits } from '@/utils/resolve-unit-id';

// A role that genuinely handles unit correspondence (real function or mock
// both treat it as an authorized creator), so the branch tests below exercise
// the validation logic rather than the authorization gate.
const correspondenceActor = {
  id: 'user-1',
  roleCode: RoleCode.SDIT_TATA_USAHA,
  unitId: 'unit-1',
  permissions: [],
} as any;

const baseInput = {
  title: 'Surat Uji',
  direction: 'OUTGOING' as const,
  nature: 'FORMAL' as const,
  type: 'SURAT_DINAS' as const,
  status: 'DRAFT' as const,
  content: 'isi',
  recipientIds: ['user-2'],
  reviewerIds: ['user-3'],
  ccRecipients: [],
  unitId: 'unit-1',
};

describe('CorrespondenceService.createLetter validation branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (handlesUnitCorrespondence as any).mockImplementation((_actor: any) => true);
    (seesAllUnits as any).mockReturnValue(false);
  });

  it('rejects when no actor is supplied', async () => {
    await expect(
      CorrespondenceService.createLetter(baseInput as any, 'user-1', undefined)
    ).rejects.toThrow('Peran Anda tidak berwenang untuk membuat surat dinas');
  });

  it('rejects an oversight-only actor without creation authority', async () => {
    (handlesUnitCorrespondence as any).mockImplementation(() => false);
    const oversightActor = {
      id: 'user-x',
      roleCode: RoleCode.YAYASAN_PEMBINA,
      unitId: 'unit-1',
      permissions: [],
    } as any;

    await expect(
      CorrespondenceService.createLetter(baseInput as any, 'user-x', oversightActor)
    ).rejects.toThrow('Peran Anda tidak berwenang untuk membuat surat dinas');
  });

  it('rejects an initial status other than DRAFT or PENDING_REVIEW', async () => {
    // Participant eligibility passes for the empty participant list.
    await expect(
      CorrespondenceService.createLetter(
        {
          ...baseInput,
          reviewerIds: [],
          recipientIds: [],
          ccRecipients: [],
          status: 'ARCHIVED',
        } as any,
        'user-1',
        correspondenceActor
      )
    ).rejects.toThrow('Status awal surat hanya dapat berupa DRAFT atau PENDING_REVIEW');
  });

  it('rejects an outgoing PENDING_REVIEW letter without any reviewer', async () => {
    // The recipient (user-2) passes eligibility, so the flow reaches the
    // reviewer check with an empty reviewer list.
    (prisma.user.findMany as any).mockResolvedValue([
      {
        id: 'user-2',
        unitId: 'unit-1',
        teacher: null,
        staff: null,
        userRoles: [{ unitId: 'unit-1' }],
      },
    ]);
    await expect(
      CorrespondenceService.createLetter(
        {
          ...baseInput,
          reviewerIds: [],
          ccRecipients: [],
          status: 'PENDING_REVIEW',
        } as any,
        'user-1',
        correspondenceActor
      )
    ).rejects.toThrow('Surat keluar berstatus PENDING_REVIEW wajib memilih minimal satu pemeriksa');
  });

  it('rejects participants who are outside the actor unit (eligibility)', async () => {
    // Valid internal role but a different unit — the unit-scope check fires.
    (prisma.user.findMany as any).mockResolvedValue([
      {
        id: 'user-2',
        unitId: 'unit-9',
        teacher: null,
        staff: null,
        userRoles: [{ unitId: 'unit-9' }],
      },
    ]);

    await expect(
      CorrespondenceService.createLetter(
        { ...baseInput, reviewerIds: [], ccRecipients: [] } as any,
        'user-1',
        correspondenceActor
      )
    ).rejects.toThrow('Pengguna user-2 berada di luar unit Anda');
  });

  it('rejects a participant with no active internal role', async () => {
    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user-2', unitId: 'unit-1', teacher: null, staff: null, userRoles: [] },
    ]);

    await expect(
      CorrespondenceService.createLetter(
        { ...baseInput, reviewerIds: [], ccRecipients: [] } as any,
        'user-1',
        correspondenceActor
      )
    ).rejects.toThrow('Pengguna user-2 tidak memiliki peran internal yang sah');
  });
});

describe('CorrespondenceService.validateParticipantEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (seesAllUnits as any).mockReturnValue(false);
  });

  it('returns early for an empty participant list', async () => {
    await expect(
      CorrespondenceService.validateParticipantEligibility([], correspondenceActor)
    ).resolves.toBeUndefined();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects when a participant is not found or inactive', async () => {
    (prisma.user.findMany as any).mockResolvedValue([
      { id: 'user-2', unitId: 'unit-1', teacher: null, staff: null, userRoles: [] },
    ]);

    await expect(
      CorrespondenceService.validateParticipantEligibility(
        ['user-2', 'user-ghost'],
        correspondenceActor
      )
    ).rejects.toThrow('Satu atau lebih penerima/pemeriksa tidak ditemukan atau tidak aktif');
  });

  it('allows a participant whose role assignment unit matches the actor unit', async () => {
    (prisma.user.findMany as any).mockResolvedValue([
      {
        id: 'user-2',
        unitId: 'unit-1',
        teacher: null,
        staff: null,
        userRoles: [{ unitId: 'unit-1' }],
      },
    ]);

    await expect(
      CorrespondenceService.validateParticipantEligibility(['user-2'], correspondenceActor)
    ).resolves.toBeUndefined();
  });
});
