import { officeHolder } from "@cipansor/shared";

/**
 * Who signs a tahfidz certificate, as the yayasan's own certificate is
 * signed: the Direktur Tahfidz of the santri's side (ikhwan or akhwat), the
 * Pimpinan Pesantren, and — acknowledging — the Ketua Yayasan.
 */
export interface CertificateSigner {
  /** A line above the role, e.g. "Mengetahui,". */
  lead?: string;
  role: string;
  name: string;
}

export function certificateSigners(
  gender: "MALE" | "FEMALE" | undefined,
): CertificateSigner[] {
  const blank = "(.................................)";
  const side = gender === "FEMALE" ? "akhwat" : "ikhwan";
  const direktur = officeHolder(`direktur-tahfidz-${side}`);
  return [
    {
      role: direktur?.position ?? "Direktur Tahfidz",
      name: direktur?.name ?? blank,
    },
    {
      role: "Pimpinan Pesantren",
      name: officeHolder("pimpinan-pesantren")?.name ?? blank,
    },
    {
      lead: "Mengetahui,",
      role: "Ketua Yayasan",
      name: officeHolder("ketua-yayasan")?.name ?? blank,
    },
  ];
}
