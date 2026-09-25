import type { Prisma } from '@prisma/client';
import {
  MUSYRIF_CANDIDATE_ROLE_CODES,
  type AssignMusyrifInput,
  type MusyrifAssignment,
  type MusyrifCandidate,
  type MusyrifDuty,
} from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';

/**
 * Penugasan musyrif: who looks after which asrama or kamar. An assignment
 * with no kamar covers the whole asrama. Read by the permit decider (a
 * boarder's leave is their musyrif's), by `getStudentsByMusyrif` ("santri
 * saya") and by the kamar access check — all three existed before anything
 * could write an assignment except the seed.
 */

const ASSIGNMENT_SELECT = {
  id: true,
  role: true,
  startDate: true,
  room: { select: { id: true, name: true } },
  musyrif: { select: { user: { select: { id: true, name: true } } } },
} satisfies Prisma.MusyrifAssignmentSelect;

type AssignmentRow = Prisma.MusyrifAssignmentGetPayload<{ select: typeof ASSIGNMENT_SELECT }>;

const toWire = (a: AssignmentRow): MusyrifAssignment => ({
  id: a.id,
  role: a.role as MusyrifDuty,
  startDate: a.startDate.toISOString(),
  room: a.room,
  user: a.musyrif.user,
});

async function findDormitory(id: string) {
  const dormitory = await prisma.dormitory.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, unitId: true },
  });
  if (!dormitory) throw Errors.notFound('Dormitory');
  return dormitory;
}

/** The asrama's active assignments: whole-asrama duties first, then by kamar. */
export async function listAssignments(dormitoryId: string): Promise<MusyrifAssignment[]> {
  await findDormitory(dormitoryId);
  const rows = await prisma.musyrifAssignment.findMany({
    where: { dormitoryId, isActive: true },
    select: ASSIGNMENT_SELECT,
    orderBy: [{ roomId: { sort: 'asc', nulls: 'first' } }, { startDate: 'asc' }],
  });
  return rows.map(toWire);
}

/** People who may be assigned: active accounts holding an educator role. */
export async function listCandidates(q?: string): Promise<MusyrifCandidate[]> {
  const rows = await prisma.userRoleAssignment.findMany({
    where: {
      isActive: true,
      role: { code: { in: [...MUSYRIF_CANDIDATE_ROLE_CODES] } },
      user: { isActive: true, ...(q && { name: { contains: q, mode: 'insensitive' } }) },
    },
    select: { user: { select: { id: true, name: true } }, role: { select: { code: true } } },
    orderBy: { user: { name: 'asc' } },
    take: 300,
  });
  const byUser = new Map<string, MusyrifCandidate>();
  for (const { user, role } of rows) {
    const entry = byUser.get(user.id) ?? { id: user.id, name: user.name, roleCodes: [] };
    if (!entry.roleCodes.includes(role.code)) entry.roleCodes.push(role.code);
    byUser.set(user.id, entry);
  }
  return [...byUser.values()].slice(0, 50);
}

/**
 * Assign someone to the asrama or one of its kamar. A person keeps one
 * Musyrif record however many asrama they serve — `getStudentsByMusyrif`
 * reads a single record per person, so a second one would hide duties.
 */
export async function assign(
  dormitoryId: string,
  input: AssignMusyrifInput
): Promise<MusyrifAssignment> {
  const dormitory = await findDormitory(dormitoryId);
  const roomId = input.roomId ?? null;
  if (roomId) {
    const room = await prisma.room.findFirst({
      where: { id: roomId, dormitoryId },
      select: { id: true },
    });
    if (!room) throw Errors.badRequest('Kamar itu bukan kamar asrama ini');
  }

  const eligible = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: input.userId,
      isActive: true,
      role: { code: { in: [...MUSYRIF_CANDIDATE_ROLE_CODES] } },
      user: { isActive: true },
    },
    select: {
      unitId: true,
      user: { select: { unitId: true, teacher: { select: { id: true } } } },
    },
  });
  if (!eligible) {
    throw Errors.badRequest('Yang dapat ditugaskan hanya ustadz, musyrif, muhafidz atau guru');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.musyrif.findFirst({
      where: { userId: input.userId },
      select: { id: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    let musyrifId = existing?.id;
    if (existing && !existing.isActive) {
      await tx.musyrif.update({
        where: { id: existing.id },
        data: { isActive: true, endDate: null },
      });
    }
    if (!musyrifId) {
      // An asrama is usually run at foundation level (no unit); the record
      // then belongs to the person's own unit.
      const unitId = dormitory.unitId ?? eligible.unitId ?? eligible.user.unitId;
      if (!unitId) throw Errors.badRequest('Akun ini tidak terdaftar di unit mana pun');
      const created = await tx.musyrif.create({
        data: {
          userId: input.userId,
          unitId,
          teacherId: eligible.user.teacher?.id,
          isActive: true,
          joinDate: new Date(),
        },
        select: { id: true },
      });
      musyrifId = created.id;
    }

    const duplicate = await tx.musyrifAssignment.findFirst({
      where: { musyrifId, dormitoryId, roomId, isActive: true },
      select: { id: true },
    });
    if (duplicate) throw Errors.conflict('Orang ini sudah ditugaskan di sini');

    const created = await tx.musyrifAssignment.create({
      data: {
        musyrifId,
        dormitoryId,
        roomId,
        role: input.role ?? 'PEMBINA',
        startDate: new Date(),
        isActive: true,
      },
      select: ASSIGNMENT_SELECT,
    });
    return toWire(created);
  });
}

/** End an assignment; the row stays as history. */
export async function endAssignment(dormitoryId: string, assignmentId: string): Promise<void> {
  const { count } = await prisma.musyrifAssignment.updateMany({
    where: { id: assignmentId, dormitoryId, isActive: true },
    data: { isActive: false, endDate: new Date() },
  });
  if (count === 0) throw Errors.notFound('Assignment');
}
