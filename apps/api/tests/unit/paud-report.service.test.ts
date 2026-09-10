import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma Client before imports
const mockPrisma = vi.hoisted(() => ({
  pAUDNarrativeReport: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  pAUDDevelopmentAssessment: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  pAUDReportPhoto: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  student: {
    findUnique: vi.fn(),
  },
  studentParent: {
    findUnique: vi.fn(),
  },
  academicYear: {
    findUnique: vi.fn(),
  },
  unit: {
    findUnique: vi.fn(),
  },
  attendance: {
    findMany: vi.fn(),
  },
  classEnrollment: {
    findMany: vi.fn(),
  },
  dailyStudentReport: {
    findMany: vi.fn(),
  },
  growthRecord: {
    findFirst: vi.fn(),
  },
  tahfidzRecord: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Import service after mocking
import * as paudReportService from '@/modules/paud-report/paud-report.service';

const teacherContext = { role: 'TEACHER', unitId: 'unit-1', userId: 'teacher-1' } as any;

describe('PAUD Report Service - List Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAllReports', () => {
    const mockContext = { role: 'TEACHER', unitId: 'unit-1', userId: 'user-1' };

    it('should return paginated reports', async () => {
      const mockReports = [
        {
          id: 'report-1',
          studentId: 'student-1',
          status: 'DRAFT',
          student: { id: 'student-1', nisn: '12345', user: { name: 'Student 1' } },
        },
      ];

      mockPrisma.pAUDNarrativeReport.findMany.mockResolvedValue(mockReports);
      mockPrisma.pAUDNarrativeReport.count.mockResolvedValue(1);

      const result = await paudReportService.findAllReports({ page: 1, limit: 10 }, mockContext);

      expect(result.reports).toEqual(mockReports);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
      expect(mockPrisma.pAUDNarrativeReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
    });

    it('should filter reports by student', async () => {
      mockPrisma.pAUDNarrativeReport.findMany.mockResolvedValue([]);
      mockPrisma.pAUDNarrativeReport.count.mockResolvedValue(0);

      await paudReportService.findAllReports(
        { page: 1, limit: 10, studentId: 'student-1' },
        mockContext
      );

      expect(mockPrisma.pAUDNarrativeReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ studentId: 'student-1' }),
        })
      );
    });

    it('should filter by context unitId for non-admin', async () => {
      mockPrisma.pAUDNarrativeReport.findMany.mockResolvedValue([]);
      mockPrisma.pAUDNarrativeReport.count.mockResolvedValue(0);

      await paudReportService.findAllReports({ page: 1, limit: 10 }, mockContext);

      expect(mockPrisma.pAUDNarrativeReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unitId: 'unit-1' }),
        })
      );
    });
  });
});

describe('PAUD Report Service - CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findReportById', () => {
    it('should return report by id', async () => {
      const mockReport = {
        id: 'report-1',
        studentId: 'student-1',
        status: 'DRAFT',
      };

      mockPrisma.pAUDNarrativeReport.findUnique
        .mockResolvedValueOnce({ id: 'report-1', studentId: 'student-1', unitId: 'unit-1' })
        .mockResolvedValueOnce(mockReport);

      const result = await paudReportService.findReportById('report-1', teacherContext);

      expect(result).toEqual(mockReport);
      expect(mockPrisma.pAUDNarrativeReport.findUnique).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        include: expect.any(Object),
      });
    });

    it('should throw error if report not found', async () => {
      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(null);

      await expect(paudReportService.findReportById('report-1', teacherContext)).rejects.toThrow(
        'Report not found'
      );
    });
  });

  describe('createReport', () => {
    it('should create new report', async () => {
      const input = {
        studentId: 'student-1',
        unitId: 'unit-1',
        academicYearId: 'year-1',
        semester: 1,
        narrativeNAM: 'Good',
      };

      const mockStudent = { id: 'student-1', unitId: 'unit-1' };
      const mockAcademicYear = { id: 'year-1' };
      const mockUnit = { id: 'unit-1' };
      const mockCreated = { id: 'report-1', ...input };

      mockPrisma.student.findUnique.mockResolvedValue(mockStudent);
      mockPrisma.academicYear.findUnique.mockResolvedValue(mockAcademicYear);
      mockPrisma.unit.findUnique.mockResolvedValue(mockUnit);
      mockPrisma.pAUDNarrativeReport.create.mockResolvedValue(mockCreated);

      const result = await paudReportService.createReport(input as any, teacherContext);

      expect(result).toEqual(mockCreated);
      expect(mockPrisma.student.findUnique).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        select: { id: true, unitId: true },
      });
      expect(mockPrisma.pAUDNarrativeReport.create).toHaveBeenCalled();
    });

    it('should throw error if student not found', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(null);

      await expect(
        paudReportService.createReport(
          { studentId: 'student-1', unitId: 'unit-1', academicYearId: 'year-1', semester: 'GANJIL' as const, totalDays: 100, presentDays: 90, sickDays: 5, excusedDays: 5 },
          teacherContext
        )
      ).rejects.toThrow('Student not found');
    });
  });

  describe('updateReport', () => {
    it('should update existing report', async () => {
      const mockExisting = {
        id: 'report-1',
        status: 'DRAFT',
        studentId: 'student-1',
        unitId: 'unit-1',
      };
      const mockUpdated = { id: 'report-1', narrativeNAM: 'Updated' };

      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(mockExisting);
      mockPrisma.pAUDNarrativeReport.update.mockResolvedValue(mockUpdated);

      const result = await paudReportService.updateReport(
        'report-1',
        { narrativeNAM: 'Updated' } as any,
        teacherContext
      );

      expect(result).toEqual(mockUpdated);
      expect(mockPrisma.pAUDNarrativeReport.update).toHaveBeenCalled();
    });

    it('should throw error if report not found', async () => {
      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(null);

      await expect(
        paudReportService.updateReport(
          'report-1',
          { narrativeNAM: 'Updated' } as any,
          teacherContext
        )
      ).rejects.toThrow('Report not found');
    });
  });

  describe('deleteReport', () => {
    it('should delete report', async () => {
      const mockReport = {
        id: 'report-1',
        status: 'DRAFT',
        studentId: 'student-1',
        unitId: 'unit-1',
      };

      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(mockReport);
      mockPrisma.pAUDReportPhoto.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.pAUDNarrativeReport.delete.mockResolvedValue(mockReport);

      const result = await paudReportService.deleteReport('report-1', teacherContext);

      expect(result).toEqual(mockReport);
      expect(mockPrisma.pAUDReportPhoto.deleteMany).toHaveBeenCalledWith({
        where: { reportId: 'report-1' },
      });
      expect(mockPrisma.pAUDNarrativeReport.delete).toHaveBeenCalledWith({
        where: { id: 'report-1' },
      });
    });

    it('should throw error if report not found', async () => {
      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(null);

      await expect(paudReportService.deleteReport('report-1', teacherContext)).rejects.toThrow(
        'Report not found'
      );
    });
  });
});

describe('PAUD Report Service - Report Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateReportFromAssessments', () => {
    it('should generate report with auto-generated narratives', async () => {
      const input = {
        studentId: 'student-1',
        unitId: 'unit-1',
        academicYearId: 'year-1',
        semester: 1,
      };

      const mockStudent = { id: 'student-1', unitId: 'unit-1', user: { name: 'Student 1' } };
      const mockAcademicYear = { id: 'year-1' };
      const mockUnit = { id: 'unit-1' };

      // Mock assessments for NAM aspect (>= 3 assessments)
      const mockAssessments = [
        { aspect: 'NAM', achievementLevel: 'BSH', indicator: { name: 'Indicator 1' } },
        { aspect: 'NAM', achievementLevel: 'BSH', indicator: { name: 'Indicator 2' } },
        { aspect: 'NAM', achievementLevel: 'BSB', indicator: { name: 'Indicator 3' } },
      ];

      const mockCreated = {
        id: 'report-1',
        ...input,
        narrativeNAM: 'Berkembang Sesuai Harapan',
      };

      mockPrisma.student.findUnique.mockResolvedValue(mockStudent);
      mockPrisma.academicYear.findUnique.mockResolvedValue(mockAcademicYear);
      mockPrisma.unit.findUnique.mockResolvedValue(mockUnit);
      mockPrisma.pAUDDevelopmentAssessment.findMany.mockResolvedValue(mockAssessments);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.dailyStudentReport.findMany.mockResolvedValue([]);
      mockPrisma.pAUDNarrativeReport.create.mockResolvedValue(mockCreated);

      const result = await paudReportService.generateReportFromAssessments(
        input as any,
        teacherContext
      );

      expect(result).toBeDefined();
      expect(mockPrisma.pAUDDevelopmentAssessment.findMany).toHaveBeenCalled();
      expect(mockPrisma.pAUDNarrativeReport.create).toHaveBeenCalled();
    });
  });

  describe('bulkGenerateReports', () => {
    it('should process bulk generation for multiple students', async () => {
      const input = {
        classId: 'class-1',
        unitId: 'unit-1',
        academicYearId: 'year-1',
        semester: 1,
      };

      const mockEnrollments = [
        { studentId: 'student-1', student: { user: { name: 'Student 1' } } },
        { studentId: 'student-2', student: { user: { name: 'Student 2' } } },
      ];

      mockPrisma.classEnrollment.findMany.mockResolvedValue(mockEnrollments);

      const result = await paudReportService.bulkGenerateReports(input as any, teacherContext);

      // Should return results structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('errors');
      expect(mockPrisma.classEnrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ classId: 'class-1' }),
        })
      );
    });
  });
});

describe('PAUD Report Service - Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('finalizeReport', () => {
    it('should finalize report and set status to FINALIZED', async () => {
      const mockExisting = {
        id: 'report-1',
        status: 'DRAFT',
        studentId: 'student-1',
        unitId: 'unit-1',
      };
      const mockFinalized = { id: 'report-1', status: 'FINALIZED', finalizedAt: new Date() };

      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(mockExisting);
      mockPrisma.pAUDNarrativeReport.update.mockResolvedValue(mockFinalized);

      const result = await paudReportService.finalizeReport(
        'report-1',
        {
          teacherSignature: 'signature-url',
          principalSignature: 'signature-url',
        } as any,
        teacherContext
      );

      expect(result.status).toBe('FINALIZED');
      expect(mockPrisma.pAUDNarrativeReport.update).toHaveBeenCalled();
    });

    it('should throw error if report not found', async () => {
      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(null);

      await expect(
        paudReportService.finalizeReport(
          'report-1',
          { teacherSignature: 'url', principalSignature: 'url' } as any,
          teacherContext
        )
      ).rejects.toThrow('Report not found');
    });
  });

  describe('markAsPrinted', () => {
    it('should mark report as printed', async () => {
      const mockExisting = {
        id: 'report-1',
        status: 'FINALIZED',
        studentId: 'student-1',
        unitId: 'unit-1',
      };
      const mockPrinted = {
        id: 'report-1',
        status: 'PRINTED',
        printedAt: new Date(),
        isPrinted: true,
      };

      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(mockExisting);
      mockPrisma.pAUDNarrativeReport.update.mockResolvedValue(mockPrinted);

      const result = await paudReportService.markAsPrinted('report-1', teacherContext);

      expect(result.status).toBe('PRINTED');
      expect(mockPrisma.pAUDNarrativeReport.update).toHaveBeenCalled();
    });
  });
});

describe('PAUD Report Service - Photos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addPhoto', () => {
    it('should add photo to report', async () => {
      const mockReport = {
        id: 'report-1',
        status: 'DRAFT',
        studentId: 'student-1',
        unitId: 'unit-1',
      };
      const mockPhoto = {
        id: 'photo-1',
        reportId: 'report-1',
        photoUrl: 'https://example.com/photo.jpg',
        caption: 'Activity',
        orderNumber: 1,
      };

      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(mockReport);
      mockPrisma.pAUDReportPhoto.count.mockResolvedValue(5); // < 10 max
      mockPrisma.pAUDReportPhoto.create.mockResolvedValue(mockPhoto);

      const result = await paudReportService.addPhoto(
        'report-1',
        {
          photoUrl: 'https://example.com/photo.jpg',
          caption: 'Activity',
          orderNumber: 1,
        } as any,
        teacherContext
      );

      expect(result).toEqual(mockPhoto);
      expect(mockPrisma.pAUDReportPhoto.count).toHaveBeenCalledWith({
        where: { reportId: 'report-1' },
      });
      expect(mockPrisma.pAUDReportPhoto.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'report-1',
          photoUrl: 'https://example.com/photo.jpg',
        }),
      });
    });

    it('should throw error if report not found', async () => {
      mockPrisma.pAUDNarrativeReport.findUnique.mockResolvedValue(null);

      await expect(
        paudReportService.addPhoto(
          'report-1',
          { photoUrl: 'https://example.com/photo.jpg', orderNumber: 1 } as any,
          teacherContext
        )
      ).rejects.toThrow('Report not found');
    });
  });

  describe('updatePhoto', () => {
    it('should update photo', async () => {
      const mockExisting = {
        id: 'photo-1',
        caption: 'Old',
        report: { status: 'DRAFT', studentId: 'student-1', unitId: 'unit-1' },
      };
      const mockUpdated = { id: 'photo-1', caption: 'New' };

      mockPrisma.pAUDReportPhoto.findUnique.mockResolvedValue(mockExisting);
      mockPrisma.pAUDReportPhoto.update.mockResolvedValue(mockUpdated);

      const result = await paudReportService.updatePhoto(
        'photo-1',
        { caption: 'New' } as any,
        teacherContext
      );

      expect(result.caption).toBe('New');
      expect(mockPrisma.pAUDReportPhoto.update).toHaveBeenCalled();
    });

    it('should throw error if photo not found', async () => {
      mockPrisma.pAUDReportPhoto.findUnique.mockResolvedValue(null);

      await expect(
        paudReportService.updatePhoto('photo-1', { caption: 'New' } as any, teacherContext)
      ).rejects.toThrow('Photo not found');
    });
  });

  describe('deletePhoto', () => {
    it('should delete photo', async () => {
      const mockPhoto = {
        id: 'photo-1',
        report: { status: 'DRAFT', studentId: 'student-1', unitId: 'unit-1' },
      };

      mockPrisma.pAUDReportPhoto.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.pAUDReportPhoto.delete.mockResolvedValue(mockPhoto);

      const result = await paudReportService.deletePhoto('photo-1', teacherContext);

      expect(result).toEqual(mockPhoto);
      expect(mockPrisma.pAUDReportPhoto.delete).toHaveBeenCalledWith({
        where: { id: 'photo-1' },
      });
    });

    it('should throw error if photo not found', async () => {
      mockPrisma.pAUDReportPhoto.findUnique.mockResolvedValue(null);

      await expect(paudReportService.deletePhoto('photo-1', teacherContext)).rejects.toThrow(
        'Photo not found'
      );
    });
  });
});
