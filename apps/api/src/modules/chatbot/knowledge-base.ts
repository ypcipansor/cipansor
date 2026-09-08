/**
 * The public chatbot's knowledge base.
 *
 * Every entry is DERIVED from the same constants the public pages render
 * (`@cipansor/shared` → `public-site.ts`). Nothing here is hand-transcribed,
 * which is the point: a hand-written knowledge base goes stale the first time
 * someone edits a phone number or a programme description, and nothing warns
 * you. The bot and the website are incapable of disagreeing.
 *
 * What must NOT live here: anything that changes on its own schedule. Admission
 * dates and fees are the obvious case — they belong to an admission period row
 * that opens and closes, so the bot reads them live (see `live-facts.ts`).
 * Baking them into a static corpus is how a bot ends up quoting last year's fee
 * to a family that is deciding this year.
 */

import {
  siteConfig,
  addressLines,
  educationUnits,
  featuredPrograms,
  donationConfig,
} from '@cipansor/shared';

export interface KnowledgeEntry {
  id: string;
  title: string;
  /** Public path a visitor can open to read the same thing. */
  url?: string;
  /** Plain prose. The retriever indexes this; the model is shown it verbatim. */
  text: string;
  /**
   * Extra words indexed for retrieval but NEVER shown to the model.
   *
   * Two real failures motivated this, both caught by the eval set and both
   * cases of the corpus and the visitor using different words for one thing:
   *
   *   - "Saya dari luar kota. Pesantrennya di mana?" did not retrieve the
   *     contact entry, because that entry says "Alamat" and the question says
   *     "di mana" and "kota". The model then correctly said it had no address —
   *     honest, and useless.
   *   - "How can I donate?" retrieved almost nothing, because an English
   *     question shares no stems with an Indonesian corpus.
   *
   * Aliases are the cheapest fix that does not distort what the model reads:
   * they widen recall while the answer still quotes `text` alone. Keep them to
   * genuine synonyms and translations — an alias that is not really about this
   * entry drags it into unrelated questions.
   */
  aliases?: string[];
}

const { contact } = siteConfig;

/**
 * Built once at module load. The corpus is a few dozen entries derived from
 * constants — there is nothing to invalidate and no I/O to repeat.
 */
const baseEntries: KnowledgeEntry[] = [
  {
    id: 'profil-umum',
    title: `Tentang ${siteConfig.legalName}`,
    url: '/profil',
    text: [
      `${siteConfig.legalName} (${siteConfig.markaz}) adalah ${siteConfig.tagline} yang berdiri sejak tahun ${siteConfig.establishedYear}.`,
      `Visi pesantren: "${siteConfig.visi}".`,
      // The aliases below have always listed "mission", so a visitor asking
      // about the misi was routed here — to an entry that only carried the
      // visi. The bot could either answer the wrong question or invent one.
      `Misi pesantren: ${siteConfig.misi.map((m, i) => `(${i + 1}) ${m}`).join(' ')}`,
      siteConfig.description,
    ].join(' '),
    aliases: ['about profile history founded established vision mission school islamic boarding'],
  },
  {
    id: 'kontak',
    title: 'Kontak dan alamat',
    url: '/kontak',
    text: [
      `Alamat ${siteConfig.name}: ${addressLines.join(', ')}.`,
      `Telepon: ${contact.phone}. WhatsApp: ${contact.whatsapp}.`,
      `Email: ${contact.email}.`,
      `Lokasi di Google Maps: ${contact.maps.url}`,
    ].join(' '),
    aliases: [
      'lokasi tempat posisi berada mana dimana kota daerah wilayah peta arah menuju datang berkunjung',
      'address location where city map directions visit contact phone email reach us',
    ],
  },
  {
    id: 'unit-ikhtisar',
    title: 'Unit pendidikan',
    url: '/unit',
    text: [
      `${siteConfig.name} memiliki ${educationUnits.length} unit pendidikan:`,
      educationUnits.map((u) => u.name).join(', ') + '.',
      'Setiap unit memiliki halaman tersendiri dengan penjelasan lengkap.',
    ].join(' '),
    aliases: ['jenjang tingkat sekolah education units levels grades school stages'],
  },

  // One entry per unit. Splitting them keeps retrieval precise: a question
  // about SMP IT should surface the SMP IT entry, not a paragraph in which it
  // is one name among five.
  ...educationUnits.map((unit) => ({
    id: `unit-${unit.slug}`,
    title: unit.name,
    url: `/unit/${unit.slug}`,
    text: `${unit.name} (${unit.shortName}) — ${unit.tagline}. ${unit.description}`,
  })),

  {
    id: 'program-ikhtisar',
    title: 'Program unggulan',
    url: '/program-unggulan',
    text: [
      `${siteConfig.name} menyelenggarakan ${featuredPrograms.length} program unggulan:`,
      featuredPrograms.map((p) => p.title).join(', ') + '.',
    ].join(' '),
  },
  ...featuredPrograms.map((program) => ({
    id: `program-${program.slug}`,
    title: program.title,
    url: '/program-unggulan',
    text: `${program.title}. ${program.description}`,
  })),

  {
    id: 'donasi-ikhtisar',
    title: `${donationConfig.headline} — donasi, wakaf dan infaq`,
    url: '/wakaf-infaq',
    text: [
      `${donationConfig.subheadline}. ${donationConfig.lead}`,
      donationConfig.programsIntro,
      donationConfig.programs.map((p) => `${p.title}: ${p.description}`).join(' '),
      donationConfig.commitment.text,
    ].join(' '),
    aliases: ['donate donation charity endowment give giving support contribute sedekah sumbangan'],
  },
  {
    id: 'donasi-rekening',
    title: 'Rekening donasi resmi dan cara konfirmasi',
    url: '/wakaf-infaq',
    text: [
      `Donasi disalurkan melalui rekening resmi ${donationConfig.bank.name}`,
      `nomor ${donationConfig.bank.accountNumber} atas nama ${donationConfig.bank.accountHolder}.`,
      `Setelah transfer, kirim bukti melalui WhatsApp ke ${donationConfig.confirmation.whatsappNumber}`,
      `dengan format "${donationConfig.confirmation.format}", contoh: "${donationConfig.confirmation.example}".`,
      donationConfig.steps.map((s) => `${s.title}: ${s.description}`).join(' '),
    ].join(' '),
    aliases: [
      'norek nomor rekening bank transfer setor kirim uang konfirmasi bukti',
      'bank account number transfer donate donation payment how to give send money',
    ],
  },
  {
    id: 'spmb-cara-daftar',
    title: 'Cara mendaftar (SPMB)',
    url: '/public/spmb',
    text: [
      'Pendaftaran santri baru (SPMB) dilakukan secara online melalui halaman /public/spmb.',
      "Formulir diisi bertahap: data calon santri, data orang tua, alamat, kemampuan Qur'an, dokumen, lalu konfirmasi.",
      'Setelah mengirim formulir, simpan nomor pendaftaran untuk memantau hasil seleksi melalui tab "Cek Status" di halaman yang sama.',
      `Pertanyaan seputar pendaftaran dapat disampaikan ke ${contact.phone} atau WhatsApp ${contact.whatsapp}.`,
    ].join(' '),
    aliases: [
      'masuk mendaftarkan anak putra putri calon murid siswa baru online formulir langkah cara prosedur',
      'register registration admission enroll apply how to sign up new student',
    ],
  },
];

/**
 * Entri "hub" yang menjadi label topik ketika asisten harus menyebutkan apa
 * saja yang bisa ia jawab.
 *
 * Dipilih, bukan seluruh korpus: korpusnya memuat satu entri per unit dan satu
 * per program, sehingga daftar lengkapnya panjang dan justru sulit dibaca.
 * Yang disebut adalah kepalanya. Idnya dijaga uji — menghapus salah satu entri
 * ini memerahkan suite alih-alih diam-diam memendekkan rambu petunjuknya.
 */
export const TOPIC_HUB_IDS = [
  'profil-umum',
  'unit-ikhtisar',
  'program-ikhtisar',
  'spmb-cara-daftar',
  'donasi-ikhtisar',
  'kontak',
] as const;

/** Judul entri hub, urut seperti TOPIC_HUB_IDS, untuk dirangkai jadi kalimat. */
export function topicLabels(): string[] {
  return TOPIC_HUB_IDS.map((id) => baseEntries.find((e) => e.id === id)?.title).filter(
    (title): title is string => Boolean(title)
  );
}

/**
 * Daftar isi korpus — dibangun DARI korpus, bukan ditulis tangan.
 *
 * Pertanyaan paling wajar yang bisa diajukan orang kepada sebuah asisten
 * ("kamu bisa bantu apa?", "ada informasi apa saja?") justru yang paling pasti
 * gagal sebelum entri ini ada: kata-kata seperti `ada`, `apa` dan `saja` adalah
 * kata henti, sehingga yang tersisa dari "ada informasi apa saja" hanyalah
 * satu kata — "informasi" — dan tidak ada satu pun entri yang membahasnya.
 * Nol potongan terambil, dan asisten jatuh ke penolakan tanpa pernah menyentuh
 * model. Dilaporkan pengguna 2026-09-04, dengan tangkapan layarnya.
 *
 * Dibangun dari `baseEntries` supaya ia tidak bisa berbohong: entri yang
 * ditambah atau dihapus mengubah daftar ini pada saat yang sama.
 */
const indexEntry: KnowledgeEntry = {
  id: 'bantuan-ikhtisar',
  title: 'Informasi yang tersedia di asisten ini',
  text: [
    `Asisten ini memberikan informasi umum tentang ${siteConfig.name}.`,
    `Informasi yang tersedia meliputi: ${topicLabels().join(', ')}.`,
    'Tersedia pula informasi pendaftaran santri baru (SPMB) yang terkini:',
    'apakah pendaftaran sedang dibuka, biaya pendaftarannya, dan tanggal penutupannya.',
    `Untuk hal di luar itu, informasi dapat diminta langsung ke ${contact.phone} atau WhatsApp ${contact.whatsapp}.`,
  ].join(' '),
  aliases: [
    'informasi apa saja bisa ditanyakan bantuan bantu topik cakupan layanan daftar isi menu pilihan kemampuan',
    'what can you do help topics information available overview index capabilities ask about',
  ],
};

export const knowledgeBase: KnowledgeEntry[] = [...baseEntries, indexEntry];

/** Lookup used by the service to attach source metadata to an answer. */
export const knowledgeById = new Map(knowledgeBase.map((e) => [e.id, e]));
