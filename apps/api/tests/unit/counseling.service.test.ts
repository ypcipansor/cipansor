import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole, CounselingCategory, CounselingPriority, CounselingStatus } from '@prisma/client';

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      counselingSession: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
      counselingNote: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      student: {
        findUnique: vi.fn(),
      },
      teacher: {
        findFirst: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/middleware/error', () => ({
  Errors: {
    notFound: (msg: string) => new Error(msg),
    forbidden: (msg: string) => new Error(msg),
  },
}));

import { counselingService } from '@/modules/counseling/counseling.service';

describe('CounselingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUser: any = {
    sub: 'user-1',
    role: UserRole.TEACHER,
    unitId: 'unit-1',
  };

  describe('createSession', () => {
    const input: any = {
      studentId: 'student-1',
      category: CounselingCategory.ACADEMIC,
      priority: CounselingPriority.MEDIUM,
      title: 'Test Session',
      description: 'Test Description',
      scheduledAt: '2024-01-01T10:00:00Z',
      duration: 60,
      location: 'Room 101',
      isConfidential: true,
    };

    it('should create a session successfully', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({ id: 'student-1', unitId: 'unit-1' });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });

      const mockSession = {
        id: 'session-1',
        ...input,
        counselorId: 'teacher-1',
        status: CounselingStatus.SCHEDULED,
        scheduledAt: new Date(input.scheduledAt),
        student: { id: 'student-1', enrollments: [] },
      };

      mockPrisma.counselingSession.create.mockResolvedValue(mockSession);

      const result = await counselingService.createSession(input, mockUser);

      expect(mockPrisma.student.findUnique).toHaveBeenCalledWith({
        where: { id: 'student-1', deletedAt: null },
      });
      expect(mockPrisma.teacher.findFirst).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.counselingSession.create).toHaveBeenCalled();
      // The creator is the session's counsellor, so reads it in full.
      expect(result).toMatchObject({
        id: 'session-1',
        title: 'Test Session',
        viewerAccess: 'FULL',
      });
    });

    it('should throw error if student not found', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(null);

      await expect(counselingService.createSession(input, mockUser)).rejects.toThrow(
        'Student not found'
      );
    });
  });

  describe('getSessions', () => {
    it('should return paginated sessions', async () => {
      const mockSessions = [
        { id: 'session-1', title: 'Session 1', student: { enrollments: [] } },
        { id: 'session-2', title: 'Session 2', student: { enrollments: [] } },
      ];
      const mockTotal = 2;

      mockPrisma.counselingSession.findMany.mockResolvedValue(mockSessions);
      mockPrisma.counselingSession.count.mockResolvedValue(mockTotal);

      const result = await counselingService.getSessions({}, mockUser);

      expect(mockPrisma.counselingSession.findMany).toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by unitId for non-admin users', async () => {
      mockPrisma.counselingSession.findMany.mockResolvedValue([]);
      mockPrisma.counselingSession.count.mockResolvedValue(0);

      await counselingService.getSessions({}, mockUser);

      const expectedWhere = expect.objectContaining({
        unitId: 'unit-1',
      });

      expect(mockPrisma.counselingSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere })
      );
    });
  });

  describe('addNote', () => {
    const noteInput: any = {
      content: 'Test Note',
      noteType: 'general',
    };

    it('should add a note to a session', async () => {
      mockPrisma.counselingSession.findUnique.mockResolvedValue({
        id: 'session-1',
        unitId: 'unit-1',
      });

      const mockNote = {
        id: 'note-1',
        sessionId: 'session-1',
        content: 'Test Note',
        createdById: 'user-1',
      };

      mockPrisma.counselingNote.create.mockResolvedValue(mockNote);

      const result = await counselingService.addNote('session-1', noteInput, mockUser);

      expect(mockPrisma.counselingSession.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session-1' } })
      );
      expect(mockPrisma.counselingNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'session-1',
            content: 'Test Note',
          }),
        })
      );
      expect(result).toEqual(mockNote);
    });

    it('should throw error if session not found', async () => {
      mockPrisma.counselingSession.findUnique.mockResolvedValue(null);

      await expect(counselingService.addNote('session-1', noteInput, mockUser)).rejects.toThrow(
        'Session not found'
      );
    });

    it('should throw error if user unit does not match session unit', async () => {
      mockPrisma.counselingSession.findUnique.mockResolvedValue({
        id: 'session-1',
        unitId: 'unit-2',
      });

      await expect(counselingService.addNote('session-1', noteInput, mockUser)).rejects.toThrow(
        'Access denied'
      );
    });
  });
});
