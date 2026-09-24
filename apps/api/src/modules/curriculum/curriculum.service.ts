import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
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

export async function getSubjects(query: SubjectQuery) {
  const { page, limit, unitId, type, search, isActive } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.SubjectWhereInput = {};
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
        unit: { select: { id: true, name: true } },
        _count: { select: { lessonPlans: true, schedules: true, exams: true } },
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
  return prisma.subject.findUnique({
    where: { id },
    include: {
      unit: { select: { id: true, name: true } },
      teacherSubjects: {
        include: {
          teacher: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      _count: { select: { lessonPlans: true, schedules: true, exams: true, grades: true } },
    },
  });
}

export async function createSubject(data: CreateSubjectInput) {
  return prisma.subject.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    include: {
      unit: { select: { id: true, name: true } },
    },
  });
}

export async function updateSubject(id: string, data: UpdateSubjectInput) {
  return prisma.subject.update({
    where: { id },
    data,
    include: {
      unit: { select: { id: true, name: true } },
    },
  });
}

export async function deleteSubject(id: string) {
  return prisma.subject.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// =====================================
// TEACHER SUBJECT SERVICES
// =====================================

export async function assignTeacherToSubject(data: AssignTeacherSubjectInput) {
  return prisma.teacherSubject.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    include: {
      teacher: { include: { user: { select: { id: true, name: true } } } },
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true } },
    },
  });
}

export async function removeTeacherFromSubject(id: string) {
  return prisma.teacherSubject.delete({ where: { id } });
}

export async function getTeacherSubjects(teacherId: string) {
  return prisma.teacherSubject.findMany({
    where: { teacherId, isActive: true },
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
        teacher: { include: { user: { select: { id: true, name: true } } } },
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
      teacher: { include: { user: { select: { id: true, name: true } } } },
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
      teacher: { include: { user: { select: { id: true, name: true } } } },
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
      teacher: { include: { user: { select: { id: true, name: true } } } },
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
    dayOfWeek,
    isActive,
  } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.ScheduleWhereInput = {};
  if (unitId) where.unitId = unitId;
  if (academicYearId) where.academicYearId = academicYearId;
  if (classId) where.classId = classId;
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
        teacher: { include: { user: { select: { id: true, name: true } } } },
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
      teacher: { include: { user: { select: { id: true, name: true } } } },
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
      teacher: { include: { user: { select: { id: true, name: true } } } },
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
      teacher: { include: { user: { select: { id: true, name: true } } } },
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
      teacher: { include: { user: { select: { id: true, name: true } } } },
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
