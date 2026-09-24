import type { Locale } from "@/locales";

/**
 * Page chrome for the public pages beyond the homepage — headings, standfirsts,
 * breadcrumb labels, and the closing call to action.
 *
 * The *data* those pages render (unit descriptions, programme copy, article
 * headlines) is translated in site.i18n.ts and news.i18n.ts, so a page usually
 * needs only its own frame here.
 */
export interface PagesContent {
  programs: {
    title: string;
    /** <title> is built as `${title} — ${legalName}`; only this differs. */
    metaDescription: string;
    lead: (visi: string) => string;
    ctaHeading: string;
    ctaBody: (year: string) => string;
    ctaRegister: string;
    ctaUnits: string;
  };
  units: {
    title: string;
    metaDescription: string;
    lead: string;
    moreLink: (shortName: string) => string;
  };
  unitDetail: {
    highlightsHeading: (shortName: string) => string;
    ctaHeading: (unitName: string) => string;
    ctaBody: string;
    ctaRegister: string;
    ctaContact: string;
    otherUnitsHeading: string;
  };
  news: {
    title: string;
    metaDescription: string;
    lead: string;
    readMore: string;
    emptyState: string;
  };
  gallery: {
    title: string;
    metaDescription: string;
    lead: string;
    photoCount: (n: number) => string;
  };
  leadership: {
    title: string;
    metaDescription: string;
    lead: string;
    photoAlt: (name: string) => string;
    /** Keyed by leader slug — positions are prose and must not key anything. */
    positions: Record<string, string>;
    /**
     * Each motto is an Indonesian rendering of a hadith the leader chose.
     * Producing Arabic or English from that Indonesian would publish a
     * reconstruction as a quotation attributed to the Prophet ﷺ under a named
     * person's photograph, so the mottos stay as they are and this line says
     * why. See config/content.i18n.ts.
     */
    mottoNotTranslated: string | null;
  };
  contact: {
    title: string;
    metaDescription: string;
    lead: string;
    addressHeading: string;
    openInMaps: string;
    phoneHeading: string;
    emailHeading: string;
    whatsappHeading: string;
    whatsappCta: string;
    /** Prefilled WhatsApp message — the greeting is kept in every locale. */
    whatsappMessage: string;
  };
  article: {
    otherNewsHeading: string;
    /**
     * Shown above an article body that has no translation yet. Saying so is
     * better than letting a reader who chose English scroll into Indonesian
     * with no explanation and conclude the page is broken.
     */
    bodyNotTranslated: string | null;
  };
}

const ID: PagesContent = {
  programs: {
    title: "Program Unggulan",
    metaDescription:
      "Sepuluh program unggulan Pesantren Cipansor: tahfidz bersanad, kajian kitab kuning, kepemimpinan, bahasa Arab dan Inggris, hafalan hadits, praktik ibadah, public speaking, kewirausahaan, dan bimbingan masuk perguruan tinggi.",
    lead: (visi) =>
      `Program pembinaan yang menopang visi “${visi}” — dijalankan berdampingan dengan kurikulum nasional di seluruh unit pendidikan.`,
    ctaHeading: "Tertarik menyekolahkan putra-putri Anda?",
    ctaBody: (year) =>
      `Pendaftaran Sistem Penerimaan Murid Baru (SPMB) ${year} telah dibuka untuk seluruh unit pendidikan.`,
    ctaRegister: "Daftar SPMB",
    ctaUnits: "Lihat Unit Pendidikan",
  },
  units: {
    title: "Unit Pendidikan",
    metaDescription:
      "Lima unit pendidikan Pesantren Cipansor: TK Qur'an, SD IT, SMP IT, SMA Qur'an, dan program Takhosus tahfidz intensif.",
    lead: "Lima jenjang yang saling menyambung, sehingga santri dapat menempuh seluruh masa belajarnya dalam satu lingkungan pembinaan.",
    moreLink: (shortName) => `Selengkapnya tentang ${shortName}`,
  },
  unitDetail: {
    highlightsHeading: (shortName) => `Yang Dipelajari di ${shortName}`,
    ctaHeading: (unitName) => `Pendaftaran ${unitName}`,
    ctaBody:
      "Pendaftaran SPMB dibuka untuk seluruh unit pendidikan. Silakan mendaftar secara online atau hubungi kami untuk bertanya lebih dulu.",
    ctaRegister: "Daftar SPMB",
    ctaContact: "Hubungi Kami",
    otherUnitsHeading: "Unit lainnya",
  },
  news: {
    title: "Berita & Kegiatan",
    metaDescription:
      "Kabar terbaru dari Pesantren Cipansor: prestasi santri, kegiatan pembinaan, dan agenda unit pendidikan.",
    lead: "Catatan kegiatan, prestasi, dan pembinaan santri di seluruh unit pendidikan.",
    readMore: "Baca selengkapnya",
    emptyState: "Belum ada berita yang dipublikasikan.",
  },
  gallery: {
    title: "Galeri",
    metaDescription:
      "Dokumentasi Pesantren Cipansor: bangunan pondok, upacara dan pembiasaan disiplin santri, serta halaqah Al-Qur'an dan kegiatan keseharian.",
    lead: "Foto-foto berikut diambil di lingkungan Pesantren Cipansor — bangunan, santri, dan kegiatan kesehariannya.",
    photoCount: (n) => `${n} foto`,
  },
  leadership: {
    title: "Pimpinan Pesantren",
    metaDescription:
      "Jajaran pimpinan Yayasan Pesantren Cipansor: ketua yayasan, pimpinan pesantren, bendahara, serta kepala SD IT, SMP IT, dan SMA Qur'an.",
    lead: "Para pengasuh dan kepala unit yang memimpin penyelenggaraan pendidikan di Pesantren Cipansor.",
    photoAlt: (name) => `Foto ${name}`,
    positions: {
      "ketua-yayasan": "Ketua Yayasan",
      "pimpinan-pesantren": "Pimpinan Pesantren",
      "bendahara-yayasan": "Bendahara Yayasan",
      "kepala-sdit": "Kepala SD IT Cipansor",
      "kepala-smpit": "Kepala SMP IT Cipansor",
      "kepala-smaquran": "Kepala SMA Qur'an",
    },
    mottoNotTranslated: null,
  },
  contact: {
    title: "Hubungi Kami",
    metaDescription:
      "Alamat, telepon, email, dan WhatsApp Yayasan Pesantren Cipansor di Kecamatan Kadipaten, Kabupaten Tasikmalaya, Jawa Barat.",
    lead: "Silakan menghubungi kami untuk pertanyaan seputar pendaftaran, program pendidikan, maupun kunjungan ke pesantren.",
    addressHeading: "Alamat",
    openInMaps: "Buka di Google Maps",
    phoneHeading: "Telepon",
    emailHeading: "Email",
    whatsappHeading: "WhatsApp",
    whatsappCta: "Chat via WhatsApp",
    whatsappMessage:
      "Assalamualaikum, saya ingin bertanya tentang Pesantren Cipansor.",
  },
  article: {
    otherNewsHeading: "Berita lainnya",
    // Indonesian is the language the article was written in.
    bodyNotTranslated: null,
  },
};

const EN: PagesContent = {
  programs: {
    title: "Flagship Programmes",
    metaDescription:
      "The ten flagship programmes at Pesantren Cipansor: Qur'an memorisation with sanad, classical Islamic texts, leadership, Arabic and English, hadith memorisation, practice of worship, public speaking, entrepreneurship, and university preparation.",
    lead: (visi) =>
      `The programmes that carry the vision “${visi}” — run alongside the national curriculum across every educational unit.`,
    ctaHeading: "Considering Cipansor for your child?",
    ctaBody: (year) =>
      `Admissions for ${year} (SPMB, the new-student admission system) are open across all educational units.`,
    ctaRegister: "Register (SPMB)",
    ctaUnits: "See the educational units",
  },
  units: {
    title: "Educational Units",
    metaDescription:
      "The five educational units at Pesantren Cipansor: TK Qur'an, SD IT, SMP IT, SMA Qur'an, and the intensive Takhosus tahfidz programme.",
    lead: "Five stages that connect to one another, so a santri can spend their whole schooling in one consistent environment.",
    moreLink: (shortName) => `More about ${shortName}`,
  },
  unitDetail: {
    highlightsHeading: (shortName) => `What is studied at ${shortName}`,
    ctaHeading: (unitName) => `Applying to ${unitName}`,
    ctaBody:
      "SPMB admissions are open for every educational unit. Apply online, or contact us first if you have questions.",
    ctaRegister: "Register (SPMB)",
    ctaContact: "Contact us",
    otherUnitsHeading: "Other units",
  },
  news: {
    title: "News & Activities",
    metaDescription:
      "The latest from Pesantren Cipansor: what santri are achieving, how they are being formed, and what is coming up across the educational units.",
    lead: "A record of activities, achievements, and the formation of santri across every educational unit.",
    readMore: "Read the article",
    emptyState: "No news has been published yet.",
  },
  gallery: {
    title: "Gallery",
    metaDescription:
      "A photographic record of Pesantren Cipansor: its buildings, the assemblies that build discipline, and the Qur'an study circles of an ordinary day.",
    lead: "Every photograph below was taken at Pesantren Cipansor — its buildings, its santri, and the ordinary business of its days.",
    photoCount: (n) => (n === 1 ? "1 photograph" : `${n} photographs`),
  },
  leadership: {
    title: "Pesantren Leadership",
    metaDescription:
      "The leadership of Yayasan Pesantren Cipansor: the foundation chair, the head of the pesantren, the treasurer, and the heads of SD IT, SMP IT, and SMA Qur'an.",
    lead: "The teachers and unit heads who lead the running of education at Pesantren Cipansor.",
    photoAlt: (name) => `Portrait of ${name}`,
    positions: {
      "ketua-yayasan": "Chair of the Foundation",
      "pimpinan-pesantren": "Head of the Pesantren",
      "bendahara-yayasan": "Treasurer of the Foundation",
      "kepala-sdit": "Head of SD IT Cipansor",
      "kepala-smpit": "Head of SMP IT Cipansor",
      "kepala-smaquran": "Head of SMA Qur'an",
    },
    mottoNotTranslated:
      "Each motto below is a hadith as the leader themselves rendered it in Indonesian, and is shown in the original wording rather than translated.",
  },
  contact: {
    title: "Contact Us",
    metaDescription:
      "Address, telephone, email, and WhatsApp for Yayasan Pesantren Cipansor in Kecamatan Kadipaten, Kabupaten Tasikmalaya, West Java.",
    lead: "Please get in touch with any question about admissions, our educational programmes, or visiting the pesantren.",
    addressHeading: "Address",
    openInMaps: "Open in Google Maps",
    phoneHeading: "Telephone",
    emailHeading: "Email",
    whatsappHeading: "WhatsApp",
    whatsappCta: "Chat on WhatsApp",
    whatsappMessage:
      "Assalamualaikum, I would like to ask about Pesantren Cipansor.",
  },
  article: {
    otherNewsHeading: "Other news",
    bodyNotTranslated:
      "This article was written in Indonesian. The headline and summary are translated; the full text below is the original.",
  },
};

const AR: PagesContent = {
  programs: {
    title: "البرامج المتميّزة",
    metaDescription:
      "البرامج العشرة المتميّزة في معهد سيبانسور: تحفيظ القرآن بسندٍ متّصل، ودراسة الكتب التراثية، والقيادة، والعربية والإنجليزية، وحفظ الحديث، والتطبيق العملي للعبادات، والخطابة، وريادة الأعمال، والإعداد الجامعي.",
    lead: (visi) =>
      `البرامج التي تحمل رؤية «${visi}» — تسير جنباً إلى جنب مع المنهج الوطني في جميع الوحدات التعليمية.`,
    ctaHeading: "هل تفكّر في إلحاق أبنائك بسيبانسور؟",
    ctaBody: (year) =>
      `فُتح باب التسجيل لعام ${year} عبر نظام قبول الطلاب الجدد (SPMB) في جميع الوحدات التعليمية.`,
    ctaRegister: "التسجيل (SPMB)",
    ctaUnits: "عرض الوحدات التعليمية",
  },
  units: {
    title: "الوحدات التعليمية",
    metaDescription:
      "الوحدات التعليمية الخمس في معهد سيبانسور: روضة القرآن، والابتدائية، والإعدادية، وثانوية القرآن، وبرنامج التخصّص المكثّف في التحفيظ.",
    lead: "خمس مراحل متّصل بعضها ببعض، فيقضي الطالب مسيرته الدراسية كلها في بيئة تربوية واحدة متّسقة.",
    moreLink: (shortName) => `المزيد عن ${shortName}`,
  },
  unitDetail: {
    highlightsHeading: (shortName) => `ما يُدرَس في ${shortName}`,
    ctaHeading: (unitName) => `التسجيل في ${unitName}`,
    ctaBody:
      "باب التسجيل عبر نظام قبول الطلاب الجدد (SPMB) مفتوح لجميع الوحدات التعليمية. سجّل عبر الإنترنت، أو تواصل معنا أولاً إن كان لديك سؤال.",
    ctaRegister: "التسجيل (SPMB)",
    ctaContact: "تواصل معنا",
    otherUnitsHeading: "وحدات أخرى",
  },
  news: {
    title: "الأخبار والأنشطة",
    metaDescription:
      "آخر أخبار معهد سيبانسور: إنجازات الطلاب وأنشطة التكوين وأجندة الوحدات التعليمية.",
    lead: "تسجيلٌ للأنشطة والإنجازات وتكوين الطلاب في جميع الوحدات التعليمية.",
    readMore: "قراءة الخبر",
    emptyState: "لم يُنشر أي خبر بعد.",
  },
  gallery: {
    title: "معرض الصور",
    metaDescription:
      "توثيق مصوَّر لمعهد سيبانسور: مبانيه، وطوابير الانضباط اليومية، وحلقات القرآن في يومٍ عادي.",
    lead: "كل صورة أدناه التُقطت في معهد سيبانسور — مبانيه وطلابه وتفاصيل يومه.",
    // Arabic marks 1, 2, 3–10 and 11+ differently; the dual and the plural of
    // paucity are not optional politeness. Anything past ten takes the
    // accusative singular, which is why 11+ reads صورة and not صور.
    photoCount: (n) =>
      n === 1
        ? "صورة واحدة"
        : n === 2
          ? "صورتان"
          : n <= 10
            ? `${n} صور`
            : `${n} صورة`,
  },
  leadership: {
    title: "الهيئة القيادية للمعهد",
    metaDescription:
      "الهيئة القيادية لمؤسسة معهد سيبانسور: رئيس المؤسسة، ومدير المعهد، وأمين الصندوق، ورؤساء المرحلة الابتدائية والإعدادية وثانوية القرآن.",
    lead: "المشايخ ورؤساء الوحدات الذين يقودون العملية التعليمية في معهد سيبانسور.",
    photoAlt: (name) => `صورة ${name}`,
    positions: {
      "ketua-yayasan": "رئيس المؤسسة",
      "pimpinan-pesantren": "مدير المعهد",
      "bendahara-yayasan": "أمين صندوق المؤسسة",
      "kepala-sdit": "رئيس المرحلة الابتدائية بسيبانسور",
      "kepala-smpit": "رئيس المرحلة الإعدادية بسيبانسور",
      "kepala-smaquran": "رئيس ثانوية القرآن",
    },
    mottoNotTranslated:
      "كل حكمة أدناه حديثٌ صاغه صاحبها بالإندونيسية، وتُعرَض بلفظها الأصلي دون ترجمة.",
  },
  contact: {
    title: "تواصل معنا",
    metaDescription:
      "عنوان مؤسسة معهد سيبانسور وهاتفها وبريدها الإلكتروني وواتساب، في منطقة كاديفاتين بتاسيكمالايا، جاوة الغربية.",
    lead: "تفضّل بالتواصل معنا لأي سؤال عن التسجيل أو البرامج التعليمية أو زيارة المعهد.",
    addressHeading: "العنوان",
    openInMaps: "الفتح في خرائط جوجل",
    phoneHeading: "الهاتف",
    emailHeading: "البريد الإلكتروني",
    whatsappHeading: "واتساب",
    whatsappCta: "المحادثة عبر واتساب",
    whatsappMessage: "السلام عليكم، أودّ الاستفسار عن معهد سيبانسور.",
  },
  article: {
    otherNewsHeading: "أخبار أخرى",
    bodyNotTranslated:
      "كُتب هذا الخبر بالإندونيسية. العنوان والملخّص مترجمان، والنصّ الكامل أدناه هو الأصل.",
  },
};

const BY_LOCALE: Record<Locale, PagesContent> = { id: ID, en: EN, ar: AR };

export function pagesContentFor(locale: Locale): PagesContent {
  return BY_LOCALE[locale] ?? ID;
}
