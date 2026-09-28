# public-site-photography

> Where the pesantren's real photographs come from (pesantrencipansor.com), what was migrated for the Google for Nonprofits re-review, and the two articles deliberately left behind

**Google for Nonprofits declined cipansor.or.id on 2026-08-17** — "relies on
generic stock images"; qualifying needs "authentic, original photos of your
organization and its work" plus a "fully functional" site. Fixed in #411
(`95c52ad9`), deployed same day.

## The source of record for photos and articles

**`pesantrencipansor.com`** — the pesantren's own Laravel/Hostinger site. It is
where every genuine photograph on cipansor.or.id came from, and where to go for
more.

**Ia BUKAN situs kita.** Situs publik yang kita bangun dan gelar adalah
**`cipansor.or.id`** (apex publik; aplikasinya di `portal.cipansor.or.id`). `pesantrencipansor.com` hanya sumber
bahan. Pada 2026-09-05 saya menyebut widget chatbot "hidup di
pesantrencipansor.com" saat melapor ke pengguna, dan dikoreksi — salah domain
mengirim pengguna ke situs yang tidak memuat fitur yang baru digelar.

Structure:

```
/id/gallery/<album>        3 albums, 18 photos total (drone + DSLR, up to 6240x4160)
/id/blogs/<slug>           6 articles
/id/pimpinan-pesantren     6 leadership portraits
/storage/...               all assets, relative AND absolute URLs in the HTML
```

Scrape gotcha: album pages reference `/storage/...` **relatively**. A regex
anchored on `https://pesantrencipansor.com/storage/` finds 27 images and misses
15 — including 15 of the 18 gallery photos.

## What the audit actually found

The photographs already on the site were genuine; the problem was coverage.
Eleven of twelve public page types had **zero** photographs — a heading, a
paragraph and a row of lucide icons. Google's wording was wrong about the cause
and right about the effect. Do not "replace the stock photos"; there were none
to replace.

Now: `PublicPage` has a `heroImage` prop (eight pages at once), `/wakaf-infaq`
and `/public/spmb` take a `photo` prop because their bodies are client
components, and `/galeri` carries all 18 in three albums — linked from the
footer and the homepage, **not** the header (the 1024–1279px band has ~36px of
slack; see [mobile-layout-audit](../lessons/mobile-layout-audit.md) and navbar.tsx).

## What was deliberately NOT migrated

- **The Istanbul photo.** The Ramadhan article's cover on the old site is a
  licensed night shot of the Sultan Ahmed Mosque — the one true stock image in
  the whole source. Replaced with the pesantren's own congregation.
- **Two SPMB articles** (`test-spmb-gelombang-1`,
  `kupas-tuntas-spmb-gelombang-1-…`). Both define SPMB as "Seleksi Penerimaan
  **Mahasiswa** Baru" and advise on passing grades, SAINTEK/SOSHUM streams and
  private-campus early-bird schemes. Cipansor's SPMB admits **murid** to
  TK–SMA. The user's call, on being shown the evidence: *"kalau yang tidak
  relevan jangan dipindahkan."* Do not migrate them later without asking.

## Unit attribution rule

Only claim what a photograph shows. Uniform colour is unambiguous (merah-putih
= SD, putih-biru = SMP), so SDIT and SMPIT get their own assemblies. Nothing in
the archive identifies a TKQ, SMA Qur'an or Takhosus room, so those lead with
pesantren-wide scenes. A room captioned with a unit it may not belong to is the
same class of small lie as [teacher-dashboard-fake-stats](../lessons/teacher-dashboard-fake-stats.md).

Every UI change ships before/after screenshots (`AGENTS.md`).
