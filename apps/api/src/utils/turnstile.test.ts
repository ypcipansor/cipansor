import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTurnstileToken, verifyTurnstileToken } from './turnstile';

/**
 * Yang diuji di sini adalah **keputusannya**, bukan kemampuan Node memanggil
 * `fetch`. Setiap kasus menjawab satu pertanyaan: dalam keadaan ini, apakah
 * pengunjung diteruskan atau dihentikan, dan atas dasar apa.
 *
 * Pembedaan yang paling mahal kalau salah adalah antara "Cloudflare menjawab
 * tidak" dan "Cloudflare tidak menjawab". Yang pertama harus menghentikan
 * permintaan; yang kedua tidak boleh, karena pemadaman di pihak ketiga akan
 * mengunci seluruh pengurus di luar portalnya sendiri.
 */

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';

const fetchMock = vi.fn();

function siteverifyReplies(body: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.mocked(logger.error).mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-kunci-uji');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('verifyTurnstileToken', () => {
  it('meloloskan tanpa memanggil Cloudflare ketika kunci rahasianya kosong', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');

    const outcome = await verifyTurnstileToken('token-apa-pun');

    expect(outcome).toEqual({ ok: true, reason: 'disabled' });
    // Yang membuktikan gerbangnya benar-benar mati, bukan sekadar longgar.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('menolak ketika tokennya tidak ada, tanpa membuang panggilan ke Cloudflare', async () => {
    const outcome = await verifyTurnstileToken(undefined);

    expect(outcome).toMatchObject({ ok: false, reason: 'missing-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('meloloskan ketika Cloudflare menjawab success dari hostname kita', async () => {
    siteverifyReplies({ success: true, hostname: 'portal.cipansor.or.id' });

    await expect(verifyTurnstileToken('token-sah')).resolves.toEqual({
      ok: true,
      reason: 'verified',
    });
  });

  /**
   * Pemeriksaan `hostname`, dan mengapa `success: true` saja tidak cukup.
   *
   * Site key kita publik — ia dibakar ke dalam bundel web. Siapa pun dapat
   * menempelkan widget dengan site key yang sama di domainnya sendiri,
   * menyelesaikan tantangannya di sana, dan menerima token yang `success`-nya
   * benar-benar `true`. Yang membedakannya dari token pengunjung kita hanya
   * satu field, dan sampai 2026-09-04 kita membuangnya.
   */
  it('MENGHENTIKAN token sah yang diterbitkan dari hostname orang lain', async () => {
    siteverifyReplies({ success: true, hostname: 'phishing-cipansor.example' });

    const outcome = await verifyTurnstileToken('token-sah');

    expect(outcome).toMatchObject({ ok: false, reason: 'hostname-not-allowed' });
    // Hostname-nya harus terbaca di log: sebab lain baris ini muncul adalah
    // host baru yang lupa didaftarkan, dan itu mengunci semua pengunjungnya.
    //
    // Argumen keduanya diambil lewat `as unknown as`: tipe winston menyatakan
    // `logger.error` bertanda tangan satu argumen, jadi `calls[0][1]` tidak
    // ada menurut `tsc` walau ia benar-benar ada saat berjalan.
    const [, meta] = vi.mocked(logger.error).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(meta).toMatchObject({ hostname: 'phishing-cipansor.example' });
  });

  it('menerima hostname yang didaftarkan lewat TURNSTILE_ALLOWED_HOSTNAMES', async () => {
    vi.stubEnv('TURNSTILE_ALLOWED_HOSTNAMES', 'pratinjau.contoh.test, portal.cipansor.or.id');
    siteverifyReplies({ success: true, hostname: 'pratinjau.contoh.test' });

    await expect(verifyTurnstileToken('token-sah')).resolves.toMatchObject({
      ok: true,
      reason: 'verified',
    });
  });

  it('menghentikan hostname kosong — daftar yang tidak menyebutkannya berarti tidak', async () => {
    siteverifyReplies({ success: true });

    await expect(verifyTurnstileToken('token-sah')).resolves.toMatchObject({
      ok: false,
      reason: 'hostname-not-allowed',
    });
  });

  /**
   * Pemeriksaan `action`: mengikat token pada permukaan yang menerbitkannya.
   *
   * Tanpa ini, token yang dicetak di panel chat — permukaan termurah, yang
   * tantangannya selesai sendiri tanpa klik — dapat dibelanjakan di
   * `/auth/login`.
   */
  it('MENGHENTIKAN token yang diterbitkan untuk tindakan lain', async () => {
    siteverifyReplies({
      success: true,
      hostname: 'portal.cipansor.or.id',
      action: 'chatbot-ask',
    });

    await expect(verifyTurnstileToken('token-sah', undefined, 'login')).resolves.toMatchObject({
      ok: false,
      reason: 'action-mismatch',
    });
  });

  it('meloloskan ketika tindakannya cocok', async () => {
    siteverifyReplies({ success: true, hostname: 'portal.cipansor.or.id', action: 'login' });

    await expect(verifyTurnstileToken('token-sah', undefined, 'login')).resolves.toMatchObject({
      ok: true,
      reason: 'verified',
    });
  });

  it('menolak token yang terlalu panjang tanpa menukarkannya', async () => {
    const outcome = await verifyTurnstileToken('x'.repeat(2049));

    expect(outcome).toMatchObject({ ok: false, reason: 'rejected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('menghentikan ketika Cloudflare menjawab tidak, dan membawa kodenya', async () => {
    siteverifyReplies({ success: false, 'error-codes': ['invalid-input-response'] });

    await expect(verifyTurnstileToken('token-palsu')).resolves.toEqual({
      ok: false,
      reason: 'rejected',
      codes: ['invalid-input-response'],
    });
  });

  it('menghentikan token yang ditukarkan dua kali (timeout-or-duplicate)', async () => {
    // Perlindungan replay dipegang Cloudflare. Uji ini memastikan kita tidak
    // diam-diam memaafkan jawabannya.
    siteverifyReplies({ success: false, 'error-codes': ['timeout-or-duplicate'] });

    const outcome = await verifyTurnstileToken('token-bekas');

    expect(outcome.ok).toBe(false);
  });

  it('MELOLOSKAN ketika siteverify tidak terjangkau', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(verifyTurnstileToken('token-sah')).resolves.toEqual({
      ok: true,
      reason: 'unreachable',
    });
  });

  it('MELOLOSKAN ketika siteverify menjawab 5xx', async () => {
    siteverifyReplies({}, 502);

    await expect(verifyTurnstileToken('token-sah')).resolves.toEqual({
      ok: true,
      reason: 'unreachable',
    });
  });

  it('MELOLOSKAN ketika kunci rahasianya sendiri yang ditolak, dan menyebut namanya di log', async () => {
    // Kesalahannya milik kita, bukan milik pengunjung. Menolak pengunjung di
    // sini berarti seluruh portal tertutup gara-gara satu baris .env yang
    // salah ketik — dan tidak seorang pun akan tahu sebabnya dari layarnya.
    //
    // **Statusnya 400, bukan 200, dan itu bukan detail.** Diukur terhadap
    // Cloudflare pada 2026-09-03 dengan kunci yang benar-benar salah. Versi
    // pertama modul ini memeriksa `response.ok` sebelum membaca badannya,
    // sehingga kasus ini jatuh ke cabang "status tidak wajar" dan log-nya
    // tidak pernah menyebut TURNSTILE_SECRET_KEY. Hasilnya sama; petunjuknya
    // hilang. Karena itu uji ini memaku pesannya, bukan sekadar hasilnya.
    siteverifyReplies({ success: false, 'error-codes': ['invalid-input-secret'] }, 400);

    await expect(verifyTurnstileToken('token-sah')).resolves.toEqual({
      ok: true,
      reason: 'unreachable',
    });

    const logged = vi.mocked(logger.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('TURNSTILE_SECRET_KEY');
  });

  it('mengirim secret, response dan remoteip sebagai form-urlencoded', async () => {
    siteverifyReplies({ success: true });

    await verifyTurnstileToken('token-sah', '203.0.113.7');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init.method).toBe('POST');

    const sent = init.body as URLSearchParams;
    expect(sent.get('secret')).toBe('secret-kunci-uji');
    expect(sent.get('response')).toBe('token-sah');
    expect(sent.get('remoteip')).toBe('203.0.113.7');
  });

  it('menghilangkan remoteip ketika IP-nya tidak diketahui', async () => {
    siteverifyReplies({ success: true });

    await verifyTurnstileToken('token-sah');

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect((init.body as URLSearchParams).has('remoteip')).toBe(false);
  });
});

describe('readTurnstileToken', () => {
  it('menerima nama yang dipakai klien JSON kita', () => {
    expect(readTurnstileToken({ turnstileToken: 'abc' })).toBe('abc');
  });

  it('menerima nama yang disisipkan sendiri oleh widget Cloudflare', () => {
    expect(readTurnstileToken({ 'cf-turnstile-response': 'abc' })).toBe('abc');
  });

  it('mengabaikan badan yang bukan objek, nilai kosong, dan nilai bukan string', () => {
    expect(readTurnstileToken(undefined)).toBeUndefined();
    expect(readTurnstileToken('bukan objek')).toBeUndefined();
    expect(readTurnstileToken({})).toBeUndefined();
    expect(readTurnstileToken({ turnstileToken: '' })).toBeUndefined();
    expect(readTurnstileToken({ turnstileToken: 12345 })).toBeUndefined();
  });
});
