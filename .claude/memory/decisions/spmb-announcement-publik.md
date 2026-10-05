# spmb-announcement-publik

> KEPUTUSAN 2026-10-05: situs publik mengumumkan SPMB lewat **banner** (selalu,
> selama ada unit yang buka) **+ dialog tertunda 5 detik, sekali per periode**.
> Sumbernya `GET /admissions/public/intakes` ŌĆö tanpa perubahan skema. Di bawah:
> pembandingnya, sumber standarnya, dan syaratnya. Jangan ulang risetnya.

**Keputusan pengguna 2026-10-05**, sesudah satu putaran perbandingan enam
alternatif (A banner, B modal tertunda, C corner card, D pengumuman admin,
E tanpa pop-up, F hibrida). Pengguna memilih **F ŌĆö hibrida (banner + modal
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
2. **Modal tertunda tetap memenuhi permintaan "pop-up tiap buka situs"** tanpa
   menjadi interstitial: muncul sesudah 5 detik (bukan saat masuk), kecil, dua
   jalan keluar, tidak pernah di `/public/spmb` dan halaman verifikasi.
3. **C (corner card) ditolak** karena bertabrakan dengan InstallPrompt dan
   UpdatePrompt yang sudah di pojok kanan bawah.
4. **D (pengumuman admin-authored) ditolak** karena menyentuh `schema.prisma`
   (berisiko), butuh tata kelola "siapa boleh menyiarkan ke publik", dan isi
   satu bahasa sulit dijaga di situs tiga bahasa. Kalau kelak perlu
   mengumumkan hal **selain** SPMB, D yang dibuka ŌĆö bukan ditambal ke sini.

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
  "mati di portal", bukan "hidup di portal" ŌĆö `isPortalHost` salah untuk
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
  `ServiceWorkerRegister`, kecuali `spmb-announcement-force = "1"` ŌĆö supaya
  dialog 5 detik tidak menabrak suite e2e yang bukan tentang pengumuman ini.
- **Trilingual** (`config/announcement.i18n.ts`, dijaga
  `config/i18n-coverage.test.ts`); tahun ajaran dan nama unit dicetak apa
  adanya di semua bahasa, seperti halaman SPMB. Teksnya **dipisah per status**:
  saat `upcoming`, banner/dialog tidak boleh berbunyi "telah dibuka" atau
  "Daftar sekarang" (belum ada yang bisa mendaftar) ŌĆö ajakannya "Lihat info
  SPMB".

## Uji

- `apps/web/src/components/landing/spmb-announcement.test.tsx` ŌĆö aturan turunan
  + komponen (banner, dialog tertunda, dismissal per periode, gate portal).
- `apps/web/e2e/spmb-announcement.spec.ts` ŌĆö banner di beranda & halaman dalam,
  dialog muncul, dismissal bertahan, guard otomasi. Menulis satu periode lalu
  menghapusnya; dilewati di API produksi.
