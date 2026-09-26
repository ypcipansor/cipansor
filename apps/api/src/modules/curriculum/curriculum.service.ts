import { prisma } from '@/lib/prisma';
import { TEACHER_SAFE_SELECT } from '@/utils/student-scope';
import { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';
import type {
  CreateSubjectInput,
  UpdateSubjectInput,
  SubjectQuery,
  AssignTeacherSubjectInput,
  CreateLessonPlanInput,
  UpdateLessonPlanInput,
  LessonPlanQuery,
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleQuery,
} from './curriculum.schema';

// =====================================
// SUBJECT SERVICES
// =====================================

/** Who is writing: the fields of the token the unit scope needs. */
export interface CurriculumActor {
  roleCode: string;
  unitId: string | null;
}

/**
 * A subject belongs to one unit, and only the super admin writes across units.
 */
function assertUnit(actor: CurriculumActor, unitId: string) {
  if (actor.roleCode === 'SUPER_ADMIN') return;
  if (!actor.unitId || actor.unitId !== unitId) {
    throw Errors.forbidden('Mata pelajaran ini milik unit lain');
  }
}

const SUBJECT_UNIT = { unit: { select: { id: true, name: true } } } as const;

export async function getSubjects(query: SubjectQuery) {
  const { page, limit, unitId, type, search, isActive } = query;
  const skip = (page - 1) * limit;

  // A deleted subject is kept for the grades and schedules that name it, but
  // it is not offered anywhere any more.
  const where: Prisma.SubjectWhereInput = { deletedAt: null };
  if (unitId) where.unitId = unitId;
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [subjects, total] = await Promise.all([
    prisma.subject.findMany({
      where,
      skip,
      take: limit,
      include: {
        ...SUBJECT_UNIT,
        _count: {
          select: {
            lessonPlans: true,
            schedules: true,
            exams: true,
            teacherSubjects: { where: { isActive: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.subject.count({ where }),
  ]);

  return {
    data: subjects,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getSubjectById(id: string) {
  return prisma.subject.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...SUBJECT_UNIT,
      teacherSubjects: {
        where: { isActive: true },
        include: {
          teacher: { select: TEACHER_SAFE_SELECT },
          class: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      _count: { select: { lessonPlans: true, schedules: true, exams: true, grades: true } },
    },
  });
}

async function findLiveSubject(id: string) {
  const subject = await prisma.subject.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, unitId: true, code: true },
  });
  if (!subject) throw Errors.notFound('Mata pelajaran tidak ditemukan');
  return subject;
}

/**
 * The code is unique within a unit, deleted subjects included
 * (`@@unique([unitId, code])`). Adding a code that a deleted subject held
 * brings that subject back, with the grades and schedules that name it,
 * rather than failing on a code nobody can see.
 */
export async function createSubject(actor: CurriculumActor, data: CreateSubjectInput) {
  assertUnit(actor, data.unitId);
  const existing = await prisma.subject.findUnique({
    where: { unitId_code: { unitId: data.unitId, code: data.code } },
    select: { id: true, deletedAt: true },
  });
  if (existing && !existing.deletedAt) {
    throw Errors.conflict(`Kode ${data.code} sudah dipakai di unit ini`);
  }
  if (existing) {
    return prisma.subject.update({
      where: { id: existing.id },
      data: { ...data, deletedAt: null },
      include: SUBJECT_UNIT,
    });
  }
  return prisma.subject.create({ data, include: SUBJECT_UNIT });
}

export async function updateSubject(actor: CurriculumActor, id: string, data: UpdateSubjectInput) {
  const subject = await findLiveSubject(id);
  assertUnit(actor, subject.unitId);
  if (data.code && data.code !== subject.code) {
    const clash = await prisma.subject.findUnique({
      where: { unitId_code: { unitId: subject.unitId, code: data.code } },
      select: { id: true },
    });
    if (clash) throw Errors.conflict(`Kode ${data.code} sudah dipakai di unit ini`);
  }
  return prisma.subject.update({ where: { id }, data, include: SUBJECT_UNIT });
}

/** Soft delete: grades, exams and schedules still name the subject. */
export async function deleteSubject(actor: CurriculumActor, id: string) {
  const subject = await findLiveSubject(id);
  assertUnit(actor, subject.unitId);
  const now = new Date();
  await prisma.$transaction([
    prisma.subject.update({ where: { id }, data: { deletedAt: now, isActive: false } }),
    prisma.teacherSubject.updateMany({
      where: { subjectId: id, isActive: true },
      data: { isActive: false },
    }),
  ]);
}

// =====================================
// TEACHER SUBJECT SERVICES (guru pengampu)
// =====================================

const PENGAMPU_INCLUDE = {
  teacher: { select: TEACHER_SAFE_SELECT },
  subject: { select: { id: true, name: true, code: true } },
  class: { select: { id: true, name: true } },
} as const;

/**
 * Makes a teacher the guru pengampu of a subject, for one class of the
 * subject's unit or for all of them. The class must belong to that unit — the
 * API took any class before. The same assignment twice is a conflict; an
 * ended one is taken up again.
 */
export async function assignTeacherToSubject(
  actor: CurriculumActor,
  data: AssignTeacherSubjectInput
) {
  const subject = await findLiveSubject(data.subjectId);
  assertUnit(actor, subject.unitId);
  const classId = data.classId ?? null;
  const [teacher, klass] = await Promise.all([
    prisma.teacher.findFirst({
      where: { id: data.teacherId, deletedAt: null },
      select: { id: true },
    }),
    classId
      ? prisma.class.findFirst({
          where: { id: classId, unitId: subject.unitId, deletedAt: null },
          select: { id: true },
        })
      : null,
  ]);
  if (!teacher) throw Errors.badRequest('Guru tidak ditemukan');
  if (classId && !klass) throw Errors.badRequest('Kelas itu bukan kelas unit mata pelajaran ini');

  const existing = await prisma.teacherSubject.findFirst({
    where: { teacherId: data.teacherId, subjectId: data.subjectId, classId },
    select: { id: true, isActive: true },
  });
  if (existing?.isActive) {
    throw Errors.conflict('Guru ini sudah menjadi pengampu untuk cakupan itu');
  }
  if (existing) {
    return prisma.teacherSubject.update({
      where: { id: existing.id },
      data: { isActive: true },
      include: PENGAMPU_INCLUDE,
    });
  }
  return prisma.teacherSubject.create({
    data: { teacherId: data.teacherId, subjectId: data.subjectId, classId },
    include: PENGAMPU_INCLUDE,
  });
}

/**
 * Ends an assignment. The row stays (inactive): who taught what is history
 * that report cards and the teacher's record read.
 */
export async function removeTeacherFromSubject(actor: CurriculumActor, id: string) {
  const assignment = await prisma.teacherSubject.findUnique({
    where: { id },
    select: { id: true, isActive: true, subject: { select: { unitId: true } } },
  });
  if (!assignment || !assignment.isActive) {
    throw Errors.notFound('Penugasan guru pengampu tidak ditemukan');
  }
  assertUnit(actor, assignment.subject.unitId);
  await prisma.teacherSubject.update({ where: { id }, data: { isActive: false } });
}

export async function getTeacherSubjects(teacherId: string) {
  return prisma.teacherSubject.findMany({
    where: { teacherId, isActive: true, subject: { deletedAt: null } },
    include: {
      subject: { select: { id: true, name: true, code: true, type: true } },
      class: { select: { id: true, name: true } },
    },
  });
}

// =====================================
// LESSON PLAN SERVICES
// =====================================

export async function getLessonPlans(query: LessonPlanQuery) {
  const { page, limit, subjectId, teacherId, classId, startDate, endDate } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.LessonPlanWhereInput = {};
  if (subjectId) where.subjectId = subjectId;
  if (teacherId) where.teacherId = teacherId;
  if (classId) where.classId = classId;
  if (startDate || endDate) {
    where.plannedDate = {};
    if (startDate) where.plannedDate.gte = new Date(startDate);
    if (endDate) where.plannedDate.lte = new Date(endDate);
  }

  const [lessonPlans, total] = await Promise.all([
    prisma.lessonPlan.findMany({
      where,
      skip,
      take: limit,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: TEACHER_SAFE_SELECT },
        class: { select: { id: true, name: true } },
      },
      orderBy: { plannedDate: 'desc' },
    }),
    prisma.lessonPlan.count({ where }),
  ]);

  return {
    data: lessonPlans,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getLessonPlanById(id: string) {
  return prisma.lessonPlan.findUnique({
    where: { id },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: TEACHER_SAFE_SELECT },
      class: { select: { id: true, name: true } },
    },
  });
}

export async function createLessonPlan(data: CreateLessonPlanInput) {
  return prisma.lessonPlan.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      ...data,
      plannedDate: data.plannedDate ? new Date(data.plannedDate) : undefined,
    } as any,
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: TEACHER_SAFE_SELECT },
    },
  });
}

export async function updateLessonPlan(id: string, data: UpdateLessonPlanInput) {
  return prisma.lessonPlan.update({
    where: { id },
    data: {
      ...data,
      plannedDate: data.plannedDate ? new Date(data.plannedDate) : undefined,
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: TEACHER_SAFE_SELECT },
    },
  });
}

export async function deleteLessonPlan(id: string) {
  return prisma.lessonPlan.delete({ where: { id } });
}

export async function markLessonPlanComplete(id: string) {
  return prisma.lessonPlan.update({
    where: { id },
    data: { completedDate: new Date() },
  });
}

// =====================================
// SCHEDULE SERVICES
// =====================================

export async function getSchedules(query: ScheduleQuery) {
  const {
    page,
    limit,
    unitId,
    academicYearId,
    classId,
    teacherId,
    studentId,
    subjectId,
    dayOfWeek,
    isActive,
  } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.ScheduleWhereInput = {};
  if (unitId) where.unitId = unitId;
  if (academicYearId) where.academicYearId = academicYearId;
  if (classId) where.classId = classId;
  if (subjectId) where.subjectId = subjectId;
  // Resolve a student to the class(es) they are actively enrolled in — a
  // student's timetable is their class's timetable. A student with no active
  // enrolment must return nothing rather than fall through to an unfiltered
  // timetable showing the whole school.
  if (studentId && !classId) {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { studentId, status: 'active' },
      select: { classId: true },
    });
    where.classId = { in: enrollments.map((e) => e.classId) };
  }
  if (teacherId) where.teacherId = teacherId;
  if (dayOfWeek) where.dayOfWeek = dayOfWeek;
  if (isActive !== undefined) where.isActive = isActive;

  const [schedules, total] = await Promise.all([
    prisma.schedule.findMany({
      where,
      skip,
      take: limit,
      include: {
        unit: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: TEACHER_SAFE_SELECT },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.schedule.count({ where }),
  ]);

  return {
    data: schedules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getScheduleById(id: string) {
  return prisma.schedule.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
      class: { select: { id: true, name: true, level: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: TEACHER_SAFE_SELECT },
    },
  });
}

export async function createSchedule(data: CreateScheduleInput) {
  // Check for schedule conflicts
  const conflict = await prisma.schedule.findFirst({
    where: {
      dayOfWeek: data.dayOfWeek,
      isActive: true,
      OR: [
        // Same teacher at same time
        {
          teacherId: data.teacherId,
          startTime: { lte: data.endTime },
          endTime: { gte: data.startTime },
        },
        // Same class at same time
        {
          classId: data.classId,
          startTime: { lte: data.endTime },
          endTime: { gte: data.startTime },
        },
        // Same room at same time (if room specified)
        ...(data.room
          ? [
              {
                room: data.room,
                startTime: { lte: data.endTime },
                endTime: { gte: data.startTime },
              },
            ]
          : []),
      ],
    },
  });

  if (conflict) {
    const conflictType =
      conflict.teacherId === data.teacherId
        ? 'Teacher'
        : conflict.classId === data.classId
          ? 'Class'
          : 'Room';
    throw new Error(
      `Schedule conflict: ${conflictType} is already booked at this time (${data.startTime} - ${data.endTime})`
    );
  }

  return prisma.schedule.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    include: {
      class: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: TEACHER_SAFE_SELECT },
    },
  });
}

export async function updateSchedule(id: string, data: UpdateScheduleInput) {
  return prisma.schedule.update({
    where: { id },
    data,
    include: {
      class: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: TEACHER_SAFE_SELECT },
    },
  });
}

export async function deleteSchedule(id: string) {
  return prisma.schedule.delete({ where: { id } });
}

export async function getClassSchedule(classId: string, academicYearId?: string) {
  const where: Prisma.ScheduleWhereInput = { classId, isActive: true };
  if (academicYearId) where.academicYearId = academicYearId;

  return prisma.schedule.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: TEACHER_SAFE_SELECT },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

export async function getTeacherSchedule(teacherId: string, academicYearId?: string) {
  const where: Prisma.ScheduleWhereInput = { teacherId, isActive: true };
  if (academicYearId) where.academicYearId = academicYearId;

  return prisma.schedule.findMany({
    where,
    include: {
      class: { select: { id: true, name: true, level: true } },
      subject: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}
