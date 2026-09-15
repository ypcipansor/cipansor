import { RoleCode, UnitType } from '@prisma/client';

/**
 * The guardian role that belongs to each kind of unit.
 *
 * Only the school/TK-SD-SMP-SMA units have guardian roles; the higher units
 * serve adult students, so no guardian role exists for them.
 */
export const PARENT_ROLE_BY_UNIT_TYPE: Partial<Record<UnitType, RoleCode>> = {
  [UnitType.TK_QURAN]: RoleCode.TKQ_ORANG_TUA,
  [UnitType.SD_IT]: RoleCode.SDIT_ORANG_TUA,
  [UnitType.SMP_IT]: RoleCode.SMPIT_ORANG_TUA,
  [UnitType.SMA_QURAN]: RoleCode.SMAQ_ORANG_TUA,
};

export function parentRoleForUnitType(unitType: UnitType): RoleCode | undefined {
  return PARENT_ROLE_BY_UNIT_TYPE[unitType];
}

/** A child, reduced to what decides their guardian's scope. */
export interface ChildScope {
  unitId: string;
  unitType: UnitType;
}

export interface RequiredParentRole {
  unitId: string;
  roleCode: RoleCode;
}

/**
 * The guardian-role assignments a wali should hold, given their children.
 *
 * One per unit in which they have a child — no more, no fewer. A wali with a
 * child in TK, one in SD and one in SMP reaches all three units through three
 * assignments on **one** account; that is what the multi-role switcher is for.
 * Duplicated children in the same unit collapse to a single assignment.
 *
 * Derived rather than written down because the two drift otherwise: before
 * this existed a wali's unit was set once, by hand, at the moment their first
 * child was recorded, and a second child at another jenjang changed nothing.
 */
export function requiredParentRoles(children: ChildScope[]): RequiredParentRole[] {
  const byUnit = new Map<string, RoleCode>();
  for (const child of children) {
    const roleCode = parentRoleForUnitType(child.unitType);
    if (!roleCode) continue;
    byUnit.set(child.unitId, roleCode);
  }
  return [...byUnit].map(([unitId, roleCode]) => ({ unitId, roleCode }));
}

/**
 * True when this role only makes sense for someone with a child at that unit.
 *
 * Used to refuse a guardian role handed out on its own. "Wali tanpa anak" is
 * the shape of the mistake: someone is given SDIT_ORANG_TUA, gains a parent
 * portal, and it is empty — or worse, they are scoped to a school no child of
 * theirs attends.
 *
 * Note the asymmetry with the reverse rule. A guardian *account* may exist
 * before any link — SPMB creates one while the registrant is still being
 * processed — so "reject a parent with no children" cannot be a blanket check
 * at creation time. It is the *role* that requires the child, and this is the
 * moment to say so.
 */
export function isParentRole(roleCode: string): boolean {
  return (Object.values(PARENT_ROLE_BY_UNIT_TYPE) as string[]).includes(roleCode);
}

/**
 * The minimal slice of Prisma this needs, so it works with both the client and
 * a transaction client without either being imported here.
 */
export interface ParentScopeClient {
  studentParent: {
    findMany(args: unknown): Promise<
      Array<{ student: { unitId: string; unit: { type: UnitType } } }>
    >;
  };
  userRoleAssignment: {
    findMany(args: unknown): Promise<
      Array<{ roleId: string; unitId: string | null; isPrimary: boolean }>
    >;
    create(args: unknown): Promise<unknown>;
  };
  role: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
}

/**
 * Give a guardian the role assignments their children imply, and return how
 * many were added.
 *
 * Idempotent, and additive only: an assignment is never removed here, because
 * this runs on paths that know a child was *added* and cannot tell whether a
 * missing link means the child left or simply is not part of this transaction.
 *
 * An account that already holds a role keeps it as primary — a guru or a
 * pengurus yayasan whose own child studies here is one login with two roles,
 * not two accounts.
 */
export async function syncParentRoleAssignments(
  client: ParentScopeClient,
  parentId: string
): Promise<number> {
  const links = await client.studentParent.findMany({
    where: { parentId },
    select: { student: { select: { unitId: true, unit: { select: { type: true } } } } },
  });

  const required = requiredParentRoles(
    links.map((l) => ({ unitId: l.student.unitId, unitType: l.student.unit.type }))
  );
  if (required.length === 0) return 0;

  const existing = await client.userRoleAssignment.findMany({
    where: { userId: parentId },
    select: { roleId: true, unitId: true, isPrimary: true },
  });
  let hasPrimary = existing.some((e) => e.isPrimary);

  let added = 0;
  for (const { unitId, roleCode } of required) {
    const role = await client.role.findFirst({ where: { code: roleCode } });
    if (!role) continue;
    if (existing.some((e) => e.roleId === role.id && e.unitId === unitId)) continue;

    await client.userRoleAssignment.create({
      data: { userId: parentId, roleId: role.id, unitId, isPrimary: !hasPrimary, isActive: true },
    });
    hasPrimary = true;
    added++;
  }
  return added;
}
