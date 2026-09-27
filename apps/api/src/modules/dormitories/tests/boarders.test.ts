import { describe, it, expect, vi, beforeEach } from 'vitest';

// Who a santri mukim's musyrif is: whoever holds an active assignment to
// their kamar or to their whole asrama, with an active account. One rule,
// read by Perizinan and Absensi.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: { findMany: vi.fn() },
    musyrifAssignment: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { coversRoom, musyrifOfBoarders } from '../boarders';

const room = (id: string, dormitoryId: string) => ({ room: { id, dormitoryId } });
const musyrif = (id: string, isActive = true) => ({
  musyrif: { user: { id, name: `Ustadz ${id}`, isActive } },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.student.findMany).mockResolvedValue([
    { id: 'in-k1', roomAssignments: [room('k1', 'asrama-a')] },
    { id: 'in-k2', roomAssignments: [room('k2', 'asrama-a')] },
    { id: 'in-b', roomAssignments: [room('k9', 'asrama-b')] },
    { id: 'day-pupil', roomAssignments: [] },
  ] as never);
  vi.mocked(prisma.musyrifAssignment.findMany).mockResolvedValue([
    { dormitoryId: 'asrama-a', roomId: 'k1', ...musyrif('kamar-k1') },
    { dormitoryId: 'asrama-a', roomId: null, ...musyrif('whole-a') },
    { dormitoryId: 'asrama-a', roomId: 'k2', ...musyrif('gone', false) },
  ] as never);
});

describe('coversRoom', () => {
  it('its kamar, or its whole asrama — not another asrama', () => {
    const k1 = { id: 'k1', dormitoryId: 'asrama-a' };
    expect(coversRoom({ dormitoryId: 'asrama-a', roomId: 'k1' }, k1)).toBe(true);
    expect(coversRoom({ dormitoryId: 'asrama-a', roomId: null }, k1)).toBe(true);
    expect(coversRoom({ dormitoryId: 'asrama-a', roomId: 'k2' }, k1)).toBe(false);
    expect(coversRoom({ dormitoryId: 'asrama-b', roomId: null }, k1)).toBe(false);
  });
});

describe('musyrifOfBoarders', () => {
  it('each boarder gets the kamar musyrif and the whole-asrama musyrif, active ones only', async () => {
    const map = await musyrifOfBoarders(['in-k1', 'in-k2', 'in-b', 'day-pupil']);
    expect(
      map
        .get('in-k1')
        ?.map((p) => p.id)
        .sort()
    ).toEqual(['kamar-k1', 'whole-a']);
    expect(map.get('in-k2')?.map((p) => p.id)).toEqual(['whole-a']);
    expect(map.get('in-b')).toEqual([]);
    expect(map.has('day-pupil')).toBe(false);
  });

  it('asks only for assignments in force, in the boarders’ asrama', async () => {
    await musyrifOfBoarders(['in-k1', 'in-b']);
    const where = vi.mocked(prisma.musyrifAssignment.findMany).mock.calls[0][0]!.where!;
    expect(where).toMatchObject({
      isActive: true,
      musyrif: { isActive: true },
      dormitoryId: { in: expect.arrayContaining(['asrama-a', 'asrama-b']) },
    });
  });

  it('no boarder among them: no second query', async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValueOnce([
      { id: 'day-pupil', roomAssignments: [] },
    ] as never);
    expect((await musyrifOfBoarders(['day-pupil'])).size).toBe(0);
    expect(prisma.musyrifAssignment.findMany).not.toHaveBeenCalled();
  });
});
