import type { Locale } from "@/locales";

/**
 * The words around each unit's intake on the public SPMB page
 * (decisions/spmb-2027-2028.md): its waves, its fee table, its requirements
 * and its contact.
 *
 * Only labels live here. What the unit's admin entered — the wave and fee
 * line names, the requirements, the contact — is printed as entered, in
 * Indonesian, like the brochure it comes from. Money is written in rupiah the
 * Indonesian way in every language, as the donation page does; dates follow
 * the reader's locale.
 */
export interface SpmbContent {
  heading: string;
  intro: string;
  /** "Tahun ajaran 2027/2028". */
  academicYear: (year: string) => string;
  window: {
    upcoming: string;
    open: string;
    closed: string;
    full: string;
  };
  /** "Pendaftaran 1 Okt 2026 – 10 Jul 2027". */
  registrationWindow: (days: string) => string;
  wavesHeading: string;
  wave: string;
  registration: string;
  test: string;
  results: string;
  reRegistration: string;
  discount: string;
  discountNote: string;
  feesHeading: string;
  feesNote: string;
  item: string;
  male: string;
  female: string;
  total: string;
  totalBoarding: string;
  totalNonBoarding: string;
  firstMonthIncluded: string;
  boarding: string;
  nonBoarding: string;
  perMonth: string;
  noFees: string;
  /** Shown when there is no fee table but a registration fee. */
  registrationFee: (amount: string) => string;
  requirementsHeading: string;
  noRequirements: string;
  /** "Usia minimal 7 tahun" / "… 5 tahun 6 bulan", and "pada 1 Juli 2027". */
  minAge: (years: number, months: number) => string;
  onDate: (date: string) => string;
  contactHeading: string;
  register: string;
  noIntakes: string;
  /** "Dibuka lagi 1 Januari 2027", while registration is shut until then. */
  opensOn: (date: string) => string;
  /** The homepage badge: "SPMB 2027/2028 dibuka". */
  badgeOpen: (year: string) => string;
  /** "SPMB 2027/2028 dibuka 1 Januari 2027". */
  badgeOpens: (year: string, date: string) => string;
}

const ID: SpmbContent = {
  heading: "Penerimaan tiap unit",
  intro:
    "Jadwal gelombang, rincian biaya, dan persyaratan setiap unit, seperti tercantum di brosur SPMB.",
  academicYear: (year) => `Tahun ajaran ${year}`,
  window: {
    upcoming: "Belum dibuka",
    open: "Dibuka",
    closed: "Ditutup",
    full: "Kuota penuh",
  },
  registrationWindow: (days) => `Pendaftaran ${days}`,
  wavesHeading: "Jadwal gelombang",
  wave: "Gelombang",
  registration: "Pendaftaran",
  test: "Tes",
  results: "Pengumuman",
  reRegistration: "Daftar ulang",
  discount: "Potongan lunas",
  discountNote:
    "Potongan berlaku bila biaya masuk dibayar lunas pada gelombang itu.",
  feesHeading: "Rincian biaya",
  feesNote: "Biaya yang dibayar saat masuk.",
  item: "Uraian",
  male: "Ikhwan",
  female: "Akhwat",
  total: "Jumlah",
  totalBoarding: "Jumlah mukim",
  totalNonBoarding: "Jumlah tidak mukim",
  firstMonthIncluded: "termasuk biaya bulanan pertama",
  boarding: "mukim",
  nonBoarding: "tidak mukim",
  perMonth: "per bulan",
  noFees: "Rincian biaya belum diumumkan.",
  registrationFee: (amount) => `Biaya pendaftaran ${amount}.`,
  requirementsHeading: "Persyaratan",
  noRequirements: "Persyaratan belum diumumkan.",
  minAge: (years, months) =>
    `Usia minimal ${years} tahun${months ? ` ${months} bulan` : ""}`,
  onDate: (date) => ` pada ${date}`,
  contactHeading: "Narahubung",
  register: "Daftar ke unit ini",
  noIntakes: "Belum ada penerimaan yang diumumkan.",
  opensOn: (date) => `Dibuka ${date}`,
  badgeOpen: (year) => `SPMB ${year} dibuka`,
  badgeOpens: (year, date) => `SPMB ${year} dibuka ${date}`,
};

const EN: SpmbContent = {
  heading: "Admissions by school",
  intro:
    "Each school's wave schedule, fees and requirements, as printed in the SPMB brochure.",
  academicYear: (year) => `Academic year ${year}`,
  window: {
    upcoming: "Not open yet",
    open: "Open",
    closed: "Closed",
    full: "Quota full",
  },
  registrationWindow: (days) => `Registration ${days}`,
  wavesHeading: "Wave schedule",
  wave: "Wave",
  registration: "Registration",
  test: "Test",
  results: "Results",
  reRegistration: "Re-registration",
  discount: "Full-payment discount",
  discountNote:
    "The discount applies when the entry fees are paid in full during that wave.",
  feesHeading: "Fees",
  feesNote: "Paid on entry.",
  item: "Item",
  male: "Boys",
  female: "Girls",
  total: "Total",
  totalBoarding: "Total, boarding",
  totalNonBoarding: "Total, day pupils",
  firstMonthIncluded: "first month's fee included",
  boarding: "boarding",
  nonBoarding: "day pupils",
  perMonth: "per month",
  noFees: "Fees have not been announced yet.",
  registrationFee: (amount) => `Registration fee ${amount}.`,
  requirementsHeading: "Requirements",
  noRequirements: "Requirements have not been announced yet.",
  minAge: (years, months) =>
    `Minimum age ${years} years${months ? ` ${months} months` : ""}`,
  onDate: (date) => ` on ${date}`,
  contactHeading: "Contact",
  register: "Apply to this school",
  noIntakes: "No admissions have been announced yet.",
  opensOn: (date) => `Opens ${date}`,
  badgeOpen: (year) => `SPMB ${year} is open`,
  badgeOpens: (year, date) => `SPMB ${year} opens ${date}`,
};

const AR: SpmbContent = {
  heading: "القبول في كل وحدة",
  intro: "مواعيد الدفعات والرسوم والشروط لكل وحدة، كما وردت في نشرة القبول.",
  academicYear: (year) => `العام الدراسي ${year}`,
  window: {
    upcoming: "لم يُفتح بعد",
    open: "مفتوح",
    closed: "مغلق",
    full: "اكتمل العدد",
  },
  registrationWindow: (days) => `التسجيل ${days}`,
  wavesHeading: "مواعيد الدفعات",
  wave: "الدفعة",
  registration: "التسجيل",
  test: "الاختبار",
  results: "إعلان النتائج",
  reRegistration: "إعادة التسجيل",
  discount: "خصم السداد الكامل",
  discountNote: "يُطبَّق الخصم عند سداد رسوم الالتحاق كاملةً خلال تلك الدفعة.",
  feesHeading: "الرسوم",
  feesNote: "تُدفع عند الالتحاق.",
  item: "البند",
  male: "البنون",
  female: "البنات",
  total: "المجموع",
  totalBoarding: "المجموع للمقيمين",
  totalNonBoarding: "المجموع لغير المقيمين",
  firstMonthIncluded: "يشمل رسوم الشهر الأول",
  boarding: "للمقيمين",
  nonBoarding: "لغير المقيمين",
  perMonth: "شهريًا",
  noFees: "لم تُعلَن الرسوم بعد.",
  registrationFee: (amount) => `رسوم التسجيل ${amount}.`,
  requirementsHeading: "الشروط",
  noRequirements: "لم تُعلَن الشروط بعد.",
  minAge: (years, months) =>
    `الحد الأدنى للعمر ${years} سنوات${months ? ` و${months} أشهر` : ""}`,
  onDate: (date) => ` في ${date}`,
  contactHeading: "للتواصل",
  register: "التسجيل في هذه الوحدة",
  noIntakes: "لم يُعلَن عن قبول بعد.",
  opensOn: (date) => `يُفتح في ${date}`,
  badgeOpen: (year) => `التسجيل مفتوح للعام ${year}`,
  badgeOpens: (year, date) => `يُفتح التسجيل للعام ${year} في ${date}`,
};

const CONTENT: Record<Locale, SpmbContent> = { id: ID, en: EN, ar: AR };

export function spmbContentFor(locale: Locale): SpmbContent {
  return CONTENT[locale] ?? ID;
}
