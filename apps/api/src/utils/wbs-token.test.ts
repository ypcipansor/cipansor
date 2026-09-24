import { describe, it, expect } from 'vitest';
import {
  generateWbsTrackingToken,
  hashWbsTrackingToken,
  verifyWbsTrackingToken,
} from './wbs-token';

describe('WBS tracking-token digest', () => {
  it('stores a 64-hex digest, never the raw value', () => {
    const { raw, digest } = generateWbsTrackingToken();
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(raw);
    expect(raw).not.toBe(digest);
  });

  it('generates a high-entropy raw token', () => {
    const { raw } = generateWbsTrackingToken();
    // 32 bytes of randomness rendered as hex.
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same digest for the same token and differs across tokens', () => {
    const a = generateWbsTrackingToken();
    const b = generateWbsTrackingToken();
    expect(hashWbsTrackingToken(a.raw)).toBe(a.digest);
    expect(a.digest).not.toBe(b.digest);
  });

  it('verifies the correct token and rejects a wrong one', () => {
    const { raw, digest } = generateWbsTrackingToken();
    expect(verifyWbsTrackingToken(raw, digest)).toBe(true);
    expect(verifyWbsTrackingToken('not-the-token', digest)).toBe(false);
  });

  it('rejects a malformed stored digest without throwing', () => {
    const { raw } = generateWbsTrackingToken();
    // A legacy raw-token row (invalidated to a marker) must fail closed, not
    // crash the comparison.
    expect(verifyWbsTrackingToken(raw, 'LEGACY-INVALIDATED')).toBe(false);
    expect(verifyWbsTrackingToken(raw, '')).toBe(false);
  });
});
