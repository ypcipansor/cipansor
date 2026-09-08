import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CorrespondenceService } from '../correspondence.service';
import { prisma } from '@/lib/prisma';
import { LETTER_PDF_RELATIONS } from '@/utils/generate-letter-pdf';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    agendaNumber: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    letter: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    letterReviewer: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    letterRecipient: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    letterAttachment: {
      createMany: vi.fn(),
    },
    letterDispatch: {
      create: vi.fn(),
    },
    disposition: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    academicYear: {
      findFirst: vi.fn(),
    },
    // Append-only history; the transaction handle is this same mocked client.
    letterFlowEvent: {
      create: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('CorrespondenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateNumber', () => {
    it('should generate a formatted number', async () => {
      vi.mocked(prisma.agendaNumber.findUnique).mockResolvedValue({
        id: 'agenda-1',
        unitId: 'unit-1',
        academicYearId: 'year-1',
        type: 'OUTGOING',
        lastNumber: 10,
        format: '[NO]/[TYPE]/[ROMAN]/[YEAR]',
      } as any);

      vi.mocked(prisma.agendaNumber.update).mockResolvedValue({
        lastNumber: 11,
      } as any);

      const result = await CorrespondenceService.generateNumber('unit-1', 'OUTGOING', 'year-1');

      const date = new Date();
      const year = date.getFullYear().toString();
      // We accept any roman month in the test string to avoid flaky tests based on current month
      expect(result).toMatch(new RegExp(`011/OUTGOING/[IVX]+/${year}`));
    });

    it('should create new agenda config if not exists', async () => {
      vi.mocked(prisma.agendaNumber.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.agendaNumber.create).mockResolvedValue({
        id: 'agenda-new',
        lastNumber: 0,
        format: '[NO]/[TYPE]/[ROMAN]/[YEAR]',
      } as any);
      vi.mocked(prisma.agendaNumber.update).mockResolvedValue({
        lastNumber: 1,
      } as any);

      await CorrespondenceService.generateNumber('unit-1', 'OUTGOING', 'year-1');

      expect(prisma.agendaNumber.create).toHaveBeenCalled();
    });
  });

  describe('processReview', () => {
    // Review is tiered now: the service reads the whole ladder and refuses an
    // out-of-turn approval, so the mock provides the letter with its reviewers
    // rather than a single row fetched by (letterId, reviewerId) — the lookup
    // this method no longer does. See letter-workflow.test.ts for the rule
    // itself; these check it is wired into the service.
    it('approves a first-rung paraf and advances toward the signer', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        status: 'PENDING_REVIEW',
        createdById: 'creator-1',
        reviewers: [
          { id: 'review-1', reviewerId: 'user-1', order: 1, status: 'PENDING', isSigner: false },
          { id: 'review-2', reviewerId: 'signer', order: 2, status: 'PENDING', isSigner: true },
        ],
      } as any);

      const result = await CorrespondenceService.processReview('letter-1', 'user-1', 'APPROVE');

      expect(result.success).toBe(true);
      expect(prisma.letterReviewer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'review-1' },
          data: expect.objectContaining({ status: 'APPROVED' }),
        })
      );
      // Not signed — a rung remains above this one.
      expect(prisma.letter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'letter-1' },
          data: { status: 'READY_TO_SIGN' },
        })
      );
    });

    it('advances status to READY_TO_SIGN when the signer approves last in processReview', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        status: 'READY_TO_SIGN',
        createdById: 'creator-1',
        // The rung below has already parafed, so it is the signer's turn.
        reviewers: [
          { id: 'review-1', reviewerId: 'user-1', order: 1, status: 'APPROVED', isSigner: false },
          { id: 'review-2', reviewerId: 'signer', order: 2, status: 'PENDING', isSigner: true },
        ],
        unitId: 'unit-1',
        subject: 'Test',
        letterNumber: '1',
      } as any);

      await CorrespondenceService.processReview('letter-1', 'signer', 'APPROVE');

      expect(prisma.letter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'letter-1' },
          data: { status: 'READY_TO_SIGN' },
        })
      );
    });

    it('refuses to let the signer sign ahead of the rung below', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        status: 'PENDING_REVIEW',
        createdById: 'creator-1',
        reviewers: [
          { id: 'review-1', reviewerId: 'user-1', order: 1, status: 'PENDING', isSigner: false },
          { id: 'review-2', reviewerId: 'signer', order: 2, status: 'PENDING', isSigner: true },
        ],
      } as any);

      await expect(
        CorrespondenceService.processReview('letter-1', 'signer', 'APPROVE')
      ).rejects.toThrow(/Belum giliran/);
      expect(prisma.letter.update).not.toHaveBeenCalled();
    });

    it('preserves signer flag when an existing signer approves with isFinalSigner=true without nextReviewerId', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        status: 'PENDING_REVIEW',
        createdById: 'creator-1',
        reviewers: [
          { id: 'review-1', reviewerId: 'signer-1', order: 1, status: 'PENDING', isSigner: true },
        ],
      } as any);

      await CorrespondenceService.processReview('letter-1', 'signer-1', 'APPROVE', undefined, undefined, true);

      expect(prisma.letterReviewer.updateMany).toHaveBeenCalledWith({
        where: { letterId: 'letter-1' },
        data: { isSigner: false },
      });
      expect(prisma.letterReviewer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'review-1' },
          data: expect.objectContaining({ isSigner: true }),
        })
      );
      expect(prisma.letter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'letter-1' },
          data: { status: 'READY_TO_SIGN' },
        })
      );
    });

    it('rejects forwarding to nextReviewerId outside caller unit scope', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        status: 'PENDING_REVIEW',
        createdById: 'creator-1',
        reviewers: [
          { id: 'review-1', reviewerId: 'user-1', order: 1, status: 'PENDING', isSigner: false },
        ],
      } as any);

      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'other-unit-user',
          unitId: 'unit-2',
          teacher: { nip: '999' },
          staff: null,
          userRoles: [{ role: { code: 'SMPIT_GURU' } }],
        },
      ] as any);

      await expect(
        CorrespondenceService.processReview(
          'letter-1',
          'user-1',
          'APPROVE',
          'Teruskan',
          'other-unit-user',
          false,
          { id: 'user-1', roleCode: 'SDIT_GURU', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/berada di luar unit Anda/);
    });
  });

  describe('submitForReview', () => {
    it('submits a DRAFT letter into review when reviewers exist', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'rev-user-1',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '123' },
          userRoles: [{ role: { code: 'SDIT_GURU' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'let-draft',
        status: 'DRAFT',
        createdById: 'creator-1',
        reviewers: [{ id: 'rev-1', reviewerId: 'rev-user-1', order: 1, status: 'PENDING' }],
        subject: 'Draft Test',
      } as any);
      vi.mocked(prisma.letter.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.letter.update).mockResolvedValue({ id: 'let-draft', status: 'PENDING_REVIEW' } as any);

      const result = await CorrespondenceService.submitForReview(
        'let-draft',
        { id: 'creator-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' } as any,
        'Mengajukan review'
      );

      expect(result.status).toBe('PENDING_REVIEW');
      expect(prisma.letter.updateMany).toHaveBeenCalledWith({
        where: { id: 'let-draft', status: 'DRAFT' },
        data: { status: 'PENDING_REVIEW' },
      });
    });

    it('allows assigning reviewerIds during submitForReview for a draft without reviewers', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'let-no-rev-yet',
        status: 'DRAFT',
        createdById: 'creator-1',
        direction: 'OUTGOING',
        type: 'SURAT_DINAS',
        unitId: 'unit-1',
        letterNumber: null,
        reviewers: [],
        subject: 'Draft No Rev Test',
      } as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'rev-assigned-1',
          unitId: 'unit-1',
          teacher: { nip: '123' },
          staff: null,
          userRoles: [{ role: { code: 'SDIT_GURU' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.letter.update).mockResolvedValue({ id: 'let-no-rev-yet', status: 'PENDING_REVIEW' } as any);

      const result = await CorrespondenceService.submitForReview(
        'let-no-rev-yet',
        { id: 'creator-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' } as any,
        'Submitting with new reviewers',
        ['rev-assigned-1']
      );

      expect(result.status).toBe('PENDING_REVIEW');
      expect(prisma.letterReviewer.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            letterId: 'let-no-rev-yet',
            reviewerId: 'rev-assigned-1',
            order: 1,
          }),
        ],
      });
    });

    it('prevents repeated submitForReview calls from processing or allocating numbers twice', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'let-already-sub',
        status: 'DRAFT',
        createdById: 'creator-1',
        direction: 'OUTGOING',
        type: 'SURAT_DINAS',
        unitId: 'unit-1',
        letterNumber: null,
        reviewers: [{ id: 'r1', reviewerId: 'rev-1', order: 1, status: 'PENDING' }],
        subject: 'Draft Concurrent Test',
      } as any);
      vi.mocked(prisma.letter.updateMany).mockResolvedValue({ count: 0 });

      await expect(
        CorrespondenceService.submitForReview(
          'let-already-sub',
          { id: 'creator-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/Surat sudah diajukan/);

      expect(prisma.agendaNumber.update).not.toHaveBeenCalled();
    });

    it('rejects submission if actor is not the letter creator', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'let-draft',
        unitId: 'unit-1',
        createdById: 'creator-1',
        status: 'DRAFT',
        direction: 'OUTGOING',
        reviewers: [{ id: 'rev-1', reviewerId: 'rev-user-1', order: 1, status: 'PENDING' }],
        recipients: [],
        dispositions: [],
      } as any);

      await expect(
        CorrespondenceService.submitForReview(
          'let-draft',
          { id: 'other-user', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/Hanya pembuat surat/);
    });

    it('rejects submission if letter is not in DRAFT status', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'let-submitted',
        status: 'PENDING_REVIEW',
        createdById: 'creator-1',
        reviewers: [{ id: 'rev-1', reviewerId: 'rev-user-1', order: 1, status: 'PENDING' }],
      } as any);

      await expect(
        CorrespondenceService.submitForReview(
          'let-submitted',
          { id: 'creator-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/Hanya surat berstatus DRAFT/);
    });

    it('rejects submission if no reviewers are assigned', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'let-no-rev',
        status: 'DRAFT',
        createdById: 'creator-1',
        reviewers: [],
      } as any);

      await expect(
        CorrespondenceService.submitForReview(
          'let-no-rev',
          { id: 'creator-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/minimal satu pemeriksa/);
    });

    it('generates letterNumber for outgoing letters upon submitForReview if missing', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'rev-user-1',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '123' },
          userRoles: [{ role: { code: 'SDIT_GURU' } }],
        },
        {
          id: 'rev-user-2',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '124' },
          userRoles: [{ role: { code: 'SDIT_GURU' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'let-draft-out',
        status: 'DRAFT',
        createdById: 'creator-1',
        direction: 'OUTGOING',
        type: 'SURAT_DINAS',
        unitId: 'unit-1',
        letterNumber: null,
        reviewers: [
          { id: 'rev-2', reviewerId: 'rev-user-2', order: 2, status: 'PENDING' },
          { id: 'rev-1', reviewerId: 'rev-user-1', order: 1, status: 'PENDING' },
        ],
        subject: 'Outgoing Draft Test',
      } as any);
      vi.mocked(prisma.letter.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.academicYear.findFirst).mockResolvedValue({ id: 'year-1', isActive: true } as any);
      vi.mocked(prisma.agendaNumber.findUnique).mockResolvedValue({
        id: 'agenda-1',
        unitId: 'unit-1',
        academicYearId: 'year-1',
        type: 'SKET',
        lastNumber: 5,
        format: '[NO]/Sket/Y-CPS/[ROMAN]/[YEAR]',
      } as any);
      vi.mocked(prisma.agendaNumber.update).mockResolvedValue({ lastNumber: 6 } as any);
      vi.mocked(prisma.letter.update).mockResolvedValue({ id: 'let-draft-out', status: 'PENDING_REVIEW' } as any);

      const result = await CorrespondenceService.submitForReview(
        'let-draft-out',
        { id: 'creator-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' } as any,
        'Submit for review'
      );

      expect(result.status).toBe('PENDING_REVIEW');
      expect(prisma.letter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'let-draft-out' },
          data: expect.objectContaining({
            letterNumber: expect.stringMatching(/006\/Sket\/Y-CPS/),
          }),
        })
      );
    });
  });

  describe('Resubmit and archive', () => {
    const accessRow = (over: Record<string, unknown>) => ({
      id: 'letter-1',
      unitId: 'unit-1',
      createdById: 'creator-1',
      status: 'DRAFT',
      direction: 'OUTGOING',
      reviewers: [],
      recipients: [],
      dispositions: [],
      ...over,
    });
    const admin = { id: 'creator-1', roleCode: 'SUPER_ADMIN', unitId: null };

    it('clears every paraf when a returned draft is resubmitted', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        accessRow({
          status: 'REVISION_NEEDED',
          reviewers: [
            { id: 'r1', reviewerId: 'sekretaris', order: 1, status: 'APPROVED', isSigner: false },
            { id: 'r2', reviewerId: 'ketua', order: 2, status: 'PENDING', isSigner: true },
          ],
        }) as any
      );
      vi.mocked(prisma.letterReviewer.updateMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.letter.update).mockResolvedValue({} as any);

      const result = await CorrespondenceService.resubmitLetter('letter-1', admin as any);

      expect(prisma.letterReviewer.updateMany).toHaveBeenCalledWith({
        where: { letterId: 'letter-1' },
        data: { status: 'PENDING', reviewedAt: null },
      });
      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('archives a disposed letter and closes open dispositions', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        accessRow({ status: 'DISPOSED', direction: 'INCOMING' }) as any
      );
      vi.mocked(prisma.disposition.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.letter.update).mockResolvedValue({} as any);

      const result = await CorrespondenceService.archiveLetter('letter-1', admin as any);

      expect(prisma.disposition.updateMany).toHaveBeenCalledWith({
        where: { letterId: 'letter-1', status: { not: 'COMPLETED' } },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
      expect(result.status).toBe('ARCHIVED');
    });
  });

  describe('createLetter Unit Authorization & Incoming Lifecycle', () => {
    it('executes number generation within transaction scope so failure rolls back counter increment', async () => {
      vi.mocked(prisma.academicYear.findFirst).mockResolvedValue({ id: 'year-1', isActive: true } as any);
      vi.mocked(prisma.agendaNumber.findUnique).mockResolvedValue({
        id: 'ag-1',
        lastNumber: 1,
        format: '[NO]/INC/[YEAR]',
      } as any);
      vi.mocked(prisma.agendaNumber.update).mockResolvedValue({ lastNumber: 2 } as any);
      vi.mocked(prisma.letter.create).mockRejectedValue(new Error('DB write error'));

      await expect(
        CorrespondenceService.createLetter(
          {
            unitId: 'unit-1',
            direction: 'INCOMING' as any,
            subject: 'Rollback test',
            date: '2026-08-01',
            urgency: 'NORMAL' as any,
            nature: 'PUBLIC' as any,
            status: 'PENDING_REVIEW' as any,
          },
          'user-1',
          { id: 'user-1', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow('DB write error');

      expect(prisma.agendaNumber.update).toHaveBeenCalled();
    });

    it('creates letter for authorized unit', async () => {
      vi.mocked(prisma.letter.create).mockResolvedValue({ id: 'let-1', status: 'DRAFT', unitId: 'unit-1' } as any);

      const result = await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'OUTGOING' as any,
          subject: 'Testing',
          date: '2026-08-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
        },
        'user-1',
        { id: 'user-1', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' } as any
      );

      expect(result.id).toBe('let-1');
    });

    it('deduplicates reviewerIds when creating a letter', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'user-rev-1',
          unitId: 'unit-1',
          teacher: { nip: '111' },
          staff: null,
          userRoles: [{ role: { code: 'SDIT_GURU' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.create).mockResolvedValue({ id: 'let-dup-rev', status: 'DRAFT', unitId: 'unit-1' } as any);

      await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'OUTGOING' as any,
          subject: 'Testing Dup Reviewers',
          date: '2026-08-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
          reviewerIds: ['user-rev-1', 'user-rev-1'],
        },
        'user-1',
        { id: 'user-1', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' } as any
      );

      expect(prisma.letterReviewer.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            letterId: 'let-dup-rev',
            reviewerId: 'user-rev-1',
            order: 1,
          }),
        ],
      });
    });

    it('rejects letter creation for non-bypass roles when actor.unitId is null', async () => {
      await expect(
        CorrespondenceService.createLetter(
          {
            unitId: 'unit-1',
            direction: 'OUTGOING' as any,
            subject: 'Testing Null Unit Actor',
            date: '2026-08-01',
            urgency: 'NORMAL' as any,
            nature: 'PUBLIC' as any,
            status: 'DRAFT' as any,
          },
          'user-no-unit',
          { id: 'user-no-unit', roleCode: 'SDIT_TATA_USAHA', unitId: null } as any
        )
      ).rejects.toThrow(/tidak terhubung dengan unit kerja yang valid/);
    });

    it('rejects creation of OUTGOING letter in PENDING_REVIEW status without reviewerIds', async () => {
      await expect(
        CorrespondenceService.createLetter(
          {
            unitId: 'unit-1',
            direction: 'OUTGOING' as any,
            subject: 'Outgoing No Reviewers Test',
            date: '2026-08-01',
            urgency: 'NORMAL' as any,
            nature: 'PUBLIC' as any,
            status: 'PENDING_REVIEW' as any,
            reviewerIds: [],
          },
          'user-1',
          { id: 'user-1', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/wajib memilih minimal satu pemeriksa/);
    });

    it('rejects creation for unauthorized unit', async () => {
      await expect(
        CorrespondenceService.createLetter(
          {
            unitId: 'unit-2',
            direction: 'OUTGOING' as any,
            subject: 'Testing',
            date: '2026-08-01',
            urgency: 'NORMAL' as any,
            nature: 'PUBLIC' as any,
            status: 'DRAFT' as any,
          },
          'user-1',
          { id: 'user-1', roleCode: 'SDIT_ADMIN', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/tidak berwenang/);
    });

    it('rejects letter creation for student and parent roles', async () => {
      await expect(
        CorrespondenceService.createLetter(
          {
            unitId: 'unit-1',
            direction: 'OUTGOING' as any,
            subject: 'Testing',
            date: '2026-08-01',
            urgency: 'NORMAL' as any,
            nature: 'PUBLIC' as any,
            status: 'DRAFT' as any,
          },
          'user-student',
          { id: 'user-student', roleCode: 'SDIT_SISWA', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/Peran Anda tidak berwenang/);
    });

    it('rejects letter creation for cross-unit non-correspondence roles (e.g. PERAWAT, PUSTAKAWAN)', async () => {
      await expect(
        CorrespondenceService.createLetter(
          {
            unitId: 'unit-1',
            direction: 'OUTGOING' as any,
            subject: 'Testing Perawat',
            date: '2026-08-01',
            urgency: 'NORMAL' as any,
            nature: 'PUBLIC' as any,
            status: 'DRAFT' as any,
          },
          'user-perawat',
          { id: 'user-perawat', roleCode: 'PERAWAT', unitId: 'unit-1' } as any
        )
      ).rejects.toThrow(/Peran Anda tidak berwenang/);
    });

    it('allows letter creation across units for executive foundation roles (YAYASAN_KETUA, YAYASAN_SEKRETARIS)', async () => {
      vi.mocked(prisma.letter.create).mockResolvedValue({ id: 'let-yayasan', status: 'DRAFT', unitId: 'unit-2' } as any);

      const result = await CorrespondenceService.createLetter(
        {
          unitId: 'unit-2',
          direction: 'OUTGOING' as any,
          subject: 'Testing Yayasan',
          date: '2026-08-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
        },
        'user-ketua',
        { id: 'user-ketua', roleCode: 'YAYASAN_KETUA', unitId: null } as any
      );

      expect(result.id).toBe('let-yayasan');
    });

    it('rejects letter creation for oversight-only foundation roles (YAYASAN_PEMBINA, YAYASAN_PENGAWAS, YAYASAN_ANGGOTA)', async () => {
      for (const roleCode of ['YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'YAYASAN_ANGGOTA']) {
        await expect(
          CorrespondenceService.createLetter(
            {
              unitId: 'unit-1',
              direction: 'OUTGOING' as any,
              subject: 'Testing Oversight',
              date: '2026-08-01',
              urgency: 'NORMAL' as any,
              nature: 'PUBLIC' as any,
              status: 'DRAFT' as any,
            },
            'user-oversight',
            { id: 'user-oversight', roleCode, unitId: null } as any
          )
        ).rejects.toThrow(/Peran Anda tidak berwenang/);
      }
    });

    it('creates dispositions when review completes for an incoming letter with recipientIds idempotently', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'inc-letter-1',
        status: 'PENDING_REVIEW',
        direction: 'INCOMING',
        unitId: 'unit-1',
        createdById: 'creator-1',
        reviewers: [
          { id: 'rev-1', reviewerId: 'user-1', order: 1, status: 'PENDING', isSigner: true },
        ],
        recipients: [{ userId: 'rec-1' }, { userId: 'rec-2' }],
      } as any);

      // Mock findFirst for rec-1 returning an existing pending disposition, and null for rec-2
      vi.mocked(prisma.disposition.findFirst)
        .mockResolvedValueOnce({ id: 'disp-existing', status: 'PENDING' } as any)
        .mockResolvedValueOnce(null as any);

      await CorrespondenceService.processReview('inc-letter-1', 'user-1', 'APPROVE');

      // rec-1 skipped because existing pending disposition found
      expect(prisma.disposition.create).toHaveBeenCalledTimes(1);
      expect(prisma.disposition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            letterId: 'inc-letter-1',
            senderId: 'user-1',
            recipientId: 'rec-2',
            instruction: 'Surat Masuk Diteruskan',
          }),
        })
      );
    });

    it('sets incoming letter without reviewers to DISPOSED when recipientIds present and creates real disposition records', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'user-2',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '123' },
          userRoles: [{ role: { code: 'SDIT_TATA_USAHA' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.create).mockResolvedValue({ id: 'let-2', status: 'DISPOSED', unitId: 'unit-1' } as any);
      vi.mocked(prisma.disposition.create).mockResolvedValue({ id: 'disp-auto-1', recipientId: 'user-2' } as any);

      const result = await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'INCOMING' as any,
          subject: 'Surat Masuk',
          date: '2026-08-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'PENDING_REVIEW' as any,
          recipientIds: ['user-2'],
        },
        'user-1',
        { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: null } as any
      );

      expect(prisma.letter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DISPOSED' }),
        })
      );
      expect(prisma.disposition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            letterId: 'let-2',
            senderId: 'user-1',
            recipientId: 'user-2',
            instruction: 'Surat Masuk Diteruskan',
          }),
        })
      );
    });
  });

  describe('validateParticipantEligibility & getParticipants active role enforcement', () => {
    it('rejects former staff without active internal userRoles in eligibility check', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'former-staff-1',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '9999' },
          userRoles: [], // No active roles
        },
      ] as any);

      await expect(
        CorrespondenceService.validateParticipantEligibility(['former-staff-1'])
      ).rejects.toThrow(/tidak memiliki peran internal yang sah/);
    });

    it('excludes former staff without active userRoles from participant search candidates', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await CorrespondenceService.getParticipants(
        { search: 'Former' },
        { id: 'admin-1', roleCode: 'SUPER_ADMIN', unitId: null } as any
      );

      const findCall = vi.mocked(prisma.user.findMany).mock.calls.at(-1)![0] as any;
      expect(findCall.where.userRoles).toBeDefined();
      expect(findCall.where.OR).toBeUndefined();
    });
  });

  describe('getParticipants', () => {
    it('returns filtered correspondence participants for ordinary teacher reviewers', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'u-1',
          name: 'Ust. Ahmad',
          email: 'ahmad@cipansor.or.id',
          unitId: 'unit-1',
          unit: { name: 'SDIT' },
          teacher: { nip: '12345' },
          staff: null,
          userRoles: [{ role: { code: 'SDIT_GURU' } }],
        },
      ] as any);

      const result = await CorrespondenceService.getParticipants(
        { search: 'Ahmad' },
        { id: 'guru-1', roleCode: 'SDIT_GURU', unitId: 'unit-1' } as any
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Ust. Ahmad');
      expect(result[0].nip).toBe('12345');
    });

    it('rejects external roles (STUDENT, PARENT, ALUMNI, KOMITE) from participant search', async () => {
      for (const roleCode of ['SDIT_SISWA', 'TKQ_ORANG_TUA', 'SMPIT_ALUMNI', 'SDIT_KOMITE']) {
        await expect(
          CorrespondenceService.getParticipants(
            { search: 'Ahmad' },
            { id: 'ext-1', roleCode, unitId: 'unit-1' } as any
          )
        ).rejects.toThrow(/tidak memiliki akses/);
      }
    });

    it('allows cross-unit roles with nominal unitId (e.g. PERAWAT) to search participants across units', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'u-2',
          name: 'Pustakawan',
          email: 'pustaka@cipansor.or.id',
          unitId: 'unit-2',
          unit: { name: 'SMPIT' },
          teacher: null,
          staff: { nip: '54321', position: 'Pustakawan' },
          userRoles: [{ role: { code: 'PUSTAKAWAN' } }],
        },
      ] as any);

      await CorrespondenceService.getParticipants(
        { search: 'Pustakawan', unitId: 'unit-2' },
        { id: 'perawat-1', roleCode: 'PERAWAT', unitId: 'unit-1' } as any
      );

      const findCall = vi.mocked(prisma.user.findMany).mock.calls.at(-1)![0] as any;
      expect(findCall.where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [
              { unitId: 'unit-2' },
              { unitId: null },
              { userRoles: { some: { unitId: 'unit-2', isActive: true } } },
            ],
          },
        ])
      );
    });

    it('pins ordinary unit roles to their assigned unitId even if query specifies another unit', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await CorrespondenceService.getParticipants(
        { search: 'Guru', unitId: 'unit-2' },
        { id: 'guru-1', roleCode: 'SDIT_GURU', unitId: 'unit-1' } as any
      );

      const findCall = vi.mocked(prisma.user.findMany).mock.calls.at(-1)![0] as any;
      expect(findCall.where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [
              { unitId: 'unit-1' },
              { unitId: null },
              { userRoles: { some: { unitId: 'unit-1', isActive: true } } },
            ],
          },
        ])
      );
    });
  });

  describe('Dispositions', () => {
    it('creates a disposition and advances incoming letter status to DISPOSED', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'user-2',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '123' },
          userRoles: [{ role: { code: 'SDIT_TATA_USAHA' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        unitId: 'unit-1',
        createdById: 'creator-1',
        status: 'SIGNED',
        direction: 'INCOMING',
        reviewers: [],
        recipients: [],
        dispositions: [],
      } as any);
      vi.mocked(prisma.disposition.findFirst).mockResolvedValue(null as any);
      vi.mocked(prisma.disposition.create).mockResolvedValue({ id: 'disp-1', recipientId: 'user-2' } as any);
      vi.mocked(prisma.letter.update).mockResolvedValue({} as any);

      const result = await CorrespondenceService.createDisposition(
        {
          letterId: 'letter-1',
          senderId: 'user-1',
          recipientId: 'user-2',
          instruction: 'Tolong tindak lanjuti',
        },
        { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: null } as any
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', 'disp-1');
      expect(prisma.letter.update).toHaveBeenCalledWith({
        where: { id: 'letter-1' },
        data: { status: 'DISPOSED' },
      });
    });

    it('rejects disposition creation if letter status becomes ARCHIVED when re-read under row lock', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'user-2',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '123' },
          userRoles: [{ role: { code: 'SDIT_TATA_USAHA' } }],
        },
      ] as any);

      vi.mocked(prisma.letter.findUnique)
        .mockResolvedValueOnce({
          id: 'letter-archived-race',
          unitId: 'unit-1',
          createdById: 'creator-1',
          status: 'SIGNED',
          direction: 'INCOMING',
          reviewers: [],
          recipients: [],
          dispositions: [],
        } as any)
        .mockResolvedValueOnce({
          id: 'letter-archived-race',
          unitId: 'unit-1',
          status: 'ARCHIVED',
          direction: 'INCOMING',
        } as any);

      await expect(
        CorrespondenceService.createDisposition(
          {
            letterId: 'letter-archived-race',
            senderId: 'user-1',
            recipientId: 'user-2',
            instruction: 'Tolong tindak lanjuti',
          },
          { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: null } as any
        )
      ).rejects.toThrow(/Surat sudah diarsipkan/);
    });

    it('returns existing disposition without re-emitting notifications when retried on existing active disposition', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'user-2',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '123' },
          userRoles: [{ role: { code: 'SDIT_TATA_USAHA' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        unitId: 'unit-1',
        createdById: 'creator-1',
        status: 'SIGNED',
        direction: 'INCOMING',
        reviewers: [],
        recipients: [],
        dispositions: [],
      } as any);

      vi.mocked(prisma.disposition.findFirst).mockResolvedValue({
        id: 'disp-existing-1',
        recipientId: 'user-2',
        status: 'PENDING',
      } as any);

      const result = await CorrespondenceService.createDisposition(
        {
          letterId: 'letter-1',
          senderId: 'user-1',
          recipientId: 'user-2',
          instruction: 'Tolong tindak lanjuti',
        },
        { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: null } as any
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', 'disp-existing-1');
    });

    it('deduplicates duplicate recipientIds in dispositions', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        {
          id: 'user-2',
          unitId: 'unit-1',
          teacher: null,
          staff: { nip: '123' },
          userRoles: [{ role: { code: 'SDIT_TATA_USAHA' } }],
        },
      ] as any);
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        unitId: 'unit-1',
        createdById: 'creator-1',
        status: 'SIGNED',
        direction: 'INCOMING',
        reviewers: [],
        recipients: [],
        dispositions: [],
      } as any);
      vi.mocked(prisma.disposition.create).mockResolvedValue({ id: 'disp-1', recipientId: 'user-2' } as any);

      const result = await CorrespondenceService.createDisposition(
        {
          letterId: 'letter-1',
          senderId: 'user-1',
          recipientIds: ['user-2', 'user-2', 'user-2'],
          instruction: 'Tolong tindak lanjuti',
        },
        { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: null } as any
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('getLetterById', () => {
    it('selects signatures and verifies access', async () => {
      const row = {
        id: 'letter-1',
        unitId: 'unit-1',
        createdById: 'creator-1',
        status: 'SIGNED',
        reviewers: [],
        recipients: [],
        dispositions: [],
      };
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(row as any);

      await CorrespondenceService.getLetterById('letter-1', {
        userId: 'u1',
        roleCode: 'SUPER_ADMIN',
        unitId: null,
      } as any);

      const detailCall = vi.mocked(prisma.letter.findUnique).mock.calls.at(-1)![0] as any;
      expect(detailCall.include.signatures).toBeDefined();
    });

    /**
     * Naskah yang sama dirender di dua tempat, dan hash byte-nya adalah dasar
     * verifikasi publik. Kalau halaman ini mengambil relasi yang lebih sedikit
     * daripada jalur penandatanganan, naskah yang diunduh kehilangan baris
     * Lampiran dan blok Tembusan-nya, dan surat yang sah dilaporkan berubah.
     */
    it('membaca relasi yang dibutuhkan penghasil PDF', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'letter-1',
        unitId: 'unit-1',
        createdById: 'creator-1',
        status: 'SIGNED',
        reviewers: [],
        recipients: [],
        dispositions: [],
      } as any);

      await CorrespondenceService.getLetterById('letter-1', {
        id: 'creator-1',
        roleCode: 'SUPER_ADMIN',
        unitId: null,
      } as any);

      const call = vi.mocked(prisma.letter.findUnique).mock.calls.at(-1)![0] as any;
      for (const relation of Object.keys(LETTER_PDF_RELATIONS)) {
        expect(call.include[relation]).toBeDefined();
      }
    });
  });

  /**
   * Buku ekspedisi surat keluar.
   *
   * Status SENT sudah ada di skema sejak awal dan yang mengisinya justru surat
   * *masuk*; saat sebuah naskah keluar benar-benar diserahkan kepada kurir
   * tidak tercatat di mana pun.
   */
  describe('dispatchLetter', () => {
    const petugas = { id: 'tu-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' };
    const signedLetter = (over: Record<string, unknown> = {}) => ({
      id: 'letter-1',
      unitId: 'unit-1',
      createdById: 'creator-1',
      subject: 'Undangan Rapat Kerja',
      status: 'SIGNED',
      direction: 'OUTGOING',
      sentAt: null,
      reviewers: [],
      recipients: [],
      dispositions: [],
      signatures: [{ revokedAt: null }],
      ...over,
    });

    it('mencatat pengiriman, memindahkan status ke SENT, dan mengisi sentAt', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(signedLetter() as any);
      vi.mocked(prisma.letterDispatch.create).mockResolvedValue({ id: 'exp-1' } as any);
      vi.mocked(prisma.letter.update).mockResolvedValue({} as any);

      const result = await CorrespondenceService.dispatchLetter(
        'letter-1',
        petugas as any,
        {
          channel: 'COURIER',
          dispatchedAt: '2026-09-02T03:00:00.000Z',
          receivedByName: 'Satpam MTs',
          trackingNumber: 'JNE-99',
        } as any
      );

      expect(prisma.letterDispatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            letterId: 'letter-1',
            dispatchedById: 'tu-1',
            channel: 'COURIER',
            receivedByName: 'Satpam MTs',
            trackingNumber: 'JNE-99',
          }),
        })
      );
      expect(prisma.letter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'SENT',
            sentAt: new Date('2026-09-02T03:00:00.000Z'),
          },
        })
      );
      expect(result.status).toBe('SENT');
    });

    /**
     * Sebuah surat keluar dari kantor satu kali. Yang berikutnya adalah
     * pengiriman kedua ke alamat lain, atau pengiriman ulang karena yang
     * pertama tidak sampai — keduanya tercatat, dan keduanya tidak mengubah
     * kapan naskah itu terbit ke luar.
     */
    it('tidak menggeser sentAt pada pengiriman susulan', async () => {
      const first = new Date('2026-09-01T02:00:00.000Z');
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        signedLetter({ status: 'SENT', sentAt: first }) as any
      );
      vi.mocked(prisma.letterDispatch.create).mockResolvedValue({ id: 'exp-2' } as any);
      vi.mocked(prisma.letter.update).mockResolvedValue({} as any);

      await CorrespondenceService.dispatchLetter('letter-1', petugas as any, {
        channel: 'POST',
      } as any);

      expect(prisma.letter.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SENT', sentAt: first } })
      );
    });

    it('menolak surat masuk — surat masuk diterima, bukan dikirim', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        signedLetter({ direction: 'INCOMING', status: 'DISPOSED' }) as any
      );

      await expect(
        CorrespondenceService.dispatchLetter('letter-1', petugas as any, {
          channel: 'HAND_DELIVERY',
        } as any)
      ).rejects.toThrow(/Surat masuk diterima, bukan dikirim/);
      expect(prisma.letterDispatch.create).not.toHaveBeenCalled();
    });

    it('menolak naskah yang belum ditandatangani', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        signedLetter({ status: 'READY_TO_SIGN', signatures: [] }) as any
      );

      await expect(
        CorrespondenceService.dispatchLetter('letter-1', petugas as any, {
          channel: 'HAND_DELIVERY',
        } as any)
      ).rejects.toThrow(/belum ditandatangani/);
      expect(prisma.letterDispatch.create).not.toHaveBeenCalled();
    });

    it('menolak naskah yang sudah dicabut', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        signedLetter({
          status: 'SIGNED',
          signatures: [{ revokedAt: new Date('2026-09-02T00:00:00.000Z') }],
        }) as any
      );

      await expect(
        CorrespondenceService.dispatchLetter('letter-1', petugas as any, {
          channel: 'EMAIL',
        } as any)
      ).rejects.toThrow(/sudah dicabut/);
    });

    /**
     * Seorang guru yang menjadi verifikator surat ini boleh membacanya — itu
     * sebabnya ia diuji di sini dan bukan seorang asing. Membaca bukan
     * mengirim: mencatat pengiriman adalah perbuatan tata usaha.
     */
    it('menolak peran yang boleh membaca surat tetapi tidak mengurus persuratan', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        signedLetter({ reviewers: [{ reviewerId: 'guru-1' }] }) as any
      );

      await expect(
        CorrespondenceService.dispatchLetter(
          'letter-1',
          { id: 'guru-1', roleCode: 'SDIT_GURU_KELAS', unitId: 'unit-1' } as any,
          { channel: 'POST' } as any
        )
      ).rejects.toThrow(/tidak berwenang/);
      expect(prisma.letterDispatch.create).not.toHaveBeenCalled();
    });
  });

  describe('tembusan dan lampiran', () => {
    const admin = { id: 'user-1', roleCode: 'SUPER_ADMIN', unitId: null };

    const eligible = (ids: string[]) =>
      ids.map((id) => ({
        id,
        unitId: 'unit-1',
        teacher: null,
        staff: { nip: '123' },
        userRoles: [{ role: { code: 'SDIT_TATA_USAHA' } }],
      }));

    it('menulis penerima tembusan sebagai isCC true', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue(
        eligible(['penerima-1', 'tembusan-1']) as any
      );
      vi.mocked(prisma.letter.create).mockResolvedValue({
        id: 'let-cc',
        status: 'DRAFT',
        unitId: 'unit-1',
      } as any);

      await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'OUTGOING' as any,
          subject: 'Undangan',
          date: '2026-09-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
          recipientIds: ['penerima-1'],
          ccRecipients: [{ userId: 'tembusan-1' }],
        },
        'user-1',
        admin as any
      );

      const rows = vi
        .mocked(prisma.letterRecipient.createMany)
        .mock.calls.flatMap((c) => (c[0] as any).data as any[]);

      expect(rows).toContainEqual(
        expect.objectContaining({ userId: 'penerima-1', isCC: false })
      );
      expect(rows).toContainEqual(
        expect.objectContaining({ userId: 'tembusan-1', isCC: true })
      );
    });

    /**
     * Seseorang menerima surat ini *atau* salinannya. Dua baris untuk orang
     * yang sama mencetak namanya di kaki naskah sebagai tembusan padahal ia
     * penerima utamanya.
     */
    it('tidak mencatat penerima utama sekaligus sebagai tembusan', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue(eligible(['orang-1']) as any);
      vi.mocked(prisma.letter.create).mockResolvedValue({
        id: 'let-dup',
        status: 'DRAFT',
        unitId: 'unit-1',
      } as any);

      await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'OUTGOING' as any,
          subject: 'Undangan',
          date: '2026-09-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
          recipientIds: ['orang-1'],
          ccRecipients: [{ userId: 'orang-1' }],
        },
        'user-1',
        admin as any
      );

      const rows = vi
        .mocked(prisma.letterRecipient.createMany)
        .mock.calls.flatMap((c) => (c[0] as any).data as any[]);

      expect(rows.filter((r) => r.userId === 'orang-1')).toHaveLength(1);
      expect(rows[0].isCC).toBe(false);
    });

    it('menyimpan lampiran berikut urutannya', async () => {
      vi.mocked(prisma.letter.create).mockResolvedValue({
        id: 'let-att',
        status: 'DRAFT',
        unitId: 'unit-1',
      } as any);

      await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'OUTGOING' as any,
          subject: 'Laporan',
          date: '2026-09-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
          attachments: [
            { name: 'Daftar hadir.pdf', fileUrl: '/uploads/a.pdf' },
            { name: 'Notulen.pdf', fileUrl: '/uploads/b.pdf' },
          ],
        },
        'user-1',
        admin as any
      );

      expect(prisma.letterAttachment.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ name: 'Daftar hadir.pdf', order: 1 }),
          expect.objectContaining({ name: 'Notulen.pdf', order: 2 }),
        ],
      });
    });

    /**
     * Penerima tembusan dapat membaca suratnya. Melewatkannya dari pemeriksaan
     * kelayakan menjadikan tembusan jalan memberi akses kepada peran yang
     * justru dikecualikan dari persuratan.
     */
    it('memeriksa kelayakan penerima tembusan seperti penerima biasa', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

      await expect(
        CorrespondenceService.createLetter(
          {
            unitId: 'unit-1',
            direction: 'OUTGOING' as any,
            subject: 'Undangan',
            date: '2026-09-01',
            urgency: 'NORMAL' as any,
            nature: 'PUBLIC' as any,
            status: 'DRAFT' as any,
            ccRecipients: [{ userId: 'santri-1' }],
          },
          'user-1',
          admin as any
        )
      ).rejects.toThrow();
      expect(prisma.letter.create).not.toHaveBeenCalled();
    });

    /**
     * Tembusan naskah dinas sering ditujukan kepada pihak yang tidak punya akun
     * di sini sama sekali. Tanpa ini, penyusun terpaksa menuliskan sisanya di
     * badan surat, di mana ia tidak tercetak sebagai tembusan.
     */
    it('menerima tembusan ke pihak di luar sistem, dan tidak memeriksanya sebagai pengguna', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue(eligible(['dalam-1']) as any);
      vi.mocked(prisma.letter.create).mockResolvedValue({
        id: 'let-ext',
        status: 'DRAFT',
        unitId: 'unit-1',
      } as any);

      await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'OUTGOING' as any,
          subject: 'Undangan',
          date: '2026-09-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
          ccRecipients: [
            { externalName: 'Kepala KUA Kecamatan Cipansor' },
            { userId: 'dalam-1' },
            { externalName: 'Ketua RW 04' },
          ],
        },
        'user-1',
        admin as any
      );

      const rows = vi
        .mocked(prisma.letterRecipient.createMany)
        .mock.calls.flatMap((c) => (c[0] as any).data as any[]);

      // Urutan yang disusun penulisnya, bukan semua yang internal dikumpulkan
      // ke atas: tembusan tercetak sebagai daftar bernomor.
      expect(rows.map((r) => [r.order, r.externalName ?? r.userId])).toEqual([
        [1, 'Kepala KUA Kecamatan Cipansor'],
        [2, 'dalam-1'],
        [3, 'Ketua RW 04'],
      ]);

      // Hanya yang internal yang diperiksa kelayakannya; pihak luar bukan
      // pengguna dan tidak membuka apa pun.
      const checked = vi.mocked(prisma.user.findMany).mock.calls.at(-1)![0] as any;
      expect(checked.where.id.in).toEqual(['dalam-1']);
    });

    it('tidak mencetak satu pihak luar dua kali', async () => {
      vi.mocked(prisma.letter.create).mockResolvedValue({
        id: 'let-dupext',
        status: 'DRAFT',
        unitId: 'unit-1',
      } as any);

      await CorrespondenceService.createLetter(
        {
          unitId: 'unit-1',
          direction: 'OUTGOING' as any,
          subject: 'Undangan',
          date: '2026-09-01',
          urgency: 'NORMAL' as any,
          nature: 'PUBLIC' as any,
          status: 'DRAFT' as any,
          ccRecipients: [
            { externalName: 'Ketua RW 04' },
            { externalName: '  ketua rw 04  ' },
          ],
        },
        'user-1',
        admin as any
      );

      const rows = vi
        .mocked(prisma.letterRecipient.createMany)
        .mock.calls.flatMap((c) => (c[0] as any).data as any[]);
      expect(rows).toHaveLength(1);
    });
  });

  /**
   * Menyunting tembusan: menambah baris, menghapus baris, memindahkan urutan.
   * Yang dikirim antarmuka adalah daftar utuh sesudah disunting.
   */
  describe('updateLetterCc', () => {
    const petugas = { id: 'tu-1', roleCode: 'SDIT_TATA_USAHA', unitId: 'unit-1' };
    const draft = (over: Record<string, unknown> = {}) => ({
      id: 'letter-1',
      unitId: 'unit-1',
      createdById: 'tu-1',
      status: 'DRAFT',
      direction: 'OUTGOING',
      reviewers: [],
      recipients: [],
      dispositions: [],
      signatures: [],
      ...over,
    });

    it('mengganti seluruh daftar, dan hanya baris tembusan', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(draft() as any);
      vi.mocked(prisma.letterRecipient.deleteMany).mockResolvedValue({ count: 2 } as any);

      const result = await CorrespondenceService.updateLetterCc(
        'letter-1',
        petugas as any,
        [{ externalName: 'Kepala KUA' }]
      );

      // Penerima utama adalah daftar yang berbeda; menghapusnya di sini akan
      // mencabut akses orang yang memang berhak membaca surat ini.
      expect(prisma.letterRecipient.deleteMany).toHaveBeenCalledWith({
        where: { letterId: 'letter-1', isCC: true },
      });
      expect(result.count).toBe(1);
    });

    /**
     * Tembusan tercetak di kaki naskah dan byte naskah yang ditandatangani
     * sudah diarsipkan. Kalau daftar ini boleh berubah sesudahnya, basis data
     * menyebut tembusan yang tidak ada pada lembar yang beredar.
     */
    it('menolak mengubah tembusan naskah yang sudah ditandatangani', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        draft({ status: 'SIGNED', signatures: [{ id: 'sig-1' }] }) as any
      );

      await expect(
        CorrespondenceService.updateLetterCc('letter-1', petugas as any, [])
      ).rejects.toThrow(/sudah ditandatangani/);
      expect(prisma.letterRecipient.deleteMany).not.toHaveBeenCalled();
    });

    it('menolak peran yang boleh membaca surat tetapi tidak mengurus persuratan', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue(
        draft({ createdById: 'orang-lain', reviewers: [{ reviewerId: 'guru-1' }] }) as any
      );

      await expect(
        CorrespondenceService.updateLetterCc(
          'letter-1',
          { id: 'guru-1', roleCode: 'SDIT_GURU_KELAS', unitId: 'unit-1' } as any,
          [{ externalName: 'Kepala KUA' }]
        )
      ).rejects.toThrow(/tidak berwenang/);
    });
  });

  /**
   * SENT berarti "naskah ini sudah meninggalkan kantor". Sebelumnya justru
   * surat *masuk* yang mengisinya, sehingga daftar surat menampilkan surat
   * yang baru tiba sebagai "Terkirim".
   */
  describe('penyelesaian review surat masuk', () => {
    it('mengarsipkan surat masuk yang selesai tanpa disposisi, bukan menandainya terkirim', async () => {
      vi.mocked(prisma.letter.findUnique).mockResolvedValue({
        id: 'inc-1',
        status: 'PENDING_REVIEW',
        direction: 'INCOMING',
        unitId: 'unit-1',
        createdById: 'creator-1',
        reviewers: [
          { id: 'rev-1', reviewerId: 'user-1', order: 1, status: 'PENDING', isSigner: true },
        ],
        recipients: [],
      } as any);
      vi.mocked(prisma.letter.update).mockResolvedValue({} as any);

      await CorrespondenceService.processReview('inc-1', 'user-1', 'APPROVE');

      expect(prisma.letter.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ARCHIVED' } })
      );

      // Penutupannya tercatat sebagai peristiwa tersendiri: riwayat alur harus
      // menyebut siapa yang menutup surat itu dan atas dasar apa.
      const events = vi
        .mocked(prisma.letterFlowEvent.create)
        .mock.calls.map((c) => (c[0] as any).data);
      expect(events).toContainEqual(
        expect.objectContaining({ action: 'ARCHIVED', toStatus: 'ARCHIVED' })
      );
    });
  });
});
