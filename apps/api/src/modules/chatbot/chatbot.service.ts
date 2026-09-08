/**
 * Public chatbot orchestration: retrieve → ground → answer → attribute.
 *
 * Phase 1 serves anonymous visitors only. There is no user, so there is nothing
 * to authorise and nothing private within reach — the assistant can only see
 * the knowledge base (derived from public site constants) and the public
 * admission projection. That is what makes it safe to ship first.
 *
 * See docs/planning/chatbot-design.md §8 for why the authenticated assistant
 * waits, and §2 for the rule it must follow when it arrives.
 */

import { siteConfig } from '@cipansor/shared';
import type { ChatMessage, ChatSource, PublicChatResponse } from '@cipansor/shared';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { defaultRetriever, type Retriever } from './retrieval';
import { knowledgeBase, topicLabels, type KnowledgeEntry } from './knowledge-base';
import { looksLikeRefusal } from './refusal';
import { ChatbotBusyError, createThrottle, type Throttle } from './throttle';
import { collectLiveFacts } from './live-facts';
import { buildMessages, splitCitedSources } from './prompt';
import { resolvePublicPersona } from './persona.service';
import { cacheKeyFor, isCacheable, readCached, writeCached } from './cache';
import { recordUsage } from './usage.service';
import type { LlmProvider } from './providers/types';
import { OpenAiCompatibleProvider } from './providers/openai-compatible';
import { StubProvider } from './providers/stub';

/**
 * Pembatas kesejajaran bersama untuk seluruh proses.
 *
 * Dibuat sekali di tingkat modul dengan sengaja: yang dilindunginya adalah
 * kuota per menit MILIK SATU DEPLOYMENT, jadi ia harus dihitung sekali untuk
 * seluruh proses, bukan sekali per permintaan.
 */
const throttle = createThrottle(config.chatbot.throttle);

export { ChatbotBusyError };

export class ChatbotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatbotUnavailableError';
  }
}

/**
 * Builds the configured provider, or returns null when the assistant is off.
 *
 * The stub is refused outside development on purpose: it answers by echoing
 * retrieved text, which reads like a working service while being unable to
 * handle any question that is not a near-verbatim match. Shipping that to real
 * visitors would be a quieter failure than an outage, and a worse one.
 */
export function resolveProvider(): LlmProvider | null {
  const { provider, baseUrl, apiKey, model } = config.chatbot;

  switch (provider) {
    case 'disabled':
      return null;

    case 'stub':
      if (config.env === 'production') {
        logger.error('CHATBOT_PROVIDER=stub is not permitted in production; chatbot disabled');
        return null;
      }
      return new StubProvider();

    case 'openai-compatible': {
      if (!baseUrl || !apiKey || !model) {
        logger.error(
          'CHATBOT_PROVIDER=openai-compatible requires CHATBOT_API_BASE_URL, CHATBOT_API_KEY and CHATBOT_MODEL; chatbot disabled'
        );
        return null;
      }
      return new OpenAiCompatibleProvider(baseUrl, apiKey, model);
    }

    default:
      logger.error('Unknown CHATBOT_PROVIDER; chatbot disabled', { provider });
      return null;
  }
}

export interface AskOptions {
  question: string;
  history?: ChatMessage[];
  /** Injected in tests; production resolves from config. */
  provider?: LlmProvider | null;
  retriever?: Retriever;
  /**
   * Korpus yang dikirim ke model. Produksi memakai seluruhnya; uji menyuntik
   * korpus kosong untuk mencapai jalur pertahanan yang tidak bisa dijangkau
   * pertanyaan mana pun.
   */
  entries?: KnowledgeEntry[];
  /**
   * Pembatas kesejajaran. Produksi memakai satu milik proses; uji menyuntik
   * miliknya sendiri, karena yang perlu dibuktikan adalah bahwa jalur cache dan
   * jalur penolakan TIDAK ikut meminta giliran.
   */
  throttle?: Throttle;
  /** Additive persona text. Never able to remove a safety rule — see prompt.ts. */
  persona?: string;
  now?: Date;
}

/**
 * Apa yang `ask()` kembalikan ke dalam sistem — bukan apa yang dikirim ke
 * peramban.
 *
 * `cached` adalah satu-satunya bedanya, dan ia dilucuti di controller sebelum
 * jawabannya keluar. Riwayat percakapan menyimpannya karena ia menjawab
 * pertanyaan yang sering muncul saat membaca jawaban yang keliru: apakah model
 * baru saja mengarangnya, atau ini pemutaran ulang yang perlu dibersihkan dari
 * cache? Pengunjung tidak punya urusan dengan jawaban itu.
 */
export interface AskResult extends PublicChatResponse {
  cached?: boolean;
}

/**
 * A refusal the service produces itself, without consulting the model.
 *
 * TIDAK LAGI dipicu oleh hasil pencarian. Dulu ia keluar setiap kali BM25
 * pulang dengan tangan kosong, dan itulah cacatnya: pemotong kata henti
 * menyisakan satu kata dari "ada informasi apa saja", tidak ada entri yang
 * cocok, dan pertanyaan yang sebenarnya terjawab ditolak tanpa pernah menyentuh
 * model.
 *
 * Sekarang ia hanya menjaga satu keadaan yang tidak bisa dicapai oleh
 * pertanyaan apa pun: korpus benar-benar kosong DAN tidak ada fakta live —
 * misalnya karena sebuah suntingan mengosongkan `knowledgeBase`. Meminta model
 * menolak dengan sopan ketika ia tidak diberi apa-apa adalah permintaan yang
 * bisa ia abaikan; tidak memanggilnya sama sekali tidak bisa.
 */
function groundedRefusal(): PublicChatResponse {
  // Written out rather than generated so it matches the house style even though
  // no model is involved: a visitor should not be able to tell that this
  // particular reply never reached one.
  //
  // RAMBU PETUNJUK, BUKAN JALAN BUNTU. Versi sebelumnya hanya meminta maaf lalu
  // menyodorkan nomor telepon, dan itu jawaban yang salah untuk keluhan yang
  // paling sering memicunya: seorang pengunjung yang bertanya "ada informasi
  // apa saja?" tidak membutuhkan nomor telepon, ia membutuhkan daftar. Menyebut
  // apa yang MEMANG bisa dijawab mengubah kebuntuan menjadi langkah berikutnya,
  // dan tidak menelan satu token pun karena tidak ada model yang terlibat.
  //
  // Daftarnya diambil dari korpus (`topicLabels()`), bukan ditulis ulang di
  // sini — dua daftar yang harus disepakati selamanya adalah cara sebuah rambu
  // petunjuk mulai menunjuk ke tempat yang sudah tidak ada.
  const topik = topicLabels().join(', ');

  return {
    answer:
      'Mohon maaf, untuk pertanyaan tersebut saya belum memiliki informasinya 🙏\n\n' +
      `Yang bisa saya bantu: ${topik} — juga informasi pendaftaran santri baru ` +
      '(SPMB) terkini seperti biaya dan tanggal penutupannya 📚\n\n' +
      'Bila yang Bapak/Ibu cari tidak ada di daftar itu, silakan hubungi kami di ' +
      `${siteConfig.contact.phone} 📞 atau melalui WhatsApp ${siteConfig.contact.whatsapp} 💬\n\n` +
      'Ada lagi yang ingin Bapak/Ibu tanyakan? 😊',
    sources: [],
    refused: true,
  };
}

export async function ask(options: AskOptions): Promise<AskResult> {
  const {
    question,
    history = [],
    provider = resolveProvider(),
    retriever = defaultRetriever,
    persona: personaOverride,
    throttle: throttleOverride = throttle,
    now = new Date(),
  } = options;

  if (!provider) {
    throw new ChatbotUnavailableError('Chatbot is not configured');
  }

  const entries = options.entries ?? knowledgeBase;
  const liveFacts = await collectLiveFacts(question, now);

  // SELURUH korpus ikut dikirim, dan pencarian tidak lagi punya hak veto.
  //
  // Korpusnya sekitar 628 token — kurang dari satu halaman. RAG ada untuk
  // korpus yang tidak muat di dalam prompt; praktik terkini menaruh ambangnya
  // di sekitar 100 ribu token, dua orde besaran di atas kita. Jadi memilih 4
  // dari 8 entri tidak membeli apa pun, sementara harganya nyata: pemilih itu
  // pernah memveto pertanyaan yang jelas-jelas terjawab.
  //
  // Yang tersisa di bawah ini bukan gerbang, melainkan pertahanan terakhir
  // untuk keadaan yang tidak bisa dicapai lewat pertanyaan: korpus kosong.
  if (entries.length === 0 && liveFacts.length === 0) {
    return groundedRefusal();
  }

  // Resolve the persona the super admin has configured (or the default) before
  // consulting the cache: the persona is part of the cache key, so an edit
  // re-keys every answer. Tests and the eval harness may inject one directly.
  const persona = personaOverride ?? (await resolvePublicPersona());

  // The cache is consulted AFTER the live lookup, not before it: the live facts
  // are part of the key, which is what stops a cached answer from quoting a fee
  // or a deadline that has since changed. The lookup is one indexed query
  // against a database we already run; the model call it may save takes between
  // one and thirty-three seconds.
  const cacheKey = isCacheable(history.length)
    ? cacheKeyFor(question, liveFacts, persona)
    : null;
  if (cacheKey) {
    const hit = await readCached(cacheKey);
    if (hit) {
      logger.debug('Chatbot cache hit');
      return { ...hit, cached: true };
    }
  }

  // Trim history server-side. The client sends what it likes; the cost and the
  // context window are ours, so the ceiling is enforced here.
  const trimmed = history.slice(-config.chatbot.maxHistoryTurns);

  const messages = buildMessages({ question, entries, liveFacts, persona, history: trimmed });

  let result;
  try {
    // Pembatas kesejajaran melingkupi HANYA panggilan penyedia.
    //
    // Bukan seluruh `ask()`, dan itu penting: jawaban dari cache serta
    // penolakan pertahanan-terakhir sudah pulang di atas sini tanpa pernah
    // meminta giliran. Keduanya tidak memanggil siapa pun, jadi membuatnya
    // mengantre hanya akan memperlambat justru jalur yang paling murah — dan
    // pada saat sibuk, cache adalah katup pelepas tekanan, bukan beban.
    result = await throttleOverride.run(() =>
      provider.complete({
        messages,
        maxTokens: config.chatbot.maxTokens,
        temperature: config.chatbot.temperature,
      })
    );
  } catch (error) {
    // Sibuk bukan rusak. `ChatbotBusyError` naik apa adanya supaya permukaan
    // HTTP dapat menjawab 503 dengan `Retry-After` — sebuah undangan untuk
    // mencoba lagi sebentar lagi, bukan kabar bahwa asisten mati.
    if (error instanceof ChatbotBusyError) throw error;

    // Log the message and name explicitly. A bare `{ error }` serialises an
    // Error to `{}`, which is what the first real provider run produced — an
    // outage report with nothing in it to act on.
    logger.error('Chatbot provider call failed', {
      provider: provider.name,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error && error.cause ? String(error.cause) : undefined,
    });
    throw new ChatbotUnavailableError('Chatbot provider is unavailable');
  }

  // Dicatat di sini, bukan di dalam penyedia, dan bukan sebelum panggilannya:
  // hanya pada titik ini kita tahu panggilannya berhasil — dan hanya panggilan
  // yang berhasil sampai ke penyedia yang ditagih. Jawaban dari cache sudah
  // pulang belasan baris di atas tanpa pernah melewati sini, yang memang
  // seharusnya: cache adalah penghematan, bukan belanja.
  //
  // Ditunggu (`await`) supaya dapat diamati uji, dan aman ditunggu karena
  // `recordUsage` menelan galatnya sendiri. Pembukuan yang rusak tidak boleh
  // menjadi chatbot yang rusak.
  await recordUsage({ model: result.model, usage: result.usage, now });

  // Baris "SUMBER: ..." yang diminta aturan 7 dipotong di sini, sebelum apa pun
  // menyentuh penanya, riwayat percakapan atau cache.
  const { answer, citedIds } = splitCitedSources(result.text);

  // Id yang disebut model DISARING terhadap korpus sungguhan: sebuah id
  // karangan tidak boleh muncul sebagai sumber, karena sumber palsu lebih buruk
  // daripada tidak ada sumber. Bila model lupa menyebutkannya sama sekali,
  // peringkat BM25 dipakai sebagai cadangan — bukan sebagai kebenaran, hanya
  // sebagai tebakan terbaik yang bisa dibuat tanpa bertanya lagi.
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const cited = citedIds
    .map((id) => byId.get(id))
    .filter((entry): entry is KnowledgeEntry => Boolean(entry));
  const attributed = cited.length > 0 ? cited : retriever.search(question).map((c) => c.entry);

  const sources: ChatSource[] = [
    ...liveFacts.map((fact) => ({ id: fact.id, title: fact.title, kind: 'live' as const })),
    ...attributed.map((entry) => ({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      kind: 'kb' as const,
    })),
  ];

  // Penolakan sekarang ditulis MODEL, bukan layanan, jadi `refused` harus
  // dibaca dari kalimatnya. Tanpa ini ia akan selalu `false`, dan dua hal ikut
  // rusak diam-diam: hitungan penolakan di halaman Riwayat Percakapan — yang
  // gunanya justru menemukan pertanyaan yang tidak terjawab — dan himpunan
  // red-team di perangkat eval, yang menganggap penolakan sebagai kelulusan.
  //
  // Sempat dipagari dengan syarat "model tidak mengutip sumber". Dibatalkan
  // oleh uji ke model sungguhan: aturan 5 menyuruh model menyebut daftar topik
  // dan kontak ketika menolak, sehingga penolakan pun ikut mengutip. Yang
  // memisahkan penolakan dari jawaban ada di dalam kalimatnya sendiri —
  // subjeknya — dan itu dikerjakan `refusal.ts`.
  const refused = looksLikeRefusal(answer);

  const response: PublicChatResponse = {
    answer,
    sources,
    refused,
    model: result.model,
  };

  // Written after the answer is built, and awaited so a test can observe it.
  // A failed write is logged and swallowed inside `writeCached` — a cache that
  // is down must never become a chatbot that is down.
  //
  // PENOLAKAN TIDAK DISIMPAN. Dulu ia tidak pernah sampai ke sini karena
  // layanan pulang lebih awal; sekarang ia sampai, jadi keputusannya harus
  // dinyatakan. Penolakan murah dibuat ulang, dan penolakan yang KELIRU — yang
  // baru saja kita perbaiki satu kasusnya — tidak boleh terpaku selama masa
  // hidup cache. Perlindungan biaya terhadap pengulangan sudah dipegang
  // Turnstile dan batas 10 per menit per IP.
  if (cacheKey && !refused) await writeCached(cacheKey, response);

  return response;
}
