import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dailyReportService } from '@/modules/daily-report/daily-report.service';
import { prisma } from '@/lib/prisma';
import type {
  CreateDailyReportInput,
  UpdateDailyReportInput,
  BulkCreateDailyReportsInput,
} from '@cipansor/shared';
import { DailyMood, MealConsumption, UnitType } from '@prisma/client';
import { whatsAppService } from '@/modules/notifications';

// Mock WhatsApp Service
vi.mock('@/modules/notifications', () => ({
  whatsAppService: {
    sendDailyReportNotification: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyStudentReport: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dailyReportPhoto: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    unit: {
      findUniqueOrThrow: vi.fn(),
    },
    teacher: {
      findUnique: vi.fn(),
    },
    kitabProgress: {
      upsert: vi.fn(),
    },
    tahfidzRecord: {
      create: vi.fn(),
    },
    dailyHomework: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('DailyReportService', () => {
  const mockUserId = 'user-123';
  const mockStudentId = 'student-123';
  const mockUnitId = 'unit-123';
  const mockAcademicYearId = 'year-123';
  const mockReportId = 'report-123';
  const mockReportDate = new Date('2024-01-15');

  const mockUnit = {
    id: mockUnitId,
    name: 'TK A1',
    type: 'TK_QURAN' as UnitType,
  };

  const mockStudent = {
    id: mockStudentId,
    nisn: '001',
    user: { id: 'user-student', name: 'Test Student' },
    enrollments: [{ classId: 'class-123', status: 'active' }],
  };

  const mockReport = {
    id: mockReportId,
    studentId: mockStudentId,
    unitId: mockUnitId,
    academicYearId: mockAcademicYearId,
    reportDate: mockReportDate,
    unitType: 'TK_QURAN' as UnitType,
    mood: 'HAPPY' as DailyMood,
    healthStatus: 'Sehat',
    temperature: 36.5,
    hadBreakfast: true,
    mealStatus: 'HABIS' as unknown as MealConsumption,
    snackStatus: 'SETENGAH' as unknown as MealConsumption,
    napDuration: 60,
    toiletNotes: 'Normal',
    activitiesSummary: 'Main balok',
    achievements: 'Bisa menyusun balok tinggi',
    tahfidzActivity: 'Al-Fatihah',
    behaviorNotes: 'Baik',
    teacherNotes: 'Anak aktif',
    homeActivity: 'Latihan menggambar',
    createdById: mockUserId,
    parentReadAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    student: mockStudent,
    unit: mockUnit,
    academicYear: { id: mockAcademicYearId, name: '2023/2024' },
    createdBy: { id: mockUserId, name: 'Teacher' },
    photos: [],
    homework: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // LIST & READ
  // ============================================

  describe('findAll', () => {
    it('should list daily reports with pagination', async () => {
      const mockReports = [mockReport];
      const mockTotal = 1;

      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue(mockReports as any);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(mockTotal);

      const result = await dailyReportService.findAll({ page: 1, limit: 20 }, { role: 'ADMIN' });

      expect(result.reports).toEqual(mockReports);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(prisma.dailyStudentReport.findMany).toHaveBeenCalledOnce();
      expect(prisma.dailyStudentReport.count).toHaveBeenCalledOnce();
    });

    it('should filter by studentId', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([mockReport] as any);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(1);

      await dailyReportService.findAll({ studentId: mockStudentId }, { role: 'ADMIN' });

      expect(prisma.dailyStudentReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ studentId: mockStudentId }),
        })
      );
    });

    it('should filter by date range', async () => {
      const dateFrom = '2024-01-01';
      const dateTo = '2024-01-31';

      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(0);

      await dailyReportService.findAll({ dateFrom, dateTo }, { role: 'ADMIN' });

      expect(prisma.dailyStudentReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reportDate: {
              gte: new Date(dateFrom),
              lte: new Date(dateTo),
            },
          }),
        })
      );
    });

    it('should filter by specific date', async () => {
      const date = '2024-01-15';
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(0);

      await dailyReportService.findAll({ date }, { role: 'ADMIN' });

      const calledWith = vi.mocked(prisma.dailyStudentReport.findMany).mock.calls[0]![0] as any;
      expect(calledWith.where.reportDate).toHaveProperty('gte');
      expect(calledWith.where.reportDate).toHaveProperty('lt');
    });

    it('should filter by mood', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(0);

      await dailyReportService.findAll({ mood: 'HAPPY' }, { role: 'ADMIN' });

      expect(prisma.dailyStudentReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ mood: 'HAPPY' }),
        })
      );
    });

    it('should filter by parent confirmation status', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(0);

      await dailyReportService.findAll({ isConfirmedByParent: true }, { role: 'ADMIN' });

      expect(prisma.dailyStudentReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentReadAt: { not: null },
          }),
        })
      );
    });

    it('should apply unit filter for non-admin roles', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(0);

      await dailyReportService.findAll({}, { role: 'TEACHER', unitId: mockUnitId });

      expect(prisma.dailyStudentReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unitId: mockUnitId }),
        })
      );
    });

    it('should search in notes and student name', async () => {
      const search = 'aktif';
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dailyStudentReport.count).mockResolvedValue(0);

      await dailyReportService.findAll({ search }, { role: 'ADMIN' });

      const calledWith = vi.mocked(prisma.dailyStudentReport.findMany).mock.calls[0]![0] as any;
      expect(calledWith.where).toHaveProperty('OR');
      expect(Array.isArray(calledWith.where.OR)).toBe(true);
    });
  });

  describe('findById', () => {
    it('should find report by id', async () => {
      vi.mocked(prisma.dailyStudentReport.findUniqueOrThrow).mockResolvedValue(mockReport as any);

      const result = await dailyReportService.findById(mockReportId);

      expect(result).toEqual({ ...mockReport, student: { ...mockStudent, classId: 'class-123' } });
      expect(prisma.dailyStudentReport.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockReportId },
        })
      );
    });

    it('should throw error if report not found', async () => {
      vi.mocked(prisma.dailyStudentReport.findUniqueOrThrow).mockRejectedValue(
        new Error('Not found')
      );

      await expect(dailyReportService.findById('invalid-id')).rejects.toThrow();
    });
  });

  describe('findByStudentAndDate', () => {
    it('should find report by student and date', async () => {
      vi.mocked(prisma.dailyStudentReport.findUnique).mockResolvedValue(mockReport as any);

      const result = await dailyReportService.findByStudentAndDate(mockStudentId, mockReportDate);

      expect(result).toEqual(mockReport);
      expect(prisma.dailyStudentReport.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId_reportDate: {
              studentId: mockStudentId,
              reportDate: expect.any(Date),
            },
          },
        })
      );
    });

    it('should normalize date to midnight', async () => {
      vi.mocked(prisma.dailyStudentReport.findUnique).mockResolvedValue(null);

      const dateWithTime = new Date('2024-01-15T14:30:00');
      await dailyReportService.findByStudentAndDate(mockStudentId, dateWithTime);

      const calledWith = vi.mocked(prisma.dailyStudentReport.findUnique).mock.calls[0]![0] as any;
      const reportDate = calledWith.where.studentId_reportDate.reportDate;
      expect(reportDate.getHours()).toBe(0);
      expect(reportDate.getMinutes()).toBe(0);
      expect(reportDate.getSeconds()).toBe(0);
    });
  });

  // ============================================
  // CREATE
  // ============================================

  describe('create', () => {
    const createInput: CreateDailyReportInput = {
      studentId: mockStudentId,
      unitId: mockUnitId,
      academicYearId: mockAcademicYearId,
      reportDate: '2024-01-15',
      morningMood: 'HAPPY',
      healthNotes: 'Sehat',
      temperature: 36.5,
      breakfastConsumption: 'FULL',
      lunchConsumption: 'FULL',
      snackConsumption: 'HALF',
      napDurationMinutes: 60,
      toiletingNotes: 'Normal',
      activitiesSummary: 'Main balok',
      learningAchievements: 'Bisa menyusun balok tinggi',
      surahPractice: 'Al-Fatihah',
      behaviorNotes: 'Baik',
      parentNotes: 'Anak aktif',
      homeworkSuggestion: 'Latihan menggambar',
      photoUrls: ['https://example.com/photo1.jpg'],
    };

    beforeEach(() => {
      vi.mocked(prisma.unit.findUniqueOrThrow).mockResolvedValue(mockUnit as any);
      vi.mocked(prisma.dailyStudentReport.findUnique).mockResolvedValue(null);
    });

    it('should create a new daily report', async () => {
      vi.mocked(prisma.dailyStudentReport.create).mockResolvedValue(mockReport as any);

      const result = await dailyReportService.create(createInput, mockUserId);

      expect(result).toEqual(mockReport);
      expect(prisma.unit.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: mockUnitId },
        select: { type: true },
      });
      expect(prisma.dailyStudentReport.create).toHaveBeenCalledOnce();
    });

    it('should trigger WhatsApp notification when created', async () => {
      vi.mocked(prisma.dailyStudentReport.create).mockResolvedValue(mockReport as any);
      vi.mocked(prisma.student.findUnique).mockResolvedValue({
        ...mockStudent,
        parentPhone: '628123456789',
        parentName: 'Parent Name',
      } as any);

      await dailyReportService.create(createInput, mockUserId);

      expect(whatsAppService.sendDailyReportNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          parentPhone: '628123456789',
          parentName: 'Parent Name',
          studentName: 'Test Student',
        })
      );
    });

    it('should normalize report date to midnight', async () => {
      vi.mocked(prisma.dailyStudentReport.create).mockResolvedValue(mockReport as any);

      await dailyReportService.create(createInput, mockUserId);

      const calledWith = vi.mocked(prisma.dailyStudentReport.create).mock.calls[0]![0] as any;
      const reportDate = calledWith.data.reportDate;
      expect(reportDate.getHours()).toBe(0);
      expect(reportDate.getMinutes()).toBe(0);
    });

    it('should throw error if report already exists for date', async () => {
      vi.mocked(prisma.dailyStudentReport.findUnique).mockResolvedValue(mockReport as any);

      await expect(dailyReportService.create(createInput, mockUserId)).rejects.toThrow(
        'Daily report already exists'
      );
    });

    it('should create report with photos', async () => {
      vi.mocked(prisma.dailyStudentReport.create).mockResolvedValue(mockReport as any);

      await dailyReportService.create(createInput, mockUserId);

      const calledWith = vi.mocked(prisma.dailyStudentReport.create).mock.calls[0]![0] as any;
      expect(calledWith.data.photos).toHaveProperty('create');
      expect(Array.isArray(calledWith.data.photos.create)).toBe(true);
    });

    it('should handle breakfast consumption mapping', async () => {
      vi.mocked(prisma.dailyStudentReport.create).mockResolvedValue(mockReport as any);

      // 'HABIS' (finished) and 'SETENGAH' (half) map to hadBreakfast=true.
      await dailyReportService.create(
        { ...createInput, breakfastConsumption: 'HABIS' },
        mockUserId
      );

      const calledWith = vi.mocked(prisma.dailyStudentReport.create).mock.calls[0]![0] as any;
      expect(calledWith.data.hadBreakfast).toBe(true);
    });
  });

  describe('bulkCreate', () => {
    const bulkInput: BulkCreateDailyReportsInput = {
      unitId: mockUnitId,
      academicYearId: mockAcademicYearId,
      reportDate: '2024-01-15',
      reports: [
        {
          studentId: 'student-1',
          morningMood: 'HAPPY',
          healthNotes: 'Sehat',
          breakfastConsumption: 'FULL',
          lunchConsumption: 'FULL',
          activitiesSummary: 'Main',
          ibadahNotes: 'Berdoa',
          parentNotes: 'Baik',
        },
        {
          studentId: 'student-2',
          morningMood: 'NEUTRAL',
          healthNotes: 'Sehat',
          breakfastConsumption: 'HALF',
          lunchConsumption: 'HALF',
          activitiesSummary: 'Belajar',
          ibadahNotes: 'Hafalan',
          parentNotes: 'Aktif',
        },
      ],
    };

    beforeEach(() => {
      vi.mocked(prisma.unit.findUniqueOrThrow).mockResolvedValue(mockUnit as any);
    });

    it('should create multiple reports successfully', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.student.findMany).mockResolvedValue([
        { id: 'student-1', parentName: 'Parent 1', parentPhone: '123', user: { name: 'S1' } },
        { id: 'student-2', parentName: 'Parent 2', parentPhone: '456', user: { name: 'S2' } },
      ] as any);
      vi.mocked(prisma.dailyStudentReport.createMany).mockResolvedValue({ count: 2 } as any);

      const result = await dailyReportService.bulkCreate(bulkInput, mockUserId);

      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.details.success).toHaveLength(2);
      expect(prisma.dailyStudentReport.createMany).toHaveBeenCalledTimes(1);
    });

    it('should trigger WhatsApp notifications for multiple students', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.student.findMany).mockResolvedValue([
        {
          id: 'student-1',
          parentName: 'Parent 1',
          parentPhone: '628123456789',
          user: { name: 'S1' },
        },
        {
          id: 'student-2',
          parentName: 'Parent 2',
          parentPhone: '628987654321',
          user: { name: 'S2' },
        },
      ] as any);
      vi.mocked(prisma.dailyStudentReport.createMany).mockResolvedValue({ count: 2 } as any);

      await dailyReportService.bulkCreate(bulkInput, mockUserId);

      expect(whatsAppService.sendDailyReportNotification).toHaveBeenCalledTimes(2);
    });

    it('should handle duplicate reports', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([
        { studentId: 'student-1' },
      ] as any);
      vi.mocked(prisma.student.findMany).mockResolvedValue([
        { id: 'student-1', parentName: 'Parent 1', parentPhone: '123', user: { name: 'S1' } },
        { id: 'student-2', parentName: 'Parent 2', parentPhone: '456', user: { name: 'S2' } },
      ] as any);
      vi.mocked(prisma.dailyStudentReport.createMany).mockResolvedValue({ count: 1 } as any);

      const result = await dailyReportService.bulkCreate(bulkInput, mockUserId);

      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.details.failed[0].error).toContain('already exists');
    });

    it('should handle creation errors gracefully', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.student.findMany).mockResolvedValue([
        { id: 'student-1', parentName: 'Parent 1', parentPhone: '123', user: { name: 'S1' } },
        { id: 'student-2', parentName: 'Parent 2', parentPhone: '456', user: { name: 'S2' } },
      ] as any);

      vi.mocked(prisma.dailyStudentReport.createMany).mockRejectedValueOnce(
        new Error('Database error')
      );

      const result = await dailyReportService.bulkCreate(bulkInput, mockUserId);

      expect(result.created).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.details.failed[0].error).toBe('Database error');
    });
  });

  // ============================================
  // UPDATE
  // ============================================

  describe('update', () => {
    const updateInput: UpdateDailyReportInput = {
      morningMood: 'NEUTRAL',
      healthNotes: 'Agak lelah',
      temperature: 37.0,
      photoUrls: ['https://example.com/new-photo.jpg'],
    };

    it('should update daily report', async () => {
      const updatedReport = { ...mockReport, mood: 'NEUTRAL' as DailyMood };
      vi.mocked(prisma.dailyStudentReport.update).mockResolvedValue(updatedReport as any);

      const result = await dailyReportService.update(mockReportId, updateInput);

      expect(result.mood).toBe('NEUTRAL');
      expect(prisma.dailyStudentReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockReportId },
        })
      );
    });

    it('should update photos when provided', async () => {
      vi.mocked(prisma.dailyStudentReport.update).mockResolvedValue(mockReport as any);
      vi.mocked(prisma.dailyReportPhoto.deleteMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.dailyReportPhoto.createMany).mockResolvedValue({ count: 1 } as any);

      await dailyReportService.update(mockReportId, updateInput);

      expect(prisma.dailyReportPhoto.deleteMany).toHaveBeenCalledWith({
        where: { reportId: mockReportId },
      });
      expect(prisma.dailyReportPhoto.createMany).toHaveBeenCalled();
    });

    it('should delete photos when empty array provided', async () => {
      vi.mocked(prisma.dailyStudentReport.update).mockResolvedValue(mockReport as any);
      vi.mocked(prisma.dailyReportPhoto.deleteMany).mockResolvedValue({ count: 1 } as any);

      await dailyReportService.update(mockReportId, { ...updateInput, photoUrls: [] });

      expect(prisma.dailyReportPhoto.deleteMany).toHaveBeenCalled();
      expect(prisma.dailyReportPhoto.createMany).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // DELETE
  // ============================================

  describe('delete', () => {
    it('should delete daily report and photos', async () => {
      vi.mocked(prisma.dailyStudentReport.findUniqueOrThrow).mockResolvedValue(mockReport as any);
      vi.mocked(prisma.dailyReportPhoto.deleteMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.dailyStudentReport.delete).mockResolvedValue(mockReport as any);

      const result = await dailyReportService.delete(mockReportId);

      expect(result.message).toContain('deleted successfully');
      expect(prisma.dailyReportPhoto.deleteMany).toHaveBeenCalledWith({
        where: { reportId: mockReportId },
      });
      expect(prisma.dailyStudentReport.delete).toHaveBeenCalledWith({
        where: { id: mockReportId },
      });
    });

    it('should throw error if report not found', async () => {
      vi.mocked(prisma.dailyStudentReport.findUniqueOrThrow).mockRejectedValue(
        new Error('Not found')
      );

      await expect(dailyReportService.delete('invalid-id')).rejects.toThrow();
    });
  });

  // ============================================
  // PARENT CONFIRMATION
  // ============================================

  describe('confirmByParent', () => {
    it('should mark report as read by parent', async () => {
      const confirmedReport = { ...mockReport, parentReadAt: new Date() };
      vi.mocked(prisma.dailyStudentReport.update).mockResolvedValue(confirmedReport as any);

      const result = await dailyReportService.confirmByParent(mockReportId, {} as any, mockUserId);

      expect(result.parentReadAt).toBeTruthy();
      expect(prisma.dailyStudentReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockReportId },
          data: { parentReadAt: expect.any(Date) },
        })
      );
    });
  });

  // ============================================
  // SUMMARIES & STATISTICS
  // ============================================

  describe('getStudentMonthlySummary', () => {
    it('should calculate monthly summary statistics', async () => {
      const reports = [
        {
          ...mockReport,
          mood: 'HAPPY' as DailyMood,
          mealStatus: 'HABIS' as unknown as MealConsumption,
          snackStatus: null,
          napDuration: 60,
          parentReadAt: new Date(),
        },
        {
          ...mockReport,
          id: 'report-2',
          mood: 'NEUTRAL' as DailyMood,
          mealStatus: 'SETENGAH' as unknown as MealConsumption,
          snackStatus: null,
          napDuration: 45,
          parentReadAt: null,
        },
        {
          ...mockReport,
          id: 'report-3',
          mood: 'HAPPY' as DailyMood,
          mealStatus: null,
          snackStatus: 'SEDIKIT' as unknown as MealConsumption,
          napDuration: null,
          parentReadAt: new Date(),
        },
      ];
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue(reports as any);
      vi.mocked(prisma.student.findUnique).mockResolvedValue(mockStudent as any);

      const result = await dailyReportService.getStudentMonthlySummary({
        studentId: mockStudentId,
        academicYearId: mockAcademicYearId,
        month: 1,
        year: 2024,
      });

      expect(result.statistics.totalReports).toBe(3);
      expect(result.statistics.confirmedByParent).toBe(2);
      expect(result.statistics.moodDistribution.HAPPY).toBe(2);
      expect(result.statistics.moodDistribution.NEUTRAL).toBe(1);
    });

    it('should calculate meal statistics', async () => {
      const reports = [
        {
          id: 'report-1',
          studentId: mockStudentId,
          unitId: mockUnitId,
          academicYearId: mockAcademicYearId,
          reportDate: mockReportDate,
          unitType: 'TK_QURAN' as UnitType,
          mood: 'HAPPY' as DailyMood,
          mealStatus: 'HABIS' as unknown as MealConsumption,
          snackStatus: null,
          napDuration: 60,
          parentReadAt: new Date(),
          photos: [],
        },
        {
          id: 'report-2',
          studentId: mockStudentId,
          unitId: mockUnitId,
          academicYearId: mockAcademicYearId,
          reportDate: mockReportDate,
          unitType: 'TK_QURAN' as UnitType,
          mood: 'NEUTRAL' as DailyMood,
          mealStatus: 'SETENGAH' as unknown as MealConsumption,
          snackStatus: null,
          napDuration: 45,
          parentReadAt: null,
          photos: [],
        },
        {
          id: 'report-3',
          studentId: mockStudentId,
          unitId: mockUnitId,
          academicYearId: mockAcademicYearId,
          reportDate: mockReportDate,
          unitType: 'TK_QURAN' as UnitType,
          mood: 'HAPPY' as DailyMood,
          mealStatus: null,
          snackStatus: 'SEDIKIT' as unknown as MealConsumption,
          napDuration: null,
          parentReadAt: new Date(),
          photos: [],
        },
      ];
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue(reports as any);
      vi.mocked(prisma.student.findUnique).mockResolvedValue(mockStudent as any);

      const result = await dailyReportService.getStudentMonthlySummary({
        studentId: mockStudentId,
        academicYearId: mockAcademicYearId,
        month: 1,
        year: 2024,
      });

      expect(result.statistics.mealStats.meal.HABIS).toBe(1);
      expect(result.statistics.mealStats.meal.SETENGAH).toBe(1);
      expect(result.statistics.mealStats.meal.SEDIKIT).toBe(0);
      expect(result.statistics.mealStats.meal.TIDAK_MAU).toBe(0);
      expect(result.statistics.mealStats.snack.SEDIKIT).toBe(1);
      expect(result.statistics.mealStats.snack.HABIS).toBe(0);
      expect(result.statistics.mealStats.snack.SETENGAH).toBe(0);
      expect(result.statistics.mealStats.snack.TIDAK_MAU).toBe(0);
    });

    it('should calculate average nap duration', async () => {
      const reports = [
        {
          ...mockReport,
          mood: 'HAPPY' as DailyMood,
          mealStatus: 'HABIS' as unknown as MealConsumption,
          snackStatus: null,
          napDuration: 60,
          parentReadAt: new Date(),
        },
        {
          ...mockReport,
          id: 'report-2',
          mood: 'NEUTRAL' as DailyMood,
          mealStatus: 'SETENGAH' as unknown as MealConsumption,
          snackStatus: null,
          napDuration: 45,
          parentReadAt: null,
        },
        {
          ...mockReport,
          id: 'report-3',
          mood: 'HAPPY' as DailyMood,
          mealStatus: null,
          snackStatus: 'SEDIKIT' as unknown as MealConsumption,
          napDuration: null,
          parentReadAt: new Date(),
        },
      ];
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue(reports as any);
      vi.mocked(prisma.student.findUnique).mockResolvedValue(mockStudent as any);

      const result = await dailyReportService.getStudentMonthlySummary({
        studentId: mockStudentId,
        academicYearId: mockAcademicYearId,
        month: 1,
        year: 2024,
      });

      // Average of 60 and 45 = 52.5, rounded to 53
      expect(result.statistics.averageNapDuration).toBe(53);
    });

    it('should use current month/year if not provided', async () => {
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.student.findUnique).mockResolvedValue(mockStudent as any);

      await dailyReportService.getStudentMonthlySummary({
        studentId: mockStudentId,
        academicYearId: mockAcademicYearId,
      });

      const calledWith = vi.mocked(prisma.dailyStudentReport.findMany).mock.calls[0]![0] as any;
      expect(calledWith.where.reportDate).toHaveProperty('gte');
      expect(calledWith.where.reportDate).toHaveProperty('lte');
    });
  });

  describe('getClassDailySummary', () => {
    const mockStudents = [
      { id: 'student-1', nisn: '001', user: { name: 'Student 1' } },
      { id: 'student-2', nisn: '002', user: { name: 'Student 2' } },
      { id: 'student-3', nisn: '003', user: { name: 'Student 3' } },
    ];

    const mockReports = [
      {
        ...mockReport,
        studentId: 'student-1',
        mood: 'HAPPY' as DailyMood,
        parentReadAt: new Date(),
        student: mockStudents[0],
      },
      {
        ...mockReport,
        id: 'report-2',
        studentId: 'student-2',
        mood: 'SICK' as DailyMood,
        parentReadAt: null,
        student: mockStudents[1],
      },
    ];

    beforeEach(() => {
      vi.mocked(prisma.student.findMany).mockResolvedValue(mockStudents as any);
      vi.mocked(prisma.dailyStudentReport.findMany).mockResolvedValue(mockReports as any);
    });

    it('should calculate class daily summary', async () => {
      const result = await dailyReportService.getClassDailySummary({
        unitId: mockUnitId,
        academicYearId: mockAcademicYearId,
        date: '2024-01-15',
      });

      expect(result.totalStudents).toBe(3);
      expect(result.reportsSubmitted).toBe(2);
      expect(result.pendingReports).toBe(1);
      expect(result.confirmedByParents).toBe(1);
    });

    it('should calculate mood overview', async () => {
      const result = await dailyReportService.getClassDailySummary({
        unitId: mockUnitId,
        academicYearId: mockAcademicYearId,
        date: '2024-01-15',
      });

      expect(result.moodOverview.happy).toBe(1);
      expect(result.moodOverview.sick).toBe(1);
    });

    it('should list students with and without reports', async () => {
      const result = await dailyReportService.getClassDailySummary({
        unitId: mockUnitId,
        academicYearId: mockAcademicYearId,
        date: '2024-01-15',
      });

      expect(result.studentsWithReports).toHaveLength(2);
      expect(result.studentsWithoutReports).toHaveLength(1);
      expect(result.studentsWithoutReports[0].studentId).toBe('student-3');
    });

    it('should use current date if not provided', async () => {
      await dailyReportService.getClassDailySummary({
        unitId: mockUnitId,
        academicYearId: mockAcademicYearId,
      });

      const calledWith = vi.mocked(prisma.dailyStudentReport.findMany).mock.calls[0]![0] as any;
      expect(calledWith.where.reportDate).toHaveProperty('gte');
      expect(calledWith.where.reportDate).toHaveProperty('lt');
    });
  });
});
