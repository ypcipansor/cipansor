import { describe, it, expect } from "vitest";
import { isPdfCandidate } from "./pdf-file";

/**
 * MIME dari peramban tidak dapat dipercaya.
 *
 * Regresi yang dipaku: gerbang unggah dulu menolak setiap berkas yang
 * `type !== "application/pdf"`. Berkas yang diunduh dari arsip surel atau dari
 * aplikasi pemindai sering tiba dengan tipe kosong atau
 * `application/octet-stream`, sehingga PDF yang sah ditolak DI KLIEN sebelum
 * pernah sampai ke peladen. Peladen tetap memeriksa magic bytes terhadap byte
 * unggahan, jadi melonggarkan gerbang ini tidak melonggarkan keamanan.
 */
describe("isPdfCandidate", () => {
  it("menerima tipe application/pdf apa pun namanya", () => {
    expect(isPdfCandidate({ type: "application/pdf", name: "risalah" })).toBe(
      true,
    );
  });

  it("menerima tipe kosong bila nama berakhiran .pdf", () => {
    expect(isPdfCandidate({ type: "", name: "risalah.pdf" })).toBe(true);
  });

  it("menerima application/octet-stream bila nama berakhiran .pdf", () => {
    expect(
      isPdfCandidate({ type: "application/octet-stream", name: "scan.PDF" }),
    ).toBe(true);
  });

  it("menolak tipe kosong yang bukan .pdf", () => {
    expect(isPdfCandidate({ type: "", name: "catatan.txt" })).toBe(false);
  });

  it("menolak octet-stream yang bukan .pdf", () => {
    expect(
      isPdfCandidate({ type: "application/octet-stream", name: "data.bin" }),
    ).toBe(false);
  });

  it("menolak tipe eksplisit non-PDF meski ekstensinya .pdf", () => {
    expect(isPdfCandidate({ type: "image/png", name: "palsu.pdf" })).toBe(
      false,
    );
  });

  it("tahan terhadap field yang hilang", () => {
    expect(isPdfCandidate({})).toBe(false);
    expect(isPdfCandidate({ name: "risalah.pdf" })).toBe(true);
  });
});
