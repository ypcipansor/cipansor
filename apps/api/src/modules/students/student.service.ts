import { randomUUID } from 'crypto';
import { seesAllUnits } from '@/utils/resolve-unit-id';
import { studentsHoldLogins } from '@/utils/student-login-policy';
import { linkGuardian, type GuardianClient } from '@/utils/link-guardian';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { Errors } from '@/middleware/error';
import { UserRole, Gender, Prisma, UnitType } from '@prisma/client';
import { STUDENT_ROLE_CODES } from '@/modules/auth/auth.service';
import type {
  ListStudentsQuery,
  CreateStudentInput,
  UpdateStudentInput,
  GraduateStudentInput,
} from './student.schema';

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

    if (status) {
      where.status = status.toLowerCase();
    }

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
        { nisn: { contains: search, mode: 'insensitive' } },
        { nik: { contains: search, mode: 'insensitive' } },
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

    const mappedStudents = students.map((student) => {
      const currentEnrollment = student.enrollments[0];
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
   * Find internal alumnus student by NIK or NISN for re-enrollment / onboarding
   */
  async findInternalAlumniByIdentifier(
    identifier: string,
    currentUser?: { role: string; roleCode?: string | null; unitId: string | null }
  ) {
    if (!identifier || identifier.trim().length === 0) {
      return null;
    }

    const clean = identifier.trim();

    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      status: 'alumni',
      OR: [{ nik: clean }, { nisn: clean }],
    };

    // MODEL (see root AGENTS.md golden rule #4/5): `student.unitId` is the
    // CURRENT ACTIVE unit, not a historical source of truth. A student who
    // progresses from one unit to the next (TK -> SD IT -> SMP IT -> SMA
    // Qur'an) legitimately migrates their `unitId` to the target unit, so a
    // target-unit admissions/PPSB user re-enrolling them MUST be able to find
    // the alumnus even though the record still lives in the source unit.
    //
    // To keep that breadth from reopening a take-over hole, the lookup is
    // deliberately narrowed to `status = 'alumni'` (never an active student in
    // another unit) and only ever runs through an authenticated admissions
    // endpoint (STUDENT_CREATE). A unit-pinned caller may therefore search
    // across all units but can only ever re-link records that have already
    // graduated; an ACTIVE student in another unit cannot be hijacked because
    // no path here matches it.
    //
    // Trade-off (chosen over the alternative of scoping by caller unit): the
    // unit scope blocked the very progression this feature exists to enable —
    // an SMP IT staffer could not look up an SD IT alumni to re-enrol them,
    // and the search silently failed. We accept that a unit-pinned caller can
    // discover alumni from other units for re-enrollment, and rely on the
    // 'alumni' status filter plus the authenticated, audit-visible admissions
    // path to prevent hijacking active students.
    const student = await prisma.student.findFirst({
      where,
      select: {
        id: true,
        nisn: true,
        nik: true,
        gender: true,
        birthPlace: true,
        birthDate: true,
        entryYear: true,
        graduateYear: true,
        status: true,
        user: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, type: true } },
      },
    });

    if (!student) {
      return null;
    }
    return {
      ...student,
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
        violations: {
          take: 5,
          orderBy: { occurredAt: 'desc' },
        },
        medicalRecords: {
          take: 5,
          orderBy: { visitDate: 'desc' },
        },
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

    const totalViolationPoints = violationStats._sum.points || 0;
    const unpaidInvoicesCount = invoiceStats._count.id;
    const unpaidInvoicesTotal =
      (Number(invoiceStats._sum.amount) || 0) - (Number(invoiceStats._sum.paidAmount) || 0);

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

    const toPercentage = (g: (typeof grades)[number]) => {
      if (g.percentage !== null) return Number(g.percentage);
      const max = Number(g.maxScore) || 100;
      return (Number(g.score) / max) * 100;
    };
    const percentages = grades.map(toPercentage);
    const average = (values: number[]) =>
      values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    const averageGrade = Math.round(average(percentages) * 100) / 100;

    let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    if (percentages.length >= 4) {
      const mid = Math.floor(percentages.length / 2);
      const diff = average(percentages.slice(0, mid)) - average(percentages.slice(mid));
      if (diff > 2) trend = 'UP';
      else if (diff < -2) trend = 'DOWN';
    }

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
   * Mark student as graduated (Alumni)
   *
   * Business rule: `graduateYear` wins over `graduationDate` when both are provided,
   * otherwise the graduation year is derived from the date (or the current year).
   */
  async graduateStudent(
    id: string,
    input?: GraduateStudentInput | number,
    currentUser?: { role: string; roleCode?: string | null; unitId: string | null }
  ) {
    return prisma.$transaction((tx) => this._graduateStudent(tx, id, input, currentUser));
  }

  /**
   * Internal graduation routine. Takes an explicit transaction client so callers
   * that need profile-write + graduation to be atomic (see `update`) can run it
   * inside the same transaction rather than committing the profile first and
   * then starting a separate graduation transaction.
   */
  private async _graduateStudent(
    tx: Prisma.TransactionClient,
    id: string,
    input?: GraduateStudentInput | number,
    currentUser?: { role: string; roleCode?: string | null; unitId: string | null }
  ) {
    const student = await tx.student.findFirst({
      where: { id, deletedAt: null },
      include: { user: true, unit: true },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

    // SECURITY: a caller pinned to one unit may only graduate students in that
    // unit. Without this a unit's staff could strip another unit's student of
    // their enrollment, dormitory room and login access. Foundation/cross-unit
    // roles (seesAllUnits) may graduate across the foundation.
    if (currentUser && !seesAllUnits(currentUser) && student.unitId !== currentUser.unitId) {
      throw Errors.forbidden('You can only graduate students in your own unit');
    }

    // Accept both the new object contract and the legacy `(id, year)` shape.
    const graduateYear = typeof input === 'number' ? input : input?.graduateYear;
    const graduationDate = typeof input === 'number' ? undefined : input?.graduationDate;

    const effectiveDate = graduationDate ? new Date(graduationDate) : new Date();
    const currentYear = graduateYear ?? effectiveDate.getFullYear();

    await tx.classEnrollment.updateMany({
      where: { studentId: id, status: 'active' },
      data: { status: 'completed' },
    });

    // Free the dormitory bed on graduation so the room roster no longer shows
    // the graduate and the assignment cannot be reused while still active.
    await tx.roomAssignment.updateMany({
      where: { studentId: id, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    });

    // Revoke the graduate's student login access in the same transaction that
    // marks the record alumni. Without this, a graduated student keeps their
    // authenticated student roles indefinitely. Resolve the role via the
    // student RoleCodes so unrelated teacher/staff/parent roles the same user
    // may hold in other units stay active.
    const studentRoles = await tx.role.findMany({
      where: { code: { in: STUDENT_ROLE_CODES } },
      select: { id: true },
    });
    const studentRoleIds = studentRoles.map((r) => r.id);
    if (studentRoleIds.length > 0) {
      await tx.userRoleAssignment.updateMany({
        where: {
          userId: student.userId,
          isActive: true,
          roleId: { in: studentRoleIds },
        },
        data: { isActive: false, isPrimary: false },
      });
    }

    const updated = await tx.student.update({
      where: { id },
      data: {
        status: 'alumni',
        graduateYear: currentYear,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, name: true } },
      },
    });

    // Upsert Alumni record to keep alumni module synchronized
    const registrationNo = `ALM-${currentYear}-${id.slice(0, 8).toUpperCase()}`;
    await tx.alumni.upsert({
      where: { studentId: id },
      create: {
        studentId: id,
        unitId: student.unitId,
        registrationNo,
        name: student.user.name,
        gender: student.gender,
        birthPlace: student.birthPlace,
        birthDate: student.birthDate,
        graduationYear: currentYear,
        graduationDate: effectiveDate,
        email: student.user.email,
        phone: student.parentPhone,
        address: student.address,
        status: 'ACTIVE',
      },
      update: {
        // `student.unitId` is the CURRENT ACTIVE unit (root AGENTS.md golden
        // rule #4/5). The Alumni row therefore mirrors the unit the student
        // graduated from THIS time. Per-unit history is NOT derived from the
        // mutable `student.unitId` — it lives in per-record snapshots:
        // - Graduations: `Alumni.unitId` (this row) + `AlumniEducation` rows.
        // - Enrolments: `ClassEnrollment` -> `Class.unitId` (rows are marked
        //   'completed', never deleted, when a student progresses).
        // - Finance: `Invoice.unitId`.
        unitId: student.unitId,
        name: student.user.name,
        gender: student.gender,
        birthPlace: student.birthPlace,
        birthDate: student.birthDate,
        email: student.user.email,
        phone: student.parentPhone,
        address: student.address,
        graduationYear: currentYear,
        graduationDate: effectiveDate,
        status: 'ACTIVE',
      },
    });

    return updated;
  }

  /**
   * Create new student
   */
  async create(input: CreateStudentInput) {
    if (input.nisn) {
      const existingNisn = await prisma.student.findFirst({
        where: { nisn: input.nisn },
      });
      if (existingNisn) {
        throw Errors.conflict('NISN already exists');
      }
    }

    if (input.nik) {
      const existingNik = await prisma.student.findFirst({
        where: { nik: input.nik },
      });
      if (existingNik) {
        throw Errors.conflict('NIK already exists');
      }
    }

    const emailToCheck =
      input.email || `${input.nisn || input.nik || randomUUID()}@student.cipansor.local`;
    const existingEmail = await prisma.user.findFirst({
      where: { email: emailToCheck },
    });

    if (existingEmail) {
      throw Errors.conflict('Email already registered');
    }

    if (!input.unitId) {
      throw Errors.badRequest('Unit ID is required');
    }

    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, deletedAt: null },
    });

    if (!unit) {
      throw Errors.notFound('Unit');
    }

    // Lifelong-identifier rule (mirrors enrolRegistrant in admissions.service.ts
    // and processEnrollment in the onboarding orchestrator): an active student
    // must carry a permanent NISN or NIK. TK_QURAN is the documented exception —
    // young children may not yet have a NISN and the school does not always
    // collect their NIK. Non-TK units that reach this point with neither
    // identifier would silently create a student with no way to be identified
    // long-term.
    if (!input.nisn && !input.nik && unit.type !== UnitType.TK_QURAN) {
      throw Errors.badRequest('NISN atau NIK wajib diisi untuk menerima siswa');
    }

    const unitId = input.unitId;
    const email = emailToCheck;
    const withLogin = studentsHoldLogins(unit.type);

    const passwordHash = withLogin
      ? await hashPassword(input.password ?? `Aa1${randomUUID().replace(/-/g, '').slice(0, 12)}`)
      : null;

    const student = await prisma.$transaction(async (tx) => {
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

      const student = await tx.student.create({
        data: {
          userId: user.id,
          unitId,
          nisn: input.nisn || null,
          nik: input.nik || null,
          noKK: input.noKK || null,
          noAkta: input.noAkta || null,
          kipNumber: input.kipNumber || null,
          gender: input.gender as Gender,
          birthPlace: input.birthPlace,
          birthDate: input.birthDate,
          address: input.address,
          parentName: input.parentName,
          parentPhone: input.parentPhone,
          parentEmail: input.parentEmail,
          entryYear: new Date().getFullYear(),
          status: 'active',
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

      await linkGuardian(tx as unknown as GuardianClient, {
        studentId: student.id,
        name: input.parentName,
        phone: input.parentPhone,
        email: input.parentEmail,
      });

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
        }
      }

      return student;
    });

    return student;
  }

  /**
   * Update student
   */
  async update(
    id: string,
    input: UpdateStudentInput,
    currentUser?: { role: string; roleCode?: string | null; unitId: string | null }
  ) {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: { user: true },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

    // INTEGRITY (mirrors the create-stage rule): an update must not wipe a
    // non-TK student's permanent identity. A payload that clears BOTH NISN and
    // NIK (null or '' — the schema treats empty string as absent) is only
    // allowed when the student had no identifier to begin with, or when they
    // belong to TK_QURAN (the documented exception).
    const clearingBoth =
      (input.nisn === null || input.nisn === '') &&
      (input.nik === null || input.nik === '');
    if (clearingBoth && (student.nisn || student.nik)) {
      const unit = await prisma.unit.findFirst({ where: { id: student.unitId } });
      if (unit && unit.type !== UnitType.TK_QURAN) {
        throw Errors.badRequest('Minimal satu identifier wajib diisi (NISN atau NIK)');
      }
    }

    if (input.nisn && input.nisn !== student.nisn) {
      const existingNisn = await prisma.student.findFirst({
        where: { nisn: input.nisn, id: { not: id } },
      });
      if (existingNisn) {
        throw Errors.conflict('NISN already in use');
      }
    }

    if (input.nik && input.nik !== student.nik) {
      const existingNik = await prisma.student.findFirst({
        where: { nik: input.nik, id: { not: id } },
      });
      if (existingNik) {
        throw Errors.conflict('NIK already in use');
      }
    }

    const targetStatus = input.status ? this.mapCanonicalStatus(input.status) : undefined;

    if (targetStatus === 'alumni') {
      // Graduation must be atomic: profile edits AND the graduation side-effects
      // (deactivate enrollments, free the room, revoke student login roles,
      // upsert the alumni snapshot) commit together. The profile write used to
      // be committed here BEFORE graduateStudent started a separate transaction,
      // so a failure in the revocation/alumni-upsert left a saved profile with
      // the student still 'active'. Run both in the SAME transaction now.
      return prisma.$transaction(async (tx) => {
        if (input.name) {
          await tx.user.update({
            where: { id: student.userId },
            data: { name: input.name },
          });
        }

        await tx.student.update({
          where: { id },
          data: {
            nisn: input.nisn,
            nik: input.nik,
            noKK: input.noKK,
            noAkta: input.noAkta,
            kipNumber: input.kipNumber,
            gender: input.gender as Gender | undefined,
            birthPlace: input.birthPlace,
            birthDate: input.birthDate,
            address: input.address,
            parentName: input.parentName,
            parentPhone: input.parentPhone,
            parentEmail: input.parentEmail,
            photoUrl: input.photoUrl,
          },
        });

        return this._graduateStudent(tx, id, undefined, currentUser);
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.name) {
        await tx.user.update({
          where: { id: student.userId },
          data: { name: input.name },
        });
      }

      return tx.student.update({
        where: { id },
        data: {
          nisn: input.nisn,
          nik: input.nik,
          noKK: input.noKK,
          noAkta: input.noAkta,
          kipNumber: input.kipNumber,
          gender: input.gender as Gender | undefined,
          birthPlace: input.birthPlace,
          birthDate: input.birthDate,
          address: input.address,
          parentName: input.parentName,
          parentPhone: input.parentPhone,
          parentEmail: input.parentEmail,
          photoUrl: input.photoUrl,
          status: targetStatus,
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
  private mapCanonicalStatus(status: string): string {
    const s = status.toLowerCase();
    if (s === 'graduated' || s === 'alumni') return 'alumni';
    if (s === 'dropped_out' || s === 'dropped') return 'dropped';
    if (s === 'transferred') return 'transferred';
    if (s === 'inactive') return 'inactive';
    return 'active';
  }

  async delete(id: string) {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
    });

    if (!student) {
      throw Errors.notFound('Student');
    }

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
