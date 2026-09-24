import { describe, it, expect } from 'vitest';
import { EmployeeDocumentType } from '@prisma/client';
import { createEmployeeDocumentSchema } from '@cipansor/shared';

// `createEmployeeDocumentSchema` lives in `@cipansor/shared`, which cannot
// import `@prisma/client` (it must stay framework-free for the web bundle), so
// its `type` enum is a plain string list. This test is the contract that keeps
// it in exact sync with the DB enum — a value added to the schema enum but not
// the DB (or vice-versa) fails here rather than at the first insert.
describe('shared employee-document contract stays in sync with the DB', () => {
  it('accepts every Prisma EmployeeDocumentType', () => {
    const base = { userId: crypto.randomUUID(), name: 'KTP', fileUrl: 'https://x/y.pdf' };
    for (const type of Object.values(EmployeeDocumentType)) {
      const parsed = createEmployeeDocumentSchema.safeParse({ ...base, type });
      expect(parsed.success, `schema rejected DB enum value ${type}`).toBe(true);
    }
  });

  it('rejects a type the DB enum does not have', () => {
    const parsed = createEmployeeDocumentSchema.safeParse({
      userId: crypto.randomUUID(),
      name: 'KTP',
      type: 'PASPOR',
      fileUrl: 'https://x/y.pdf',
    });
    expect(parsed.success).toBe(false);
  });

  it('coerces the ISO expiryDate string the web client sends', () => {
    const parsed = createEmployeeDocumentSchema.safeParse({
      userId: crypto.randomUUID(),
      name: 'KTP',
      type: 'KTP',
      fileUrl: 'https://x/y.pdf',
      expiryDate: '2030-01-02T00:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.expiryDate).toBeInstanceOf(Date);
    }
  });
});
