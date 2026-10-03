import {
  ADMIN_ROLE_CODES,
  GOVERNANCE_ROLE_CODES,
  PESANTREN_LEADER_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  SCHOOL_TEACHER_ROLE_CODES,
  TATA_USAHA_ROLE_CODES,
  type AnnouncementScopeCode,
} from '@cipansor/shared';

/**
 * Who may publish what (decisions/siaran-pengumuman.md, 2026-10-03). Decided
 * by the caller's active role, the one that also picks their menu:
 *
 * - the yayasan's organs and the Pimpinan Pesantren: the yayasan, or a unit;
 * - a unit's head, TU and admin: their unit;
 * - a guru or ustadz: the classes they teach or homeroom;
 * - a musyrif: the santri mukim in the kamar they look after;
 * - Super Admin: nothing — it runs the system and is not an organ, the same
 *   line E-Office draws for revocation;
 * - everyone else (santri, wali, staf layanan, komite, alumni): nothing.
 */

export interface AnnouncementActor {
  sub: string;
  roleCode?: string | null;
  unitId: string | null;
}

const YAYASAN_SENDERS = [...GOVERNANCE_ROLE_CODES, ...PESANTREN_LEADER_ROLE_CODES];
const UNIT_SENDERS = [
  ...ADMIN_ROLE_CODES.filter((c) => c !== 'SUPER_ADMIN'),
  ...PRINCIPAL_ROLE_CODES,
  ...TATA_USAHA_ROLE_CODES,
];
const CLASS_SENDERS = [...SCHOOL_TEACHER_ROLE_CODES, 'USTADZ', 'MUHAFIDZ'];
const BOARDER_SENDERS = ['MUSYRIF'];

/** The scopes the caller's active role may publish to. */
export function scopesFor(actor: AnnouncementActor): AnnouncementScopeCode[] {
  const code = actor.roleCode ?? '';
  if (YAYASAN_SENDERS.includes(code)) return ['YAYASAN', 'UNIT'];
  if (UNIT_SENDERS.includes(code)) return actor.unitId ? ['UNIT'] : [];
  if (CLASS_SENDERS.includes(code)) return ['CLASSES'];
  if (BOARDER_SENDERS.includes(code)) return ['BOARDERS'];
  return [];
}

/** Whether the caller chooses the unit (organs) or always writes to their own. */
export const choosesUnit = (actor: AnnouncementActor) =>
  YAYASAN_SENDERS.includes(actor.roleCode ?? '');

/**
 * Who may revise or withdraw an announcement: its author; for a unit's
 * announcement (any scope), that unit's head and admin; for any announcement,
 * the yayasan's organs and the Pimpinan Pesantren. Not Super Admin, and not a
 * TU who did not write it — withdrawing is the head's call.
 */
export function mayManage(
  actor: AnnouncementActor,
  announcement: { createdById: string; unitId: string | null }
): boolean {
  if (announcement.createdById === actor.sub) return true;
  const code = actor.roleCode ?? '';
  if (YAYASAN_SENDERS.includes(code)) return true;
  const unitHead =
    PRINCIPAL_ROLE_CODES.includes(code) ||
    (ADMIN_ROLE_CODES.includes(code) && code !== 'SUPER_ADMIN');
  return unitHead && !!actor.unitId && announcement.unitId === actor.unitId;
}

/** Whether the caller oversees a unit's announcements (sees all of them, withdrawn included). */
export function overseesUnit(actor: AnnouncementActor): 'ALL' | string | null {
  const code = actor.roleCode ?? '';
  if (YAYASAN_SENDERS.includes(code)) return 'ALL';
  const unitHead =
    PRINCIPAL_ROLE_CODES.includes(code) ||
    (ADMIN_ROLE_CODES.includes(code) && code !== 'SUPER_ADMIN') ||
    TATA_USAHA_ROLE_CODES.includes(code);
  return unitHead && actor.unitId ? actor.unitId : null;
}
