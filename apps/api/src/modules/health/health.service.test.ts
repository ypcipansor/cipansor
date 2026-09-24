import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import * as healthService from './health.service';
import { attendanceService } from '../attendance/attendance.service';
import { eventBus } from '../../lib/event-bus';

// Mock external dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    medicalRecord: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    medication: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    medicationUsageLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    growthRecord: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    classEnrollment: {
      findFirst: vi.fn(),
    },
    studentParent: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock('../attendance/attendance.service', () => ({
  attendanceService: {
    create: vi.fn(),
  },
}));

vi.mock('../../lib/event-bus', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));
vi.mock('../../lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMedicalRecord', () => {
    it('should create medical record and not trigger external things if flags are false', async () => {
      const dto = {
        studentId: 'std-1',
        type: 'SICK' as any,
        visitDate: new Date(),
        complaint: 'Pusing',
        temperature: 38.5,
      };

      const mockRecord = {
        id: 'med-1',
        ...dto,
        student: { id: 'std-1', user: { name: 'Ali' } },
        status: 'OPEN',
      };

      vi.mocked(prisma.medicalRecord.create).mockResolvedValue(mockRecord as any);

      const result = await healthService.createMedicalRecord(dto, 'user-1');

      expect(prisma.medicalRecord.create).toHaveBeenCalled();
      expect(attendanceService.create).not.toHaveBeenCalled();

      // eventBus.emit is always called for dashboard update
      expect(eventBus.emit).toHaveBeenCalledWith(
        'health:medical-record-created',
        expect.any(Object)
      );
      expect(result).toHaveProperty('id', 'med-1');
    });

    it('should create attendance if createAttendance is true', async () => {
      const dto = {
        studentId: 'std-1',
        type: 'SICK' as any,
        visitDate: new Date(),
        complaint: 'Demam',
        createAttendance: true,
      };

      vi.mocked(prisma.medicalRecord.create).mockResolvedValue({
        id: 'med-2',
        student: { id: 'std-2', user: { name: 'Test User' } },
      } as any);
      vi.mocked(prisma.classEnrollment.findFirst).mockResolvedValue({ classId: 'cls-1' } as any);

      await healthService.createMedicalRecord(dto, 'user-1');

      expect(prisma.classEnrollment.findFirst).toHaveBeenCalledWith({
        where: { studentId: 'std-1', status: 'active' },
        select: { classId: true },
      });
      expect(attendanceService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'std-1',
          classId: 'cls-1',
          status: 'SICK',
        }),
        'user-1'
      );
    });

    it('should notify parents if notifyParent is true', async () => {
      const dto = {
        studentId: 'std-1',
        type: 'SICK' as any,
        visitDate: new Date(),
        complaint: 'Demam',
        notifyParent: true,
      };

      vi.mocked(prisma.medicalRecord.create).mockResolvedValue({
        id: 'med-3',
        student: { user: { name: 'Budi' } },
      } as any);

      vi.mocked(prisma.studentParent.findMany).mockResolvedValue([{ parentId: 'parent-1' }] as any);

      await healthService.createMedicalRecord(dto, 'user-1');

      expect(prisma.studentParent.findMany).toHaveBeenCalledWith({
        where: { studentId: 'std-1' },
        include: { parent: true },
      });

      expect(eventBus.emit).toHaveBeenCalledWith(
        'notification:send',
        expect.objectContaining({
          userId: 'parent-1',
          type: 'HEALTH',
        })
      );
    });
  });

  describe('createMedicationUsage', () => {
    it('should reduce available medication stock', async () => {
      const dto = {
        medicationId: 'med-1',
        studentId: 'std-1',
        quantity: 2,
        reason: 'Sakit kepala',
      };

      vi.mocked(prisma.medication.findUnique).mockResolvedValue({
        id: 'med-1',
        quantity: 10,
      } as any);
      vi.mocked(prisma.medicationUsageLog.create).mockResolvedValue({ id: 'log-1' } as any);
      vi.mocked(prisma.medication.update).mockResolvedValue({} as any);

      await healthService.createMedicationUsage(dto, 'user-1');

      expect(prisma.medicationUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          medicationId: 'med-1',
          quantity: 2,
        }),
        include: expect.any(Object),
      });

      expect(prisma.medication.update).toHaveBeenCalledWith({
        where: { id: 'med-1' },
        data: { quantity: { decrement: 2 } },
      });
    });

    it('should throw error if insufficient stock', async () => {
      const dto = {
        medicationId: 'med-1',
        studentId: 'std-1',
        quantity: 5,
        reason: 'Sakit kepala',
      };

      vi.mocked(prisma.medication.findUnique).mockResolvedValue({
        id: 'med-1',
        quantity: 2,
      } as any);

      await expect(healthService.createMedicationUsage(dto, 'user-1')).rejects.toThrow(
        'Insufficient medication stock'
      );
    });
  });

  describe('getHealthStats', () => {
    it('should return aggregated stats', async () => {
      vi.mocked(prisma.medication.findMany).mockResolvedValue([
        { quantity: 5, minStock: 10 },
      ] as any);
      vi.mocked(prisma.medication.count).mockResolvedValue(2);
      vi.mocked(prisma.medicalRecord.count).mockResolvedValue(15);
      vi.mocked(prisma.medicalRecord.groupBy).mockResolvedValue([
        { type: 'SICK', _count: 10 },
        { type: 'CHECKUP', _count: 5 },
      ] as any);

      const stats = await healthService.getHealthStats('unit-1');

      expect(stats.medications.total).toBe(1);
      expect(stats.medications.lowStock).toBe(1); // 5 <= 10
      expect(stats.medications.expired).toBe(2);
      expect(stats.thisMonthRecords).toBe(15);
      expect(stats.recordsByType).toHaveLength(2);
    });
  });
});
