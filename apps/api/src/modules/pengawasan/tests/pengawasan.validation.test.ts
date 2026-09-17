import { describe, it, expect } from 'vitest';
import {
  createBoardSuspensionSchema,
  updateAuditSchema,
  submitPeriodicReportSchema,
  forwardWbsReportSchema,
} from '../pengawasan.validation';
import { PLH_ROLE_CODES } from '@cipansor/shared';

/**
 * Edge contracts for the pengawasan module. The board-suspension payload is the
 * one that matters most: its `plhRoleCode` used to be a free string, which let
 * a caller name any role — including SUPER_ADMIN — for the stand-in officer.
 */
describe('pengawasan validation contracts', () => {
  const baseSuspension = {
    userId: '11111111-1111-4111-8111-111111111111',
    skNumber: 'SK/001',
    auditReason: 'Alasan audit yang cukup panjang.',
  };

  it('accepts each legitimate Pengurus Plh role', () => {
    for (const code of PLH_ROLE_CODES) {
      const parsed = createBoardSuspensionSchema.safeParse({
        ...baseSuspension,
        plhUserId: '22222222-2222-4222-8222-222222222222',
        plhRoleCode: code,
      });
      expect(parsed.success, `${code} should be accepted`).toBe(true);
    }
  });

  it.each(['SUPER_ADMIN', 'YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'SDIT_ADMIN'])(
    'rejects the non-Pengurus Plh role %s at the edge',
    (code) => {
      const parsed = createBoardSuspensionSchema.safeParse({
        ...baseSuspension,
        plhUserId: '22222222-2222-4222-8222-222222222222',
        plhRoleCode: code,
      });
      expect(parsed.success).toBe(false);
    }
  );

  it('allows omitting the Plh role entirely', () => {
    expect(createBoardSuspensionSchema.safeParse(baseSuspension).success).toBe(true);
  });

  it('treats an empty-string Plh as "not provided" rather than an invalid UUID', () => {
    // The web form initialises the field to `""` and submits it verbatim. A
    // bare `z.string().uuid()` rejects that — it is neither a UUID nor absent —
    // so the suspension form refused to submit without a Plh, even though one
    // is optional.
    const parsed = createBoardSuspensionSchema.safeParse({
      ...baseSuspension,
      plhUserId: '',
      plhRoleCode: '',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.plhUserId).toBeUndefined();
    expect(parsed.success && parsed.data.plhRoleCode).toBeUndefined();
  });

  it('still rejects a malformed Plh user id', () => {
    expect(
      createBoardSuspensionSchema.safeParse({ ...baseSuspension, plhUserId: 'not-a-uuid' }).success
    ).toBe(false);
  });

  it('rejects a misspelled WBS forward role at the edge', () => {
    // A free string here let a typo such as `primaryHandlerRole` through and the
    // report landed in a queue no role's scope query matches.
    expect(
      forwardWbsReportSchema.safeParse({
        toRole: 'primaryHandlerRole',
        reason: 'alasan yang cukup panjang',
      }).success
    ).toBe(false);
    expect(
      forwardWbsReportSchema.safeParse({
        toRole: 'YAYASAN_KETUA',
        reason: 'alasan yang cukup panjang',
      }).success
    ).toBe(true);
  });

  it('rejects a null plannedDate on audit update — the column is NOT NULL', () => {
    const parsed = updateAuditSchema.safeParse({ plannedDate: null });
    expect(parsed.success).toBe(false);
  });

  it('accepts a valid plannedDate and an omitted one', () => {
    expect(updateAuditSchema.safeParse({ plannedDate: '2026-05-01' }).success).toBe(true);
    expect(updateAuditSchema.safeParse({}).success).toBe(true);
  });

  it('requires the mandatory periodic-report fields', () => {
    expect(submitPeriodicReportSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(
      submitPeriodicReportSchema.safeParse({
        title: 'Laporan',
        period: '2026-Q1',
        executiveSummary: 'Ringkasan eksekutif.',
      }).success
    ).toBe(true);
  });
});