import { describe, it, expect } from 'vitest';
import {
  MAX_NOTIFICATION_MESSAGE_CHARS,
  createBulkNotificationSchema,
  createNotificationSchema,
} from '../notifications.schema';
import { EMAIL_LAYOUT_OVERHEAD_CHARS, MAX_EMAIL_HTML_CHARS } from '../email-transport';

/**
 * The raw length whose escaped HTML exactly fills the cap once the layout
 * overhead is reserved. `'` is the worst case: it escapes to six characters.
 */
const RAW_AT_LIMIT = Math.floor((MAX_EMAIL_HTML_CHARS - EMAIL_LAYOUT_OVERHEAD_CHARS) / 6);

/**
 * External e-mail is best-effort: `createNotification` persists the in-app row,
 * fans out, and swallows a delivery failure. A message whose rendered HTML
 * exceeds the converter's cap is therefore the one case where the caller is
 * told "success" while the e-mail was silently dropped. The guard must refuse
 * it at the edge — and must refuse it *before* the row exists.
 */
describe('notification message size guard', () => {
  const base = { title: 'Pemberitahuan', message: 'Isi pesan yang wajar' };

  it('accepts an ordinary message with EMAIL selected', () => {
    const result = createNotificationSchema.safeParse({ ...base, channels: ['EMAIL'] });
    expect(result.success).toBe(true);
  });

  it('rejects a message whose escaped HTML would exceed the e-mail cap', () => {
    // Every character escapes to six (`'` -> `&#039;`), so this raw message is
    // under the 500k raw limit yet its HTML is over the converter's cap.
    const message = "'".repeat(400_000);
    expect(message.length).toBeLessThanOrEqual(MAX_NOTIFICATION_MESSAGE_CHARS);

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
    const result = createNotificationSchema.safeParse({ ...base, message, channels: ['IN_APP'] });
    expect(result.success).toBe(true);
  });

  it('does not reject at the boundary, and rejects one character past it', () => {
    expect(
      createNotificationSchema.safeParse({
        ...base,
        message: "'".repeat(RAW_AT_LIMIT),
        channels: ['EMAIL'],
      }).success
    ).toBe(true);
    expect(
      createNotificationSchema.safeParse({
        ...base,
        message: "'".repeat(RAW_AT_LIMIT + 1),
        channels: ['EMAIL'],
      }).success
    ).toBe(false);
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

  it('applies the same guard to the bulk schema', () => {
    const message = "'".repeat(400_000);
    const userIds = ['00000000-0000-0000-0000-000000000000'];
    expect(
      createBulkNotificationSchema.safeParse({ ...base, message, userIds, channels: ['EMAIL'] })
        .success
    ).toBe(false);
    expect(
      createBulkNotificationSchema.safeParse({ ...base, message, userIds, channels: ['IN_APP'] })
        .success
    ).toBe(true);
  });
});
