import { config } from '../../config';
import { LOGO_CIPANSOR_PNG_BASE64 } from '../../assets/logo-cipansor';

/**
 * The shell every automated message from noreply@cipansor.or.id is poured into.
 *
 * Written to the rules an HTML e-mail actually lives under, which are not the
 * rules a web page lives under: tables carry the layout because Outlook's Word
 * rendering engine ignores modern box layout, every style is inline because
 * Gmail strips `<style>` blocks in several contexts, and the whole thing stays
 * inside 600px because that is what a preview pane gives you.
 *
 * The lambang travels as a CID attachment rather than a hosted URL. A remote
 * image is blocked by default in Outlook and in Gmail's "ask before displaying"
 * mode, which is exactly the audience that most needs to recognise this as the
 * yayasan writing to them; a `data:` URI is stripped outright by Gmail. An
 * attached part is the only form that renders everywhere without asking.
 */

/** Sampled from the lambang itself, not chosen: #35AD44 green, #E61F2C red. */
export const BRAND = {
  green: '#35AD44',
  greenDeep: '#17692A',
  greenInk: '#0F4A1D',
  red: '#C4241F',
  ink: '#1F2A24',
  inkMuted: '#5E6B62',
  inkFaint: '#8A958D',
  line: '#E1E5E1',
  panel: '#F4F7F4',
  ground: '#EEF0EE',
  paper: '#FFFFFF',
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Content-ID the header <img> points at. */
export const EMAIL_LOGO_CID = 'lambang-cipansor';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid?: string;
}

/** The lambang, as the inline part the header image resolves against. */
export function emailLogoAttachment(): EmailAttachment {
  return {
    filename: 'lambang-cipansor.png',
    content: Buffer.from(LOGO_CIPANSOR_PNG_BASE64, 'base64'),
    contentType: 'image/png',
    cid: EMAIL_LOGO_CID,
  };
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Heading inside the message body. */
export function emailHeading(text: string): string {
  return `<h2 style="margin:0 0 14px 0;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:700;color:${BRAND.greenInk};">${escapeHtml(text)}</h2>`;
}

/** Body paragraph. Pass pre-escaped HTML only when you mean markup. */
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.ink};">${html}</p>`;
}

/**
 * A call to action.
 *
 * Built as a table rather than a padded `<a>` so Outlook renders the whole
 * green box clickable instead of a bare green word.
 */
export function emailButton(href: string, label: string): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
        <tr>
          <td align="center" bgcolor="${BRAND.greenDeep}" style="border-radius:6px;">
            <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>`;
}

/** Label/value rows — account details, invoice lines, letter metadata. */
export function emailPanel(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([k, v], i) => `
          <tr>
            <td style="padding:${i === 0 ? '0' : '9px'} 14px 9px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.inkMuted};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>
            <td style="padding:${i === 0 ? '0' : '9px'} 0 9px 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${BRAND.ink};font-weight:600;vertical-align:top;">${v}</td>
          </tr>`
    )
    .join('');

  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 18px 0;background-color:${BRAND.panel};border-left:3px solid ${BRAND.green};">
        <tr>
          <td style="padding:16px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${cells}
            </table>
          </td>
        </tr>
      </table>`;
}

/** A security or caution line — red, small, never a whole red panel. */
export function emailNote(html: string): string {
  return `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.red};">${html}</p>`;
}

/** Muted fine print inside the body. */
export function emailFinePrint(html: string): string {
  return `<p style="margin:0 0 12px 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${BRAND.inkMuted};">${html}</p>`;
}

/** The closing signature block every message ends with. */
export function emailSignoff(unit = 'Yayasan Pesantren Cipansor'): string {
  return `<p style="margin:24px 0 0 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.ink};">Salam,<br><strong style="color:${BRAND.greenInk};">${escapeHtml(unit)}</strong></p>`;
}

export interface EmailLayoutOptions {
  /** Browser/tab title, and the fallback preview when no preheader is given. */
  title: string;
  /**
   * The grey line an inbox shows after the subject.
   *
   * Left unset, mail clients scrape the first thing they find — which here is
   * the letterhead — so every message previews as "Yayasan Pesantren Cipansor
   * Yayasan Pesantren Cipansor". One written sentence per template fixes it.
   */
  preheader?: string;
  bodyHtml: string;
}

export function renderEmailLayout({ title, preheader, bodyHtml }: EmailLayoutOptions): string {
  const replyTo = config.mail.replyTo;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="id">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.ground};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader ?? title)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.ground};">
  <tr>
    <td align="center" style="padding:28px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:${BRAND.paper};border:1px solid ${BRAND.line};border-radius:8px;overflow:hidden;">

        <!-- Kop surat: lambang on white, so its green, red and gold all read -->
        <tr>
          <td align="center" style="padding:26px 24px 18px 24px;background-color:${BRAND.paper};">
            <img src="cid:${EMAIL_LOGO_CID}" width="58" height="57" alt="Lambang Yayasan Pesantren Cipansor" style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto 12px auto;" />
            <div style="font-family:${FONT};font-size:16px;font-weight:700;letter-spacing:0.4px;color:${BRAND.greenInk};line-height:1.3;">YAYASAN PESANTREN CIPANSOR</div>
            <div style="font-family:${FONT};font-size:11.5px;letter-spacing:0.3px;color:${BRAND.inkFaint};margin-top:4px;">Tasikmalaya, Jawa Barat &middot; cipansor.or.id</div>
          </td>
        </tr>
        <tr>
          <td style="font-size:0;line-height:0;height:3px;background-color:${BRAND.green};">&nbsp;</td>
        </tr>

        <!-- Isi -->
        <tr>
          <td style="padding:28px 32px 30px 32px;">
${bodyHtml}
          </td>
        </tr>

        <!-- Kaki -->
        <tr>
          <td style="padding:18px 32px 22px 32px;background-color:${BRAND.panel};border-top:1px solid ${BRAND.line};">
            <p style="margin:0 0 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.inkMuted};">
              Pesan ini dikirim otomatis oleh sistem informasi Yayasan Pesantren Cipansor.
            </p>
            <p style="margin:0 0 12px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.inkMuted};">
              Ada yang ingin ditanyakan? <strong style="color:${BRAND.greenInk};">Balas saja email ini</strong> &mdash; balasan Anda diteruskan ke
              <a href="mailto:${escapeHtml(replyTo)}" style="color:${BRAND.greenDeep};font-weight:600;text-decoration:underline;">${escapeHtml(replyTo)}</a>, kotak surat yang dibaca petugas kami.
            </p>
            <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.5;color:${BRAND.inkFaint};">
              &copy; ${year} Yayasan Pesantren Cipansor
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
