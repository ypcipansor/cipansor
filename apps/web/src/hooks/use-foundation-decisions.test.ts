import { describe, it, expect } from "vitest";
import {
  normalizeFoundationFilter,
  FOUNDATION_FILTER_ALL,
} from "./use-foundation-decisions";

/**
 * Select "Semua …" mengirim sentinel, bukan string kosong.
 *
 * Radix memakai "" untuk placeholder, jadi opsi "semua" butuh nilai lain —
 * dan meneruskan nilai itu apa adanya ke API ditolak skema enum
 * `organType`/`status`. Pengguna melihat daftar kosong tanpa penjelasan dan
 * tidak pernah bisa mengosongkan filter. Penerjemahan ke `undefined` adalah
 * satu-satunya tempat nilai sentinel boleh hidup.
 */
describe("normalizeFoundationFilter", () => {
  it("menerjemahkan sentinel 'all' menjadi undefined (tanpa filter)", () => {
    expect(normalizeFoundationFilter(FOUNDATION_FILTER_ALL)).toBeUndefined();
  });

  it("memperlakukan nilai kosong/undefined sebagai tanpa filter", () => {
    expect(normalizeFoundationFilter(undefined)).toBeUndefined();
    expect(normalizeFoundationFilter("")).toBeUndefined();
  });

  it("meneruskan nilai enum yang sah apa adanya", () => {
    expect(normalizeFoundationFilter("PEMBINA")).toBe("PEMBINA");
    expect(normalizeFoundationFilter("VOTING")).toBe("VOTING");
  });

  it("tidak pernah mengembalikan literal 'all'", () => {
    // Regresi: literal "all" yang lolos ke API ditolak sebagai organType/status
    // invalid.
    expect(normalizeFoundationFilter(FOUNDATION_FILTER_ALL)).not.toBe("all");
  });
});
