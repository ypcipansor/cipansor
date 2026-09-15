import { describe, it, expect } from 'vitest';
import { normalizeEmail, normalizeOptionalEmail } from '@/utils/email';

describe('normalizeEmail', () => {
  it('lower-cases the local part and the domain', () => {
    expect(normalizeEmail('Guru@Cipansor.OR.Id')).toBe('guru@cipansor.or.id');
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(normalizeEmail('  guru@cipansor.or.id  ')).toBe('guru@cipansor.or.id');
  });

  it('is idempotent — a second pass changes nothing', () => {
    const once = normalizeEmail('Mixed@Case.COM');
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe('normalizeOptionalEmail', () => {
  it('leaves null and undefined untouched', () => {
    expect(normalizeOptionalEmail(null)).toBeNull();
    expect(normalizeOptionalEmail(undefined)).toBeUndefined();
  });

  it('maps an empty string to null so it matches the create path', () => {
    expect(normalizeOptionalEmail('')).toBeNull();
  });

  it('normalises a non-empty value', () => {
    expect(normalizeOptionalEmail('Wali@Cipansor.or.id')).toBe('wali@cipansor.or.id');
  });
});
