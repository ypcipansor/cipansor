import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../middleware/error';
import { claimBlobsForRecord, releaseBlobClaims } from '../../utils/blob-claim';
import { extractBlobUrlsFromAttachmentValue } from '../../utils/blob-attachments';
import {
  CreateAssignmentRequest,
  UpdateAssignmentRequest,
  SubmitAssignmentRequest,
  GradeSubmissionRequest,
  Assignment,
  AssignmentSubmission,
  AssignmentType,
  SubmissionStatus,
} from '@cipansor/shared';

export class AssignmentsService {
  /**
   * Create an assignment
   */
  async create(input: CreateAssignmentRequest) {
    const {
      unitId,
      academicYearId,
      teacherId,
      subjectId,
      classId,
      title,
      description,
      type,
      dueDate,
      attachments,
    } = input;

    const assignment = await prisma.$transaction(async (tx) => {
      // Attachments may be upload references; claim them before the row points
      // at them so a concurrent discard cannot delete a just-uploaded file
      // between its reference probe and this insert (BUG 4 / flag 9).
      const claims = await claimBlobsForRecord(
        extractBlobUrlsFromAttachmentValue(attachments),
        teacherId,
        tx
      );
      if (!claims) {
        throw Errors.conflict('Lampiran tugas sedang diproses pihak lain; unggah ulang berkas tersebut');
      }

      const created = await tx.assignment.create({
        data: {
          unitId,
          academicYearId,
          teacherId,
          subjectId,
          classId,
          title,
          description,
          type: type as any,
          dueDate: new Date(dueDate),
          attachments: attachments ? (attachments as any) : Prisma.JsonNull,
        },
        include: {
          subject: { select: { name: true, code: true } },
          class: { select: { name: true } },
          teacher: { include: { user: { select: { name: true } } } },
        },
      });

      await releaseBlobClaims(claims, tx);
      return created;
    });

    return assignment;
  }

  /**
   * Find assignments with filters
   */
  async findAll(query: {
    unitId?: string;
    academicYearId?: string;
    teacherId?: string;
    classId?: string;
    subjectId?: string;
    studentId?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      unitId,
      academicYearId,
      teacherId,
      classId,
      subjectId,
      studentId,
      page = 1,
      limit = 10,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AssignmentWhereInput = {};
    if (unitId) where.unitId = unitId;
    if (academicYearId) where.academicYearId = academicYearId;
    if (teacherId) where.teacherId = teacherId;
    if (classId) where.classId = classId;
    if (subjectId) where.subjectId = subjectId;

    if (studentId) {
      const enrollments = await prisma.classEnrollment.findMany({
        where: { studentId, status: 'active' },
        select: { classId: true },
      });
      const classIds = enrollments.map((e) => e.classId);

      if (!where.classId) {
        where.classId = { in: classIds };
      }
    }

    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: {
          subject: { select: { name: true, code: true } },
          class: { select: { name: true } },
          teacher: { include: { user: { select: { name: true } } } },
          ...(studentId
            ? {
                submissions: {
                  where: { studentId },
                  take: 1,
                },
              }
            : {}),
        },
      }),
      prisma.assignment.count({ where }),
    ]);

    const data = assignments.map((a) => ({
      ...a,
      submission: studentId && a.submissions?.[0] ? a.submissions[0] : null,
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one assignment
   */
  async findOne(id: string) {
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true } },
        teacher: { include: { user: { select: { name: true } } } },
      },
    });

    if (!assignment) throw Errors.notFound('Assignment');
    return assignment;
  }

  /**
   * Update assignment
   */
  async update(id: string, input: UpdateAssignmentRequest) {
    const { title, description, type, dueDate, attachments } = input;

    await this.findOne(id);

    const updated = await prisma.$transaction(async (tx) => {
      // Replacement attachments introduce new blob references; claim them before
      // the update commits (flag 9).
      const claims = await claimBlobsForRecord(
        extractBlobUrlsFromAttachmentValue(attachments),
        'assignments',
        tx
      );
      if (!claims) {
        throw Errors.conflict('Lampiran tugas sedang diproses pihak lain; unggah ulang berkas tersebut');
      }

      const row = await tx.assignment.update({
        where: { id },
        data: {
          ...(title && { title }),
          ...(description !== undefined && { description }),
          ...(type && { type: type as any }),
          ...(dueDate && { dueDate: new Date(dueDate) }),
          ...(attachments && { attachments: attachments as any }),
        },
      });

      await releaseBlobClaims(claims, tx);
      return row;
    });
    return updated;
  }

  /**
   * Delete assignment
   */
  async delete(id: string) {
    await this.findOne(id);
    await prisma.assignment.delete({ where: { id } });
    return { message: 'Assignment deleted' };
  }

  /**
   * Submit assignment
   */
  async submit(assignmentId: string, input: SubmitAssignmentRequest) {
    const { studentId, content, attachments } = input;

    const assignment = await this.findOne(assignmentId);

    const now = new Date();
    const isLate = now > new Date(assignment.dueDate);
    const status = isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED;

    const submission = await prisma.$transaction(async (tx) => {
      // A student submission's attachments are upload references too; claim them
      // before either the upsert-create or the upsert-update can commit a row
      // that points at a blob a discard may already own (BUG 4 / flag 9).
      const claims = await claimBlobsForRecord(
        extractBlobUrlsFromAttachmentValue(attachments),
        studentId,
        tx
      );
      if (!claims) {
        throw Errors.conflict('Lampiran pengumpulan sedang diproses pihak lain; unggah ulang berkas tersebut');
      }

      const row = await tx.assignmentSubmission.upsert({
        where: {
          assignmentId_studentId: {
            assignmentId,
            studentId,
          },
        },
        create: {
          assignmentId,
          studentId,
          content,
          attachments: attachments ? (attachments as any) : Prisma.JsonNull,
          status: status as any,
          submittedAt: now,
        },
        update: {
          content,
          attachments: attachments ? (attachments as any) : Prisma.JsonNull,
          status: status as any,
          submittedAt: now,
        },
      });

      await releaseBlobClaims(claims, tx);
      return row;
    });

    return submission;
  }

  /**
   * Grade submission
   */
  async grade(assignmentId: string, studentId: string, input: GradeSubmissionRequest) {
    const { grade, feedback } = input;

    const submission = await prisma.assignmentSubmission.update({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId,
        },
      },
      data: {
        grade,
        feedback,
        status: SubmissionStatus.GRADED as any,
      },
    });

    return submission;
  }

  /**
   * Get submissions for an assignment
   */
  async getSubmissions(assignmentId: string) {
    const submissions = await prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      include: {
        student: {
          select: {
            id: true,
            nis: true,
            photoUrl: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return submissions.map((s) => ({
      ...s,
      student: {
        id: s.student.id,
        nis: s.student.nis,
        name: s.student.user.name,
        photoUrl: s.student.photoUrl,
      },
    }));
  }
}

export const assignmentsService = new AssignmentsService();
