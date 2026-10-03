import type { Metadata } from "next";
import { siteConfig, educationUnits } from "@/config/site";
import { getServerLocale } from "@/lib/server-locale";
import { galleryPhoto } from "@/config/page-photo";
import { SpmbForm } from "./spmb-form";

/**
 * SPMB — Sistem Penerimaan Murid Baru.
 *
 * Kemendikdasmen replaced PPDB with SPMB from the 2025/2026 intake;
 * `/public/ppdb` still 308s here for anyone following an old link.
 *
 * The form itself is a client component (it posts a registration and reads the
 * active period), so this server wrapper carries the metadata. Without it the
 * page inherited the root layout's "Cipansor - Pesantren Management System" —
 * an internal tool's title on the landing page the main call-to-action opens,
 * which is neither indexable nor reassuring to a prospective parent.
 */
export const metadata: Metadata = {
  title: `Pendaftaran SPMB — ${siteConfig.legalName}`,
  description: `Pendaftaran Sistem Penerimaan Murid Baru (SPMB) Pesantren Cipansor untuk ${educationUnits
    .map((u) => u.shortName)
    .join(", ")}. Daftar secara online dan pantau status pendaftaran Anda.`,
  metadataBase: new URL(siteConfig.url),
  alternates: { canonical: "/public/spmb" },
  openGraph: {
    title: `Pendaftaran SPMB — ${siteConfig.legalName}`,
    description:
      "Pendaftaran murid baru Pesantren Cipansor untuk seluruh unit pendidikan, dari TK Qur'an hingga SMA Qur'an dan program Takhosus.",
    url: `${siteConfig.url}/public/spmb`,
    siteName: siteConfig.name,
    locale: "id_ID",
    type: "website",
  },
};

export default async function PublicSpmbPage() {
  // The landmark lives inside SpmbForm, which renders the page's own <main>
  // after its hero <section>. Wrapping it in a second one here would nest two.
  //
  // The locale resolves the hero photograph's alt text server-side and the
  // labels of each unit's intake; the rest of the form is Indonesian only
  // (known-issues: the SPMB form is not yet trilingual).
  const locale = await getServerLocale();
  return (
    <SpmbForm photo={galleryPhoto("disiplin", 4, locale)} locale={locale} />
  );
}
