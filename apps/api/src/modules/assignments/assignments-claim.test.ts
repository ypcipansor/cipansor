import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignmentsService } from './assignments.service';
import { prisma } from '../../lib/prisma';

/**
 * `Assignment.attachments`, `AssignmentSubmission.attachments` are lists of
 * client-supplied blob URLs, so every writer takes the claim protocol (BUG 4 /
 * flag 9). The scanner used to miss these because the value was wrapped in a
 * `attachments ? (attachments as any) : Prisma.JsonNull` conditional; a save
 * that loses the claim race must abort before the row references the blob.
 */
vi.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    assignment: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    assignmentSubmission: { upsert: vi.fn() },
  },
}));

vi.mock('../../utils/blob-claim', () => ({
  claimBlobsForRecord: vi.fn(),
  releaseBlobClaims: vi.fn().mockResolvedValue(undefined),
}));

import { claimBlobsForRecord, releaseBlobClaims } from '../../utils/blob-claim';

const A = '/uploads/tugas.pdf';
const tx = { assignment: { create: vi.fn(), update: vi.fn() }, assignmentSubmission: { upsert: vi.fn() } };
const handles = [{ id: 'h1', operationToken: 't1', kind: 'RECORD' }];

const service = new AssignmentsService();

describe('AssignmentsService claim protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
    tx.assignment.create.mockResolvedValue({ id: 'as1' });
    tx.assignment.update.mockResolvedValue({ id: 'as1' });
    tx.assignmentSubmission.upsert.mockResolvedValue({ id: 'sub1' });
    (prisma.assignment.findUnique as any).mockResolvedValue({
      id: 'as1',
      dueDate: new Date(Date.now() + 86400000),
    });
  });

  it('claims assignment attachments before create and releases inside the tx', async () => {
    (claimBlobsForRecord as any).mockResolvedValue(handles);

    await service.create({
      unitId: 'unit-1',
      academicYearId: 'ay-1',
      teacherId: 'teacher-1',
      subjectId: 's-1',
      classId: 'c-1',
      title: 'Tugas',
      description: 'deskripsi',
      type: 'INDIVIDUAL',
      dueDate: new Date().toISOString(),
      attachments: [A],
    } as any);

    expect(claimBlobsForRecord).toHaveBeenCalledWith([A], 'teacher-1', tx);
    expect((claimBlobsForRecord as any).mock.invocationCallOrder[0]).toBeLessThan(
      tx.assignment.create.mock.invocationCallOrder[0]
    );
    expect(releaseBlobClaims).toHaveBeenCalledWith(handles, tx);
  });

  it('aborts assignment create when an attachment is contended', async () => {
    (claimBlobsForRecord as any).mockResolvedValue(null);

    await expect(
      service.create({
        unitId: 'unit-1',
        academicYearId: 'ay-1',
        teacherId: 'teacher-1',
        subjectId: 's-1',
        classId: 'c-1',
        title: 'Tugas',
        type: 'INDIVIDUAL',
        dueDate: new Date().toISOString(),
        attachments: [A],
      } as any)
    ).rejects.toThrow(/sedang diproses/);
    expect(tx.assignment.create).not.toHaveBeenCalled();
  });

  it('claims submission attachments before the upsert and releases inside the tx', async () => {
    (claimBlobsForRecord as any).mockResolvedValue(handles);

    await service.submit('as1', { studentId: 'student-1', content: 'x', attachments: [A] } as any);

    expect(claimBlobsForRecord).toHaveBeenCalledWith([A], 'student-1', tx);
    expect(releaseBlobClaims).toHaveBeenCalledWith(handles, tx);
  });

  it('aborts submission when an attachment is contended', async () => {
    (claimBlobsForRecord as any).mockResolvedValue(null);

    await expect(
      service.submit('as1', { studentId: 'student-1', content: 'x', attachments: [A] } as any)
    ).rejects.toThrow(/sedang diproses/);
    expect(tx.assignmentSubmission.upsert).not.toHaveBeenCalled();
  });
});
