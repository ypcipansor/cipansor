import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { OpenAiCompatibleProvider } from '../providers/openai-compatible';
import { config } from '@/config';

function respondWith(body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const provider = () => new OpenAiCompatibleProvider('https://x.test/v1', 'k', 'model-a');
const request = { messages: [{ role: 'user' as const, content: 'halo' }], maxTokens: 700, temperature: 0.2 };

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('OpenAiCompatibleProvider usage', () => {
  it('membawa pulang jumlah token yang dilaporkan penyedia', async () => {
    respondWith({
      choices: [{ message: { content: 'jawaban' } }],
      model: 'model-a-0731',
      usage: { prompt_tokens: 341, completion_tokens: 16, total_tokens: 357 },
    });

    const result = await provider().complete(request);

    expect(result.usage).toEqual({ promptTokens: 341, completionTokens: 16 });
    expect(result.model).toBe('model-a-0731');
  });

  it('tidak melaporkan nol ketika penyedianya tidak melaporkan apa pun', async () => {
    // Nol akan tercatat sebagai panggilan yang tidak berbiaya, dan sebulan
    // panggilan seperti itu akan melaporkan belanja nol sementara tagihannya
    // berkata lain. Kosong berarti "tidak terukur", dan itu ditulis ke kolom
    // tersendiri di `chatbot_usage_daily`.
    respondWith({ choices: [{ message: { content: 'jawaban' } }] });

    expect((await provider().complete(request)).usage).toBeUndefined();
  });

  it('menolak blok usage yang hanya separuh', async () => {
    respondWith({
      choices: [{ message: { content: 'jawaban' } }],
      usage: { prompt_tokens: 341 },
    });

    expect((await provider().complete(request)).usage).toBeUndefined();
  });
});

/**
 * Jawaban galat, lengkap dengan header — bentuk yang dibaca jalur coba-ulang.
 */
function errorResponse(status: number, retryAfter?: string) {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
    json: async () => ({}),
  };
}

function okResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ choices: [{ message: { content: 'jawaban' } }], model: 'model-a' }),
  };
}

describe('OpenAiCompatibleProvider ketika penyedianya sedang penuh', () => {
  const asli = { ...config.chatbot.retry };

  beforeEach(() => {
    // Jeda dipangkas supaya ujinya cepat; yang diuji di sini adalah KEPUTUSAN
    // mengulang atau tidak, bukan panjang jedanya — itu milik retry.test.ts.
    Object.assign(config.chatbot.retry, {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
      budgetMs: 5_000,
    });
  });
  afterEach(() => Object.assign(config.chatbot.retry, asli));

  it('mengulang 429 lalu membawa pulang jawabannya', async () => {
    // Inilah alasan seluruh lapisan ini ada: Azure AI Foundry menjawab 429
    // ketika batas per menitnya tersentuh. Tanpa pengulangan, jawaban yang
    // sebenarnya tinggal menunggu setengah detik menjadi "asisten sedang tidak
    // tersedia" di layar penanya.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, '0'))
      .mockResolvedValueOnce(errorResponse(429, '0'))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().complete(request)).resolves.toMatchObject({ text: 'jawaban' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('tidak pernah mengulang kunci yang salah', async () => {
    // 401 tidak akan sembuh dengan menunggu, dan mengulanginya saat kuota ketat
    // menghabiskan jatah untuk permintaan yang tidak mungkin berhasil.
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().complete(request)).rejects.toThrow('401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tidak pernah mengulang permintaan yang cacat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().complete(request)).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('berhenti mencoba ketika Retry-After lebih panjang dari anggarannya', async () => {
    // Tidur lalu gagal adalah hasil terburuk. Penyedia yang meminta menunggu
    // satu jam tidak akan pulih dalam anggaran kita, jadi katakan sekarang.
    Object.assign(config.chatbot.retry, { budgetMs: 2_000 });
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(429, '3600'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().complete(request)).rejects.toThrow('429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mengulang putus jaringan, tetapi tidak mengulang habis-waktu', async () => {
    // Habis-waktu berarti panggilannya sudah memakan seluruh kesabaran penanya;
    // mengulanginya meminta ia menunggu dua kali lipat untuk panggilan yang
    // memang terlalu lambat. Putus jaringan lain sembuh dalam milidetik.
    const putus = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', putus);
    await expect(provider().complete(request)).resolves.toMatchObject({ text: 'jawaban' });
    expect(putus).toHaveBeenCalledTimes(2);

    const habisWaktu = vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    vi.stubGlobal('fetch', habisWaktu);
    await expect(provider().complete(request)).rejects.toThrow('timed out');
    expect(habisWaktu).toHaveBeenCalledTimes(1);
  });
});
