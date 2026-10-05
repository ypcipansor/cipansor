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

- Halaman `/public/spmb`, badge hero (`SpmbStatusBadge`) dan chatbot sudah
  membaca `GET /admissions/public/intakes`, tapi **hanya di halaman-halaman
  itu**. Pengunjung yang masuk lewat beranda atau halaman profil tidak tahu
  ada pembukaan SPMB.
- Badge hero pernah menulis tahun **"SPMB 2026 Telah Dibuka"** secara hardcode
  dan jadi basi begitu intake berganti. Apa pun yang baru harus **diturunkan**
  dari intake, bukan ditulis tangan.

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
   mengumumkan hal **selain** SPMB, D yang dibuka — bukan ditambal ke sini.

## Aturan turunannya (satu tempat)

`spmbAnnouncementOf(intakes)` di `packages/shared/src/schemas/admissions.ts`:

- unit yang `window === "open"` menang;
- jika tidak ada, unit yang **paling cepat dibuka** (`upcoming`, `opensAt`
  paling awal);
- jika tidak ada, tidak ada pengumuman.

Banner, dialog, badge hero dan chatbot memakai aturan yang sama, jadi tidak
mungkin berbeda kalimat.

## Syarat yang mudah dilupakan

- **Hanya host publik.** Dijaga `isPortalHost` di `app/page.tsx` dan
  `components/landing/public-page.tsx`. Polaritas: "mati di portal", bukan
  "hidup di portal" — `isPortalHost` salah untuk localhost, jadi bentuk
  terbalik akan mematikan fitur ini di `pnpm dev` dan staging.
- **Dismissal disimpan per periode** (`spmb-announcement-banner` /
  `spmb-announcement-dialog` = `period.id`), jadi pengumuman tahun berikutnya
  muncul lagi. Nilai `"off"` = jangan pernah tampil (dipakai suite e2e lain).
- **Mundur di bawah otomasi** (`navigator.webdriver`), seperti
  `ServiceWorkerRegister`, kecuali `spmb-announcement-force = "1"` — supaya
  dialog 5 detik tidak menabrak suite e2e yang bukan tentang pengumuman ini.
- **Trilingual** (`config/announcement.i18n.ts`, dijaga
  `config/i18n-coverage.test.ts`); tahun ajaran dan nama unit dicetak apa
  adanya di semua bahasa, seperti halaman SPMB.

## Uji

- `apps/web/src/components/landing/spmb-announcement.test.tsx` — aturan turunan
  + komponen (banner, dialog tertunda, dismissal per periode, gate portal).
- `apps/web/e2e/spmb-announcement.spec.ts` — banner di beranda & halaman dalam,
  dialog muncul, dismissal bertahan, guard otomasi. Menulis satu periode lalu
  menghapusnya; dilewati di API produksi.
