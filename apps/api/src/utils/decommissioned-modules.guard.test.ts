import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import * as PrismaClientNS from '@prisma/client';
import { createPrismaClient } from '../../prisma/client';

/**
 * Regression guard for the higher-education / Litbang purge
 * (PR #505). Each removal here was silent: a deleted module whose Prisma model
 * survived only failed at runtime, and editing the already-deployed `0_init`
 * migration left old enum values in existing databases while the regenerated
 * client rejected them. This test pins the invariants that keep the purge
 * consistent.
 */

const API_ROOT = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(p, 'utf8');

const SCHEMA = read(join(API_ROOT, 'prisma', 'schema.prisma'));
const ZERO_INIT = read(join(API_ROOT, 'prisma', 'migrations', '0_init', 'migration.sql'));

const REMOVED_MODELS = ['ResearchProject', 'ResearchMilestone', 'InnovationProposal'];
const REMOVED_ENUMS = ['ResearchStatus', 'InnovationStatus'];
const REMOVED_ROLES = [
  'PT_REKTOR',
  'PT_WAKIL_REKTOR',
  'PT_DEKAN',
  'PT_KAPRODI',
  'PT_DOSEN',
  'PT_MAHASISWA',
  'PT_STAF_AKADEMIK',
  'PT_TATA_USAHA',
  'PT_ALUMNI',
];

const migrationDirs = readdirSync(join(API_ROOT, 'prisma', 'migrations'));
const DECOMMISSION_DIR = migrationDirs.find((d) => d.endsWith('_decommission_higher_ed_litbang'));
const DECOMMISSION = DECOMMISSION_DIR
  ? read(join(API_ROOT, 'prisma', 'migrations', DECOMMISSION_DIR, 'migration.sql'))
  : '';

describe('decommission purge — schema', () => {
  it.each(REMOVED_MODELS)('no model %s remains', (model) => {
    expect(SCHEMA).not.toMatch(new RegExp(`^model ${model}\\b`, 'm'));
  });

  it.each(REMOVED_ENUMS)('no enum %s remains', (name) => {
    expect(SCHEMA).not.toMatch(new RegExp(`^enum ${name}\\b`, 'm'));
  });

  it('no PERGURUAN_TINGGI / PT_* survives in the schema', () => {
    expect(SCHEMA).not.toContain('PERGURUAN_TINGGI');
    for (const role of REMOVED_ROLES) {
      expect(SCHEMA).not.toContain(role);
    }
  });

  it('retains the still-live research models', () => {
    expect(SCHEMA).toMatch(/^model ResearchTheme\b/m);
    expect(SCHEMA).toMatch(/^model ResearchSubmission\b/m);
  });
});

describe('decommission purge — generated Prisma client', () => {
  it('drops the removed delegates but keeps the live research ones', () => {
    const client = createPrismaClient() as unknown as Record<string, unknown>;
    for (const model of REMOVED_MODELS) {
      const delegate = model[0].toLowerCase() + model.slice(1);
      expect(client[delegate]).toBeUndefined();
    }
    expect(client.researchTheme).toBeDefined();
  });

  it('no longer exposes ResearchStatus / InnovationStatus', () => {
    const ns = PrismaClientNS as unknown as Record<string, unknown>;
    expect(ns.ResearchStatus).toBeUndefined();
    expect(ns.InnovationStatus).toBeUndefined();
  });

  it('Realm, UnitType and RoleCode carry no higher-ed values', () => {
    const { Realm, UnitType, RoleCode } = PrismaClientNS;
    expect(Object.values(Realm)).not.toContain('PERGURUAN_TINGGI');
    expect(Object.values(UnitType)).not.toContain('PERGURUAN_TINGGI');
    for (const role of REMOVED_ROLES) {
      expect(Object.values(RoleCode)).not.toContain(role);
    }
  });
});

describe('decommission purge — migrations', () => {
  it('leaves 0_init untouched so deployed databases are not desynced', () => {
    // The baseline has definitely shipped; rewriting it never re-runs on an
    // existing database. The legacy values must still be there, and the drift
    // must be corrected by a later migration instead.
    expect(ZERO_INIT).toContain('PERGURUAN_TINGGI');
    expect(ZERO_INIT).toContain('PT_DOSEN');
  });

  it('ships a new migration that reconciles data before dropping the enum values', () => {
    expect(DECOMMISSION).not.toBe('');
    // Data that still points at the dropped unit type / realm is re-homed
    // BEFORE the type is recreated, otherwise the ALTER fails on old rows.
    const reassign = DECOMMISSION.indexOf('PERGURUAN_TINGGI');
    const recreate = DECOMMISSION.indexOf('CREATE TYPE "UnitType"');
    expect(reassign).toBeGreaterThan(-1);
    expect(recreate).toBeGreaterThan(reassign);

    for (const table of ['research_projects', 'research_milestones', 'innovation_proposals']) {
      expect(DECOMMISSION).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
    // PR #504 owns the system-secrets removal; #505 must not touch it.
    expect(DECOMMISSION).not.toContain('system_secrets');
  });

  it('no longer references the removed modules from active source', () => {
    const appSource = read(join(API_ROOT, 'src', 'app.ts'));
    expect(appSource).not.toContain("'/litbang'");
    expect(appSource).toContain("'/research'");

    const removedDir = join(API_ROOT, 'src', 'modules', 'litbang');
    expect(() => readdirSync(removedDir)).toThrow();
  });
});
