import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  encryptPayload,
  fromB64url,
  b64url,
  generateVapidKeys,
  sendPush,
  vapidAuthorization,
  vapidKeysMatch,
  MAX_PAYLOAD_BYTES,
} from '../web-push';

/**
 * RFC 8291 Appendix A — the standard's own worked example. If any step of the
 * key derivation drifts, the ciphertext stops matching byte for byte.
 */
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

/** What a browser does with a message: the receiving half of RFC 8291. */
function decryptAsBrowser(message: Buffer, uaPrivate: Buffer, auth: Buffer): string {
  const salt = message.subarray(0, 16);
  const idLen = message[20];
  const asPublic = message.subarray(21, 21 + idLen);
  const body = message.subarray(21 + idLen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', secret, auth, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  );
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(body.subarray(body.length - 16));
  const padded = Buffer.concat([
    decipher.update(body.subarray(0, body.length - 16)),
    decipher.final(),
  ]);
  // Strip the 0x02 delimiter (and any zero padding before it).
  return padded.subarray(0, padded.lastIndexOf(0x02)).toString('utf8');
}

describe('web push encryption (RFC 8291)', () => {
  it('reproduces the RFC 8291 Appendix A message byte for byte', () => {
    const message = encryptPayload(
      fromB64url(RFC.plaintext),
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      { salt: fromB64url(RFC.salt), asPrivateKey: fromB64url(RFC.asPrivate) }
    );
    expect(b64url(message.subarray(0, 86))).toBe(RFC.header);
    expect(b64url(message.subarray(86))).toBe(RFC.ciphertext);
  });

  it('produces a message the browser half opens, with fresh salt and key each time', () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = Buffer.alloc(16, 7);
    const target = { p256dh: b64url(browser.getPublicKey()), auth: b64url(auth) };
    const text = JSON.stringify({ title: 'Izin disetujui', body: 'Ananda boleh pulang.' });

    const one = encryptPayload(Buffer.from(text), target);
    const two = encryptPayload(Buffer.from(text), target);
    expect(one.equals(two)).toBe(false);
    expect(decryptAsBrowser(one, browser.getPrivateKey(), auth)).toBe(text);
    expect(decryptAsBrowser(two, browser.getPrivateKey(), auth)).toBe(text);
  });

  it('refuses a payload that would not fit in a 4096-byte push body', () => {
    const target = { p256dh: RFC.uaPublic, auth: RFC.auth };
    expect(() => encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES), target)).not.toThrow();
    expect(encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES), target).length).toBe(4096);
    expect(() => encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES + 1), target)).toThrow();
  });
});

describe('VAPID (RFC 8292)', () => {
  const keys = { ...generateVapidKeys(), subject: 'mailto:halo@cipansor.or.id' };
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc:def';

  it('signs a JWT the public key verifies, for the push service origin, under 24 hours', () => {
    const now = new Date('2026-10-03T08:00:00Z');
    const header = vapidAuthorization(endpoint, keys, now);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, c, s, k] = match ?? [];
    expect(k).toBe(keys.publicKey);

    const claims = JSON.parse(fromB64url(c).toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:halo@cipansor.or.id');
    const lifetime = claims.exp - now.getTime() / 1000;
    expect(lifetime).toBeGreaterThan(0);
    expect(lifetime).toBeLessThanOrEqual(24 * 60 * 60);

    const pub = fromB64url(keys.publicKey);
    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33)) },
      format: 'jwk',
    });
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${c}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      fromB64url(s)
    );
    expect(ok).toBe(true);
  });

  it('tells a matching key pair from two halves of different pairs', () => {
    expect(vapidKeysMatch(keys)).toBe(true);
    const other = generateVapidKeys();
    expect(vapidKeysMatch({ publicKey: keys.publicKey, privateKey: other.privateKey })).toBe(false);
    expect(vapidKeysMatch({ publicKey: keys.publicKey, privateKey: 'not-a-key' })).toBe(false);
  });
});

describe('sendPush', () => {
  const keys = { ...generateVapidKeys(), subject: 'mailto:halo@cipansor.or.id' };
  const browser = createECDH('prime256v1');
  browser.generateKeys();
  const target = {
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/xyz',
    p256dh: b64url(browser.getPublicKey()),
    auth: b64url(Buffer.alloc(16, 1)),
  };

  function respond(status: number) {
    return vi.fn().mockResolvedValue(new Response(null, { status, statusText: 'x' }));
  }

  it('posts an aes128gcm body with VAPID, TTL and urgency, refusing redirects', async () => {
    const fetchImpl = respond(201);
    const outcome = await sendPush(target, Buffer.from('{"title":"t"}'), keys, {
      ttlSeconds: 3600,
      fetchImpl,
    });
    expect(outcome).toEqual({ kind: 'delivered' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(target.endpoint);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.headers['Content-Encoding']).toBe('aes128gcm');
    expect(init.headers.TTL).toBe('3600');
    expect(init.headers.Urgency).toBe('normal');
    expect(init.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    const body = Buffer.from(init.body);
    expect(decryptAsBrowser(body, browser.getPrivateKey(), Buffer.alloc(16, 1))).toBe(
      '{"title":"t"}'
    );
  });

  it('reports 404 and 410 as gone, so the row can be deleted', async () => {
    expect(
      await sendPush(target, Buffer.from('x'), keys, { ttlSeconds: 1, fetchImpl: respond(410) })
    ).toEqual({ kind: 'gone', status: 410 });
    expect(
      await sendPush(target, Buffer.from('x'), keys, { ttlSeconds: 1, fetchImpl: respond(404) })
    ).toEqual({ kind: 'gone', status: 404 });
  });

  it('keeps the row on any other refusal or a network error', async () => {
    const forbidden = await sendPush(target, Buffer.from('x'), keys, {
      ttlSeconds: 1,
      fetchImpl: respond(403),
    });
    expect(forbidden.kind).toBe('failed');
    const network = await sendPush(target, Buffer.from('x'), keys, {
      ttlSeconds: 1,
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    });
    expect(network.kind).toBe('failed');
  });

  it('does not throw on a row whose browser key is unusable', async () => {
    const fetchImpl = respond(201);
    const outcome = await sendPush({ ...target, p256dh: 'AAAA' }, Buffer.from('x'), keys, {
      ttlSeconds: 1,
      fetchImpl,
    });
    expect(outcome.kind).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
