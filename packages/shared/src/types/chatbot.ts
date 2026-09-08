/**
 * Customer-service chatbot DTOs.
 *
 * Phase 1 is the PUBLIC assistant only: it answers from a curated knowledge
 * base about Cipansor plus a small set of live read-only lookups. It has no
 * access to any user's data, because no user is logged in.
 *
 * The authenticated, role-aware assistant is deliberately NOT modelled here.
 * When it arrives it must reach private data by calling the existing authorised
 * endpoints as the logged-in user with their active role — never by querying a
 * vector index built over the database. See docs/planning/chatbot-design.md §2.
 */

/** One turn of a conversation. `system` is never accepted from a client. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PublicChatRequest {
  /** The visitor's question. */
  message: string;
  /**
   * Prior turns, oldest first. The server caps how many it will honour; it does
   * not trust the client to keep this small.
   */
  history?: ChatMessage[];
  /**
   * Token Cloudflare Turnstile untuk satu pertanyaan.
   *
   * Satu token per pesan, bukan satu per percakapan: Cloudflare menolak
   * penukaran kedua atas token yang sama, sehingga token yang dipakai ulang
   * akan membuat pertanyaan kedua gagal dan seterusnya. Opsional karena
   * gerbangnya dapat dimatikan seluruhnya.
   */
  turnstileToken?: string;
  /**
   * Opaque client-generated conversation id, for logging and rate limiting.
   * Carries no authority — it is not a session and grants nothing.
   */
  conversationId?: string;
}

/**
 * A piece of source material the answer was grounded in.
 *
 * Every answer carries its sources so a reader can check the claim, and so the
 * eval harness can measure groundedness rather than just plausibility.
 */
export interface ChatSource {
  /** Stable id of the knowledge-base entry or live lookup. */
  id: string;
  title: string;
  /** Public site path, when the source corresponds to a page a visitor can open. */
  url?: string;
  /** `kb` = curated knowledge base, `live` = a real-time authorised lookup. */
  kind: "kb" | "live";
}

export interface PublicChatResponse {
  answer: string;
  sources: ChatSource[];
  /**
   * True when the assistant declined — wholly or in part.
   *
   * DIPERLUAS 2026-09-04. Dulu ini hanya berarti "LAYANAN menolak", yaitu
   * pencarian pulang kosong dan model tidak pernah dipanggil. Sejak seluruh
   * korpus selalu ikut dikirim, gerbang itu tidak ada lagi dan yang menolak
   * adalah model, di bawah aturan 1, 2 dan 5 di `prompt.ts` — jadi nilainya
   * kini dibaca dari kalimat jawabannya (`refusal.ts`).
   *
   * "Sebagian" disengaja: jawaban yang menyebut lokasi tetapi menolak menyebut
   * biaya tetap ditandai, karena yang membaca angka ini sedang mencari
   * pertanyaan yang belum terjawab — dan pertanyaan itu memang belum terjawab.
   *
   * Perangkat eval memeriksanya langsung: untuk himpunan red-team, penolakan
   * adalah hasil yang LULUS.
   */
  refused: boolean;
  /** Which provider answered — useful when comparing candidate models. */
  model?: string;
}

/**
 * The editable persona (tone/style) for the public assistant, as seen by a
 * super admin.
 *
 * This is the ADDITIVE layer only: it shapes greeting, warmth, emoji and the
 * closing offer. It can never revoke a safety rule — those live in code and are
 * appended above this text, unreachable from here. See prompt.ts.
 */
export interface ChatbotPersonaResponse {
  /** The effective persona in use: the custom text if set, else the default. */
  persona: string;
  /** The code-resident default, so the UI can preview it and offer a reset. */
  defaultPersona: string;
  /** True when a super admin has saved a custom persona overriding the default. */
  isCustom: boolean;
  /** When the custom persona was last saved; null when none is set. */
  updatedAt: string | null;
}

export interface UpdateChatbotPersonaRequest {
  /** The new additive persona text. Bounded server-side. */
  persona: string;
}

/**
 * Riwayat tanya-jawab, sebagaimana dibaca Super Admin.
 *
 * Isinya adalah kalimat yang benar-benar diketik pengunjung, jadi ia dibatasi
 * tiga hal sekaligus: hanya SUPER_ADMIN yang boleh membacanya, ia terhapus
 * otomatis setelah 90 hari, dan tidak ada IP maupun sidik jari peramban yang
 * ikut disimpan. Lihat `apps/api/src/modules/chatbot/transcript.service.ts`.
 */
export interface ChatbotConversationSummary {
  id: string;
  startedAt: string;
  lastMessageAt: string;
  /** Jumlah giliran, pertanyaan dan jawaban dihitung terpisah. */
  messageCount: number;
  /** Berapa jawaban dalam percakapan ini yang berupa penolakan. */
  refusedCount: number;
  /** Pertanyaan pertama, untuk dikenali di daftar. */
  firstQuestion: string;
}

export interface ChatbotTranscriptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  refused: boolean;
  /** Dijawab dari cache — tidak menelan biaya, dan bukan kalimat baru. */
  fromCache: boolean;
  model?: string;
  createdAt: string;
}

export interface ChatbotConversationDetail {
  id: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  messages: ChatbotTranscriptMessage[];
}

export interface ChatbotConversationListResponse {
  conversations: ChatbotConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
  /** Berapa hari riwayat disimpan sebelum dihapus otomatis. */
  retentionDays: number;
}

/**
 * Pemakaian dan taksiran biaya asisten publik bulan berjalan (WIB).
 *
 * Setiap bendera di sini ada karena angka yang terdengar pasti padahal tidak
 * adalah jenis kekeliruan yang paling merugikan di sistem ini. Halaman yang
 * menampilkannya WAJIB menyampaikan arah kemelesetannya, bukan hanya
 * angkanya — lihat `estimateCost` di apps/api.
 */
export interface ChatbotUsageResponse {
  /** `2026-09` — bulan WIB yang dijumlahkan. */
  monthKey: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  /** Panggilan berhasil yang penyedianya tidak melaporkan tokennya. */
  unmeteredRequests: number;
  byModel: Array<{
    model: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cachedPromptTokens: number;
    unmeteredRequests: number;
  }>;

  cost: {
    amount: number;
    currency: string;
    /** Salah bila harga belum diisi — angkanya tidak berarti apa-apa. */
    priced: boolean;
    /** Benar bila taksirannya BATAS ATAS: cache tidak dilaporkan penyedia. */
    cacheUnreported: boolean;
    /** Benar bila taksirannya batas BAWAH: ada panggilan tak terukur. */
    incomplete: boolean;
  };

  /** Anggaran bulanan; 0 bila belum diatur. */
  monthlyBudget: number;
  /** Persen dari anggaran; null bila anggaran atau harga belum diatur. */
  percentOfBudget: number | null;
  /** Ke mana peringatan dikirim, supaya layarnya bisa menyebutkannya. */
  alertTo: string;
}

/**
 * Penerusan pertanyaan ke tim Cipansor, ketika asisten tidak bisa menjawab.
 *
 * Alurnya sengaja bertahap dan berhenti di tangan penanya pada dua titik: ia
 * harus menyatakan berkenan sebelum satu kolom pun diminta, dan harus
 * membenarkan ringkasannya sebelum apa pun dikirim. Data di sini diberikan
 * sukarela dan tersimpan 90 hari — lihat `ChatbotEscalation` di schema.prisma.
 */
export interface ChatbotEscalationRequest {
  name: string;
  email: string;
  /** Opsional: surel sudah menjadi jalur balasannya. */
  phone?: string;
  whatsapp?: string;
  question: string;
  /** Harus `true`. Waktunya dicatat server, bukan dikirim klien. */
  consent: true;
  conversationId?: string;
  turnstileToken?: string;
  /** Umpan lalat — dibiarkan kosong oleh manusia, disembunyikan lewat CSS. */
  website?: string;
}

export interface ChatbotEscalationResponse {
  /**
   * Selalu `true` bila permintaannya diterima. TIDAK berarti suratnya sudah
   * terkirim: pengirimannya terjadi sesudah jawaban ini, dan diulang penjadwal
   * bila gagal. Menjanjikan "terkirim" di sini akan menjadi janji yang tidak
   * bisa ditepati saat penyedia surel sedang mati.
   */
  accepted: boolean;
  /** Nomor rujukan singkat, supaya penanya bisa menyebutnya bila menelepon. */
  reference: string;
}
