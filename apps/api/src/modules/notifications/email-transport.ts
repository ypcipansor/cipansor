/**
 * How an e-mail actually leaves the building.
 *
 * Three transports, chosen in this order by what is configured:
 *
 *   1. `gmail_api` — a Google Cloud service account with domain-wide
 *      delegation, impersonating the sending mailbox and calling
 *      `gmail.users.messages.send`. **Preferred.** There is no password: the
 *      credential is an RSA key scoped to `gmail.send` alone, revocable from the
 *      Admin console, and useless for reading mail or signing in.
 *   2. `smtp` — smtp.gmail.com with an app password or OAuth2. Kept as a
 *      fallback because it needs no Cloud project, but an app password is a
 *      bearer credential that grants the whole mailbox.
 *   3. `log` — nothing is sent. What an unconfigured deployment does.
 *
 * WHY THIS IS A SEPARATE FILE. The old code decided "can we send?" inline in
 * `sendEmail`, and the answer was invisible everywhere else: with SMTP_HOST
 * unset it logged the mail, returned `{ success: true }`, and the settings
 * screen went on reporting "Channel Email Aktif". Nobody could tell a delivered
 * e-mail from a discarded one. `describeEmailTransport()` now answers that
 * question for the API, the logs and the UI from one place, and
 * `deliverEmail()` reports `delivered: false` rather than pretending.
 */

import nodemailer from 'nodemailer';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { ServiceAccountTokenSource } from '../../lib/google-service-account';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export type EmailTransportKind = 'gmail_api' | 'smtp' | 'log';

export interface EmailTransportStatus {
  kind: EmailTransportKind;
  /** False only for `log`: nothing will be delivered. */
  configured: boolean;
  /** The From header recipients will see. */
  from: string;
  /** Where a reply goes. Deliberately not the From mailbox. */
  replyTo: string;
  /** Gmail API only: the impersonated mailbox. */
  sender?: string;
  /** SMTP only: host:port. */
  host?: string;
}

export interface DeliverEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text part. Derived from `html` when omitted. */
  text?: string;
  /**
   * Alamat yang dituju ketika penerima menekan Balas. Bawaannya
   * `config.mail.replyTo` (halo@), yang benar untuk hampir semua surat kita.
   *
   * Yang membutuhkan penggantinya: surat yang KAMI kirim ke halo@ atas nama
   * orang lain — penerusan pertanyaan dari asisten AI. Di sana balasan harus
   * jatuh ke penanyanya, bukan kembali ke kotak masuk yang sama; tanpa ini,
   * petugas yang menekan Balas mengirim surat kepada dirinya sendiri dan orang
   * yang bertanya tidak pernah mendapat jawaban.
   */
  replyTo?: string;
  /**
   * Inline parts the HTML refers to by `cid:`.
   *
   * The lambang travels this way rather than as a hosted URL: Outlook and
   * Gmail's "ask before displaying" mode block remote images by default, and a
   * `data:` URI is stripped outright — so an attached part is the only form
   * that renders for everyone without them having to click anything.
   */
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    cid?: string;
  }>;
}

export interface DeliverEmailResult {
  kind: EmailTransportKind;
  /** False when the transport is `log` — the message was written, not sent. */
  delivered: boolean;
  messageId: string;
}

function gmailApiConfigured(): boolean {
  return Boolean(config.gmail.serviceAccountEmail && config.gmail.serviceAccountKey);
}

function smtpConfigured(): boolean {
  return Boolean(config.smtp.host);
}

/**
 * Which transport is in force, and the identity it sends under.
 *
 * Read by `GET /api/notifications/email-status` so the settings screen can
 * state what is actually configured instead of repeating hardcoded strings.
 */
export function describeEmailTransport(): EmailTransportStatus {
  const from = config.mail.from;
  const replyTo = config.mail.replyTo;

  if (gmailApiConfigured()) {
    return { kind: 'gmail_api', configured: true, from, replyTo, sender: config.gmail.sender };
  }

  if (smtpConfigured()) {
    return {
      kind: 'smtp',
      configured: true,
      from,
      replyTo,
      host: `${config.smtp.host}:${config.smtp.port}`,
    };
  }

  return { kind: 'log', configured: false, from, replyTo };
}

/**
 * Rough plain-text alternative for an HTML mail.
 *
 * Not a full converter and not trying to be. A message with no text/plain part
 * scores worse with spam filters and is unreadable in text-only clients, and
 * every template here is a table of labelled facts, so dropping the tags and
 * collapsing whitespace gives a usable fallback.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Compose the RFC 5322 message.
 *
 * Uses nodemailer's stream transport purely as a builder, so the Gmail API path
 * produces byte-identical MIME to the SMTP path — same headers, same encoding,
 * same multipart structure. Writing the message by hand here is where UTF-8
 * subjects and long-header folding go wrong.
 */
async function composeRawMessage(input: DeliverEmailInput): Promise<Buffer> {
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });

  const info = await composer.sendMail({
    from: config.mail.from,
    replyTo: input.replyTo ?? config.mail.replyTo,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? htmlToText(input.html),
    attachments: input.attachments,
  });

  return info.message as Buffer;
}

let tokenSource: ServiceAccountTokenSource | null = null;

function getTokenSource(): ServiceAccountTokenSource {
  if (!tokenSource) {
    tokenSource = new ServiceAccountTokenSource({
      clientEmail: config.gmail.serviceAccountEmail,
      privateKey: config.gmail.serviceAccountKey,
      subject: config.gmail.sender,
      scopes: [GMAIL_SEND_SCOPE],
    });
  }
  return tokenSource;
}

type SmtpAuthOptions =
  | { user: string; pass: string }
  | {
      type: 'OAuth2';
      user: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    };

let smtpTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter(): nodemailer.Transporter {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  // nodemailer's own union for this is wide enough that describing it here adds
  // nothing; what matters is that `auth` is omitted entirely when nothing is
  // configured. Passing `{ user: undefined, pass: undefined }` — which the
  // previous code did unconditionally — makes nodemailer attempt AUTH with
  // empty credentials against a relay that may not want authentication at all.
  let auth: SmtpAuthOptions | undefined;

  if (
    config.smtp.oauth2.clientId &&
    config.smtp.oauth2.clientSecret &&
    config.smtp.oauth2.refreshToken
  ) {
    auth = {
      type: 'OAuth2',
      user: config.smtp.user || config.gmail.sender,
      clientId: config.smtp.oauth2.clientId,
      clientSecret: config.smtp.oauth2.clientSecret,
      refreshToken: config.smtp.oauth2.refreshToken,
    };
  } else if (config.smtp.user && config.smtp.pass) {
    auth = { user: config.smtp.user, pass: config.smtp.pass };
  }

  smtpTransporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    // An announcement fans out to every user at once. Without pooling each
    // message opens its own connection, and Gmail refuses well before the
    // hundredth — so the blast half-delivers and the failures look random.
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    // Gmail also rate-limits per connection; 10 messages/second is comfortably
    // inside it and still clears a whole-school announcement in seconds.
    rateDelta: 1000,
    rateLimit: 10,
    ...(auth ? { auth } : {}),
  });

  return smtpTransporter;
}

/** Drop cached transports. Used by tests and after a configuration change. */
export function resetEmailTransport(): void {
  smtpTransporter?.close?.();
  smtpTransporter = null;
  tokenSource?.reset();
  tokenSource = null;
}

async function sendViaGmailApi(input: DeliverEmailInput): Promise<DeliverEmailResult> {
  const accessToken = await getTokenSource().getAccessToken();
  const raw = (await composeRawMessage(input)).toString('base64url');

  const response = await fetch(GMAIL_SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const body = (await response.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string; status?: string };
  } | null;

  if (!response.ok || !body?.id) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Gmail API send failed: ${detail}`);
  }

  return { kind: 'gmail_api', delivered: true, messageId: body.id };
}

async function sendViaSmtp(input: DeliverEmailInput): Promise<DeliverEmailResult> {
  const info = await getSmtpTransporter().sendMail({
    from: config.mail.from,
    replyTo: input.replyTo ?? config.mail.replyTo,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? htmlToText(input.html),
    attachments: input.attachments,
  });

  return { kind: 'smtp', delivered: true, messageId: info.messageId };
}

/**
 * Send one message through whichever transport is configured.
 *
 * Throws on a real delivery failure. Returns `delivered: false` only for the
 * `log` transport, which is a configuration state rather than an error — the
 * caller decides whether that counts as success for its own purposes.
 */
export async function deliverEmail(input: DeliverEmailInput): Promise<DeliverEmailResult> {
  if (gmailApiConfigured()) {
    return sendViaGmailApi(input);
  }

  if (smtpConfigured()) {
    return sendViaSmtp(input);
  }

  logger.warn(
    'Email transport not configured (no Gmail service account, no SMTP_HOST) — message logged only.',
    { to: input.to, subject: input.subject },
  );

  return { kind: 'log', delivered: false, messageId: `log_${Date.now()}` };
}
