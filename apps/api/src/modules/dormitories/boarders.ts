import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Who a santri mukim's musyrif is — one rule, read by Perizinan (who decides
 * a boarder's leave) and Absensi (who is told when a boarder misses class).
 *
 * A santri mukim has an active kamar. Their musyrif is whoever holds an
 * active assignment to that kamar, or to the whole asrama (`roomId` null),
 * and whose account is active.
 */

/** A santri's kamar now: the latest placement that has not ended. */
export const ACTIVE_ROOM_ASSIGNMENT = {
  where: { isActive: true, endedAt: null },
  orderBy: { assignedAt: 'desc' },
  take: 1,
} satisfies Prisma.Student$roomAssignmentsArgs;

/** A musyrif assignment in force at `now`, held by an active musyrif. */
export const activeMusyrifAssignment = (now: Date) =>
  ({
    isActive: true,
    OR: [{ endDate: null }, { endDate: { gt: now } }],
    musyrif: { isActive: true },
  }) satisfies Prisma.MusyrifAssignmentWhereInput;

/** Whether an assignment covers a kamar: that kamar, or its whole asrama. */
export const coversRoom = (
  assignment: { dormitoryId: string; roomId: string | null },
  room: { id: string; dormitoryId: string }
) =>
  assignment.dormitoryId === room.dormitoryId &&
  (assignment.roomId === null || assignment.roomId === room.id);

export interface Person {
  id: string;
  name: string;
}

/**
 * The musyrif of each santri mukim among `studentIds`, as user ids and names.
 * A santri with no active kamar is not in the map; one whose asrama has no
 * musyrif on record maps to an empty list.
 */
export async function musyrifOfBoarders(studentIds: string[]): Promise<Map<string, Person[]>> {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return new Map();

  const placements = await prisma.student.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      roomAssignments: {
        ...ACTIVE_ROOM_ASSIGNMENT,
        select: { room: { select: { id: true, dormitoryId: true } } },
      },
    },
  });
  const rooms = new Map(
    placements.flatMap((s) => (s.roomAssignments[0] ? [[s.id, s.roomAssignments[0].room]] : []))
  );
  if (!rooms.size) return new Map();

  const assignments = await prisma.musyrifAssignment.findMany({
    where: {
      dormitoryId: { in: [...new Set([...rooms.values()].map((r) => r.dormitoryId))] },
      ...activeMusyrifAssignment(new Date()),
    },
    select: {
      dormitoryId: true,
      roomId: true,
      musyrif: { select: { user: { select: { id: true, name: true, isActive: true } } } },
    },
  });

  return new Map(
    [...rooms].map(([studentId, room]) => {
      const people = assignments
        .filter((a) => coversRoom(a, room))
        .map((a) => a.musyrif.user)
        .filter((u) => u.isActive);
      return [
        studentId,
        [...new Map(people.map((p) => [p.id, { id: p.id, name: p.name }])).values()],
      ];
    })
  );
}
