import { describe, it, expect } from 'vitest';
import {
  MAX_NOTIFICATION_MESSAGE_CHARS,
  createBulkNotificationSchema,
  createNotificationSchema,
} from '../notifications.schema';

/**
 * The schema bounds the request shape — the row we store and the cost of
 * escaping it — and nothing else. It deliberately does **not** decide whether
 * an e-mail is too big: that depends on the system-wide channel policy and on
 * any template that replaces the message, neither of which a request body can
 * know. `createNotification` and `sendEmail` make that call, where the HTML
 * actually sent is known.
 */
describe('notification message size cap', () => {
  const base = {
    userId: '00000000-0000-0000-0000-000000000000',
    title: 'Pemberitahuan',
    message: 'Isi pesan yang wajar',
  };

  it('accepts an ordinary message with EMAIL selected', () => {
    expect(createNotificationSchema.safeParse({ ...base, channels: ['EMAIL'] }).success).toBe(true);
  });

  it('accepts a 400,000-char message of ordinary letters with EMAIL selected', () => {
    const message = 'a'.repeat(400_000);
    expect(
      createNotificationSchema.safeParse({ ...base, message, channels: ['EMAIL'] }).success
    ).toBe(true);
  });

  it('accepts an e-mail message whose escaped HTML exceeds the converter cap', () => {
    // `'` -> `&#039;` escapes to ~2,400,000 chars. The schema must not refuse
    // it: the service persists the in-app row first, and the EMAIL channel may
    // be disabled by policy — a validation error here would lose the record
    // too. Dropping the e-mail is the service's job, not the schema's.
    const message = "'".repeat(400_000);
    expect(message.length).toBeLessThanOrEqual(MAX_NOTIFICATION_MESSAGE_CHARS);
    expect(
      createNotificationSchema.safeParse({ ...base, message, channels: ['IN_APP', 'EMAIL'] })
        .success
    ).toBe(true);
  });

  it('rejects a message over the absolute length limit on any channel', () => {
    const message = 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1);
    for (const channels of [['IN_APP'], ['EMAIL'], ['SMS']]) {
      const result = createNotificationSchema.safeParse({ ...base, message, channels });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['message']);
      }
    }
  });

  it('caps a recipient-less message the same way', () => {
    const { userId: _userId, ...noRecipient } = base;
    expect(
      createNotificationSchema.safeParse({
        ...noRecipient,
        message: 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1),
        channels: ['IN_APP'],
      }).success
    ).toBe(false);
  });

  it('caps the bulk schema at the same limit', () => {
    const userIds = ['00000000-0000-0000-0000-000000000000'];
    expect(
      createBulkNotificationSchema.safeParse({
        ...base,
        message: 'a'.repeat(MAX_NOTIFICATION_MESSAGE_CHARS + 1),
        userIds,
        channels: ['IN_APP'],
      }).success
    ).toBe(false);
    expect(
      createBulkNotificationSchema.safeParse({
        ...base,
        message: "'".repeat(400_000),
        userIds,
        channels: ['EMAIL'],
      }).success
    ).toBe(true);
  });
});
