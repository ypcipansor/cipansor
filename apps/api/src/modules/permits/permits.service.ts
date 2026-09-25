import { randomInt } from 'crypto';
import {
  AttendanceStatus,
  NotificationType,
  PermitStatus,
  PermitType,
  Prisma,
} from '@prisma/client';
import type { CreatePermitInput, UpdatePermitInput } from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Errors } from '@/middleware/error';
import {
  assertStudentInScope,
  onlyScopedStudents,
  studentScope,
  type ScopeActor,
} from '@/utils/student-scope';
import { createNotification } from '../notifications/notifications.service';
import type { ListPermitsQueryParsed } from './permits.schema';

/**
 * Perizinan: a learner's leave, from request to return.
 *
 *   PENDING ──approve──▶ APPROVED ──depart──▶ (outside) ──return──▶ COMPLETED
 *      │ └─reject──▶ REJECTED
 *      └──cancel──▶ CANCELLED
 *
 * Each move checks the state it starts from; a request that does not fit is a
 * 409, not a silent overwrite. Until 2026-09-25 one `PUT /:id/status` set any
 * status from any other (an approved-and-returned permit could be flipped back
 * to PENDING) and "return" completed permits that never left.
 *
 * Every read and every move is limited to the permits of learners the caller
 * may see (`studentScope`): a wali, their own children; staff, their unit;
 * boarding and cross-unit staff, every unit. Outside that, a permit is 404.
 */

/** The columns a permit carries on the wire — no `include: { student }`. */
const PERMIT_SELECT = {
  id: true,
  code: true,
  studentId: true,
  type: true,
  reason: true,
  destination: true,
  startDate: true,
  endDate: true,
  status: true,
  approvedAt: true,
  rejectionNote: true,
  departedAt: true,
  returnedAt: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      nis: true,
      photoUrl: true,
      unit: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.PermitSelect;

type PermitRow = Prisma.PermitGetPayload<{ select: typeof PERMIT_SELECT }>;

const scopeOf = (actor: ScopeActor): Prisma.PermitWhereInput =>
  onlyScopedStudents(studentScope(actor));

/** Not Found rather than Forbidden outside the caller's scope: the id is not confirmed. */
async function findInScope(id: string, actor: ScopeActor): Promise<PermitRow> {
  const permit = await prisma.permit.findFirst({
    where: { AND: [{ id }, scopeOf(actor)] },
    select: PERMIT_SELECT,
  });
  if (!permit) throw Errors.notFound('Permit');
  return permit;
}

/** Ambiguous characters (0/O, 1/I/L) left out: the code is read aloud and typed at the gate. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function permitCode(): string {
  let code = 'PMT-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Permits still in force for a learner: waiting, or approved and not yet back. */
const LIVE: Prisma.PermitWhereInput = {
  OR: [{ status: PermitStatus.PENDING }, { status: PermitStatus.APPROVED, returnedAt: null }],
};

async function assertNoOverlap(
  studentId: string,
  startDate: Date,
  endDate: Date,
  exceptId?: string
): Promise<void> {
  const clash = await prisma.permit.findFirst({
    where: {
      studentId,
      ...(exceptId && { id: { not: exceptId } }),
      startDate: { lt: endDate },
      endDate: { gt: startDate },
      ...LIVE,
    },
    select: { code: true },
  });
  if (clash) {
    throw Errors.conflict(`Sudah ada izin yang berjalan pada waktu itu (${clash.code ?? '-'})`);
  }
}

export async function createPermit(input: CreatePermitInput, actor: ScopeActor) {
  await assertStudentInScope(input.studentId, actor);
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  await assertNoOverlap(input.studentId, startDate, endDate);

  // The code is unique; on the rare collision draw again rather than
  // check-then-insert, which races.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.permit.create({
        data: {
          studentId: input.studentId,
          type: input.type,
          reason: input.reason,
          destination: input.destination,
          startDate,
          endDate,
          code: permitCode(),
        },
        select: PERMIT_SELECT,
      });
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 4) throw e;
    }
  }
}

export interface ListPermitsResult {
  data: PermitRow[];
  total: number;
  page: number;
  limit: number;
}

export async function listPermits(
  query: ListPermitsQueryParsed,
  actor: ScopeActor
): Promise<ListPermitsResult> {
  const { studentId, type, status, outside, from, to, page, limit } = query;
  const where: Prisma.PermitWhereInput = {
    AND: [
      scopeOf(actor),
      {
        ...(studentId && { studentId }),
        ...(type && { type }),
        ...(status && { status }),
        ...(outside && { departedAt: { not: null }, returnedAt: null }),
        // A permit is in the window if its period touches it.
        ...(to && { startDate: { lt: dayAfter(to) } }),
        ...(from && { endDate: { gte: new Date(`${from}T00:00:00+07:00`) } }),
      },
    ],
  };
  const [data, total] = await Promise.all([
    prisma.permit.findMany({
      where,
      select: PERMIT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.permit.count({ where }),
  ]);
  return { data, total, page, limit };
}

export async function getPermit(id: string, actor: ScopeActor) {
  return findInScope(id, actor);
}

/** The gate types the code from the learner's slip. */
export async function getPermitByCode(code: string, actor: ScopeActor) {
  const permit = await prisma.permit.findFirst({
    where: { AND: [{ code: code.trim().toUpperCase() }, scopeOf(actor)] },
    select: PERMIT_SELECT,
  });
  if (!permit) throw Errors.notFound('Permit');
  return permit;
}

export async function getSummary(actor: ScopeActor) {
  const scope = scopeOf(actor);
  const now = new Date();
  const count = (where: Prisma.PermitWhereInput) =>
    prisma.permit.count({ where: { AND: [scope, where] } });
  const [pending, approved, outside, overdue] = await Promise.all([
    count({ status: PermitStatus.PENDING }),
    count({ status: PermitStatus.APPROVED, departedAt: null, endDate: { gte: now } }),
    count({ departedAt: { not: null }, returnedAt: null }),
    count({ departedAt: { not: null }, returnedAt: null, endDate: { lt: now } }),
  ]);
  return { pending, approved, outside, overdue };
}

export async function updatePermit(id: string, input: UpdatePermitInput, actor: ScopeActor) {
  const permit = await findInScope(id, actor);
  if (permit.status !== PermitStatus.PENDING) {
    throw Errors.conflict('Hanya izin yang masih menunggu yang dapat diubah');
  }
  const startDate = input.startDate ? new Date(input.startDate) : permit.startDate;
  const endDate = input.endDate ? new Date(input.endDate) : permit.endDate;
  if (endDate <= startDate) {
    throw Errors.badRequest('Waktu kembali harus sesudah waktu berangkat');
  }
  await assertNoOverlap(permit.studentId, startDate, endDate, id);
  return prisma.permit.update({
    where: { id },
    data: {
      type: input.type,
      reason: input.reason,
      destination: input.destination,
      startDate,
      endDate,
    },
    select: PERMIT_SELECT,
  });
}

/**
 * Move a permit from `from` to its next state in one statement, so two people
 * pressing the button at once cannot both succeed: the second finds nothing
 * left in `from` and gets a 409.
 */
async function transition(
  id: string,
  actor: ScopeActor,
  from: Prisma.PermitWhereInput,
  data: Prisma.PermitUncheckedUpdateManyInput,
  refusal: string
): Promise<PermitRow> {
  await findInScope(id, actor);
  const { count } = await prisma.permit.updateMany({ where: { id, ...from }, data });
  if (count === 0) throw Errors.conflict(refusal);
  return prisma.permit.findUniqueOrThrow({ where: { id }, select: PERMIT_SELECT });
}

export async function approvePermit(id: string, actor: ScopeActor) {
  const permit = await transition(
    id,
    actor,
    { status: PermitStatus.PENDING },
    { status: PermitStatus.APPROVED, approvedById: actor.sub, approvedAt: new Date() },
    'Izin ini sudah diputuskan'
  );
  await recordAttendance(permit, actor.sub);
  await notifyParents(
    permit.studentId,
    'Izin disetujui',
    `Izin ${TYPE_LABEL[permit.type]} untuk ${permit.student.user.name} disetujui.`,
    permit.id
  );
  return permit;
}

export async function rejectPermit(id: string, rejectionNote: string, actor: ScopeActor) {
  const permit = await transition(
    id,
    actor,
    { status: PermitStatus.PENDING },
    { status: PermitStatus.REJECTED, approvedById: actor.sub, rejectionNote },
    'Izin ini sudah diputuskan'
  );
  await notifyParents(
    permit.studentId,
    'Izin ditolak',
    `Izin untuk ${permit.student.user.name} ditolak. Alasan: ${rejectionNote}`,
    permit.id
  );
  return permit;
}

/**
 * Withdraw a request before it is decided. An approved permit is not
 * cancelled: approval has already written the attendance for its days, and
 * unwinding that is a correction to attendance, not to the permit.
 */
export async function cancelPermit(id: string, actor: ScopeActor) {
  return transition(
    id,
    actor,
    { status: PermitStatus.PENDING },
    { status: PermitStatus.CANCELLED },
    'Hanya izin yang masih menunggu yang dapat dibatalkan'
  );
}

export async function departPermit(id: string, actor: ScopeActor) {
  const now = new Date();
  const permit = await transition(
    id,
    actor,
    { status: PermitStatus.APPROVED, departedAt: null, endDate: { gt: now } },
    { departedAt: now },
    'Izin belum disetujui, sudah dipakai, atau sudah lewat masa berlakunya'
  );
  await notifyParents(
    permit.studentId,
    'Sudah berangkat',
    `${permit.student.user.name} keluar melalui gerbang sesuai izin ${permit.code ?? ''}.`.trim(),
    permit.id
  );
  return permit;
}

export async function returnPermit(id: string, returnedAt: string | undefined, actor: ScopeActor) {
  const at = returnedAt ? new Date(returnedAt) : new Date();
  const permit = await transition(
    id,
    actor,
    { status: PermitStatus.APPROVED, departedAt: { not: null, lte: at }, returnedAt: null },
    { status: PermitStatus.COMPLETED, returnedAt: at },
    'Izin ini belum tercatat berangkat, atau sudah selesai'
  );
  await notifyParents(
    permit.studentId,
    'Sudah kembali',
    `${permit.student.user.name} sudah kembali.`,
    permit.id
  );
  return permit;
}

// ---------------------------------------------------------------- effects

const TYPE_LABEL: Record<PermitType, string> = {
  PULANG: 'pulang',
  KELUAR: 'keluar',
  SAKIT: 'sakit',
  KELUARGA: 'keperluan keluarga',
  OTHER: 'lainnya',
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `YYYY-MM-DD` + 1 day, as the instant that day starts in WIB. */
function dayAfter(date: string): Date {
  const start = new Date(`${date}T00:00:00+07:00`);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * The calendar days (in WIB) a permit touches, as UTC midnights — the form a
 * `@db.Date` column compares equal to. A permit from Friday 13:00 to Sunday
 * 17:00 covers Friday, Saturday and Sunday.
 */
export function daysCovered(start: Date, end: Date): Date[] {
  const first = new Date(start.getTime() + WIB_OFFSET_MS);
  const last = new Date(end.getTime() + WIB_OFFSET_MS);
  const day = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const stop = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const days: Date[] = [];
  for (let t = day; t <= stop && days.length < 62; t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t));
  }
  return days;
}

/**
 * An approved permit excuses the learner's class attendance for its days
 * (SICK for sick leave, EXCUSED otherwise), overwriting a mark already taken
 * and creating the missing ones. A learner with no active class has nothing
 * to write.
 */
async function recordAttendance(permit: PermitRow, recordedById: string) {
  const enrollment = await prisma.classEnrollment.findFirst({
    where: { studentId: permit.studentId, status: 'active' },
    select: { classId: true },
  });
  if (!enrollment) return;
  const days = daysCovered(permit.startDate, permit.endDate);
  const status =
    permit.type === PermitType.SAKIT ? AttendanceStatus.SICK : AttendanceStatus.EXCUSED;
  const notes = `Izin ${permit.code ?? permit.id}`;
  await prisma.$transaction([
    prisma.attendance.updateMany({
      where: { studentId: permit.studentId, classId: enrollment.classId, date: { in: days } },
      data: { status, notes },
    }),
    prisma.attendance.createMany({
      data: days.map((date) => ({
        studentId: permit.studentId,
        classId: enrollment.classId,
        date,
        status,
        notes,
        recordedById,
      })),
      skipDuplicates: true,
    }),
  ]);
}

/** Tell the learner's walis. A failed notification never undoes the move. */
async function notifyParents(studentId: string, title: string, message: string, permitId: string) {
  const parents = await prisma.studentParent.findMany({
    where: { studentId },
    select: { parentId: true },
  });
  await Promise.all(
    parents.map(({ parentId }) =>
      createNotification({
        userId: parentId,
        type: NotificationType.INFO,
        title,
        message,
        data: { permitId },
      }).catch((error) =>
        logger.warn('Permit notification failed', { permitId, error: String(error) })
      )
    )
  );
}
