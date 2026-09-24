import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use a factory function for mocking to ensure hoisting
const prismaMock = vi.hoisted(() => ({
  permit: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn((callback) =>
    callback({
      permit: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      classEnrollment: {
        findFirst: vi.fn(),
      },
      attendance: {
        updateMany: vi.fn(),
        createMany: vi.fn(),
      },
    })
  ),
}));

// Mock the prisma library with the CORRECT RELATIVE PATH
// File is in apps/api/tests/unit/modules/permits/
// Path to src/lib/prisma is ../../../../src/lib/prisma
vi.mock('../../../../src/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../../src/modules/notifications/notifications.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock Prisma Client Enums
vi.mock('@prisma/client', () => ({
  PermitType: {
    SAKIT: 'SAKIT',
    IZIN: 'IZIN',
  },
  PermitStatus: {
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
  },
  NotificationType: {
    INFO: 'INFO',
  },
}));

import {
  markDeparted,
  markReturned,
  createPermit,
} from '../../../../src/modules/permits/permits.service';
import { PermitStatus, PermitType, NotificationType } from '@prisma/client';
import { createNotification } from '../../../../src/modules/notifications/notifications.service';

describe('Permit Gate Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockPermitId = 'permit-123';
  const mockStudentId = 'student-123';
  const mockParentId = 'parent-123';

  const mockPermit = {
    id: mockPermitId,
    code: 'PMT-TEST',
    status: PermitStatus.APPROVED,
    studentId: mockStudentId,
    student: {
      user: { name: 'Ahmad' },
      parents: [{ parentId: mockParentId, parent: { id: mockParentId } }],
    },
    departedAt: null,
    returnedAt: null,
  };

  describe('markDeparted', () => {
    it('should mark permit as departed and notify parent', async () => {
      // Setup
      prismaMock.permit.findUnique.mockResolvedValue(mockPermit as any);
      prismaMock.permit.update.mockResolvedValue({ ...mockPermit, departedAt: new Date() } as any);

      // Execute
      await markDeparted(mockPermitId);

      // Verify
      expect(prismaMock.permit.update).toHaveBeenCalledWith({
        where: { id: mockPermitId },
        data: { departedAt: expect.any(Date) },
      });
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockParentId,
          type: NotificationType.INFO,
          title: 'Santri Keluar',
        })
      );
    });

    it('should throw if permit is not APPROVED', async () => {
      prismaMock.permit.findUnique.mockResolvedValue({
        ...mockPermit,
        status: PermitStatus.PENDING,
      } as any);

      await expect(markDeparted(mockPermitId)).rejects.toThrow('Permit must be APPROVED to depart');
    });
  });

  describe('markReturned', () => {
    it('should mark permit as completed and returned', async () => {
      prismaMock.permit.findUnique.mockResolvedValue(mockPermit as any);
      prismaMock.permit.update.mockResolvedValue({
        ...mockPermit,
        status: PermitStatus.COMPLETED,
        returnedAt: new Date(),
      } as any);

      await markReturned(mockPermitId);

      expect(prismaMock.permit.update).toHaveBeenCalledWith({
        where: { id: mockPermitId },
        data: {
          status: PermitStatus.COMPLETED,
          returnedAt: expect.any(Date),
        },
      });
    });
  });

  describe('createPermit', () => {
    it('should generate a unique code', async () => {
      const input = {
        studentId: mockStudentId,
        type: PermitType.SAKIT,
        reason: 'Fever',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      };

      prismaMock.permit.findUnique.mockResolvedValueOnce(null); // Unique check pass
      prismaMock.permit.create.mockResolvedValue({ ...mockPermit, code: 'PMT-GEN' } as any);

      await createPermit(input);

      expect(prismaMock.permit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: expect.stringMatching(/^PMT-/),
          }),
        })
      );
    });
  });
});
