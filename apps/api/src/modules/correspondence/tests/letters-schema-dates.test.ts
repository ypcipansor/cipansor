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

  describe('updateLetterSchema is the single source of truth for update payloads', () => {
    it('strips fields the update endpoint does NOT support (status, direction, unitId)', () => {
      // `UpdateLetterInput` is derived from this schema, so a typed client can no
      // longer send `status`/`direction`/`unitId`. Even a raw payload gets them
      // stripped here — the server applies only what the schema keeps.
      const result = updateLetterSchema.parse({
        subject: 'Naskah baru',
        status: 'APPROVED', // ← not in the schema
        direction: 'INCOMING', // ← not in the schema
        unitId: '00000000-0000-0000-0000-000000000000', // ← not in the schema
      });

      expect(result).toEqual({ subject: 'Naskah baru' });
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('direction');
      expect(result).not.toHaveProperty('unitId');
    });

    it('keeps the supported editable fields', () => {
      const result = updateLetterSchema.parse({
        subject: 'Naskah baru',
        content: 'Isi',
        urgency: 'URGENT',
        nature: 'PUBLIC',
        recipientName: 'Kepala Sekolah',
      });

      expect(result).toMatchObject({
        subject: 'Naskah baru',
        content: 'Isi',
        urgency: 'URGENT',
        nature: 'PUBLIC',
        recipientName: 'Kepala Sekolah',
      });
    });
  });
});
