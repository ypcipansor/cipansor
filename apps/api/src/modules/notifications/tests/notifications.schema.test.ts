import { describe, it, expect } from 'vitest';
import {
  MAX_NOTIFICATION_CONTENT_LENGTH,
  createAnnouncementSchema,
  createNotificationSchema,
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
