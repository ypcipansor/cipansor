import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACTORS,
  SANTRI_SMA,
  SANTRI_SMP,
  SMA,
  SMP,
  findStudentLike,
} from '../../../../tests/mocks/santri-fixture';

/**
 * Which santri's muhadatsah an account reaches, and which unit a new one
 * belongs to — the same rule as muhadhoroh (see its tests).
 */

const prismaMock = vi.hoisted(() => ({
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  muhadatsah: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { muhadatsahService } from '../muhadatsah.service';

const input = (studentId: string, extra: Record<string, unknown> = {}) => ({
  studentId,
  scheduledAt: '2026-10-10T08:00:00.000Z',
  language: 'Arabic',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.student.findFirst.mockImplementation(findStudentLike);
  prismaMock.student.findMany.mockResolvedValue([]);
  prismaMock.muhadatsah.create.mockImplementation(async (args: { data: object }) => args.data);
  prismaMock.muhadatsah.findMany.mockResolvedValue([]);
});

describe('a new muhadatsah', () => {
  it("a musyrif pairs an SMA Qur'an santri, and it belongs to the santri's unit", async () => {
    const record = await muhadatsahService.create(
      input(SANTRI_SMA.id, { partnerId: SANTRI_SMP.id }),
      ACTORS.musyrif
    );
    expect(record).toMatchObject({ unitId: SMA, partnerId: SANTRI_SMP.id });
  });

  it("a school's teacher cannot pair their santri with another school's", async () => {
    await expect(
      muhadatsahService.create(input(SANTRI_SMP.id, { partnerId: SANTRI_SMA.id }), ACTORS.guruSmp)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.muhadatsah.create).not.toHaveBeenCalled();
  });

  it("the unit the form names must be the santri's", async () => {
    await expect(
      muhadatsahService.create(input(SANTRI_SMA.id, { unitId: SMP }), ACTORS.musyrif)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('reading muhadatsah', () => {
  it('partners are offered from the santri the reader reaches', async () => {
    await muhadatsahService.matchPartners(ACTORS.musyrif, undefined, 'Arabic');
    expect(prismaMock.student.findMany.mock.calls[0][0].where.AND).toEqual([{}, {}]);

    vi.clearAllMocks();
    prismaMock.muhadatsah.findMany.mockResolvedValue([]);
    prismaMock.student.findMany.mockResolvedValue([]);
    await muhadatsahService.matchPartners(ACTORS.guruSmp, SMA, 'Arabic');
    expect(prismaMock.student.findMany.mock.calls[0][0].where.AND).toEqual([
      { unitId: SMP },
      { unitId: SMA },
    ]);
  });

  it('a santri sees their own, not the whole unit', async () => {
    prismaMock.muhadatsah.count.mockResolvedValue(0);
    await muhadatsahService.list({ page: 1, limit: 10 }, ACTORS.santriSmp);
    expect(prismaMock.muhadatsah.findMany.mock.calls[0][0].where).toEqual({
      student: { userId: ACTORS.santriSmp.sub },
    });
  });
});
