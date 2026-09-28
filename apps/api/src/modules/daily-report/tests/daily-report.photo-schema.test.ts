import { describe, it, expect } from 'vitest';
import {
  createDailyReportSchema,
  dailyReportPhotoSchema,
  updateDailyReportSchema,
} from '@cipansor/shared';

/**
 * The daily-report photo contract, exercised through the schemas the routes
 * validate with. Both storage providers must be accepted: Azure answers with an
 * absolute URL ending in `/uploads/<file>`; the local provider (dev, the e2e
 * stack) answers with the relative `/uploads/<file>` path the browser resolves
 * against the API origin. A link to somewhere else is not a stored file.
 */
describe('daily-report photo contract', () => {
  it('accepts an absolute stored upload URL (Azure provider)', () => {
    expect(
      dailyReportPhotoSchema.safeParse({ url: 'https://api.test/uploads/a.jpg' }).success
    ).toBe(true);
  });

  it('accepts a relative stored /uploads path (local provider)', () => {
    const parsed = dailyReportPhotoSchema.safeParse({ url: '/uploads/a.jpg' });
    expect(parsed.success).toBe(true);
  });

  it('keeps an optional caption', () => {
    const parsed = dailyReportPhotoSchema.safeParse({
      url: '/uploads/a.jpg',
      caption: 'Bermain balok',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.caption).toBe('Bermain balok');
  });

  it('rejects a raw blob host that is not an application upload', () => {
    expect(
      dailyReportPhotoSchema.safeParse({
        url: 'https://store.blob.core.windows.net/x/a.jpg',
      }).success
    ).toBe(false);
  });

  it('rejects a path traversal or empty reference', () => {
    expect(dailyReportPhotoSchema.safeParse({ url: '/uploads/../x' }).success).toBe(false);
    expect(dailyReportPhotoSchema.safeParse({ url: '' }).success).toBe(false);
  });

  it('create accepts the photos list and no longer the legacy photoUrls field', () => {
    const base = {
      studentId: '11111111-1111-4111-8111-111111111111',
      reportDate: '2026-09-28',
    };
    expect(
      createDailyReportSchema.safeParse({
        ...base,
        photos: [{ url: '/uploads/a.jpg' }],
      }).success
    ).toBe(true);
    expect(
      createDailyReportSchema.safeParse({
        ...base,
        photos: [{ url: 'https://store.blob.core.windows.net/x/a.jpg' }],
      }).success
    ).toBe(false);
  });

  it('update accepts an empty photos list to clear the record', () => {
    expect(updateDailyReportSchema.safeParse({ photos: [] }).success).toBe(true);
  });
});
