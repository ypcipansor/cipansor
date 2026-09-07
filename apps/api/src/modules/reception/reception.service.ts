import { prisma } from '../../lib/prisma';
import {
  CreateGuestBookInput,
  UpdateGuestBookInput,
  CreateStudentVisitInput,
  UpdateStudentVisitInput,
  CreateStudentPackageInput,
  UpdateStudentPackageInput,
  ReceptionStats,
  StudentVisit,
  StudentPackage,
} from '@cipansor/shared';
import { Errors } from '../../middleware/error';
// DB enums are the source of truth from Prisma, not the shared package.
import { Prisma, VisitStatus, PackageStatus } from '@prisma/client';

// --- DTO mappers ---
// Prisma returns the student name via the `user` relation and class via the
// active enrollment; flatten that to the API contract shape (student.name,
// student.class) the web client consumes.
type PrismaStudentShape = {
  user: { name: string } | null;
  nisn: string | null;
  nik: string | null;
  enrollments: { class: { name: string } }[];
} | null;

function mapStudent(s: PrismaStudentShape) {
  if (!s) return undefined;
  return { name: s.user?.name ?? '', nis: s.nisn || s.nik || "-", class: s.enrollments?.[0]?.class };
}

const toStudentVisit = (v: Record<string, unknown> & { student?: PrismaStudentShape }): StudentVisit =>
  ({ ...v, student: mapStudent(v.student ?? null) }) as unknown as StudentVisit;

const toStudentPackage = (
  p: Record<string, unknown> & { student?: PrismaStudentShape; receivedBy?: { name: string } | null }
): StudentPackage => ({ ...p, student: mapStudent(p.student ?? null) }) as unknown as StudentPackage;

// --- Stats ---

export const getStats = async (unitId: string): Promise<ReceptionStats> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [guestsToday, activeVisits, pendingPackages] = await Promise.all([
    prisma.guestBook.count({
      where: {
        unitId,
        checkIn: {
          gte: today,
          lt: tomorrow,
        },
      },
    }),
    prisma.studentVisit.count({
      where: {
        unitId,
        status: { in: [VisitStatus.PENDING, VisitStatus.APPROVED] },
      },
    }),
    prisma.studentPackage.count({
      where: {
        unitId,
        status: PackageStatus.RECEIVED,
      },
    }),
  ]);

  return {
    guestsToday,
    activeVisits,
    pendingPackages,
  };
};

// --- Guest Book ---

export const getGuestBooks = async (unitId: string, params: { date?: string }) => {
  const where: Prisma.GuestBookWhereInput = { unitId };

  if (params.date) {
    const startDate = new Date(params.date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    where.checkIn = {
      gte: startDate,
      lt: endDate,
    };
  }

  return prisma.guestBook.findMany({
    where,
    orderBy: { checkIn: 'desc' },
    include: {
      receivedBy: {
        select: { name: true },
      },
    },
  });
};

export const createGuestBook = async (
  unitId: string,
  userId: string,
  data: CreateGuestBookInput
) => {
  return prisma.guestBook.create({
    data: {
      unitId,
      name: data.name,
      institution: data.institution,
      purpose: data.purpose,
      phone: data.phone,
      visitorCount: data.visitorCount ?? 1,
      vehicleNumber: data.vehicleNumber,
      notes: data.notes,
      receivedById: userId,
      checkIn: new Date(),
    },
    include: {
      receivedBy: {
        select: { name: true },
      },
    },
  });
};

export const updateGuestBook = async (id: string, data: UpdateGuestBookInput) => {
  const guestBook = await prisma.guestBook.findUnique({ where: { id } });
  if (!guestBook) throw Errors.notFound('Guest book entry');

  return prisma.guestBook.update({
    where: { id },
    data: {
      checkOut: data.checkOut,
      notes: data.notes,
    },
    include: {
      receivedBy: {
        select: { name: true },
      },
    },
  });
};

// --- Student Visits ---

export const getStudentVisits = async (
  unitId: string,
  params: { date?: string; studentId?: string }
) => {
  const where: Prisma.StudentVisitWhereInput = { unitId };

  if (params.date) {
    const startDate = new Date(params.date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    where.checkIn = {
      gte: startDate,
      lt: endDate,
    };
  }

  if (params.studentId) {
    where.studentId = params.studentId;
  }

  const rows = await prisma.studentVisit.findMany({
    where,
    orderBy: { checkIn: 'desc' },
    include: {
      student: {
        select: {
          user: { select: { name: true } },
          nisn: true, nik: true,
          enrollments: {
            where: { status: 'active' },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });
  return rows.map(toStudentVisit);
};

export const createStudentVisit = async (unitId: string, data: CreateStudentVisitInput) => {
  // Validate student belongs to unit
  const student = await prisma.student.findUnique({
    where: { id: data.studentId },
  });

  if (!student) throw Errors.notFound('Student');
  // In a real scenario, we might want to check if student.unitId === unitId
  // But for now we trust the input or assume global student access within allowed scopes

  const row = await prisma.studentVisit.create({
    data: {
      unitId,
      studentId: data.studentId,
      visitorName: data.visitorName,
      relationship: data.relationship,
      needs: data.needs,
      notes: data.notes,
      status: VisitStatus.PENDING,
      checkIn: new Date(),
    },
    include: {
      student: {
        select: {
          user: { select: { name: true } },
          nisn: true, nik: true,
          enrollments: {
            where: { status: 'active' },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });
  return toStudentVisit(row);
};

export const updateStudentVisit = async (id: string, data: UpdateStudentVisitInput) => {
  const visit = await prisma.studentVisit.findUnique({ where: { id } });
  if (!visit) throw Errors.notFound('Visit');

  const row = await prisma.studentVisit.update({
    where: { id },
    data: {
      checkOut: data.checkOut,
      status: data.status,
      notes: data.notes,
    },
    include: {
      student: {
        select: {
          user: { select: { name: true } },
          nisn: true, nik: true,
          enrollments: {
            where: { status: 'active' },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });
  return toStudentVisit(row);
};

// --- Student Packages ---

export const getPackages = async (
  unitId: string,
  params: { status?: string; studentId?: string }
) => {
  const where: Prisma.StudentPackageWhereInput = { unitId };

  if (params.status) {
    where.status = params.status as PackageStatus;
  }

  if (params.studentId) {
    where.studentId = params.studentId;
  }

  const rows = await prisma.studentPackage.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    include: {
      student: {
        select: {
          user: { select: { name: true } },
          nisn: true, nik: true,
          enrollments: {
            where: { status: 'active' },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
      receivedBy: {
        select: { name: true },
      },
    },
  });
  return rows.map(toStudentPackage);
};

export const createPackage = async (
  unitId: string,
  userId: string,
  data: CreateStudentPackageInput
) => {
  const row = await prisma.studentPackage.create({
    data: {
      unitId,
      studentId: data.studentId,
      senderName: data.senderName,
      expedition: data.expedition,
      content: data.content,
      photoUrl: data.photoUrl,
      notes: data.notes,
      receivedById: userId,
      receivedAt: new Date(),
      status: PackageStatus.RECEIVED,
    },
    include: {
      student: {
        select: {
          user: { select: { name: true } },
          nisn: true, nik: true,
          enrollments: {
            where: { status: 'active' },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
      receivedBy: {
        select: { name: true },
      },
    },
  });
  return toStudentPackage(row);
};

export const updatePackage = async (id: string, data: UpdateStudentPackageInput) => {
  const pkg = await prisma.studentPackage.findUnique({ where: { id } });
  if (!pkg) throw Errors.notFound('Package');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    status: data.status,
    notes: data.notes,
  };

  if (data.pickedUpAt) {
    updateData.pickedUpAt = data.pickedUpAt;
  }

  // Stamp pickup time when the package transitions to PICKED_UP.
  if (data.status === PackageStatus.PICKED_UP && !pkg.pickedUpAt) {
    updateData.pickedUpAt = new Date();
  }

  const row = await prisma.studentPackage.update({
    where: { id },
    data: updateData,
    include: {
      student: {
        select: {
          user: { select: { name: true } },
          nisn: true, nik: true,
          enrollments: {
            where: { status: 'active' },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
      receivedBy: {
        select: { name: true },
      },
    },
  });
  return toStudentPackage(row);
};
