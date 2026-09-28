import { describe, it, expect } from 'vitest';
import {
  MAX_NOTIFICATION_MESSAGE_CHARS,
  createBulkNotificationSchema,
  createNotificationSchema,
} from '../notifications.schema';
import { MAX_EMAIL_HTML_CHARS, notificationMessageHtml } from '../email-transport';

/**
 * External e-mail is best-effort: `createNotification` persists the in-app row,
 * fans out, and swallows a delivery failure. A message whose escaped HTML
 * exceeds the converter's cap is therefore the one case where the caller is
 * told "success" while the e-mail was silently dropped. The guard must refuse
 * it at the edge — and must measure the HTML actually sent, not a worst case,
 * or it refuses messages that were never at risk.
 */
describe('notification message size guard', () => {
  const base = {
    userId: '00000000-0000-0000-0000-000000000000',
    title: 'Pemberitahuan',
    message: 'Isi pesan yang wajar',
  };

  it('accepts an ordinary message with EMAIL selected', () => {
    expect(createNotificationSchema.safeParse({ ...base, channels: ['EMAIL'] }).success).toBe(true);
  });

  it('accepts a 400,000-char message of ordinary letters with EMAIL selected', () => {
    // Escaped, this is 400,000 chars — well under the cap. A worst-case (6x)
    // check refused it and dropped a valid e-mail; the finding that caught it.
    const message = 'a'.repeat(400_000);
    expect(notificationMessageHtml(message).length).toBeLessThan(MAX_EMAIL_HTML_CHARS);
    expect(
      createNotificationSchema.safeParse({ ...base, message, channels: ['EMAIL'] }).success
    ).toBe(true);
  });

  it('rejects a message whose escaped HTML exceeds the cap', () => {
    // `'` -> `&#039;` (6 chars): ~2,400,000 escaped, over the converter's cap,
    // while still under the 500,000 raw message cap.
    const message = "'".repeat(400_000);
    expect(message.length).toBeLessThanOrEqual(MAX_NOTIFICATION_MESSAGE_CHARS);
    expect(notificationMessageHtml(message).length).toBeGreaterThan(MAX_EMAIL_HTML_CHARS);

    const result = createNotificationSchema.safeParse({ ...base, message, channels: ['EMAIL'] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['message']);
      expect(result.error.issues[0].message).toMatch(/terlalu panjang/i);
    }
  });

  it('still accepts that same message when only IN_APP is requested', () => {
    // The in-app row is harmless at any allowed size; only the e-mail is at
    // risk. Refusing the whole notification would lose the record too.
    const message = "'".repeat(400_000);
    expect(
      createNotificationSchema.safeParse({ ...base, message, channels: ['IN_APP'] }).success
    ).toBe(true);
  });

  it('rejects a message over the absolute length limit on any channel', () => {
    const message = 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1);
    expect(
      createNotificationSchema.safeParse({ ...base, message, channels: ['IN_APP'] }).success
    ).toBe(false);
    expect(
      createNotificationSchema.safeParse({ ...base, message, channels: ['EMAIL'] }).success
    ).toBe(false);
  });

  it('does not apply the e-mail size guard without a recipient user', () => {
    // The service dispatches only when `data.userId` is set, so a system
    // notification with no recipient has no e-mail to lose and must not be
    // refused over one.
    const message = "'".repeat(400_000);
    const { userId: _userId, ...noRecipient } = base;
    expect(
      createNotificationSchema.safeParse({ ...noRecipient, message, channels: ['EMAIL'] }).success
    ).toBe(true);
  });

  it('still caps a recipient-less message at the raw length limit', () => {
    const message = 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1);
    const { userId: _userId, ...noRecipient } = base;
    expect(
      createNotificationSchema.safeParse({ ...noRecipient, message, channels: ['EMAIL'] }).success
    ).toBe(false);
  });

  it('does not apply the e-mail size guard to the bulk schema (it sends nothing)', () => {
    // `createBulkNotifications` writes rows through `createMany` and dispatches
    // no mail, so an EMAIL channel there must not inherit a send it never makes.
    const message = "'".repeat(400_000);
    const userIds = ['00000000-0000-0000-0000-000000000000'];
    expect(
      createBulkNotificationSchema.safeParse({ ...base, message, userIds, channels: ['EMAIL'] })
        .success
    ).toBe(true);
    expect(
      createBulkNotificationSchema.safeParse({ ...base, message, userIds, channels: ['IN_APP'] })
        .success
    ).toBe(true);
  });

  it('still caps the bulk schema at the raw length limit', () => {
    const message = 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1);
    const userIds = ['00000000-0000-0000-0000-000000000000'];
    expect(
      createBulkNotificationSchema.safeParse({ ...base, message, userIds, channels: ['IN_APP'] })
        .success
    ).toBe(false);
  });
});
