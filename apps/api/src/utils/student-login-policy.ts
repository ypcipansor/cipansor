import { UnitType } from '@prisma/client';

/**
 * Whether a unit's students hold logins of their own.
 *
 * TK Qur'an pupils do not, and will not: they are four to six years old. The
 * RoleCode enum already says so — there is deliberately no `TKQ_SISWA`, with a
 * note that guardians use `TKQ_ORANG_TUA` instead. Nothing enforced it outside
 * that comment, so the seed simply produced no TK pupils at all, and TK Qur'an
 * ended up with three teachers, no classes and nobody enrolled. The PAUD
 * development assessment then attached itself to a SMA Qur'an santri, because
 * that was the only student the seed had left to point at.
 *
 * A pupil without a login is still a pupil. They need a Student row so
 * attendance, PAUD assessment, SPP and the parent portal have someone to point
 * at; what they do not need is a credential. `User.passwordHash` is null for
 * them — see the note on that column.
 *
 * Kept as a policy on unit *type* rather than a check for a `*_SISWA` RoleCode:
 * the absence of a role is evidence, not a rule, and reading it as one would
 * silently change behaviour the day someone adds a role for another reason.
 */
export const STUDENT_LOGIN_POLICY: Record<UnitType, boolean> = {
  [UnitType.TK_QURAN]: false,
  [UnitType.SD_IT]: true,
  [UnitType.SMP_IT]: true,
  [UnitType.SMA_QURAN]: true,
  [UnitType.PESANTREN]: true,
  // No students of their own; the value is never consulted.
  [UnitType.UNIT_USAHA]: false,
  [UnitType.OTHER]: true,
};

/** True when students at this kind of unit are issued an account. */
export function studentsHoldLogins(unitType: UnitType): boolean {
  return STUDENT_LOGIN_POLICY[unitType] ?? true;
}
