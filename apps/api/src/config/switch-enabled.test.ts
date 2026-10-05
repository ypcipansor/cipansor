import { describe, it, expect } from 'vitest';
import { switchEnabled, switchOn, resolveAppEnv } from './index';

describe('switchEnabled', () => {
  it('is ON when unset or empty, so production keeps its behaviour by default', () => {
    expect(switchEnabled(undefined)).toBe(true);
    expect(switchEnabled('')).toBe(true);
  });

  it('is OFF only for an explicit off word, in any case', () => {
    for (const off of ['false', 'FALSE', 'False', '0', 'off', 'OFF', 'no', ' false ']) {
      expect(switchEnabled(off)).toBe(false);
    }
  });

  it('stays ON for anything unrecognised — a typo must not stop reminders going out', () => {
    for (const on of ['true', '1', 'yes', 'on', 'flase', 'disabled']) {
      expect(switchEnabled(on)).toBe(true);
    }
  });
});

describe('switchOn', () => {
  it('is OFF when unset, empty or unrecognised — production never stamps its documents by mistake', () => {
    for (const off of [undefined, '', 'false', '0', 'no', 'ture', 'enabled']) {
      expect(switchOn(off)).toBe(false);
    }
  });

  it('is ON only for an explicit on word, in any case', () => {
    for (const on of ['true', 'TRUE', '1', 'on', 'yes', ' true ']) {
      expect(switchOn(on)).toBe(true);
    }
  });
});

describe('resolveAppEnv', () => {
  it('accepts the three named copies, in any case and with padding', () => {
    expect(resolveAppEnv('local', 'production')).toBe('local');
    expect(resolveAppEnv('staging', 'production')).toBe('staging');
    expect(resolveAppEnv(' STAGING ', 'production')).toBe('staging');
    expect(resolveAppEnv('Production', 'development')).toBe('production');
  });

  it('infers production from a production build when unset — never "local" by accident', () => {
    // The dangerous direction is a production build that forgets APP_ENV and is
    // then treated as a developer's machine, where the chatbot's stub is
    // allowed. Defaulting to production closes that.
    expect(resolveAppEnv(undefined, 'production')).toBe('production');
    expect(resolveAppEnv('', 'production')).toBe('production');
    expect(resolveAppEnv('  ', 'production')).toBe('production');
  });

  it('is local for any non-production build with no APP_ENV', () => {
    expect(resolveAppEnv(undefined, 'development')).toBe('local');
    expect(resolveAppEnv(undefined, 'test')).toBe('local');
  });

  it('treats an unrecognised value as unset rather than trusting it', () => {
    // "prod", "stg", "live" — a near-miss must not be read as a fourth copy.
    expect(resolveAppEnv('prod', 'production')).toBe('production');
    expect(resolveAppEnv('prod', 'development')).toBe('local');
    expect(resolveAppEnv('live', 'development')).toBe('local');
  });
});
