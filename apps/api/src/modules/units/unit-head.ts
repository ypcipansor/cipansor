import { RoleCode, UnitType } from '@prisma/client';
import { unitDocumentName, type UnitHead } from '@cipansor/shared';
import { prisma } from '@/lib/prisma';

/** The role whose holder heads each kind of unit. */
const HEAD_ROLE: Partial<Record<UnitType, RoleCode>> = {
  TK_QURAN: RoleCode.TKQ_KEPALA_SEKOLAH,
  SD_IT: RoleCode.SDIT_KEPALA_SEKOLAH,
  SMP_IT: RoleCode.SMPIT_KEPALA_SEKOLAH,
  SMA_QURAN: RoleCode.SMAQ_KEPALA_SEKOLAH,
  PESANTREN: RoleCode.PESANTREN_PENGASUH,
};

/**
 * The head of a unit, who signs its documents: the one person holding the
 * unit's head role in an active, unexpired assignment. None, or more than one
 * — a handover not yet closed — answers null, and the document leaves the line
 * to be signed by hand. Print pages used to write an invented "H. Ahmad
 * Fauzi" with an invented NIP there instead.
 *
 * Not scoped: callers check the reader's reach (`UnitService.head`).
 */
export async function findUnitHead(unitId: string): Promise<UnitHead | null> {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, deletedAt: null },
    select: { type: true, name: true, officialName: true },
  });
  const role = unit && HEAD_ROLE[unit.type];
  if (!unit || !role) return null;

  const now = new Date();
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      unitId,
      isActive: true,
      role: { code: role },
      user: { isActive: true, deletedAt: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      user: { select: { id: true, name: true, teacher: { select: { nip: true } } } },
    },
  });
  const people = new Map(assignments.map((a) => [a.user.id, a.user]));
  if (people.size !== 1) return null;

  const [person] = people.values();
  return {
    name: person.name,
    nip: person.teacher?.nip ?? null,
    title:
      unit.type === UnitType.PESANTREN ? 'Pimpinan Pesantren' : `Kepala ${unitDocumentName(unit)}`,
  };
}
