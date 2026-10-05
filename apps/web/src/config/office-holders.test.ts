import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEMO_ACCOUNTS, ORGANISATION } from "@cipansor/shared";
import { leadership } from "./content";

/**
 * One list of the yayasan's office holders (packages/shared/src/types/
 * office-holders.ts) feeds the public site, the seed's board members and the
 * demo accounts. These tests hold the three to it, and hold the list to the
 * law it describes.
 */

const PUBLIC = path.resolve(__dirname, "../../public");
const SOURCE = path.resolve(
  __dirname,
  "../../../../packages/shared/src/types/office-holders.ts",
);

const holders = ORGANISATION.flatMap((g) =>
  g.holders.map((h) => ({ ...h, group: g.slug })),
);
const office = (slug: string) => {
  const h = holders.find((x) => x.slug === slug);
  if (!h) throw new Error(`No office ${slug}`);
  return h;
};

/** The demo account of each office the list names. */
const ACCOUNT_OFFICE: Record<string, string> = {
  YAYASAN_KETUA: "ketua-yayasan",
  YAYASAN_SEKRETARIS: "sekretaris-yayasan",
  YAYASAN_BENDAHARA: "bendahara-yayasan",
  YAYASAN_PEMBINA: "pembina-aang-suandi",
  YAYASAN_PENGAWAS: "pengawas-asep-tamim",
  PESANTREN_PENGASUH: "pimpinan-pesantren",
  TKQ_KEPALA_SEKOLAH: "kepala-tkq",
  SDIT_KEPALA_SEKOLAH: "kepala-sdit",
  SMPIT_KEPALA_SEKOLAH: "kepala-smpit",
  SMAQ_KEPALA_SEKOLAH: "kepala-smaquran",
};

describe("office holders", () => {
  it("every portrait the list names is on the site", () => {
    for (const h of holders.filter((x) => x.photo)) {
      expect(fs.existsSync(path.join(PUBLIC, h.photo!)), h.photo).toBe(true);
    }
  });

  it("each office's demo account carries its holder's name and portrait", () => {
    for (const [roleCode, slug] of Object.entries(ACCOUNT_OFFICE)) {
      const account = DEMO_ACCOUNTS.find((a) => a.roleCode === roleCode);
      const holder = office(slug);
      expect(account?.name, roleCode).toBe(holder.name);
      expect(account?.photo, roleCode).toBe(holder.photo);
    }
  });

  it("the Anggota Pengurus account claims no person — the yayasan publishes none", () => {
    const anggota = DEMO_ACCOUNTS.find((a) => a.roleCode === "YAYASAN_ANGGOTA");
    expect(holders.map((h) => h.name)).not.toContain(anggota?.name);
    expect(anggota?.name).toBe("Anggota Pengurus Yayasan");
  });

  it("the public leaders are the office holders, spelled the same", () => {
    for (const leader of leadership) {
      const holder = office(leader.slug);
      expect(leader.name, leader.slug).toBe(holder.name);
      expect(leader.photo, leader.slug).toBe(holder.photo);
    }
  });

  it("a Pembina is neither Pengurus nor Pengawas, and no Pengurus is Pengawas (UU 16/2001 Ps. 29, 31, 40)", () => {
    const names = (group: string) =>
      new Set(holders.filter((h) => h.group === group).map((h) => h.name));
    const pembina = names("pembina");
    const pengurus = names("pengurus");
    const pengawas = names("pengawas");
    for (const n of pembina) {
      expect(pengurus.has(n) || pengawas.has(n), n).toBe(false);
    }
    for (const n of pengurus) expect(pengawas.has(n), n).toBe(false);
  });

  it("office slugs are unique — the site translates positions by them", () => {
    const slugs = holders.map((h) => h.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("carries no phone number — the brochure's are personal", () => {
    const src = fs.readFileSync(SOURCE, "utf8");
    expect(src).not.toMatch(/(\+62|\b0)8\d{7,}/);
  });
});
