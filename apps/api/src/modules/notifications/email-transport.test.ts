import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { config } from '../../config';
import {
  describeEmailTransport,
  deliverEmail,
  htmlToText,
  resetEmailTransport,
} from './email-transport';

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

/**
 * A throwaway RSA key, generated once here.
 *
 * Signing is the only part of the Gmail path that needs real crypto, and a key
 * that lives for the length of this file cannot be mistaken for a credential.
 */
import crypto from 'crypto';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const TEST_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function setGmailConfig() {
  (config.gmail as { serviceAccountEmail: string }).serviceAccountEmail =
    'mailer@project.iam.gserviceaccount.com';
  (config.gmail as { serviceAccountKey: string }).serviceAccountKey = TEST_KEY;
  (config.gmail as { sender: string }).sender = 'noreply@cipansor.or.id';
}

function clearTransports() {
  (config.gmail as { serviceAccountEmail: string }).serviceAccountEmail = '';
  (config.gmail as { serviceAccountKey: string }).serviceAccountKey = '';
  (config.smtp as { host: string }).host = '';
}

describe('email transport selection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearTransports();
    resetEmailTransport();
  });

  afterEach(() => {
    clearTransports();
    resetEmailTransport();
  });

  it('reports the log transport, and NOT "configured", when nothing is set up', () => {
    const status = describeEmailTransport();

    expect(status.kind).toBe('log');
    expect(status.configured).toBe(false);
  });

  it('does not pretend an unconfigured deployment delivered anything', async () => {
    const result = await deliverEmail({
      to: 'wali@example.test',
      subject: 'Tagihan',
      html: '<p>Halo</p>',
    });

    // The bug this guards: the old code returned success with no way to tell
    // that nothing had been sent, and the settings page reported "aktif".
    expect(result.kind).toBe('log');
    expect(result.delivered).toBe(false);
  });

  it('prefers the Gmail API over SMTP when both are configured', () => {
    setGmailConfig();
    (config.smtp as { host: string }).host = 'smtp.gmail.com';

    const status = describeEmailTransport();

    expect(status.kind).toBe('gmail_api');
    expect(status.sender).toBe('noreply@cipansor.or.id');
  });

  it('falls back to SMTP when only SMTP is configured', () => {
    (config.smtp as { host: string }).host = 'smtp.gmail.com';

    const status = describeEmailTransport();

    expect(status.kind).toBe('smtp');
    expect(status.host).toBe(`smtp.gmail.com:${config.smtp.port}`);
  });

  it('always separates the From mailbox from the Reply-To mailbox', () => {
    const status = describeEmailTransport();

    // The whole point of the pair: a wali who hits Reply must reach a mailbox
    // someone reads, never the noreply@ one.
    expect(status.from).toContain('noreply@');
    expect(status.replyTo).not.toContain('noreply@');
    expect(status.replyTo).toBe('halo@cipansor.or.id');
  });
});

describe('Gmail API delivery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearTransports();
    resetEmailTransport();
    setGmailConfig();
  });

  afterEach(() => {
    clearTransports();
    resetEmailTransport();
  });

  it('sends a base64url MIME message carrying both From and Reply-To', async () => {
    // Both parameters are declared even though only `url` is read: the call
    // tuple is what the assertions below index into, and a one-parameter mock
    // gives them nothing at position 1.
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'tok-123', expires_in: 3600 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: 'gmail-msg-1' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deliverEmail({
      to: 'wali@example.test',
      subject: 'Bukti Pembayaran',
      html: '<p>Pembayaran diterima</p>',
    });

    expect(result).toMatchObject({ kind: 'gmail_api', delivered: true, messageId: 'gmail-msg-1' });

    const sendCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('gmail.googleapis.com'),
    );
    expect(sendCall).toBeDefined();

    const sendInit = sendCall![1] as unknown as RequestInit;
    expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');

    const raw = JSON.parse(sendInit.body as string).raw as string;
    const mime = Buffer.from(raw, 'base64url').toString('utf8');

    expect(mime).toContain('From: Yayasan Pesantren Cipansor <noreply@cipansor.or.id>');
    expect(mime).toContain('Reply-To: halo@cipansor.or.id');
    expect(mime).toContain('To: wali@example.test');
    // A text/plain alternative rides along; a lone text/html part scores worse
    // with spam filters and is unreadable in text-only clients.
    expect(mime).toContain('text/plain');
    expect(mime).toContain('text/html');
  });

  it('reuses one access token across sends rather than buying one per message', async () => {
    let tokenRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('oauth2.googleapis.com')) {
          tokenRequests += 1;
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ id: 'm' }), { status: 200 });
      }),
    );

    await deliverEmail({ to: 'a@example.test', subject: 's', html: '<p>a</p>' });
    await deliverEmail({ to: 'b@example.test', subject: 's', html: '<p>b</p>' });
    await deliverEmail({ to: 'c@example.test', subject: 's', html: '<p>c</p>' });

    expect(tokenRequests).toBe(1);
  });

  it('surfaces a Gmail rejection instead of reporting a phantom send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('oauth2.googleapis.com')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({ error: { message: 'Delegation denied for noreply@cipansor.or.id' } }),
          { status: 403 },
        );
      }),
    );

    await expect(
      deliverEmail({ to: 'wali@example.test', subject: 's', html: '<p>x</p>' }),
    ).rejects.toThrow(/Delegation denied/);
  });

  it('explains an unauthorised client rather than swallowing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'unauthorized_client',
              error_description: 'Client is unauthorized to retrieve access tokens',
            }),
            { status: 401 },
          ),
      ),
    );

    await expect(
      deliverEmail({ to: 'wali@example.test', subject: 's', html: '<p>x</p>' }),
    ).rejects.toThrow(/unauthorized/i);
  });
});

describe('htmlToText', () => {
  it('keeps the words and drops the markup', () => {
    const text = htmlToText(
      '<html><head><style>p{color:red}</style></head><body><h2>Tagihan</h2><p>Rp 500.000</p><p>Jatuh tempo &amp; ditunggu</p></body></html>',
    );

    expect(text).toContain('Tagihan');
    expect(text).toContain('Rp 500.000');
    expect(text).toContain('Jatuh tempo & ditunggu');
    expect(text).not.toContain('<');
    expect(text).not.toContain('color:red');
  });
});
