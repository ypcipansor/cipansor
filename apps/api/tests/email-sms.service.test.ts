import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Twilio } from 'twilio';

// Mock Prisma
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notification-id-123' }),
    },
  },
}));

// Mock Logger
vi.mock('../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Global mock for create method
const mockCreate = vi.fn();

// Mock Twilio
vi.mock('twilio', () => {
  return {
    Twilio: class {
      messages = {
        create: mockCreate,
      };
      constructor() {}
    },
  };
});

// We need to delay importing the service until we set up the mock for config
// But we want to test different config states.
// In Vitest, we can use `vi.doMock` for module mocking per test.

describe('NotificationService - SMS', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should log SMS when Twilio is not configured', async () => {
    // Mock config to be empty
    vi.doMock('../src/config', () => ({
      config: {
        outboundMessages: { enabled: true },
        twilio: {
          accountSid: undefined,
          authToken: undefined,
          phoneNumber: undefined,
        },
      },
    }));

    // Import service dynamically to pick up the mock
    const { notificationService } = await import('../src/modules/notifications/email-sms.service');

    const result = await notificationService.send({
      channel: 'SMS',
      recipientPhone: '+1234567890',
      message: 'Test message',
      type: 'GENERAL',
      title: 'Test',
    });

    expect(result.success).toBe(true);
    expect(result.channel).toBe('SMS');
    expect(result.messageId).toMatch(/^log_/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should send SMS via Twilio when configured', async () => {
    // Mock config to have values
    vi.doMock('../src/config', () => ({
      config: {
        outboundMessages: { enabled: true },
        twilio: {
          accountSid: 'AC123',
          authToken: 'token',
          phoneNumber: '+1000000000',
        },
      },
    }));

    const { notificationService } = await import('../src/modules/notifications/email-sms.service');

    mockCreate.mockResolvedValue({ sid: 'SM12345' });

    const result = await notificationService.send({
      channel: 'SMS',
      recipientPhone: '+1234567890',
      message: 'Test message',
      type: 'GENERAL',
      title: 'Test',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      body: 'Test message',
      from: '+1000000000',
      to: '+1234567890',
    });
    expect(result.success).toBe(true);
    expect(result.channel).toBe('SMS');
    expect(result.messageId).toBe('SM12345');
  });

  it('should handle Twilio errors gracefully', async () => {
    // Mock config to have values
    vi.doMock('../src/config', () => ({
      config: {
        outboundMessages: { enabled: true },
        twilio: {
          accountSid: 'AC123',
          authToken: 'token',
          phoneNumber: '+1000000000',
        },
      },
    }));

    const { notificationService } = await import('../src/modules/notifications/email-sms.service');

    mockCreate.mockRejectedValue(new Error('Twilio error'));

    const result = await notificationService.send({
      channel: 'SMS',
      recipientPhone: '+1234567890',
      message: 'Test message',
      type: 'GENERAL',
      title: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.channel).toBe('SMS');
    expect(result.error).toBe('Twilio error');
  });
});
