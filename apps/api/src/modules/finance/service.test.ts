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
      findFirst: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    academicYear: {
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

// The billing screens read these four. They had no unit filter and returned
// every Student column (NIK, family-card number, parents' NIK and income).
describe('bill and payment reads: scope and fields', () => {
  const smpTu = { sub: 'u-tu', role: 'STAFF', roleCode: 'SMPIT_TATA_USAHA', unitId: 'unit-smp' };
  const ketua = { sub: 'u-ketua', role: 'UNIT_ADMIN', roleCode: 'YAYASAN_KETUA', unitId: null };
  const parent = {
    sub: 'u-parent',
    role: 'PARENT',
    roleCode: 'SMPIT_ORANG_TUA',
    unitId: 'unit-smp',
  };
  const page = { page: 1, limit: 20 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.invoice.count).mockResolvedValue(0 as any);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.payment.count).mockResolvedValue(0 as any);
  });

  const lastInvoiceQuery = () => vi.mocked(prisma.invoice.findMany).mock.calls[0][0] as any;

  it("a unit's TU lists only bills of their own unit", async () => {
    await financeService.getInvoices(page as any, smpTu);
    const { where } = lastInvoiceQuery();
    expect(where.AND).toContainEqual({ paymentType: { unitId: 'unit-smp' } });
    expect(vi.mocked(prisma.invoice.count).mock.calls[0][0]).toEqual({ where });
  });

  it('the yayasan board lists every unit', async () => {
    await financeService.getInvoices(page as any, ketua);
    expect(lastInvoiceQuery().where.AND[0]).toEqual({});
  });

  it('returns a name and a NIS for the student, not the whole record', async () => {
    await financeService.getInvoices(page as any, smpTu);
    const { include } = lastInvoiceQuery();
    expect(include.student.select).toEqual({
      id: true,
      nis: true,
      unitId: true,
      user: { select: { id: true, name: true } },
    });
    expect(include.student.include).toBeUndefined();
  });

  it('lists the newest bills first', async () => {
    await financeService.getInvoices(page as any, smpTu);
    expect(lastInvoiceQuery().orderBy[0]).toEqual({ dueDate: 'desc' });
  });

  it('searches invoice number, NIS and santri name', async () => {
    await financeService.getInvoices({ ...page, search: ' rizky ' } as any, smpTu);
    const filters = lastInvoiceQuery().where.AND[1];
    expect(filters.OR).toEqual([
      { invoiceNumber: { contains: 'rizky', mode: 'insensitive' } },
      { student: { nis: { contains: 'rizky' } } },
      { student: { user: { name: { contains: 'rizky', mode: 'insensitive' } } } },
    ]);
  });

  it('filters a kind of bill by code across units', async () => {
    await financeService.getInvoices({ ...page, paymentTypeCode: 'SPP' } as any, ketua);
    expect(lastInvoiceQuery().where.AND[1].paymentType).toEqual({ code: 'SPP' });
  });

  it("an academic year means its months, so July's SPP (due the 10th) is in it", async () => {
    vi.mocked(prisma.academicYear.findUnique).mockResolvedValue({
      startDate: new Date('2026-07-15T00:00:00Z'),
      endDate: new Date('2027-06-30T00:00:00Z'),
    } as any);
    await financeService.getInvoices({ ...page, academicYearId: 'ay-2627' } as any, smpTu);
    const { dueDate } = lastInvoiceQuery().where.AND[1];
    expect(dueDate).toEqual({
      gte: new Date('2026-07-01T00:00:00Z'),
      lt: new Date('2027-07-01T00:00:00Z'),
    });
    const julySpp = new Date('2026-07-10T00:00:00Z');
    expect(julySpp >= dueDate.gte && julySpp < dueDate.lt).toBe(true);
  });

  it('an unknown academic year matches nothing instead of every year', async () => {
    vi.mocked(prisma.academicYear.findUnique).mockResolvedValue(null);
    await financeService.getInvoices({ ...page, academicYearId: 'gone' } as any, smpTu);
    const { dueDate } = lastInvoiceQuery().where.AND[1];
    expect(dueDate.gte.getTime()).toBe(dueDate.lt.getTime());
  });

  it('a bill of another unit is not found', async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const bill = await financeService.getInvoiceById('inv-sma', smpTu);
    expect(bill).toBeNull();
    const arg = vi.mocked(prisma.invoice.findFirst).mock.calls[0][0] as any;
    expect(arg.where.AND).toEqual([{ id: 'inv-sma' }, { paymentType: { unitId: 'unit-smp' } }]);
    expect(arg.include.student.select.nik).toBeUndefined();
  });

  it("a parent opens only payments on their own children's bills", async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    await financeService.getPaymentById('pay-1', parent);
    const arg = vi.mocked(prisma.payment.findFirst).mock.calls[0][0] as any;
    expect(arg.where.AND).toEqual([
      { id: 'pay-1' },
      { invoice: { student: { parents: { some: { parentId: 'u-parent' } } } } },
    ]);
  });

  it("the payments list is scoped to the TU's unit", async () => {
    await financeService.getPayments(page as any, smpTu);
    const arg = vi.mocked(prisma.payment.findMany).mock.calls[0][0] as any;
    expect(arg.where.AND[0]).toEqual({ invoice: { paymentType: { unitId: 'unit-smp' } } });
    expect(arg.include.invoice.include.student.select.user).toEqual({
      select: { id: true, name: true },
    });
  });

  it('the summary adds up only the bills the list would show', async () => {
    vi.mocked(prisma.academicYear.findUnique).mockResolvedValue({
      startDate: new Date('2026-07-15T00:00:00Z'),
      endDate: new Date('2027-06-30T00:00:00Z'),
    } as any);
    await financeService.getFinancialSummary(smpTu, 'ay-2627');
    const invoiceWhere = (vi.mocked(prisma.invoice.findMany).mock.calls[0][0] as any).where;
    expect(invoiceWhere.AND).toEqual([
      { paymentType: { unitId: 'unit-smp' } },
      { dueDate: { gte: new Date('2026-07-01T00:00:00Z'), lt: new Date('2027-07-01T00:00:00Z') } },
    ]);
    const paymentWhere = (vi.mocked(prisma.payment.findMany).mock.calls[0][0] as any).where;
    expect(paymentWhere).toEqual({ invoice: invoiceWhere });
  });
});
