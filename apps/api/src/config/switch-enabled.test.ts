import { describe, it, expect } from 'vitest';
import { switchEnabled, switchOn } from './index';

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
