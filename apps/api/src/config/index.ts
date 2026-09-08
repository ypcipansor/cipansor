import dotenv from 'dotenv';
import path from 'path';
import { findSecretIssues } from './assert-secrets';
import { parseCorsOrigins } from './cors';

// Load apps/api/.env (works from both src/ via tsx and dist/ when compiled,
// since each sits directly under apps/api), then the repo-root .env as a
// fallback for anything not set (dotenv never overrides existing vars).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const DEFAULT_JWT_SECRET = 'change-this-secret-in-production';

/**
 * Resolve the JWT signing secret. In production a missing, placeholder, or
 * short secret is a fatal misconfiguration: every token in the system could
 * be forged. Refuse to boot. Outside production, fall back to the dev default.
 *
 * The judgement of what counts as a bad secret is delegated to
 * `findSecretIssues` rather than repeated here. The earlier version compared
 * against `DEFAULT_JWT_SECRET` alone — an exact match on the code's own
 * fallback — which missed the value production was actually running:
 * "your-super-secret-key-change-this-in-production-min-32-chars", taken from
 * .env.example. It is 60 characters and is not the code default, so it passed
 * both tests while being published in a public repository. One rule, one
 * place, so the next placeholder cannot slip between two definitions of "bad".
 */
export function resolveJwtSecret(secret: string | undefined, env: string | undefined): string {
  if (env === 'production') {
    const issues = findSecretIssues({ jwtSecret: secret });
    const jwtIssue = issues.find((i) => i.variable === 'JWT_SECRET');
    if (jwtIssue) {
      throw new Error(`JWT_SECRET ${jwtIssue.reason}`);
    }
    return secret as string;
  }
  return secret || DEFAULT_JWT_SECRET;
}

/**
 * Angka uang dari env, memaafkan koma desimal.
 *
 * `parseFloat('0,19')` bernilai **0**, bukan 0,19 — ia berhenti di koma. Nilai
 * ini diisi tangan oleh orang yang menulis harga dalam bahasa Indonesia, di
 * mana `0,19` adalah bentuk yang wajar, dan kekeliruannya tidak akan pernah
 * kelihatan: harga nol berarti "belum berharga", dan sistemnya diam-diam
 * berhenti membandingkan apa pun. Satu penggantian karakter menutup itu.
 *
 * Nilai yang tidak berbentuk angka sama sekali tetap menjadi 0, dan 0 adalah
 * keadaan yang sudah punya perilakunya sendiri — pemberitahuan konfigurasi
 * sebulan sekali, bukan kesenyapan.
 */
function parsePrice(raw: string | undefined): number {
  const value = parseFloat((raw || '0').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  jwt: {
    secret: resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV),
    // Access tokens are short-lived so that role/permission changes and
    // offboarding take effect within minutes; the web client refreshes
    // transparently via /auth/refresh (see apps/web/src/lib/api.ts).
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  bcrypt: {
    saltRounds: 10,
  },

  cors: {
    // A list, not a string — see config/cors.ts for why the raw value must
    // never reach the `cors` middleware directly.
    origins: parseCorsOrigins(process.env.CORS_ORIGIN || 'http://localhost:3000'),
  },

  /**
   * Where the *public* site lives — the host that answers without a session.
   *
   * Anything printed on paper or handed to an outsider belongs here: the QR on
   * a sanad certificate is scanned by a dinas office or a prospective employer,
   * neither of whom has an account.
   *
   * NAMED FOR THE HOST, not the app. The variable this replaces was `APP_URL`,
   * which since the two-host split names nothing in particular — and the code
   * showed it: four call sites, four different guesses, none of them right.
   * `https://cipansor.app` (twice), `https://cipansor.com`, and
   * `http://localhost:3000` all shipped to production as fallbacks, because
   * APP_URL was never set in `.env` or in the compose `environment:` block, so
   * every default was live. Two of those domains are not ours.
   *
   * A trailing slash is stripped so callers can append an absolute path
   * without producing a double slash.
   */
  publicSiteUrl: (process.env.PUBLIC_SITE_URL || 'https://cipansor.or.id').replace(/\/+$/, ''),

  /**
   * Where the application lives — the host that requires a session.
   *
   * Separate from `publicSiteUrl` because since the two-host split they are
   * genuinely different machines' worth of routing, and picking the wrong one
   * is silent: a link to the portal handed to an outsider becomes a login
   * screen, and a link to the apex handed to staff becomes a 404.
   *
   * The one legitimate use is a QR meant to be scanned by someone who is
   * already signed in — an asset label read by staff during stock opname. That
   * QR previously resolved to `http://localhost:3000/inventory/<id>`, which is
   * every printed label pointing at the scanner's own phone.
   */
  portalUrl: (process.env.PORTAL_URL || 'https://portal.cipansor.or.id').replace(/\/+$/, ''),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    // Auth (login/2FA) limiter. Deliberately strict by default — this guards
    // against credential brute-force. CI/e2e environments that need more
    // headroom should raise RATE_LIMIT_AUTH_MAX_REQUESTS via env instead of
    // weakening the production default.
    auth: {
      windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS || '5', 10),
    },
  },

  /**
   * Cloudflare Turnstile — pembuktian "bukan bot" untuk endpoint yang terbuka
   * bagi siapa pun tanpa kredensial.
   *
   * `secretKey` sengaja tidak punya nilai bawaan. Kunci rahasia yang punya
   * nilai bawaan adalah kunci yang tidak pernah gagal keras ketika lupa
   * dipasang — ia hanya menolak setiap pengunjung dengan alasan yang
   * membingungkan, atau lebih buruk, meloloskan semuanya sambil tampak aktif.
   * Tanpa kunci, `enabled` bernilai false dan gerbangnya melapor "mati" secara
   * eksplisit; itu keadaan yang dapat dibaca di log dan diuji, bukan ditebak.
   *
   * Site key-nya TIDAK ada di sini: ia milik peramban, dibakar ke dalam bundel
   * web lewat `NEXT_PUBLIC_TURNSTILE_SITE_KEY` pada waktu build. Kedua kunci
   * ini berpasangan, jadi memasang salah satunya saja menghasilkan kegagalan
   * yang membingungkan — lihat catatan di `.env.example`.
   */
  turnstile: {
    /**
     * Keduanya getter, bukan nilai yang dibekukan saat impor.
     *
     * `config` dibaca sekali ketika modulnya dimuat, jadi sebuah field biasa
     * akan memotret `process.env` pada saat itu dan tidak pernah berubah lagi.
     * Uji yang menyalakan dan mematikan gerbang ini lewat `vi.stubEnv` akan
     * diam-diam menguji potret yang sama dua kali — hijau, dan tidak
     * membuktikan apa pun.
     */
    get secretKey(): string | undefined {
      return process.env.TURNSTILE_SECRET_KEY;
    },
    get enabled(): boolean {
      return Boolean(process.env.TURNSTILE_SECRET_KEY);
    },
    /**
     * Batas waktu memanggil siteverify Cloudflare.
     *
     * Pendek dengan sengaja: gerbang ini duduk di depan halaman masuk, jadi
     * setiap milidetiknya dibayar oleh orang yang sedang menunggu. Bila
     * Cloudflare tidak menjawab dalam tempo ini, permintaannya diteruskan
     * (lihat `verifyTurnstileToken`) — jadi angka ini membatasi lamanya
     * menunggu, bukan ketatnya pemeriksaan.
     */
    timeoutMs: parseInt(process.env.TURNSTILE_TIMEOUT_MS || '4000', 10),
    /**
     * Hostname yang boleh menerbitkan token, dan mengapa daftar ini wajib ada.
     *
     * Site key kita **publik** — ia dibakar ke dalam bundel web dan dapat
     * dibaca siapa pun yang membuka Sumber Halaman. Tidak ada yang mencegah
     * orang lain menempelkan widget dengan site key yang sama di domainnya
     * sendiri, menyelesaikan tantangannya di sana, lalu membelanjakan
     * tokennya ke API ini. Yang membedakan token itu dari token pengunjung
     * kita hanyalah satu field yang dikembalikan siteverify: `hostname`,
     * yaitu tempat tantangannya benar-benar diselesaikan. Membuangnya —
     * seperti yang kita lakukan sampai 2026-09-04 — berarti site key publik
     * itu sekaligus menjadi izin masuk bagi siapa saja yang mau memasangnya.
     *
     * **`localhost` sengaja TIDAK ada di daftar bawaan.** Menyertakannya akan
     * membuka persis lubang yang daftar ini tutup: penyerang cukup menyajikan
     * halaman berisi site key kita dari `localhost` miliknya sendiri, dan
     * Cloudflare akan melaporkan hostname itu apa adanya. Pengembangan tidak
     * membutuhkannya — tanpa `TURNSTILE_SECRET_KEY` gerbangnya mati sebelum
     * pemeriksaan ini tercapai.
     */
    get allowedHostnames(): string[] {
      const raw = process.env.TURNSTILE_ALLOWED_HOSTNAMES;
      if (raw && raw.trim().length > 0) {
        return raw
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter((h) => h.length > 0);
      }
      return ['cipansor.or.id', 'www.cipansor.or.id', 'portal.cipansor.or.id'];
    },
  },

  log: {
    level: process.env.LOG_LEVEL || 'debug',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  /**
   * Outgoing mail identity, shared by every transport.
   *
   * `from` is the mailbox the yayasan sends *from* and nobody reads;
   * `replyTo` is the one a human answers. Keeping them separate is the whole
   * point — a wali who hits "Reply" on a tagihan reminder must reach
   * halo@, not a noreply@ mailbox that discards them.
   */
  mail: {
    from: process.env.MAIL_FROM || '"Yayasan Pesantren Cipansor" <noreply@cipansor.or.id>',
    replyTo: process.env.MAIL_REPLY_TO || 'halo@cipansor.or.id',
  },

  /**
   * Gmail API transport (preferred).
   *
   * A Google Cloud **service account** with domain-wide delegation, which
   * impersonates `sender` and calls `gmail.users.messages.send`. Preferred over
   * SMTP + app password because there is no password to leak: the credential is
   * an RSA key the Workspace admin can revoke, scoped to `gmail.send` alone, and
   * it cannot be used to read mail or sign in anywhere.
   *
   * Inert until both the account e-mail and the key are present, so an
   * unconfigured deployment falls through to SMTP and then to log-only.
   */
  gmail: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    // Private keys carry real newlines. Env files cannot, so the value is
    // stored with literal \n and unescaped here.
    serviceAccountKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    // The Workspace mailbox the service account acts as. Must be a real user or
    // alias in the domain, or Google answers 400 unauthorized_client.
    sender: process.env.GMAIL_SENDER || 'noreply@cipansor.or.id',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    // NOTE: no `from`/`replyTo` here. The sending identity belongs to
    // `config.mail` and is the same whichever transport carries the message —
    // keeping a second copy under `smtp` is how the two drift apart, and how
    // the reply address ends up correct on one path and not the other.
    oauth2: {
      clientId: process.env.SMTP_OAUTH_CLIENT_ID,
      clientSecret: process.env.SMTP_OAUTH_CLIENT_SECRET,
      refreshToken: process.env.SMTP_OAUTH_REFRESH_TOKEN,
    },
  },

  /**
   * Public customer-service chatbot.
   *
   * Disabled by default and inert without credentials: with no provider
   * configured the endpoint answers 503 and the web widget does not render.
   * That is deliberate — a half-configured assistant that improvises answers
   * about fees and admission dates is worse than no assistant.
   *
   * `provider` accepts `openai-compatible` (Azure AI Foundry, Azure OpenAI, or
   * any gateway speaking POST {base}/chat/completions), `stub` (deterministic,
   * development only), or `disabled`.
   */
  chatbot: {
    provider: process.env.CHATBOT_PROVIDER || 'disabled',
    baseUrl: process.env.CHATBOT_API_BASE_URL,
    apiKey: process.env.CHATBOT_API_KEY,
    model: process.env.CHATBOT_MODEL,
    // 60s, not the 20s this started at. Measured against DeepSeek-V4-Flash on
    // Azure AI Foundry, a 341-token prompt answered in 16 tokens took 7.8s,
    // 13.4s and 32.7s on three consecutive calls — the variance is the
    // endpoint's, not a cold start. 20s aborted often enough that the first
    // real eval run could not complete a single case.
    timeoutMs: parseInt(process.env.CHATBOT_TIMEOUT_MS || '60000', 10),
    // Raised from 400 when the persona landed: salam, the answer, a closing
    // offer and emoji do not fit where a bare answer did, and a reply truncated
    // mid-sentence is worse than a plain one.
    maxTokens: parseInt(process.env.CHATBOT_MAX_TOKENS || '700', 10),
    // Facts, not prose. Kept low so the same question yields the same answer,
    // which is also what makes the eval harness meaningful.
    temperature: parseFloat(process.env.CHATBOT_TEMPERATURE || '0.2'),
    /** Turns of prior conversation replayed to the model, oldest dropped first. */
    maxHistoryTurns: parseInt(process.env.CHATBOT_MAX_HISTORY_TURNS || '6', 10),

    /**
     * Coba ulang ketika penyedia menjawab "sebentar", bukan "salah".
     *
     * Azure AI Foundry membatasi permintaan dan token per menit; sentuhan pada
     * batas itu datang sebagai HTTP 429 dengan `Retry-After`. Tiga percobaan
     * dengan backoff full-jitter menutup lonjakan pendek tanpa mengubah satu
     * gangguan panjang menjadi penantian panjang — lihat `chatbot/retry.ts`
     * untuk apa yang TIDAK diulang, dan kenapa.
     */
    retry: {
      /** Termasuk percobaan pertama. Setel 1 untuk mematikan pengulangan. */
      maxAttempts: parseInt(process.env.CHATBOT_RETRY_MAX_ATTEMPTS || '3', 10),
      baseDelayMs: parseInt(process.env.CHATBOT_RETRY_BASE_MS || '500', 10),
      maxDelayMs: parseInt(process.env.CHATBOT_RETRY_MAX_DELAY_MS || '8000', 10),
      /**
       * Batas waktu SELURUH rangkaian percobaan, bukan per percobaan.
       *
       * 90 detik dipilih dari langit-langit di atas kita, bukan dari selera:
       * Cloudflare memutus permintaan yang belum dijawab pada 100 detik dengan
       * galat 524, dan jawaban yang tiba sesudah itu tidak pernah sampai ke
       * siapa pun. Anggaran ini harus tetap di bawahnya.
       */
      budgetMs: parseInt(process.env.CHATBOT_RETRY_BUDGET_MS || '90000', 10),
    },

    /**
     * Pembatas kesejajaran di depan penyedia — lihat `chatbot/throttle.ts`.
     *
     * Coba ulang menolong satu permintaan yang menabrak batas; ini mencegah
     * kita sendiri yang menyebabkan batas itu tersentuh.
     */
    /**
     * Penerusan pertanyaan ke tim ketika asisten tidak bisa menjawab.
     *
     * `to` sengaja dibiarkan kosong secara bawaan dan diselesaikan di tempat
     * pemakaiannya menjadi `config.mail.replyTo`: kotak masuk yang sama yang
     * sudah menerima balasan surat kita adalah tempat yang benar untuk
     * pertanyaan ini, dan menyalin alamatnya ke sini akan membuat dua sumber
     * kebenaran yang harus sepakat selamanya.
     */
    escalation: {
      to: process.env.CHATBOT_ESCALATION_TO || '',
      /**
       * Jauh lebih ketat daripada 10/menit milik obrolan, dan alasannya
       * berbeda: yang ini menulis baris basis data DAN mengirim surat ke kotak
       * masuk yang dibaca manusia. Sebuah skrip yang berhasil menembusnya tidak
       * menghabiskan uang, ia menghabiskan perhatian petugas — dan perhatian
       * yang sudah habis tidak pulih dengan menambah kuota.
       */
      rateLimit: {
        windowMs: parseInt(process.env.CHATBOT_ESCALATION_WINDOW_MS || '3600000', 10),
        maxRequests: parseInt(process.env.CHATBOT_ESCALATION_MAX || '3', 10),
      },
    },

    throttle: {
      maxConcurrent: parseInt(process.env.CHATBOT_MAX_CONCURRENT || '3', 10),
      maxQueue: parseInt(process.env.CHATBOT_QUEUE_MAX || '20', 10),
      /**
       * Penanya menunggu di layar, jadi antriannya pendek dengan sengaja.
       * Sesudah ini kita menjawab "sedang sibuk" — jawaban cepat yang jelas
       * lebih baik daripada penantian panjang yang berakhir sama.
       */
      maxWaitMs: parseInt(process.env.CHATBOT_QUEUE_WAIT_MS || '10000', 10),
    },
    /**
     * House style (greeting, tone, emoji, closing). Additive persona only — it
     * is appended below the safety scaffold and can never revoke a rule, so it
     * is safe to expose for editing.
     *
     * This is now the MIDDLE of three tiers, not the only one: the persona a
     * super admin saves from `/settings/chatbot` wins, this env var is the
     * deployment-level fallback, and `DEFAULT_PERSONA` is the floor. See
     * `modules/chatbot/persona.service.ts`.
     */
    persona: process.env.CHATBOT_PERSONA,
    /**
     * Answer cache lifetime. 0 disables the cache entirely.
     *
     * 24h is safe because the cache KEY, not the TTL, is what protects
     * freshness: it embeds a fingerprint of the live admission facts and a hash
     * of the knowledge base, so a changed fee, a changed deadline or a content
     * deploy orphans the old entry immediately. The TTL is just garbage
     * collection.
     */
    cacheTtlSeconds: parseInt(process.env.CHATBOT_CACHE_TTL_SECONDS || '86400', 10),
    /**
     * An open LLM endpoint on a public page is a cost-amplification target, so
     * this is far stricter than the general API limiter.
     */
    rateLimit: {
      windowMs: parseInt(process.env.CHATBOT_RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.CHATBOT_RATE_LIMIT_MAX_REQUESTS || '10', 10),
    },
    /**
     * What the assistant is allowed to cost in a month, and what a token costs.
     *
     * The limiter above caps the RATE. Nothing in it notices a bill climbing —
     * a bounded rate sustained for a month is still a bill, and a rate we
     * considered generous was chosen without ever having measured what a month
     * of real traffic spends. This block is what `jobs/chatbot-spend.job.ts`
     * compares against.
     *
     * **Prices are per one million tokens and default to 0 — deliberately not
     * to a guess.** The price belongs to the model and the region, both of
     * which are env configuration here (`chatbot-design.md` §1 keeps the model
     * swappable on purpose), so this file cannot know it; a plausible default
     * would produce an authoritative-looking figure that is simply wrong.
     * Unpriced is therefore a state the job REPORTS rather than a state in
     * which it goes quiet — see the job for what it sends instead.
     */
    spend: {
      inputPricePerMillionTokens: parsePrice(process.env.CHATBOT_PRICE_INPUT_PER_MTOK),
      outputPricePerMillionTokens: parsePrice(process.env.CHATBOT_PRICE_OUTPUT_PER_MTOK),
      /**
       * Harga token masukan yang dilayani dari cache milik PENYEDIA.
       *
       * Terpasang lengkap, dan hari ini tidak pernah terpakai: deployment
       * DeepSeek-V4-Flash-0731 di Azure AI Foundry mengembalikan `usage` berisi
       * `prompt_tokens`, `completion_tokens`, `total_tokens` dan
       * `audio_prompt_tokens` saja — tidak ada `prompt_tokens_details`, tidak
       * ada `prompt_cache_hit_tokens` (diperiksa langsung 2026-09-04). Selama
       * begitu, setiap token masukan dihitung pada harga penuh dan taksirannya
       * menjadi BATAS ATAS. Untuk sebuah peringatan anggaran, arah galat itu
       * yang benar: ia berbunyi terlalu awal, bukan terlambat.
       */
      cachedInputPricePerMillionTokens: parsePrice(
        process.env.CHATBOT_PRICE_CACHED_INPUT_PER_MTOK
      ),
      /** Label only — no conversion happens anywhere. Set it to whatever the invoice is in. */
      currency: process.env.CHATBOT_PRICE_CURRENCY || 'USD',
      /** 0 disables the budget comparison; the monthly volume report still goes out. */
      monthlyBudget: parsePrice(process.env.CHATBOT_MONTHLY_BUDGET),
      /** Empty falls back to `config.mail.replyTo`, which is a real monitored mailbox. */
      alertTo: process.env.CHATBOT_SPEND_ALERT_TO || '',
    },
  },
} as const;

export type Config = typeof config;
