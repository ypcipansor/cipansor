# spmb-announcement-publik

> KEPUTUSAN 2026-10-05: situs publik mengumumkan SPMB lewat **banner** (selalu,
> selama ada unit yang buka) **+ dialog tertunda 5 detik, sekali per periode**.
> Sumbernya `GET /admissions/public/intakes` — tanpa perubahan skema. Di bawah:
> pembandingnya, sumber standarnya, dan syaratnya. Jangan ulang risetnya.

**Keputusan pengguna 2026-10-05**, sesudah satu putaran perbandingan enam
alternatif (A banner, B modal tertunda, C corner card, D pengumuman admin,
E tanpa pop-up, F hibrida). Pengguna memilih **F — hibrida (banner + modal
tertunda)**, sesuai rekomendasi.

## Masalah yang diukur

- Halaman `/public/spmb` dan chatbot sudah membaca
  `GET /admissions/public/intakes`, tapi **hanya di halaman-halaman itu**.
  Pengunjung yang masuk lewat beranda atau halaman profil tidak tahu ada
  pembukaan SPMB.
- Badge hero pernah menulis tahun **"SPMB 2026 Telah Dibuka"** secara hardcode
  dan jadi basi begitu intake berganti. Apa pun yang baru harus **diturunkan**
  dari intake, bukan ditulis tangan.
- Badge hero kemudian memakai aturan turunan yang sama, tetapi **diulang**
  dengan banner yang baru: dua permukaan menyampaikan satu kalimat. Setelah
  banner ada di setiap halaman publik, badge hero **dihapus** (2026-10-05) —
  permintaannya sudah dipenuhi banner, dan satu pengumuman cukup satu
  permukaan.

## Kenapa F, bukan yang lain

Sumber: Google Search Central *Avoid intrusive interstitials* (2025-12-10,
"use banners instead of interstitials"); NN/g *Modal & Nonmodal Dialogs* dan
*Popups* (jangan tampilkan pop-up sebelum konten, kecuali kewajiban hukum);
Baymard (pengguna refleks menutup overlay saat halaman dimuat); GOV.UK
*Notification banner* (untuk tenggat yang mendekat, dan "sparingly"); USWDS
*Modal*; W3C WAI-ARIA APG + WCAG 2.1.2 (No Keyboard Trap) / 2.2.4.

1. **Banner = arahan Google, dan aman untuk Ad Grants.** Situs pernah ditolak
   Google for Nonprofits sekali; interstitial yang menutup konten adalah risiko
   yang tidak dibayar oleh apa pun.
2. **Dialog tertunda tetap memenuhi permintaan "pop-up tiap buka situs"** tanpa
   menjadi interstitial — dan penundaan 5 detik saja tidak cukup: Google
   menghitung overlay yang menutup konten saat pengguna sedang membaca sebagai
   interstitial juga, jadi dialognya **non-modal** (`modal={false}`): Radix
   tidak merender `DialogOverlay` sama sekali, halaman di bawahnya tetap
   terbaca dan bisa diklik, dan fokus tidak direbut. Muncul sesudah 5 detik
   (bukan saat masuk), kecil, dua jalan keluar, tidak pernah di `/public/spmb`
   dan halaman verifikasi.
3. **C (corner card) ditolak** karena bertabrakan dengan InstallPrompt dan
   UpdatePrompt yang sudah di pojok kanan bawah.
4. **D (pengumuman admin-authored) ditolak** karena menyentuh `schema.prisma`
   (berisiko), butuh tata kelola "siapa boleh menyiarkan ke publik", dan isi
   satu bahasa sulit dijaga di situs tiga bahasa. Kalau kelak perlu
   mengumumkan hal **selain** SPMB, D yang dibuka — bukan ditambal ke sini.

## Aturan turunannya (satu tempat)

`spmbAnnouncementOf(intakes)` di `packages/shared/src/schemas/admissions.ts`:

- unit yang `window === "open"` menang;
- jika tidak ada, unit yang **paling cepat dibuka** (`upcoming`, `opensAt`
  paling awal);
- jika tidak ada, tidak ada pengumuman.

Banner dan dialog memakai aturan yang sama, jadi keduanya tidak mungkin
berbeda kalimat. **Chatbot tidak memakainya**: ia membaca sumber yang
sama (`findPublicIntakes`) tetapi menjelaskan **setiap** unit satu per satu
(jadwal gelombang, biaya, persyaratan) dalam `modules/chatbot/live-facts.ts`,
bukan memilih satu pengumuman. Aturan turunan ini sengaja satu unit; chatbot
butuh semuanya. Yang dijaga tetap sama: sumbernya satu, jadi tidak ada dua
kebenaran tentang status pendaftaran.

**Tanggal hanya milik unit yang disebut.** Pengumuman memilih **satu** unit
(yang `open`, atau yang `upcoming` paling awal), jadi satu tanggal hanya benar
untuk unit itu. Dialog **tidak boleh** menyebut "dan unit lainnya" lalu
mencantumkan satu tanggal: unit lain bisa dibuka di hari yang berbeda, dan
keluarga unit itu akan membaca tanggal yang salah. Kalimatnya menyebut tanggal
itu sebagai milik unit yang disebut, lalu mengarahkan ke halaman SPMB untuk
jadwal unit lain (lihat `config/announcement.i18n.ts`). Bug ini ditemukan di
tinjauan PR #655 dan diperbaiki 2026-10-05.

## Syarat yang mudah dilupakan

- **Hanya host publik.** Dijaga `isPortalHost` di `app/page.tsx`,
  `components/landing/public-page.tsx` dan `app/wakaf-infaq/page.tsx`. Polaritas:
  "mati di portal", bukan "hidup di portal" — `isPortalHost` salah untuk
  localhost, jadi bentuk terbalik akan mematikan fitur ini di `pnpm dev` dan
  staging.
- **Dipasang sebagai anak pertama `<main>`** (di `PublicPage` dan beranda),
  supaya `sticky top-16` menempel persis di bawah navbar `fixed` (64px) tanpa
  tertutup, dan kotak alirnya tidak menutup konten di bawahnya. Beranda tidak
  lagi memakai `mt-16`: offset navbar dibawa hero-nya sendiri (`pt-24`).
- **`/wakaf-infaq` memasang banner sendiri** (`withDialog={false}`): halaman itu
  punya chrome sendiri, bukan `PublicPage`, dan dialog lima detik tidak boleh
  menyela alur donasi. Hanya bannernya yang tampil.
- **Dismissal disimpan per periode** (`spmb-announcement-banner` /
  `spmb-announcement-dialog` = `period.id`), jadi pengumuman tahun berikutnya
  muncul lagi. `isDismissed()` hanya membandingkan dengan `period.id`; tidak ada
  nilai ajaib "off".
- **Kesegaran status dijaga di komponen ini**, bukan default global:
  `usePublicIntakes({ staleTime: 15 menit, refetchInterval: 15 menit,
  refetchOnWindowFocus: true })`. Tanpa itu, tab yang terbuka sejak pagi masih
  menampilkan status kemarin (`QueryProvider` mematikan refetch-on-focus dan
  `usePublicIntakes` tidak polling).
- **Mundur di bawah otomasi** (`navigator.webdriver`), seperti
  `ServiceWorkerRegister`, kecuali `spmb-announcement-force = "1"` — supaya
  dialog 5 detik tidak menabrak suite e2e yang bukan tentang pengumuman ini.
  Karena banner **dirender server** (butir berikutnya) sedangkan
  `navigator.webdriver` hanya ada di peramban, penjaga ini dulu terlambat:
  banner sempat dilukis, lalu dihapus saat hidrasi, menggeser hero ~52px tepat
  saat Playwright menimbang stabilitas sebelum mengklik — tautan "Daftar SPMB"
  di `landing.spec.ts` meleset. Diperbaiki dengan skrip pra-lukis di
  `app/layout.tsx` yang menambahkan kelas `spmb-under-automation` ke `<html>`
  sebelum body diurai; aturan CSS di `globals.css` menyembunyikannya sejak
  lukisan pertama, dan komponennya tetap membuangnya dari DOM sesudahnya.
  Skrip itu juga membaca `spmb-announcement-force` supaya spec pengumuman
  sendiri tetap melihat bannernya.
- **Banner ada di lukisan pertama (SSR).** Halaman publik mengambil intake di
  server (`lib/public-intakes.server.ts`) dan menyerahkannya sebagai
  `initialIntakes`; komponen menginisialisasi `bannerOpen` dari keputusan server
  itu (`initialBannerDismissed`, dibaca dari cookie cermin
  `lib/announcement-cookies.ts`), dan hanya menerapkan penjaga otomasi +
  dismissal `localStorage` di `useLayoutEffect` — sebelum peramban melukis.
  Sebelumnya banner hanya muncul setelah query klien selesai, menggeser halaman
  ke bawah (CLS terukur ~0.035 di `/`, `/profil`, `/wakaf-infaq`). Karena
  `bannerOpen` awal harus sama di server dan klien, dismissal banner juga
  ditulis ke cookie yang bisa dibaca server; tanpa cermin itu pengunjung yang
  pernah menutup banner melihatnya berkelip lalu halaman naik saat hidrasi.
- **Trilingual** (`config/announcement.i18n.ts`, dijaga
  `config/i18n-coverage.test.ts`); tahun ajaran dan nama unit dicetak apa
  adanya di semua bahasa, seperti halaman SPMB. Teksnya **dipisah per status**:
  saat `upcoming`, banner/dialog tidak boleh berbunyi "telah dibuka" atau
  "Daftar sekarang" (belum ada yang bisa mendaftar) — ajakannya "Lihat info
  SPMB".
- **CTA dialog adalah tautan, bukan tombol di dalam tautan.** `DialogFooter`
  memakai `<Button asChild><Link href="/public/spmb">…</Link></Button>`
  (`Button` mendukung `asChild` lewat Radix `Slot`). Sebelumnya
  `<Link><Button>` menaruh `<button>` di dalam `<a>` — HTML tidak valid, dan
  `getByRole("link", …)` yang benar. Ditemukan di tinjauan PR #655, diperbaiki
  2026-10-08.
- **Dialog yang terbuka ikut tertutup saat refetch pindah ke periode yang sudah
  ditutup.** Effect dialog memanggil `setDialogOpen(false)` ketika
  `isDismissed(DIALOG_KEY, periodId)` benar, bukan sekadar `return`. Tanpa itu,
  refetch yang memindahkan pengumuman ke periode yang pernah ditutup pengunjung
  meninggalkan dialog basi yang masih berbicara tentang intake lama.
  Diperbaiki 2026-10-08.
- **Dialog non-modal** (`modal={false}`): tidak ada `DialogOverlay`, tidak ada
  perangkap fokus, dan `onOpenAutoFocus` dibatalkan — ia pemberitahuan, bukan
  langkah yang harus dijawab. Konsekuensinya `onPointerDownOutside` juga
  dibatalkan: tanpa itu, klik apa pun di halaman menutup dialog sekaligus
  menulis dismissal yang tidak pernah pengunjung buat. Diperbaiki 2026-10-08
  (poin tinjauan: risiko interstitial).
- **Tombol tutup dialog berlabel sendiri.** `DialogContent` bawaan merender X
  dengan `sr-only` "Close" (Inggris) di semua bahasa; pengumuman ini tiga
  bahasa, jadi dipasang `showCloseButton={false}` + `DialogClose` sendiri
  dengan `aria-label={copy.dismiss}` (`Tutup pengumuman` / `Dismiss announcement`
  / `إغلاق الإعلان`). Diperbaiki 2026-10-08.

## Uji

- `apps/web/src/components/landing/spmb-announcement.test.tsx` — aturan turunan
  + komponen (banner, dialog tertunda, dismissal per periode, dialog basi
  ikut tertutup saat refetch pindah ke periode yang sudah ditutup, gate portal).
- `apps/web/src/lib/locale-format.test.ts` — `dateFormatterFor` mengunci
  `timeZone: "Asia/Jakarta"`, sehingga `2026-12-31T17:00:00.000Z` (tengah malam
  WIB) tetap tampil "1 Januari 2027", bukan "31 Desember".
- `apps/web/e2e/spmb-announcement.spec.ts` — banner di beranda & halaman dalam,
  dialog muncul, dismissal bertahan, guard otomasi, dan (regresi) banner
  server-render disembunyikan sebelum lukisan di bawah otomasi sehingga tidak
  ada pergeseran tata letak. Menulis satu periode lalu menghapusnya; dilewati di
  API produksi.
- `apps/web/src/lib/public-intakes.server.test.ts` — pembacaan intake di server
  (banner dismissal dari cookie, periode yang diumumkan).
