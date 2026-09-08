/**
 * Canonical public-facing data for Yayasan Pesantren Cipansor.
 *
 * Every figure here must be verifiable against an official source. Google Ad
 * Grants suspends accounts whose site misrepresents the nonprofit, so do not
 * add enrollment counts, alumni totals, or award tallies that nobody can check.
 *
 * This lives in `@cipansor/shared` rather than `apps/web` because it now has a
 * second consumer: the API builds the public chatbot's knowledge base from it
 * (see `apps/api/src/modules/chatbot/`). Deriving the bot's facts from the same
 * constants the pages render means the two cannot drift — the alternative was a
 * hand-written knowledge base that silently goes stale the first time a phone
 * number or a programme description changes here.
 *
 * `apps/web/src/config/site.ts` re-exports every symbol, so web code keeps
 * importing `@/config/site` unchanged.
 */

export const siteConfig = {
  name: "Pesantren Cipansor",
  legalName: "Yayasan Pesantren Cipansor",
  markaz: "Markaz Annur",
  tagline: "Sekolah Islam Terpadu (IT)",
  visi: "Mencetak Generasi Qur'ani yang Cerdas dan Mandiri",
  /**
   * The four points of the yayasan's mission statement describing its
   * programmes and educational services.
   */
  misi: [
    "Menyelenggarakan pendidikan formal dan non-formal yang berkualitas berbasis nilai-nilai Islami.",
    "Membina santri agar memiliki kemampuan menghafal dan memahami Al-Qur'an dengan baik.",
    "Membangun sarana dan prasarana pendidikan yang nyaman, aman, dan mendukung tumbuh kembang anak.",
    "Menjalin kolaborasi dengan orang tua dan masyarakat dalam mewujudkan lingkungan pendidikan yang positif.",
  ],
  establishedYear: 1911,
  description:
    "Pesantren Cipansor adalah lembaga pendidikan Islam terpadu yang menyeimbangkan ilmu agama, akademik, dan teknologi. Kami berdedikasi mencetak generasi yang berakhlak mulia, berilmu, serta siap bersaing di era global.",
  url: "https://cipansor.or.id",
  contact: {
    email: "halo@cipansor.or.id",
    phone: "0811-110-400",
    // E.164 for tel: and wa.me links.
    phoneE164: "62811110400",
    whatsapp: "https://wa.me/62811110400",
    address: {
      street: "Jl. Raya Malangbong - Kadipaten RT 001 RW 001",
      village: "Kp. Nyalindung, Desa Buniasih",
      district: "Kecamatan Kadipaten",
      regency: "Kabupaten Tasikmalaya",
      province: "Jawa Barat",
      postalCode: "46157",
    },
    /**
     * The pesantren's Google Maps listing.
     *
     * Tracking parameters (`entry`, `g_ep`) are stripped — they encode the
     * session that produced the link and expire. What identifies the place is
     * the feature id `1s0x…:0x…` and the coordinates, both kept.
     */
    maps: {
      url: "https://www.google.com/maps/place/Pesantren+Cipansor/@-7.120041,108.1362663,706m/data=!3m2!1e3!4b1!4m6!3m5!1s0x2e6f4bd13990be6f:0xf031eb3bed37e742!8m2!3d-7.120041!4d108.1362663!16s%2Fg%2F11f0ksgmwv",
      latitude: -7.120041,
      longitude: 108.1362663,
    },
  },
  domains: {
    canonical: "cipansor.or.id",
  },
} as const;

export const PUBLIC_VERIFY_URL_PATH = "/public/verify-letter";

export function getPublicVerifyUrl(baseUrl?: string): string {
  const root = baseUrl || siteConfig.url;
  return `${root.replace(/\/$/, "")}${PUBLIC_VERIFY_URL_PATH}`;
}

export const addressLines = [
  siteConfig.contact.address.street,
  siteConfig.contact.address.village,
  `${siteConfig.contact.address.district}, ${siteConfig.contact.address.regency}`,
  `${siteConfig.contact.address.province} ${siteConfig.contact.address.postalCode}`,
];

/** The five formal education units, in ascending age order. */
export const educationUnits = [
  {
    slug: "tkq",
    name: "TK Qur'an",
    shortName: "TKQ",
    tagline: "Teman Bermain dan Mengaji",
    description:
      "Pendidikan anak usia dini yang memperkenalkan huruf hijaiyah, hafalan surat pendek, dan adab harian lewat bermain. Anak belajar mencintai Al-Qur'an sebelum diminta menghafalnya.",
    logo: "/images/cipansor/unit-tkq.webp",
  },
  {
    slug: "sdit",
    name: "SD IT Cipansor",
    shortName: "SDIT",
    tagline: "Berkarakter Disiplin dan Berprestasi",
    description:
      "Sekolah dasar terpadu yang menggabungkan kurikulum nasional dengan pembinaan tahfidz harian. Santri dibiasakan salat berjamaah, mandiri, dan aktif mengikuti kompetisi akademik.",
    logo: "/images/cipansor/unit-sdit.webp",
  },
  {
    slug: "smpit",
    name: "SMP IT Cipansor",
    shortName: "SMPIT",
    tagline: "Berjiwa Islami Berkarakter Tarbawi dan Mandiri",
    description:
      "Jenjang menengah pertama berasrama dengan penguatan bahasa Arab dan Inggris, kajian kitab, serta pembinaan mental melalui kegiatan kepanduan dan bela diri.",
    logo: "/images/cipansor/unit-smpit.webp",
  },
  {
    slug: "sma-quran",
    name: "SMA Qur'an",
    shortName: "SMAQURAN",
    tagline: "Membentuk Hafidz yang unggul dan berkarakter rabbani",
    description:
      "Menengah atas yang memadukan target hafalan Al-Qur'an dengan persiapan perguruan tinggi, baik dalam maupun luar negeri, serta pembinaan kepemimpinan santri.",
    logo: "/images/cipansor/unit-smaquran.webp",
  },
  {
    slug: "takhosus",
    name: "Takhosus",
    shortName: "TAKHOSUS",
    tagline: "Mencetak penghafal Qur'an bersanad dan mutqin",
    description:
      "Program khusus tahfidz intensif untuk santri yang menargetkan hafalan 30 juz bersanad dengan kualitas mutqin, disertai penguasaan ilmu tajwid dan qira'ah.",
    logo: "/images/cipansor/unit-takhosus.webp",
  },
];

/** Program unggulan as published by the pesantren. */
export const featuredPrograms = [
  {
    slug: "tahfidz-tahsin",
    title: "Tahfidz & Tahsin Qur'an",
    description:
      "Membentuk hafidz Qur'an bersanad sekaligus memiliki kemampuan tahsin Qur'an. Setoran hafalan dan perbaikan bacaan berjalan setiap hari di bawah bimbingan musyrif.",
  },
  {
    slug: "kitab-kuning",
    title: "Kajian Kitab Kuning",
    description:
      "Pembacaan dan pembahasan kitab turats klasik dalam bidang fiqih, akidah, nahwu, dan akhlak, sehingga santri terbiasa membaca sumber asli berbahasa Arab.",
  },
  {
    slug: "leadership",
    title: "Leadership (Kepemimpinan)",
    description:
      "Pembinaan karakter melalui organisasi santri, pengelolaan kegiatan asrama, dan latihan kepemimpinan Islami yang menumbuhkan tanggung jawab serta kemandirian.",
  },
  {
    slug: "bahasa",
    title: "Bahasa Arab & Bahasa Inggris",
    description:
      "Pembiasaan dua bahasa dalam percakapan harian, muhadatsah, dan muhadhoroh agar santri siap mengakses literatur keislaman maupun ilmu pengetahuan global.",
  },
  {
    slug: "hadits",
    title: "Menghafal Hadits",
    description:
      "Program hafalan hadits pilihan lengkap dengan pemahaman makna dan penerapannya, membangun sanad keilmuan santri sejak dini.",
  },
  {
    slug: "praktik-ibadah",
    title: "Praktik Ibadah",
    description:
      "Bimbingan praktik ibadah harian mulai dari thaharah, salat, hingga pengurusan jenazah, agar ilmu yang dipelajari langsung diamalkan.",
  },
  {
    slug: "public-speaking",
    title: "Public Speaking",
    description:
      "Membangun kepercayaan diri santri dalam menyampaikan ide dan dakwah secara efektif, menciptakan generasi yang cerdas berkomunikasi dan mandiri dalam berekspresi.",
  },
  {
    slug: "pembinaan-islam",
    title: "Pembinaan Islam Intensif",
    description:
      "Program pembentukan karakter dan pemahaman Islam yang mendalam untuk memastikan santri tumbuh menjadi pribadi yang teguh memegang nilai-nilai Qur'ani dalam setiap aspek kehidupan.",
  },
  {
    slug: "entrepreneurship",
    title: "Entrepreneurship",
    description:
      "Menanamkan jiwa kewirausahaan sejak dini untuk membentuk santri yang kreatif, inovatif, dan mandiri secara ekonomi di masa depan.",
  },
  {
    slug: "bimbel-xii",
    title: "Bimbingan Belajar Kelas XII",
    description:
      "Dukungan akademik strategis bagi santri kelas XII dalam mempersiapkan diri menempuh seleksi masuk perguruan tinggi, di dalam maupun luar negeri.",
  },
];

/**
 * Articles live in `config/content.ts`, which holds the same fields plus the
 * body. A second copy here meant the homepage teaser and the /berita page could
 * drift apart — different excerpt, different date, same slug.
 */

/**
 * Donation details, as published on the pesantren's own wakaf-infaq page.
 * Treat these as financial data: never substitute placeholder digits here. A
 * wrong account number sends real donations to a stranger.
 */
export const donationConfig = {
  /** Framing taken from the yayasan's own "Investasi Akhirat" campaign. */
  headline: "Investasi Akhirat",
  subheadline: "Program Donasi Pesantren Cipansor",
  lead: "Setiap rupiah yang Anda infakkan adalah benih kebaikan yang akan terus bertumbuh dan mengalirkan pahala jariyah melalui lantunan ayat suci para santri.",
  programsIntro:
    "Kami menyediakan tiga kanal utama bagi Anda untuk menanam amal di Pesantren Cipansor:",
  hadith: {
    text: "Siapa yang membangun masjid (atau sarana pendidikan) karena Allah, maka Allah akan membangunkan untuknya rumah di surga.",
    source: "HR. Muslim",
  },
  commitment: {
    title: "Komitmen Amanah Kami",
    text: "Kami menjamin setiap rupiah yang Anda titipkan akan dikelola secara transparan dan disalurkan 100% sesuai dengan akad program yang Anda pilih. Laporan penyaluran dana akan diperbarui secara berkala sebagai bentuk pertanggungjawaban kami kepada umat dan Allah SWT.",
  },
  bank: {
    name: "Bank Syariah Indonesia (BSI)",
    accountNumber: "7169094734",
    accountHolder: "Yayasan Pesantren Cipansor",
  },
  /** Transfer proof goes to a dedicated confirmation line, not the main one. */
  confirmation: {
    whatsappNumber: "085320174340",
    whatsappE164: "6285320174340",
    // The published poster writes the format as "Nama_Program
    // Donasi_Nominal_Nama" — four fields — but its own example has three
    // (program, nominal, donor). Donors copy the example, not the spec, so the
    // format shown here follows the example. Worth correcting on the poster too.
    format: "Program Donasi_Nominal_Nama",
    example: "Wakaf Sarana Pendidikan_100jt_Bahrul",
  },
  /**
   * The three channels the yayasan publishes. `type` maps each to the akad the
   * donation form records, so "Pilih Program" in the instructions is something
   * a donor can actually click rather than a heading to read past.
   */
  programs: [
    {
      title: "Wakaf Sarana Pendidikan",
      type: "WAKAF",
      description:
        "Dana akan dialokasikan sepenuhnya untuk pembangunan dan pengembangan ruang kelas baru bagi jenjang SD IT, SMP IT, dan SMA Qur'an demi kenyamanan belajar para santri.",
    },
    {
      title: "Beasiswa Santri Takhosus",
      type: "BEASISWA",
      description:
        "Dukungan biaya operasional khusus bagi para penghafal Al-Qur'an 30 juz agar mereka dapat fokus belajar tanpa terkendala biaya pendidikan.",
    },
    {
      title: "Infaq Operasional Pesantren",
      type: "INFAK",
      description:
        "Dukungan dana untuk kelancaran kegiatan belajar-mengajar harian serta pemeliharaan fasilitas pesantren setiap harinya.",
    },
  ],
  /**
   * The three steps as published on the yayasan's donation poster.
   *
   * The poster describes the manual route only — it was written for a static
   * site. This page also has an online form, so the steps now say which route
   * they belong to instead of leaving a donor to guess why the page offers a
   * "Donasi Sekarang" button that the instructions never mention.
   */
  steps: [
    {
      title: "Pilih Program",
      description:
        "Tentukan program donasi yang ingin Anda dukung: Wakaf Sarana Pendidikan, Beasiswa Santri Takhosus, atau Infaq Operasional — lalu tekan “Pilih Program Ini”.",
    },
    {
      title: "Transfer Dana",
      description:
        "Kirimkan donasi Anda melalui rekening resmi yayasan yang tercantum di atas.",
    },
    {
      title: "Konfirmasi",
      description:
        "Kirimkan foto bukti transfer melalui WhatsApp Admin kami dengan format yang ditentukan, agar donasi Anda tercatat pada program yang benar.",
    },
  ],
} as const;

/**
 * The 560px-wide derivative of a gallery photograph.
 *
 * Shipped as a real file rather than left to `next/image`, because in
 * production the optimiser does nothing: the runner is Alpine, the bundled
 * sharp binary is a glibc build, and `require("sharp")` fails there — so Next
 * falls back to serving the source bytes unchanged at every requested width
 * (`/_next/image?w=256` returns the full file, `X-Nextjs-Cache: HIT`). Until
 * that is fixed, an explicit thumbnail is the difference between a gallery
 * page that costs 480 KB and one that costs 2.3 MB.
 */
export function galleryThumb(src: string): string {
  return src.replace("/images/galeri/", "/images/galeri/thumb/");
}

export interface GalleryPhoto {
  /** File under `apps/web/public/images/galeri/`. */
  src: string;
  /**
   * What this photograph shows, in Indonesian.
   *
   * Alt text describes the picture, not the album. Every one of these images
   * arrived from the pesantren's own site carrying `alt="Pesantren Cipansor"`,
   * which tells a screen-reader user nothing and repeats itself eighteen times.
   * Translations are in `site.i18n.ts` under `galleryAlts`, positionally keyed
   * to this array.
   */
  alt: string;
}

/**
 * The pesantren's own photographic record, in the three albums it publishes.
 *
 * These are original photographs of this institution — its buildings, its
 * santri, its teachers — not licensed stock. That distinction is the reason
 * the album exists here at all: Google for Nonprofits declined the domain in
 * August 2026 for a site that "relies on generic stock images", and a
 * programme that verifies charities by looking at their website needs to find
 * the charity when it looks. Replacing any of these with a purchased photo of
 * somebody else's school would undo that, however much better it composed.
 */
export const galleryItems: {
  slug: string;
  title: string;
  /** Album cover — always the first photograph, never a separate file. */
  image: string;
  photos: GalleryPhoto[];
}[] = [
  {
    slug: "fasilitas",
    title: "Kilas Balik & Dokumentasi Fasilitas Pondok",
    image: "/images/galeri/fasilitas-1.webp",
    photos: [
      {
        src: "/images/galeri/fasilitas-1.webp",
        alt: "Gedung dua lantai beratap merah dilihat dari udara, dengan halaman berpaving dan talud batu bertingkat di belakangnya",
      },
      {
        src: "/images/galeri/fasilitas-2.webp",
        alt: "Deretan ruang kelas beratap genting dengan koridor terbuka menghadap halaman upacara",
      },
      {
        src: "/images/galeri/fasilitas-3.webp",
        alt: "Gedung satu lantai dengan tangga masuk lebar, tampak dari udara",
      },
      {
        src: "/images/galeri/fasilitas-4.webp",
        alt: "Gedung bertingkat dua dengan deretan jendela, dilihat dari halaman tanah",
      },
      {
        src: "/images/galeri/fasilitas-5.webp",
        alt: "Fasad Gedung Asrama Putra KH. Ali dengan gerbang berornamen geometris",
      },
      {
        src: "/images/galeri/fasilitas-6.webp",
        alt: "Bangunan satu lantai dengan deretan pintu rolling door dan koridor di sampingnya",
      },
    ],
  },
  {
    slug: "disiplin",
    title: "Membangun Budaya Disiplin Sejak Dini",
    image: "/images/galeri/disiplin-1.webp",
    photos: [
      {
        src: "/images/galeri/disiplin-1.webp",
        alt: "Barisan santri SD berseragam merah putih saat upacara di lapangan pesantren",
      },
      {
        src: "/images/galeri/disiplin-2.webp",
        alt: "Ratusan santri SD berbaris rapi mengikuti upacara bendera",
      },
      {
        src: "/images/galeri/disiplin-3.webp",
        alt: "Santri SD meluruskan barisan dengan aba-aba lencang depan",
      },
      {
        src: "/images/galeri/disiplin-4.webp",
        alt: "Barisan santri SMP berseragam putih biru dengan peci hitam",
      },
      {
        src: "/images/galeri/disiplin-5.webp",
        alt: "Upacara jenjang menengah dengan asatidz mendampingi di sisi lapangan",
      },
      {
        src: "/images/galeri/disiplin-6.webp",
        alt: "Empat asatidz berdiri mengikuti jalannya upacara di depan dinding batu",
      },
      {
        src: "/images/galeri/disiplin-7.webp",
        alt: "Asatidz memberi hormat saat pengibaran bendera",
      },
    ],
  },
  {
    slug: "karakter",
    title: "Pembinaan Spiritual & Karakter Rabbani",
    image: "/images/galeri/karakter-1.webp",
    photos: [
      {
        src: "/images/galeri/karakter-1.webp",
        alt: "Santri melaksanakan salat berjamaah di dalam masjid pesantren",
      },
      {
        src: "/images/galeri/karakter-2.webp",
        alt: "Halaqah Al-Qur'an di saung kayu bersama ustadz",
      },
      {
        src: "/images/galeri/karakter-3.webp",
        alt: "Santri duduk melingkar membaca kitab dipimpin seorang pengajar",
      },
      {
        src: "/images/galeri/karakter-4.webp",
        alt: "Halaqah membaca kitab di ruang asrama, tempat tidur bertingkat tampak di belakang",
      },
      {
        src: "/images/galeri/karakter-5.webp",
        alt: "Santri berbaris di koridor sambil membawa kitab",
      },
    ],
  },
];
