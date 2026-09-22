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

/**
 * Exact-host check for a fetch URL.
 *
 * Substring matching mistakes a URL that merely *mentions* the host for one
 * that is served by it: `https://oauth2.googleapis.com.evil.example/` and
 * `https://evil.example/?next=oauth2.googleapis.com` both contain the string
 * but neither is the OAuth endpoint. Parsing and comparing the hostname
 * exactly rejects both.
 */
function hasHostname(url: string | URL, hostname: string): boolean {
  return new URL(typeof url === 'string' ? url : url.toString()).hostname === hostname;
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
      if (hasHostname(url, 'oauth2.googleapis.com')) {
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

    const sendCall = fetchMock.mock.calls.find(([url]) => hasHostname(url, 'gmail.googleapis.com'));
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
        if (hasHostname(url, 'oauth2.googleapis.com')) {
          tokenRequests += 1;
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ id: 'm' }), { status: 200 });
      })
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
        if (hasHostname(url, 'oauth2.googleapis.com')) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({ error: { message: 'Delegation denied for noreply@cipansor.or.id' } }),
          { status: 403 }
        );
      })
    );

    await expect(
      deliverEmail({ to: 'wali@example.test', subject: 's', html: '<p>x</p>' })
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
            { status: 401 }
          )
      )
    );

    await expect(
      deliverEmail({ to: 'wali@example.test', subject: 's', html: '<p>x</p>' })
    ).rejects.toThrow(/unauthorized/i);
  });
});

describe('hasHostname exact matching', () => {
  // Regression coverage for code scanning alert 25: a URL that merely contains
  // the host string is not the host. These are the shapes a substring check
  // lets through — a suffix spoof and a query-string decoy.
  it.each([
    'https://oauth2.googleapis.com.evil.example/',
    'https://evil.example/?next=oauth2.googleapis.com',
    'https://notoauth2.googleapis.com/',
  ])('does not treat %s as the OAuth host', (url) => {
    expect(hasHostname(url, 'oauth2.googleapis.com')).toBe(false);
  });

  it.each([
    'https://gmail.googleapis.com.evil.example/',
    'https://evil.example/?next=gmail.googleapis.com',
    'https://notgmail.googleapis.com/',
  ])('does not treat %s as the Gmail host', (url) => {
    expect(hasHostname(url, 'gmail.googleapis.com')).toBe(false);
  });

  it('accepts the exact hosts, as a string or a URL object', () => {
    expect(hasHostname('https://oauth2.googleapis.com/token', 'oauth2.googleapis.com')).toBe(true);
    expect(
      hasHostname(
        new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages'),
        'gmail.googleapis.com'
      )
    ).toBe(true);
  });
});

describe('htmlToText', () => {
  it('keeps the words and drops the markup', () => {
    const text = htmlToText(
      '<html><head><style>p{color:red}</style></head><body><h2>Tagihan</h2><p>Rp 500.000</p><p>Jatuh tempo &amp; ditunggu</p></body></html>'
    );

    expect(text).toContain('Tagihan');
    expect(text).toContain('Rp 500.000');
    expect(text).toContain('Jatuh tempo & ditunggu');
    expect(text).not.toContain('<');
    expect(text).not.toContain('color:red');
  });

  describe('removing real markup', () => {
    it('removes a script tag but never lets it survive as markup', () => {
      // Real markup is processed before anything is decoded, so the tag cannot
      // survive. Its text content stays as inert plain text, which is all a
      // tag stripper promises.
      const text = htmlToText('<p>Hi</p><script>alert(1)</script>');

      expect(text).not.toContain('<script');
      expect(text).toBe('Hi\nalert(1)');
    });

    it('drops style and head elements together with their contents', () => {
      const text = htmlToText(
        '<head><title>Not shown</title></head><style>.x{color:red}</style><body><p>Shown</p></body>'
      );

      expect(text).toBe('Shown');
      expect(text).not.toContain('Not shown');
      expect(text).not.toContain('color:red');
    });

    it('treats an unclosed element as a plain tag, not as consuming the rest', () => {
      // `<style/>` and a `<head>` with no close are not elements; only the tag
      // itself goes, and the text after it survives. The lazy regex behaved the
      // same way, so this pins the replacement to it.
      expect(htmlToText('<style/>hello')).toBe('hello');
      expect(htmlToText('<head>only open')).toBe('only open');
      expect(htmlToText('a<style>b')).toBe('ab');
      // A longer name sharing the prefix is a different element entirely.
      expect(htmlToText('<stylesheet>keep</stylesheet>')).toBe('keep');
    });

    it('strips a <head> element whose open tag is fragmented across layers', () => {
      // The same fixed-point hazard as the `<style>` case above, but on the
      // element pass `htmlToText` invokes second: closing an inner `</head>`
      // re-fuses the outer `<he…` with a stale `ad>` into a fresh `<head>`,
      // layer by layer. The single-scan strip must retire every layer at once
      // and leave no markup behind.
      expect(htmlToText('<he<head>x</head>ad>y</head>')).toBe('');
      expect(htmlToText('<head>hidden</head>shown')).toBe('shown');
      expect(htmlToText('<<head>head>inside')).not.toMatch(/<\/?head/i);
      expect(htmlToText('<sty<style>x</style>le><he<head>y</head>ad>z</head>')).toBe('');
    });

    it('turns br and closing block tags into line breaks', () => {
      expect(htmlToText('<p>satu</p><div>dua</div>')).toBe('satu\ndua');
      expect(htmlToText('satu<br>dua<br/>tiga')).toBe('satu\ndua\ntiga');
      expect(htmlToText('<tr><td>lima</td></tr>')).toBe('lima');
    });

    it('does not leave a tag behind when removing tags concatenates them', () => {
      // `<<script>script>` loses the inner `<script>` and the halves would join
      // into a live tag if the strip ran only once. Re-applying it to a fixed
      // point leaves no tag-shaped residue.
      expect(htmlToText('<<script>script>alert(1)')).not.toMatch(/<\/?script/i);
      expect(htmlToText('<scr<script>ipt>alert(1)')).not.toMatch(/<\/?script/i);
    });

    it('strips a tag that is fragmented across several layers, not just one', () => {
      // Harder than `<<script>script>`: closing the inner tag re-fuses an outer
      // `<sty` with a stale `le`, so `<style` re-forms one layer at a time and
      // a fixed-point loop peels exactly one layer per round (this input needs
      // three). The single-scan stack strip removes every layer at once.
      expect(htmlToText('<sty<style>X</style>le>Y</style>Z')).toBe('Z');
      // Two fragments re-fuse into a second `<style>` layer, which the same
      // scan must also consume — nothing is left.
      expect(htmlToText('<st<style>X</style>y<style>Y</style>le>Z</style>')).toBe('');
    });

    it('removes comments, declarations/doctype and processing instructions', () => {
      expect(htmlToText('before<!-- note -->after')).toBe('beforeafter');
      expect(htmlToText('before<!DOCTYPE html>after')).toBe('beforeafter');
      expect(htmlToText('before<?xml version="1.0"?>after')).toBe('beforeafter');
      // Concatenation across a removed comment must not re-form a tag.
      expect(htmlToText('<<!---->script>alert(1)')).not.toMatch(/<\/?script/i);
    });

    it('terminates on pathological tag input without a matching close', () => {
      const input = '<a'.repeat(20000);
      const start = Date.now();
      const out = htmlToText(input);
      expect(Date.now() - start).toBeLessThan(2000);
      expect(typeof out).toBe('string');
    });

    it('stays linear on repeated element and comment starters', () => {
      // Regression for code scanning alert 49: the `<style[\s\S]*?<\/style>`
      // and `<[^>]*>` regexes backtracked quadratically — 80k `<a` took ~8s,
      // 80k `<style` ~12s. The hand-written scans must stay linear.
      for (const input of [
        '<a'.repeat(200_000),
        '<style'.repeat(200_000),
        '<!--'.repeat(200_000),
      ]) {
        const start = Date.now();
        htmlToText(input);
        expect(Date.now() - start).toBeLessThan(1000);
      }
    });

    it('stays linear on many open elements with no matching close', () => {
      // A run of `<style>`/`<head>` opens with no close must not rescan to the
      // end of the string once per open tag.
      for (const input of ['<style>'.repeat(200_000), '<head>'.repeat(200_000)]) {
        const start = Date.now();
        htmlToText(input);
        expect(Date.now() - start).toBeLessThan(1000);
      }
    });

    it('stays linear when a tag is fragmented across many nested layers', () => {
      // Regression for the fixed-point loop. `styleLayer(d)` is `<sty` +
      // layer(d-1) + `le>Y</style>` nested d deep; closing the innermost
      // `</style>` re-fuses the stale `le` with the outer `<sty` into a fresh
      // `<style>`, so the old `stripToFixedPoint` needed d rounds over an
      // O(d)-sized string, i.e. O(n^2): measured 10k->1.2s, 20k->6.5s,
      // 40k->27s on the previous code.
      //
      // `headLayer` is the same hazard on the *second* element pass, which the
      // first version of this test left uncovered even though that pass runs
      // the very same helper: the old code measured 20k->5.7s, 80k->95s.
      const styleLayer = (d: number): string => {
        let s = '<style>Z</style>';
        for (let i = 1; i < d; i++) s = `<sty${s}le>Y</style>`;
        return s;
      };
      const headLayer = (d: number): string => {
        let s = '<head>Z</head>';
        for (let i = 1; i < d; i++) s = `<he${s}ad>Y</head>`;
        return s;
      };

      for (const [name, build] of [
        ['style', styleLayer],
        ['head', headLayer],
      ] as const) {
        // Correctness: every layer is element markup, so nothing survives.
        expect(htmlToText(build(2000)), `${name} correctness`).toBe('');
        expect(htmlToText(build(2000)), `${name} residue`).not.toMatch(
          new RegExp(`</?${name}`, 'i')
        );

        // Complexity: doubling the depth must not quadruple the time.
        const timed = (d: number): number => {
          const input = build(d);
          const start = Date.now();
          htmlToText(input);
          return Date.now() - start;
        };
        timed(4000); // warm up

        const small = Math.max(timed(20000), 1);
        const large = timed(80000);
        // Quadratic growth would be ~16x; allow generous headroom for CI
        // jitter while still failing an O(n^2) implementation (the old code
        // measured ~16x here, and ~400x before the per-pass fix).
        expect(large, `${name} complexity`).toBeLessThan(small * 8);
      }
    });
  });

  describe('entity decoding', () => {
    it.each([
      ['&quot;', '"'],
      ['&lt;', '<'],
      ['&gt;', '>'],
      ['&#039;', "'"],
      ['&#38;', '&'],
      ['&amp;', '&'],
    ])('decodes the plain entity %j exactly once', (input, expected) => {
      expect(htmlToText(input)).toBe(expected);
    });

    it('decodes a plain &nbsp; to a single space', () => {
      // Standalone, `&nbsp;` becomes a space and the trailing `.trim()` in
      // htmlToText would strip it, so assert it in context.
      expect(htmlToText('a&nbsp;b')).toBe('a b');
    });

    it('keeps escaped literal tag-like text instead of deleting it', () => {
      // The bug this guards: decoding before stripping turned `&lt;code&gt;`
      // into a real `<code>` tag, and the tag strip then removed it. Users who
      // typed that literal saw it vanish.
      expect(htmlToText('Use &lt;code&gt; here')).toBe('Use <code> here');
      expect(htmlToText('a &lt; b')).toBe('a < b');
    });

    it('turns encoded dangerous markup into inert text, not active markup', () => {
      // The entities decode to their literal characters, which is what a
      // text/plain part needs; nothing re-parses them as tags.
      expect(htmlToText('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>');
    });
  });

  describe('regression: entity decoding is single-pass', () => {
    // A one-pass walk is what keeps a nested escape literal (code scanning
    // alert 29). With a sequential `.replace()` chain the escape character
    // decodes first and the remainder is then decoded a second time.

    it('does not double-unescape an escaped double quote', () => {
      expect(htmlToText('&amp;quot;')).toBe('&quot;');
    });

    it('does not double-unescape an escaped less-than', () => {
      expect(htmlToText('&amp;lt;')).toBe('&lt;');
    });

    it('does not double-unescape an escaped ampersand', () => {
      expect(htmlToText('&amp;amp;')).toBe('&amp;');
    });

    it.each([
      ['&amp;lt;script&amp;gt;', '&lt;script&gt;'],
      [
        '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;',
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      ],
    ])('does not let double-encoded markup (%j) slip through', (input, expected) => {
      // The nested escape survives as literal text, so no `<script>` is ever
      // formed — the property code scanning alert 27 is about.
      expect(htmlToText(input)).toBe(expected);
      expect(htmlToText(input)).not.toContain('<script>');
    });

    it('drops tags and collapses whitespace without decoding nested entities twice', () => {
      const text = htmlToText('<p>Berkah &amp;amp; damai</p>  <div>Rp&amp;nbsp;100</div>');
      expect(text).toBe('Berkah &amp; damai\n Rp&nbsp;100');
    });
  });

  describe('whitespace', () => {
    it('collapses runs of spaces and tabs, caps blank lines, and trims', () => {
      expect(htmlToText('  satu   dua\t\ttiga  ')).toBe('satu dua tiga');
      expect(htmlToText('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
    });
  });
});
