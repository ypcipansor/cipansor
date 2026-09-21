import crypto from 'crypto';
import { config } from '@/config';

/**
 * The WBS tracking token is a bearer credential: whoever holds it can read the
 * report and post as the reporter. It used to be stored verbatim on
 * `WbsReport.trackingToken`, so a read of the database (a backup, a replica, a
 * support query, an SQL injection elsewhere) handed over every anonymous
 * reporter's channel. Nothing in the app needs the plaintext back after
 * issuance, so persistence keeps only a keyed digest and the raw value is
 * returned once, at creation.
 *
 * HMAC-SHA-256 rather than a bare SHA-256: the token is high-entropy random,
 * but keying the digest means a leaked database still cannot be used to confirm
 * a guessed token without the server secret. The key is derived from
 * `JWT_SECRET` with a fixed context string so no new mandatory env var (and no
 * production-boot change) is required; a dedicated
 * `WBS_TRACKING_HMAC_SECRET` overrides it when an operator wants independent
 * rotation.
 */

const TOKEN_BYTES = 32;
const CONTEXT = 'cipansor:wbs-tracking-token:v1';

/** The key the digest uses: a dedicated secret, or one derived from JWT. */
function hmacKey(): Buffer {
  const dedicated = config.wbsTracking.hmacSecret;
  if (dedicated) return Buffer.from(dedicated, 'utf8');
  // HKDF gives a domain-separated key from the session signer without a second
  // secret to distribute. `info` is the separation.
  return Buffer.from(
    crypto.hkdfSync('sha256', config.jwt.secret, '', CONTEXT, 32)
  );
}

/** The stored digest of a raw tracking token. */
export function hashWbsTrackingToken(raw: string): string {
  return crypto.createHmac('sha256', hmacKey()).update(raw, 'utf8').digest('hex');
}

/**
 * A fresh token and its digest. Only the raw value goes to the reporter; only
 * the digest is persisted.
 */
export function generateWbsTrackingToken(): { raw: string; digest: string } {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return { raw, digest: hashWbsTrackingToken(raw) };
}

/**
 * Constant-time comparison of a presented token against the stored digest.
 *
 * `timingSafeEqual` throws on unequal lengths, so the length is checked first;
 * that check leaks only the length of a hex digest, which is fixed by
 * construction and therefore not secret.
 */
export function verifyWbsTrackingToken(raw: string, storedDigest: string): boolean {
  const candidate = Buffer.from(hashWbsTrackingToken(raw), 'hex');
  const expected = Buffer.from(storedDigest || '', 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}
