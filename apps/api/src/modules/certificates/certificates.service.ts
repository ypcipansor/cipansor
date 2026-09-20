import { prisma } from '../../lib/prisma';
import { certificateVerificationUrl } from '../../utils/verification-url';
import type {
  CreateCertificateDto,
  QueryCertificateDto,
  UpdateCertificateDto,
} from './certificates.schema';

const studentInclude = {
  student: {
    include: {
      user: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true, type: true } },
      enrollments: {
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        include: { class: { select: { id: true, name: true } } },
      },
    },
  },
  createdBy: { select: { id: true, name: true } },
} as const;

/** The DigitalCertificate table has no generated QR; verification is keyed by number. */
function qrCode() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function certificateNumber(type: string) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `${type.slice(0, 3)}/${month}/${year}/${seq}`;
}

export async function createCertificate(data: CreateCertificateDto, createdById: string) {
  const number = certificateNumber(data.certificateType);
  return prisma.digitalCertificate.create({
    data: {
      studentId: data.studentId,
      certificateType: data.certificateType,
      title: data.title,
      description: data.description,
      certificateNumber: number,
      qrCode: qrCode(),
      verificationUrl: certificateVerificationUrl(number),
      grade: data.grade,
      rank: data.rank,
      issueDate: new Date(data.issueDate),
      signatoryName: data.signatoryName,
      signatoryTitle: data.signatoryTitle,
      signatureUrl: data.signatureUrl,
      isPublic: data.isPublic,
      createdById,
    },
    include: studentInclude,
  });
}

export async function getCertificates(query: QueryCertificateDto) {
  const { studentId, certificateType, search, page, limit } = query;
  const where = {
    ...(studentId && { studentId }),
    ...(certificateType && { certificateType }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { certificateNumber: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.digitalCertificate.findMany({
      where,
      include: studentInclude,
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.digitalCertificate.count({ where }),
  ]);

  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getCertificateById(id: string) {
  return prisma.digitalCertificate.findUnique({ where: { id }, include: studentInclude });
}

export async function updateCertificate(id: string, data: UpdateCertificateDto) {
  return prisma.digitalCertificate.update({
    where: { id },
    data: {
      ...data,
      ...(data.issueDate && { issueDate: new Date(data.issueDate) }),
    },
    include: studentInclude,
  });
}

export async function deleteCertificate(id: string) {
  return prisma.digitalCertificate.delete({ where: { id } });
}

export async function getStudentCertificates(studentId: string) {
  const [data, total] = await Promise.all([
    prisma.digitalCertificate.findMany({
      where: { studentId },
      include: studentInclude,
      orderBy: { issueDate: 'desc' },
    }),
    prisma.digitalCertificate.count({ where: { studentId } }),
  ]);
  return { data, meta: { page: 1, limit: total, total, totalPages: 1 } };
}

/** Public verification: the code is the certificate number, not the QR blob. */
export async function verifyCertificate(code: string) {
  const certificate = await prisma.digitalCertificate.findFirst({
    where: { certificateNumber: code },
    include: studentInclude,
  });
  return { valid: !!certificate, certificate };
}

export async function incrementDownloadCount(id: string) {
  return prisma.digitalCertificate.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });
}