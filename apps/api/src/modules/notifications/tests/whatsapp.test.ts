import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { notification: { create: vi.fn().mockResolvedValue({ id: 'n1' }) } },
}));
vi.mock('../whatsapp.service', () => ({
  whatsAppService: { sendMessage: vi.fn() },
}));

import { notificationService } from '../email-sms.service';
import { whatsAppService } from '../whatsapp.service';

const mockSendMessage = whatsAppService.sendMessage as unknown as ReturnType<typeof vi.fn>;

describe('WHATSAPP channel dispatch (via multi-provider whatsapp.service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to whatsAppService.sendMessage and maps the result', async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      messageId: 'wamid.123',
      provider: 'META',
      timestamp: new Date(),
    });

    const result = await notificationService.dispatchExternal({
      channel: 'WHATSAPP',
      recipientPhone: '+6281234567890',
      type: 'PAYMENT_REMINDER',
      title: 'Tagihan SPP',
      message: 'Tagihan SPP Juli jatuh tempo 10 Juli.',
    });

    expect(result).toMatchObject({
      success: true,
      channel: 'WHATSAPP',
      messageId: 'wamid.123',
    });
    expect(mockSendMessage).toHaveBeenCalledWith({
      to: '+6281234567890',
      message: 'Tagihan SPP Juli jatuh tempo 10 Juli.',
      type: 'text',
    });
  });

  it('surfaces provider failures', async () => {
    mockSendMessage.mockResolvedValue({
      success: false,
      provider: 'META',
      error: 'Invalid OAuth access token',
      timestamp: new Date(),
    });

    const result = await notificationService.dispatchExternal({
      channel: 'WHATSAPP',
      recipientPhone: '+6281234567890',
      type: 'PAYMENT_REMINDER',
      title: 'x',
      message: 'y',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid OAuth access token');
  });

  it('requires a recipient phone', async () => {
    const result = await notificationService.dispatchExternal({
      channel: 'WHATSAPP',
      type: 'PAYMENT_REMINDER',
      title: 'x',
      message: 'y',
    });
    expect(result.success).toBe(false);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
