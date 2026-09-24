import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  canCreateFoundationDecisions,
  canFinalizeFoundationDecisions,
  FOUNDATION_DECISION_CREATE_ROLES,
  FOUNDATION_DECISION_FINALIZE_ROLES,
} from "./yayasan-organ";

/**
 * Regresi: tombol tulis keputusan organ ("Buat Keputusan", "Finalisasi")
 * dirender ke SEMUA pembaca, termasuk Bendahara & Anggota yang di peladen
 * hanya boleh MEMBACA. Klik mereka berakhir 403 — UI menjanjikan aksi yang
 * rute-nya pasti tolak.
 *
 * Sejak audit Pengawas, hak MEMBUAT dan hak MEM-FINALISASI dipisah. Satu daftar
 * `WRITE` bersama membuat menambahkan Pengawas agar dapat membuka rapat
 * organnya juga memberinya hak finalisasi atas rapat organ lain — hak yang
 * tidak dimaksudkan. Yang diuji di sini:
 *  1. kedua daftar web benar-benar sama dengan `CREATE`/`FINALIZE` di routes API
 *     (dibaca dari berkas, bukan disalin), dan
 *  2. halaman daftar & detail benar-benar memakai gerbang yang tepat.
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
const API_AUTHORITY = path.join(
  WEB_DIR,
  "..",
  "api",
  "src",
  "utils",
  "foundation-authority.ts",
);

/** Parse `const NAME = [RoleCode.A, ...]` out of the API routes file. */
function apiRoles(name: string): string[] {
  const src = fs.readFileSync(API_ROUTES, "utf8");
  const block = src.match(
    new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`),
  );
  if (!block)
    throw new Error(`${name} not found in foundation-decisions.routes.ts`);
  const direct = [...block[1].matchAll(/RoleCode\.([A-Z_]+)/g)].map(
    (m) => m[1],
  );
  if (direct.length > 0) return direct.sort();
  // `FINALIZE` derives from `FOUNDATION_FINALIZE_ROUTE_ROLES` in
  // `utils/foundation-authority.ts` (route + service + DTO share one set).
  // Follow the re-export so the mirror test still reads the real values.
  const referenced = block[1].match(/FOUNDATION_[A-Z_]+/)?.[0];
  if (!referenced) throw new Error(`${name} has no RoleCode list or reference`);
  const util = fs.readFileSync(API_AUTHORITY, "utf8");
  const utilBlock = util.match(
    new RegExp(`const ${referenced}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\];`),
  );
  if (!utilBlock)
    throw new Error(`${referenced} not found in foundation-authority.ts`);
  return [...utilBlock[1].matchAll(/RoleCode\.([A-Z_]+)/g)]
    .map((m) => m[1])
    .sort();
}

describe("foundation decisions — write gate cermin dari API", () => {
  it("daftar CREATE web sama persis dengan rute API", () => {
    expect([...FOUNDATION_DECISION_CREATE_ROLES].sort()).toEqual(
      apiRoles("CREATE"),
    );
  });

  it("daftar FINALIZE web sama persis dengan rute API", () => {
    expect([...FOUNDATION_DECISION_FINALIZE_ROLES].sort()).toEqual(
      apiRoles("FINALIZE"),
    );
  });

  it("mengizinkan pembuat keputusan", () => {
    for (const role of [
      "SUPER_ADMIN",
      "YAYASAN_PEMBINA",
      "YAYASAN_KETUA",
      "YAYASAN_SEKRETARIS",
    ]) {
      expect(canCreateFoundationDecisions(role)).toBe(true);
    }
  });

  /**
   * Regresi BUG — Pengawas tidak dapat memulai keputusan yang menjadi
   * kewenangannya.
   *
   * Matriks kewenangan menetapkan `pemberhentian-sementara-pengurus` kepada
   * PENGAWAS, tetapi YAYASAN_PENGAWAS tidak ada di daftar rute, sehingga organ
   * yang berwenang justru tidak dapat membuka rapatnya sendiri. Kewenangan
   * organ×jenis tetap diperiksa di service, jadi Pengawas hanya dapat membuat
   * keputusan organ PENGAWAS dengan jenis miliknya.
   */
  it("mengizinkan Pengawas MEMBUAT keputusan organnya", () => {
    expect(canCreateFoundationDecisions("YAYASAN_PENGAWAS")).toBe(true);
  });

  it("mengizinkan Pengawas memanggil finalize (dibatasi service ke snapshot)", () => {
    // Rute FINALIZE memuat Pengawas; service menolaknya bila bukan anggota
    // snapshot organ keputusan itu. Yang dipaku di sini adalah bahwa UI TIDAK
    // menyembunyikan tombol finalisasi dari Pengawas yang memang anggota.
    expect(canFinalizeFoundationDecisions("YAYASAN_PENGAWAS")).toBe(true);
  });

  it("menolak peran read-only (Bendahara & Anggota)", () => {
    for (const role of ["YAYASAN_BENDAHARA", "YAYASAN_ANGGOTA"]) {
      expect(canCreateFoundationDecisions(role)).toBe(false);
      expect(canFinalizeFoundationDecisions(role)).toBe(false);
    }
  });

  it("menolak saat roleCode tidak diketahui", () => {
    for (const role of [undefined, null, ""]) {
      expect(canCreateFoundationDecisions(role)).toBe(false);
      expect(canFinalizeFoundationDecisions(role)).toBe(false);
    }
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

  it("detail menyembunyikan 'Finalisasi' kecuali server menyatakan canFinalize", () => {
    const src = read("foundation/decisions/[id]/page.tsx");
    // Gerbang finalisasi kini berasal dari DTO server (`d.canFinalize`), bukan
    // role utama — peladen adalah sumber kebenaran eligibility.
    expect(src).toMatch(/const canFinalize = d\?\.canFinalize/);
    expect(src).toMatch(/d\.status === "VOTING" && canFinalize/);
  });

  it("detail TIDAK lagi menyimpulkan finalisasi dari role saja", () => {
    const src = read("foundation/decisions/[id]/page.tsx");
    // `canFinalizeFoundationDecisions` (role-only) tidak boleh menggerakkan
    // tombol; itu justru bug yang diperbaiki (Pengawas organ lain melihat
    // tombol yang peladen tolak).
    expect(src).not.toMatch(/canFinalizeFoundationDecisions/);
    expect(src).not.toMatch(/canManageFoundationDecisions/);
  });

  it("kontrol publikasi hanya tampil saat server menyatakan publishable", () => {
    const src = read("foundation/decisions/[id]/page.tsx");
    expect(src).toMatch(/d\.publishable/);
  });
});

describe("skema create tidak diduplikasi di web (#8)", () => {
  const page = fs.readFileSync(
    path.join(
      WEB_DIR,
      "src",
      "app",
      "foundation",
      "decisions",
      "new",
      "page.tsx",
    ),
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

  /**
   * Regresi BUG (audit B) — form menawarkan organ yang tak dapat dibuat aktor.
   *
   * Organ & jenis yang sah datang dari PELADEN lewat create-options, bukan
   * default statis `PEMBINA` dan daftar organ utuh. Halaman juga menahan query
   * untuk peran non-create agar tidak mengirim permintaan yang pasti 403.
   */
  it("mengambil daftar organ dari create-options server, bukan default statis", () => {
    expect(page).toContain("useFoundationCreateOptions");
    expect(page).toMatch(/enabled: canCreate/);
    expect(page).toContain("allowedOrgans");
    // Peran non-create memperoleh akses ditolak, bukan form operasional.
    expect(page).toContain("AccessDenied");
    expect(page).toContain("canCreateFoundationDecisions");
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
      path.join(
        WEB_DIR,
        "src",
        "app",
        "foundation",
        "decisions",
        "rules",
        "page.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("DEFAULT_FOUNDATION_RULE");
  });

  /**
   * Regresi INVESTIGATION C — halaman aturan kuorum tanpa gerbang SUPER_ADMIN.
   *
   * Halaman dulu langsung memanggil `useFoundationRules()` tanpa memeriksa
   * peran, sehingga pengguna yayasan non-admin yang mengetik URL menerima
   * permintaan 403 + form kosong. Kini ada gerbang halaman dan query ditahan
   * dengan `enabled` sampai peran terbukti SUPER_ADMIN.
   */
  it("memasang gerbang SUPER_ADMIN pada halaman dan menahan query", () => {
    const src = fs.readFileSync(
      path.join(
        WEB_DIR,
        "src",
        "app",
        "foundation",
        "decisions",
        "rules",
        "page.tsx",
      ),
      "utf8",
    );
    expect(src).toContain('=== "SUPER_ADMIN"');
    // Prettier formats the object argument across lines; assert the gate
    // property regardless of line breaks rather than pinning one layout.
    expect(src).toMatch(
      /useFoundationRules\(\{\s*enabled:\s*isSuperAdmin,?\s*\}\)/,
    );
    expect(src).toContain("AccessDenied");
  });
});
