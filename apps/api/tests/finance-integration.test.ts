import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as financeService from '../src/modules/finance/finance.service';
import * as notificationService from '../src/modules/notifications/notifications.service';
import { prisma } from '../src/lib/prisma';
import { PaymentStatus, NotificationType, PaymentMethod, Prisma } from '@prisma/client';

// Mock dependencies
vi.mock('../src/modules/notifications/notifications.service', () => ({
  createNotification: vi.fn(),
}));

// We need to return the PAYMENT from the transaction mock
vi.mock('../src/lib/prisma', () => {
  const mockPrisma = {
    invoice: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
    },
    scholarshipRecipient: {
      // No active scholarships by default — invoice amount stays as-is.
      findMany: vi.fn(async () => []),
    },
    student: {
      findUnique: vi.fn(async () => ({ unitId: 'unit-1' })),
    },
    paymentType: {
      // The issuing unit is the payment type's, not the student's.
      findUnique: vi.fn(async () => ({ unitId: 'unit-1' })),
    },
    $transaction: vi.fn(async (callback) => {
      // Execute the callback with the mockPrisma
      return await callback(mockPrisma);
    }),
  };
  return { prisma: mockPrisma };
});

describe('Finance Service Integration', () => {
  const mockDate = new Date('2024-01-01');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createInvoice', () => {
    it('should create an invoice and trigger a notification', async () => {
      // Setup Mocks
      const mockInvoice = {
        id: 'inv-123',
        invoiceNumber: 'INV-202401-00001',
        amount: { toNumber: () => 500000, add: vi.fn(), sub: vi.fn() },
        dueDate: new Date('2024-01-10'),
        student: {
          user: { id: 'user-1' },
        },
        paymentType: { name: 'SPP Januari' },
      };

      (prisma.invoice.findFirst as any).mockResolvedValue(null); // First invoice of month
      (prisma.invoice.create as any).mockResolvedValue(mockInvoice);

      // Execute
      const result = await financeService.createInvoice({
        studentId: 'student-1',
        paymentTypeId: 'type-1',
        amount: 500000,
        dueDate: '2024-01-10T00:00:00Z',
      });

      // Assert
      expect(prisma.invoice.create).toHaveBeenCalled();
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          title: 'Tagihan Baru',
          type: NotificationType.PAYMENT,
        })
      );
      expect(result).toEqual(mockInvoice);
    });

    it('should retry generating invoice number on collision', async () => {
      (prisma.invoice.findFirst as any).mockResolvedValue(null);
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.x',
      });

      (prisma.invoice.create as any).mockRejectedValueOnce(p2002Error).mockResolvedValueOnce({
        id: 'inv-123',
        invoiceNumber: 'INV-202401-00001',
        amount: { toNumber: () => 500000 },
        dueDate: new Date(),
        student: { user: { id: 'u1' } },
        paymentType: { name: 'SPP' },
      });

      await financeService.createInvoice({
        studentId: 's1',
        paymentTypeId: 'pt1',
        amount: 500000,
        dueDate: '2024-01-10',
      });

      expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
    });

    it("attributes the invoice to the payment type's unit, not the student's", async () => {
      // A "SPP SMP IT" bill raised for a pupil now enrolled at SMA belongs to
      // SMP IT's books. Taking `student.unitId` filed the arrears under the
      // wrong unit, so the oversight report blamed the wrong school.
      (prisma.paymentType.findUnique as any).mockResolvedValueOnce({ unitId: 'unit-smpit' });
      (prisma.student.findUnique as any).mockResolvedValueOnce({ unitId: 'unit-smaq' });
      (prisma.invoice.findFirst as any).mockResolvedValue(null);
      (prisma.invoice.create as any).mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-202401-00001',
        amount: { toNumber: () => 500000 },
        dueDate: new Date(),
        student: { user: { id: 'u1' } },
        paymentType: { name: 'SPP' },
      });

      await financeService.createInvoice({
        studentId: 's1',
        paymentTypeId: 'pt-smpit',
        amount: 500000,
        dueDate: '2024-01-10',
      });

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitId: 'unit-smpit' }),
        })
      );
    });

    it('refuses to raise an invoice whose payment type cannot be resolved', async () => {
      // There is no honest unit of record for an invoice with no payment type.
      // The old code fell back to `student.unitId` — the pupil's *current* unit
      // — which is exactly the moving attribution that let a transfer relocate
      // historical arrears. Refuse instead of guessing.
      (prisma.paymentType.findUnique as any).mockResolvedValueOnce(null);
      (prisma.invoice.findFirst as any).mockResolvedValue(null);

      await expect(
        financeService.createInvoice({
          studentId: 's1',
          paymentTypeId: 'pt-1',
          amount: 500000,
          dueDate: '2024-01-10',
        })
      ).rejects.toThrow(/cannot attribute the invoice/);

      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('createPayment', () => {
    it('should create payment and trigger notification', async () => {
      const mockInvoice = {
        id: 'inv-123',
        amount: { toNumber: () => 100000, sub: vi.fn(), add: vi.fn(), gte: vi.fn(), gt: vi.fn() },
        paidAmount: { add: vi.fn(() => ({ gte: () => true, gt: () => true })) },
        // No accountId → accounting journal integration is skipped.
        paymentType: { accountId: null },
        student: { unitId: 'unit-1', user: { id: 'user-1' } },
      };

      const mockPayment = {
        id: 'pay-1',
        amount: { toNumber: () => 100000 },
        invoice: {
          id: 'inv-123',
          student: { user: { id: 'user-1' } },
          paymentType: { name: 'SPP' },
        },
      };

      (prisma.invoice.findUnique as any).mockResolvedValue(mockInvoice);
      (prisma.payment.create as any).mockResolvedValue(mockPayment);
      (prisma.invoice.update as any).mockResolvedValue(mockInvoice);

      // Execute
      await financeService.createPayment({
        invoiceId: 'inv-123',
        amount: 100000,
        method: PaymentMethod.CASH,
      });

      // Assert
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          title: 'Pembayaran Berhasil',
          type: NotificationType.PAYMENT,
        })
      );
    });
  });
});
