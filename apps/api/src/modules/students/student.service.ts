import { randomUUID } from 'crypto';
import { seesAllUnits } from '@/utils/resolve-unit-id';
import { studentsHoldLogins } from '@/utils/student-login-policy';
import { linkGuardian, type GuardianClient } from '@/utils/link-guardian';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { Errors } from '@/middleware/error';
import { assertStudentIdentifiersAvailable } from './student-identifiers';
import { assignStudentNis, findStudentIdByNisInUnit } from '@/utils/student-nis';
import { UserRole, Gender, Prisma } from '@prisma/client';
import type { ListStudentsQuery, CreateStudentInput, UpdateStudentInput } from './student.schema';
import { normalizeEmail } from '@/utils/email';
import {
  recordUnitEnrollmentFromClass,
  ensureUnitEnrollment,
} from '@/utils/student-unit-history';

export class StudentService {
  /**
   * Get all students with pagination
   */
  async findAll(
    query: ListStudentsQuery,
    currentUser: { role: string; roleCode?: string | null; unitId: string | null }
  ) {
    const { page, limit, search, unitId, classId, gender, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
    };

    // Skema query sudah membatasi `status` ke STUDENT_STATUS_VALUES (#492), tapi
    // sampai 2026-09-13 nilainya tidak pernah dipasang di sini: filter "Alumni"
    // di Daftar Santri tetap menampilkan semua santri, dan setiap pemanggil
    // `?status=active` menerima alumni juga. Terukur di produksi setelah #492
    // tergelar — `status: 'alumni'` mengembalikan 14 dari 14 santri aktif.
    if (status) {
      where.status = status;
    }

    // Unit filter. seesAllUnits() covers both the yayasan board (no unitId at
    // all, so this used to resolve to 'none' and return nothing) and the
    // boarding/shared-service staff, whose santri span several academic units.
    if (!seesAllUnits(currentUser)) {
      where.unitId = currentUser.unitId || 'none';
    } else if (unitId) {
      where.unitId = unitId;
    }

    if (gender) {
      where.gender = gender as Gender;
    }

    if (classId) {
      where.enrollments = {
        some: {
          classId,
          status: 'active',
        },
      };
    }

    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { nis: { contains: search, mode: 'insensitive' } },
        { nisn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isActive: true,
            },
          },
          unit: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          enrollments: {
            where: { status: 'active' },
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                },
              },
            },
          },
        },
      }),
      prisma.student.count({ where }),
    ]);

    // Map response to match shared types/frontend expectations
    // Specifically ensuring currentClass has 'grade' mapped from 'level'
    const mappedStudents = students.map((student) => {
      const currentEnrollment = student.enrollments[0]; // active enrollment due to filter
      const currentClass = currentEnrollment?.class
        ? {
            id: currentEnrollment.class.id,
            name: currentEnrollment.class.name,
            grade: parseInt(currentEnrollment.class.level) || 0,
            level: currentEnrollment.class.level,
          }
        : null;

      return {
        ...student,
        currentClass,
        // Flatten user properties if needed, but existing FE likely expects nested user
      };
    });

    return {
      students: mappedStudents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get student by ID
   */
  async findById(id: string) {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            createdAt: true,
          },
        },
        unit: true,
        enrollments: {
          include: {
            class: {
              include: {
                academicYear: true,
              },
            },
          },
        },
        attendances: {
          orderBy: { date: 'desc' },
          take: 10,
        },
        tahfidzRecords: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
        },
        wallet: true,
        roomAssignments: {
          where: { isActive: true },
          include: {
            room: {
              include: {
                dormitory: true,
              },
            },
          },
          take: 1,
        },
        // We fetch a preview list, but calculate totals separately
        violations: {
          take: 5,
          orderBy: { occurredAt: 'desc' },
        },
        medicalRecords: {
          take: 5,
          orderBy: { visitDate: 'desc' },
        },
        // Latest growth measurement (carries WHO Z-scores + nutrition status)
        growthRecords: {
          take: 1,
          orderBy: { recordDate: 'desc' },
        },
        invoices: {
          where: { status: { not: 'PAID' } },
          include: {
            paymentType: true,
          },
          take: 5,
        },
      },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

    // Parallel aggregation queries for accurate totals
    // Using aggregation for better performance than pulling all records
    const [violationStats, invoiceStats] = await Promise.all([
      prisma.violation.aggregate({
        where: { studentId: id },
        _sum: { points: true },
      }),
      prisma.invoice.aggregate({
        where: { studentId: id, status: { not: 'PAID' } },
        _sum: { amount: true, paidAmount: true },
        _count: { id: true },
      }),
    ]);

    // Find active enrollment for current class
    const currentEnrollment = student.enrollments.find((e) => e.status === 'active');
    const currentClass = currentEnrollment?.class
      ? {
          id: currentEnrollment.class.id,
          name: currentEnrollment.class.name,
          grade: parseInt(currentEnrollment.class.level) || 0,
          level: currentEnrollment.class.level,
          academicYear: currentEnrollment.class.academicYear,
        }
      : null;

    // Calculate summaries from aggregation results
    const totalViolationPoints = violationStats._sum.points || 0;
    const unpaidInvoicesCount = invoiceStats._count.id;
    const unpaidInvoicesTotal =
      (Number(invoiceStats._sum.amount) || 0) - (Number(invoiceStats._sum.paidAmount) || 0);

    // Boarding info
    const boarding = student.roomAssignments[0]
      ? {
          dormitoryName: student.roomAssignments[0].room.dormitory.name,
          roomName: student.roomAssignments[0].room.name,
          assignedAt: student.roomAssignments[0].assignedAt,
        }
      : null;

    return {
      ...student,
      currentClass,
      summary: {
        walletBalance: student.wallet ? Number(student.wallet.balance) : 0,
        violationPoints: totalViolationPoints,
        boarding,
        unpaidInvoices: {
          count: unpaidInvoicesCount,
          total: unpaidInvoicesTotal,
        },
        latestGrowth: student.growthRecords?.[0] ?? null,
      },
    };
  }

  /**
   * Get complete student profile (Student 360 view).
   * Aggregate summaries only — detailed counseling/medical data stays behind
   * their own permission-guarded endpoints.
   */
  async getCompleteProfile(id: string) {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, isActive: true },
        },
        unit: {
          select: { id: true, name: true, type: true },
        },
        enrollments: {
          include: {
            class: {
              include: {
                academicYear: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
        parents: {
          include: {
            parent: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
      },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [grades, attendanceByStatus, violationAgg, rewardAgg] = await Promise.all([
      prisma.grade.findMany({
        where: { studentId: id },
        orderBy: { gradedAt: 'desc' },
        take: 40,
        select: { score: true, maxScore: true, percentage: true, subjectId: true },
      }),
      prisma.attendance.groupBy({
        by: ['status'],
        where: { studentId: id, date: { gte: thirtyDaysAgo } },
        _count: { id: true },
      }),
      prisma.violation.aggregate({
        where: { studentId: id },
        _count: { id: true },
        _sum: { points: true },
      }),
      prisma.reward.aggregate({
        where: { studentId: id },
        _count: { id: true },
        _sum: { points: true },
      }),
    ]);

    // Academic summary — normalize each grade to a percentage
    const toPercentage = (g: (typeof grades)[number]) => {
      if (g.percentage !== null) return Number(g.percentage);
      const max = Number(g.maxScore) || 100;
      return (Number(g.score) / max) * 100;
    };
    const percentages = grades.map(toPercentage);
    const average = (values: number[]) =>
      values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    const averageGrade = Math.round(average(percentages) * 100) / 100;

    // Trend: newer half vs older half of the recent grades (>2 point swing)
    let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    if (percentages.length >= 4) {
      const mid = Math.floor(percentages.length / 2);
      const diff = average(percentages.slice(0, mid)) - average(percentages.slice(mid));
      if (diff > 2) trend = 'UP';
      else if (diff < -2) trend = 'DOWN';
    }

    // Attendance summary (last 30 days)
    const countFor = (status: string) =>
      attendanceByStatus.find((row) => row.status === status)?._count.id ?? 0;
    const totalDays = attendanceByStatus.reduce((sum, row) => sum + row._count.id, 0);
    const presentDays = countFor('PRESENT');

    return {
      ...student,
      parents: student.parents.map((link) => ({
        id: link.parent.id,
        name: link.parent.name,
        relation: link.relation,
        phone: link.parent.phone,
        email: link.parent.email,
      })),
      academicSummary: {
        averageGrade,
        totalSubjects: new Set(grades.map((g) => g.subjectId)).size,
        trend,
      },
      attendanceSummary: {
        totalDays,
        presentDays,
        percentage: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
      },
      behaviorSummary: {
        totalViolations: violationAgg._count.id,
        totalRewards: rewardAgg._count.id,
        points: (rewardAgg._sum.points ?? 0) - (violationAgg._sum.points ?? 0),
      },
    };
  }

  /**
   * Create new student (with user account)
   */
  async create(input: CreateStudentInput) {
    // Check if email exists (if provided)
    const emailToCheck = normalizeEmail(input.email || `${input.nis}@student.cipansor.local`);
    const existingEmail = await prisma.user.findFirst({
      where: { email: emailToCheck },
    });

    if (existingEmail) {
      throw Errors.conflict('Email already registered');
    }

    await assertStudentIdentifiersAvailable({ nisn: input.nisn });

    // Check unit exists
    if (!input.unitId) {
      throw Errors.badRequest('Unit ID is required');
    }

    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, deletedAt: null },
    });

    if (!unit) {
      throw Errors.notFound('Unit');
    }

    const unitId = input.unitId; // TypeScript narrowing

    // NIS milik unit yang menerbitkannya: SD IT dan SMP IT boleh memakai nomor
    // yang sama. Yang ditolak adalah nomor kembar DI UNIT YANG SAMA (audit #489
    // bagian 4) — dulu satu nomor mengunci seluruh yayasan. Diperiksa setelah
    // unitnya dipastikan ada, karena pertanyaannya "sudah dipakai di unit mana".
    const pemilikNis = await findStudentIdByNisInUnit(prisma, { unitId, nis: input.nis });
    if (pemilikNis) {
      throw Errors.conflict('NIS ini sudah dipakai santri lain di unit yang sama.');
    }

    // Generate email if not provided
    const email = normalizeEmail(input.email || `${input.nis}@student.cipansor.local`);

    // Whether this pupil gets an account at all. TK Qur'an pupils never do —
    // they are four to six years old — so the row created below is an identity
    // carrying their name, with no credential and no ability to sign in.
    // Without this, adding a TK pupil through the UI issued them a password.
    const withLogin = studentsHoldLogins(unit.type);

    // Students are issued a password to reset later rather than choosing one.
    const passwordHash = withLogin
      ? await hashPassword(
          input.password ?? `Aa1${randomUUID().replace(/-/g, '').slice(0, 12)}`
        )
      : null;

    // Create user and student in transaction
    const student = await prisma.$transaction(async (tx) => {
      // Create user account
      const user = await tx.user.create({
        data: {
          name: input.name,
          email,
          passwordHash,
          role: UserRole.STUDENT,
          unitId,
          isActive: withLogin,
        },
      });

      // Create student profile
      const student = await tx.student.create({
        data: {
          userId: user.id,
          unitId,
          nis: input.nis,
          nisn: input.nisn,
          gender: input.gender as Gender,
          birthPlace: input.birthPlace,
          birthDate: input.birthDate,
          address: input.address,
          parentName: input.parentName,
          parentPhone: input.parentPhone,
          parentEmail: input.parentEmail,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          unit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // NIS terbit atas nama unit: catat pasangan (santri, unit) → NIS.
      await assignStudentNis(tx, { studentId: student.id, unitId, nis: input.nis });

      // Link the guardian for real. Before this, parentName/parentPhone were
      // stored on the student row and nowhere else, so every santri added
      // through the admin form was an orphan relationally: the wali had no
      // account, no StudentParent row, and no unit scope.
      await linkGuardian(tx as unknown as GuardianClient, {
        studentId: student.id,
        name: input.parentName,
        phone: input.parentPhone,
        email: input.parentEmail,
      });

      // Enroll in class if provided
      let riwayatDitulis = false;
      if (input.classId) {
        const classExists = await tx.class.findFirst({
          where: { id: input.classId, deletedAt: null, unitId },
        });

        if (classExists) {
          await tx.classEnrollment.create({
            data: {
              studentId: student.id,
              classId: input.classId,
              status: 'active',
            },
          });
          // Rombel tahu unit dan tahun ajarannya; riwayat unit ditulis dari
          // sana supaya tabelnya tidak basi pada santri berikutnya.
          await recordUnitEnrollmentFromClass(tx, student.id, input.classId);
          riwayatDitulis = true;
        }
      }

      // Rombel itu pilihan: santri pindahan sering masuk sebelum rombelnya
      // ditentukan. Riwayat unitnya tetap harus ada, kalau tidak ia hilang dari
      // setiap laporan yang menyaring lewat riwayat.
      if (!riwayatDitulis) {
        await ensureUnitEnrollment(tx, student.id, unitId);
      }

      return student;
    });

    return student;
  }

  /**
   * Update student
   */
  async update(id: string, input: UpdateStudentInput) {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: { user: true },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

    // Nomor kembar hanya dilarang di unit yang sama (lihat `create`).
    if (input.nis && input.nis !== student.nis) {
      const pemilikNis = await findStudentIdByNisInUnit(prisma, {
        unitId: input.unitId ?? student.unitId,
        nis: input.nis,
      });
      if (pemilikNis && pemilikNis !== id) {
        throw Errors.conflict('NIS ini sudah dipakai santri lain di unit yang sama.');
      }
    }

    await assertStudentIdentifiersAvailable({ nisn: input.nisn }, student);

    // Update in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update user name if provided
      if (input.name) {
        await tx.user.update({
          where: { id: student.userId },
          data: { name: input.name },
        });
      }

      // NIS yang diubah adalah NIS unit santri SEKARANG; NIS di unit-unit
      // lamanya (dokumen yang sudah terbit) tidak disentuh.
      if (input.nis && input.nis !== student.nis) {
        await assignStudentNis(tx, { studentId: id, unitId: student.unitId, nis: input.nis });
      }

      // Update student
      return tx.student.update({
        where: { id },
        data: {
          nis: input.nis,
          nisn: input.nisn,
          gender: input.gender as Gender | undefined,
          birthPlace: input.birthPlace,
          birthDate: input.birthDate,
          address: input.address,
          parentName: input.parentName,
          parentPhone: input.parentPhone,
          parentEmail: input.parentEmail,
          photoUrl: input.photoUrl,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          unit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    });

    return updated;
  }

  /**
   * Delete student (soft delete)
   */
  async delete(id: string) {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

    // Soft delete both student and user
    await prisma.$transaction([
      prisma.student.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: student.userId },
        data: { deletedAt: new Date() },
      }),
    ]);

    return { message: 'Student deleted successfully' };
  }
}

export const studentService = new StudentService();
