import { describe, it, expect, vi, beforeEach } from 'vitest';

// The portal's "Tambah Pengurus" and edit forms send what a date input gives
// (`2026-10-02`) and no foundationId. Until 2026-10-02 the API demanded a full
// date-time and a foundationId, so every add and every edit from the portal
// failed with 400 and the yayasan could not correct its own organs. A start
// date nobody knows is now stored as empty, never guessed.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    foundation: { findFirst: vi.fn() },
    boardMember: { create: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { createBoardMemberSchema, updateBoardMemberSchema } from '../foundation.schema';
import { createBoardMember, updateBoardMember } from '../foundation.service';

const created = () => vi.mocked(prisma.boardMember.create).mock.calls[0][0].data;
const updated = () => vi.mocked(prisma.boardMember.update).mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.foundation.findFirst).mockResolvedValue({ id: 'yayasan-1' } as never);
});

describe('adding a member of an organ from the portal', () => {
  it("accepts the form's own payload and files it under the yayasan", async () => {
    const body = createBoardMemberSchema.parse({
      name: 'Drs. Asep Tamim, M.Si.',
      position: 'Pengawas',
      startDate: '2026-10-02',
      isActive: true,
    });

    await createBoardMember(body);

    expect(created()).toMatchObject({
      foundationId: 'yayasan-1',
      name: 'Drs. Asep Tamim, M.Si.',
      position: 'Pengawas',
      isActive: true,
      startDate: new Date('2026-10-02T00:00:00.000Z'),
      endDate: null,
    });
  });

  it('leaves an unknown start date empty rather than inventing one', async () => {
    await createBoardMember(
      createBoardMemberSchema.parse({ name: 'Aminudin', position: 'Pengawas' })
    );

    expect(created().startDate).toBeNull();
  });

  it('refuses a date that is not a calendar day', () => {
    expect(
      createBoardMemberSchema.safeParse({
        name: 'Aminudin',
        position: 'Pengawas',
        startDate: '02/10/2026',
      }).success
    ).toBe(false);
  });

  it('answers 404 when there is no yayasan record to file it under', async () => {
    vi.mocked(prisma.foundation.findFirst).mockResolvedValue(null);

    await expect(
      createBoardMember(createBoardMemberSchema.parse({ name: 'Aminudin', position: 'Pengawas' }))
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.boardMember.create).not.toHaveBeenCalled();
  });
});

describe('editing a member', () => {
  it('saves the start date the edit form sends', async () => {
    await updateBoardMember('m-1', updateBoardMemberSchema.parse({ startDate: '2022-05-01' }));

    expect(updated().startDate).toEqual(new Date('2022-05-01T00:00:00.000Z'));
  });

  it('clears a date sent as null, and leaves one that was not sent', async () => {
    await updateBoardMember('m-1', updateBoardMemberSchema.parse({ startDate: null }));

    expect(updated().startDate).toBeNull();
    expect(updated().endDate).toBeUndefined();
  });
});
