import { describe, it, expect } from "vitest";
import {
  yayasanOrganOf,
  yayasanOrganConflict,
  YAYASAN_ORGAN_BY_ROLE,
  canCreateFoundationDecisions,
  userCanCreateFoundationDecisions,
  userCanFinalizeFoundationDecisions,
  userCanManageFoundationRules,
} from "./yayasan-organ";

/**
 * Mirrors apps/api/src/utils/role-eligibility.test.ts. The API and the DB
 * trigger are what enforce this; these tests exist so the form's guidance does
 * not quietly disagree with them.
 */
describe("yayasan organ exclusivity (UI mirror)", () => {
  it("covers exactly the six yayasan organ roles", () => {
    expect(Object.keys(YAYASAN_ORGAN_BY_ROLE).sort()).toEqual([
      "YAYASAN_ANGGOTA",
      "YAYASAN_BENDAHARA",
      "YAYASAN_KETUA",
      "YAYASAN_PEMBINA",
      "YAYASAN_PENGAWAS",
      "YAYASAN_SEKRETARIS",
    ]);
  });

  it("maps the four pengurus seats to one organ", () => {
    for (const code of [
      "YAYASAN_KETUA",
      "YAYASAN_SEKRETARIS",
      "YAYASAN_BENDAHARA",
      "YAYASAN_ANGGOTA",
    ]) {
      expect(yayasanOrganOf(code)).toBe("PENGURUS");
    }
  });

  it("ignores roles outside the yayasan", () => {
    expect(yayasanOrganOf("SDIT_GURU")).toBeUndefined();
    expect(yayasanOrganConflict("SDIT_GURU", ["YAYASAN_PEMBINA"])).toBeNull();
  });

  // The exact arrangement the seed used to produce.
  it("refuses Pembina for someone already Pengurus, and the reverse", () => {
    expect(yayasanOrganConflict("YAYASAN_PEMBINA", ["YAYASAN_KETUA"])).toMatch(
      /Pasal 29/,
    );
    expect(yayasanOrganConflict("YAYASAN_KETUA", ["YAYASAN_PEMBINA"])).toMatch(
      /Pasal 29/,
    );
  });

  it("refuses Pengawas alongside either of the others", () => {
    expect(
      yayasanOrganConflict("YAYASAN_PENGAWAS", ["YAYASAN_PEMBINA"]),
    ).not.toBeNull();
    expect(
      yayasanOrganConflict("YAYASAN_PENGAWAS", ["YAYASAN_BENDAHARA"]),
    ).not.toBeNull();
  });

  it("allows two seats within the same organ", () => {
    expect(
      yayasanOrganConflict("YAYASAN_BENDAHARA", ["YAYASAN_KETUA"]),
    ).toBeNull();
  });

  it("allows a yayasan role alongside a school role", () => {
    expect(
      yayasanOrganConflict("YAYASAN_BENDAHARA", [
        "SDIT_BENDAHARA",
        "SDIT_ORANG_TUA",
      ]),
    ).toBeNull();
  });

  it("allows the first yayasan role a person is given", () => {
    expect(yayasanOrganConflict("YAYASAN_PEMBINA", [])).toBeNull();
  });
});

/**
 * Regresi — gate peran SEKUNDER.
 *
 * Ketiga halaman tulis (daftar, form, aturan kuorum) dulu memanggil predikat
 * peran PRIMER saja. Peladen, lewat `authorizeAnyRole`, menerima aksi bila
 * SALAH SATU peran aktif diizinkan — jadi pejabat yang peran utamanya GURU
 * tetapi memegang YAYASAN_PEMBINA sebagai penugasan sekunder kehilangan tombol
 * yang justru peladen izinkan. Predikat multi-peran inilah yang menutupnya.
 */
describe("gate tulis foundation — SELURUH peran aktif (primary + sekunder)", () => {
  it("create: mengizinkan peran organ sebagai penugasan SEKUNDER", () => {
    // Peran utama GURU, sekunder YAYASAN_PEMBINA — peladen mengizinkan.
    expect(userCanCreateFoundationDecisions(["GURU", "YAYASAN_PEMBINA"])).toBe(
      true,
    );
    expect(userCanCreateFoundationDecisions(["GURU", "YAYASAN_PENGAWAS"])).toBe(
      true,
    );
  });

  /**
   * Bukti "gagal-sebelum": predikat LAMA hanya melihat peran utama, sehingga
   * pejabat ini (utama GURU, sekunder YAYASAN_PEMBINA) dinyatakan TIDAK boleh —
   * persis kebalikan dari jawaban peladen. Baris ini gagal bila gerbang kembali
   * ke peran primer saja.
   */
  it("create: predikat peran-primer LAMA menolak pejabat ini (gagal-sebelum)", () => {
    expect(canCreateFoundationDecisions("GURU")).toBe(false);
  });

  it("create: menolak saat TIDAK SATU pun peran aktif diizinkan", () => {
    expect(
      userCanCreateFoundationDecisions(["GURU", "YAYASAN_BENDAHARA"]),
    ).toBe(false);
    // Peran sudah dicabut (hanya peran non-organ yang tersisa).
    expect(userCanCreateFoundationDecisions(["GURU"])).toBe(false);
    expect(userCanCreateFoundationDecisions([])).toBe(false);
    expect(userCanCreateFoundationDecisions(null)).toBe(false);
  });

  it("finalize: mengizinkan peran organ sebagai penugasan SEKUNDER", () => {
    expect(
      userCanFinalizeFoundationDecisions(["SISWA", "YAYASAN_PENGAWAS"]),
    ).toBe(true);
  });

  it("rules/publikasi: SUPER_ADMIN sebagai peran mana pun", () => {
    expect(userCanManageFoundationRules(["GURU", "SUPER_ADMIN"])).toBe(true);
    expect(userCanManageFoundationRules(["SUPER_ADMIN"])).toBe(true);
    expect(userCanManageFoundationRules(["GURU"])).toBe(false);
    expect(userCanManageFoundationRules([])).toBe(false);
  });
});
