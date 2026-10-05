import { describe, it, expect } from "vitest";
import { certificateSigners } from "./tahfidz-certificate-signers";

/**
 * A tahfidz certificate is signed as the yayasan's own signed certificate is:
 * the Direktur Tahfidz of the santri's side, the Pimpinan Pesantren, and the
 * Ketua Yayasan who acknowledges. The page used to print an invented "Mudir
 * Tahfidz" and an invented "KH. Ahmad Fauzi" as Pimpinan Pondok.
 */
describe("certificateSigners", () => {
  it("signs a santriwati's certificate with the Direktur Tahfidz Akhwat", () => {
    expect(certificateSigners("FEMALE")).toEqual([
      {
        role: "Direktur Tahfidz Akhwat",
        name: "Ustadzah Shofura Istifa, Al-Hafidzah",
      },
      { role: "Pimpinan Pesantren", name: "K.H. Muhammad Taufik Ismail, S.Pd" },
      {
        lead: "Mengetahui,",
        role: "Ketua Yayasan",
        name: "H. Ramram Mansur Ramdani, S.Pd.I., M.Ag",
      },
    ]);
  });

  it("signs a santri's certificate with the Direktur Tahfidz Ikhwan", () => {
    expect(certificateSigners("MALE")[0]).toEqual({
      role: "Direktur Tahfidz Ikhwan",
      name: "H.M. Rizkon Hakiki, Lc., Al-Hafidz",
    });
  });

  it("prints no invented name", () => {
    const names = [
      ...certificateSigners("MALE"),
      ...certificateSigners("FEMALE"),
    ].map((s) => s.name);
    expect(names.join(" ")).not.toMatch(/Ahmad Fauzi|Muhammad Ridwan/);
  });
});
