import { PermitDecider, UnitType } from '@prisma/client';
import {
  PERMIT_HEAD_AFTER_DAYS,
  PESANTREN_LEADER_ROLE_CODES,
  PRINCIPAL_ROLE_CODES,
  type PermitDecision,
  type PermitRoute,
} from '@cipansor/shared';
import type { ScopeActor } from '@/utils/student-scope';

/**
 * Who decides a permit — pure rules over what the service loads (no Prisma
 * here). The reasons are in @cipansor/shared `schemas/permits.ts`.
 */

/** What the rules need to know about the learner. */
export interface Guardianship {
  unitId: string;
  unitType: UnitType;
  /** Has an active kamar: a santri mukim, whose mentor is the musyrif. */
  boarder: boolean;
  /** The musyrif of their kamar or asrama (a boarder), else their wali kelas. */
  mentors: { id: string; name: string }[];
}

export interface DecidablePermit {
  status: string;
  startDate: Date;
  endDate: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The calendar days in WIB a period touches: Friday 13:00 → Sunday 17:00 is 3. */
export function calendarDays(start: Date, end: Date): number {
  const first = Math.floor((start.getTime() + WIB_OFFSET_MS) / DAY_MS);
  const last = Math.floor((end.getTime() + WIB_OFFSET_MS) / DAY_MS);
  return last - first + 1;
}

export function routeOf(permit: DecidablePermit, g: Guardianship): PermitRoute {
  if (calendarDays(permit.startDate, permit.endDate) > PERMIT_HEAD_AFTER_DAYS) return 'LONG';
  return g.mentors.length ? 'MENTOR' : 'NO_MENTOR';
}

/**
 * The head's capacity over this learner, or null: the kepala sekolah of the
 * learner's own unit; the Pimpinan Pesantren over boarders and Takhosus
 * santri — the asrama and the pesantren programme are theirs, the schools'
 * day pupils are not.
 */
export function headCapacity(actor: ScopeActor, g: Guardianship): PermitDecider | null {
  const code = actor.roleCode ?? '';
  if (PRINCIPAL_ROLE_CODES.includes(code) && actor.unitId === g.unitId) {
    return PermitDecider.KEPALA_SEKOLAH;
  }
  if (
    PESANTREN_LEADER_ROLE_CODES.includes(code) &&
    (g.boarder || g.unitType === UnitType.PESANTREN)
  ) {
    return PermitDecider.PIMPINAN_PESANTREN;
  }
  return null;
}

export interface DecisionFor extends PermitDecision {
  /** The capacity the caller would decide in, when `canDecide`. */
  capacity: PermitDecider | null;
}

/**
 * What the caller may do with this permit. The mentor decides what is routed
 * to the mentor; a head decides what is routed to the head, and may take over
 * what is routed to the mentor — the covering case for a mentor who is away.
 * A mentor never decides long leave: that is exactly what goes up.
 */
export function decisionFor(
  permit: DecidablePermit,
  g: Guardianship,
  actor: ScopeActor
): DecisionFor {
  const route = routeOf(permit, g);
  const mentorKind = g.boarder ? 'MUSYRIF' : 'WALI_KELAS';
  const base = { route, mentorKind, mentors: g.mentors } as const;
  const none = { ...base, canDecide: false, asTakeover: false, capacity: null };
  if (permit.status !== 'PENDING') return none;

  if (route === 'MENTOR' && g.mentors.some((m) => m.id === actor.sub)) {
    return {
      ...base,
      canDecide: true,
      asTakeover: false,
      capacity: g.boarder ? PermitDecider.MUSYRIF : PermitDecider.WALI_KELAS,
    };
  }
  const head = headCapacity(actor, g);
  if (head) {
    return { ...base, canDecide: true, asTakeover: route === 'MENTOR', capacity: head };
  }
  return none;
}

const MENTOR_LABEL = { MUSYRIF: 'musyrif', WALI_KELAS: 'wali kelas' } as const;

/** Why this caller may not decide it, in words for the refusal. */
export function whoDecides(d: PermitDecision): string {
  if (d.route === 'LONG') {
    return `Izin lebih dari ${PERMIT_HEAD_AFTER_DAYS} hari diputuskan oleh kepala unit`;
  }
  if (d.route === 'NO_MENTOR') {
    return `Santri ini belum punya ${MENTOR_LABEL[d.mentorKind]} tercatat; izinnya diputuskan oleh kepala unit`;
  }
  const names = d.mentors.map((m) => m.name).join(', ');
  return `Izin ini diputuskan oleh ${MENTOR_LABEL[d.mentorKind]} santri (${names})`;
}
