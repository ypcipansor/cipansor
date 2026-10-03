import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The decisions around publishing (decisions/siaran-pengumuman.md). The Prisma
 * filters themselves — `hasSome`, relation filters, the board's OR — are
 * proven against Postgres by the e2e `announcements.spec.ts`; a mocked client
 * would accept whatever they said.
 */

const prismaMock = vi.hoisted(() => ({
  announcement: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  student: { findMany: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  teacher: { findFirst: vi.fn() },
  class: { findMany: vi.fn() },
  unit: { findMany: vi.fn(), findUnique: vi.fn() },
}));
const delivery = vi.hoisted(() => ({
  deliverAnnouncement: vi.fn(),
  reviseAnnouncementDelivery: vi.fn(),
  withdrawAnnouncementDelivery: vi.fn(),
  announcementRecipientCount: vi.fn(),
}));
const dorm = vi.hoisted(() => ({ boardersOfMusyrif: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/modules/notifications', () => delivery);
vi.mock('@/modules/dormitories', () => dorm);

import { create, recipientsOf, update, withdraw } from '../announcements.service';
import { createAnnouncementSchema } from '../announcements.schema';

const guru = { sub: 'guru-1', roleCode: 'SDIT_GURU', unitId: 'unit-sd' };
const tu = { sub: 'tu-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-sd' };
const CLASS_A = '11111111-1111-4111-8111-111111111111';
const CLASS_B = '22222222-2222-4222-8222-222222222222';
const OTHER_UNIT = '33333333-3333-4333-8333-333333333333';

const body = (extra: Record<string, unknown>) =>
  createAnnouncementSchema.parse({ title: 'Rapat wali', content: 'Sabtu pukul 08.00', ...extra });

const row = (data: Record<string, unknown>) => ({
  id: 'a-1',
  type: 'ANNOUNCEMENT',
  priority: 0,
  attachmentUrl: null,
  expiresAt: null,
  withdrawnAt: null,
  withdrawnById: null,
  createdAt: new Date('2026-10-03T00:00:00Z'),
  updatedAt: new Date('2026-10-03T00:00:00Z'),
  unit: null,
  createdBy: null,
  classIds: [],
  studentIds: [],
  targetRoles: [],
  ...data,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.announcement.create.mockImplementation(async ({ data }) => row(data));
  prismaMock.student.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([]);
  delivery.deliverAnnouncement.mockImplementation(async (a) => a.recipients.length);
});

describe('publishing', () => {
  it('refuses Super Admin and a wali outright', async () => {
    for (const actor of [
      { sub: 'sa', roleCode: 'SUPER_ADMIN', unitId: null },
      { sub: 'wali', roleCode: 'SDIT_ORANG_TUA', unitId: 'unit-sd' },
    ]) {
      await expect(create(actor, body({ scope: 'UNIT' }))).rejects.toMatchObject({
        statusCode: 403,
      });
    }
    expect(prismaMock.announcement.create).not.toHaveBeenCalled();
  });

  it('a guru sends only to classes they teach or homeroom', async () => {
    prismaMock.teacher.findFirst.mockResolvedValue({ id: 't-1' });
    prismaMock.class.findMany.mockResolvedValue([
      { id: CLASS_A, name: '4A', unitId: 'unit-sd', unit: { name: 'SD IT' } },
    ]);
    await expect(
      create(guru, body({ scope: 'CLASSES', classIds: [CLASS_A, CLASS_B] }))
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.announcement.create).not.toHaveBeenCalled();

    const made = await create(guru, body({ scope: 'CLASSES', classIds: [CLASS_A] }));
    const data = prismaMock.announcement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ scope: 'CLASSES', classIds: [CLASS_A], unitId: 'unit-sd' });
    expect(made.canManage).toBe(true);
  });

  it('a unit role writes to its own unit, whatever unit the body names', async () => {
    await create(tu, body({ scope: 'UNIT', unitId: OTHER_UNIT }));
    expect(prismaMock.announcement.create.mock.calls[0][0].data.unitId).toBe('unit-sd');
  });

  it('the yayasan names the unit, and it must exist', async () => {
    const ketua = { sub: 'ketua', roleCode: 'YAYASAN_KETUA', unitId: null };
    prismaMock.unit.findUnique.mockResolvedValue(null);
    await expect(create(ketua, body({ scope: 'UNIT', unitId: OTHER_UNIT }))).rejects.toMatchObject({
      statusCode: 400,
    });
    prismaMock.unit.findUnique.mockResolvedValue({ id: OTHER_UNIT });
    await create(ketua, body({ scope: 'UNIT', unitId: OTHER_UNIT }));
    expect(prismaMock.announcement.create.mock.calls[0][0].data.unitId).toBe(OTHER_UNIT);
    await create(ketua, body({ scope: 'YAYASAN' }));
    expect(prismaMock.announcement.create.mock.calls[1][0].data.unitId).toBeNull();
  });

  it('a musyrif with no santri mukim has no one to send to', async () => {
    const musyrif = { sub: 'm-1', roleCode: 'MUSYRIF', unitId: null };
    dorm.boardersOfMusyrif.mockResolvedValue([]);
    await expect(create(musyrif, body({ scope: 'BOARDERS' }))).rejects.toMatchObject({
      statusCode: 400,
    });
    dorm.boardersOfMusyrif.mockResolvedValue(['s-1', 's-2']);
    await create(musyrif, body({ scope: 'BOARDERS' }));
    expect(prismaMock.announcement.create.mock.calls[0][0].data.studentIds).toEqual(['s-1', 's-2']);
  });

  it('delivers to the audience now, or holds the bell rows until a later publication', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        user: { id: 'santri-1', isActive: true, deletedAt: null },
        parents: [{ parent: { id: 'wali-1', isActive: true, deletedAt: null } }],
      },
    ]);
    const made = await create(tu, body({ scope: 'UNIT', targetRoles: ['PARENT'] }));
    expect(delivery.deliverAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['wali-1'], scheduledAt: null, sentBy: 'tu-1' })
    );
    expect(made.recipientCount).toBe(1);

    const later = new Date(Date.now() + 86_400_000);
    await create(tu, body({ scope: 'UNIT', publishedAt: later.toISOString() }));
    expect(delivery.deliverAnnouncement.mock.calls[1][0].scheduledAt).toEqual(later);
  });

  it('leaves nothing behind when delivery fails', async () => {
    delivery.deliverAnnouncement.mockRejectedValue(new Error('db down'));
    prismaMock.announcement.delete.mockResolvedValue({});
    await expect(create(tu, body({ scope: 'UNIT' }))).rejects.toThrow('db down');
    expect(prismaMock.announcement.delete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
  });
});

describe('recipients', () => {
  const base = {
    scope: 'CLASSES' as const,
    unitId: 'unit-sd',
    classIds: [CLASS_A],
    studentIds: [],
    targetRoles: [] as string[],
    createdById: 'guru-1',
  };

  it('a class reaches santri and wali only, active accounts only, never the sender', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        user: { id: 'santri-1', isActive: true, deletedAt: null },
        parents: [
          { parent: { id: 'wali-1', isActive: true, deletedAt: null } },
          { parent: { id: 'wali-old', isActive: false, deletedAt: null } },
        ],
      },
      {
        user: { id: 'santri-gone', isActive: true, deletedAt: new Date() },
        parents: [{ parent: { id: 'guru-1', isActive: true, deletedAt: null } }],
      },
    ]);
    const ids = await recipientsOf(base);
    expect(ids.sort()).toEqual(['santri-1', 'wali-1']);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled(); // no guru/staf for a class
  });

  it('a unit announcement for guru reads role assignments in the unit', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'guru-2' }]);
    const ids = await recipientsOf({
      ...base,
      scope: 'UNIT',
      classIds: [],
      targetRoles: ['TEACHER'],
    });
    expect(ids).toEqual(['guru-2']);
    expect(prismaMock.student.findMany).not.toHaveBeenCalled();
  });
});

describe('revising and withdrawing', () => {
  const stored = row({
    scope: 'UNIT',
    unitId: 'unit-sd',
    createdById: 'tu-1',
    title: 'Lama',
    content: 'Isi lama',
    publishedAt: new Date('2026-10-01T00:00:00Z'),
  });

  it('the author revises the words and the bell rows follow', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(stored);
    prismaMock.announcement.update.mockImplementation(async ({ data }) => ({ ...stored, ...data }));
    await update(tu, 'a-1', { title: 'Baru' });
    expect(delivery.reviseAnnouncementDelivery).toHaveBeenCalledWith('a-1', {
      title: 'Baru',
      content: undefined,
    });
  });

  it('the head withdraws it: off the board, out of every bell', async () => {
    const head = { sub: 'kepala', roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sd' };
    prismaMock.announcement.findUnique.mockResolvedValue(stored);
    prismaMock.announcement.update.mockImplementation(async ({ data }) => ({ ...stored, ...data }));
    delivery.withdrawAnnouncementDelivery.mockResolvedValue(120);
    const out = await withdraw(head, 'a-1');
    expect(prismaMock.announcement.update.mock.calls[0][0].data).toMatchObject({
      withdrawnById: 'kepala',
    });
    expect(out.removedFromBells).toBe(120);
  });

  it('someone who can see it but not manage it gets 403; someone who cannot see it, 404', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(stored);
    prismaMock.user.findUnique.mockResolvedValue({
      unitId: 'unit-sd',
      userRoles: [],
      student: null,
      parentOf: [],
    });
    prismaMock.announcement.count.mockResolvedValueOnce(1);
    await expect(withdraw(guru, 'a-1')).rejects.toMatchObject({ statusCode: 403 });
    prismaMock.announcement.count.mockResolvedValueOnce(0);
    await expect(withdraw(guru, 'a-1')).rejects.toMatchObject({ statusCode: 404 });
    expect(delivery.withdrawAnnouncementDelivery).not.toHaveBeenCalled();
  });

  it('a withdrawn announcement stays withdrawn', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({ ...stored, withdrawnAt: new Date() });
    await expect(update(tu, 'a-1', { title: 'x' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
