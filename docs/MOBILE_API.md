# Kontrak API Aplikasi Mobile (Android) — Portal Orang Tua

Fondasi backend untuk aplikasi Android Cipansor (visi PR #298). Semua endpoint
sudah tersedia dan teruji di API; aplikasi Flutter tinggal mengonsumsinya.

Base URL: `https://<host>/api` — autentikasi Bearer JWT (login → access +
refresh token). Semua respons berbentuk `{ success, data, ... }`.

## 1. Autentikasi

> **Header `X-Client-Type: native` wajib.** Sesi web memakai cookie `HttpOnly`,
> dan API menghapus `accessToken` / `refreshToken` / `tempToken` dari body JSON
> agar tidak bisa dibaca skrip di origin (CWE-200). Klien native tidak punya
> cookie jar, jadi ia harus mengirim header `X-Client-Type: native` pada
> `POST /auth/login`, `POST /auth/2fa/login`, `POST /auth/refresh`, dan
> `POST /auth/roles/switch-role` untuk tetap menerima token di body. Tanpa
> header itu respons hanya berisi profil + `routing`.

| Endpoint                                 | Keterangan                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `POST /auth/login` `{email, password}`   | Orang tua login. Admin ber-2FA mendapat `requiresTwoFactor + tempToken`. |
| `POST /auth/refresh` `{refreshToken}`    | Perpanjang sesi.                                                         |
| `PUT /notifications/fcm-token` `{token}` | Daftarkan token push FCM perangkat (kirim `{token: null}` saat logout).  |

## 2. Capaian anak (role PARENT)

| Endpoint                                                            | Keterangan                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /parent/children`                                              | Daftar anak.                                                                         |
| `GET /parent/children/:studentId/weekly-progress`                   | Ringkasan mingguan: kehadiran, tahfidz (ziyadah/murojaah/nilai), perilaku, akademik. |
| `GET /parent/children/:studentId/tahfidz` / `attendance` / `grades` | Detail per domain.                                                                   |

## 3. Tagihan & pembayaran SPP

| Endpoint                                   | Keterangan                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /parent/children/:studentId/finance`  | Tagihan + ringkasan pembayaran anak.                                                                                                                                                                                                                                                             |
| `POST /finance/invoices/:id/payment-proof` | **Upload bukti transfer** — body `{amount, method, referenceNo?, proofUrl, notes?}`. Membuat Payment `PENDING_VERIFICATION`; kepemilikan diverifikasi (orang tua hanya bisa membayar tagihan anaknya). Unggah berkas gambarnya sendiri via `POST /upload` lalu pakai URL-nya sebagai `proofUrl`. |

### Alur verifikasi (maker-checker Tata Usaha)

```
PENDING_VERIFICATION → (TU unit memverifikasi) → TU_APPROVED
TU_APPROVED → (admin unit — orang berbeda — mengesahkan) → FINAL_APPROVED
PENDING/TU_APPROVED → REJECTED (dengan alasan)
```

- Tagihan & jurnal akuntansi hanya ter-update saat `FINAL_APPROVED`
  (idempotent — tidak mungkin terposting dua kali).
- Saat `FINAL_APPROVED`, orang tua & santri menerima notifikasi
  **"Pembayaran SPP Berhasil"** (in-app + email + WhatsApp bila provider
  dikonfigurasi). Saat `REJECTED`, notifikasi berisi alasan penolakan.
- Halaman TU web: `/finance/verification`.

## 4. Notifikasi

| Endpoint                             | Keterangan                        |
| ------------------------------------ | --------------------------------- |
| `GET /parent/notifications`          | Daftar notifikasi + unread count. |
| `PUT /parent/notifications/:id/read` | Tandai dibaca.                    |

**Pengingat bulanan otomatis**: setiap tanggal 1 pukul 06:00 scheduler
mengirim pengingat tagihan SPP bulan berjalan ke SEMUA orang tua
(in-app + WhatsApp Business API via template `payment_reminder`).

## 5. Konfigurasi server (env)

| Variabel                                                      | Fungsi                                            |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `WA_PROVIDER` = `META` \| `FONNTE` \| `WABLAS` \| `SIMULATOR` | Provider WhatsApp (default SIMULATOR = log saja). |
| `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`                       | Kredensial Meta Cloud API.                        |

## Status implementasi mobile

**Aplikasi mobile dikirim sebagai PWA (Progressive Web App)** dari `apps/web`,
menggantikan rencana Flutter terpisah di PR #298. Alasannya: web app sudah
matang dan terintegrasi penuh dengan API ini, sehingga satu basis kode langsung
menjadi aplikasi yang dapat dipasang di layar utama (Android/iOS) tanpa stack
Dart terpisah, toko aplikasi, atau CI mobile tambahan.

Yang sudah ada di repo:

- `apps/web/public/manifest.json` — nama, ikon (72–512, maskable), `display:
standalone`, shortcuts.
- `apps/web/public/icons/icon-*.png` — set ikon aplikasi.
- `apps/web/public/sw.js` — service worker: navigasi network-first + fallback
  `offline.html`, aset statis cache-first, `/api/**` selalu ke jaringan (tidak
  pernah di-cache agar data auth/sesi selalu segar). Handler `push` +
  `notificationclick` sudah siap untuk Web Push.
- `ServiceWorkerRegister` + `InstallPrompt` (`components/pwa/*`) di root layout —
  registrasi SW (produksi saja) dan tombol "Pasang aplikasi".
- Metadata iOS (`appleWebApp`, apple-touch-icon) + `themeColor`.

Portal Orang Tua (`/parent/*`) adalah target utama mobile dan sudah responsif
(sidebar Sheet di layar kecil).

**Langkah lanjut opsional (butuh kredensial/tooling di luar repo):**

- **Push nyata:** Web Push (VAPID) atau FCM. Endpoint pendaftaran token perangkat
  (`PUT /notifications/fcm-token`) sudah ada; server-side sender menunggu
  kredensial VAPID/`google-services`.
- **APK Play Store:** bungkus PWA yang sama dengan Capacitor (≈95% reuse) —
  butuh Android SDK/signing (dibangun di luar environment ini).
