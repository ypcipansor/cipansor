import { describe, it, expect } from 'vitest';
import { switchEnabled } from './index';

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
