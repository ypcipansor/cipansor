import { describe, it, expect } from 'vitest';
import { admissionFeeSettled, assertAdmissionFeeSettled } from './admission-fee-gate';

/**
 * Enrollment gated only on status === 'ACCEPTED'. Acceptance is an academic
 * decision, not daftar ulang, so an accepted registrant became a full santri —
 * account, class, wallet, medical record, NISN — without paying anything.
 */
describe('admission fee gate', () => {
  it('refuses an accepted registrant who has not paid', () => {
    expect(
      admissionFeeSettled({ registrationFee: 500_000, registrationFeePaidAt: null })
    ).toBe(false);

    expect(() =>
      assertAdmissionFeeSettled({ registrationFee: 500_000, registrationFeePaidAt: null })
    ).toThrow(/belum melunasi/i);
  });

  it('allows them once the payment is recorded', () => {
    expect(
      admissionFeeSettled({
        registrationFee: 500_000,
        registrationFeePaidAt: new Date('2026-07-01'),
      })
    ).toBe(true);
  });

  // The rule is "nothing outstanding", not "someone paid" — otherwise a
  // waived fee or a scholarship placement would be blocked by a charge that
  // was never made.
  it('allows a zero or waived fee with no payment', () => {
    expect(admissionFeeSettled({ registrationFee: 0, registrationFeePaidAt: null })).toBe(true);
    expect(admissionFeeSettled({ registrationFee: null, registrationFeePaidAt: null })).toBe(true);
    expect(admissionFeeSettled({ registrationFeePaidAt: null })).toBe(true);
  });

  // Prisma hands Decimal columns back as objects, not numbers.
  it('handles a Prisma Decimal amount', () => {
    const decimal = { toNumber: () => 750_000 };

    expect(
      admissionFeeSettled({ registrationFee: decimal, registrationFeePaidAt: null })
    ).toBe(false);
    expect(
      admissionFeeSettled({ registrationFee: decimal, registrationFeePaidAt: new Date() })
    ).toBe(true);
  });

  it('treats a zero Decimal as nothing owed', () => {
    expect(
      admissionFeeSettled({ registrationFee: { toNumber: () => 0 }, registrationFeePaidAt: null })
    ).toBe(true);
  });
});
