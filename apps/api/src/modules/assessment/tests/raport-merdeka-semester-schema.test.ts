import { describe, it, expect } from 'vitest';
import { raportMerdekaQuerySchema } from '@cipansor/shared';

describe('raportMerdekaQuerySchema — semester validation', () => {
  const base = { academicYearId: 'academic-year-1' };

  it('accepts semester 1 (Ganjil)', () => {
    const result = raportMerdekaQuerySchema.parse({ ...base, semester: '1' });
    expect(result.semester).toBe(1);
  });

  it('accepts semester 2 (Genap)', () => {
    const result = raportMerdekaQuerySchema.parse({ ...base, semester: '2' });
    expect(result.semester).toBe(2);
  });

  it('accepts a numeric semester 1/2', () => {
    expect(raportMerdekaQuerySchema.parse({ ...base, semester: 1 }).semester).toBe(1);
    expect(raportMerdekaQuerySchema.parse({ ...base, semester: 2 }).semester).toBe(2);
  });

  it('rejects a semester other than 1 or 2 (e.g. 99) which used to produce a fake Genap raport', () => {
    expect(() => raportMerdekaQuerySchema.parse({ ...base, semester: '99' })).toThrow();
  });

  it('rejects a non-numeric semester', () => {
    expect(() => raportMerdekaQuerySchema.parse({ ...base, semester: 'ganjil' })).toThrow();
  });

  it('rejects a missing semester', () => {
    expect(() => raportMerdekaQuerySchema.parse({ ...base })).toThrow();
  });
});
