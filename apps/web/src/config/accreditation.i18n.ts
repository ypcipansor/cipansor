import type { Locale } from "@/locales";

/**
 * The words around a unit's accreditation on the public site
 * (decisions/akreditasi-unit.md): the section on /profil/legalitas and the
 * line on each unit's page.
 *
 * Its own small dictionary, not a block in content.i18n.ts, because the
 * section is a client component — it reads the certificates in force from the
 * API — and importing this file ships these few strings, not the whole
 * profile's.
 *
 * Only labels live here. The rating, the certificate and decree numbers, the
 * NPSN and the issuer are what the certificate says and are printed as
 * recorded; the dates are formatted in the reader's locale.
 */
export interface AccreditationContent {
  heading: string;
  intro: string;
  /** "Terakreditasi B" — the rating is the letter on the certificate. */
  accredited: (rating: string) => string;
  certificateLabel: string;
  decreeLabel: string;
  decreeDateLabel: string;
  npsnLabel: string;
  validUntilLabel: string;
  issuerLabel: string;
  viewCertificate: string;
  checkAtBanPdm: string;
  /** The line on a unit's page: rating and last day. */
  unitLine: (rating: string, validUntil: string) => string;
  unitLineLink: string;
}

const ID: AccreditationContent = {
  heading: "Akreditasi Satuan Pendidikan",
  intro:
    "Peringkat akreditasi yang ditetapkan BAN-PDM, sebagaimana tertulis pada sertifikatnya. Setiap peringkat dapat diperiksa langsung di situs BAN-PDM dengan NPSN sekolahnya.",
  accredited: (rating) => `Terakreditasi ${rating}`,
  certificateLabel: "Nomor sertifikat",
  decreeLabel: "Nomor SK",
  decreeDateLabel: "Tanggal SK",
  npsnLabel: "NPSN",
  validUntilLabel: "Berlaku sampai",
  issuerLabel: "Diterbitkan oleh",
  viewCertificate: "Lihat sertifikat (PDF)",
  checkAtBanPdm: "Cek di BAN-PDM",
  unitLine: (rating, validUntil) =>
    `Terakreditasi ${rating}, berlaku sampai ${validUntil}.`,
  unitLineLink: "Lihat sertifikatnya",
};

const EN: AccreditationContent = {
  heading: "Accreditation of Our Schools",
  intro:
    "Accreditation ratings awarded by BAN-PDM, Indonesia's national accreditation board for schools, as stated on each certificate. Every rating can be checked independently on the BAN-PDM website using the school's NPSN.",
  accredited: (rating) => `Accredited ${rating}`,
  certificateLabel: "Certificate number",
  decreeLabel: "Decree number",
  decreeDateLabel: "Decree date",
  npsnLabel: "NPSN (national school number)",
  validUntilLabel: "Valid until",
  issuerLabel: "Issued by",
  viewCertificate: "View certificate (PDF)",
  checkAtBanPdm: "Check at BAN-PDM",
  unitLine: (rating, validUntil) =>
    `Accredited ${rating}, valid until ${validUntil}.`,
  unitLineLink: "See the certificate",
};

const AR: AccreditationContent = {
  heading: "اعتماد الوحدات التعليمية",
  intro:
    "درجات الاعتماد التي منحها المجلس الوطني لاعتماد المدارس في إندونيسيا (BAN-PDM)، كما وردت في شهادة كل وحدة. ويمكن التحقق من كل درجة مباشرةً في موقع المجلس باستخدام الرقم الوطني للمدرسة (NPSN).",
  accredited: (rating) => `معتمدة بدرجة ${rating}`,
  certificateLabel: "رقم الشهادة",
  decreeLabel: "رقم القرار",
  decreeDateLabel: "تاريخ القرار",
  npsnLabel: "الرقم الوطني للمدرسة (NPSN)",
  validUntilLabel: "سارية حتى",
  issuerLabel: "الجهة المانحة",
  viewCertificate: "عرض الشهادة (PDF)",
  checkAtBanPdm: "التحقق لدى BAN-PDM",
  unitLine: (rating, validUntil) =>
    `معتمدة بدرجة ${rating}، سارية حتى ${validUntil}.`,
  unitLineLink: "عرض الشهادة",
};

const BY_LOCALE: Record<Locale, AccreditationContent> = {
  id: ID,
  en: EN,
  ar: AR,
};

export function accreditationContentFor(locale: Locale): AccreditationContent {
  return BY_LOCALE[locale] ?? ID;
}
