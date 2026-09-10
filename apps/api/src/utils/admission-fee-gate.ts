import { Errors } from '@/middleware/error';

/**
 * Whether a registrant may be turned into an active santri.
 *
 * Enrollment gated only on `status === 'ACCEPTED'`. Being accepted is an
 * academic decision; it is not the same as having completed daftar ulang. So
 * an accepted registrant became a full student — account, class enrolment,
 * wallet, medical record, NISN — before paying anything, and the fee owed
 * (AdmissionPeriod.registrationFee) had no counterpart recording settlement.
 *
 * Two enrolment paths exist (the onboarding orchestrator and
 * admissions.service.enrollRegistrant) and they have drifted apart before, so
 * the rule lives here and both call it.
 *
 * Deliberately *not* applied to students transferring in from another school
 * or pesantren: they do not come through SPMB at all. They are entered by an
 * admin through the student CRUD, which has its own guardian linking.
 */

export interface FeeGateInput {
  /** What the period or wave charges. Null/0 means nothing is owed. */
  registrationFee?: number | { toNumber(): number } | null;
  /** When the registrant settled it, if they have. */
  registrationFeePaidAt?: Date | null;
}

function toNumber(value: FeeGateInput['registrationFee']): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  // Prisma Decimal
  return value.toNumber();
}

/** True when the fee is settled, or when there is nothing to settle. */
export function admissionFeeSettled(input: FeeGateInput): boolean {
  const owed = toNumber(input.registrationFee);
  if (owed <= 0) return true;
  return input.registrationFeePaidAt != null;
}

/**
 * Throws unless the registrant may be enrolled.
 *
 * A waived or zero fee passes: the rule is "nothing outstanding", not
 * "someone paid", so free admissions and scholarship placements are not
 * blocked by a fee that was never charged.
 */
export function assertAdmissionFeeSettled(input: FeeGateInput): void {
  if (admissionFeeSettled(input)) return;

  throw Errors.badRequest(
    'Pendaftar belum melunasi biaya daftar ulang. Catat pelunasan terlebih ' +
      'dahulu sebelum menjadikannya santri aktif.'
  );
}
