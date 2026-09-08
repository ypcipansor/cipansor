import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ask, ChatbotUnavailableError, resolveProvider } from '../chatbot.service';
import { StubProvider } from '../providers/stub';
import { collectLiveFacts } from '../live-facts';
import { knowledgeBase, knowledgeById, topicLabels } from '../knowledge-base';
import { isCacheable, readCached, writeCached } from '../cache';
import { ChatbotBusyError, createThrottle } from '../throttle';
import { config } from '@/config';
import type { LlmProvider } from '../providers/types';
import { recordUsage } from '../usage.service';

vi.mock('../live-facts', () => ({ collectLiveFacts: vi.fn() }));
// The persona is resolved from the database in production; here we pin it so the
// service never reaches Prisma and the tests stay about orchestration, not I/O.
vi.mock('../persona.service', () => ({ resolvePublicPersona: vi.fn(async () => 'test-persona') }));
vi.mock('../cache', () => ({
  cacheKeyFor: vi.fn(() => 'test-key'),
  isCacheable: vi.fn(() => true),
  readCached: vi.fn(async () => null),
  writeCached: vi.fn(async () => undefined),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
// Usage recording is a database write; its own suite covers what it writes. Here
// it is mocked so these tests stay about orchestration — but it is asserted, not
// merely silenced: a call that reaches the model and is never booked is exactly
// the spend the monthly alert exists to catch.
vi.mock('../usage.service', () => ({ recordUsage: vi.fn(async () => undefined) }));

const mockLiveFacts = vi.mocked(collectLiveFacts);

/** Records what the service asked the model, so grounding can be asserted. */
function recordingProvider(): LlmProvider & {
  lastRequest?: Parameters<LlmProvider['complete']>[0];
} {
  const provider = {
    name: 'recording',
    lastRequest: undefined as Parameters<LlmProvider['complete']>[0] | undefined,
    async complete(request: Parameters<LlmProvider['complete']>[0]) {
      provider.lastRequest = request;
      return { text: 'jawaban', model: 'recording-model' };
    },
  };
  return provider;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLiveFacts.mockResolvedValue([]);
});

describe('ask', () => {
  it('mengirim SELURUH korpus, bukan hanya potongan yang diperingkat', async () => {
    // Inti perombakannya. Korpusnya sekitar 628 token — memilih sebagian tidak
    // menghemat apa pun yang berarti, dan pemilihnya pernah memveto pertanyaan
    // yang sebenarnya terjawab.
    const provider = recordingProvider();
    await ask({ question: 'apa visi pesantren', provider, retriever: { search: () => [] } });

    const system = provider.lastRequest!.messages.find((m) => m.role === 'system')!.content;
    for (const entry of knowledgeBase) {
      expect(system, `entri tidak ikut dikirim: ${entry.id}`).toContain(`[${entry.id}]`);
    }
  });

  it('tetap memanggil model meski pencarian tidak menemukan apa pun', async () => {
    // Uji regresi untuk cacat yang dilaporkan: "ada informasi apa saja" hanya
    // menyisakan satu kata setelah kata henti dibuang, tidak ada entri yang
    // cocok, dan layanan menolak tanpa pernah menyentuh model. Pencarian tidak
    // lagi punya hak veto — baris ini memerah bila hak itu dikembalikan.
    const provider = recordingProvider();
    const result = await ask({
      question: 'ada informasi apa saja',
      provider,
      retriever: { search: () => [] },
    });

    expect(provider.lastRequest).toBeDefined();
    expect(result.refused).toBe(false);
  });

  it('refuses without calling the model only when the corpus itself is empty', async () => {
    // Jalur ini TIDAK bisa dicapai oleh pertanyaan mana pun lagi; ia menjaga
    // keadaan yang hanya bisa dibuat oleh suntingan yang mengosongkan korpus.
    // Meminta model menolak dengan sopan saat tidak diberi apa-apa adalah
    // permintaan yang bisa ia abaikan; tidak memanggilnya sama sekali tidak.
    const provider = recordingProvider();
    const result = await ask({ question: 'siapa presiden amerika', provider, entries: [] });

    expect(result.refused).toBe(true);
    expect(result.sources).toEqual([]);
    expect(provider.lastRequest).toBeUndefined();
  });

  it('writes that refusal in the house style, though no model produced it', async () => {
    // A visitor should not be able to tell that this particular reply never
    // reached a model. Warmth, a route to a human, and an offer to continue —
    // the same shape every other answer has.
    const result = await ask({
      question: 'siapa presiden amerika',
      provider: new StubProvider(),
      entries: [],
    });

    expect(result.answer).toMatch(/\p{Extended_Pictographic}/u);
    expect(result.answer).toContain('0811-110-400');
    expect(result.answer).toMatch(/ada lagi yang ingin/i);
  });

  it('menutup penolakan itu dengan rambu petunjuk, bukan jalan buntu', async () => {
    // Versi sebelumnya hanya meminta maaf lalu menyodorkan nomor telepon. Untuk
    // keluhan yang paling sering memicunya — "ada informasi apa saja?" —
    // nomor telepon adalah jawaban yang salah: yang dibutuhkan penanya adalah
    // daftar. Uji ini memerah bila daftar itu hilang lagi.
    const result = await ask({
      question: 'ada informasi apa saja',
      provider: new StubProvider(),
      entries: [],
    });

    expect(result.refused).toBe(true);
    expect(result.answer).toContain('Yang bisa saya bantu');
    for (const label of topicLabels()) {
      expect(result.answer, `topik tidak disebut: ${label}`).toContain(label);
    }
    // Telepon tetap ada, tetapi sebagai jalan terakhir — bukan satu-satunya.
    expect(result.answer).toContain('0811-110-400');
  });

  it('does not open that refusal with a salam the visitor never gave', async () => {
    // Dulu baris ini justru MENUNTUT salam (`toMatch(/assalamu/i)`), sehingga
    // ia akan tetap hijau pada persis cacat yang harus dibuang: gelembung
    // pembuka widget sudah mengucap salam, jadi jawaban pertama mengucapkannya
    // dua kali.
    const result = await ask({
      question: 'berapa harganya?',
      provider: new StubProvider(),
      entries: [],
    });

    expect(result.answer).not.toMatch(/assalamu/i);
    expect(result.answer).not.toMatch(/wa'?alaikum/i);
    expect(result.answer.trimStart().startsWith('Mohon maaf')).toBe(true);
  });

  describe('atribusi sumber', () => {
    /** Penyedia yang menjawab dengan baris SUMBER seperti diminta aturan 7. */
    function citing(text: string): LlmProvider {
      return { name: 'citing', complete: async () => ({ text, model: 'citing-model' }) };
    }

    it('memakai id yang disebut model, bukan peringkat pencarian', async () => {
      const result = await ask({
        question: 'apa pun',
        provider: citing('Jawabannya begitu.\nSUMBER: kontak'),
        // Pencarian sengaja menunjuk ke entri LAIN. Bila peringkat yang menang,
        // sumbernya akan salah sekaligus terlihat meyakinkan.
        retriever: { search: () => [{ entry: knowledgeById.get('profil-umum')!, score: 9 }] },
      });

      expect(result.sources.map((s) => s.id)).toEqual(['kontak']);
    });

    it('membuang id yang tidak ada di korpus', async () => {
      // Sumber palsu lebih buruk daripada tidak ada sumber: ia mengundang
      // pembaca memeriksa sesuatu yang tidak pernah ada.
      const result = await ask({
        question: 'apa pun',
        provider: citing('Jawabannya begitu.\nSUMBER: kontak, entri-karangan'),
        retriever: { search: () => [] },
      });

      expect(result.sources.map((s) => s.id)).toEqual(['kontak']);
    });

    it('jatuh ke peringkat pencarian bila model lupa menyebut sumber', async () => {
      const result = await ask({
        question: 'apa pun',
        provider: citing('Jawabannya begitu, tanpa baris sumber.'),
        retriever: { search: () => [{ entry: knowledgeById.get('profil-umum')!, score: 9 }] },
      });

      expect(result.sources.map((s) => s.id)).toEqual(['profil-umum']);
    });

    it('tidak pernah membiarkan baris SUMBER sampai ke penanya', async () => {
      // Barisnya untuk sistem. Bocor ke layar, ia terbaca sebagai kebocoran
      // teknis di tengah kalimat yang seharusnya hangat.
      const result = await ask({
        question: 'apa pun',
        provider: citing('Jawabannya begitu.\n\n**SUMBER: kontak, profil-umum**'),
        retriever: { search: () => [] },
      });

      expect(result.answer).not.toMatch(/SUMBER/i);
      expect(result.answer).toBe('Jawabannya begitu.');
      expect(result.sources.map((s) => s.id)).toEqual(['kontak', 'profil-umum']);
    });
  });

  describe('penolakan yang ditulis model', () => {
    function declining(): LlmProvider {
      return {
        name: 'declining',
        complete: async () => ({
          text: 'Mohon maaf, saya belum memiliki informasinya.\nSUMBER: -',
          model: 'declining-model',
        }),
      };
    }

    it('tetap tercatat sebagai penolakan', async () => {
      // Sejak gerbangnya dibuang, penolakan ditulis MODEL. Bila `refused` tidak
      // dibaca dari kalimatnya, ia selalu `false` — dan hitungan penolakan di
      // halaman Riwayat Percakapan, yang gunanya justru menemukan pertanyaan
      // tak terjawab, berhenti menghitung apa pun.
      const result = await ask({ question: 'harga emas', provider: declining() });
      expect(result.refused).toBe(true);
    });

    it('tidak menuduh jawaban bagus sebagai penolakan hanya karena bunyinya', async () => {
      // Jebakan yang nyaris lolos. `looksLikeRefusal` lahir untuk menilai kasus
      // red-team, dan salah satu polanya menangkap "(tidak|belum) (dapat|bisa)".
      // Kalimat "biaya pendaftaran TIDAK DAPAT dikembalikan" adalah jawaban yang
      // benar, bukan penolakan — dan menandainya `refused` akan mengotori
      // hitungan pertanyaan tak terjawab sekaligus membuangnya dari cache.
      const result = await ask({
        question: 'apakah biaya pendaftaran bisa dikembalikan',
        provider: {
          name: 'menjawab',
          complete: async () => ({
            text: 'Biaya pendaftaran tidak dapat dikembalikan, Bapak/Ibu.\nSUMBER: spmb-cara-daftar',
            model: 'menjawab-model',
          }),
        },
        retriever: { search: () => [] },
      });

      expect(result.refused).toBe(false);
      expect(result.sources.map((s) => s.id)).toEqual(['spmb-cara-daftar']);
    });

    it('tetap mengenali penolakan yang ikut mengutip sumber', async () => {
      // Kalimat ini dipanen dari model sungguhan, dan ia membatalkan aturan yang
      // sempat saya pakai — "mengutip sumber berarti menjawab". Aturan 5
      // menyuruh model menyebut daftar topik dan kontak ketika menolak, jadi
      // penolakan pun mengutip. Yang memisahkan keduanya ada di kalimatnya.
      const result = await ask({
        question: 'apakah biaya pendaftaran bisa dikembalikan',
        provider: {
          name: 'menolak-tapi-mengutip',
          complete: async () => ({
            text:
              'Saya mohon maaf karena informasi tersebut tidak tersedia dalam ' +
              'informasi resmi yang saya miliki.\nSUMBER: bantuan-ikhtisar, kontak',
            model: 'menolak-model',
          }),
        },
        retriever: { search: () => [] },
      });

      expect(result.refused).toBe(true);
      expect(result.sources.map((s) => s.id)).toEqual(['bantuan-ikhtisar', 'kontak']);
    });

    it('tidak disimpan ke cache', async () => {
      // Penolakan murah dibuat ulang, dan penolakan yang KELIRU tidak boleh
      // terpaku selama masa hidup cache — cacat yang baru saja diperbaiki
      // adalah penolakan keliru.
      await ask({ question: 'harga emas', provider: declining() });
      expect(writeCached).not.toHaveBeenCalled();
    });
  });

  it('answers from the corpus and attributes its sources', async () => {
    const result = await ask({ question: 'apa visi pesantren', provider: new StubProvider() });

    expect(result.refused).toBe(false);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((s) => s.kind === 'kb')).toBe(true);
    // The stub echoes context verbatim, so a grounded answer contains it.
    expect(result.answer).toContain('Mencetak Generasi');
  });

  it('marks live lookups as such in the sources', async () => {
    mockLiveFacts.mockResolvedValue([
      { id: 'spmb-gelombang-aktif', title: 'SPMB terkini', text: 'Biaya Rp 350.000.' },
    ]);
    const result = await ask({
      question: 'berapa biaya pendaftaran',
      provider: new StubProvider(),
    });

    const live = result.sources.filter((s) => s.kind === 'live');
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe('spmb-gelombang-aktif');
  });

  it('answers from a live fact even when the corpus has nothing', async () => {
    mockLiveFacts.mockResolvedValue([
      { id: 'spmb-gelombang-aktif', title: 'SPMB terkini', text: 'Pendaftaran DIBUKA.' },
    ]);
    const result = await ask({
      question: 'apakah pendaftaran dibuka',
      provider: new StubProvider(),
      retriever: { search: () => [] },
    });

    expect(result.refused).toBe(false);
    expect(result.answer).toContain('DIBUKA');
  });

  it('trims history to the configured ceiling', async () => {
    // The client sends what it likes; the context window and the bill are ours.
    const provider = recordingProvider();
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: 'user' as const,
      content: `turn ${i}`,
    }));

    await ask({ question: 'visi', provider, history });

    const sent = provider.lastRequest!.messages.filter((m) => m.role !== 'system');
    // history turns + the current question
    expect(sent).toHaveLength(config.chatbot.maxHistoryTurns + 1);
    expect(sent[0].content).toBe('turn 14');
  });

  it('serves a cache hit without calling the model at all', async () => {
    // The whole point: the measured cost of a call was between 1 and 33
    // seconds of the visitor's time. A hit spends none of it.
    const cached = { answer: 'dari cache', sources: [], refused: false };
    vi.mocked(readCached).mockResolvedValueOnce(cached);
    const provider = recordingProvider();

    const result = await ask({ question: 'apa visi pesantren', provider });

    // `cached` ditambahkan di sini dan dilucuti lagi di controller sebelum
    // jawabannya keluar. Riwayat percakapan yang membutuhkannya: jawaban keliru
    // yang ternyata pemutaran ulang diperbaiki dengan membersihkan cache, bukan
    // dengan mengubah persona. Pelucutannya diuji di chatbot.controller.test.ts.
    expect(result).toEqual({ ...cached, cached: true });
    expect(provider.lastRequest).toBeUndefined();
  });

  it('books a billed call against the month it was made in', async () => {
    const provider: LlmProvider = {
      name: 'metered',
      complete: async () => ({
        text: 'jawaban',
        model: 'DeepSeek-V4-Flash',
        usage: { promptTokens: 341, completionTokens: 16 },
      }),
    };
    const now = new Date('2026-09-04T03:00:00Z');

    await ask({ question: 'apa visi pesantren', provider, now });

    expect(recordUsage).toHaveBeenCalledWith({
      model: 'DeepSeek-V4-Flash',
      usage: { promptTokens: 341, completionTokens: 16 },
      now,
    });
  });

  it('books nothing for an answer served from cache', async () => {
    // The cache is a saving, not a spend. Counting hits here would inflate the
    // month's estimate with calls that never reached the provider — and the
    // figure the alert compares against would stop being a bill.
    vi.mocked(readCached).mockResolvedValueOnce({
      answer: 'dari cache',
      sources: [],
      refused: false,
    });

    await ask({ question: 'apa visi pesantren', provider: recordingProvider() });

    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('books nothing when the provider call fails', async () => {
    const failing: LlmProvider = {
      name: 'failing',
      complete: () => Promise.reject(new Error('upstream 500')),
    };

    await expect(ask({ question: 'visi', provider: failing })).rejects.toBeInstanceOf(
      ChatbotUnavailableError
    );
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('stores a fresh answer for the next visitor', async () => {
    await ask({ question: 'apa visi pesantren', provider: new StubProvider() });
    expect(writeCached).toHaveBeenCalledWith('test-key', expect.objectContaining({ refused: false }));
  });

  it('does not consult the cache once a conversation has history', async () => {
    vi.mocked(isCacheable).mockReturnValueOnce(false);
    const provider = recordingProvider();

    await ask({
      question: 'apa visi pesantren',
      provider,
      history: [{ role: 'user', content: 'sebelumnya' }],
    });

    expect(readCached).not.toHaveBeenCalled();
    expect(writeCached).not.toHaveBeenCalled();
    expect(provider.lastRequest).toBeDefined();
  });

  it('surfaces a provider failure as unavailable rather than an invented answer', async () => {
    const failing: LlmProvider = {
      name: 'failing',
      complete: () => Promise.reject(new Error('upstream 500')),
    };
    await expect(ask({ question: 'visi', provider: failing })).rejects.toBeInstanceOf(
      ChatbotUnavailableError
    );
  });

  it('reports unavailable when no provider is configured', async () => {
    await expect(ask({ question: 'visi', provider: null })).rejects.toBeInstanceOf(
      ChatbotUnavailableError
    );
  });
});

describe('ask ketika penyedianya sedang penuh', () => {
  /** Pembatas yang slotnya sudah habis dipakai satu tugas yang menggantung. */
  function fullThrottle() {
    const throttle = createThrottle({ maxConcurrent: 1, maxQueue: 0, maxWaitMs: 50 });
    void throttle.run(() => new Promise<never>(() => {}));
    return throttle;
  }

  it('meneruskan "sedang sibuk" apa adanya, bukan menyamarkannya jadi "tidak tersedia"', async () => {
    // Perbedaannya sampai ke layar penanya. "Tidak tersedia" menyuruh ia
    // menyerah; "sedang ramai" mengundangnya mencoba lagi sebentar lagi — dan
    // pada asisten yang sebenarnya hidup, undangan itu yang benar.
    const provider = recordingProvider();
    const throttle = fullThrottle();
    await Promise.resolve();

    await expect(
      ask({ question: 'apa visi pesantren', provider, throttle })
    ).rejects.toBeInstanceOf(ChatbotBusyError);
    expect(provider.lastRequest).toBeUndefined();
  });

  it('tetap melayani jawaban dari cache meski semua slot terpakai', async () => {
    // Pada saat ramai, cache adalah katup pelepas tekanan — bukan beban.
    // Membuatnya ikut mengantre akan memperlambat justru jalur yang tidak
    // memanggil siapa pun, tepat ketika perlambatan itu paling merugikan.
    vi.mocked(readCached).mockResolvedValueOnce({
      answer: 'dari cache',
      sources: [],
      refused: false,
    });
    const throttle = fullThrottle();
    await Promise.resolve();

    const result = await ask({
      question: 'apa visi pesantren',
      provider: recordingProvider(),
      throttle,
    });

    expect(result.answer).toBe('dari cache');
  });

  it('tetap menjawab penolakan pertahanan-terakhir meski semua slot terpakai', async () => {
    const throttle = fullThrottle();
    await Promise.resolve();

    const result = await ask({
      question: 'apa pun',
      provider: new StubProvider(),
      entries: [],
      throttle,
    });

    expect(result.refused).toBe(true);
  });
});

describe('resolveProvider', () => {
  const original = { ...config.chatbot, env: config.env };

  afterEach(() => {
    Object.assign(config.chatbot, original);
    (config as { env: string }).env = original.env;
  });

  it('is disabled by default', () => {
    Object.assign(config.chatbot, { provider: 'disabled' });
    expect(resolveProvider()).toBeNull();
  });

  it('refuses an openai-compatible provider with missing credentials', () => {
    // Half-configured must mean off, not "on and improvising".
    Object.assign(config.chatbot, {
      provider: 'openai-compatible',
      baseUrl: 'https://example.invalid',
      apiKey: undefined,
      model: 'some-model',
    });
    expect(resolveProvider()).toBeNull();
  });

  it('builds the provider when fully configured', () => {
    Object.assign(config.chatbot, {
      provider: 'openai-compatible',
      baseUrl: 'https://example.invalid',
      apiKey: 'k',
      model: 'some-model',
    });
    expect(resolveProvider()?.name).toBe('openai-compatible');
  });

  it('never selects the stub in production', () => {
    // A stub answering real visitors looks like a working service while being
    // unable to answer anything that is not a near-verbatim match — a quieter
    // failure than an outage, and a worse one.
    Object.assign(config.chatbot, { provider: 'stub' });
    (config as { env: string }).env = 'production';
    expect(resolveProvider()).toBeNull();
  });

  it('allows the stub outside production', () => {
    Object.assign(config.chatbot, { provider: 'stub' });
    (config as { env: string }).env = 'development';
    expect(resolveProvider()?.name).toBe('stub');
  });
});
