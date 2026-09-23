import { describe, it, expect } from 'vitest';
import {
  canJoinRoleRoom,
  canJoinUnitRoom,
  canSubscribeGlobalDashboard,
  isFoundationWideRole,
  resolveDashboardUnit,
  type SocketIdentity,
} from './realtime-scope';

const identity = (over: Partial<SocketIdentity> = {}): SocketIdentity => ({
  userId: 'u-1',
  roleCode: 'SDIT_ADMIN',
  unitId: 'unit-sdit',
  effectiveUnitIds: [],
  ...over,
});

describe('realtime room authorization', () => {
  it('lets a unit-scoped actor join only its own unit', () => {
    const actor = identity();

    expect(canJoinUnitRoom(actor, 'unit-sdit')).toBe(true);
    expect(canJoinUnitRoom(actor, 'unit-smpit')).toBe(false);
  });

  it('honours every unit the actor holds an active assignment in', () => {
    const actor = identity({ unitId: 'unit-sdit', effectiveUnitIds: ['unit-smpit'] });

    expect(canJoinUnitRoom(actor, 'unit-smpit')).toBe(true);
    expect(canJoinUnitRoom(actor, 'unit-tkq')).toBe(false);
  });

  it('lets a foundation-wide role join any unit', () => {
    const actor = identity({ roleCode: 'YAYASAN_PENGAWAS', unitId: null });

    expect(isFoundationWideRole(actor.roleCode)).toBe(true);
    expect(canJoinUnitRoom(actor, 'unit-anything')).toBe(true);
  });

  it('refuses a unitless non-foundation actor any unit room', () => {
    const actor = identity({ roleCode: 'SDIT_ADMIN', unitId: null, effectiveUnitIds: [] });

    expect(canJoinUnitRoom(actor, 'unit-sdit')).toBe(false);
  });

  it('refuses an empty/absent unit id outright', () => {
    const actor = identity();

    expect(canJoinUnitRoom(actor, null)).toBe(false);
    expect(canJoinUnitRoom(actor, undefined)).toBe(false);
    expect(canJoinUnitRoom(actor, '')).toBe(false);
  });

  it('lets an actor join only its own active role room', () => {
    const actor = identity({ roleCode: 'SDIT_ADMIN' });

    expect(canJoinRoleRoom(actor, 'SDIT_ADMIN')).toBe(true);
    // The governance room is where the sensitive broadcasts land; an ordinary
    // unit admin naming it must not get in.
    expect(canJoinRoleRoom(actor, 'YAYASAN_PENGAWAS')).toBe(false);
    expect(canJoinRoleRoom(actor, 'SUPER_ADMIN')).toBe(false);
    expect(canJoinRoleRoom(actor, null)).toBe(false);
  });

  it('keeps the global dashboard to foundation-wide roles', () => {
    expect(canSubscribeGlobalDashboard(identity({ roleCode: 'YAYASAN_PENGAWAS' }))).toBe(true);
    expect(canSubscribeGlobalDashboard(identity({ roleCode: 'SUPER_ADMIN' }))).toBe(true);
    expect(canSubscribeGlobalDashboard(identity({ roleCode: 'SDIT_ADMIN' }))).toBe(false);
  });

  it('resolves the dashboard unit from verified scope, not the caller argument', () => {
    const unitAdmin = identity({ unitId: 'unit-sdit', effectiveUnitIds: [] });

    // Same unit: allowed.
    expect(resolveDashboardUnit(unitAdmin, 'unit-sdit')).toBe('unit-sdit');
    // Cross-unit: refused.
    expect(resolveDashboardUnit(unitAdmin, 'unit-smpit')).toBeNull();
    // Global: refused for a unit-scoped actor.
    expect(resolveDashboardUnit(unitAdmin, undefined)).toBe('unit-sdit');
  });

  it('refuses a unitless non-foundation actor the dashboard entirely', () => {
    const actor = identity({ roleCode: 'SDIT_ADMIN', unitId: null, effectiveUnitIds: [] });

    expect(resolveDashboardUnit(actor, undefined)).toBeNull();
    expect(resolveDashboardUnit(actor, 'unit-sdit')).toBeNull();
  });

  it('refuses a multi-unit actor a dashboard when no unit is named', () => {
    const actor = identity({ unitId: 'unit-sdit', effectiveUnitIds: ['unit-smpit'] });

    expect(resolveDashboardUnit(actor, undefined)).toBeNull();
    expect(resolveDashboardUnit(actor, 'unit-smpit')).toBe('unit-smpit');
  });

  it('lets a foundation-wide actor read global and any named unit', () => {
    const actor = identity({ roleCode: 'YAYASAN_PENGAWAS', unitId: null, effectiveUnitIds: [] });

    expect(resolveDashboardUnit(actor, undefined)).toBeUndefined();
    expect(resolveDashboardUnit(actor, 'unit-smpit')).toBe('unit-smpit');
  });
});
