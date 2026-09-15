# STRATEGI OPTIMALISASI TEKNOLOGI NONPROFIT CIPANSOR
## Pemanfaatan Maksimal Google Workspace & Microsoft for Nonprofits

Document Status: **DRAFT FOR REVIEW / APPROVAL**
Target Organization: **Yayasan Pesantren Cipansor**
Date: **2026**

> **Pembaruan penting (2026):** Daftar benefit di dokumen ini diperbarui agar
> sesuai dengan program hibah yang berlaku *saat ini*. Dua hibah Microsoft yang
> dulu gratis — **Office 365 E1** dan **Microsoft 365 Business Premium** —
> **dihentikan per 1 Juli 2025** (lisensi berakhir pada perpanjangan berikutnya).
> Yang tersedia gratis kini **Microsoft 365 Business Basic (s.d. 300 pengguna)**.

---

## 1. RINGKASAN EKSEKUTIF & TUJUAN STRATEGIS

Yayasan Pesantren Cipansor berhak dan telah mendapatkan akses ke dua ekosistem teknologi nonprofit global:

1. **Google Workspace for Nonprofits** — gratis untuk organisasi terverifikasi (s.d. 2.000 pengguna, email domain sendiri, 100 TB storage bersama, Meet 150 partisipan) + **Google Ad Grants s.d. $10.000/bulan**.
2. **Microsoft for Nonprofits** — **Microsoft 365 Business Basic gratis s.d. 300 pengguna** (aplikasi web/mobile saja) + **Azure grant US$2.000/tahun** + diskon hingga 75% untuk Business Premium/E1.

Dokumen ini menyusun strategi arsitektur dan bisnis terbaik untuk menggabungkan kedua benefit guna memberikan **dampak operasional terbesar, keamanan maksimal, dan efisiensi biaya sebesar 100% (Rp 0/bulan untuk software & infrastruktur cloud dasar)**.

---

## 2. ANALISIS PINTU MASUK & IDENTITAS (SSO / SINGLE SIGN-ON)

### 2.1 Evaluasi Opsi Autentikasi

| Opsi Autentikasi | Kelebihan | Kekurangan | Kesimpulan & Kelayakan |
|---|---|---|---|
| **1. Lokal Saja (Password di DB Prisma)** | • Sederhana, tidak tergantung pihak ketiga.<br>• Kontrol penuh di DB sendiri. | • Beban manajemen password & reset di admin.<br>• Resiko keamanan (phishing/leaked password) tinggi.<br>• Tidak ada MFA bawaan ekosistem domain. | ❌ Kurang Direkomendasikan untuk Staf/Guru. Tetap dipakai khusus Santri/Wali Murid yang belum punya email domain. |
| **2. Google OAuth Saja** | • Sangat familiar bagi pengguna Indonesia.<br>• Integrasi native dengan Gmail, Google Drive, Google Classroom.<br>• Login 1-klik via browser Chrome/Android. | • Tergantung 1 provider.<br>• Pengguna Microsoft Outlook/Teams butuh login terpisah. | 🟡 Baik, tapi membatasi pemanfaatan lisensi Microsoft 365. |
| **3. Microsoft Entra ID (Azure AD) Saja** | • Keamanan kelas enterprise (Conditional Access, MFA).<br>• Integrasi seamless dengan M365 (Office Web, Teams, OneDrive). | • Antarmuka login Microsoft kurang akrab bagi sebagian wali murid. | 🟡 Baik untuk staf internal, kurang fleksibel untuk eksternal. |
| **4. Hybrid Keduanya (Google + Microsoft)** | • Fleksibel.<br>• Pengguna bisa pilih "Login with Google" atau "Login with Microsoft". | • Kompleksitas sinkronisasi akun (2 provider terpisah jika email beda). | 🟠 Rumit di sisi manajemen pengguna jika tidak terpusat. |
| **5. Hybrid Terpusat (Lokal + Google Workspace SSO + Microsoft Entra ID OIDC)** | • **Paling Ideal**: Pengguna internal (Guru/Staf/Yayasan) menggunakan Email Domain (`@cipansor.or.id`) via **Google Workspace SSO** atau **Microsoft Entra ID**.<br>• Santri / Wali Santri / Alumni dapat menggunakan Akun Lokal (Password/OTP) atau Google Personal.<br>• Admin bisa memetakan RoleCode otomatis berdasarkan domain/email. | • Membutuhkan setup OAuth2/OIDC di backend API (`apps/api`). | **✅ REKOMENDASI UTAMA (BEST PRACTICE)** |

### 2.2 Rekomendasi Arsitektur Autentikasi Cipansor (Status Implementasi)
* **Pengguna Internal (Yayasan, Kepala Sekolah, Guru, Staf TU):** SSO menggunakan akun Google Workspace / Microsoft 365 domain `@cipansor.or.id`.
* **Pengguna Eksternal (Siswa, Wali Santri, Alumni, Calon Santri PSB):** Kombinasi Email/Password Lokal + Google OAuth2 Publik.

**Status kode yang sudah ada di `apps/api`:** endpoint `POST /api/auth/sso/login` dan `GET /api/auth/sso/config` (menukarkan `idToken` Google/Microsoft yang sudah diverifikasi OIDC). Rute login SSO **sengaja tidak dipasangi Captcha/Turnstile** — kredensialnya adalah `idToken` yang diterbitkan oleh penyedia OIDC yang sudah menerapkan perlindungan bot-nya sendiri — dan dilindungi `authLimiter`. SSO disarankan **hanya diaktifkan bila alur web (login page → React Query hook → API) sudah terhubung ujung-ke-ujung dan semua tes e2e lulus**; jika belum, defer SSO ke fase lanjutan.

---

## 3. STRATEGI PEMBAGIAN PERAN & EKOSISTEM SOFTWARE (BEST PRACTICE WORKFLOW)

Agar tidak terjadi tumpang tindih penggunaan antara Google Workspace dan Microsoft 365, setiap beban kerja dipetakan ke SATU platform kanonis:

```
                                  ┌─────────────────────────────────────────┐
                                  │       PORTAL UTAMA SIB CIPANSOR         │
                                  │       (portal.cipansor.or.id)           │
                                  └────────────────────┬────────────────────┘
                                                       │
                     ┌─────────────────────────────────┴─────────────────────────────────┐
                     ▼                                                                   ▼
       ┌───────────────────────────┐                                       ┌───────────────────────────┐
       │   GOOGLE WORKSPACE HUB    │                                       │   MICROSOFT 365 & AZURE   │
       └─────────────┬─────────────┘                                       └─────────────┬─────────────┘
                     │                                                                   │
    ┌────────────────┴──────────────┐                                   ┌────────────────┴──────────────┐
    │ • Gmail (Email Resmi System)   │                                   │ • Azure Cloud Host ($2.000/th)│
    │ • Google Ad Grants ($10k/bln) │                                   │ • Azure Blob Storage (Docs/PDF)│
    │ • Google Drive (Dokumen Guru) │                                   │ • Microsoft Teams (Rapat Inst)│
    │ • Google Forms/Sheets (Survei)│                                   │ • SharePoint (Arsip Yayasan)  │
    └───────────────────────────────┘                                   └───────────────────────────────┘
```

### 3.1 Google Workspace for Nonprofits
* **Paket gratis** untuk organisasi nonprofit terverifikasi: email domain sendiri, Meet s.d. 150 partisipan, **100 TB storage terpooling**, kontrol admin & keamanan standar, **s.d. 2.000 pengguna**.
* **Paket berbayar diskon** bila butuh lebih: **Business Standard ± $3.50/user/bulan** (diskon 75%+) dan **Business Plus ± $6.16/user/bulan** (diskon 72%+), komitmen 1 tahun.
* **Verifikasi**: melalui **Goodstack** (mitra validasi Google) atau via **TechSoup** di sebagian negara. Siapkan dokumen legalitas (status yayasan/nonprofit, akta, SK Kemenkumham, NPWP).
* **⚠️ Syarat kelayakan**: Google *mengecualikan* **sekolah/universitas, rumah sakit, dan lembaga pemerintah**. Yayasan Pesantren Cipansor harus terdaftar sebagai **yayasan nonprofit (foundation)**, bukan sebagai "sekolah" — badan pesantren-lah yang layak, bukan operasional kelasnya. Ini satu-satunya jalan agar Ad Grants tetap bisa digunakan.
* **Fungsi utama:**
  1. **Gmail API Integration:** Email transaksional sistem (Notifikasi, E-Office, Reset Password, Tagihan SPP) via `noreply@cipansor.or.id` (service account, domain-wide delegation, scope `gmail.send` saja — lihat `docs/EMAIL_SETUP.md`).
  2. **Google Ad Grants ($10.000/bulan):** Iklan pencarian Google untuk PPDB, donasi & wakaf pesantren. **Tidak rollover** antar bulan; wajib menjaga konversi & aktivitas akun (CTR ≥5%, hindari kata kunci generik satu kata) atau akun ditangguhkan.
  3. **Google Drive & Docs:** Kolaborasi RPP/Modul Ajar, Kurikulum Merdeka, dokumen operasional harian.
  4. **Google Meet & Calendar:** Jadwal akademik terintegrasi & rapat orang tua online.

### 3.2 Microsoft for Nonprofits & Azure Grant (US$2.000/Tahun)
* **Microsoft 365 Business Basic gratis s.d. 300 pengguna** — hanya aplikasi **web & mobile** (Word/Excel/PowerPoint online), **tanpa Office desktop**. Termasuk Teams, 1 TB OneDrive per user, dan email bisnis.
* **Butuh Office desktop atau DLP?** Upgrade ke **Microsoft 365 Business Premium** (diskon hingga 75%, sekitar **$5.50/user/bulan** komitmen tahunan) — atau tetap di Basic dan pakai SharePoint/Teams untuk proteksi data.
* **Lisensi E1 / Business Premium gratis sudah pensiun (1 Juli 2025).** Pertimbangkan migrasi ke Basic gratis atau Business Premium berdiskon sebelum perpanjangan berikutnya.
* **Azure grant US$2.000/tahun** untuk hosting, VM, database, dan solusi AI. **Tidak rollover** — pakai & pantau dengan **Azure Cost Management + alert** sebelum masa aktif habis.
* **Kerapatan pemanfaatan:** pantau utilitas lisensi M365 dan **email perpanjangan dari Microsoft** — akun yang tidak digunakan/diperpanjang bisa kehilangan grant.
* **Fungsi utama:**
  1. **Azure Cloud Infrastructure:** Azure Container Apps / App Service untuk container Docker `cipansor-api` & `cipansor-web`; Azure Database for PostgreSQL (Flexible Server). Menutup biaya hosting s.d. Rp 0/tahun lewat grant.
  2. **Azure Blob Storage:** Storage terpusat berkas PDF E-Office, Surat Keputusan Yayasan, dokumen PPDB, foto kegiatan. **Container privat** disajikan lewat **SAS berumur pendek yang dibuat saat permintaan** (tidak pernah disimpan sebagai tautan permanen) — lihat `apps/api/src/utils/cloud-storage.ts` & `docs/AZURE_DEPLOYMENT.md`.
  3. **Microsoft Teams & SharePoint:** Arsip dokumen legalitas yayasan yang sensitif dengan proteksi DLP bawaan Microsoft.

---

## 4. OPTIMALISASI BERKAS & STORAGE (E-OFFICE, PPDB, & SANTRI)

### 4.1 Permasalahan Saat Ini
File E-Office, lampiran tanda tangan digital (E-Sign), dan berkas pendaftaran PPDB kembar ke penyimpanan lokal yang rentan hilang saat redeploy container dan membebani database.

### 4.2 Solusi Arsitektur Storage Terintegrasi
Mengintegrasikan **Azure Blob Storage** (menggunakan Azure grant $2.000) sebagai provider penyimpanan utama di `apps/api`:
* Container `e-office-documents` (privat): PDF Surat Keluar/Masuk, Lampiran, & QR E-Sign.
* Container `student-documents` (privat): Berkas Akta/KK/Ijazah Santri & PPDB.
* Container `media-public` (public): Foto Galeri, Banner Landing Page, Bukti Transfer Donasi/SPP.

**Aturan akses (sudah diimplementasikan):** container publik memakai `access: 'blob'` (tanpa SAS). Container privat menyimpan **referensi blob** (container + nama blob) dan SAS ber-umur pendek dibuat **saat permintaan unduh** — bukan disimpan di DB. Dengan begitu berkas privat tidak menjadi tidak dapat diakses setelah tautan 24 jam kedaluwarsa.

---

## 5. PEMASARAN DIGITAL & PPDB (GOOGLE AD GRANTS $10.000/BULAN)

### 5.1 Strategi Funnel Penerimaan Santri Baru (PPDB) & Donasi
1. **Target Kata Kunci (Google Search Ads):**
   - "Pesantren Tahfidz Terbaik di [Lokasi/Jabar]"
   - "SMA Al-Qur'an Beasiswa"
   - "Pendaftaran SMP IT / SD IT Tahfidz"
   - "Wakaf Pembangunan Pesantren"
2. **Landing Page Optimization (`cipansor.or.id/psb` & `/donasi`):**
   - Integrasi Google Analytics 4 (GA4) & Google Tag Manager untuk tracking konversi.
   - Pendaftaran online terhubung ke Modul PPDB SIB Cipansor.
3. **Kepatuhan Ad Grants:** halaman tujuan (landing page) harus relevan & memiliki konten yang cukup; pasang **conversion tracking**; jaga aktivitas akun mingguan; hindari kata kunci satu kata generik; waktunya 2–3 minggu untuk persetujuan awal.

---

## 6. KOMBINASI TERBAIK: SATU CANONICAL PLATFORM PER BEBAN KERJA

Untuk menghindari tumpang tindih dan biaya ganda:
1. **Google Workspace** = kanonis untuk **Gmail** (deliverability terbaik) + **Drive** (kolaborasi dengan pihak eksternal) + **Ad Grants**.
2. **Microsoft/Azure** = kanonis untuk **cloud hosting** (container + PostgreSQL) + **Blob storage** + **Teams/SharePoint** (keamanan/DLP enterprise).
3. **Satu otoritas email.** Arahkan **MX/SPF/DKIM/DMARC** ke penyedia pengirim (Google), dan tambahkan penyedia lain hanya sebagai **app-only + SSO**. Jangan mengirim dari dua sistem; dokumentasikan tata kelola agar staf tahu alat mana untuk apa.

---

## 7. MATRIKS IMPLEMENTASI KODE (DELIVERABLE B ROADMAP)

**Status pengerjaan (per pembaruan strategi ini):**
1. **Backend Auth Module (`apps/api/src/modules/auth`)**: endpoint `POST /api/auth/sso/login` & `GET /api/auth/sso/config` sudah ada; verifikasi `idToken` OIDC via `jwks-rsa`. — *Partial → perlu verifikasi alur web ujung-ke-ujung.*
2. **Storage Module**: `apps/api/src/utils/cloud-storage.ts` (Azure Blob upload + SAS on-demand) sudah ada; dipakai `apps/api/src/middleware/upload.ts`. — *Implemented.*
3. **Dokumentasi Deployment Azure (`docs/AZURE_DEPLOYMENT.md`)**: sudah ada. — *Implemented.*
4. **Email transaksional via Gmail API** (`apps/api/src/modules/notifications`, `apps/api/src/lib/google-service-account.ts`, `docs/EMAIL_SETUP.md`): sudah ada (service account, domain-wide delegation, scope `gmail.send`). — *Implemented.*
5. **Yang belum / perlu diputuskan**: menghidupkan SSO penuh di UI portal + tes e2e (`apps/web/e2e/sso.spec.ts`); penyesuaian panduan verifikasi untuk memenuhi syarat kelayakan Google (pendaftaran sebagai yayasan, bukan sekolah).
