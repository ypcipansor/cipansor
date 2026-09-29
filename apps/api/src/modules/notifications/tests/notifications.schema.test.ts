import { describe, it, expect } from 'vitest';
import {
  MAX_NOTIFICATION_CONTENT_LENGTH,
  createAnnouncementSchema,
  createNotificationSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  pushStatusQuerySchema,
} from '../notifications.schema';
import { MAX_EMAIL_BODY_LENGTH } from '../email-transport';

/**
 * The request edge and the transport bound have to agree.
 *
 * A notification body is HTML-escaped before it is sent, and escaping turns one
 * character into as many as six (`"` → `&quot;`, `'` → `&#039;`). If the edge
 * accepted more raw content than the transport will take once expanded, the API
 * would return 201 and the recipient would never get the e-mail — the body
 * would be refused downstream. These tests pin the two limits against each
 * other so that gap cannot reopen.
 */
describe('notification content size cap', () => {
  it('accepts the largest body whose worst-case expansion still fits the transport', () => {
    const worstCase = '&'.repeat(MAX_NOTIFICATION_CONTENT_LENGTH);

    expect(
      createNotificationSchema.safeParse({ title: 'Pengumuman', message: worstCase }).success
    ).toBe(true);
    expect(
      createAnnouncementSchema.safeParse({ title: 'Pengumuman', content: worstCase }).success
    ).toBe(true);
  });

  it('leaves headroom for escaping and the template shell', () => {
    // 6× is the worst expansion the escaping performs; the template adds a few
    // KB. The edge cap must leave room for both under the transport bound, or a
    // maximum-length body would still be refused after it was accepted.
    const worstExpansion = MAX_NOTIFICATION_CONTENT_LENGTH * 6 + 64 * 1024;

    expect(worstExpansion).toBeLessThan(MAX_EMAIL_BODY_LENGTH);
  });

  it('rejects a body that would expand past the transport bound', () => {
    // The exact shape of the reported bug: ~2.1M ampersands is a request well
    // under the 10 MiB JSON limit, but escapes to more than the transport's
    // 10 MiB of HTML. It must be refused at the edge, not accepted and then
    // dropped by the email channel.
    const oversized = '&'.repeat(2_100_000);

    expect(
      createNotificationSchema.safeParse({ title: 'Pengumuman', message: oversized }).success
    ).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({ title: 'Pengumuman', content: oversized }).success
    ).toBe(false);
  });
});

/**
 * The push endpoint is attacker-controlled and the (future) sender POSTs to it
 * from inside our network, so an unvalidated value is an SSRF primitive
 * (CWE-918). Real push services are public HTTPS hosts, so the guard rejects
 * nothing a browser produces while refusing loopback, link-local, private and
 * unique-local addresses.
 */
describe('push endpoint validation (SSRF guard)', () => {
  const keys = { p256dh: 'p', auth: 'a' };
  const withEndpoint = (endpoint: string) =>
    pushSubscribeSchema.safeParse({
      subscription: { endpoint, expirationTime: null, keys },
    }).success;

  it('accepts a public HTTPS push service', () => {
    expect(withEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(withEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
  });

  it('rejects a non-HTTPS endpoint', () => {
    expect(withEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
  });

  it.each([
    'https://127.0.0.1/x',
    'https://localhost/x',
    'https://foo.localhost/x',
    'https://10.0.0.5/x',
    'https://192.168.1.4/x',
    'https://172.16.0.1/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://0.0.0.0/x',
    'https://[::1]/x',
    'https://[fe80::1]/x',
    'https://[fd00::1]/x',
  ])('rejects a server-reachable host: %s', (endpoint) => {
    expect(withEndpoint(endpoint)).toBe(false);
  });

  it('applies the same guard to unsubscribe and status endpoints', () => {
    expect(pushUnsubscribeSchema.safeParse({ endpoint: 'https://127.0.0.1/x' }).success).toBe(
      false
    );
    expect(pushStatusQuerySchema.safeParse({ endpoint: 'https://10.0.0.1/x' }).success).toBe(false);
    expect(
      pushUnsubscribeSchema.safeParse({ endpoint: 'https://push.example.com/abc' }).success
    ).toBe(true);
  });
});
