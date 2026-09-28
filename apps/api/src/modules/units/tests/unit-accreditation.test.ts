import { describe, it, expect, vi, beforeEach } from 'vitest';

// A unit's accreditation as its certificate states it (decided 2026-09-28,
// decisions/akreditasi-unit.md): the unit's admin and the Super Admin keep
// it, with the PDF; the kepala sekolah and the yayasan's organs read it; the
// certificate in force is the latest one not yet run out — the one the public
// site, the exports and the SKHUN state.

vi.mock('@/lib/prisma', () => {
  const prisma = {
    unit: { findFirst: vi.fn() },
    unitAccreditation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn((args) => ({ op: 'delete', args })),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn((args) => ({ op: 'audit', args })) },
    userRoleAssignment: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: typeof prisma) => unknown)(prisma) : arg
  );
  return { prisma };
});

import { prisma } from '@/lib/prisma';
import {
  accreditationsToRemind,
  certificateOf,
  checkCertificate,
  correctAccreditation,
  currentAccreditations,
  deleteAccreditation,
  listAccreditations,
  recordAccreditation,
} from '../unit-accreditation.service';

const SMP = 'unit-smp';
const NOW = new Date('2026-09-28T03:00:00.000Z');
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const PDF = { buffer: Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n'), originalname: 'sertifikat.pdf' };

const ADMIN_SMP = { sub: 'u-admin-smp', roleCode: 'SMPIT_ADMIN', unitId: SMP };
const ADMIN_SD = { sub: 'u-admin-sd', roleCode: 'SDIT_ADMIN', unitId: 'unit-sd' };
const KEPALA_SMP = { sub: 'u-kepala-smp', roleCode: 'SMPIT_KEPALA_SEKOLAH', unitId: SMP };
const SUPER = { sub: 'u-super', roleCode: 'SUPER_ADMIN', unitId: null };
const KETUA = { sub: 'u-ketua', roleCode: 'YAYASAN_KETUA', unitId: null };
const GURU = { sub: 'u-guru', roleCode: 'SMPIT_GURU', unitId: SMP };

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  unitId: SMP,
  rating: 'B',
  certificateNumber: '01758/32/SMP/2023',
  decreeNumber: '036/BAN-PDM/SK/2023',
  decreedAt: day('2023-08-29'),
  validUntil: day('2028-08-29'),
  issuer: 'BAN-PDM',
  certificateSha256: 'abc',
  reminderSentAt: null,
  createdAt: new Date('2026-09-28T01:00:00.000Z'),
  updatedAt: new Date('2026-09-28T01:00:00.000Z'),
  recordedBy: { id: 'u-admin-smp', name: 'Admin SMP' },
  ...extra,
});

const INPUT = {
  rating: 'B' as const,
  certificateNumber: '01758/32/SMP/2023',
  decreeNumber: '036/BAN-PDM/SK/2023',
  decreedAt: '2023-08-29',
  validUntil: '2028-08-29',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.unit.findFirst).mockResolvedValue({
    id: SMP,
    name: 'SMP IT Cipansor',
    npsn: '69988558',
  } as never);
});

describe('who reads and who keeps it', () => {
  beforeEach(() => vi.mocked(prisma.unitAccreditation.findMany).mockResolvedValue([]));

  it.each([
    ['the unit admin', ADMIN_SMP, true],
    ['the Super Admin', SUPER, true],
    ['the kepala sekolah', KEPALA_SMP, false],
    ['a yayasan organ', KETUA, false],
  ])('%s reads the unit; may write: %s', async (_who, actor, canWrite) => {
    const list = await listAccreditations(SMP, actor, NOW);
    expect(list.canWrite).toBe(canWrite);
    expect(list.unit.npsn).toBe('69988558');
  });

  it.each([
    ["another unit's admin", ADMIN_SD],
    ['a teacher of the unit', GURU],
  ])('%s is told the unit does not exist', async (_who, actor) => {
    await expect(listAccreditations(SMP, actor, NOW)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a kepala sekolah who tries to record one: 403', async () => {
    await expect(recordAccreditation(SMP, INPUT, PDF, KEPALA_SMP, NOW)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.unitAccreditation.create).not.toHaveBeenCalled();
  });
});

describe('the certificate PDF', () => {
  it('takes a PDF by its bytes, and keeps its SHA-256', () => {
    const checked = checkCertificate(PDF);
    expect(checked.certificateSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['no file', undefined, 'Unggah PDF sertifikat akreditasinya'],
    [
      'a PNG named .pdf',
      { buffer: Buffer.from('\x89PNG\r\n'), originalname: 'x.pdf' },
      'Berkas sertifikat harus PDF',
    ],
    [
      'a file over 5 MB',
      { buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]) },
      'PDF sertifikat paling besar 5 MB',
    ],
  ])('refuses %s', (_what, file, message) => {
    expect(() => checkCertificate(file)).toThrow(message);
  });
});

describe('recording, correcting, deleting — each in the audit log', () => {
  it('records a certificate with its PDF and who recorded it', async () => {
    vi.mocked(prisma.unitAccreditation.create).mockResolvedValue(row('acc-1') as never);
    vi.mocked(prisma.unitAccreditation.findMany).mockResolvedValue([row('acc-1')] as never);

    const view = await recordAccreditation(SMP, INPUT, PDF, ADMIN_SMP, NOW);

    const data = vi.mocked(prisma.unitAccreditation.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      unitId: SMP,
      rating: 'B',
      decreedAt: day('2023-08-29'),
      validUntil: day('2028-08-29'),
      recordedById: 'u-admin-smp',
    });
    expect(
      Buffer.from(data.certificatePdf as Uint8Array)
        .subarray(0, 5)
        .toString()
    ).toBe('%PDF-');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-admin-smp',
        action: 'CREATE',
        entity: 'UNIT_ACCREDITATION',
        entityId: 'acc-1',
        newValues: expect.objectContaining({ rating: 'B', validUntil: '2028-08-29' }),
      }),
    });
    expect(view).toMatchObject({ id: 'acc-1', current: true, decreedAt: '2023-08-29' });
  });

  it('refuses a correction whose end falls on or before its decree', async () => {
    vi.mocked(prisma.unitAccreditation.findFirst).mockResolvedValue(row('acc-1') as never);
    await expect(
      correctAccreditation(SMP, 'acc-1', { validUntil: '2023-08-29' }, undefined, ADMIN_SMP, NOW)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.unitAccreditation.update).not.toHaveBeenCalled();
  });

  it('a new end date clears the reminder, so the new date is reminded in turn', async () => {
    vi.mocked(prisma.unitAccreditation.findFirst).mockResolvedValue(row('acc-1') as never);
    vi.mocked(prisma.unitAccreditation.update).mockResolvedValue(
      row('acc-1', { validUntil: day('2030-12-31') }) as never
    );
    vi.mocked(prisma.unitAccreditation.findMany).mockResolvedValue([]);
    await correctAccreditation(SMP, 'acc-1', { validUntil: '2030-12-31' }, undefined, SUPER, NOW);
    expect(vi.mocked(prisma.unitAccreditation.update).mock.calls[0][0].data).toEqual({
      validUntil: day('2030-12-31'),
      reminderSentAt: null,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        oldValues: expect.objectContaining({ validUntil: '2028-08-29' }),
        newValues: expect.objectContaining({ validUntil: '2030-12-31' }),
      }),
    });
  });

  it('deletes a record entered by mistake, keeping its facts in the log', async () => {
    vi.mocked(prisma.unitAccreditation.findFirst).mockResolvedValue(row('acc-1') as never);
    await deleteAccreditation(SMP, 'acc-1', ADMIN_SMP);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { op: 'delete', args: { where: { id: 'acc-1' } } },
      {
        op: 'audit',
        args: {
          data: expect.objectContaining({
            action: 'DELETE',
            oldValues: expect.objectContaining({ certificateNumber: '01758/32/SMP/2023' }),
          }),
        },
      },
    ]);
  });

  it("gives the PDF to a reader, and nobody else's unit", async () => {
    vi.mocked(prisma.unitAccreditation.findFirst).mockResolvedValue({
      certificatePdf: new Uint8Array(PDF.buffer),
      certificateNumber: '01758/32/SMP/2023',
    } as never);
    const file = await certificateOf(SMP, 'acc-1', KEPALA_SMP);
    expect(file.fileName).toBe('sertifikat-akreditasi-01758-32-SMP-2023.pdf');
    expect(file.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(certificateOf(SMP, 'acc-1', ADMIN_SD)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('the certificate in force', () => {
  it('is the latest decree among those not yet run out', async () => {
    vi.mocked(prisma.unitAccreditation.findMany).mockResolvedValue([
      row('old', { decreedAt: day('2018-08-01'), validUntil: day('2023-08-01') }),
      row('b-2023'),
      // An extension decreed later supersedes the 2023 certificate.
      row('ext-2026', { decreedAt: day('2026-05-01'), validUntil: day('2029-12-31') }),
    ] as never);
    const list = await listAccreditations(SMP, ADMIN_SMP, NOW);
    expect(list.accreditations.map((a) => [a.id, a.current])).toEqual([
      ['old', false],
      ['b-2023', false],
      ['ext-2026', true],
    ]);
  });

  it('is nothing once the last certificate has run out', async () => {
    vi.mocked(prisma.unitAccreditation.findMany).mockResolvedValue([]);
    const current = await currentAccreditations([SMP], NOW);
    expect(current.has(SMP)).toBe(false);
    // Only certificates still in force are read: from today on, in WIB.
    expect(vi.mocked(prisma.unitAccreditation.findMany).mock.calls[0][0]).toMatchObject({
      where: { validUntil: { gte: day('2026-09-28') }, unitId: { in: [SMP] } },
    });
  });

  it('maps each unit to its own', async () => {
    vi.mocked(prisma.unitAccreditation.findMany).mockResolvedValue([
      row('smp'),
      row('sma', { unitId: 'unit-sma', rating: 'A', validUntil: day('2027-01-31') }),
    ] as never);
    const current = await currentAccreditations(undefined, NOW);
    expect(current.get(SMP)).toMatchObject({ rating: 'B', validUntil: '2028-08-29' });
    expect(current.get('unit-sma')).toMatchObject({ rating: 'A', validUntil: '2027-01-31' });
  });
});

describe('accreditationsToRemind — 12 months ahead, once', () => {
  it("names the unit's kepala and admin for a certificate ending within a year", async () => {
    vi.mocked(prisma.unitAccreditation.findMany)
      .mockResolvedValueOnce([
        row('ending', { validUntil: day('2027-06-30') }),
        row('later', { unitId: 'unit-sma', validUntil: day('2028-01-31') }),
      ] as never)
      .mockResolvedValueOnce([
        { id: 'ending', unit: { id: SMP, name: 'SMP IT Cipansor' } },
      ] as never);
    vi.mocked(prisma.userRoleAssignment.findMany).mockResolvedValue([
      { userId: 'u-kepala-smp', unitId: SMP },
      { userId: 'u-admin-smp', unitId: SMP },
    ] as never);

    const due = await accreditationsToRemind(NOW);

    expect(vi.mocked(prisma.unitAccreditation.findMany).mock.calls[1][0]).toMatchObject({
      where: { id: { in: ['ending'] }, reminderSentAt: null },
    });
    expect(due).toEqual([
      expect.objectContaining({
        id: 'ending',
        unitName: 'SMP IT Cipansor',
        validUntil: '2027-06-30',
        recipients: ['u-kepala-smp', 'u-admin-smp'],
      }),
    ]);
    const roles = vi.mocked(prisma.userRoleAssignment.findMany).mock.calls[0][0]!.where!.role as {
      code: { in: string[] };
    };
    expect(roles.code.in).toEqual(expect.arrayContaining(['SMPIT_ADMIN', 'SMPIT_KEPALA_SEKOLAH']));
    expect(roles.code.in).not.toContain('SUPER_ADMIN');
  });
});
