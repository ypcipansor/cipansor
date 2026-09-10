import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../middleware/error';
import {
  CreateClassInput,
  UpdateClassInput,
  ClassEnrollmentInput,
  UpdateEnrollmentInput,
  Class,
  ClassEnrollment,
  EnrollStudentInput,
  EnrollmentStatus,
  Gender,
  ListClassesQuery,
} from '@cipansor/shared';

function toEnrollmentStatus(status: string): EnrollmentStatus {
  if (Object.values(EnrollmentStatus).includes(status as EnrollmentStatus)) {
    return status as EnrollmentStatus;
  }
  return EnrollmentStatus.ACTIVE;
}

function mapToClassEnrollment(data: {
  id: string;
  studentId: string;
  classId: string;
  status: string;
  createdAt: Date;
  student: {
    id: string;
    nisn?: string | null;
    nik?: string | null;
    gender: string;
    user: {
      id: string;
      name: string;
      email?: string | null;
    };
  };
}): ClassEnrollment {
  return {
    id: data.id,
    studentId: data.studentId,
    classId: data.classId,
    status: toEnrollmentStatus(data.status),
    enrolledAt: data.createdAt,
    student: {
      id: data.student.id,
      nisn: data.student.nisn,
      nik: data.student.nik,
      gender: data.student.gender as Gender,
      name: data.student.user.name,
      user: {
        id: data.student.user.id,
        name: data.student.user.name,
      },
    },
  };
}

export class ClassService {
  async findAll(query: ListClassesQuery) {
    const { page = 1, limit = 10, search, unitId, academicYearId, grade, level } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ClassWhereInput = {
      deletedAt: null,
      unitId,
      academicYearId,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (level) {
      where.level = level;
    } else if (grade) {
      where.level = String(grade);
    }

    const [classes, total] = await Promise.all([
      prisma.class.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          unit: {
            select: {
              id: true,
              name: true,
            },
          },
          academicYear: {
            select: {
              id: true,
              name: true,
            },
          },
          homeroomTeacher: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: {
              enrollments: { where: { status: 'active' } },
            },
          },
        },
      }),
      prisma.class.count({ where }),
    ]);

    const mappedClasses = classes.map((c) => ({
      ...c,
      grade: parseInt(c.level) || 0,
      studentCount: c._count.enrollments,
      homeroomTeacher: c.homeroomTeacher
        ? {
          id: c.homeroomTeacher.id,
          user: c.homeroomTeacher.user,
        }
        : null,
      unit: {
        id: c.unit.id,
        name: c.unit.name,
      },
    })) as unknown as Class[];

    return {
      classes: mappedClasses,
      data: mappedClasses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<Class> {
    const classData = await prisma.class.findUnique({
      where: { id },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        homeroomTeacher: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            enrollments: { where: { status: 'active' } },
          },
        },
      },
    });

    if (!classData) {
      throw Errors.notFound('Class');
    }

    return {
      ...classData,
      grade: parseInt(classData.level) || 0,
      studentCount: classData._count.enrollments,
      homeroomTeacher: classData.homeroomTeacher
        ? {
          id: classData.homeroomTeacher.id,
          user: classData.homeroomTeacher.user,
        }
        : null,
      unit: {
        id: classData.unit.id,
        name: classData.unit.name,
      },
    } as unknown as Class;
  }

  async create(input: CreateClassInput) {
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, deletedAt: null },
    });

    if (!unit) {
      throw Errors.notFound('Unit');
    }

    const academicYear = await prisma.academicYear.findFirst({
      where: { id: input.academicYearId, deletedAt: null },
    });

    if (!academicYear) {
      throw Errors.notFound('Academic Year');
    }

    const existing = await prisma.class.findFirst({
      where: {
        name: input.name,
        unitId: input.unitId,
        academicYearId: input.academicYearId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw Errors.conflict('Class with this name already exists for this unit and academic year');
    }

    if (input.homeroomTeacherId) {
      const teacher = await prisma.teacher.findFirst({
        where: { id: input.homeroomTeacherId, unitId: input.unitId },
      });
      if (!teacher) {
        throw Errors.notFound('Teacher');
      }
    }

    const capacity = input.capacity ?? 30;

    const classData = await prisma.class.create({
      data: {
        name: input.name,
        unitId: input.unitId,
        academicYearId: input.academicYearId,
        level: input.level,
        capacity,
        homeroomTeacherId: input.homeroomTeacherId,
      },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return classData;
  }

  async update(id: string, input: UpdateClassInput) {
    const classData = await prisma.class.findFirst({
      where: { id, deletedAt: null },
    });

    if (!classData) {
      throw Errors.notFound('Class');
    }

    if (input.name && input.name !== classData.name) {
      const existing = await prisma.class.findFirst({
        where: {
          name: input.name,
          unitId: classData.unitId,
          academicYearId: classData.academicYearId,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (existing) {
        throw Errors.conflict('Class name already in use');
      }
    }

    if (input.homeroomTeacherId) {
      const teacher = await prisma.teacher.findFirst({
        where: { id: input.homeroomTeacherId, unitId: classData.unitId },
      });
      if (!teacher) {
        throw Errors.notFound('Teacher');
      }
    }

    const updateData: Prisma.ClassUpdateInput = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.level !== undefined) updateData.level = input.level;
    if (input.capacity !== undefined) updateData.capacity = input.capacity;
    if (input.homeroomTeacherId !== undefined) {
      updateData.homeroomTeacher = input.homeroomTeacherId
        ? { connect: { id: input.homeroomTeacherId } }
        : { disconnect: true };
    }

    const updated = await prisma.class.update({
      where: { id },
      data: updateData,
      include: {
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return updated;
  }

  async delete(id: string) {
    const classData = await prisma.class.findFirst({
      where: { id, deletedAt: null },
    });

    if (!classData) {
      throw Errors.notFound('Class');
    }

    const activeEnrollments = await prisma.classEnrollment.count({
      where: { classId: id, status: 'active' },
    });

    if (activeEnrollments > 0) {
      throw Errors.badRequest('Cannot delete class with active enrollments');
    }

    await prisma.class.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Class deleted successfully' };
  }

  async enrollStudent(classId: string, input: EnrollStudentInput): Promise<ClassEnrollment> {
    const classData = await prisma.class.findFirst({
      where: { id: classId, deletedAt: null },
      include: {
        _count: { select: { enrollments: { where: { status: 'active' } } } },
      },
    });

    if (!classData) {
      throw Errors.notFound('Class');
    }

    if (classData._count.enrollments >= classData.capacity) {
      throw Errors.badRequest('Class is at full capacity');
    }

    const student = await prisma.student.findFirst({
      where: { id: input.studentId, deletedAt: null, unitId: classData.unitId },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

    const existingEnrollment = await prisma.classEnrollment.findFirst({
      where: {
        studentId: input.studentId,
        classId,
        status: 'active',
      },
    });

    if (existingEnrollment) {
      throw Errors.conflict('Student already enrolled in this class');
    }

    const enrollment = await prisma.classEnrollment.create({
      data: {
        studentId: input.studentId,
        classId,
        status: 'active',
      },
      include: {
        student: {
          select: {
            id: true,
            nisn: true,
            nik: true,
            gender: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    return mapToClassEnrollment(enrollment);
  }

  async updateEnrollment(classId: string, studentId: string, input: UpdateEnrollmentInput) {
    const enrollment = await prisma.classEnrollment.findFirst({
      where: { classId, studentId },
    });

    if (!enrollment) {
      throw Errors.notFound('Enrollment');
    }

    const updated = await prisma.classEnrollment.update({
      where: { id: enrollment.id },
      data: { status: input.status },
    });

    return updated;
  }

  async removeStudent(classId: string, studentId: string) {
    const enrollment = await prisma.classEnrollment.findFirst({
      where: { classId, studentId },
    });

    if (!enrollment) {
      throw Errors.notFound('Enrollment');
    }

    await prisma.classEnrollment.delete({
      where: { id: enrollment.id },
    });

    return { message: 'Student removed from class' };
  }

  async getEnrollments(classId: string): Promise<ClassEnrollment[]> {
    const enrollments = await prisma.classEnrollment.findMany({
      where: {
        classId,
        status: 'active',
        student: { deletedAt: null },
      },
      include: {
        student: {
          select: {
            id: true,
            nisn: true,
            nik: true,
            gender: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        student: {
          user: {
            name: 'asc',
          },
        },
      },
    });

    return enrollments.map((enrollment) => ({
      ...enrollment,
      student: {
        ...enrollment.student,
        name: enrollment.student.user.name,
      },
    })) as unknown as ClassEnrollment[];
  }

  async promoteStudents(input: { studentIds: string[]; targetClassId: string }) {
    const { studentIds, targetClassId } = input;
    return prisma.$transaction(async (tx) => {
      const targetClass = await tx.class.findUnique({
        where: { id: targetClassId },
      });
      if (!targetClass) {
        throw Errors.notFound('Target class');
      }
      const currentCount = await tx.classEnrollment.count({
        where: { classId: targetClassId, status: 'active' },
      });
      if (currentCount + studentIds.length > targetClass.capacity) {
        throw Errors.badRequest('Target class capacity exceeded');
      }
      await tx.classEnrollment.updateMany({
        where: { studentId: { in: studentIds }, status: 'active' },
        data: { status: 'completed' },
      });
      const created = await tx.classEnrollment.createMany({
        data: studentIds.map((studentId) => ({
          studentId,
          classId: targetClassId,
          status: 'active',
        })),
      });
      return { promoted: created.count };
    });
  }
}

export const classService = new ClassService();
