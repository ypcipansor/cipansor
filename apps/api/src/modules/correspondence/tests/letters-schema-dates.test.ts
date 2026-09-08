import { describe, it, expect } from 'vitest';
import { updateLetterSchema, createLetterSchema } from '@cipansor/shared';

describe('letter date/receivedAt validation', () => {
  it('updateLetterSchema accepts a valid ISO date', () => {
    expect(
      updateLetterSchema.parse({ date: '2026-09-01', receivedAt: '2026-09-02T08:00:00.000Z' })
    ).toEqual(
      expect.objectContaining({
        date: '2026-09-01',
        receivedAt: '2026-09-02T08:00:00.000Z',
      })
    );
  });

  it('updateLetterSchema rejects a malformed date instead of leaking a 500', () => {
    expect(() => updateLetterSchema.parse({ date: 'not-a-date' })).toThrow();
  });

  it('updateLetterSchema rejects an empty date string', () => {
    expect(() => updateLetterSchema.parse({ date: '' })).toThrow();
  });

  it('updateLetterSchema rejects a malformed receivedAt', () => {
    expect(() => updateLetterSchema.parse({ receivedAt: 'kemarin sore' })).toThrow();
  });

  it('updateLetterSchema allows receivedAt to be omitted or empty (clearing it)', () => {
    expect(updateLetterSchema.parse({}).receivedAt).toBeUndefined();
    expect(updateLetterSchema.parse({ receivedAt: '' }).receivedAt).toBe('');
  });

  it('createLetterSchema rejects a malformed date', () => {
    expect(() =>
      createLetterSchema.parse({
        unitId: '00000000-0000-0000-0000-000000000000',
        direction: 'OUTGOING',
        date: 'not-a-date',
        subject: 'x',
        urgency: 'NORMAL',
        nature: 'PUBLIC',
      })
    ).toThrow();
  });
});
