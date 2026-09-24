import type { Locale } from "@/locales";
import {
  siteConfig,
  educationUnits,
  featuredPrograms,
  galleryItems,
} from "./site";
import { unitDetails } from "./content";

/**
 * English and Arabic renderings of the canonical site data in site.ts.
 *
 * This is a plain function of the locale — no hooks, no `next/headers` — so the
 * same strings serve server components (which resolve the locale with
 * `getServerLocale()`) and client ones (which take it from `useI18n()`). The
 * footer needs exactly that: it is rendered both inside the server-rendered
 * public pages and inside the client-side SPMB form.
 *
 * Indonesian is not duplicated here; it is read back out of site.ts so the
 * source of record cannot fork.
 *
 * Keyed by `slug`, not by the Indonesian title. Keying content by prose is how
 * the programme icon map silently lost four of its ten icons: the list grew,
 * the titles did not match, and nothing failed.
 *
 * NOT translated, deliberately (same reasoning as content.i18n.ts): the unit
 * names (TK Qur'an, SD IT Cipansor, …) are the units' registered names, and the
 * domain vocabulary — pesantren, santri, tahfidz, tahsin, musyrif, kitab
 * kuning, SPMB — is glossed on first use instead, because the portal behind the
 * login uses these words throughout.
 */

type BySlug<T> = Record<string, T>;

export interface SiteText {
  tagline: string;
  description: string;
  visi: string;
  /**
   * `tagline` and `description` are the one-liners the homepage cards show;
   * `level`, `intro` and `highlights` are the longer copy on /unit and
   * /unit/[slug], which lives in content.ts under `unitDetails`.
   */
  units: BySlug<{
    tagline: string;
    description: string;
    level: string;
    intro: string;
    highlights: string[];
  }>;
  programs: BySlug<{ title: string; description: string }>;
  gallery: BySlug<string>;
  /**
   * Alt text for each photograph, positionally keyed to `galleryItems[].photos`.
   *
   * Kept separate from `gallery` (which holds album titles) so the album
   * heading and the description of one picture inside it cannot be confused
   * for each other. A guard in gallery.test.ts fails the build if any locale's
   * array drifts out of length with the photographs it describes — a short
   * array would silently leave later images with no alt at all.
   */
  galleryAlts: BySlug<string[]>;
}

const EN: SiteText = {
  tagline: "Integrated Islamic School",
  description:
    "Pesantren Cipansor is an integrated Islamic school that holds religious learning, academic study, and technology in balance. We are dedicated to raising a generation of good character and sound knowledge, ready to hold their own in a global age.",
  visi: "Raising a Qur'anic generation that is both capable and self-reliant",
  units: {
    tkq: {
      tagline: "A place to play and to learn the Qur'an",
      description:
        "Early-years education that introduces the Arabic letters, the short chapters, and everyday manners through play. Children learn to love the Qur'an before they are ever asked to memorise it.",
      level: "Early Years",
      intro:
        "TK Qur'an Cipansor introduces children to the Qur'an in the way that best suits their age: through play, song, and imitation. The aim is not to chase a number of chapters memorised, but to grow a love of the Qur'an from the very start.",
      highlights: [
        "The Arabic letters and graded iqra reading",
        "Short chapters memorised through daily repetition",
        "Manners: greeting, the daily supplications, and looking after oneself",
        "Learning through play, storytelling, and movement",
      ],
    },
    sdit: {
      tagline: "Disciplined in character, strong in achievement",
      description:
        "An integrated primary school that combines the national curriculum with daily Qur'an memorisation. Pupils grow used to praying in congregation, looking after themselves, and competing in academic olympiads.",
      level: "Primary School",
      intro:
        "SD IT Cipansor teaches the national curriculum in full and combines it with daily Qur'an memorisation. Pupils grow used to praying in congregation, to discipline, and to taking part in academic and religious competitions.",
      highlights: [
        "The national curriculum combined with daily tahfidz",
        "Congregational prayer and everyday manners as habit",
        "Preparation for the science olympiad and Pentas PAI",
        "Literacy and numeracy strengthened from the first year",
      ],
    },
    smpit: {
      tagline: "Islamic in spirit, formed by tarbiyah, self-reliant",
      description:
        "Boarding lower-secondary years with strengthened Arabic and English, study of the classical texts, and character formation through scouting and martial arts.",
      level: "Lower Secondary School",
      intro:
        "SMP IT Cipansor is a boarding lower-secondary school that holds academic attainment, character formation, and Qur'anic values in balance, to raise a generation Islamic in spirit, formed by tarbiyah, and able to stand on its own.",
      highlights: [
        "Arabic and English strengthened through daily conversation",
        "Study of the classical texts as a grounding in the sharia",
        "Scouting, martial arts, and student leadership",
        "Boarding life that teaches self-reliance",
      ],
    },
    "sma-quran": {
      tagline: "Forming hafidz of excellence and rabbani character",
      description:
        "Upper-secondary years that pair Qur'an memorisation targets with preparation for university, at home and abroad, alongside leadership formation.",
      level: "Upper Secondary School",
      intro:
        "SMA Qur'an pairs Qur'an memorisation targets with preparation for university, in Indonesia and abroad, while forming santri who are ready to lead.",
      highlights: [
        "Qur'an memorisation targets alongside the upper-secondary curriculum",
        "Dedicated Year 12 preparation for university selection",
        "Leadership and public speaking",
        "Guidance on careers and further study",
      ],
    },
    takhosus: {
      tagline: "Producing memorisers of the Qur'an with sanad and mastery",
      description:
        "An intensive tahfidz track for santri aiming to memorise all 30 juz with an unbroken chain of transmission (sanad) and mutqin-level accuracy, together with command of tajwid and qira'ah.",
      level: "Specialist Tahfidz Programme",
      intro:
        "Takhosus is an intensive tahfidz programme for santri aiming to memorise all 30 juz with an unbroken chain of transmission and mutqin-level accuracy, together with command of tajwid and qira'ah.",
      highlights: [
        "All 30 juz memorised with sanad and mutqin accuracy",
        "Tajwid and qira'ah strengthened",
        "Daily halaqoh and scheduled muroja'ah revision",
        "Scholarships available through the Takhosus Santri Scholarship",
      ],
    },
  },
  programs: {
    "tahfidz-tahsin": {
      title: "Qur'an Memorisation & Recitation",
      description:
        "Forming memorisers of the Qur'an with an unbroken chain of transmission who also recite it well. Memorisation is heard and pronunciation corrected every day under a musyrif (resident mentor).",
    },
    "kitab-kuning": {
      title: "Classical Islamic Texts",
      description:
        "Reading and discussion of the classical turats works in jurisprudence, creed, Arabic grammar, and ethics, so that santri become at home with primary sources in Arabic.",
    },
    leadership: {
      title: "Leadership",
      description:
        "Character formation through the student organisation, running dormitory life, and Islamic leadership training that builds responsibility and independence.",
    },
    bahasa: {
      title: "Arabic & English",
      description:
        "Both languages in daily use — conversation, muhadatsah, and public address — so santri can reach Islamic scholarship and global knowledge alike.",
    },
    hadits: {
      title: "Hadith Memorisation",
      description:
        "Memorisation of selected hadith together with their meaning and application, building the santri's chain of learning from an early age.",
    },
    "praktik-ibadah": {
      title: "Practice of Worship",
      description:
        "Guided daily practice from purification and prayer through to funeral rites, so that what is studied is put straight into practice.",
    },
    "public-speaking": {
      title: "Public Speaking",
      description:
        "Building the confidence to put an idea across and to give dakwah effectively, producing a generation that communicates clearly and expresses itself with confidence.",
    },
    "pembinaan-islam": {
      title: "Intensive Islamic Formation",
      description:
        "Character formation and deep understanding of Islam, so that santri grow into people who hold to Qur'anic values in every part of life.",
    },
    entrepreneurship: {
      title: "Entrepreneurship",
      description:
        "Instilling enterprise early, forming santri who are creative, inventive, and able to stand on their own feet economically.",
    },
    "bimbel-xii": {
      title: "Year 12 University Preparation",
      description:
        "Focused academic support for Year 12 santri preparing for university entrance selection, in Indonesia and abroad.",
    },
  },
  gallery: {
    fasilitas: "A look back, and a record of the pesantren's facilities",
    disiplin: "Building a culture of discipline from the start",
    karakter: "Spiritual formation and rabbani character",
  },
  galleryAlts: {
    fasilitas: [
      "Aerial view of a two-storey building with a red roof, a paved forecourt and terraced stone retaining walls behind it",
      "A row of tile-roofed classrooms with an open walkway facing the assembly yard",
      "Aerial view of a single-storey building with a wide entrance staircase",
      "A two-storey building with rows of windows, seen from the bare earth yard",
      "The facade of the KH. Ali boys' dormitory, with its geometric ornamented gateway",
      "A single-storey building with a row of roller shutters and a walkway alongside",
    ],
    disiplin: [
      "Primary-school santri in red-and-white uniform lined up for assembly in the pesantren yard",
      "Hundreds of primary-school santri standing in formation for the flag ceremony",
      "Primary-school santri dressing their ranks on the command to align",
      "Junior-secondary santri in white and navy uniform wearing black songkok",
      "A secondary-level assembly, with teachers standing along the edge of the yard",
      "Four teachers standing at attention in front of a stone wall during the ceremony",
      "Teachers saluting as the flag is raised",
    ],
    karakter: [
      "Santri praying together inside the pesantren mosque",
      "A Qur'an study circle in the open wooden pavilion, led by an ustadz",
      "Santri seated in a circle reading kitab under a teacher's guidance",
      "A kitab study circle in the dormitory, bunk beds visible behind",
      "Santri lined up along a corridor carrying their kitab",
    ],
  },
};

const AR: SiteText = {
  tagline: "مدرسة إسلامية متكاملة",
  description:
    "معهد سيبانسور مؤسسة تعليمية إسلامية متكاملة توازن بين العلوم الشرعية والدراسة الأكاديمية والتقنية. نحن ملتزمون بإعداد جيل حسن الخلق راسخ العلم، مستعدّ لمنافسة أقرانه في عصرٍ مفتوح على العالم.",
  visi: "إعداد جيل قرآني ذكيّ ومعتمد على نفسه",
  units: {
    tkq: {
      tagline: "رفيق اللعب وحلقة القرآن",
      description:
        "تعليم الطفولة المبكرة يعرّف الطفل بالحروف الهجائية وقصار السور وآداب اليوم من خلال اللعب. يتعلّم الطفل حبّ القرآن قبل أن يُطلب منه حفظه.",
      level: "مرحلة الطفولة المبكرة",
      intro:
        "تُعرّف روضة القرآن بسيبانسور الطفلَ بالقرآن بالأسلوب الأنسب لسنّه: اللعب والإنشاد والمحاكاة. والغاية ليست ملاحقة عدد المحفوظ، بل غرس محبّة القرآن منذ البداية.",
      highlights: [
        "التعريف بالحروف الهجائية والقراءة المتدرّجة في الإقراء",
        "حفظ قصار السور بالتكرار اليومي",
        "الآداب: السلام وأذكار اليوم والاعتماد على النفس",
        "التعلّم باللعب والقَصص والأنشطة الحركية",
      ],
    },
    sdit: {
      tagline: "خلقٌ منضبط وتحصيلٌ متميّز",
      description:
        "مدرسة ابتدائية متكاملة تجمع المنهج الوطني إلى تحفيظ يومي للقرآن. يعتاد الطلاب صلاة الجماعة والاعتماد على النفس والمشاركة في المسابقات العلمية.",
      level: "المرحلة الابتدائية",
      intro:
        "تُدرّس ابتدائية سيبانسور المنهجَ الوطني كاملاً وتجمعه إلى تحفيظ يومي للقرآن. يعتاد الطلاب صلاة الجماعة والانضباط والمشاركة في المسابقات العلمية والدينية.",
      highlights: [
        "المنهج الوطني مقروناً بالتحفيظ اليومي",
        "صلاة الجماعة وآداب اليوم عادةً راسخة",
        "الإعداد لأولمبياد العلوم ومسابقة «بنتاس PAI»",
        "تقوية القراءة والحساب منذ الصفوف الأولى",
      ],
    },
    smpit: {
      tagline: "روحٌ إسلامية وخُلقٌ تربويّ واعتمادٌ على النفس",
      description:
        "مرحلة إعدادية داخلية مع تقوية اللغتين العربية والإنجليزية، ودراسة الكتب التراثية، وبناء الشخصية عبر الكشافة والدفاع عن النفس.",
      level: "المرحلة الإعدادية",
      intro:
        "إعدادية سيبانسور مدرسة داخلية توازن بين التحصيل الأكاديمي وبناء الشخصية والقيم القرآنية، لتخريج جيلٍ ذي روحٍ إسلامية وخُلقٍ تربويّ واعتمادٍ على النفس.",
      highlights: [
        "تقوية العربية والإنجليزية عبر المحادثة اليومية",
        "دراسة الكتب التراثية أساساً لفهم الشريعة",
        "الكشافة والدفاع عن النفس وقيادة الطلاب",
        "حياة داخلية تُعوّد على الاستقلال",
      ],
    },
    "sma-quran": {
      tagline: "تكوين حفّاظٍ متميّزين بأخلاق ربّانية",
      description:
        "مرحلة ثانوية تجمع بين أهداف حفظ القرآن والإعداد للجامعة داخل البلاد وخارجها، مع تنمية مهارات القيادة لدى الطلاب.",
      level: "المرحلة الثانوية",
      intro:
        "تجمع ثانوية القرآن بين أهداف حفظ القرآن والإعداد للجامعة داخل إندونيسيا وخارجها، مع تهيئة الطالب لتحمّل القيادة.",
      highlights: [
        "أهداف حفظ القرآن إلى جانب منهج المرحلة الثانوية",
        "إعداد خاص لطلاب الصف الثاني عشر لاختبارات القبول الجامعي",
        "تنمية القيادة ومهارات الخطابة",
        "إرشاد مهنيّ ودراسي لما بعد الثانوية",
      ],
    },
    takhosus: {
      tagline: "تخريج حفّاظٍ بسندٍ متّصل وإتقان",
      description:
        "برنامج تحفيظ مكثّف لمن يستهدف حفظ الثلاثين جزءاً بسندٍ متّصل وإتقانٍ راسخ، مع التمكّن من علم التجويد والقراءات.",
      level: "برنامج التخصّص في التحفيظ",
      intro:
        "التخصّص برنامج تحفيظ مكثّف لمن يستهدف حفظ الثلاثين جزءاً بسندٍ متّصل وإتقانٍ راسخ، مع التمكّن من علم التجويد والقراءات.",
      highlights: [
        "حفظ الثلاثين جزءاً بسندٍ متّصل وإتقانٍ راسخ",
        "تقوية علم التجويد والقراءات",
        "حلقة يومية ومراجعة مجدولة",
        "منح دراسية متاحة عبر برنامج منحة طلاب التخصّص",
      ],
    },
  },
  programs: {
    "tahfidz-tahsin": {
      title: "تحفيظ القرآن وتحسين التلاوة",
      description:
        "تكوين حافظٍ للقرآن بسندٍ متّصل يُحسن تلاوته كذلك. يجري تسميع الحفظ وتصحيح القراءة كل يوم تحت إشراف المشرف (المُشرِف المقيم).",
    },
    "kitab-kuning": {
      title: "دراسة الكتب التراثية",
      description:
        "قراءة كتب التراث ومدارستها في الفقه والعقيدة والنحو والأخلاق، حتى يألف الطالب قراءة المصادر الأصلية بالعربية.",
    },
    leadership: {
      title: "القيادة",
      description:
        "بناء الشخصية عبر منظمة الطلاب وإدارة شؤون السكن والتدريب على القيادة الإسلامية بما يغرس المسؤولية والاستقلال.",
    },
    bahasa: {
      title: "اللغة العربية والإنجليزية",
      description:
        "استعمال اللغتين في الحديث اليومي والمحادثة والمحاضرة، ليتمكّن الطالب من الوصول إلى العلوم الشرعية والمعارف العالمية معاً.",
    },
    hadits: {
      title: "حفظ الحديث",
      description:
        "حفظ أحاديث مختارة مع فهم معناها وتطبيقها، بما يبني سند الطالب العلمي منذ الصغر.",
    },
    "praktik-ibadah": {
      title: "التطبيق العملي للعبادات",
      description:
        "إرشاد عملي للعبادات اليومية من الطهارة والصلاة إلى أحكام الجنائز، ليُعمل الطالب ما تعلّمه مباشرة.",
    },
    "public-speaking": {
      title: "مهارات الخطابة",
      description:
        "بناء الثقة في عرض الفكرة وأداء الدعوة بفاعلية، لتخريج جيلٍ يُحسن التواصل ويعبّر عن نفسه بثقة.",
    },
    "pembinaan-islam": {
      title: "التكوين الإسلامي المكثّف",
      description:
        "برنامج لبناء الشخصية وتعميق الفهم الإسلامي، ليَنشأ الطالب متمسّكاً بالقيم القرآنية في كل جوانب حياته.",
    },
    entrepreneurship: {
      title: "ريادة الأعمال",
      description:
        "غرس روح المبادرة مبكّراً لتكوين طالبٍ مبدعٍ مبتكرٍ قادرٍ على الاستقلال الاقتصادي.",
    },
    "bimbel-xii": {
      title: "الإعداد الجامعي لطلاب الصف الثاني عشر",
      description:
        "دعم أكاديمي مركّز لطلاب الصف الثاني عشر استعداداً لاختبارات القبول الجامعي داخل إندونيسيا وخارجها.",
    },
  },
  gallery: {
    fasilitas: "لمحات من المسيرة وتوثيق لمرافق المعهد",
    disiplin: "بناء ثقافة الانضباط منذ الصغر",
    karakter: "التربية الروحية والخُلق الربّاني",
  },
  galleryAlts: {
    fasilitas: [
      "منظر جوي لمبنى من طابقين بسقف أحمر، أمامه ساحة مرصوفة وخلفه جدران استنادية حجرية مدرَّجة",
      "صفّ من الفصول الدراسية بسقف قرميدي وممرّ مفتوح يطلّ على ساحة الطابور",
      "منظر جوي لمبنى من طابق واحد بدرج مدخل عريض",
      "مبنى من طابقين بصفوف من النوافذ، مُصوَّر من الساحة الترابية",
      "واجهة مبنى سكن الطلاب «كي هاجي علي» ببوابته المزخرفة بزخارف هندسية",
      "مبنى من طابق واحد بصفّ من الأبواب المتدحرجة وممرّ إلى جانبه",
    ],
    disiplin: [
      "طلاب المرحلة الابتدائية بالزيّ الأحمر والأبيض مصطفّون للطابور في ساحة المعهد",
      "مئات من طلاب المرحلة الابتدائية يقفون في صفوف لمراسم رفع العلم",
      "طلاب المرحلة الابتدائية يعدّلون صفوفهم عند أمر الاصطفاف",
      "طلاب المرحلة المتوسطة بالزيّ الأبيض والكحلي يرتدون الطاقية السوداء",
      "طابور المرحلة المتوسطة، والأساتذة يقفون على حافة الساحة",
      "أربعة من الأساتذة يقفون منتصبين أمام جدار حجري أثناء المراسم",
      "الأساتذة يؤدّون التحية عند رفع العلم",
    ],
    karakter: [
      "الطلاب يؤدّون الصلاة جماعةً داخل مسجد المعهد",
      "حلقة قرآنية في الجناح الخشبي المفتوح بإشراف أحد الأساتذة",
      "طلاب يجلسون في حلقة يقرؤون الكتاب بتوجيه من معلّم",
      "حلقة لقراءة الكتاب في السكن الداخلي، وتبدو الأسرّة الطابقية خلفهم",
      "طلاب مصطفّون في الممرّ يحملون كتبهم",
    ],
  },
};

/** Indonesian is the source of record, read straight back out of site.ts. */
const ID: SiteText = {
  tagline: siteConfig.tagline,
  description: siteConfig.description,
  visi: siteConfig.visi,
  units: Object.fromEntries(
    educationUnits.map((u) => [
      u.slug,
      {
        tagline: u.tagline,
        description: u.description,
        level: unitDetails[u.slug]?.jenjang ?? "",
        intro: unitDetails[u.slug]?.intro ?? "",
        highlights: unitDetails[u.slug]?.highlights ?? [],
      },
    ]),
  ),
  programs: Object.fromEntries(
    featuredPrograms.map((p) => [
      p.slug,
      { title: p.title, description: p.description },
    ]),
  ),
  gallery: Object.fromEntries(galleryItems.map((g) => [g.slug, g.title])),
  galleryAlts: Object.fromEntries(
    galleryItems.map((g) => [g.slug, g.photos.map((p) => p.alt)]),
  ),
};

const BY_LOCALE: Record<Locale, SiteText> = { id: ID, en: EN, ar: AR };

export function siteTextFor(locale: Locale): SiteText {
  return BY_LOCALE[locale] ?? ID;
}
