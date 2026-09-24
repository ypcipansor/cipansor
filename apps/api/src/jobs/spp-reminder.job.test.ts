import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: { findMany: vi.fn() },
    notification: { create: vi.fn().mockResolvedValue({ id: 'n1' }) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('@/modules/notifications/notifications.service', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 'n1' }),
}));
vi.mock('@/modules/notifications/email-sms.service', () => ({
  notificationService: { send: vi.fn().mockResolvedValue({ success: true }) },
}));

import { prisma } from '@/lib/prisma';
import * as notificationService from '@/modules/notifications/notifications.service';
import { notificationService as channelService } from '@/modules/notifications/email-sms.service';
import { sendMonthlySppReminders } from './spp-reminder.job';

const mockFindMany = prisma.invoice.findMany as unknown as ReturnType<typeof vi.fn>;
const mockCreateNotification = notificationService.createNotification as unknown as ReturnType<
  typeof vi.fn
>;
const mockSend = channelService.send as unknown as ReturnType<typeof vi.fn>;

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    amount: new Prisma.Decimal(500000),
    paidAmount: new Prisma.Decimal(0),
    period: 'Juli 2026',
    dueDate: new Date('2026-07-10'),
    paymentType: { name: 'SPP' },
    student: {
      id: 's1',
      user: { name: 'Ahmad' },
      parents: [
        { parent: { id: 'p1', name: 'Bapak Ahmad', phone: '+6281234567890' } },
        { parent: { id: 'p2', name: 'Ibu Ahmad', phone: null } },
      ],
    },
    ...overrides,
  };
}

describe('sendMonthlySppReminders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies every linked parent in-app and via WhatsApp when a phone exists', async () => {
    mockFindMany.mockResolvedValue([invoice()]);

    const result = await sendMonthlySppReminders(new Date('2026-07-01'));

    expect(result).toEqual({ invoices: 1, notified: 2 });
    // In-app for both parents
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification.mock.calls.map((c) => c[0].userId).sort()).toEqual(['p1', 'p2']);
    expect(mockCreateNotification.mock.calls[0][0].link).toBe('/parent/finance');
    // WhatsApp only for the parent with a phone number
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      channel: 'WHATSAPP',
      recipientPhone: '+6281234567890',
    });
    expect(mockSend.mock.calls[0][0].message).toContain('SPP');
    expect(mockSend.mock.calls[0][0].message).toContain('Ahmad');
  });

  it('only targets unpaid invoices due in the given month', async () => {
    mockFindMany.mockResolvedValue([]);
    await sendMonthlySppReminders(new Date('2026-07-15'));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['PENDING', 'PARTIAL', 'OVERDUE']);
    expect(where.dueDate.gte).toEqual(new Date(2026, 6, 1));
    expect(where.dueDate.lte.getMonth()).toBe(6);
  });

  it('keeps going when one parent notification fails', async () => {
    mockFindMany.mockResolvedValue([invoice()]);
    mockCreateNotification.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ id: 'n2' });

    const result = await sendMonthlySppReminders(new Date('2026-07-01'));
    expect(result.notified).toBe(1);
  });
});
