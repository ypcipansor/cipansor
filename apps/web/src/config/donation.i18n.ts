import type { Locale } from "@/locales";
import { donationConfig } from "./site";

/**
 * The Wakaf & Infaq page — the one public page that carries a live payment
 * flow, which is why it was translated on its own rather than in a sweep.
 *
 * Two things here are load-bearing and must not be treated as copy:
 *
 * - **The bank details** live in `donationConfig` and are never touched. A
 *   wrong account number sends real donations to a stranger.
 * - **`ANONYMOUS_DONOR_NAME`** is written into the donation record, not shown
 *   and forgotten. It stays Indonesian in every locale so the finance team
 *   reads one value, not three.
 *
 * The scripture on the page — a hadith and a rendering of Qur'an 2:261 — is
 * **not** translated, for the reason already documented for the leaders'
 * mottos in content.i18n.ts: producing English or Arabic from an Indonesian
 * rendering would publish a reconstruction as scripture. Readers are told the
 * passage is shown in the original instead.
 */

/** Recorded on the donation, not merely displayed. Never localise this. */
export const ANONYMOUS_DONOR_NAME = "Hamba Allah";

export interface DonationContent {
  hero: { headline: string; subheadline: string; lead: string; cta: string };
  campaigns: {
    heading: string;
    activeBadge: string;
    targetLabel: string;
    donors: (count: string) => string;
    untilPrefix: string;
    donateCta: string;
  };
  programs: {
    heading: string;
    intro: string;
    chooseCta: string;
    /** Keyed by akad (`donationConfig.programs[].type`). */
    byType: Record<string, { title: string; description: string }>;
  };
  bank: {
    heading: string;
    subheading: string;
    accountHolderPrefix: string;
    confirmHeading: string;
    confirmIntro: string;
    exampleLabel: string;
    whatsappCta: string;
  };
  steps: {
    heading: string;
    items: Array<{ title: string; description: string }>;
  };
  commitment: { title: string; text: string };
  /** Shown above the hadith and the closing verse when they are not in the
   *  reader's language. `null` for Indonesian, which is what they are in. */
  scriptureNotice: string | null;
  form: {
    title: string;
    description: string;
    amountLabel: string;
    amountPlaceholder: string;
    typeLabel: string;
    anonymousLabel: string;
    nameLabel: string;
    namePlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    emailLabel: string;
    paymentLabel: string;
    notesLabel: string;
    notesPlaceholder: string;
    submit: string;
    submitting: string;
    errorNameRequired: string;
    errorMinimum: (minimum: string) => string;
    errorFailed: string;
  };
  success: {
    heading: string;
    thanks: (name: string) => string;
    body: string;
    close: string;
  };
  /** Akad and payment labels, keyed by the enum value the API stores. */
  donationTypes: Record<string, string>;
  paymentMethods: Record<string, string>;
}

const ID: DonationContent = {
  hero: {
    headline: donationConfig.headline,
    subheadline: donationConfig.subheadline,
    lead: donationConfig.lead,
    cta: "Donasi Sekarang",
  },
  campaigns: {
    heading: "Kampanye Donasi",
    activeBadge: "Aktif",
    targetLabel: "Target",
    donors: (count) => `${count} donatur`,
    untilPrefix: "s/d",
    donateCta: "Donasi Sekarang",
  },
  programs: {
    heading: "Pilihan Program Kebaikan",
    intro: donationConfig.programsIntro,
    chooseCta: "Pilih Program Ini",
    byType: Object.fromEntries(
      donationConfig.programs.map((p) => [
        p.type,
        { title: p.title, description: p.description },
      ]),
    ),
  },
  bank: {
    heading: "Informasi Rekening",
    subheading: "Transfer donasi ke rekening resmi Yayasan Pesantren Cipansor",
    accountHolderPrefix: "a.n.",
    confirmHeading: "Konfirmasi Donasi",
    confirmIntro:
      "Setelah transfer, kirim bukti melalui WhatsApp dengan format",
    exampleLabel: "Contoh:",
    whatsappCta: "Konfirmasi via WhatsApp",
  },
  steps: {
    heading: "Cara Berdonasi",
    items: donationConfig.steps.map((s) => ({
      title: s.title,
      description: s.description,
    })),
  },
  commitment: {
    title: donationConfig.commitment.title,
    text: donationConfig.commitment.text,
  },
  scriptureNotice: null,
  form: {
    title: "Form Donasi",
    description:
      "Isi data donasi Anda. Donasi akan diverifikasi setelah pembayaran dikonfirmasi.",
    amountLabel: "Nominal Donasi",
    amountPlaceholder: "Atau masukkan nominal lain",
    typeLabel: "Jenis Donasi",
    anonymousLabel: "Donasi sebagai Hamba Allah (Anonim)",
    nameLabel: "Nama Lengkap *",
    namePlaceholder: "Masukkan nama lengkap",
    phoneLabel: "No. HP",
    phonePlaceholder: "08xx",
    emailLabel: "Email",
    paymentLabel: "Metode Pembayaran",
    notesLabel: "Pesan/Doa (Opsional)",
    notesPlaceholder: "Tulis pesan atau doa...",
    submit: "Kirim Donasi",
    submitting: "Memproses...",
    errorNameRequired: "Nama donatur harus diisi atau pilih donasi anonim",
    errorMinimum: (minimum) => `Minimal donasi ${minimum}`,
    errorFailed: "Gagal mengirim donasi. Silakan coba lagi.",
  },
  success: {
    heading: "Jazakallahu Khairan!",
    thanks: (name) => `Terima kasih, ${name}`,
    body: "Donasi Anda sedang menunggu verifikasi. Kami akan menghubungi Anda setelah pembayaran dikonfirmasi.",
    close: "Tutup",
  },
  donationTypes: {
    INFAK: "Infak",
    INFAK_BULANAN: "Infak Bulanan",
    ZAKAT_MAAL: "Zakat Maal",
    ZAKAT_FITRAH: "Zakat Fitrah",
    WAKAF: "Wakaf",
    SEDEKAH_JARIYAH: "Sedekah Jariyah",
    PEMBANGUNAN: "Pembangunan",
    BEASISWA: "Beasiswa",
    OTHERS: "Lainnya",
  },
  paymentMethods: {
    CASH: "Tunai",
    BANK_TRANSFER: "Transfer Bank",
    QRIS: "QRIS",
    EWALLET: "E-Wallet",
    OTHERS: "Lainnya",
  },
};

const EN: DonationContent = {
  hero: {
    headline: "An Investment for the Hereafter",
    subheadline: "The Pesantren Cipansor Giving Programme",
    lead: "Every rupiah you give in infaq is a seed of good that keeps growing, and keeps returning reward through the verses our santri recite.",
    cta: "Give now",
  },
  campaigns: {
    heading: "Appeals",
    activeBadge: "Open",
    targetLabel: "Target",
    donors: (count) => `${count} donors`,
    untilPrefix: "until",
    donateCta: "Give now",
  },
  programs: {
    heading: "Ways to Give",
    intro:
      "There are three main channels through which you can plant a good deed at Pesantren Cipansor:",
    chooseCta: "Choose this programme",
    byType: {
      WAKAF: {
        title: "Wakaf for Teaching Facilities",
        description:
          "Given entirely to building and developing new classrooms for SD IT, SMP IT, and SMA Qur'an, so that santri have somewhere fit to learn.",
      },
      BEASISWA: {
        title: "Takhosus Santri Scholarship",
        description:
          "Support towards the costs carried by santri memorising all 30 juz of the Qur'an, so they can focus on learning without the cost of their education standing in the way.",
      },
      INFAK: {
        title: "Infaq for Day-to-Day Running",
        description:
          "Support for daily teaching and learning and for the upkeep of the pesantren's facilities.",
      },
    },
  },
  bank: {
    heading: "Bank Details",
    subheading:
      "Transfer your donation to the official account of Yayasan Pesantren Cipansor",
    accountHolderPrefix: "in the name of",
    confirmHeading: "Confirming Your Donation",
    confirmIntro: "After transferring, send proof by WhatsApp in the format",
    exampleLabel: "For example:",
    whatsappCta: "Confirm on WhatsApp",
  },
  steps: {
    heading: "How to Give",
    items: [
      {
        title: "Choose a programme",
        description:
          "Decide which you would like to support — Wakaf for Teaching Facilities, the Takhosus Santri Scholarship, or Infaq for Day-to-Day Running — then press “Choose this programme”.",
      },
      {
        title: "Transfer",
        description:
          "Send your donation to the foundation's official account shown above.",
      },
      {
        title: "Confirm",
        description:
          "Send a photograph of the transfer receipt to our WhatsApp in the given format, so that your donation is recorded against the right programme.",
      },
    ],
  },
  commitment: {
    title: "Our Pledge of Trust",
    text: "We undertake that every rupiah entrusted to us is managed transparently and disbursed in full according to the programme agreement you selected. Disbursement reports are updated regularly, as our accountability to the community and before Allah.",
  },
  scriptureNotice:
    "The hadith and the Qur'anic verse on this page are shown as the pesantren renders them in Indonesian, rather than translated.",
  form: {
    title: "Donation Form",
    description:
      "Fill in your donation details. The donation is verified once payment has been confirmed.",
    amountLabel: "Amount",
    amountPlaceholder: "Or enter another amount",
    typeLabel: "Type of giving",
    anonymousLabel: "Give anonymously, as Hamba Allah",
    nameLabel: "Full name *",
    namePlaceholder: "Enter your full name",
    phoneLabel: "Mobile number",
    phonePlaceholder: "08xx",
    emailLabel: "Email",
    paymentLabel: "Payment method",
    notesLabel: "Message or supplication (optional)",
    notesPlaceholder: "Write a message or a supplication…",
    submit: "Send donation",
    submitting: "Sending…",
    errorNameRequired: "Enter the donor's name, or choose to give anonymously",
    errorMinimum: (minimum) => `The minimum donation is ${minimum}`,
    errorFailed: "The donation could not be sent. Please try again.",
  },
  success: {
    heading: "Jazakallahu Khairan!",
    thanks: (name) => `Thank you, ${name}`,
    body: "Your donation is awaiting verification. We will be in touch once the payment has been confirmed.",
    close: "Close",
  },
  donationTypes: {
    INFAK: "Infaq",
    INFAK_BULANAN: "Monthly Infaq",
    ZAKAT_MAAL: "Zakat Maal",
    ZAKAT_FITRAH: "Zakat Fitrah",
    WAKAF: "Wakaf",
    SEDEKAH_JARIYAH: "Sedekah Jariyah",
    PEMBANGUNAN: "Building fund",
    BEASISWA: "Scholarship",
    OTHERS: "Other",
  },
  paymentMethods: {
    CASH: "Cash",
    BANK_TRANSFER: "Bank transfer",
    QRIS: "QRIS",
    EWALLET: "E-wallet",
    OTHERS: "Other",
  },
};

const AR: DonationContent = {
  hero: {
    headline: "استثمارٌ للآخرة",
    subheadline: "برنامج التبرّع لمعهد سيبانسور",
    lead: "كل روبية تُنفقها بذرةُ خيرٍ تنمو وتُجري لك أجراً جارياً عبر آياتٍ يتلوها طلابنا.",
    cta: "تبرّع الآن",
  },
  campaigns: {
    heading: "حملات التبرّع",
    activeBadge: "مفتوحة",
    targetLabel: "الهدف",
    donors: (count) => `${count} متبرّعاً`,
    untilPrefix: "حتى",
    donateCta: "تبرّع الآن",
  },
  programs: {
    heading: "أوجه الإنفاق",
    intro: "نتيح لك ثلاث قنوات رئيسية لتغرس عملاً صالحاً في معهد سيبانسور:",
    chooseCta: "اختيار هذا البرنامج",
    byType: {
      WAKAF: {
        title: "وقف المرافق التعليمية",
        description:
          "يُصرف بالكامل لبناء فصول دراسية جديدة وتطويرها للمرحلة الابتدائية والإعدادية وثانوية القرآن، ليجد الطلاب مكاناً لائقاً للتعلّم.",
      },
      BEASISWA: {
        title: "منحة طلاب التخصّص",
        description:
          "دعمٌ لنفقات طلاب حفظ الثلاثين جزءاً، ليتفرّغوا للحفظ دون أن تعوقهم تكاليف الدراسة.",
      },
      INFAK: {
        title: "الإنفاق على التشغيل اليومي",
        description: "دعمٌ لسير التعليم اليومي ولصيانة مرافق المعهد.",
      },
    },
  },
  bank: {
    heading: "بيانات الحساب البنكي",
    subheading: "حوّل تبرّعك إلى الحساب الرسمي لمؤسسة معهد سيبانسور",
    accountHolderPrefix: "باسم",
    confirmHeading: "تأكيد التبرّع",
    confirmIntro: "بعد التحويل، أرسل إثبات التحويل عبر واتساب بالصيغة",
    exampleLabel: "مثال:",
    whatsappCta: "التأكيد عبر واتساب",
  },
  steps: {
    heading: "كيف تتبرّع",
    items: [
      {
        title: "اختر البرنامج",
        description:
          "حدّد ما تودّ دعمه: وقف المرافق التعليمية، أو منحة طلاب التخصّص، أو الإنفاق على التشغيل اليومي — ثم اضغط «اختيار هذا البرنامج».",
      },
      {
        title: "حوّل المبلغ",
        description: "أرسل تبرّعك إلى الحساب الرسمي للمؤسسة المذكور أعلاه.",
      },
      {
        title: "أكّد التحويل",
        description:
          "أرسل صورة إيصال التحويل إلى واتساب الإدارة بالصيغة المحدّدة، ليُسجَّل تبرّعك على البرنامج الصحيح.",
      },
    ],
  },
  commitment: {
    title: "عهد الأمانة",
    text: "نتعهّد بأن كل روبية تُؤتمَن عليها تُدار بشفافية وتُصرَف بالكامل وفق عقد البرنامج الذي اخترته، مع تقارير صرف تُحدَّث دورياً، مسؤوليةً أمام الناس وأمام الله.",
  },
  scriptureNotice:
    "الحديث والآية الواردان في هذه الصفحة معروضان بصياغة المعهد لهما بالإندونيسية، دون ترجمة.",
  form: {
    title: "استمارة التبرّع",
    description: "أدخل بيانات تبرّعك. يُعتمد التبرّع بعد تأكيد الدفع.",
    amountLabel: "مبلغ التبرّع",
    amountPlaceholder: "أو أدخل مبلغاً آخر",
    typeLabel: "نوع التبرّع",
    anonymousLabel: "التبرّع باسم «عبد الله» (دون ذكر الاسم)",
    nameLabel: "الاسم الكامل *",
    namePlaceholder: "أدخل اسمك الكامل",
    phoneLabel: "رقم الجوال",
    phonePlaceholder: "08xx",
    emailLabel: "البريد الإلكتروني",
    paymentLabel: "طريقة الدفع",
    notesLabel: "رسالة أو دعاء (اختياري)",
    notesPlaceholder: "اكتب رسالة أو دعاءً…",
    submit: "إرسال التبرّع",
    submitting: "جارٍ الإرسال…",
    errorNameRequired: "أدخل اسم المتبرّع، أو اختر التبرّع دون ذكر الاسم",
    errorMinimum: (minimum) => `الحدّ الأدنى للتبرّع ${minimum}`,
    errorFailed: "تعذّر إرسال التبرّع. يرجى المحاولة مرة أخرى.",
  },
  success: {
    heading: "جزاك الله خيراً!",
    thanks: (name) => `شكراً لك، ${name}`,
    body: "تبرّعك في انتظار التحقّق. سنتواصل معك بعد تأكيد الدفع.",
    close: "إغلاق",
  },
  donationTypes: {
    INFAK: "إنفاق",
    INFAK_BULANAN: "إنفاق شهري",
    ZAKAT_MAAL: "زكاة المال",
    ZAKAT_FITRAH: "زكاة الفطر",
    WAKAF: "وقف",
    SEDEKAH_JARIYAH: "صدقة جارية",
    PEMBANGUNAN: "صندوق البناء",
    OTHERS: "أخرى",
    BEASISWA: "منحة دراسية",
  },
  paymentMethods: {
    CASH: "نقداً",
    BANK_TRANSFER: "تحويل بنكي",
    QRIS: "QRIS",
    EWALLET: "محفظة إلكترونية",
    OTHERS: "أخرى",
  },
};

const BY_LOCALE: Record<Locale, DonationContent> = { id: ID, en: EN, ar: AR };

export function donationContentFor(locale: Locale): DonationContent {
  return BY_LOCALE[locale] ?? ID;
}
