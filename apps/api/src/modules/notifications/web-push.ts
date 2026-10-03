import {
  createECDH,
  createPrivateKey,
  createCipheriv,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

/**
 * The Web Push wire protocol, on `node:crypto` alone.
 *
 * Two standards, both small:
 *
 *  - **RFC 8291** — the payload is encrypted to the browser's own key
 *    (`p256dh`) and secret (`auth`), so the push service relaying it cannot
 *    read it. ECDH on P-256, HKDF-SHA-256, AES-128-GCM, one record
 *    (`Content-Encoding: aes128gcm`, RFC 8188).
 *  - **RFC 8292 (VAPID)** — every request carries a short ES256 JWT signed with
 *    our application server key. The push service only delivers to a
 *    subscription made with that same public key, so another copy of the system
 *    (staging, with its own key pair) cannot reach production's devices even if
 *    it holds their rows.
 *
 * Written here rather than taken from the `web-push` package: that package has
 * not been released since January 2024 and brings five transitive dependencies
 * for what is a few primitives Node already ships. The encryption is pinned to
 * the RFC 8291 Appendix A vector in `tests/web-push.test.ts`, so a slip in the
 * derivation turns the suite red rather than silently producing messages no
 * browser can open.
 */

export interface VapidKeys {
  /** Uncompressed P-256 public key, 65 bytes, base64url. */
  publicKey: string;
  /** Private scalar, 32 bytes, base64url. */
  privateKey: string;
  /** `mailto:` or `https:` contact for the push service operator (RFC 8292 §2.1). */
  subject: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** RFC 8188 record size. One record holds any payload we send. */
const RECORD_SIZE = 4096;

/**
 * The largest payload we encrypt: push services accept a 4096-byte body
 * (RFC 8030 §7.2), which also carries the 86-byte header, the delimiter and
 * the 16-byte tag.
 */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - 16 - 1 - 86;

export function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

export function fromB64url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

/** A fresh VAPID key pair — for setting up an environment, never at runtime. */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}

/**
 * Whether the configured private key really produces the configured public key.
 *
 * A pair copied across environments one half at a time is the likely mistake;
 * the browser would subscribe to the public half and every send signed with the
 * other private half would be refused by the push service, with nothing in our
 * logs but a stream of 403s. Checked once at start-up instead.
 */
export function vapidKeysMatch(keys: Pick<VapidKeys, 'publicKey' | 'privateKey'>): boolean {
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(fromB64url(keys.privateKey));
    return b64url(ecdh.getPublicKey()) === keys.publicKey;
  } catch {
    return false;
  }
}

function vapidSigningKey(keys: Pick<VapidKeys, 'publicKey' | 'privateKey'>): KeyObject {
  const pub = fromB64url(keys.publicKey);
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/**
 * The `Authorization` header for one push service (RFC 8292 §3).
 *
 * `aud` is the push service's origin and `exp` at most 24 hours ahead; twelve
 * leaves room for clock skew on either side.
 */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = new Date()): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      })
    )
  );
  const unsigned = `${header}.${claims}`;
  // ES256 in a JWT is the raw r||s pair, not DER (RFC 7518 §3.4).
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: vapidSigningKey(keys),
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${keys.publicKey}`;
}

/**
 * Encrypt one payload for one browser (RFC 8291 §3.4, RFC 8188).
 *
 * `salt` and `asPrivateKey` exist for the RFC's test vector; in use both are
 * fresh for every message, which is what the standard requires.
 */
export function encryptPayload(
  plaintext: Buffer,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  fixed?: { salt: Buffer; asPrivateKey: Buffer }
): Buffer {
  if (plaintext.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Push payload of ${plaintext.length} bytes exceeds ${MAX_PAYLOAD_BYTES}`);
  }
  const uaPublic = fromB64url(target.p256dh);
  const authSecret = fromB64url(target.auth);

  const ecdh = createECDH('prime256v1');
  if (fixed) ecdh.setPrivateKey(fixed.asPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const salt = fixed?.salt ?? randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  );

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(RECORD_SIZE);
  const header = Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic]);
  return Buffer.concat([header, ciphertext]);
}

/** What happened to one delivery, in terms the dispatcher acts on. */
export type PushOutcome =
  | { kind: 'delivered' }
  /** 404/410: the subscription is gone for good; delete the row. */
  | { kind: 'gone'; status: number }
  /** Anything else: keep the row, log, and count it as a failure. */
  | { kind: 'failed'; status?: number; reason: string };

export interface SendOptions {
  /** Seconds the push service may hold the message for an offline device. */
  ttlSeconds: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  timeoutMs?: number;
  now?: Date;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

/** Send one encrypted message to one subscription (RFC 8030 §5). */
export async function sendPush(
  target: PushTarget,
  payload: Buffer,
  keys: VapidKeys,
  options: SendOptions
): Promise<PushOutcome> {
  const doFetch = options.fetchImpl ?? fetch;
  let body: Buffer;
  try {
    body = encryptPayload(payload, target);
  } catch (error) {
    // A malformed key on the row: the browser handed over something unusable.
    return { kind: 'failed', reason: `encrypt: ${String(error)}` };
  }
  try {
    const response = await doFetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(target.endpoint, keys, options.now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttlSeconds),
        Urgency: options.urgency ?? 'normal',
      },
      body: new Uint8Array(body),
      // A push service answers; it does not send us elsewhere. Refusing
      // redirects keeps a validated endpoint from bouncing the request to a
      // host that was never checked.
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    if (response.status >= 200 && response.status < 300) return { kind: 'delivered' };
    if (response.status === 404 || response.status === 410) {
      return { kind: 'gone', status: response.status };
    }
    return { kind: 'failed', status: response.status, reason: response.statusText };
  } catch (error) {
    return { kind: 'failed', reason: String(error) };
  }
}
