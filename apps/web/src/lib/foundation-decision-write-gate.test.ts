import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  canManageFoundationDecisions,
  FOUNDATION_DECISION_WRITE_ROLES,
} from "./yayasan-organ";

/**
 * Regresi: tombol tulis keputusan organ ("Buat Keputusan", "Finalisasi")
 * dirender ke SEMUA pembaca, termasuk Bendahara & Anggota yang di peladen
 * hanya boleh MEMBACA. Klik mereka berakhir 403 — UI menjanjikan aksi yang
 * rute-nya pasti tolak.
 *
 * Yang diuji di sini:
 *  1. daftar WRITE di web benar-benar sama dengan `WRITE` di routes API
 *     (dibaca dari berkas, bukan disalin), dan
 *  2. halaman daftar & detail benar-benar memakai gerbang itu untuk tombol
 *     tulisnya.
 */

const WEB_DIR = path.join(__dirname, "..", "..");
const API_ROUTES = path.join(
  WEB_DIR,
  "..",
  "api",
  "src",
  "modules",
  "foundation-decisions",
  "foundation-decisions.routes.ts",
);

/** Parse `const WRITE = [RoleCode.A, ...]` out of the API routes file. */
function apiWriteRoles(): string[] {
  const src = fs.readFileSync(API_ROUTES, "utf8");
  const block = src.match(/const WRITE\s*=\s*\[([\s\S]*?)\];/);
  if (!block) throw new Error("WRITE not found in foundation-decisions.routes.ts");
  return [...block[1].matchAll(/RoleCode\.([A-Z_]+)/g)]
    .map((m) => m[1])
    .sort();
}

describe("foundation decisions — write gate cermin dari API", () => {
  it("daftar WRITE web sama persis dengan rute API", () => {
    expect([...FOUNDATION_DECISION_WRITE_ROLES].sort()).toEqual(apiWriteRoles());
  });

  it("mengizinkan pembuat keputusan", () => {
    for (const role of [
      "SUPER_ADMIN",
      "YAYASAN_PEMBINA",
      "YAYASAN_KETUA",
      "YAYASAN_SEKRETARIS",
    ]) {
      expect(canManageFoundationDecisions(role)).toBe(true);
    }
  });

  it("menolak peran read-only (Bendahara & Anggota) dan pengawas", () => {
    for (const role of [
      "YAYASAN_BENDAHARA",
      "YAYASAN_ANGGOTA",
      "YAYASAN_PENGAWAS",
    ]) {
      expect(canManageFoundationDecisions(role)).toBe(false);
    }
  });

  it("menolak saat roleCode tidak diketahui", () => {
    expect(canManageFoundationDecisions(undefined)).toBe(false);
    expect(canManageFoundationDecisions(null)).toBe(false);
    expect(canManageFoundationDecisions("")).toBe(false);
  });
});

describe("halaman keputusan memakai gerbang tulis", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(WEB_DIR, "src", "app", rel), "utf8");

  it("daftar menyembunyikan 'Buat Keputusan' dari peran non-tulis", () => {
    const src = read("foundation/decisions/page.tsx");
    expect(src).toContain("canManageFoundationDecisions");
    // Tombol harus berada di balik gerbang, bukan dirender tanpa syarat.
    expect(src).toMatch(/canWrite\s*\?/);
  });

  it("detail menyembunyikan 'Finalisasi' dari peran non-tulis", () => {
    const src = read("foundation/decisions/[id]/page.tsx");
    expect(src).toContain("canManageFoundationDecisions");
    expect(src).toMatch(/d\.status === "VOTING" && canWrite/);
  });
});

describe("skema create tidak diduplikasi di web (#8)", () => {
  const page = fs.readFileSync(
    path.join(WEB_DIR, "src", "app", "foundation", "decisions", "new", "page.tsx"),
    "utf8",
  );

  it("memakai createFoundationDecisionSchema dari shared", () => {
    expect(page).toContain("createFoundationDecisionSchema");
    expect(page).toMatch(/from\s+"@cipansor\/shared"/);
    expect(page).toContain("zodResolver(createFoundationDecisionSchema)");
  });

  it("tidak lagi mendeklarasikan skema lokal atau cast ke never", () => {
    // `z.object({...})` lokal adalah bentuk drift yang dikeluhkan; `as never`
    // adalah tanda tipe shared sudah tidak dipakai.
    expect(page).not.toMatch(/z\.object\(/);
    expect(page).not.toMatch(/as never/);
    expect(page).not.toMatch(/from "zod"/);
  });
});

describe("hook aturan kuorum punya halaman (#7)", () => {
  it("halaman pengelolaan aturan ada dan memakai kedua hook", () => {
    const file = path.join(
      WEB_DIR,
      "src",
      "app",
      "foundation",
      "decisions",
      "rules",
      "page.tsx",
    );
    expect(fs.existsSync(file)).toBe(true);
    const src = fs.readFileSync(file, "utf8");
    expect(src).toContain("useFoundationRules");
    expect(src).toContain("useUpsertFoundationRule");
  });

  it("default kuorum diambil dari shared, bukan disalin lokal", () => {
    const src = fs.readFileSync(
      path.join(WEB_DIR, "src", "app", "foundation", "decisions", "rules", "page.tsx"),
      "utf8",
    );
    expect(src).toContain("DEFAULT_FOUNDATION_RULE");
  });
});
