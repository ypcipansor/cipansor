import type { Locale } from "@/locales";

/**
 * The words for the SPMB announcement on the public site
 * (`components/landing/spmb-announcement.tsx`).
 *
 * The announcement is the same one the hero badge and the SPMB page already
 * make, just louder: "Pendaftaran SPMB <year> telah dibuka" while a unit is
 * taking registrations, else the day the next one opens. Only labels live
 * here — the academic year and the unit's name are printed as the record has
 * them, in every language, like the SPMB page does with the unit's own words.
 * Dates follow the reader's locale (see `dateFormatterFor`).
 *
 * The public site is trilingual; `config/i18n-coverage.test.ts` fails if a
 * string exists in Indonesian only.
 */
export interface AnnouncementContent {
  /** The banner: "Pendaftaran SPMB 2027/2028 telah dibuka". */
  bannerOpen: (year: string) => string;
  /** The banner before it opens: "… dibuka 1 Januari 2027". */
  bannerOpens: (year: string, date: string) => string;
  /** Call to action while registration is open. */
  bannerCtaOpen: string;
  /** Call to action while it is not open yet — must not say "register". */
  bannerCtaOpens: string;
  /** Accessible name for a close button — never a bare "X". */
  dismiss: string;
  /** The dialog's title, the banner's sentence made a heading. */
  dialogTitleOpen: (year: string) => string;
  dialogTitleOpens: (year: string, date: string) => string;
  /** One sentence of context while open; names the unit the announcement leads with, never claiming the others share its status. */
  dialogBodyOpen: (unit: string) => string;
  /** One sentence before it opens: the named unit's own date, and a pointer to the other units' schedules. */
  dialogBodyOpens: (unit: string, date: string) => string;
  /** Dialog action while open. */
  dialogCtaOpen: string;
  /** Dialog action while not yet open — points at the info, not the form. */
  dialogCtaOpens: string;
  /** The dialog's second way out, in words rather than a lone icon. */
  dialogLater: string;
}

const ID: AnnouncementContent = {
  bannerOpen: (year) => `Pendaftaran SPMB ${year} telah dibuka`,
  bannerOpens: (year, date) => `Pendaftaran SPMB ${year} dibuka ${date}`,
  bannerCtaOpen: "Daftar sekarang",
  bannerCtaOpens: "Lihat info SPMB",
  dismiss: "Tutup pengumuman",
  dialogTitleOpen: (year) => `SPMB ${year} telah dibuka`,
  dialogTitleOpens: (year, date) => `SPMB ${year} dibuka ${date}`,
  dialogBodyOpen: (unit) =>
    `Penerimaan murid baru untuk ${unit} tahun ajaran ini sudah dibuka. Daftar secara online dan pantau status pendaftaran Anda. Jadwal unit lainnya ada di halaman SPMB.`,
  dialogBodyOpens: (unit, date) =>
    `Pendaftaran untuk ${unit} tahun ajaran ini belum dibuka. Pendaftaran dibuka ${date}. Jadwal unit lainnya bisa berbeda, lihat di halaman SPMB. Sementara itu, lihat dulu biaya dan persyaratannya.`,
  dialogCtaOpen: "Daftar SPMB",
  dialogCtaOpens: "Lihat info SPMB",
  dialogLater: "Nanti saja",
};

const EN: AnnouncementContent = {
  bannerOpen: (year) => `SPMB ${year} admissions are open`,
  bannerOpens: (year, date) => `SPMB ${year} admissions open ${date}`,
  bannerCtaOpen: "Apply now",
  bannerCtaOpens: "See SPMB details",
  dismiss: "Dismiss announcement",
  dialogTitleOpen: (year) => `SPMB ${year} admissions are open`,
  dialogTitleOpens: (year, date) => `SPMB ${year} admissions open ${date}`,
  dialogBodyOpen: (unit) =>
    `Admissions for ${unit} are open for this academic year. Apply online and track your application. Other units' schedules are on the SPMB page.`,
  dialogBodyOpens: (unit, date) =>
    `Admissions for ${unit} are not open yet. Registration opens ${date}. Other units may open on different dates — see the SPMB page. In the meantime, look over the fees and requirements.`,
  dialogCtaOpen: "Apply for SPMB",
  dialogCtaOpens: "See SPMB details",
  dialogLater: "Maybe later",
};

const AR: AnnouncementContent = {
  bannerOpen: (year) => `التسجيل مفتوح للعام ${year}`,
  bannerOpens: (year, date) => `يُفتح التسجيل للعام ${year} في ${date}`,
  bannerCtaOpen: "سجّل الآن",
  bannerCtaOpens: "معلومات القبول",
  dismiss: "إغلاق الإعلان",
  dialogTitleOpen: (year) => `التسجيل مفتوح للعام ${year}`,
  dialogTitleOpens: (year, date) => `يُفتح التسجيل للعام ${year} في ${date}`,
  dialogBodyOpen: (unit) =>
    `التسجيل في ${unit} مفتوح لهذا العام الدراسي. سجّل عبر الإنترنت وتابع حالة تسجيلك. جدول بقية الوحدات على صفحة القبول.`,
  dialogBodyOpens: (unit, date) =>
    `التسجيل في ${unit} لم يُفتح بعد. يبدأ التسجيل في ${date}. قد تختلف مواعيد بقية الوحدات، فاطّلع عليها في صفحة القبول. في هذه الأثناء، راجع الرسوم والشروط.`,
  dialogCtaOpen: "التسجيل",
  dialogCtaOpens: "معلومات القبول",
  dialogLater: "لاحقًا",
};

const CONTENT: Record<Locale, AnnouncementContent> = { id: ID, en: EN, ar: AR };

export function announcementContentFor(locale: Locale): AnnouncementContent {
  return CONTENT[locale] ?? ID;
}
