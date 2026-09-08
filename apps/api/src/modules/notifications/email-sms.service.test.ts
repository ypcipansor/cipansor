import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationService, templates } from './email-sms.service';
import { deliverEmail } from './email-transport';

// Mocked as a module rather than spied on the namespace: the service imports
// `deliverEmail` as a binding, so a namespace spy would not be the function it
// calls.
vi.mock('./email-transport', () => ({
  deliverEmail: vi.fn(),
  describeEmailTransport: vi.fn(() => ({
    kind: 'gmail_api',
    configured: true,
    from: 'Yayasan Pesantren Cipansor <noreply@cipansor.or.id>',
    replyTo: 'halo@cipansor.or.id',
  })),
  resetEmailTransport: vi.fn(),
}));

const deliverEmailMock = vi.mocked(deliverEmail);

vi.mock('../../lib/prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-123' }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'user-1', email: 'test@cipansor.or.id', phone: '08123456789' },
        ]),
    },
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('NotificationService email dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliverEmailMock.mockResolvedValue({
      kind: 'gmail_api',
      delivered: true,
      messageId: 'msg-abc-123',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hands the transport a rendered subject and body', async () => {
    const result = await notificationService.send({
      userId: 'user-1',
      channel: 'EMAIL',
      type: 'WELCOME',
      recipientEmail: 'santri@cipansor.or.id',
      title: 'Selamat Datang',
      message: 'Selamat bergabung di Cipansor',
      templateKey: 'welcome',
      templateData: { name: 'Ahmad Santri', email: 'santri@cipansor.or.id' },
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-abc-123');
    expect(result.transport).toBe('gmail_api');
    expect(result.delivered).toBe(true);

    expect(deliverEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'santri@cipansor.or.id',
        subject: 'Akun Anda di Sistem Cipansor sudah aktif',
        html: expect.stringContaining('Ahmad Santri'),
      }),
    );

    /**
     * The lambang travels with the message, and the HTML points at it.
     *
     * Sent as a hosted URL it is blocked by default in Outlook and in Gmail's
     * ask-first mode, so the reader who most needs to recognise the yayasan at
     * a glance sees a broken box instead. This pins the inline part and the
     * `cid:` reference together — either alone is a header with no crest.
     */
    const sent = deliverEmailMock.mock.calls[0][0] as {
      html: string;
      attachments?: Array<{ cid?: string; contentType: string }>;
    };
    expect(sent.html).toContain('cid:lambang-cipansor');
    expect(sent.attachments).toEqual([
      expect.objectContaining({ cid: 'lambang-cipansor', contentType: 'image/png' }),
    ]);
  });

  it('reports delivered:false when the transport only logged the message', async () => {
    // The defect this pins: with nothing configured the service returned a
    // plain success, so a discarded e-mail was indistinguishable from a sent
    // one — in the logs and in the settings screen.
    deliverEmailMock.mockResolvedValue({ kind: 'log', delivered: false, messageId: 'log_1' });

    const result = await notificationService.send({
      userId: 'user-1',
      channel: 'EMAIL',
      type: 'GENERAL',
      recipientEmail: 'wali@cipansor.or.id',
      title: 'Pengumuman',
      message: 'Isi',
    });

    expect(result.success).toBe(true);
    expect(result.delivered).toBe(false);
    expect(result.transport).toBe('log');
  });

  it('still sends when the recipient has no user account', async () => {
    // `Notification.userId` is a required foreign key. The old code wrote
    // `userId || ''`, which threw before the channel switch was ever reached,
    // so addressing someone by e-mail alone sent nothing at all.
    const result = await notificationService.send({
      channel: 'EMAIL',
      type: 'GENERAL',
      recipientEmail: 'orang-luar@example.test',
      title: 'Undangan',
      message: 'Isi undangan',
    });

    expect(result.success).toBe(true);
    expect(deliverEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'orang-luar@example.test' }),
    );
  });

  it('surfaces a transport failure as an unsuccessful result', async () => {
    deliverEmailMock.mockRejectedValue(new Error('Gmail API send failed: Delegation denied'));

    const result = await notificationService.send({
      userId: 'user-1',
      channel: 'EMAIL',
      type: 'GENERAL',
      recipientEmail: 'wali@cipansor.or.id',
      title: 'Tagihan',
      message: 'Isi',
    });

    expect(result.success).toBe(false);
    expect(result.delivered).toBe(false);
    expect(result.error).toMatch(/Delegation denied/);
  });

  it('fills the in-app record rather than leaving a blank row', async () => {
    await notificationService.sendPaymentReceipt({
      userId: 'u1',
      recipientEmail: 'ortu@cipansor.or.id',
      parentName: 'Hendra',
      studentName: 'Fauzan',
      receiptNumber: 'KW-001',
      amount: 'Rp 500.000',
      paymentDate: '27 Agustus 2025',
      paymentMethod: 'Transfer',
      description: 'SPP',
    });

    const { prisma } = await import('../../lib/prisma');
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining('Fauzan'),
        }),
      }),
    );
  });
});

describe('email templates', () => {
  it('renders the payment receipt with the reply-to mailbox in the footer', () => {
    const html = templates.paymentReceipt.html({
      parentName: 'Bapak Hendra',
      studentName: 'Fauzan',
      receiptNumber: 'KW-2025-001',
      amount: 'Rp 500.000',
      paymentDate: '27 Agustus 2025',
      paymentMethod: 'Transfer Bank Syariah',
      description: 'SPP Bulan Agustus 2025',
    });

    expect(html).toContain('Bapak Hendra');
    expect(html).toContain('KW-2025-001');
    expect(html).toContain('Rp 500.000');
    // Every template must point a reply at the mailbox a human reads.
    expect(html).toContain('halo@cipansor.or.id');
  });

  it('renders the tahfidz report', () => {
    const html = templates.tahfidzProgress.html({
      parentName: 'Bapak Hendra',
      studentName: 'Fauzan',
      surah: 'Al-Baqarah',
      verses: '1-50',
      juz: 1,
      grade: 'Mumtaz (Sangat Baik)',
      teacherName: 'Ustadz Ahmad',
      date: '27 Agustus 2025',
    });

    expect(html).toContain('Al-Baqarah');
    expect(html).toContain('Mumtaz');
    expect(html).toContain('Juz 1');
    expect(html).toContain('halo@cipansor.or.id');
  });

  it('states the real lifetime of a reset link instead of assuming an hour', () => {
    const onboarding = templates.passwordReset.html({
      name: 'Wali Fauzan',
      resetLink: 'https://portal.cipansor.or.id/reset-password?token=abc',
      expiresInHours: 24,
    });

    expect(onboarding).toContain('24 jam');
    // The link is also printed in full, for clients that strip the button.
    expect(onboarding).toContain('https://portal.cipansor.or.id/reset-password?token=abc');

    const selfService = templates.passwordReset.html({
      name: 'Wali Fauzan',
      resetLink: 'https://portal.cipansor.or.id/reset-password?token=abc',
      expiresInHours: 1,
    });

    expect(selfService).toContain('1 jam');
  });

  it('preserves the paragraphs of an announcement typed into a textarea', () => {
    const html = templates.announcement.html({
      title: 'Libur Semester',
      content: 'Baris pertama.\n\nBaris kedua.',
      priority: 'MEDIUM',
    });

    // Without `white-space: pre-line` the two lines run together, which is what
    // every announcement e-mail did. Matched loosely on purpose: the property
    // is what matters, not whether the generator puts a space after the colon.
    expect(html).toMatch(/white-space:\s*pre-line/);
    expect(html).toContain('Baris pertama.\n\nBaris kedua.');
  });

  it('escapes markup in values that come from users', () => {
    const html = templates.announcement.html({
      title: '<script>alert(1)</script>',
      content: 'Isi <b>tebal</b>',
      priority: 'HIGH',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;tebal&lt;/b&gt;');
  });
});
