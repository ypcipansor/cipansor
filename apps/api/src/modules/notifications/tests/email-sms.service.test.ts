import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { Twilio } from 'twilio';
import { config } from '../../../config';
import { notificationService, templates } from '../email-sms.service';
import { MAX_NOTIFICATION_CONTENT_LENGTH } from '../notifications.schema';
import { deliverEmail } from '../email-transport';

// The SMS path constructs a Twilio client when credentials are present; mocking
// the class lets a test prove it was never built. A `function`, not an arrow:
// the service calls it with `new`, and an arrow cannot be constructed.
vi.mock('twilio', () => ({
  Twilio: vi.fn(function () {
    return { messages: { create: vi.fn().mockResolvedValue({ sid: 'SM1' }) } };
  }),
}));

// Mocked as a module rather than spied on the namespace: the service imports
// `deliverEmail` as a binding, so a namespace spy would not be the function it
// calls.
vi.mock('../email-transport', () => ({
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

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-123' }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'user-1', email: 'test@cipansor.or.id', phone: '08123456789' }]),
    },
  },
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

/**
 * Point the transport at the Gmail API with a throwaway RSA key.
 *
 * The service signs its OAuth2 assertion with this key, so the path cannot be
 * exercised with a fake string. The key is generated here and lives only for
 * the length of the run — not a credential, and nothing to leak.
 */
function configureGmail() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  (config.gmail as { serviceAccountEmail: string }).serviceAccountEmail =
    'mailer@project.iam.gserviceaccount.com';
  (config.gmail as { serviceAccountKey: string }).serviceAccountKey = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  (config.gmail as { sender: string }).sender = 'noreply@cipansor.or.id';
}

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
      })
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

  it('sends a plain message as escaped HTML, keeping its line breaks', async () => {
    // A reason typed into a form reached the e-mail body as live markup.
    deliverEmailMock.mockResolvedValue({ kind: 'log', delivered: false, messageId: 'log_2' });

    await notificationService.send({
      userId: 'user-1',
      channel: 'EMAIL',
      type: 'GENERAL',
      recipientEmail: 'wali@cipansor.or.id',
      title: 'Izin ditolak',
      message: 'Alasan: <a href="https://contoh.test">klik</a>\nBaris kedua',
    });

    const sent = deliverEmailMock.mock.calls.at(-1)?.[0] as { html: string };
    expect(sent.html).not.toContain('<a href');
    expect(sent.html).toContain('&lt;a href=&quot;https://contoh.test&quot;&gt;klik&lt;/a&gt;');
    expect(sent.html).toContain('<br>Baris kedua');
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

  it('delivers the largest message the request edge accepts through a configured transport', async () => {
    // The defect this pins: the transport bound is measured on the *generated*
    // HTML, but the request edge used to cap only the raw JSON body (10 MiB).
    // Escaping expands one character to as many as six, so the API accepted a
    // ~2 MiB body of quotes, the generated HTML crossed the transport bound,
    // and the recipient never got the e-mail. The schema now caps raw content
    // (MAX_NOTIFICATION_CONTENT_LENGTH) so its worst-case expansion stays under
    // the transport bound.
    //
    // A configured transport, not the log one: `log` returns before any text is
    // converted or a MIME message composed, so it cannot show that the accepted
    // message is actually built and handed to a real sender. This drives the
    // Gmail path end to end — escape, compose, base64url — and inspects the
    // message that would leave the building.
    const { deliverEmail: realDeliverEmail, resetEmailTransport } =
      await vi.importActual<typeof import('../email-transport')>('../email-transport');
    vi.mocked(deliverEmailMock).mockImplementation(realDeliverEmail);

    configureGmail();
    (config.outboundMessages as { enabled: boolean }).enabled = true;
    resetEmailTransport();

    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (new URL(url.toString()).hostname === 'oauth2.googleapis.com') {
        return new Response(JSON.stringify({ access_token: 'tok-max', expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: 'gmail-msg-max' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const message = '"'.repeat(MAX_NOTIFICATION_CONTENT_LENGTH);
      expect(message.length).toBe(MAX_NOTIFICATION_CONTENT_LENGTH);

      const result = await notificationService.send({
        userId: 'user-1',
        channel: 'EMAIL',
        type: 'GENERAL',
        recipientEmail: 'wali@cipansor.or.id',
        title: 'Pengumuman',
        message,
      });

      expect(result).toMatchObject({ success: true, transport: 'gmail_api', delivered: true });
      expect(result.error).toBeUndefined();

      const sendCall = fetchMock.mock.calls.find(
        ([url]) => new URL(url.toString()).hostname === 'gmail.googleapis.com'
      );
      expect(sendCall).toBeDefined();
      const sendInit = sendCall![1] as unknown as RequestInit;
      const mime = Buffer.from(
        JSON.parse(sendInit.body as string).raw as string,
        'base64url'
      ).toString('utf8');

      // Nodemailer encodes a body this size as quoted-printable, inserting
      // `=\n` soft breaks; undo them before counting, or the split escapes
      // would be miscounted.
      const decoded = mime.replace(/=\r?\n/g, '');

      // The message was really composed and carried both parts...
      expect(mime).toContain('text/html');
      expect(mime).toContain('text/plain');
      // ...with the *whole* escaped body, not a truncated prefix. A single
      // `toContain('&quot;')` passes for any prefix, so silent truncation
      // could have slipped past it; requiring every one of the
      // MAX_NOTIFICATION_CONTENT_LENGTH escapes proves the full
      // maximum-length body made it into the message.
      expect((decoded.match(/&quot;/g) || []).length).toBe(MAX_NOTIFICATION_CONTENT_LENGTH);
    } finally {
      vi.unstubAllGlobals();
      resetEmailTransport();
      (config.gmail as { serviceAccountEmail: string }).serviceAccountEmail = '';
      (config.gmail as { serviceAccountKey: string }).serviceAccountKey = '';
    }
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
      expect.objectContaining({ to: 'orang-luar@example.test' })
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

    const { prisma } = await import('../../../lib/prisma');
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining('Fauzan'),
        }),
      })
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

describe('outbound messages switch (staging)', () => {
  const twilio = config.twilio as { accountSid?: string; authToken?: string; phoneNumber?: string };

  afterEach(() => {
    (config.outboundMessages as { enabled: boolean }).enabled = true;
    twilio.accountSid = undefined;
    twilio.authToken = undefined;
    twilio.phoneNumber = undefined;
    vi.clearAllMocks();
  });

  it('logs an SMS instead of sending it, even with Twilio credentials present', async () => {
    twilio.accountSid = 'AC-test';
    twilio.authToken = 'token-test';
    twilio.phoneNumber = '+10000000000';
    (config.outboundMessages as { enabled: boolean }).enabled = false;

    const result = await notificationService.send({
      channel: 'SMS',
      type: 'PAYMENT_REMINDER',
      title: 'Tagihan',
      message: 'Tagihan SPP bulan ini',
      recipientPhone: '08123456789',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^log_/);
    expect(vi.mocked(Twilio)).not.toHaveBeenCalled();
  });

  it('still sends through Twilio when the switch is on (production default)', async () => {
    twilio.accountSid = 'AC-test';
    twilio.authToken = 'token-test';
    twilio.phoneNumber = '+10000000000';

    const result = await notificationService.send({
      channel: 'SMS',
      type: 'PAYMENT_REMINDER',
      title: 'Tagihan',
      message: 'Tagihan SPP bulan ini',
      recipientPhone: '08123456789',
    });

    expect(vi.mocked(Twilio)).toHaveBeenCalledTimes(1);
    expect(result.messageId).toBe('SM1');
  });
});
