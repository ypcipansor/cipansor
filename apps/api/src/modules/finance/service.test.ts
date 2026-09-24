import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import * as prismaClient from '@prisma/client';

// Mock prisma before imports
vi.mock('../../lib/prisma', () => {
  const mockPrisma = {
    paymentType: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    student: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => ({ unitId: 'unit-1' })),
    },
    scholarshipRecipient: {
      // No active scholarships by default — invoice amount stays as-is.
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(),
  };
  mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
  return { prisma: mockPrisma };
});

import { prisma } from '../../lib/prisma';
import * as financeService from './finance.service';
import * as notificationService from '../notifications/notifications.service';

import { eventBus } from '@/lib/event-bus';

vi.mock('../notifications/notifications.service', () => ({
  createNotification: vi.fn(),
}));

vi.mock('@/lib/event-bus', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe('Finance Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPaymentType', () => {
    it('should create a payment type successfully', async () => {
      const dto = {
        name: 'SPP',
        code: 'SPP-01',
        description: 'Sumbangan Pembinaan Pendidikan',
        isRecurring: true,
        isActive: true,
        amount: 500000,
        unitId: 'unit-1',
      };

      const mockCreated = {
        id: 'pt-1',
        ...dto,
        amount: new Prisma.Decimal(500000),
        unit: { id: 'unit-1', name: 'SMA' },
      };

      vi.mocked(prisma.paymentType.create).mockResolvedValue(mockCreated as any);

      const result = await financeService.createPaymentType(dto);

      expect(prisma.paymentType.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          code: dto.code,
          description: dto.description,
          isRecurring: dto.isRecurring,
          isActive: dto.isActive,
          amount: expect.any(Prisma.Decimal),
          unit: { connect: { id: dto.unitId } },
          account: undefined,
        },
        include: { unit: { select: { id: true, name: true } } },
      });

      expect(result).toEqual(mockCreated);
    });
  });

  describe('createInvoice', () => {
    it('should create an invoice and send notification', async () => {
      const dto = {
        title: 'Pembayaran SPP Januari',
        amount: 500000,
        dueDate: '2026-03-01T00:00:00.000Z',
        studentId: 'stud-1',
        paymentTypeId: 'pt-1',
      };

      const mockInvoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-202602-00001',
        student: {
          user: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
          unit: { id: 'unit-1', name: 'SMA' },
        },
        paymentType: { id: 'pt-1', name: 'SPP', code: 'SPP-01' },
        amount: new Prisma.Decimal(500000),
        dueDate: new Date(dto.dueDate),
      };

      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      // The invoice's unit of record comes from the payment type that raised
      // it; there is no fallback to the pupil's current unit.
      vi.mocked(prisma.paymentType.findUnique).mockResolvedValue({
        id: 'pt-1',
        unitId: 'unit-1',
      } as any);
      vi.mocked(prisma.invoice.create).mockResolvedValue(mockInvoice as any);
      vi.mocked(notificationService.createNotification).mockResolvedValue({} as any);

      const result = await financeService.createInvoice(dto);

      expect(prisma.invoice.findFirst).toHaveBeenCalled();
      expect(prisma.invoice.create).toHaveBeenCalled();
      // The issuing unit is frozen onto the invoice so a later transfer cannot
      // relocate its arrears to the pupil's new unit.
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitId: 'unit-1' }),
        })
      );
      expect(notificationService.createNotification).toHaveBeenCalled();
      expect(result).toEqual(mockInvoice);
    });

    it('should apply an active scholarship percentage discount to the invoice amount', async () => {
      const dto = {
        title: 'Pembayaran SPP Januari',
        amount: 500000,
        dueDate: '2026-03-01T00:00:00.000Z',
        studentId: 'stud-1',
        paymentTypeId: 'pt-1',
      };

      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.scholarshipRecipient.findMany).mockResolvedValue([
        {
          id: 'rec-1',
          scholarship: {
            discounts: [
              {
                componentId: 'pt-1',
                discountType: 'PERCENTAGE',
                discountValue: new Prisma.Decimal(50),
              },
              // Discount for a different payment type must be ignored.
              {
                componentId: 'pt-other',
                discountType: 'PERCENTAGE',
                discountValue: new Prisma.Decimal(100),
              },
            ],
          },
        },
      ] as any);
      vi.mocked(prisma.paymentType.findUnique).mockResolvedValue({
        id: 'pt-1',
        unitId: 'unit-1',
      } as any);
      vi.mocked(prisma.invoice.create).mockResolvedValue({
        id: 'inv-2',
        student: { user: { id: 'u1' }, unit: { id: 'unit-1' } },
      } as any);
      vi.mocked(notificationService.createNotification).mockResolvedValue({} as any);

      await financeService.createInvoice(dto);

      const createArgs = vi.mocked(prisma.invoice.create).mock.calls[0][0];
      expect(Number(createArgs.data.amount)).toBe(250000);
    });
  });

  describe('generateBulkSppInvoices — unit of record', () => {
    it("freezes the invoice unit on the payment type's unit, not the student's", async () => {
      // The bulk SPP generator already loads the payment type; the invoice must
      // carry its unit so a pupil who later transfers does not drag the arrears
      // from SD IT's books into SMP IT's.
      vi.mocked(prisma.paymentType.findUnique).mockResolvedValue({
        id: 'pt-spp-sd',
        name: 'SPP SD IT',
        amount: new Prisma.Decimal(350000),
        unitId: 'unit-sd',
      } as any);
      vi.mocked(prisma.student.findMany).mockResolvedValue([
        { id: 'student-1', unitId: 'unit-smp' } as any,
      ]);
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.invoice.create).mockResolvedValue({ id: 'inv-1' } as any);

      await financeService.generateBulkSppInvoices({
        paymentTypeId: 'pt-spp-sd',
        year: 2026,
        month: 0,
      });

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'student-1',
            unitId: 'unit-sd',
          }),
        })
      );
    });
  });
});

describe('generateBulkSppInvoices', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bills only santri who are still enrolled, never alumni or those who left', async () => {
    (prisma.paymentType.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pt-spp',
      name: 'SPP',
      amount: new Prisma.Decimal(350000),
    });
    const findStudents = (prisma as unknown as { student: { findMany: ReturnType<typeof vi.fn> } })
      .student.findMany;
    findStudents.mockResolvedValue([]);

    await financeService.generateBulkSppInvoices({
      unitId: 'unit-1',
      paymentTypeId: 'pt-spp',
      year: 2026,
      month: 9,
    });

    expect(findStudents).toHaveBeenCalledWith({
      where: expect.objectContaining({ unitId: 'unit-1', status: 'active', deletedAt: null }),
    });
  });
});
