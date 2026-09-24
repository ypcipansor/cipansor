import { prisma } from '../../lib/prisma';
import { Prisma, LeaveStatus, StaffAttendanceStatus, LeaveType, UserRole } from '@prisma/client';
import {
  mayAdministerEmployeeDocuments,
  hrEmployeeRoleFor,
  HR_EMPLOYEE_ROLE_CODES,
  HR_TEACHER_ROLE_CODES,
  HR_STAFF_ROLE_CODES,
} from '@cipansor/shared';
import type { HrEmployee } from '@cipansor/shared';
import { seesAllUnits, isFoundationScopedRole } from '../../utils/resolve-unit-id';
import {
  CreateStaffAttendanceInput,
  UpdateStaffAttendanceInput,
  BulkAttendanceInput,
  CreateLeaveInput,
  UpdateLeaveInput,
  ApproveLeaveInput,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from './hr.schema';
import bcrypt from 'bcryptjs';
import { Errors } from '../../middleware/error';
import { normalizeEmail } from '../../utils/email';
import { activeUserRoleWhere } from '../../utils/active-role';

// =====================================
// EMPLOYEE SERVICE (UNIFIED TEACHER & STAFF)
// =====================================

export async function getEmployees(params: {
  page: number;
  limit: number;
  unitId?: string;
  role?: 'TEACHER' | 'STAFF';
  search?: string;
}) {
  const { page, limit, unitId, role, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    role: role ? (role as UserRole) : { in: [UserRole.TEACHER, UserRole.STAFF] },
  };

  if (unitId) where.unitId = unitId;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { teacher: { nip: { contains: search, mode: 'insensitive' } } },
      { staff: { nip: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        unit: { select: { id: true, name: true } },
        teacher: true,
        staff: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * List teachers (Teacher records with user + unit info).
 * Backs the web `useTeachers` hook (homeroom/e-office/dormitory pickers).
 */
export async function getTeachers(params: {
  page: number;
  limit: number;
  unitId?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
  search?: string;
}) {
  const { page, limit, unitId, status, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.TeacherWhereInput = { deletedAt: null };
  if (unitId) where.unitId = unitId;
  if (status === 'ACTIVE') where.user = { isActive: true, deletedAt: null };
  else if (status === 'INACTIVE') where.user = { isActive: false };
  if (search) {
    where.user = {
      ...((where.user as Prisma.UserWhereInput) ?? {}),
      name: { contains: search, mode: 'insensitive' },
    };
  }

  const [teachers, total] = await Promise.all([
    prisma.teacher.findMany({
      where,
      skip,
      take: limit,
      orderBy: { user: { name: 'asc' } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
        unit: { select: { id: true, name: true } },
      },
    }),
    prisma.teacher.count({ where }),
  ]);

  return {
    data: teachers.map((teacher) => ({
      ...teacher,
      status: teacher.user.isActive ? ('ACTIVE' as const) : ('INACTIVE' as const),
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Flatten a User + Teacher/Staff profile into the shared `HrEmployee` DTO.
 *
 * The database has no `Employee` table — a teacher and a tendik are separate
 * profile models — so the list and detail pages get one shape from here instead
 * of each page re-deriving it from whichever profile it happened to load.
 * Fields with no column (`employeeType`, `position`, `status`) are derived and
 * deliberately default to the neutral value rather than guessing.
 *
 * `includeSensitive` gates NIK and the bank columns. They are personal data:
 * a colleague in the same unit may need the directory and still has no business
 * reading anyone's KTP number or account details. When false the keys are
 * omitted rather than blanked, so a caller cannot mistake "hidden" for "empty".
 */
function toHrEmployee(
  user: HrEmployeeRow,
  { includeSensitive = false }: { includeSensitive?: boolean } = {}
): HrEmployee {
  const teacher = user.teacher;
  const staff = user.staff;
  // Label from the live assignment (the include above returns only active HR
  // role codes, primary first); the profile is the tie-breaker for a user whose
  // HR assignment was revoked but whose directory row an admin still expects.
  const directoryRole =
    hrEmployeeRoleFor(user.userRoles?.[0]?.role.code) ?? (teacher ? 'TEACHER' : 'STAFF');

  const employee: HrEmployee = {
    id: user.id,
    userId: user.id,
    nip: teacher?.nip ?? staff?.nip ?? '-',
    user: { id: user.id, name: user.name, email: user.email },
    unitId: directoryUnitOf(user) ?? '',
    unit: directoryUnitRelation(user) ?? { id: '', name: '' },
    departmentId: teacher?.departmentId ?? staff?.departmentId ?? undefined,
    department:
      teacher?.department ??
      staff?.departmentRel ??
      (staff?.department ? { id: '', name: staff.department } : undefined),

    fullName: user.name,
    gender: teacher?.gender ?? null,
    birthPlace: teacher?.birthPlace ?? null,
    birthDate: teacher?.birthDate?.toISOString() ?? null,
    religion: teacher?.religion ?? null,
    maritalStatus: null,

    phone: user.phone,
    email: user.email,
    address: teacher?.address ?? null,

    role: directoryRole,
    position: teacher ? 'Guru' : (staff?.position ?? ''),
    // Neither the Teacher nor the Staff table records a contract type or a
    // lifecycle status. PERMANENT/ACTIVE are the neutral defaults the pages
    // already assume; inventing a status from `isActive` would mislabel a
    // teacher on leave as inactive.
    employeeType: 'PERMANENT',
    status: user.isActive ? 'ACTIVE' : 'INACTIVE',
    joinDate: (teacher?.joinDate ?? staff?.joinDate ?? user.createdAt).toISOString(),

    lastEducation: teacher?.lastEducation ?? null,
    educationMajor: teacher?.lastEducationMajor ?? null,
    educationInstitution: teacher?.lastEducationInstitution ?? null,
    graduationYear: null,

    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  if (includeSensitive) {
    employee.nik = teacher?.nik ?? null;
    employee.bankName = teacher?.bankName ?? null;
    employee.bankAccountNumber = teacher?.bankAccountNumber ?? null;
    employee.bankAccountName = teacher?.bankAccountName ?? null;
  }

  return employee;
}

/** The profile + live role selection every employee read shares. */
const HR_EMPLOYEE_INCLUDE = {
  unit: { select: { id: true, name: true } },
  teacher: { include: { department: { select: { id: true, name: true } } } },
  staff: { include: { departmentRel: { select: { id: true, name: true } } } },
  // The DTO's TEACHER/STAFF label and the directory's unit scope both come from
  // the live assignment (primary first), not the deprecated `User.role` column
  // or the home unit. The assignment's own unit rides along so the row reports
  // the unit the person actually serves — the same one the scope filtered on —
  // rather than their home unit, which legitimately differs after a reassignment.
  userRoles: {
    where: { ...activeUserRoleWhere(), role: { code: { in: [...HR_EMPLOYEE_ROLE_CODES] } } },
    orderBy: { isPrimary: 'desc' },
    take: 1,
    select: {
      role: { select: { code: true } },
      unitId: true,
      unit: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserInclude;

/** A User row with exactly the relations {@link toHrEmployee} reads. */
type HrEmployeeRow = Prisma.UserGetPayload<{ include: typeof HR_EMPLOYEE_INCLUDE }>;

/**
 * The unit that decides an employee's directory scope *and* is reported in the
 * row: their primary live role assignment's unit, falling back to the home unit.
 * Mirrors `tokenUnitId` and `assignmentUnit` in `utils/blob-owner.ts`, so the
 * directory, the SAS owner check and the token all agree on which unit a person
 * belongs to. Reporting the home unit here while filtering on the assignment
 * unit made a reassigned employee's row carry a different unit than the one the
 * scope selected them for.
 */
function directoryUnitOf(user: HrEmployeeRow): string | null {
  return user.userRoles?.[0]?.unitId ?? user.unitId;
}

/** The unit relation a directory row reports, tracking {@link directoryUnitOf}. */
function directoryUnitRelation(user: HrEmployeeRow): { id: string; name: string } | undefined {
  const assignment = user.userRoles?.[0];
  if (assignment?.unit) return assignment.unit;
  if (assignment?.unitId) return { id: assignment.unitId, name: '' };
  return user.unit ?? undefined;
}

/**
 * The caller of an employee read, used to scope the directory and decide
 * whether personal fields are visible.
 */
export interface EmployeeDirectoryActor {
  id: string;
  roleCode?: string | null;
  unitId?: string | null;
}

/**
 * True when `actor` may read the personal columns (NIK, bank) of an employee
 * in `targetUnitId`: the person themselves, a personnel administrator for that
 * unit, or a foundation role.
 */
function mayReadSensitiveFields(
  actor: EmployeeDirectoryActor,
  targetUserId: string,
  targetUnitId: string | null | undefined
): boolean {
  if (actor.id === targetUserId) return true;
  // Foundation roles own personnel data yayasan-wide; cross-unit service roles
  // (ustadz, perawat, …) do NOT — their breadth covers where people work, not
  // their KTP number and bank account.
  if (isFoundationScopedRole(actor.roleCode)) return true;
  return (
    mayAdministerEmployeeDocuments(actor.roleCode) &&
    !!actor.unitId &&
    targetUnitId === actor.unitId
  );
}

/**
 * True when `actor` may read the employee record at all — possibly with the
 * personal columns masked. Own record, the whole yayasan for a foundation
 * role, or a colleague in the same unit.
 */
function mayReadEmployee(
  actor: EmployeeDirectoryActor,
  targetUserId: string,
  targetUnitId: string | null | undefined
): boolean {
  if (actor.id === targetUserId) return true;
  if (seesAllUnits(actor)) return true;
  return !!actor.unitId && targetUnitId === actor.unitId;
}

/**
 * List employees (a User with a Teacher or Staff profile) as the flat
 * `HrEmployee` DTO. Backs `GET /hr/employees` for the HR directory, the
 * department head picker and the Merdeka supervisor picker.
 *
 * The directory is personnel data, so `actor` decides two things and neither is
 * optional:
 *
 *  - **Scope.** Only a caller who sees all units (`seesAllUnits`) may choose a
 *    unit; a `unitId` query parameter from anyone else is ignored and the
 *    query is pinned to their own unit, because trusting it let a unit admin
 *    read the whole roster of a different unit and let any teacher read the
 *    whole yayasan. A unit-less non-admin is narrowed to their own record
 *    rather than left unfiltered (an undefined `unitId` filter would match
 *    every row).
 *  - **Columns.** NIK and the bank fields are only emitted for a caller who may
 *    read them (see {@link mayReadSensitiveFields}).
 */
export async function getEmployeeDirectory(
  params: {
    page: number;
    limit: number;
    unitId?: string;
    role?: 'TEACHER' | 'STAFF';
    status?: 'ACTIVE' | 'INACTIVE';
    search?: string;
  },
  actor?: EmployeeDirectoryActor
) {
  const { page, limit, status, search } = params;
  const skip = (page - 1) * limit;

  const memberRoleCodes = params.role
    ? params.role === 'TEACHER'
      ? HR_TEACHER_ROLE_CODES
      : HR_STAFF_ROLE_CODES
    : HR_EMPLOYEE_ROLE_CODES;

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    // Membership comes from the live assignment, not the legacy `role` column.
    // "Live" means active AND not past `expiresAt`: an expired assignment left
    // the former holder in the directory (and able to shape unit scope).
    userRoles: {
      some: { ...activeUserRoleWhere(), role: { code: { in: [...memberRoleCodes] } } },
    },
    ...(status ? { isActive: status === 'ACTIVE' } : {}),
  };

  if (actor) {
    // Pin the roster to a unit the actor's token actually covers. Foundation
    // roles (and other `seesAllUnits` roles) may narrow to any unit they ask
    // for; everyone else is narrowed to their own unit — the client's
    // `params.unitId` is ignored — because trusting it verbatim let an
    // SDIT_ADMIN read the whole roster of a different unit even though the
    // token only scopes one. A caller with no unit at all is narrowed to their
    // own record (an absent `unitId` filter would match every row).
    //
    // The scope names the ASSIGNMENT unit, matching `tokenUnitId` /
    // `activeUserRoleWhere`, and is applied to the employee's live role
    // assignment rather than to `User.unitId` (their home unit). The two
    // legitimately disagree when someone is reassigned: filtering the home unit
    // dropped a person from the roster of the unit they actually serve, and
    // their token is scoped to the assignment.
    const scopeUnitId = seesAllUnits(actor) ? params.unitId : actor.unitId;
    if (scopeUnitId) {
      (where.userRoles as Prisma.UserRoleAssignmentListRelationFilter).some = {
        ...activeUserRoleWhere(),
        unitId: scopeUnitId,
        role: { code: { in: [...memberRoleCodes] } },
      };
    } else if (!seesAllUnits(actor)) {
      where.id = actor.id;
    }
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { teacher: { nip: { contains: search, mode: 'insensitive' } } },
      { staff: { nip: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: HR_EMPLOYEE_INCLUDE,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: data.map((user) =>
      toHrEmployee(user, {
        includeSensitive: actor
          ? mayReadSensitiveFields(actor, user.id, directoryUnitOf(user))
          : false,
      })
    ),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Fetch one employee by user id as the flat `HrEmployee` DTO, or null when the
 * id names no teacher/staff user (the caller turns that into a 404).
 *
 * `actor` scopes the read the same way the directory does: someone who may not
 * administer personnel and does not see all units only reaches employees in
 * their own unit. Out-of-scope ids return null (a 404) rather than a 403, so
 * the response cannot be used to probe which user ids exist.
 */
export async function getEmployeeById(id: string, actor?: EmployeeDirectoryActor) {
  const user = await prisma.user.findFirst({
    where: {
      id,
      deletedAt: null,
      userRoles: {
        some: { ...activeUserRoleWhere(), role: { code: { in: [...HR_EMPLOYEE_ROLE_CODES] } } },
      },
    },
    include: HR_EMPLOYEE_INCLUDE,
  });
  if (!user) return null;

  const targetUnitId = directoryUnitOf(user);
  if (actor && !mayReadEmployee(actor, user.id, targetUnitId)) return null;

  return toHrEmployee(user, {
    includeSensitive: actor ? mayReadSensitiveFields(actor, user.id, targetUnitId) : false,
  });
}

/**
 * Calculate Retention Risk for employees in a unit.
 * Best Practice: Early warning system for talent turnover.
 */
export async function getRetentionRiskAnalytics(unitId: string) {
  const employees = await prisma.user.findMany({
    where: {
      unitId,
      role: { in: [UserRole.TEACHER, UserRole.STAFF] },
      deletedAt: null,
      isActive: true,
    },
    include: {
      teacher: {
        include: {
          leaves: {
            where: {
              status: LeaveStatus.APPROVED,
              startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
            },
          },
        },
      },
      staff: {
        include: {
          leaves: {
            where: {
              status: LeaveStatus.APPROVED,
              startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
            },
          },
        },
      },
      talentProfile: {
        include: {
          assessments: { orderBy: { assessedAt: 'desc' }, take: 1 },
        },
      },
      trainingEnrollments: { where: { status: 'COMPLETED' } },
    },
  });

  return employees
    .map((emp) => {
      let riskScore = 0;
      const riskFactors = [];

      // 1. Performance Factor
      const latestAssessment = emp.talentProfile?.assessments[0];
      if (latestAssessment) {
        if (
          latestAssessment.performanceRating === 'BELOW' ||
          latestAssessment.performanceRating === 'UNSATISFACTORY'
        ) {
          riskScore += 40;
          riskFactors.push('Performa Rendah');
        }
      }

      // 2. Leave Pattern Factor (High unplanned leaves).
      // Leaves are recorded against the Teacher/Staff profile, not the User.
      const empLeaves = [...(emp.teacher?.leaves ?? []), ...(emp.staff?.leaves ?? [])];
      const totalLeaveDays = empLeaves.reduce((sum, l) => sum + l.totalDays, 0);
      if (totalLeaveDays > 15) {
        riskScore += 20;
        riskFactors.push('Absensi Tinggi');
      }

      // 3. Training/Development Factor (Low engagement)
      if (emp.trainingEnrollments.length === 0) {
        riskScore += 15;
        riskFactors.push('Kurang Pengembangan Diri');
      }

      // 4. Tenure Factor (Stagnation - simplified)
      const joinDate = emp.teacher?.joinDate || emp.staff?.joinDate;
      if (joinDate) {
        const years =
          (new Date().getTime() - new Date(joinDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (years > 5 && (!emp.talentProfile || emp.talentProfile.category === 'SOLID_PERFORMER')) {
          riskScore += 15;
          riskFactors.push('Stagnasi Karir Potensial');
        }
      }

      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (riskScore >= 60) riskLevel = 'HIGH';
      else if (riskScore >= 30) riskLevel = 'MEDIUM';

      return {
        userId: emp.id,
        name: emp.name,
        role: emp.role,
        riskScore,
        riskLevel,
        factors: riskFactors,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

export async function createEmployee(data: CreateEmployeeInput) {
  // Validate unique email. Normalised here too, because the schema that
  // lower-cases is only the HTTP edge — this function is also called
  // internally.
  const email = normalizeEmail(data.email);
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw Errors.badRequest('Email already exists');
  }

  // Hash password (default to 'password123' if not provided)
  const password = data.password || 'password123';
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.$transaction(async (tx) => {
    // 1. Create User
    const user = await tx.user.create({
      data: {
        name: data.name,
        email,
        passwordHash,
        role: data.role as UserRole,
        unitId: data.unitId,
        phone: data.phone,
      },
    });

    // 2. Create Profile based on Role
    if (data.role === 'TEACHER') {
      await tx.teacher.create({
        data: {
          userId: user.id,
          unitId: data.unitId,
          nip: data.nip,
          nuptk: data.nuptk,
          gender: data.gender,
          birthPlace: data.birthPlace,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          address: data.address,
          nik: data.nik,
          noKK: data.noKK,
          religion: data.religion || 'ISLAM',
          joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
          employmentStatus: data.employmentStatus,
          specialization: data.specialization,
          certificationNumber: data.certificationNumber,
        },
      });
    } else {
      // STAFF
      if (!data.position) throw Errors.badRequest('Position is required for Staff');

      await tx.staff.create({
        data: {
          userId: user.id,
          unitId: data.unitId,
          nip: data.nip,
          position: data.position,
          department: data.department,
          joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
        },
      });
    }

    return user;
  });
}

export async function updateEmployee(id: string, data: UpdateEmployeeInput) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { teacher: true, staff: true },
  });

  if (!user) throw Errors.notFound('Employee not found');

  return prisma.$transaction(async (tx) => {
    // 1. Update User
    const updatedUser = await tx.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email ? normalizeEmail(data.email) : undefined,
        unitId: data.unitId,
        phone: data.phone,
        isActive: data.isActive,
      },
    });

    // 2. Update Profile
    if (user.role === 'TEACHER' && user.teacher) {
      await tx.teacher.update({
        where: { id: user.teacher.id },
        data: {
          nip: data.nip,
          nuptk: data.nuptk,
          gender: data.gender,
          birthPlace: data.birthPlace,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          address: data.address,
          nik: data.nik,
          noKK: data.noKK,
          religion: data.religion,
          joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
          employmentStatus: data.employmentStatus,
          specialization: data.specialization,
          certificationNumber: data.certificationNumber,
          unitId: data.unitId, // Update unit if user moved
        },
      });
    } else if (user.role === 'STAFF' && user.staff) {
      await tx.staff.update({
        where: { id: user.staff.id },
        data: {
          nip: data.nip,
          position: data.position,
          department: data.department,
          joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
          unitId: data.unitId,
        },
      });
    }

    return updatedUser;
  });
}

export async function deleteEmployee(id: string) {
  // Soft delete user and related profile
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        email: `deleted_${id}_${Date.now()}@example.com`, // Free up email
      },
      include: { teacher: true, staff: true },
    });

    if (user.teacher) {
      await tx.teacher.update({
        where: { id: user.teacher.id },
        data: { deletedAt: new Date(), nip: null, nuptk: null },
      });
    }

    if (user.staff) {
      await tx.staff.update({
        where: { id: user.staff.id },
        data: { deletedAt: new Date(), nip: null },
      });
    }

    return user;
  });
}

// =====================================
// STAFF ATTENDANCE SERVICE
// =====================================

export async function getStaffAttendance(params: {
  page: number;
  limit: number;
  staffId?: string;
  unitId?: string;
  status?: StaffAttendanceStatus;
  startDate?: string;
  endDate?: string;
}) {
  const { page, limit, staffId, unitId, status, startDate, endDate } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.StaffAttendanceWhereInput = {};

  if (staffId) where.staffId = staffId;
  if (unitId) where.staff = { unitId };
  if (status) where.status = status;

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate);
    if (endDate) where.date.lte = new Date(endDate);
  }

  const [data, total] = await Promise.all([
    prisma.staffAttendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        staff: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            unit: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.staffAttendance.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getStaffAttendanceById(id: string) {
  return prisma.staffAttendance.findUnique({
    where: { id },
    include: {
      staff: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function createStaffAttendance(data: CreateStaffAttendanceInput) {
  const date = new Date(data.date);
  date.setHours(0, 0, 0, 0);

  return prisma.staffAttendance.create({
    data: {
      staffId: data.staffId,
      teacherId: data.teacherId,
      date,
      status: data.status,
      checkIn: data.checkIn ? new Date(data.checkIn) : undefined,
      checkOut: data.checkOut ? new Date(data.checkOut) : undefined,
      notes: data.notes,
    },
  });
}

export async function updateStaffAttendance(id: string, data: UpdateStaffAttendanceInput) {
  return prisma.staffAttendance.update({
    where: { id },
    data: {
      status: data.status,
      checkIn: data.checkIn ? new Date(data.checkIn) : undefined,
      checkOut: data.checkOut ? new Date(data.checkOut) : undefined,
      notes: data.notes,
    },
  });
}

export async function recordBulkAttendance(data: BulkAttendanceInput) {
  const date = new Date(data.date);
  date.setHours(0, 0, 0, 0);

  const results = await prisma.$transaction(
    data.records.map((record) => {
      // Handle upsert with new composite key
      // Must explicitly set the other ID to null for the unique constraint
      const whereUnique = record.staffId
        ? { staffId_teacherId_date: { staffId: record.staffId, teacherId: null, date } }
        : { staffId_teacherId_date: { staffId: null, teacherId: record.teacherId!, date } };

      return prisma.staffAttendance.upsert({
        where: whereUnique as any,
        update: {
          status: record.status,
          checkIn: record.checkIn ? new Date(record.checkIn) : undefined,
          checkOut: record.checkOut ? new Date(record.checkOut) : undefined,
          notes: record.notes,
        },
        create: {
          staffId: record.staffId,
          teacherId: record.teacherId,
          date,
          status: record.status,
          checkIn: record.checkIn ? new Date(record.checkIn) : undefined,
          checkOut: record.checkOut ? new Date(record.checkOut) : undefined,
          notes: record.notes,
        },
      });
    })
  );

  return { count: results.length, records: results };
}

export async function getStaffAttendanceSummary(staffId: string, month: number, year: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const records = await prisma.staffAttendance.findMany({
    where: {
      staffId,
      date: { gte: startDate, lte: endDate },
    },
  });

  const summary = records.reduce(
    (acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    staffId,
    month,
    year,
    totalDays: endDate.getDate(),
    recordedDays: records.length,
    summary,
  };
}

export async function deleteStaffAttendance(id: string) {
  return prisma.staffAttendance.delete({ where: { id } });
}

// =====================================
// LEAVE SERVICE
// =====================================

function calculateTotalDays(startDate: Date, endDate: Date): number {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

export async function getLeaves(params: {
  page: number;
  limit: number;
  staffId?: string;
  teacherId?: string;
  unitId?: string;
  type?: LeaveType;
  status?: LeaveStatus;
  startDate?: string;
  endDate?: string;
}) {
  const { page, limit, staffId, teacherId, unitId, type, status, startDate, endDate } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.LeaveWhereInput = {};
  const andConditions: Prisma.LeaveWhereInput[] = [];

  if (staffId) where.staffId = staffId;
  if (teacherId) where.teacherId = teacherId;

  if (unitId) {
    andConditions.push({
      OR: [{ staff: { unitId } }, { teacher: { unitId } }],
    });
  }

  if (type) where.type = type;
  if (status) where.status = status;

  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    // Use overlap logic: (LeaveStart <= FilterEnd) AND (LeaveEnd >= FilterStart)
    // If only startDate provided: LeaveEnd >= Start
    // If only endDate provided: LeaveStart <= End
    const dateCondition: Prisma.LeaveWhereInput = {};

    if (start) {
      dateCondition.endDate = { gte: start };
    }
    if (end) {
      dateCondition.startDate = { lte: end };
    }

    andConditions.push(dateCondition);
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const [data, total] = await Promise.all([
    prisma.leave.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        staff: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        teacher: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        approvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.leave.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getLeaveById(id: string) {
  return prisma.leave.findUnique({
    where: { id },
    include: {
      staff: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      teacher: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, name: true } },
        },
      },
      approvedBy: { select: { id: true, name: true } },
    },
  });
}

export async function createLeave(data: CreateLeaveInput) {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  const totalDays = calculateTotalDays(startDate, endDate);

  if (!data.staffId && !data.teacherId) {
    throw Errors.badRequest('Either staffId or teacherId must be provided');
  }

  return prisma.$transaction(async (tx) => {
    // Validate request (overlap, balance)
    await validateLeaveRequest(tx, {
      staffId: data.staffId,
      teacherId: data.teacherId,
      type: data.type,
      startDate,
      endDate,
      totalDays,
    });

    return tx.leave.create({
      data: {
        staffId: data.staffId,
        teacherId: data.teacherId,
        type: data.type,
        startDate,
        endDate,
        totalDays,
        reason: data.reason,
      },
    });
  });
}

// Helper for validation logic to be reused
async function validateLeaveRequest(
  tx: Prisma.TransactionClient,
  params: {
    staffId?: string;
    teacherId?: string;
    type?: LeaveType;
    startDate: Date;
    endDate: Date;
    totalDays: number;
    excludeLeaveId?: string; // For updates
  }
) {
  const { staffId, teacherId, type, startDate, endDate, totalDays, excludeLeaveId } = params;

  // 1. Check for overlapping leaves
  const overlapWhere: Prisma.LeaveWhereInput = {
    status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
    OR: [
      {
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    ],
  };

  if (staffId) overlapWhere.staffId = staffId;
  if (teacherId) overlapWhere.teacherId = teacherId;
  if (excludeLeaveId) overlapWhere.id = { not: excludeLeaveId };

  const overlappingLeave = await tx.leave.findFirst({ where: overlapWhere });

  if (overlappingLeave) {
    throw Errors.badRequest('Leave request overlaps with an existing request');
  }

  // 2. Check Balance (for ANNUAL leave)
  if (type === LeaveType.ANNUAL) {
    let userId: string | undefined;
    if (staffId) {
      const staff = await tx.staff.findUnique({
        where: { id: staffId },
        select: { userId: true },
      });
      userId = staff?.userId;
    } else if (teacherId) {
      const teacher = await tx.teacher.findUnique({
        where: { id: teacherId },
        select: { userId: true },
      });
      userId = teacher?.userId;
    }

    if (userId) {
      // Find Academic Year covering the leave period
      const academicYear = await tx.academicYear.findFirst({
        where: {
          startDate: { lte: startDate },
          endDate: { gte: endDate },
        },
      });

      if (!academicYear) {
        throw Errors.badRequest('No active Academic Year found for the requested dates.');
      }

      // Helper to check for leaves overlapping with AY
      const getOverlappingLeaveQuery = (statusFilter: LeaveStatus): Prisma.LeaveWhereInput => ({
        type: LeaveType.ANNUAL,
        status: statusFilter,
        OR: [
          { startDate: { gte: academicYear.startDate, lte: academicYear.endDate } },
          { endDate: { gte: academicYear.startDate, lte: academicYear.endDate } },
          { startDate: { lte: academicYear.startDate }, endDate: { gte: academicYear.endDate } },
        ],
      });

      // Calculate pending days from other requests overlapping with AY
      const pendingWhere = getOverlappingLeaveQuery(LeaveStatus.PENDING);
      if (staffId) pendingWhere.staffId = staffId;
      else if (teacherId) pendingWhere.teacherId = teacherId;
      if (excludeLeaveId) pendingWhere.id = { not: excludeLeaveId };

      const pendingAgg = await tx.leave.aggregate({
        _sum: { totalDays: true },
        where: pendingWhere,
      });
      const pendingDays = pendingAgg._sum.totalDays || 0;

      // Check against Balance
      const balance = await tx.leaveBalance.findUnique({
        where: {
          userId_academicYearId_leaveType: {
            userId,
            academicYearId: academicYear.id,
            leaveType: LeaveType.ANNUAL,
          },
        },
      });

      if (balance) {
        const effectiveRemaining = balance.remainingDays - pendingDays;
        if (effectiveRemaining < totalDays) {
          throw Errors.badRequest(
            `Insufficient annual leave balance. Remaining: ${effectiveRemaining} days (including pending requests).`
          );
        }
      } else {
        // Fallback: Calculate used days (Approved + Pending) overlapping this AY
        const usedWhere = getOverlappingLeaveQuery(LeaveStatus.APPROVED);
        if (staffId) usedWhere.staffId = staffId;
        else if (teacherId) usedWhere.teacherId = teacherId;
        if (excludeLeaveId) usedWhere.id = { not: excludeLeaveId };

        const usedAgg = await tx.leave.aggregate({
          _sum: { totalDays: true },
          where: usedWhere,
        });

        const usedDays = usedAgg._sum.totalDays || 0;
        const totalUsedAndPending = usedDays + pendingDays;
        const remaining = 12 - totalUsedAndPending; // Default 12 days

        if (remaining < totalDays) {
          throw Errors.badRequest(
            `Insufficient annual leave balance. Remaining: ${remaining} days (including pending requests).`
          );
        }
      }
    }
  }
}

export async function updateLeave(id: string, data: UpdateLeaveInput) {
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leave.findUnique({ where: { id } });
    if (!leave) throw Errors.notFound('Leave request not found');

    const updateData: Prisma.LeaveUpdateInput = {
      type: data.type,
      reason: data.reason,
    };

    let startDate = leave.startDate;
    let endDate = leave.endDate;
    let totalDays = leave.totalDays;
    let type = data.type || leave.type;

    // Recalculate dates if provided
    if (data.startDate || data.endDate) {
      startDate = data.startDate ? new Date(data.startDate) : leave.startDate;
      endDate = data.endDate ? new Date(data.endDate) : leave.endDate;
      totalDays = calculateTotalDays(startDate, endDate);

      updateData.startDate = startDate;
      updateData.endDate = endDate;
      updateData.totalDays = totalDays;
    }

    // Run validation if critical fields changed
    if (data.startDate || data.endDate || data.type) {
      await validateLeaveRequest(tx, {
        staffId: leave.staffId ?? undefined,
        teacherId: leave.teacherId ?? undefined,
        type: type as LeaveType,
        startDate,
        endDate,
        totalDays,
        excludeLeaveId: id,
      });
    }

    return tx.leave.update({ where: { id }, data: updateData });
  });
}

export async function approveLeave(id: string, approverId: string, data: ApproveLeaveInput) {
  const updateData: Prisma.LeaveUpdateInput = {
    status: data.status,
    approvedBy: { connect: { id: approverId } },
    approvedAt: new Date(),
  };

  if (data.status === LeaveStatus.REJECTED && data.rejectedNote) {
    updateData.rejectedNote = data.rejectedNote;
  }

  const leave = await prisma.leave.update({
    where: { id },
    data: updateData,
    include: { staff: true, teacher: true },
  });

  // If approved, mark staff/teacher attendance as LEAVE for those days
  if (data.status === LeaveStatus.APPROVED) {
    // 1. Update Leave Balance
    const userId = leave.staff?.userId || leave.teacher?.userId;
    if (userId) {
      // Find relevant academic year for the leave start date
      const academicYear = await prisma.academicYear.findFirst({
        where: {
          startDate: { lte: leave.startDate },
          endDate: { gte: leave.endDate },
        },
      });

      if (academicYear) {
        // Update balance if exists
        const balance = await prisma.leaveBalance.findUnique({
          where: {
            userId_academicYearId_leaveType: {
              userId,
              academicYearId: academicYear.id,
              leaveType: leave.type,
            },
          },
        });

        if (balance) {
          await prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
              usedDays: { increment: leave.totalDays },
              remainingDays: { decrement: leave.totalDays },
            },
          });
        }
      }
    }

    const startDate = new Date(leave.startDate);
    const endDate = new Date(leave.endDate);

    const dates: Date[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Determine target ID (staff or teacher)
    const staffId = leave.staffId;
    const teacherId = leave.teacherId;

    const transactionOperations = dates
      .map((date) => {
        // Construct upsert args carefully
        // Note: For upsert to work with @@unique([staffId, teacherId, date]),
        // we must explicitly set the other ID to null in the where clause
        // AND ensure the type safety for Prisma client

        if (staffId) {
          return prisma.staffAttendance.upsert({
            where: {
              staffId_teacherId_date: { staffId: staffId, teacherId: null, date } as any,
            },
            update: { status: StaffAttendanceStatus.LEAVE, notes: `Cuti: ${leave.type}` },
            create: {
              staffId: staffId,
              date,
              status: StaffAttendanceStatus.LEAVE,
              notes: `Cuti: ${leave.type}`,
            },
          });
        } else if (teacherId) {
          return prisma.staffAttendance.upsert({
            where: {
              staffId_teacherId_date: { staffId: null, teacherId: teacherId, date } as any,
            },
            update: { status: StaffAttendanceStatus.LEAVE, notes: `Cuti: ${leave.type}` },
            create: {
              teacherId: teacherId,
              date,
              status: StaffAttendanceStatus.LEAVE,
              notes: `Cuti: ${leave.type}`,
            },
          });
        }

        return null;
      })
      .filter((op): op is Prisma.Prisma__StaffAttendanceClient<any, never> => op !== null);

    await prisma.$transaction(transactionOperations);
  }

  return leave;
}

export async function cancelLeave(id: string) {
  return prisma.leave.update({
    where: { id },
    data: { status: LeaveStatus.CANCELLED },
  });
}

export async function deleteLeave(id: string) {
  const leave = await prisma.leave.findUnique({ where: { id } });
  if (leave?.status === LeaveStatus.APPROVED) {
    throw new Error('Cannot delete approved leave');
  }
  return prisma.leave.delete({ where: { id } });
}

export async function getLeaveBalance(employeeId: string, year: number) {
  // 1. Resolve User ID (accepts User ID, Staff ID, or Teacher ID)
  let userId: string | undefined;

  // Check if ID is directly a User ID
  const user = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });

  if (user) {
    userId = user.id;
  } else {
    // Check if ID is Staff ID
    const staff = await prisma.staff.findUnique({
      where: { id: employeeId },
      select: { userId: true },
    });
    if (staff) {
      userId = staff.userId;
    } else {
      // Check if ID is Teacher ID
      const teacher = await prisma.teacher.findUnique({
        where: { id: employeeId },
        select: { userId: true },
      });
      if (teacher) {
        userId = teacher.userId;
      }
    }
  }

  // 2. Find Academic Year for the given year (approximate or active)
  const targetDate = new Date(year, 0, 1);
  const academicYear = await prisma.academicYear.findFirst({
    where: {
      startDate: { lte: targetDate },
      endDate: { gte: targetDate },
    },
  });

  // 3. If User and Academic Year found, try to fetch LeaveBalance
  if (userId && academicYear) {
    const balances = await prisma.leaveBalance.findMany({
      where: {
        userId,
        academicYearId: academicYear.id,
      },
    });

    if (balances.length > 0) {
      const annualBalance = balances.find((b) => b.leaveType === LeaveType.ANNUAL);
      const usedByType: Record<string, number> = {};
      balances.forEach((b) => {
        usedByType[b.leaveType] = b.usedDays;
      });

      const annualQuota = annualBalance?.totalDays || 12;
      const usedAnnual = annualBalance?.usedDays || 0;
      const remainingAnnual = annualBalance?.remainingDays ?? annualQuota - usedAnnual;

      return {
        employeeId,
        year,
        annualQuota,
        usedAnnual,
        remainingAnnual,
        usedByType,
        totalUsed: balances.reduce((sum, b) => sum + b.usedDays, 0),
      };
    }
  }

  // Fallback: Check both staff and teacher
  const leaves = await prisma.leave.findMany({
    where: {
      OR: [{ staffId: employeeId }, { teacherId: employeeId }],
      status: LeaveStatus.APPROVED,
      startDate: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31),
      },
    },
  });

  const usedByType = leaves.reduce(
    (acc, leave) => {
      acc[leave.type] = (acc[leave.type] || 0) + leave.totalDays;
      return acc;
    },
    {} as Record<string, number>
  );

  // Default annual leave quota (can be configured per company policy)
  const annualQuota = 12;

  return {
    employeeId,
    year,
    annualQuota,
    usedAnnual: usedByType[LeaveType.ANNUAL] || 0,
    remainingAnnual: annualQuota - (usedByType[LeaveType.ANNUAL] || 0),
    usedByType,
    totalUsed: leaves.reduce((sum, leave) => sum + leave.totalDays, 0),
  };
}

// =====================================
// STAFF SERVICE (for HR listing)
// =====================================

export async function getStaffList(params: {
  page: number;
  limit: number;
  unitId?: string;
  department?: string;
  search?: string;
}) {
  const { page, limit, unitId, department, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.StaffWhereInput = {
    deletedAt: null,
  };

  if (unitId) where.unitId = unitId;
  if (department) where.department = department;

  if (search) {
    where.OR = [
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { nip: { contains: search, mode: 'insensitive' } },
      { position: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
        unit: { select: { id: true, name: true } },
      },
    }),
    prisma.staff.count({ where }),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getStaffById(id: string) {
  return prisma.staff.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
      unit: { select: { id: true, name: true } },
    },
  });
}
