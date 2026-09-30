import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { certificateVerificationUrl } from '../../utils/verification-url';
import { assertStudentInScope, studentScope } from '../../utils/student-scope';
import { generateCertificatePdfBuffer } from '../../utils/generate-certificate-pdf';
import { Errors } from '../../middleware/error';
import type {
  CreateCertificateDto,
  QueryCertificateDto,
  UpdateCertificateDto,
} from './certificates.schema';

/**
 * Who is asking, as the verified token carries it. Certificate reads and writes
 * are scoped by the santri a certificate belongs to — `studentScope` already
 * encodes one rule for every role (a santri sees their own, a wali their
 * children, staff their unit, the yayasan board and cross-unit staff every
 * unit). See `utils/student-scope.ts`.
 */
export interface CertificateActor {
  sub: string;
  roleCode?: string | null;
  unitId?: string | null;
}

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

/**
 * The DigitalCertificate table has no generated QR; verification is keyed by
 * number. The blob itself must still be unguessable — it is printed on every
 * certificate — so it comes from the CSPRNG, not `Math.random`.
 */
function qrCode() {
  return crypto.randomUUID();
}

function certificateNumber(type: string) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  // The number is the public verification key, so a guessable four-digit
  // sequence would let anyone enumerate other students' certificates.
  const seq = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `${type.slice(0, 3).toUpperCase()}/${month}/${year}/${seq}`;
}

export async function createCertificate(
  data: CreateCertificateDto,
  createdById: string,
  actor: CertificateActor
) {
  // A certificate is written to a santri, so the writer must be able to reach
  // that santri — a teacher cannot issue a certificate for another unit's
  // santri by naming their id.
  await assertStudentInScope(data.studentId, actor);

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

export async function getCertificates(query: QueryCertificateDto, actor: CertificateActor) {
  const { studentId, certificateType, search, page, limit } = query;
  const scope = studentScope(actor);
  const where = {
    // Row-level scope: only certificates for santri this account may see.
    student: scope,
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

export async function getCertificateById(id: string, actor: CertificateActor) {
  return prisma.digitalCertificate.findFirst({
    where: { AND: [{ id }, { student: studentScope(actor) }] },
    include: studentInclude,
  });
}

export async function updateCertificate(
  id: string,
  data: UpdateCertificateDto,
  actor: CertificateActor
) {
  // 404 (not 403) for a certificate outside the caller's reach, so an id
  // guessed from another unit says nothing about that unit.
  const existing = await getCertificateById(id, actor);
  if (!existing) throw Errors.notFound('Certificate');

  return prisma.digitalCertificate.update({
    where: { id },
    data: {
      ...data,
      ...(data.issueDate && { issueDate: new Date(data.issueDate) }),
    },
    include: studentInclude,
  });
}

export async function deleteCertificate(id: string, actor: CertificateActor) {
  const existing = await getCertificateById(id, actor);
  if (!existing) throw Errors.notFound('Certificate');
  return prisma.digitalCertificate.delete({ where: { id } });
}

export async function getStudentCertificates(studentId: string, actor: CertificateActor) {
  await assertStudentInScope(studentId, actor);

  const where = { studentId, student: studentScope(actor) };
  const [data, total] = await Promise.all([
    prisma.digitalCertificate.findMany({
      where,
      include: studentInclude,
      orderBy: { issueDate: 'desc' },
    }),
    prisma.digitalCertificate.count({ where }),
  ]);
  return { data, meta: { page: 1, limit: total, total, totalPages: 1 } };
}

/**
 * Public verification: the code is the certificate number, not the QR blob.
 *
 * Only a certificate its issuer marked `isPublic` may be read here — the route
 * is reachable with no session, so anyone holding a number would otherwise
 * receive the holder's name, unit, class and grades. A private certificate
 * answers `valid: false`, exactly as an unknown number does, so the endpoint
 * cannot be used to confirm that a private certificate exists.
 */
export async function verifyCertificate(code: string) {
  const certificate = await prisma.digitalCertificate.findFirst({
    where: { certificateNumber: code, isPublic: true },
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

/**
 * Render the certificate to a PDF and store it under `public/uploads`, so the
 * detail page's Download button (and the printed verification QR) have a file.
 *
 * The bytes are produced from the row, never accepted from the client; the
 * stored path is relative to the API origin so the same value works in every
 * environment.
 */
export async function renderCertificatePdf(id: string, actor: CertificateActor) {
  const certificate = await getCertificateById(id, actor);
  if (!certificate) throw Errors.notFound('Certificate');

  const buffer = await generateCertificatePdfBuffer(certificate);
  const filename = `certificate-${certificate.id}.pdf`;
  const dir = path.join(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);

  const updated = await prisma.digitalCertificate.update({
    where: { id },
    data: { pdfUrl: `/uploads/${filename}` },
    include: studentInclude,
  });
  return { certificate: updated, buffer };
}

/** Generate (or regenerate) the stored PDF and return the row. */
export async function generateCertificatePdf(id: string, actor: CertificateActor) {
  const { certificate } = await renderCertificatePdf(id, actor);
  return certificate;
}
