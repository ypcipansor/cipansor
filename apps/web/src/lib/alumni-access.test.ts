import { describe, expect, it } from "vitest";
import { alumniAccessOf } from "./alumni-access";

const dengan = (code: string) => ({
  role: "STAFF",
  userRoles: [{ isPrimary: true, role: { code } }],
});

describe("alumniAccessOf", () => {
  it("santri dan alumni: direktori saja", () => {
    expect(alumniAccessOf(dengan("SDIT_SISWA"))).toEqual({
      canManage: false,
      canReadPersonalData: false,
    });
    expect(alumniAccessOf(dengan("SMPIT_ALUMNI"))).toEqual({
      canManage: false,
      canReadPersonalData: false,
    });
  });

  it("tata usaha dan admin unit mengelola", () => {
    expect(alumniAccessOf(dengan("SMPIT_TATA_USAHA")).canManage).toBe(true);
    expect(alumniAccessOf(dengan("SDIT_ADMIN")).canManage).toBe(true);
  });

  it("kepala sekolah dan organ yayasan membaca data diri tanpa mengelola", () => {
    for (const code of ["SMPIT_KEPALA_SEKOLAH", "YAYASAN_PENGAWAS"]) {
      expect(alumniAccessOf(dengan(code))).toEqual({
        canManage: false,
        canReadPersonalData: true,
      });
    }
  });

  it("peran penugasan utama yang menentukan, bukan kolom users.role", () => {
    // ketua@ di produksi: STAFF di kolom lama, Ketua Pengurus lewat penugasan.
    expect(alumniAccessOf(dengan("YAYASAN_KETUA")).canReadPersonalData).toBe(true);
    expect(alumniAccessOf({ role: "SUPER_ADMIN", userRoles: [] }).canManage).toBe(true);
  });
});
