# CIPANSOR

> **Sistem Informasi Cipansor** — platform terintegrasi untuk **TK Qur'an, SD IT,
> SMP IT, SMA Qur'an, dan Pesantren** (tahfidz + kurikulum pesantren) di bawah
> Yayasan Pesantren Cipansor.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-blueviolet.svg)](https://www.prisma.io/)
[![Express](https://img.shields.io/badge/Express-5-green.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791.svg)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Daftar Isi

- [Ikhtisar](#ikhtisar)
- [Statistik Proyek](#statistik-proyek)
- [Arsitektur Singkat](#arsitektur-singkat)
- [Peran Pengguna](#peran-pengguna)
- [Antarmuka](#antarmuka)
- [Galeri Lengkap Halaman](#galeri-lengkap-halaman)
- [Galeri Per Peran](#galeri-per-peran)
- [Fitur Utama](#fitur-utama)
- [Modul API](#modul-api)
- [Teknologi](#teknologi)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Testing](#testing)
- [Visual QA](#visual-qa)
- [Kualitas & Gate Rilis](#kualitas--gate-rilis)
- [Dokumentasi](#dokumentasi)
- [Kontribusi](#kontribusi)
- [Lisensi](#lisensi)

---

## Ikhtisar

**Cipansor** adalah sistem manajemen pendidikan (ERP sekolah/pesantren) yang
menggabungkan tiga dunia dalam satu platform:

1. **Akademik formal** — siswa, kelas, jadwal, absensi, penilaian, rapor
   (K13 dan Kurikulum Merdeka), serta CBT/ujian online.
2. **Kepesantrenan** — tahfidz (ziyadah, murojaah, simaan/tasmi'), ibadah
   harian, kitab, muhadhoroh, asrama, perizinan, dan poin kedisiplinan.
3. **Administratif yayasan** — keuangan (SPMB, SPP, payroll), SDM, aset &
   inventaris, e-office (surat + tanda tangan elektronik), dan SPMI.

Seluruhnya berjalan sebagai **satu monorepo** dengan satu Web client yang
melayani **dua host** (situs publik dan portal internal) dari satu build.

---

## Statistik Proyek

Angka-angka berikut diambil langsung dari basis kode (per September 2026):

| Metrik                               | Jumlah    |
| ------------------------------------ | --------- |
| Modul API (`apps/api/src/modules`)   | **94**    |
| Model Prisma                         | **287**   |
| Enum Prisma                          | **152**   |
| Halaman web (`page.tsx`)             | **446**   |
| Peran (`RoleCode`)                   | **66**    |
| Akun demo (satu per peran)           | **66**    |
| Spesifikasi Playwright e2e           | **84**    |
| Berkas test API (vitest)             | **282**   |
| Berkas test web (vitest)             | **28**    |
| Halaman terverifikasi visual (sweep) | **755**   |
| Halaman per peran terverifikasi      | **1.200** |

> Angka dapat bergeser seiring perubahan; skrip verifikasi
> (`pnpm --filter web test` dan gate di bawah) adalah sumber kebenaran, bukan
> tabel ini. Dua baris terakhir berasal dari sweep visual-QA: **755 rute** unik
> dirender sebagai SUPER_ADMIN (784 tangkapan, termasuk pembacaan host publik)
> dan **1.200 halaman** dibuka lewat menu tiap peran, seluruhnya tanpa halaman
> kosong/error (lihat [Visual QA](#visual-qa)).

---

## Arsitektur Singkat

```
apps/
  api/        Express 5 + Prisma 7 REST API (+ Socket.IO realtime, cron jobs)
  web/        Next.js 16 (App Router) + React 19 + React Query
packages/
  shared/     @cipansor/shared — DTO & skema Zod untuk kedua aplikasi
```

- **Backend** memakai struktur modular per fitur:
  `routes → controller → service → schema`, dengan lapisan service satu-satunya
  yang menyentuh Prisma. Lihat [`apps/api/AGENTS.md`](apps/api/AGENTS.md).
- **Frontend** memakai App Router dengan data layer terpusat (Axios +
  React Query) di `src/hooks/*`. Tidak ada data mock di halaman — setiap
  tampilan terhubung ke endpoint nyata. Lihat
  [`apps/web/AGENTS.md`](apps/web/AGENTS.md).
- **Kontrak** request/response hidup sekali di `@cipansor/shared` dan dipakai
  ulang oleh kedua aplikasi.

Rincian lengkap ada di [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Peran Pengguna

Sistem mengenali **66 `RoleCode`** yang dikelompokkan menjadi delapan realm.
Setiap peran memiliki akun demo dengan kata sandi yang sama, dan **setiap akun
dijamin bisa login** karena daftar akun adalah satu sumber kebenaran
(`packages/shared/src/types/demo-accounts.ts`) yang dipakai bersama oleh seed API
dan halaman login.

| Realm                   | Peran                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global & Yayasan**    | `SUPER_ADMIN`, `YAYASAN_PEMBINA`, `YAYASAN_KETUA`, `YAYASAN_SEKRETARIS`, `YAYASAN_BENDAHARA`, `YAYASAN_ANGGOTA`, `YAYASAN_PENGAWAS`                                     |
| **Pesantren**           | `PESANTREN_PENGASUH`, `PESANTREN_DIREKTUR`, `PESANTREN_TATA_USAHA`, `USTADZ`, `MUSYRIF`, `MUSYRIFAH`, `MUHAFIDZ`, `MUHAFIDZAH`, `MURABBI`, `WALI_KAMAR`                 |
| **TK Qur'an**           | `TKQ_ADMIN`, `TKQ_KEPALA_SEKOLAH`, `TKQ_WAKASEK`, `TKQ_GURU`, `TKQ_WALI_KELAS`, `TKQ_TATA_USAHA`, `TKQ_BENDAHARA`, `TKQ_KOMITE`, `TKQ_ORANG_TUA`                        |
| **SD IT**               | `SDIT_ADMIN`, `SDIT_KEPALA_SEKOLAH`, `SDIT_WAKASEK`, `SDIT_GURU`, `SDIT_WALI_KELAS`, `SDIT_TATA_USAHA`, `SDIT_BENDAHARA`, `SDIT_KOMITE`, `SDIT_ORANG_TUA`, `SDIT_SISWA` |
| **SMP IT**              | `SMPIT_*` (admin, kepala sekolah, wakasek, guru, wali kelas, guru BK, tata usaha, bendahara, komite, orang tua, siswa, alumni)                                          |
| **SMA Qur'an**          | `SMAQ_*` (idem dengan SMP IT)                                                                                                                                           |
| **Sarana & Unit Usaha** | `PUSTAKAWAN`, `PERAWAT`, `KEAMANAN`, `LABORAN`, `BUSINESS_MANAGER`, `BUSINESS_STAFF`                                                                                    |

Akses dijaga berlapis: `middleware.ts` memblokir rute, `config/navigation.ts`
mengatur menu, dan API memeriksa `RoleCode`/permission di setiap endpoint.

---

## Antarmuka

Tangkapan layar di bawah diambil dari build yang berjalan (view 1440×900).
Semua gambar diverifikasi tidak kosong/error sebelum ditampilkan.

### 1. Dashboard Eksekutif & Unit

| Dashboard Global                                      | Dashboard SMA Al-Qur'an                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| ![Dashboard Global](docs/images/dashboard-global.png) | ![Dashboard SMA](docs/images/dashboard-sma.png) |

| Dashboard SMP IT                                | Dashboard SD IT                               |
| ----------------------------------------------- | --------------------------------------------- |
| ![Dashboard SMP](docs/images/dashboard-smp.png) | ![Dashboard SD](docs/images/dashboard-sd.png) |

| Dashboard PAUD/TK                                 | Dashboard Umum                          |
| ------------------------------------------------- | --------------------------------------- |
| ![Dashboard PAUD](docs/images/dashboard-paud.png) | ![Dashboard](docs/images/dashboard.png) |

| Login                           | Reset Password                                    |
| ------------------------------- | ------------------------------------------------- |
| ![Login](docs/images/login.png) | ![Reset Password](docs/images/reset-password.png) |

### 2. Manajemen Yayasan & Administrasi

| Profil & Unit                          | Keuangan Yayasan                     |
| -------------------------------------- | ------------------------------------ |
| ![Yayasan](docs/images/foundation.png) | ![Keuangan](docs/images/finance.png) |

| Kepegawaian (HR)          | E-Office (Surat)                      |
| ------------------------- | ------------------------------------- |
| ![HR](docs/images/hr.png) | ![E-Office](docs/images/e-office.png) |

| Dashboard Guru                      | Jadwal Piket                                |
| ----------------------------------- | ------------------------------------------- |
| ![Teacher](docs/images/teacher.png) | ![Duty Roster](docs/images/duty-roster.png) |

| Detail Pegawai                                      | Cuti (Terverifikasi)                                         |
| --------------------------------------------------- | ------------------------------------------------------------ |
| ![Employee Detail](docs/images/employee-detail.png) | ![Leaves Verified](docs/images/admin_my_leaves_verified.png) |

| Resepsionis (Buku Tamu)                 | Pengadaan (Procurement)                     |
| --------------------------------------- | ------------------------------------------- |
| ![Reception](docs/images/reception.png) | ![Procurement](docs/images/procurement.png) |

| Manajemen User                  | Analitik & Laporan                      |
| ------------------------------- | --------------------------------------- |
| ![Users](docs/images/users.png) | ![Analytics](docs/images/analytics.png) |

| Laporan Pusat                       | Manajemen Unit                  |
| ----------------------------------- | ------------------------------- |
| ![Reports](docs/images/reports.png) | ![Units](docs/images/units.png) |

| Marketing & Pendaftaran                 | Penjaminan Mutu (SPMI)              |
| --------------------------------------- | ----------------------------------- |
| ![Marketing](docs/images/marketing.png) | ![Quality](docs/images/quality.png) |

| Dashboard Staff                 | Pengaturan Sistem                     |
| ------------------------------- | ------------------------------------- |
| ![Staff](docs/images/staff.png) | ![Settings](docs/images/settings.png) |

### 3. Akademik & Pembelajaran

| Data Siswa                            | Kelas & Jadwal                      |
| ------------------------------------- | ----------------------------------- |
| ![Students](docs/images/students.png) | ![Classes](docs/images/classes.png) |

| Kurikulum                                 | Kalender Akademik                     |
| ----------------------------------------- | ------------------------------------- |
| ![Curriculum](docs/images/curriculum.png) | ![Calendar](docs/images/calendar.png) |

| Absensi                                   | Penilaian (Rapor)                         |
| ----------------------------------------- | ----------------------------------------- |
| ![Attendance](docs/images/attendance.png) | ![Assessment](docs/images/assessment.png) |

| Sertifikat & Ijazah                           | Wali Kelas (Homeroom)                 |
| --------------------------------------------- | ------------------------------------- |
| ![Certificates](docs/images/certificates.png) | ![Homeroom](docs/images/homeroom.png) |

| Tahun Ajaran                                      | Jadwal Pelajaran                      |
| ------------------------------------------------- | ------------------------------------- |
| ![Academic Years](docs/images/academic-years.png) | ![Schedule](docs/images/schedule.png) |

| Detail Siswa                                      | Perpustakaan                        |
| ------------------------------------------------- | ----------------------------------- |
| ![Student Detail](docs/images/student-detail.png) | ![Library](docs/images/library.png) |

| Rapor PAUD                                     | Manajemen PAUD                |
| ---------------------------------------------- | ----------------------------- |
| ![PAUD Rapor](docs/images/tk-daily-report.png) | ![PAUD](docs/images/paud.png) |

| Daftar Siswa PAUD                       | Laporan Harian (Bulk)                                   |
| --------------------------------------- | ------------------------------------------------------- |
| ![PAUD List](docs/images/paud-list.png) | ![Daily Report Bulk](docs/images/daily-report-bulk.png) |

| Portofolio Siswa                        |     |
| --------------------------------------- | --- |
| ![Portfolio](docs/images/portfolio.png) |     |

### 4. Kepesantrenan (Boarding System)

| Tahfidz Quran                       | Setoran Hafalan                      |
| ----------------------------------- | ------------------------------------ |
| ![Tahfidz](docs/images/tahfidz.png) | ![Setoran](docs/images/takhosus.png) |

| Ibadah Harian                     | Muhasabah Diri                          |
| --------------------------------- | --------------------------------------- |
| ![Ibadah](docs/images/ibadah.png) | ![Muhasabah](docs/images/muhasabah.png) |

| Pembelajaran Kitab                       | Muhadatsah (Bahasa)                       |
| ---------------------------------------- | ----------------------------------------- |
| ![Kitab](docs/images/kitab-progress.png) | ![Muhadatsah](docs/images/muhadatsah.png) |

| Asrama & Musyrif                            | Muhadhoroh (Pidato)                       |
| ------------------------------------------- | ----------------------------------------- |
| ![Dormitories](docs/images/dormitories.png) | ![Muhadhoroh](docs/images/muhadhoroh.png) |

| Dashboard Musyrif                   | Rapor Pesantren                                     |
| ----------------------------------- | --------------------------------------------------- |
| ![Musyrif](docs/images/musyrif.png) | ![Rapor Pesantren](docs/images/rapor-pesantren.png) |

| Pelanggaran                               | Konseling & Perizinan                     |
| ----------------------------------------- | ----------------------------------------- |
| ![Violations](docs/images/violations.png) | ![Counseling](docs/images/counseling.png) |

| Perizinan (Detail)                  | Penghargaan (Reward)                |
| ----------------------------------- | ----------------------------------- |
| ![Permits](docs/images/permits.png) | ![Rewards](docs/images/rewards.png) |

### 5. Fasilitas & Layanan Pendukung

| Kesehatan (UKS)                   | Tabungan Santri (E-Wallet)        |
| --------------------------------- | --------------------------------- |
| ![Health](docs/images/health.png) | ![Wallet](docs/images/wallet.png) |

| Makan (Catering)                | Laundry                             |
| ------------------------------- | ----------------------------------- |
| ![Meals](docs/images/meals.png) | ![Laundry](docs/images/laundry.png) |

| Kantin                              | Inventaris & Aset                       |
| ----------------------------------- | --------------------------------------- |
| ![Canteen](docs/images/canteen.png) | ![Inventory](docs/images/inventory.png) |

| Fasilitas                                 | Ekstrakurikuler                                     |
| ----------------------------------------- | --------------------------------------------------- |
| ![Facilities](docs/images/facilities.png) | ![Extracurricular](docs/images/extracurricular.png) |

| Notifikasi                                      |     |
| ----------------------------------------------- | --- |
| ![Notifications](docs/images/notifications.png) |     |

### 6. Komunikasi & Penerimaan

| Pengumuman & Berita                    | PSB & PPDB                    |
| -------------------------------------- | ----------------------------- |
| ![News](docs/images/announcements.png) | ![PPDB](docs/images/ppdb.png) |

| Portal PSB Online           | Alumni                            |
| --------------------------- | --------------------------------- |
| ![PSB](docs/images/psb.png) | ![Alumni](docs/images/alumni.png) |

| Donasi & Wakaf                        |     |
| ------------------------------------- | --- |
| ![Donation](docs/images/donation.png) |     |

### 7. Portal Wali Santri

| Dashboard Wali Murid                            | Data & Progres Anak                           |
| ----------------------------------------------- | --------------------------------------------- |
| ![Parent Portal](docs/images/parent-portal.png) | ![Data Anak](docs/images/parent-children.png) |

| Info Keuangan & Tagihan                               | Laporan Harian Anak                                    |
| ----------------------------------------------------- | ------------------------------------------------------ |
| ![Keuangan Orang Tua](docs/images/parent-finance.png) | ![Laporan Harian](docs/images/parent-daily-report.png) |

### 8. Pengaturan & Personalisasi

| Profil Pengguna                             | Detail Profil                              |
| ------------------------------------------- | ------------------------------------------ |
| ![Profil](docs/images/settings-profile.png) | ![Profile Detail](docs/images/profile.png) |

| Manajemen User (Settings)                         | Tampilan & Tema                                    |
| ------------------------------------------------- | -------------------------------------------------- |
| ![Users Settings](docs/images/settings-users.png) | ![Appearance](docs/images/settings-appearance.png) |

---

<!-- BEGIN:GENERATED-GALLERY -->

## Galeri Lengkap Halaman

Setiap halaman App Router (**755** rute) yang berhasil dirender pada sweep visual-QA terakhir. Semua tangkapan layar diverifikasi tidak kosong, tidak _error_, dan tidak _overflow_ horizontal. Klik modul untuk membuka galerinya.

<details>
<summary><strong>Dashboard</strong> — 4 halaman</summary>

| Halaman                                                                                                                     | Rute                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| <img src="docs/images/pages/root.webp" width="420" alt="/">                                                                 | `/`                                  |
| <img src="docs/images/pages/dashboard.webp" width="420" alt="/dashboard">                                                   | `/dashboard`                         |
| <img src="docs/images/pages/dashboard__comparison.webp" width="420" alt="/dashboard/comparison">                            | `/dashboard/comparison`              |
| <img src="docs/images/pages/dashboard__executive.webp" width="420" alt="/dashboard/executive">                              | `/dashboard/executive`               |

</details>

<details>
<summary><strong>Masuk & Pemulihan Akun</strong> — 1 halaman</summary>

| Halaman                                                           | Rute     |
| ----------------------------------------------------------------- | -------- |
| <img src="docs/images/pages/login.webp" width="420" alt="/login"> | `/login` |

</details>

<details>
<summary><strong>Profil Pengguna</strong> — 1 halaman</summary>

| Halaman                                                               | Rute       |
| --------------------------------------------------------------------- | ---------- |
| <img src="docs/images/pages/profile.webp" width="420" alt="/profile"> | `/profile` |

</details>

<details>
<summary><strong>Data Siswa</strong> — 46 halaman</summary>

| Halaman                                                                                                                                                                   | Rute                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <img src="docs/images/pages/students.webp" width="420" alt="/students">                                                                                                   | `/students`                                                 |
| <img src="docs/images/pages/students__03c594fa-68d5-42a0-ae36-966e2dad54a5.webp" width="420" alt="/students/03c594fa-68d5-42a0-ae36-966e2dad54a5">                        | `/students/03c594fa-68d5-42a0-ae36-966e2dad54a5`            |
| <img src="docs/images/pages/students__03c594fa-68d5-42a0-ae36-966e2dad54a5__edit.webp" width="420" alt="/students/03c594fa-68d5-42a0-ae36-966e2dad54a5/edit">             | `/students/03c594fa-68d5-42a0-ae36-966e2dad54a5/edit`       |
| <img src="docs/images/pages/students__0535b2ae-0a52-457c-b7a1-79f973d3e1bc.webp" width="420" alt="/students/0535b2ae-0a52-457c-b7a1-79f973d3e1bc">                        | `/students/0535b2ae-0a52-457c-b7a1-79f973d3e1bc`            |
| <img src="docs/images/pages/students__0535b2ae-0a52-457c-b7a1-79f973d3e1bc__edit.webp" width="420" alt="/students/0535b2ae-0a52-457c-b7a1-79f973d3e1bc/edit">             | `/students/0535b2ae-0a52-457c-b7a1-79f973d3e1bc/edit`       |
| <img src="docs/images/pages/students__093a70f1-c0b4-4275-ac1d-7371a724b07d.webp" width="420" alt="/students/093a70f1-c0b4-4275-ac1d-7371a724b07d">                        | `/students/093a70f1-c0b4-4275-ac1d-7371a724b07d`            |
| <img src="docs/images/pages/students__093a70f1-c0b4-4275-ac1d-7371a724b07d__edit.webp" width="420" alt="/students/093a70f1-c0b4-4275-ac1d-7371a724b07d/edit">             | `/students/093a70f1-c0b4-4275-ac1d-7371a724b07d/edit`       |
| <img src="docs/images/pages/students__181e9f85-cf74-4672-b687-d31a1e4e3a13.webp" width="420" alt="/students/181e9f85-cf74-4672-b687-d31a1e4e3a13">                        | `/students/181e9f85-cf74-4672-b687-d31a1e4e3a13`            |
| <img src="docs/images/pages/students__181e9f85-cf74-4672-b687-d31a1e4e3a13__edit.webp" width="420" alt="/students/181e9f85-cf74-4672-b687-d31a1e4e3a13/edit">             | `/students/181e9f85-cf74-4672-b687-d31a1e4e3a13/edit`       |
| <img src="docs/images/pages/students__26529164-1f5e-4e6b-ad36-8bde10140f63.webp" width="420" alt="/students/26529164-1f5e-4e6b-ad36-8bde10140f63">                        | `/students/26529164-1f5e-4e6b-ad36-8bde10140f63`            |
| <img src="docs/images/pages/students__26529164-1f5e-4e6b-ad36-8bde10140f63__edit.webp" width="420" alt="/students/26529164-1f5e-4e6b-ad36-8bde10140f63/edit">             | `/students/26529164-1f5e-4e6b-ad36-8bde10140f63/edit`       |
| <img src="docs/images/pages/students__278ab3de-44bf-4817-8406-aa03202fc870.webp" width="420" alt="/students/278ab3de-44bf-4817-8406-aa03202fc870">                        | `/students/278ab3de-44bf-4817-8406-aa03202fc870`            |
| <img src="docs/images/pages/students__278ab3de-44bf-4817-8406-aa03202fc870__edit.webp" width="420" alt="/students/278ab3de-44bf-4817-8406-aa03202fc870/edit">             | `/students/278ab3de-44bf-4817-8406-aa03202fc870/edit`       |
| <img src="docs/images/pages/students__3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd.webp" width="420" alt="/students/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd">                        | `/students/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd`            |
| <img src="docs/images/pages/students__3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd__edit.webp" width="420" alt="/students/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd/edit">             | `/students/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd/edit`       |
| <img src="docs/images/pages/students__4b56ed3a-52b2-4032-b01c-becac31a8920.webp" width="420" alt="/students/4b56ed3a-52b2-4032-b01c-becac31a8920">                        | `/students/4b56ed3a-52b2-4032-b01c-becac31a8920`            |
| <img src="docs/images/pages/students__4b56ed3a-52b2-4032-b01c-becac31a8920__edit.webp" width="420" alt="/students/4b56ed3a-52b2-4032-b01c-becac31a8920/edit">             | `/students/4b56ed3a-52b2-4032-b01c-becac31a8920/edit`       |
| <img src="docs/images/pages/students__52d8b6f2-f258-4be4-b13c-7fe8e969ca80.webp" width="420" alt="/students/52d8b6f2-f258-4be4-b13c-7fe8e969ca80">                        | `/students/52d8b6f2-f258-4be4-b13c-7fe8e969ca80`            |
| <img src="docs/images/pages/students__52d8b6f2-f258-4be4-b13c-7fe8e969ca80__edit.webp" width="420" alt="/students/52d8b6f2-f258-4be4-b13c-7fe8e969ca80/edit">             | `/students/52d8b6f2-f258-4be4-b13c-7fe8e969ca80/edit`       |
| <img src="docs/images/pages/students__7d867a1f-8ad5-4d94-814c-cb70ae3dfa55.webp" width="420" alt="/students/7d867a1f-8ad5-4d94-814c-cb70ae3dfa55">                        | `/students/7d867a1f-8ad5-4d94-814c-cb70ae3dfa55`            |
| <img src="docs/images/pages/students__7d867a1f-8ad5-4d94-814c-cb70ae3dfa55__edit.webp" width="420" alt="/students/7d867a1f-8ad5-4d94-814c-cb70ae3dfa55/edit">             | `/students/7d867a1f-8ad5-4d94-814c-cb70ae3dfa55/edit`       |
| <img src="docs/images/pages/students__9e625721-d97b-468d-bbb7-eafaa5705dda.webp" width="420" alt="/students/9e625721-d97b-468d-bbb7-eafaa5705dda">                        | `/students/9e625721-d97b-468d-bbb7-eafaa5705dda`            |
| <img src="docs/images/pages/students__9e625721-d97b-468d-bbb7-eafaa5705dda__360.webp" width="420" alt="/students/9e625721-d97b-468d-bbb7-eafaa5705dda/360">               | `/students/9e625721-d97b-468d-bbb7-eafaa5705dda/360`        |
| <img src="docs/images/pages/students__9e625721-d97b-468d-bbb7-eafaa5705dda__edit.webp" width="420" alt="/students/9e625721-d97b-468d-bbb7-eafaa5705dda/edit">             | `/students/9e625721-d97b-468d-bbb7-eafaa5705dda/edit`       |
| <img src="docs/images/pages/students__a511f4dd-db3e-4e9d-afe0-79d9fc968cf9.webp" width="420" alt="/students/a511f4dd-db3e-4e9d-afe0-79d9fc968cf9">                        | `/students/a511f4dd-db3e-4e9d-afe0-79d9fc968cf9`            |
| <img src="docs/images/pages/students__a511f4dd-db3e-4e9d-afe0-79d9fc968cf9__edit.webp" width="420" alt="/students/a511f4dd-db3e-4e9d-afe0-79d9fc968cf9/edit">             | `/students/a511f4dd-db3e-4e9d-afe0-79d9fc968cf9/edit`       |
| <img src="docs/images/pages/students__a58e532b-caab-4d06-ba84-3d7af825a8ea.webp" width="420" alt="/students/a58e532b-caab-4d06-ba84-3d7af825a8ea">                        | `/students/a58e532b-caab-4d06-ba84-3d7af825a8ea`            |
| <img src="docs/images/pages/students__a58e532b-caab-4d06-ba84-3d7af825a8ea__edit.webp" width="420" alt="/students/a58e532b-caab-4d06-ba84-3d7af825a8ea/edit">             | `/students/a58e532b-caab-4d06-ba84-3d7af825a8ea/edit`       |
| <img src="docs/images/pages/students__c1c2a5fc-44bf-410b-a617-fd8ee553938a.webp" width="420" alt="/students/c1c2a5fc-44bf-410b-a617-fd8ee553938a">                        | `/students/c1c2a5fc-44bf-410b-a617-fd8ee553938a`            |
| <img src="docs/images/pages/students__c1c2a5fc-44bf-410b-a617-fd8ee553938a__edit.webp" width="420" alt="/students/c1c2a5fc-44bf-410b-a617-fd8ee553938a/edit">             | `/students/c1c2a5fc-44bf-410b-a617-fd8ee553938a/edit`       |
| <img src="docs/images/pages/students__certificates.webp" width="420" alt="/students/certificates">                                                                        | `/students/certificates`                                    |
| <img src="docs/images/pages/students__compliance.webp" width="420" alt="/students/compliance">                                                                            | `/students/compliance`                                      |
| <img src="docs/images/pages/students__compliance__0535b2ae-0a52-457c-b7a1-79f973d3e1bc.webp" width="420" alt="/students/compliance/0535b2ae-0a52-457c-b7a1-79f973d3e1bc"> | `/students/compliance/0535b2ae-0a52-457c-b7a1-79f973d3e1bc` |
| <img src="docs/images/pages/students__compliance__093a70f1-c0b4-4275-ac1d-7371a724b07d.webp" width="420" alt="/students/compliance/093a70f1-c0b4-4275-ac1d-7371a724b07d"> | `/students/compliance/093a70f1-c0b4-4275-ac1d-7371a724b07d` |
| <img src="docs/images/pages/students__compliance__181e9f85-cf74-4672-b687-d31a1e4e3a13.webp" width="420" alt="/students/compliance/181e9f85-cf74-4672-b687-d31a1e4e3a13"> | `/students/compliance/181e9f85-cf74-4672-b687-d31a1e4e3a13` |
| <img src="docs/images/pages/students__compliance__26529164-1f5e-4e6b-ad36-8bde10140f63.webp" width="420" alt="/students/compliance/26529164-1f5e-4e6b-ad36-8bde10140f63"> | `/students/compliance/26529164-1f5e-4e6b-ad36-8bde10140f63` |
| <img src="docs/images/pages/students__compliance__3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd.webp" width="420" alt="/students/compliance/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd"> | `/students/compliance/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd` |
| <img src="docs/images/pages/students__compliance__52d8b6f2-f258-4be4-b13c-7fe8e969ca80.webp" width="420" alt="/students/compliance/52d8b6f2-f258-4be4-b13c-7fe8e969ca80"> | `/students/compliance/52d8b6f2-f258-4be4-b13c-7fe8e969ca80` |
| <img src="docs/images/pages/students__compliance__9e625721-d97b-468d-bbb7-eafaa5705dda.webp" width="420" alt="/students/compliance/9e625721-d97b-468d-bbb7-eafaa5705dda"> | `/students/compliance/9e625721-d97b-468d-bbb7-eafaa5705dda` |
| <img src="docs/images/pages/students__compliance__a511f4dd-db3e-4e9d-afe0-79d9fc968cf9.webp" width="420" alt="/students/compliance/a511f4dd-db3e-4e9d-afe0-79d9fc968cf9"> | `/students/compliance/a511f4dd-db3e-4e9d-afe0-79d9fc968cf9` |
| <img src="docs/images/pages/students__compliance__a58e532b-caab-4d06-ba84-3d7af825a8ea.webp" width="420" alt="/students/compliance/a58e532b-caab-4d06-ba84-3d7af825a8ea"> | `/students/compliance/a58e532b-caab-4d06-ba84-3d7af825a8ea` |
| <img src="docs/images/pages/students__compliance__c1c2a5fc-44bf-410b-a617-fd8ee553938a.webp" width="420" alt="/students/compliance/c1c2a5fc-44bf-410b-a617-fd8ee553938a"> | `/students/compliance/c1c2a5fc-44bf-410b-a617-fd8ee553938a` |
| <img src="docs/images/pages/students__documents.webp" width="420" alt="/students/documents">                                                                              | `/students/documents`                                       |
| <img src="docs/images/pages/students__id-card.webp" width="420" alt="/students/id-card">                                                                                  | `/students/id-card`                                         |
| <img src="docs/images/pages/students__new.webp" width="420" alt="/students/new">                                                                                          | `/students/new`                                             |
| <img src="docs/images/pages/students__transcript.webp" width="420" alt="/students/transcript">                                                                            | `/students/transcript`                                      |

</details>

<details>
<summary><strong>Kelas</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                     | Rute                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <img src="docs/images/pages/classes.webp" width="420" alt="/classes">                                                                                       | `/classes`                                           |
| <img src="docs/images/pages/classes__73628434-e210-4b9f-9332-5adcb258d19f.webp" width="420" alt="/classes/73628434-e210-4b9f-9332-5adcb258d19f">            | `/classes/73628434-e210-4b9f-9332-5adcb258d19f`      |
| <img src="docs/images/pages/classes__73628434-e210-4b9f-9332-5adcb258d19f__edit.webp" width="420" alt="/classes/73628434-e210-4b9f-9332-5adcb258d19f/edit"> | `/classes/73628434-e210-4b9f-9332-5adcb258d19f/edit` |
| <img src="docs/images/pages/classes__new.webp" width="420" alt="/classes/new">                                                                              | `/classes/new`                                       |

</details>

<details>
<summary><strong>Tahun Ajaran</strong> — 6 halaman</summary>

| Halaman                                                                                                                                                                   | Rute                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <img src="docs/images/pages/academic-years.webp" width="420" alt="/academic-years">                                                                                       | `/academic-years`                                           |
| <img src="docs/images/pages/academic-years__1c26ab5d-3bac-44fa-812e-00e02d0306da.webp" width="420" alt="/academic-years/1c26ab5d-3bac-44fa-812e-00e02d0306da">            | `/academic-years/1c26ab5d-3bac-44fa-812e-00e02d0306da`      |
| <img src="docs/images/pages/academic-years__1c26ab5d-3bac-44fa-812e-00e02d0306da__edit.webp" width="420" alt="/academic-years/1c26ab5d-3bac-44fa-812e-00e02d0306da/edit"> | `/academic-years/1c26ab5d-3bac-44fa-812e-00e02d0306da/edit` |
| <img src="docs/images/pages/academic-years__8adf6832-c4f5-44ed-bbcb-7b7092430023.webp" width="420" alt="/academic-years/8adf6832-c4f5-44ed-bbcb-7b7092430023">            | `/academic-years/8adf6832-c4f5-44ed-bbcb-7b7092430023`      |
| <img src="docs/images/pages/academic-years__8adf6832-c4f5-44ed-bbcb-7b7092430023__edit.webp" width="420" alt="/academic-years/8adf6832-c4f5-44ed-bbcb-7b7092430023/edit"> | `/academic-years/8adf6832-c4f5-44ed-bbcb-7b7092430023/edit` |
| <img src="docs/images/pages/academic-years__new.webp" width="420" alt="/academic-years/new">                                                                              | `/academic-years/new`                                       |

</details>

<details>
<summary><strong>Jadwal Pelajaran</strong> — 1 halaman</summary>

| Halaman                                                                 | Rute        |
| ----------------------------------------------------------------------- | ----------- |
| <img src="docs/images/pages/schedule.webp" width="420" alt="/schedule"> | `/schedule` |

</details>

<details>
<summary><strong>Kurikulum</strong> — 36 halaman</summary>

| Halaman                                                                                                                                                                                                  | Rute                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| <img src="docs/images/pages/curriculum.webp" width="420" alt="/curriculum">                                                                                                                              | `/curriculum`                                                              |
| <img src="docs/images/pages/curriculum__curriculums__f81b11c0-a05a-48da-96d7-205a0baa5e94.webp" width="420" alt="/curriculum/curriculums/f81b11c0-a05a-48da-96d7-205a0baa5e94">                          | `/curriculum/curriculums/f81b11c0-a05a-48da-96d7-205a0baa5e94`             |
| <img src="docs/images/pages/curriculum__curriculums__f81b11c0-a05a-48da-96d7-205a0baa5e94__add-subject.webp" width="420" alt="/curriculum/curriculums/f81b11c0-a05a-48da-96d7-205a0baa5e94/add-subject"> | `/curriculum/curriculums/f81b11c0-a05a-48da-96d7-205a0baa5e94/add-subject` |
| <img src="docs/images/pages/curriculum__curriculums__f81b11c0-a05a-48da-96d7-205a0baa5e94__edit.webp" width="420" alt="/curriculum/curriculums/f81b11c0-a05a-48da-96d7-205a0baa5e94/edit">               | `/curriculum/curriculums/f81b11c0-a05a-48da-96d7-205a0baa5e94/edit`        |
| <img src="docs/images/pages/curriculum__curriculums__new.webp" width="420" alt="/curriculum/curriculums/new">                                                                                            | `/curriculum/curriculums/new`                                              |
| <img src="docs/images/pages/curriculum__merdeka.webp" width="420" alt="/curriculum/merdeka">                                                                                                             | `/curriculum/merdeka`                                                      |
| <img src="docs/images/pages/curriculum__merdeka__p5__6f780328-ecee-468e-bbc5-345c4d684591.webp" width="420" alt="/curriculum/merdeka/p5/6f780328-ecee-468e-bbc5-345c4d684591">                           | `/curriculum/merdeka/p5/6f780328-ecee-468e-bbc5-345c4d684591`              |
| <img src="docs/images/pages/curriculum__projects.webp" width="420" alt="/curriculum/projects">                                                                                                           | `/curriculum/projects`                                                     |
| <img src="docs/images/pages/curriculum__schedules__c8ae086a-f056-47e5-ac05-2da604570d60__edit.webp" width="420" alt="/curriculum/schedules/c8ae086a-f056-47e5-ac05-2da604570d60/edit">                   | `/curriculum/schedules/c8ae086a-f056-47e5-ac05-2da604570d60/edit`          |
| <img src="docs/images/pages/curriculum__schedules__new.webp" width="420" alt="/curriculum/schedules/new">                                                                                                | `/curriculum/schedules/new`                                                |
| <img src="docs/images/pages/curriculum__schedules__timetable.webp" width="420" alt="/curriculum/schedules/timetable">                                                                                    | `/curriculum/schedules/timetable`                                          |
| <img src="docs/images/pages/curriculum__subjects__05dc41bf-f4f7-49e7-834c-df6e43d9b245.webp" width="420" alt="/curriculum/subjects/05dc41bf-f4f7-49e7-834c-df6e43d9b245">                                | `/curriculum/subjects/05dc41bf-f4f7-49e7-834c-df6e43d9b245`                |
| <img src="docs/images/pages/curriculum__subjects__05dc41bf-f4f7-49e7-834c-df6e43d9b245__edit.webp" width="420" alt="/curriculum/subjects/05dc41bf-f4f7-49e7-834c-df6e43d9b245/edit">                     | `/curriculum/subjects/05dc41bf-f4f7-49e7-834c-df6e43d9b245/edit`           |
| <img src="docs/images/pages/curriculum__subjects__064e5b36-2984-4ce7-b178-9b06e6ba852a.webp" width="420" alt="/curriculum/subjects/064e5b36-2984-4ce7-b178-9b06e6ba852a">                                | `/curriculum/subjects/064e5b36-2984-4ce7-b178-9b06e6ba852a`                |
| <img src="docs/images/pages/curriculum__subjects__064e5b36-2984-4ce7-b178-9b06e6ba852a__edit.webp" width="420" alt="/curriculum/subjects/064e5b36-2984-4ce7-b178-9b06e6ba852a/edit">                     | `/curriculum/subjects/064e5b36-2984-4ce7-b178-9b06e6ba852a/edit`           |
| <img src="docs/images/pages/curriculum__subjects__43d3ab2c-10fe-44fb-a15d-18b181fb4c06.webp" width="420" alt="/curriculum/subjects/43d3ab2c-10fe-44fb-a15d-18b181fb4c06">                                | `/curriculum/subjects/43d3ab2c-10fe-44fb-a15d-18b181fb4c06`                |
| <img src="docs/images/pages/curriculum__subjects__43d3ab2c-10fe-44fb-a15d-18b181fb4c06__edit.webp" width="420" alt="/curriculum/subjects/43d3ab2c-10fe-44fb-a15d-18b181fb4c06/edit">                     | `/curriculum/subjects/43d3ab2c-10fe-44fb-a15d-18b181fb4c06/edit`           |
| <img src="docs/images/pages/curriculum__subjects__44fe744d-06da-4d29-bb9e-05fcecc367f7.webp" width="420" alt="/curriculum/subjects/44fe744d-06da-4d29-bb9e-05fcecc367f7">                                | `/curriculum/subjects/44fe744d-06da-4d29-bb9e-05fcecc367f7`                |
| <img src="docs/images/pages/curriculum__subjects__44fe744d-06da-4d29-bb9e-05fcecc367f7__edit.webp" width="420" alt="/curriculum/subjects/44fe744d-06da-4d29-bb9e-05fcecc367f7/edit">                     | `/curriculum/subjects/44fe744d-06da-4d29-bb9e-05fcecc367f7/edit`           |
| <img src="docs/images/pages/curriculum__subjects__472ffae7-9ed4-40e7-9e91-941e49d406ab.webp" width="420" alt="/curriculum/subjects/472ffae7-9ed4-40e7-9e91-941e49d406ab">                                | `/curriculum/subjects/472ffae7-9ed4-40e7-9e91-941e49d406ab`                |
| <img src="docs/images/pages/curriculum__subjects__472ffae7-9ed4-40e7-9e91-941e49d406ab__edit.webp" width="420" alt="/curriculum/subjects/472ffae7-9ed4-40e7-9e91-941e49d406ab/edit">                     | `/curriculum/subjects/472ffae7-9ed4-40e7-9e91-941e49d406ab/edit`           |
| <img src="docs/images/pages/curriculum__subjects__5d2a1a30-8067-43ef-883f-e38148f1fc28.webp" width="420" alt="/curriculum/subjects/5d2a1a30-8067-43ef-883f-e38148f1fc28">                                | `/curriculum/subjects/5d2a1a30-8067-43ef-883f-e38148f1fc28`                |
| <img src="docs/images/pages/curriculum__subjects__5d2a1a30-8067-43ef-883f-e38148f1fc28__edit.webp" width="420" alt="/curriculum/subjects/5d2a1a30-8067-43ef-883f-e38148f1fc28/edit">                     | `/curriculum/subjects/5d2a1a30-8067-43ef-883f-e38148f1fc28/edit`           |
| <img src="docs/images/pages/curriculum__subjects__6da10f9e-33f9-4b05-8720-bbfd6d4c1385.webp" width="420" alt="/curriculum/subjects/6da10f9e-33f9-4b05-8720-bbfd6d4c1385">                                | `/curriculum/subjects/6da10f9e-33f9-4b05-8720-bbfd6d4c1385`                |
| <img src="docs/images/pages/curriculum__subjects__6da10f9e-33f9-4b05-8720-bbfd6d4c1385__edit.webp" width="420" alt="/curriculum/subjects/6da10f9e-33f9-4b05-8720-bbfd6d4c1385/edit">                     | `/curriculum/subjects/6da10f9e-33f9-4b05-8720-bbfd6d4c1385/edit`           |
| <img src="docs/images/pages/curriculum__subjects__7bb22cb8-4327-49ef-a870-c8472fb9a416.webp" width="420" alt="/curriculum/subjects/7bb22cb8-4327-49ef-a870-c8472fb9a416">                                | `/curriculum/subjects/7bb22cb8-4327-49ef-a870-c8472fb9a416`                |
| <img src="docs/images/pages/curriculum__subjects__7bb22cb8-4327-49ef-a870-c8472fb9a416__edit.webp" width="420" alt="/curriculum/subjects/7bb22cb8-4327-49ef-a870-c8472fb9a416/edit">                     | `/curriculum/subjects/7bb22cb8-4327-49ef-a870-c8472fb9a416/edit`           |
| <img src="docs/images/pages/curriculum__subjects__c1e092eb-a5ba-416c-84f8-f635f1bedc5b.webp" width="420" alt="/curriculum/subjects/c1e092eb-a5ba-416c-84f8-f635f1bedc5b">                                | `/curriculum/subjects/c1e092eb-a5ba-416c-84f8-f635f1bedc5b`                |
| <img src="docs/images/pages/curriculum__subjects__c1e092eb-a5ba-416c-84f8-f635f1bedc5b__edit.webp" width="420" alt="/curriculum/subjects/c1e092eb-a5ba-416c-84f8-f635f1bedc5b/edit">                     | `/curriculum/subjects/c1e092eb-a5ba-416c-84f8-f635f1bedc5b/edit`           |
| <img src="docs/images/pages/curriculum__subjects__cdca7296-07e7-4e64-86ad-18eaf11f410c.webp" width="420" alt="/curriculum/subjects/cdca7296-07e7-4e64-86ad-18eaf11f410c">                                | `/curriculum/subjects/cdca7296-07e7-4e64-86ad-18eaf11f410c`                |
| <img src="docs/images/pages/curriculum__subjects__cdca7296-07e7-4e64-86ad-18eaf11f410c__edit.webp" width="420" alt="/curriculum/subjects/cdca7296-07e7-4e64-86ad-18eaf11f410c/edit">                     | `/curriculum/subjects/cdca7296-07e7-4e64-86ad-18eaf11f410c/edit`           |
| <img src="docs/images/pages/curriculum__subjects__cfe34310-584b-4651-893d-1495b6437ca7.webp" width="420" alt="/curriculum/subjects/cfe34310-584b-4651-893d-1495b6437ca7">                                | `/curriculum/subjects/cfe34310-584b-4651-893d-1495b6437ca7`                |
| <img src="docs/images/pages/curriculum__subjects__cfe34310-584b-4651-893d-1495b6437ca7__edit.webp" width="420" alt="/curriculum/subjects/cfe34310-584b-4651-893d-1495b6437ca7/edit">                     | `/curriculum/subjects/cfe34310-584b-4651-893d-1495b6437ca7/edit`           |
| <img src="docs/images/pages/curriculum__subjects__fc654bc6-a5f3-4ad4-a89d-2a9d625ebc11.webp" width="420" alt="/curriculum/subjects/fc654bc6-a5f3-4ad4-a89d-2a9d625ebc11">                                | `/curriculum/subjects/fc654bc6-a5f3-4ad4-a89d-2a9d625ebc11`                |
| <img src="docs/images/pages/curriculum__subjects__fc654bc6-a5f3-4ad4-a89d-2a9d625ebc11__edit.webp" width="420" alt="/curriculum/subjects/fc654bc6-a5f3-4ad4-a89d-2a9d625ebc11/edit">                     | `/curriculum/subjects/fc654bc6-a5f3-4ad4-a89d-2a9d625ebc11/edit`           |
| <img src="docs/images/pages/curriculum__subjects__new.webp" width="420" alt="/curriculum/subjects/new">                                                                                                  | `/curriculum/subjects/new`                                                 |

</details>

<details>
<summary><strong>Penilaian & Rapor</strong> — 31 halaman</summary>

| Halaman                                                                                                                                                                                                                                                               | Rute                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/images/pages/assessment.webp" width="420" alt="/assessment">                                                                                                                                                                                           | `/assessment`                                                                                                                    |
| <img src="docs/images/pages/assessment__24997bc8-1eab-4d73-bdf4-2ae1d84c090c.webp" width="420" alt="/assessment/24997bc8-1eab-4d73-bdf4-2ae1d84c090c">                                                                                                                | `/assessment/24997bc8-1eab-4d73-bdf4-2ae1d84c090c`                                                                               |
| <img src="docs/images/pages/assessment__24997bc8-1eab-4d73-bdf4-2ae1d84c090c__edit.webp" width="420" alt="/assessment/24997bc8-1eab-4d73-bdf4-2ae1d84c090c/edit">                                                                                                     | `/assessment/24997bc8-1eab-4d73-bdf4-2ae1d84c090c/edit`                                                                          |
| <img src="docs/images/pages/assessment__24997bc8-1eab-4d73-bdf4-2ae1d84c090c__grades.webp" width="420" alt="/assessment/24997bc8-1eab-4d73-bdf4-2ae1d84c090c/grades">                                                                                                 | `/assessment/24997bc8-1eab-4d73-bdf4-2ae1d84c090c/grades`                                                                        |
| <img src="docs/images/pages/assessment__4fe34c6e-9f09-4dc8-82fa-dd7834622d22.webp" width="420" alt="/assessment/4fe34c6e-9f09-4dc8-82fa-dd7834622d22">                                                                                                                | `/assessment/4fe34c6e-9f09-4dc8-82fa-dd7834622d22`                                                                               |
| <img src="docs/images/pages/assessment__4fe34c6e-9f09-4dc8-82fa-dd7834622d22__edit.webp" width="420" alt="/assessment/4fe34c6e-9f09-4dc8-82fa-dd7834622d22/edit">                                                                                                     | `/assessment/4fe34c6e-9f09-4dc8-82fa-dd7834622d22/edit`                                                                          |
| <img src="docs/images/pages/assessment__4fe34c6e-9f09-4dc8-82fa-dd7834622d22__grades.webp" width="420" alt="/assessment/4fe34c6e-9f09-4dc8-82fa-dd7834622d22/grades">                                                                                                 | `/assessment/4fe34c6e-9f09-4dc8-82fa-dd7834622d22/grades`                                                                        |
| <img src="docs/images/pages/assessment__e8a73c30-d814-42fe-a1fb-6d315d54a404.webp" width="420" alt="/assessment/e8a73c30-d814-42fe-a1fb-6d315d54a404">                                                                                                                | `/assessment/e8a73c30-d814-42fe-a1fb-6d315d54a404`                                                                               |
| <img src="docs/images/pages/assessment__e8a73c30-d814-42fe-a1fb-6d315d54a404__edit.webp" width="420" alt="/assessment/e8a73c30-d814-42fe-a1fb-6d315d54a404/edit">                                                                                                     | `/assessment/e8a73c30-d814-42fe-a1fb-6d315d54a404/edit`                                                                          |
| <img src="docs/images/pages/assessment__e8a73c30-d814-42fe-a1fb-6d315d54a404__grades.webp" width="420" alt="/assessment/e8a73c30-d814-42fe-a1fb-6d315d54a404/grades">                                                                                                 | `/assessment/e8a73c30-d814-42fe-a1fb-6d315d54a404/grades`                                                                        |
| <img src="docs/images/pages/assessment__fe131dce-e302-4e35-abaa-1353f226ee87.webp" width="420" alt="/assessment/fe131dce-e302-4e35-abaa-1353f226ee87">                                                                                                                | `/assessment/fe131dce-e302-4e35-abaa-1353f226ee87`                                                                               |
| <img src="docs/images/pages/assessment__fe131dce-e302-4e35-abaa-1353f226ee87__edit.webp" width="420" alt="/assessment/fe131dce-e302-4e35-abaa-1353f226ee87/edit">                                                                                                     | `/assessment/fe131dce-e302-4e35-abaa-1353f226ee87/edit`                                                                          |
| <img src="docs/images/pages/assessment__fe131dce-e302-4e35-abaa-1353f226ee87__grades.webp" width="420" alt="/assessment/fe131dce-e302-4e35-abaa-1353f226ee87/grades">                                                                                                 | `/assessment/fe131dce-e302-4e35-abaa-1353f226ee87/grades`                                                                        |
| <img src="docs/images/pages/assessment__new.webp" width="420" alt="/assessment/new">                                                                                                                                                                                  | `/assessment/new`                                                                                                                |
| <img src="docs/images/pages/assessment__raport-merdeka.webp" width="420" alt="/assessment/raport-merdeka">                                                                                                                                                            | `/assessment/raport-merdeka`                                                                                                     |
| <img src="docs/images/pages/assessment__raport-merdeka__9e625721-d97b-468d-bbb7-eafaa5705dda__1c26ab5d-3bac-44fa-812e-00e02d0306da__1.webp" width="420" alt="/assessment/raport-merdeka/9e625721-d97b-468d-bbb7-eafaa5705dda/1c26ab5d-3bac-44fa-812e-00e02d0306da/1"> | `/assessment/raport-merdeka/9e625721-d97b-468d-bbb7-eafaa5705dda/1c26ab5d-3bac-44fa-812e-00e02d0306da/1`                         |
| <img src="docs/images/pages/assessment__report-cards.webp" width="420" alt="/assessment/report-cards">                                                                                                                                                                | `/assessment/report-cards`                                                                                                       |
| <img src="docs/images/pages/assessment__report-cards__35c0845c-4f6d-4a24-a881-8ce6c2ba2640.webp" width="420" alt="/assessment/report-cards/35c0845c-4f6d-4a24-a881-8ce6c2ba2640">                                                                                     | `/assessment/report-cards/35c0845c-4f6d-4a24-a881-8ce6c2ba2640`                                                                  |
| <img src="docs/images/pages/assessment__report-cards__35c0845c-4f6d-4a24-a881-8ce6c2ba2640__print.webp" width="420" alt="/assessment/report-cards/35c0845c-4f6d-4a24-a881-8ce6c2ba2640/print">                                                                        | `/assessment/report-cards/35c0845c-4f6d-4a24-a881-8ce6c2ba2640/print`                                                            |
| <img src="docs/images/pages/assessment__report-cards__35c0845c-4f6d-4a24-a881-8ce6c2ba2640__print-merdeka.webp" width="420" alt="/assessment/report-cards/35c0845c-4f6d-4a24-a881-8ce6c2ba2640/print-merdeka">                                                        | `/assessment/report-cards/35c0845c-4f6d-4a24-a881-8ce6c2ba2640/print-merdeka`                                                    |
| <img src="docs/images/pages/assessment__report-cards__4d472168-9dd0-454e-a130-a10f4fc35461.webp" width="420" alt="/assessment/report-cards/4d472168-9dd0-454e-a130-a10f4fc35461">                                                                                     | `/assessment/report-cards/4d472168-9dd0-454e-a130-a10f4fc35461`                                                                  |
| <img src="docs/images/pages/assessment__report-cards__4d472168-9dd0-454e-a130-a10f4fc35461__print.webp" width="420" alt="/assessment/report-cards/4d472168-9dd0-454e-a130-a10f4fc35461/print">                                                                        | `/assessment/report-cards/4d472168-9dd0-454e-a130-a10f4fc35461/print`                                                            |
| <img src="docs/images/pages/assessment__report-cards__4d472168-9dd0-454e-a130-a10f4fc35461__print-merdeka.webp" width="420" alt="/assessment/report-cards/4d472168-9dd0-454e-a130-a10f4fc35461/print-merdeka">                                                        | `/assessment/report-cards/4d472168-9dd0-454e-a130-a10f4fc35461/print-merdeka`                                                    |
| <img src="docs/images/pages/assessment__report-cards__98c5be11-0f6e-4b89-b152-ff39872e8974.webp" width="420" alt="/assessment/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974">                                                                                     | `/assessment/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974`                                                                  |
| <img src="docs/images/pages/assessment__report-cards__98c5be11-0f6e-4b89-b152-ff39872e8974__print.webp" width="420" alt="/assessment/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974/print">                                                                        | `/assessment/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974/print`                                                            |
| <img src="docs/images/pages/assessment__report-cards__98c5be11-0f6e-4b89-b152-ff39872e8974__print-merdeka.webp" width="420" alt="/assessment/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974/print-merdeka">                                                        | `/assessment/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974/print-merdeka`                                                    |
| <img src="docs/images/pages/assessment__report-cards__generate.webp" width="420" alt="/assessment/report-cards/generate">                                                                                                                                             | `/assessment/report-cards/generate`                                                                                              |
| <img src="docs/images/pages/assessment__skhun__9e625721-d97b-468d-bbb7-eafaa5705dda__1c26ab5d-3bac-44fa-812e-00e02d0306da.webp" width="420" alt="/assessment/skhun/9e625721-d97b-468d-bbb7-eafaa5705dda/1c26ab5d-3bac-44fa-812e-00e02d0306da">                        | `/assessment/skhun/9e625721-d97b-468d-bbb7-eafaa5705dda/1c26ab5d-3bac-44fa-812e-00e02d0306da`                                    |
| <img src="docs/images/pages/assessment__transcript__9e625721-d97b-468d-bbb7-eafaa5705dda.webp" width="420" alt="/assessment/transcript/9e625721-d97b-468d-bbb7-eafaa5705dda">                                                                                         | `/assessment/transcript/9e625721-d97b-468d-bbb7-eafaa5705dda`                                                                    |
| <img src="docs/images/pages/assessment__unified-raport.webp" width="420" alt="/assessment/unified-raport">                                                                                                                                                            | `/assessment/unified-raport`                                                                                                     |
| <img src="docs/images/pages/assessment__unified-raport__9e625721-d97b-468d-bbb7-eafaa5705dda__q66030a08.webp" width="420" alt="/assessment/unified-raport/9e625721-d97b-468d-bbb7-eafaa5705dda?academicYearId=1c26ab5d-3bac-44fa-812e-00e02d0306da&semester=1">       | `/assessment/unified-raport/9e625721-d97b-468d-bbb7-eafaa5705dda?academicYearId=1c26ab5d-3bac-44fa-812e-00e02d0306da&semester=1` |

</details>

<details>
<summary><strong>Absensi</strong> — 4 halaman</summary>

| Halaman                                                                                        | Rute                   |
| ---------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/pages/attendance.webp" width="420" alt="/attendance">                    | `/attendance`          |
| <img src="docs/images/pages/attendance__calendar.webp" width="420" alt="/attendance/calendar"> | `/attendance/calendar` |
| <img src="docs/images/pages/attendance__heatmap.webp" width="420" alt="/attendance/heatmap">   | `/attendance/heatmap`  |
| <img src="docs/images/pages/attendance__record.webp" width="420" alt="/attendance/record">     | `/attendance/record`   |

</details>

<details>
<summary><strong>Wali Kelas</strong> — 7 halaman</summary>

| Halaman                                                                                                                                                               | Rute                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| <img src="docs/images/pages/homeroom.webp" width="420" alt="/homeroom">                                                                                               | `/homeroom`                                               |
| <img src="docs/images/pages/homeroom__attendance.webp" width="420" alt="/homeroom/attendance">                                                                        | `/homeroom/attendance`                                    |
| <img src="docs/images/pages/homeroom__behavior.webp" width="420" alt="/homeroom/behavior">                                                                            | `/homeroom/behavior`                                      |
| <img src="docs/images/pages/homeroom__daily-report.webp" width="420" alt="/homeroom/daily-report">                                                                    | `/homeroom/daily-report`                                  |
| <img src="docs/images/pages/homeroom__messages.webp" width="420" alt="/homeroom/messages">                                                                            | `/homeroom/messages`                                      |
| <img src="docs/images/pages/homeroom__performance.webp" width="420" alt="/homeroom/performance">                                                                      | `/homeroom/performance`                                   |
| <img src="docs/images/pages/homeroom__students__9e625721-d97b-468d-bbb7-eafaa5705dda.webp" width="420" alt="/homeroom/students/9e625721-d97b-468d-bbb7-eafaa5705dda"> | `/homeroom/students/9e625721-d97b-468d-bbb7-eafaa5705dda` |

</details>

<details>
<summary><strong>Sertifikat & Ijazah</strong> — 5 halaman</summary>

| Halaman                                                                                                                                                    | Rute                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <img src="docs/images/pages/certificates.webp" width="420" alt="/certificates">                                                                            | `/certificates`                                      |
| <img src="docs/images/pages/certificates__1fa54ff0-9edd-4722-bfc4-2e3dbdff68c7.webp" width="420" alt="/certificates/1fa54ff0-9edd-4722-bfc4-2e3dbdff68c7"> | `/certificates/1fa54ff0-9edd-4722-bfc4-2e3dbdff68c7` |
| <img src="docs/images/pages/certificates__new.webp" width="420" alt="/certificates/new">                                                                   | `/certificates/new`                                  |
| <img src="docs/images/pages/certificates__verify.webp" width="420" alt="/certificates/verify">                                                             | `/certificates/verify`                               |
| <img src="docs/images/pages/certificates__verify__CERT-TFZ-30-2024001.webp" width="420" alt="/certificates/verify/CERT-TFZ-30-2024001">                    | `/certificates/verify/CERT-TFZ-30-2024001`           |

</details>

<details>
<summary><strong>CBT / Ujian Online</strong> — 11 halaman</summary>

| Halaman                                                                                                                                                                      | Rute                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| <img src="docs/images/pages/cbt.webp" width="420" alt="/cbt">                                                                                                                | `/cbt`                                                       |
| <img src="docs/images/pages/cbt__attempts__11552b20-e666-4464-9222-d9f6d7338162__grading.webp" width="420" alt="/cbt/attempts/11552b20-e666-4464-9222-d9f6d7338162/grading"> | `/cbt/attempts/11552b20-e666-4464-9222-d9f6d7338162/grading` |
| <img src="docs/images/pages/cbt__banks.webp" width="420" alt="/cbt/banks">                                                                                                   | `/cbt/banks`                                                 |
| <img src="docs/images/pages/cbt__banks__d6b762bb-24cc-400d-b1a1-6f0f92adcb9c.webp" width="420" alt="/cbt/banks/d6b762bb-24cc-400d-b1a1-6f0f92adcb9c">                        | `/cbt/banks/d6b762bb-24cc-400d-b1a1-6f0f92adcb9c`            |
| <img src="docs/images/pages/cbt__banks__new.webp" width="420" alt="/cbt/banks/new">                                                                                          | `/cbt/banks/new`                                             |
| <img src="docs/images/pages/cbt__exams.webp" width="420" alt="/cbt/exams">                                                                                                   | `/cbt/exams`                                                 |
| <img src="docs/images/pages/cbt__exams__24997bc8-1eab-4d73-bdf4-2ae1d84c090c__monitoring.webp" width="420" alt="/cbt/exams/24997bc8-1eab-4d73-bdf4-2ae1d84c090c/monitoring"> | `/cbt/exams/24997bc8-1eab-4d73-bdf4-2ae1d84c090c/monitoring` |
| <img src="docs/images/pages/cbt__exams__4fe34c6e-9f09-4dc8-82fa-dd7834622d22__monitoring.webp" width="420" alt="/cbt/exams/4fe34c6e-9f09-4dc8-82fa-dd7834622d22/monitoring"> | `/cbt/exams/4fe34c6e-9f09-4dc8-82fa-dd7834622d22/monitoring` |
| <img src="docs/images/pages/cbt__exams__e8a73c30-d814-42fe-a1fb-6d315d54a404__monitoring.webp" width="420" alt="/cbt/exams/e8a73c30-d814-42fe-a1fb-6d315d54a404/monitoring"> | `/cbt/exams/e8a73c30-d814-42fe-a1fb-6d315d54a404/monitoring` |
| <img src="docs/images/pages/cbt__exams__fe131dce-e302-4e35-abaa-1353f226ee87__monitoring.webp" width="420" alt="/cbt/exams/fe131dce-e302-4e35-abaa-1353f226ee87/monitoring"> | `/cbt/exams/fe131dce-e302-4e35-abaa-1353f226ee87/monitoring` |
| <img src="docs/images/pages/cbt__exams__new.webp" width="420" alt="/cbt/exams/new">                                                                                          | `/cbt/exams/new`                                             |

</details>

<details>
<summary><strong>PAUD / TK Qur'an</strong> — 20 halaman</summary>

| Halaman                                                                                                                                                                        | Rute                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| <img src="docs/images/pages/tk.webp" width="420" alt="/tk">                                                                                                                    | `/tk`                                                         |
| <img src="docs/images/pages/tk__assessment.webp" width="420" alt="/tk/assessment">                                                                                             | `/tk/assessment`                                              |
| <img src="docs/images/pages/tk__assessment__86a50f9b-6c4c-4bf8-99fc-e9bd02b794c2.webp" width="420" alt="/tk/assessment/86a50f9b-6c4c-4bf8-99fc-e9bd02b794c2">                  | `/tk/assessment/86a50f9b-6c4c-4bf8-99fc-e9bd02b794c2`         |
| <img src="docs/images/pages/tk__assessment__86a50f9b-6c4c-4bf8-99fc-e9bd02b794c2__edit.webp" width="420" alt="/tk/assessment/86a50f9b-6c4c-4bf8-99fc-e9bd02b794c2/edit">       | `/tk/assessment/86a50f9b-6c4c-4bf8-99fc-e9bd02b794c2/edit`    |
| <img src="docs/images/pages/tk__assessment__create.webp" width="420" alt="/tk/assessment/create">                                                                              | `/tk/assessment/create`                                       |
| <img src="docs/images/pages/tk__assessment__new.webp" width="420" alt="/tk/assessment/new">                                                                                    | `/tk/assessment/new`                                          |
| <img src="docs/images/pages/tk__assessment__progress.webp" width="420" alt="/tk/assessment/progress">                                                                          | `/tk/assessment/progress`                                     |
| <img src="docs/images/pages/tk__assessment__student__9e625721-d97b-468d-bbb7-eafaa5705dda.webp" width="420" alt="/tk/assessment/student/9e625721-d97b-468d-bbb7-eafaa5705dda"> | `/tk/assessment/student/9e625721-d97b-468d-bbb7-eafaa5705dda` |
| <img src="docs/images/pages/tk__daily-reports.webp" width="420" alt="/tk/daily-reports">                                                                                       | `/tk/daily-reports`                                           |
| <img src="docs/images/pages/tk__daily-reports__c2126588-25f1-4da4-a34f-23c1372ef8ab.webp" width="420" alt="/tk/daily-reports/c2126588-25f1-4da4-a34f-23c1372ef8ab">            | `/tk/daily-reports/c2126588-25f1-4da4-a34f-23c1372ef8ab`      |
| <img src="docs/images/pages/tk__daily-reports__c2126588-25f1-4da4-a34f-23c1372ef8ab__edit.webp" width="420" alt="/tk/daily-reports/c2126588-25f1-4da4-a34f-23c1372ef8ab/edit"> | `/tk/daily-reports/c2126588-25f1-4da4-a34f-23c1372ef8ab/edit` |
| <img src="docs/images/pages/tk__daily-reports__check-in.webp" width="420" alt="/tk/daily-reports/check-in">                                                                    | `/tk/daily-reports/check-in`                                  |
| <img src="docs/images/pages/tk__daily-reports__class.webp" width="420" alt="/tk/daily-reports/class">                                                                          | `/tk/daily-reports/class`                                     |
| <img src="docs/images/pages/tk__daily-reports__create.webp" width="420" alt="/tk/daily-reports/create">                                                                        | `/tk/daily-reports/create`                                    |
| <img src="docs/images/pages/tk__daily-reports__new.webp" width="420" alt="/tk/daily-reports/new">                                                                              | `/tk/daily-reports/new`                                       |
| <img src="docs/images/pages/tk__daily-reports__parent.webp" width="420" alt="/tk/daily-reports/parent">                                                                        | `/tk/daily-reports/parent`                                    |
| <img src="docs/images/pages/tk__reports.webp" width="420" alt="/tk/reports">                                                                                                   | `/tk/reports`                                                 |
| <img src="docs/images/pages/tk__reports__c2126588-25f1-4da4-a34f-23c1372ef8ab.webp" width="420" alt="/tk/reports/c2126588-25f1-4da4-a34f-23c1372ef8ab">                        | `/tk/reports/c2126588-25f1-4da4-a34f-23c1372ef8ab`            |
| <img src="docs/images/pages/tk__reports__c2126588-25f1-4da4-a34f-23c1372ef8ab__edit.webp" width="420" alt="/tk/reports/c2126588-25f1-4da4-a34f-23c1372ef8ab/edit">             | `/tk/reports/c2126588-25f1-4da4-a34f-23c1372ef8ab/edit`       |
| <img src="docs/images/pages/tk__reports__generate.webp" width="420" alt="/tk/reports/generate">                                                                                | `/tk/reports/generate`                                        |

</details>

<details>
<summary><strong>Portofolio Siswa</strong> — 1 halaman</summary>

| Halaman                                                                   | Rute         |
| ------------------------------------------------------------------------- | ------------ |
| <img src="docs/images/pages/portfolio.webp" width="420" alt="/portfolio"> | `/portfolio` |

</details>

<details>
<summary><strong>Perpustakaan</strong> — 20 halaman</summary>

| Halaman                                                                                                                                                                  | Rute                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| <img src="docs/images/pages/library.webp" width="420" alt="/library">                                                                                                    | `/library`                                                 |
| <img src="docs/images/pages/library__books__1dc4160e-8472-47d2-a2b5-e1d197c50f3e.webp" width="420" alt="/library/books/1dc4160e-8472-47d2-a2b5-e1d197c50f3e">            | `/library/books/1dc4160e-8472-47d2-a2b5-e1d197c50f3e`      |
| <img src="docs/images/pages/library__books__1dc4160e-8472-47d2-a2b5-e1d197c50f3e__edit.webp" width="420" alt="/library/books/1dc4160e-8472-47d2-a2b5-e1d197c50f3e/edit"> | `/library/books/1dc4160e-8472-47d2-a2b5-e1d197c50f3e/edit` |
| <img src="docs/images/pages/library__books__37b39504-1a37-4310-a0b3-b0b9b848fcb6.webp" width="420" alt="/library/books/37b39504-1a37-4310-a0b3-b0b9b848fcb6">            | `/library/books/37b39504-1a37-4310-a0b3-b0b9b848fcb6`      |
| <img src="docs/images/pages/library__books__37b39504-1a37-4310-a0b3-b0b9b848fcb6__edit.webp" width="420" alt="/library/books/37b39504-1a37-4310-a0b3-b0b9b848fcb6/edit"> | `/library/books/37b39504-1a37-4310-a0b3-b0b9b848fcb6/edit` |
| <img src="docs/images/pages/library__books__4197e054-a7c7-4cca-aaec-d41cc61d69d3.webp" width="420" alt="/library/books/4197e054-a7c7-4cca-aaec-d41cc61d69d3">            | `/library/books/4197e054-a7c7-4cca-aaec-d41cc61d69d3`      |
| <img src="docs/images/pages/library__books__4197e054-a7c7-4cca-aaec-d41cc61d69d3__edit.webp" width="420" alt="/library/books/4197e054-a7c7-4cca-aaec-d41cc61d69d3/edit"> | `/library/books/4197e054-a7c7-4cca-aaec-d41cc61d69d3/edit` |
| <img src="docs/images/pages/library__books__5642e3b3-9617-4a7e-80b0-4e621f1787ad.webp" width="420" alt="/library/books/5642e3b3-9617-4a7e-80b0-4e621f1787ad">            | `/library/books/5642e3b3-9617-4a7e-80b0-4e621f1787ad`      |
| <img src="docs/images/pages/library__books__5642e3b3-9617-4a7e-80b0-4e621f1787ad__edit.webp" width="420" alt="/library/books/5642e3b3-9617-4a7e-80b0-4e621f1787ad/edit"> | `/library/books/5642e3b3-9617-4a7e-80b0-4e621f1787ad/edit` |
| <img src="docs/images/pages/library__books__77bb3c07-6b32-44ed-a95d-8091d4005b9e.webp" width="420" alt="/library/books/77bb3c07-6b32-44ed-a95d-8091d4005b9e">            | `/library/books/77bb3c07-6b32-44ed-a95d-8091d4005b9e`      |
| <img src="docs/images/pages/library__books__77bb3c07-6b32-44ed-a95d-8091d4005b9e__edit.webp" width="420" alt="/library/books/77bb3c07-6b32-44ed-a95d-8091d4005b9e/edit"> | `/library/books/77bb3c07-6b32-44ed-a95d-8091d4005b9e/edit` |
| <img src="docs/images/pages/library__books__8a43ffe8-cb07-41ac-a1fd-7a0253d6645b.webp" width="420" alt="/library/books/8a43ffe8-cb07-41ac-a1fd-7a0253d6645b">            | `/library/books/8a43ffe8-cb07-41ac-a1fd-7a0253d6645b`      |
| <img src="docs/images/pages/library__books__8a43ffe8-cb07-41ac-a1fd-7a0253d6645b__edit.webp" width="420" alt="/library/books/8a43ffe8-cb07-41ac-a1fd-7a0253d6645b/edit"> | `/library/books/8a43ffe8-cb07-41ac-a1fd-7a0253d6645b/edit` |
| <img src="docs/images/pages/library__books__93b358b9-a869-40b7-af76-19203465e4cb.webp" width="420" alt="/library/books/93b358b9-a869-40b7-af76-19203465e4cb">            | `/library/books/93b358b9-a869-40b7-af76-19203465e4cb`      |
| <img src="docs/images/pages/library__books__93b358b9-a869-40b7-af76-19203465e4cb__edit.webp" width="420" alt="/library/books/93b358b9-a869-40b7-af76-19203465e4cb/edit"> | `/library/books/93b358b9-a869-40b7-af76-19203465e4cb/edit` |
| <img src="docs/images/pages/library__books__d5cbfc98-cb88-4acc-9f67-de6e8ad0447f.webp" width="420" alt="/library/books/d5cbfc98-cb88-4acc-9f67-de6e8ad0447f">            | `/library/books/d5cbfc98-cb88-4acc-9f67-de6e8ad0447f`      |
| <img src="docs/images/pages/library__books__d5cbfc98-cb88-4acc-9f67-de6e8ad0447f__edit.webp" width="420" alt="/library/books/d5cbfc98-cb88-4acc-9f67-de6e8ad0447f/edit"> | `/library/books/d5cbfc98-cb88-4acc-9f67-de6e8ad0447f/edit` |
| <img src="docs/images/pages/library__books__new.webp" width="420" alt="/library/books/new">                                                                              | `/library/books/new`                                       |
| <img src="docs/images/pages/library__borrow.webp" width="420" alt="/library/borrow">                                                                                     | `/library/borrow`                                          |
| <img src="docs/images/pages/library__digital.webp" width="420" alt="/library/digital">                                                                                   | `/library/digital`                                         |

</details>

<details>
<summary><strong>Tahfidz</strong> — 24 halaman</summary>

| Halaman                                                                                                                                                                    | Rute                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <img src="docs/images/pages/tahfidz.webp" width="420" alt="/tahfidz">                                                                                                      | `/tahfidz`                                                  |
| <img src="docs/images/pages/tahfidz__3c3a823e-b135-49ee-a547-2572acc3a5fe.webp" width="420" alt="/tahfidz/3c3a823e-b135-49ee-a547-2572acc3a5fe">                           | `/tahfidz/3c3a823e-b135-49ee-a547-2572acc3a5fe`             |
| <img src="docs/images/pages/tahfidz__3c3a823e-b135-49ee-a547-2572acc3a5fe__edit.webp" width="420" alt="/tahfidz/3c3a823e-b135-49ee-a547-2572acc3a5fe/edit">                | `/tahfidz/3c3a823e-b135-49ee-a547-2572acc3a5fe/edit`        |
| <img src="docs/images/pages/tahfidz__c8652f1a-25ed-498f-85e7-a30f6ce930fc.webp" width="420" alt="/tahfidz/c8652f1a-25ed-498f-85e7-a30f6ce930fc">                           | `/tahfidz/c8652f1a-25ed-498f-85e7-a30f6ce930fc`             |
| <img src="docs/images/pages/tahfidz__c8652f1a-25ed-498f-85e7-a30f6ce930fc__edit.webp" width="420" alt="/tahfidz/c8652f1a-25ed-498f-85e7-a30f6ce930fc/edit">                | `/tahfidz/c8652f1a-25ed-498f-85e7-a30f6ce930fc/edit`        |
| <img src="docs/images/pages/tahfidz__certificate.webp" width="420" alt="/tahfidz/certificate">                                                                             | `/tahfidz/certificate`                                      |
| <img src="docs/images/pages/tahfidz__d62a38ef-e397-4a8b-bb9a-aeddec4b42c6.webp" width="420" alt="/tahfidz/d62a38ef-e397-4a8b-bb9a-aeddec4b42c6">                           | `/tahfidz/d62a38ef-e397-4a8b-bb9a-aeddec4b42c6`             |
| <img src="docs/images/pages/tahfidz__d62a38ef-e397-4a8b-bb9a-aeddec4b42c6__edit.webp" width="420" alt="/tahfidz/d62a38ef-e397-4a8b-bb9a-aeddec4b42c6/edit">                | `/tahfidz/d62a38ef-e397-4a8b-bb9a-aeddec4b42c6/edit`        |
| <img src="docs/images/pages/tahfidz__dashboard.webp" width="420" alt="/tahfidz/dashboard">                                                                                 | `/tahfidz/dashboard`                                        |
| <img src="docs/images/pages/tahfidz__e-simaan.webp" width="420" alt="/tahfidz/e-simaan">                                                                                   | `/tahfidz/e-simaan`                                         |
| <img src="docs/images/pages/tahfidz__murojaah.webp" width="420" alt="/tahfidz/murojaah">                                                                                   | `/tahfidz/murojaah`                                         |
| <img src="docs/images/pages/tahfidz__murojaah__3c3a823e-b135-49ee-a547-2572acc3a5fe.webp" width="420" alt="/tahfidz/murojaah/3c3a823e-b135-49ee-a547-2572acc3a5fe">        | `/tahfidz/murojaah/3c3a823e-b135-49ee-a547-2572acc3a5fe`    |
| <img src="docs/images/pages/tahfidz__murojaah__analytics.webp" width="420" alt="/tahfidz/murojaah/analytics">                                                              | `/tahfidz/murojaah/analytics`                               |
| <img src="docs/images/pages/tahfidz__murojaah__new.webp" width="420" alt="/tahfidz/murojaah/new">                                                                          | `/tahfidz/murojaah/new`                                     |
| <img src="docs/images/pages/tahfidz__murojaah__schedule.webp" width="420" alt="/tahfidz/murojaah/schedule">                                                                | `/tahfidz/murojaah/schedule`                                |
| <img src="docs/images/pages/tahfidz__new.webp" width="420" alt="/tahfidz/new">                                                                                             | `/tahfidz/new`                                              |
| <img src="docs/images/pages/tahfidz__quran-map.webp" width="420" alt="/tahfidz/quran-map">                                                                                 | `/tahfidz/quran-map`                                        |
| <img src="docs/images/pages/tahfidz__sanad.webp" width="420" alt="/tahfidz/sanad">                                                                                         | `/tahfidz/sanad`                                            |
| <img src="docs/images/pages/tahfidz__sanad__new.webp" width="420" alt="/tahfidz/sanad/new">                                                                                | `/tahfidz/sanad/new`                                        |
| <img src="docs/images/pages/tahfidz__simaan.webp" width="420" alt="/tahfidz/simaan">                                                                                       | `/tahfidz/simaan`                                           |
| <img src="docs/images/pages/tahfidz__simaan__aa5e4648-f199-4015-a4f0-6b3581483150.webp" width="420" alt="/tahfidz/simaan/aa5e4648-f199-4015-a4f0-6b3581483150">            | `/tahfidz/simaan/aa5e4648-f199-4015-a4f0-6b3581483150`      |
| <img src="docs/images/pages/tahfidz__simaan__aa5e4648-f199-4015-a4f0-6b3581483150__edit.webp" width="420" alt="/tahfidz/simaan/aa5e4648-f199-4015-a4f0-6b3581483150/edit"> | `/tahfidz/simaan/aa5e4648-f199-4015-a4f0-6b3581483150/edit` |
| <img src="docs/images/pages/tahfidz__simaan__new.webp" width="420" alt="/tahfidz/simaan/new">                                                                              | `/tahfidz/simaan/new`                                       |
| <img src="docs/images/pages/tahfidz__simaan__schedule.webp" width="420" alt="/tahfidz/simaan/schedule">                                                                    | `/tahfidz/simaan/schedule`                                  |

</details>

<details>
<summary><strong>Takhosus</strong> — 11 halaman</summary>

| Halaman                                                                                                                                                                        | Rute                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| <img src="docs/images/pages/takhosus.webp" width="420" alt="/takhosus">                                                                                                        | `/takhosus`                                                   |
| <img src="docs/images/pages/takhosus__enrollment__e2b0f515-6eca-49d0-8d75-3e752921f193.webp" width="420" alt="/takhosus/enrollment/e2b0f515-6eca-49d0-8d75-3e752921f193">      | `/takhosus/enrollment/e2b0f515-6eca-49d0-8d75-3e752921f193`   |
| <img src="docs/images/pages/takhosus__enrollment__new.webp" width="420" alt="/takhosus/enrollment/new">                                                                        | `/takhosus/enrollment/new`                                    |
| <img src="docs/images/pages/takhosus__halaqoh.webp" width="420" alt="/takhosus/halaqoh">                                                                                       | `/takhosus/halaqoh`                                           |
| <img src="docs/images/pages/takhosus__halaqoh__58512bfd-d698-4465-8736-b8f3c8301867.webp" width="420" alt="/takhosus/halaqoh/58512bfd-d698-4465-8736-b8f3c8301867">            | `/takhosus/halaqoh/58512bfd-d698-4465-8736-b8f3c8301867`      |
| <img src="docs/images/pages/takhosus__halaqoh__new.webp" width="420" alt="/takhosus/halaqoh/new">                                                                              | `/takhosus/halaqoh/new`                                       |
| <img src="docs/images/pages/takhosus__milestones.webp" width="420" alt="/takhosus/milestones">                                                                                 | `/takhosus/milestones`                                        |
| <img src="docs/images/pages/takhosus__simaan.webp" width="420" alt="/takhosus/simaan">                                                                                         | `/takhosus/simaan`                                            |
| <img src="docs/images/pages/takhosus__simaan__aa5e4648-f199-4015-a4f0-6b3581483150__grade.webp" width="420" alt="/takhosus/simaan/aa5e4648-f199-4015-a4f0-6b3581483150/grade"> | `/takhosus/simaan/aa5e4648-f199-4015-a4f0-6b3581483150/grade` |
| <img src="docs/images/pages/takhosus__simaan__create.webp" width="420" alt="/takhosus/simaan/create">                                                                          | `/takhosus/simaan/create`                                     |
| <img src="docs/images/pages/takhosus__targets.webp" width="420" alt="/takhosus/targets">                                                                                       | `/takhosus/targets`                                           |

</details>

<details>
<summary><strong>Pembelajaran Kitab</strong> — 3 halaman</summary>

| Halaman                                                                                                                                                        | Rute                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| <img src="docs/images/pages/kitab-progress.webp" width="420" alt="/kitab-progress">                                                                            | `/kitab-progress`                                      |
| <img src="docs/images/pages/kitab-progress__6b2562d1-6c1e-427d-bb11-d589507a4270.webp" width="420" alt="/kitab-progress/6b2562d1-6c1e-427d-bb11-d589507a4270"> | `/kitab-progress/6b2562d1-6c1e-427d-bb11-d589507a4270` |
| <img src="docs/images/pages/kitab-progress__new.webp" width="420" alt="/kitab-progress/new">                                                                   | `/kitab-progress/new`                                  |

</details>

<details>
<summary><strong>Ibadah Harian</strong> — 5 halaman</summary>

| Halaman                                                                                      | Rute                  |
| -------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/pages/ibadah.webp" width="420" alt="/ibadah">                          | `/ibadah`             |
| <img src="docs/images/pages/ibadah__check-in.webp" width="420" alt="/ibadah/check-in">       | `/ibadah/check-in`    |
| <img src="docs/images/pages/ibadah__leaderboard.webp" width="420" alt="/ibadah/leaderboard"> | `/ibadah/leaderboard` |
| <img src="docs/images/pages/ibadah__statistics.webp" width="420" alt="/ibadah/statistics">   | `/ibadah/statistics`  |
| <img src="docs/images/pages/ibadah__targets.webp" width="420" alt="/ibadah/targets">         | `/ibadah/targets`     |

</details>

<details>
<summary><strong>Muhasabah</strong> — 3 halaman</summary>

| Halaman                                                                                                                                              | Rute                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| <img src="docs/images/pages/muhasabah.webp" width="420" alt="/muhasabah">                                                                            | `/muhasabah`                                      |
| <img src="docs/images/pages/muhasabah__656c1bcc-082b-4feb-8b0a-e0dc3f316455.webp" width="420" alt="/muhasabah/656c1bcc-082b-4feb-8b0a-e0dc3f316455"> | `/muhasabah/656c1bcc-082b-4feb-8b0a-e0dc3f316455` |
| <img src="docs/images/pages/muhasabah__new.webp" width="420" alt="/muhasabah/new">                                                                   | `/muhasabah/new`                                  |

</details>

<details>
<summary><strong>Muhadhoroh</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                                   | Rute                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <img src="docs/images/pages/muhadhoroh.webp" width="420" alt="/muhadhoroh">                                                                                               | `/muhadhoroh`                                               |
| <img src="docs/images/pages/muhadhoroh__491b09ad-c136-45d3-a543-29106bffc721.webp" width="420" alt="/muhadhoroh/491b09ad-c136-45d3-a543-29106bffc721">                    | `/muhadhoroh/491b09ad-c136-45d3-a543-29106bffc721`          |
| <img src="docs/images/pages/muhadhoroh__491b09ad-c136-45d3-a543-29106bffc721__evaluate.webp" width="420" alt="/muhadhoroh/491b09ad-c136-45d3-a543-29106bffc721/evaluate"> | `/muhadhoroh/491b09ad-c136-45d3-a543-29106bffc721/evaluate` |
| <img src="docs/images/pages/muhadhoroh__new.webp" width="420" alt="/muhadhoroh/new">                                                                                      | `/muhadhoroh/new`                                           |

</details>

<details>
<summary><strong>Muhadatsah</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                                   | Rute                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <img src="docs/images/pages/muhadatsah.webp" width="420" alt="/muhadatsah">                                                                                               | `/muhadatsah`                                               |
| <img src="docs/images/pages/muhadatsah__5706d5f6-a766-4fc1-976e-fe4d5ba3fc13.webp" width="420" alt="/muhadatsah/5706d5f6-a766-4fc1-976e-fe4d5ba3fc13">                    | `/muhadatsah/5706d5f6-a766-4fc1-976e-fe4d5ba3fc13`          |
| <img src="docs/images/pages/muhadatsah__5706d5f6-a766-4fc1-976e-fe4d5ba3fc13__evaluate.webp" width="420" alt="/muhadatsah/5706d5f6-a766-4fc1-976e-fe4d5ba3fc13/evaluate"> | `/muhadatsah/5706d5f6-a766-4fc1-976e-fe4d5ba3fc13/evaluate` |
| <img src="docs/images/pages/muhadatsah__new.webp" width="420" alt="/muhadatsah/new">                                                                                      | `/muhadatsah/new`                                           |

</details>

<details>
<summary><strong>Asrama</strong> — 7 halaman</summary>

| Halaman                                                                                                                                                                                                                                                         | Rute                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| <img src="docs/images/pages/dormitories.webp" width="420" alt="/dormitories">                                                                                                                                                                                   | `/dormitories`                                                                                        |
| <img src="docs/images/pages/dormitories__d672f15e-f22f-490f-a8ba-48641e345cf3.webp" width="420" alt="/dormitories/d672f15e-f22f-490f-a8ba-48641e345cf3">                                                                                                        | `/dormitories/d672f15e-f22f-490f-a8ba-48641e345cf3`                                                   |
| <img src="docs/images/pages/dormitories__d672f15e-f22f-490f-a8ba-48641e345cf3__edit.webp" width="420" alt="/dormitories/d672f15e-f22f-490f-a8ba-48641e345cf3/edit">                                                                                             | `/dormitories/d672f15e-f22f-490f-a8ba-48641e345cf3/edit`                                              |
| <img src="docs/images/pages/dormitories__d672f15e-f22f-490f-a8ba-48641e345cf3__rooms__1fecf1d0-2003-4897-a7bb-688de9ad38d2__assign.webp" width="420" alt="/dormitories/d672f15e-f22f-490f-a8ba-48641e345cf3/rooms/1fecf1d0-2003-4897-a7bb-688de9ad38d2/assign"> | `/dormitories/d672f15e-f22f-490f-a8ba-48641e345cf3/rooms/1fecf1d0-2003-4897-a7bb-688de9ad38d2/assign` |
| <img src="docs/images/pages/dormitories__d867e633-c601-4958-b71a-071d6396450d.webp" width="420" alt="/dormitories/d867e633-c601-4958-b71a-071d6396450d">                                                                                                        | `/dormitories/d867e633-c601-4958-b71a-071d6396450d`                                                   |
| <img src="docs/images/pages/dormitories__d867e633-c601-4958-b71a-071d6396450d__edit.webp" width="420" alt="/dormitories/d867e633-c601-4958-b71a-071d6396450d/edit">                                                                                             | `/dormitories/d867e633-c601-4958-b71a-071d6396450d/edit`                                              |
| <img src="docs/images/pages/dormitories__new.webp" width="420" alt="/dormitories/new">                                                                                                                                                                          | `/dormitories/new`                                                                                    |

</details>

<details>
<summary><strong>Musyrif</strong> — 2 halaman</summary>

| Halaman                                                                                                | Rute                       |
| ------------------------------------------------------------------------------------------------------ | -------------------------- |
| <img src="docs/images/pages/musyrif.webp" width="420" alt="/musyrif">                                  | `/musyrif`                 |
| <img src="docs/images/pages/musyrif__boarding-center.webp" width="420" alt="/musyrif/boarding-center"> | `/musyrif/boarding-center` |

</details>

<details>
<summary><strong>Rapor Pesantren</strong> — 8 halaman</summary>

| Halaman                                                                                                                                                                           | Rute                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| <img src="docs/images/pages/rapor-pesantren.webp" width="420" alt="/rapor-pesantren">                                                                                             | `/rapor-pesantren`                                              |
| <img src="docs/images/pages/rapor-pesantren__cecb6546-b2f6-45b7-a518-1b55dea1a84b.webp" width="420" alt="/rapor-pesantren/cecb6546-b2f6-45b7-a518-1b55dea1a84b">                  | `/rapor-pesantren/cecb6546-b2f6-45b7-a518-1b55dea1a84b`         |
| <img src="docs/images/pages/rapor-pesantren__config.webp" width="420" alt="/rapor-pesantren/config">                                                                              | `/rapor-pesantren/config`                                       |
| <img src="docs/images/pages/rapor-pesantren__generate.webp" width="420" alt="/rapor-pesantren/generate">                                                                          | `/rapor-pesantren/generate`                                     |
| <img src="docs/images/pages/rapor-pesantren__leger.webp" width="420" alt="/rapor-pesantren/leger">                                                                                | `/rapor-pesantren/leger`                                        |
| <img src="docs/images/pages/rapor-pesantren__preview.webp" width="420" alt="/rapor-pesantren/preview">                                                                            | `/rapor-pesantren/preview`                                      |
| <img src="docs/images/pages/rapor-pesantren__print__cecb6546-b2f6-45b7-a518-1b55dea1a84b.webp" width="420" alt="/rapor-pesantren/print/cecb6546-b2f6-45b7-a518-1b55dea1a84b">     | `/rapor-pesantren/print/cecb6546-b2f6-45b7-a518-1b55dea1a84b`   |
| <img src="docs/images/pages/rapor-pesantren__unified__cecb6546-b2f6-45b7-a518-1b55dea1a84b.webp" width="420" alt="/rapor-pesantren/unified/cecb6546-b2f6-45b7-a518-1b55dea1a84b"> | `/rapor-pesantren/unified/cecb6546-b2f6-45b7-a518-1b55dea1a84b` |

</details>

<details>
<summary><strong>Pelanggaran</strong> — 12 halaman</summary>

| Halaman                                                                                                                                                           | Rute                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| <img src="docs/images/pages/violations.webp" width="420" alt="/violations">                                                                                       | `/violations`                                           |
| <img src="docs/images/pages/violations__0ea67bb2-2ed6-486f-965c-5ea13a1ffcae.webp" width="420" alt="/violations/0ea67bb2-2ed6-486f-965c-5ea13a1ffcae">            | `/violations/0ea67bb2-2ed6-486f-965c-5ea13a1ffcae`      |
| <img src="docs/images/pages/violations__0ea67bb2-2ed6-486f-965c-5ea13a1ffcae__edit.webp" width="420" alt="/violations/0ea67bb2-2ed6-486f-965c-5ea13a1ffcae/edit"> | `/violations/0ea67bb2-2ed6-486f-965c-5ea13a1ffcae/edit` |
| <img src="docs/images/pages/violations__17d8793b-c49e-42a1-828a-ce3a4a465d9a.webp" width="420" alt="/violations/17d8793b-c49e-42a1-828a-ce3a4a465d9a">            | `/violations/17d8793b-c49e-42a1-828a-ce3a4a465d9a`      |
| <img src="docs/images/pages/violations__17d8793b-c49e-42a1-828a-ce3a4a465d9a__edit.webp" width="420" alt="/violations/17d8793b-c49e-42a1-828a-ce3a4a465d9a/edit"> | `/violations/17d8793b-c49e-42a1-828a-ce3a4a465d9a/edit` |
| <img src="docs/images/pages/violations__30c314ef-736d-4c39-990a-80f562e607b9.webp" width="420" alt="/violations/30c314ef-736d-4c39-990a-80f562e607b9">            | `/violations/30c314ef-736d-4c39-990a-80f562e607b9`      |
| <img src="docs/images/pages/violations__30c314ef-736d-4c39-990a-80f562e607b9__edit.webp" width="420" alt="/violations/30c314ef-736d-4c39-990a-80f562e607b9/edit"> | `/violations/30c314ef-736d-4c39-990a-80f562e607b9/edit` |
| <img src="docs/images/pages/violations__4e35eb67-6617-4bc3-8616-49fb33aed653.webp" width="420" alt="/violations/4e35eb67-6617-4bc3-8616-49fb33aed653">            | `/violations/4e35eb67-6617-4bc3-8616-49fb33aed653`      |
| <img src="docs/images/pages/violations__4e35eb67-6617-4bc3-8616-49fb33aed653__edit.webp" width="420" alt="/violations/4e35eb67-6617-4bc3-8616-49fb33aed653/edit"> | `/violations/4e35eb67-6617-4bc3-8616-49fb33aed653/edit` |
| <img src="docs/images/pages/violations__new.webp" width="420" alt="/violations/new">                                                                              | `/violations/new`                                       |
| <img src="docs/images/pages/violations__types__ketertiban__edit.webp" width="420" alt="/violations/types/ketertiban/edit">                                        | `/violations/types/ketertiban/edit`                     |
| <img src="docs/images/pages/violations__types__new.webp" width="420" alt="/violations/types/new">                                                                 | `/violations/types/new`                                 |

</details>

<details>
<summary><strong>Penghargaan</strong> — 12 halaman</summary>

| Halaman                                                                                                                                                     | Rute                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <img src="docs/images/pages/rewards.webp" width="420" alt="/rewards">                                                                                       | `/rewards`                                           |
| <img src="docs/images/pages/rewards__41d47896-eb77-458c-af1c-865960ce0f42.webp" width="420" alt="/rewards/41d47896-eb77-458c-af1c-865960ce0f42">            | `/rewards/41d47896-eb77-458c-af1c-865960ce0f42`      |
| <img src="docs/images/pages/rewards__41d47896-eb77-458c-af1c-865960ce0f42__edit.webp" width="420" alt="/rewards/41d47896-eb77-458c-af1c-865960ce0f42/edit"> | `/rewards/41d47896-eb77-458c-af1c-865960ce0f42/edit` |
| <img src="docs/images/pages/rewards__66d7c3ba-befe-4509-924e-47c930241074.webp" width="420" alt="/rewards/66d7c3ba-befe-4509-924e-47c930241074">            | `/rewards/66d7c3ba-befe-4509-924e-47c930241074`      |
| <img src="docs/images/pages/rewards__66d7c3ba-befe-4509-924e-47c930241074__edit.webp" width="420" alt="/rewards/66d7c3ba-befe-4509-924e-47c930241074/edit"> | `/rewards/66d7c3ba-befe-4509-924e-47c930241074/edit` |
| <img src="docs/images/pages/rewards__d26923a0-6379-4e2d-a015-5b0bb3eb877c.webp" width="420" alt="/rewards/d26923a0-6379-4e2d-a015-5b0bb3eb877c">            | `/rewards/d26923a0-6379-4e2d-a015-5b0bb3eb877c`      |
| <img src="docs/images/pages/rewards__d26923a0-6379-4e2d-a015-5b0bb3eb877c__edit.webp" width="420" alt="/rewards/d26923a0-6379-4e2d-a015-5b0bb3eb877c/edit"> | `/rewards/d26923a0-6379-4e2d-a015-5b0bb3eb877c/edit` |
| <img src="docs/images/pages/rewards__fd4fdbb3-d400-4b0b-9dfa-8ffa92a92b2e.webp" width="420" alt="/rewards/fd4fdbb3-d400-4b0b-9dfa-8ffa92a92b2e">            | `/rewards/fd4fdbb3-d400-4b0b-9dfa-8ffa92a92b2e`      |
| <img src="docs/images/pages/rewards__fd4fdbb3-d400-4b0b-9dfa-8ffa92a92b2e__edit.webp" width="420" alt="/rewards/fd4fdbb3-d400-4b0b-9dfa-8ffa92a92b2e/edit"> | `/rewards/fd4fdbb3-d400-4b0b-9dfa-8ffa92a92b2e/edit` |
| <img src="docs/images/pages/rewards__new.webp" width="420" alt="/rewards/new">                                                                              | `/rewards/new`                                       |
| <img src="docs/images/pages/rewards__types__new.webp" width="420" alt="/rewards/types/new">                                                                 | `/rewards/types/new`                                 |
| <img src="docs/images/pages/rewards__types__tahfidz__edit.webp" width="420" alt="/rewards/types/tahfidz/edit">                                              | `/rewards/types/tahfidz/edit`                        |

</details>

<details>
<summary><strong>Perizinan</strong> — 7 halaman</summary>

| Halaman                                                                                                                                                     | Rute                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <img src="docs/images/pages/permits.webp" width="420" alt="/permits">                                                                                       | `/permits`                                           |
| <img src="docs/images/pages/permits__24f41000-5bd4-49f5-bab0-63ff113a61aa.webp" width="420" alt="/permits/24f41000-5bd4-49f5-bab0-63ff113a61aa">            | `/permits/24f41000-5bd4-49f5-bab0-63ff113a61aa`      |
| <img src="docs/images/pages/permits__8bac7852-7364-40d9-bfa5-d24c502e8a02.webp" width="420" alt="/permits/8bac7852-7364-40d9-bfa5-d24c502e8a02">            | `/permits/8bac7852-7364-40d9-bfa5-d24c502e8a02`      |
| <img src="docs/images/pages/permits__8bac7852-7364-40d9-bfa5-d24c502e8a02__edit.webp" width="420" alt="/permits/8bac7852-7364-40d9-bfa5-d24c502e8a02/edit"> | `/permits/8bac7852-7364-40d9-bfa5-d24c502e8a02/edit` |
| <img src="docs/images/pages/permits__8cd50f36-feb5-4b42-a53e-3eba698b73ca.webp" width="420" alt="/permits/8cd50f36-feb5-4b42-a53e-3eba698b73ca">            | `/permits/8cd50f36-feb5-4b42-a53e-3eba698b73ca`      |
| <img src="docs/images/pages/permits__e697396d-3004-45f6-af4a-41991d21974a.webp" width="420" alt="/permits/e697396d-3004-45f6-af4a-41991d21974a">            | `/permits/e697396d-3004-45f6-af4a-41991d21974a`      |
| <img src="docs/images/pages/permits__new.webp" width="420" alt="/permits/new">                                                                              | `/permits/new`                                       |

</details>

<details>
<summary><strong>Konseling</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                           | Rute                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| <img src="docs/images/pages/counseling.webp" width="420" alt="/counseling">                                                                                       | `/counseling`                                           |
| <img src="docs/images/pages/counseling__60252995-2426-494c-be72-ce2791261d5b.webp" width="420" alt="/counseling/60252995-2426-494c-be72-ce2791261d5b">            | `/counseling/60252995-2426-494c-be72-ce2791261d5b`      |
| <img src="docs/images/pages/counseling__60252995-2426-494c-be72-ce2791261d5b__edit.webp" width="420" alt="/counseling/60252995-2426-494c-be72-ce2791261d5b/edit"> | `/counseling/60252995-2426-494c-be72-ce2791261d5b/edit` |
| <img src="docs/images/pages/counseling__new.webp" width="420" alt="/counseling/new">                                                                              | `/counseling/new`                                       |

</details>

<details>
<summary><strong>Kesehatan (UKS)</strong> — 13 halaman</summary>

| Halaman                                                                                                                                                   | Rute                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| <img src="docs/images/pages/health.webp" width="420" alt="/health">                                                                                       | `/health`                                           |
| <img src="docs/images/pages/health__1d96e723-b4f8-4dc2-b750-fb1d86f8c5d0.webp" width="420" alt="/health/1d96e723-b4f8-4dc2-b750-fb1d86f8c5d0">            | `/health/1d96e723-b4f8-4dc2-b750-fb1d86f8c5d0`      |
| <img src="docs/images/pages/health__1d96e723-b4f8-4dc2-b750-fb1d86f8c5d0__edit.webp" width="420" alt="/health/1d96e723-b4f8-4dc2-b750-fb1d86f8c5d0/edit"> | `/health/1d96e723-b4f8-4dc2-b750-fb1d86f8c5d0/edit` |
| <img src="docs/images/pages/health__31c5b7d2-c79a-4dcd-8603-273110fe407d.webp" width="420" alt="/health/31c5b7d2-c79a-4dcd-8603-273110fe407d">            | `/health/31c5b7d2-c79a-4dcd-8603-273110fe407d`      |
| <img src="docs/images/pages/health__31c5b7d2-c79a-4dcd-8603-273110fe407d__edit.webp" width="420" alt="/health/31c5b7d2-c79a-4dcd-8603-273110fe407d/edit"> | `/health/31c5b7d2-c79a-4dcd-8603-273110fe407d/edit` |
| <img src="docs/images/pages/health__b17cc1c8-6ec4-403c-a29a-09de28fb2640.webp" width="420" alt="/health/b17cc1c8-6ec4-403c-a29a-09de28fb2640">            | `/health/b17cc1c8-6ec4-403c-a29a-09de28fb2640`      |
| <img src="docs/images/pages/health__b17cc1c8-6ec4-403c-a29a-09de28fb2640__edit.webp" width="420" alt="/health/b17cc1c8-6ec4-403c-a29a-09de28fb2640/edit"> | `/health/b17cc1c8-6ec4-403c-a29a-09de28fb2640/edit` |
| <img src="docs/images/pages/health__e005fab6-bde7-4ac6-a940-a8823c4bf8ad.webp" width="420" alt="/health/e005fab6-bde7-4ac6-a940-a8823c4bf8ad">            | `/health/e005fab6-bde7-4ac6-a940-a8823c4bf8ad`      |
| <img src="docs/images/pages/health__e005fab6-bde7-4ac6-a940-a8823c4bf8ad__edit.webp" width="420" alt="/health/e005fab6-bde7-4ac6-a940-a8823c4bf8ad/edit"> | `/health/e005fab6-bde7-4ac6-a940-a8823c4bf8ad/edit` |
| <img src="docs/images/pages/health__e21d1e06-3c0f-4ba0-937a-65829f54b5c7.webp" width="420" alt="/health/e21d1e06-3c0f-4ba0-937a-65829f54b5c7">            | `/health/e21d1e06-3c0f-4ba0-937a-65829f54b5c7`      |
| <img src="docs/images/pages/health__e21d1e06-3c0f-4ba0-937a-65829f54b5c7__edit.webp" width="420" alt="/health/e21d1e06-3c0f-4ba0-937a-65829f54b5c7/edit"> | `/health/e21d1e06-3c0f-4ba0-937a-65829f54b5c7/edit` |
| <img src="docs/images/pages/health__growth.webp" width="420" alt="/health/growth">                                                                        | `/health/growth`                                    |
| <img src="docs/images/pages/health__new.webp" width="420" alt="/health/new">                                                                              | `/health/new`                                       |

</details>

<details>
<summary><strong>Tabungan Santri</strong> — 4 halaman</summary>

| Halaman                                                                                                                                        | Rute                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| <img src="docs/images/pages/wallet.webp" width="420" alt="/wallet">                                                                            | `/wallet`                                      |
| <img src="docs/images/pages/wallet__3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd.webp" width="420" alt="/wallet/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd"> | `/wallet/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd` |
| <img src="docs/images/pages/wallet__4b56ed3a-52b2-4032-b01c-becac31a8920.webp" width="420" alt="/wallet/4b56ed3a-52b2-4032-b01c-becac31a8920"> | `/wallet/4b56ed3a-52b2-4032-b01c-becac31a8920` |
| <img src="docs/images/pages/wallet__7d867a1f-8ad5-4d94-814c-cb70ae3dfa55.webp" width="420" alt="/wallet/7d867a1f-8ad5-4d94-814c-cb70ae3dfa55"> | `/wallet/7d867a1f-8ad5-4d94-814c-cb70ae3dfa55` |

</details>

<details>
<summary><strong>Makan / Catering</strong> — 5 halaman</summary>

| Halaman                                                                                                                                                              | Rute                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| <img src="docs/images/pages/meals.webp" width="420" alt="/meals">                                                                                                    | `/meals`                                                 |
| <img src="docs/images/pages/meals__menus.webp" width="420" alt="/meals/menus">                                                                                       | `/meals/menus`                                           |
| <img src="docs/images/pages/meals__menus__7a108fa3-80f8-46e6-ba04-58251a65dee1.webp" width="420" alt="/meals/menus/7a108fa3-80f8-46e6-ba04-58251a65dee1">            | `/meals/menus/7a108fa3-80f8-46e6-ba04-58251a65dee1`      |
| <img src="docs/images/pages/meals__menus__7a108fa3-80f8-46e6-ba04-58251a65dee1__edit.webp" width="420" alt="/meals/menus/7a108fa3-80f8-46e6-ba04-58251a65dee1/edit"> | `/meals/menus/7a108fa3-80f8-46e6-ba04-58251a65dee1/edit` |
| <img src="docs/images/pages/meals__menus__new.webp" width="420" alt="/meals/menus/new">                                                                              | `/meals/menus/new`                                       |

</details>

<details>
<summary><strong>Laundry</strong> — 1 halaman</summary>

| Halaman                                                               | Rute       |
| --------------------------------------------------------------------- | ---------- |
| <img src="docs/images/pages/laundry.webp" width="420" alt="/laundry"> | `/laundry` |

</details>

<details>
<summary><strong>Kantin</strong> — 1 halaman</summary>

| Halaman                                                               | Rute       |
| --------------------------------------------------------------------- | ---------- |
| <img src="docs/images/pages/canteen.webp" width="420" alt="/canteen"> | `/canteen` |

</details>

<details>
<summary><strong>Inventaris & Aset</strong> — 23 halaman</summary>

| Halaman                                                                                                                                                                                                                                                                        | Rute                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/images/pages/inventory.webp" width="420" alt="/inventory">                                                                                                                                                                                                      | `/inventory`                                                                                                                                             |
| <img src="docs/images/pages/inventory__12b001a4-9158-4561-b1ec-99aa00f7252f.webp" width="420" alt="/inventory/12b001a4-9158-4561-b1ec-99aa00f7252f">                                                                                                                           | `/inventory/12b001a4-9158-4561-b1ec-99aa00f7252f`                                                                                                        |
| <img src="docs/images/pages/inventory__12b001a4-9158-4561-b1ec-99aa00f7252f__edit.webp" width="420" alt="/inventory/12b001a4-9158-4561-b1ec-99aa00f7252f/edit">                                                                                                                | `/inventory/12b001a4-9158-4561-b1ec-99aa00f7252f/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__18e764c2-385e-48fe-8505-a072e07da4fe.webp" width="420" alt="/inventory/18e764c2-385e-48fe-8505-a072e07da4fe">                                                                                                                           | `/inventory/18e764c2-385e-48fe-8505-a072e07da4fe`                                                                                                        |
| <img src="docs/images/pages/inventory__18e764c2-385e-48fe-8505-a072e07da4fe__edit.webp" width="420" alt="/inventory/18e764c2-385e-48fe-8505-a072e07da4fe/edit">                                                                                                                | `/inventory/18e764c2-385e-48fe-8505-a072e07da4fe/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__7ba218a8-8eb5-47fe-84d3-9c1d124e9fbd.webp" width="420" alt="/inventory/7ba218a8-8eb5-47fe-84d3-9c1d124e9fbd">                                                                                                                           | `/inventory/7ba218a8-8eb5-47fe-84d3-9c1d124e9fbd`                                                                                                        |
| <img src="docs/images/pages/inventory__7ba218a8-8eb5-47fe-84d3-9c1d124e9fbd__edit.webp" width="420" alt="/inventory/7ba218a8-8eb5-47fe-84d3-9c1d124e9fbd/edit">                                                                                                                | `/inventory/7ba218a8-8eb5-47fe-84d3-9c1d124e9fbd/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__86ba13bd-85f4-4b73-849f-531b40f8ded0.webp" width="420" alt="/inventory/86ba13bd-85f4-4b73-849f-531b40f8ded0">                                                                                                                           | `/inventory/86ba13bd-85f4-4b73-849f-531b40f8ded0`                                                                                                        |
| <img src="docs/images/pages/inventory__86ba13bd-85f4-4b73-849f-531b40f8ded0__edit.webp" width="420" alt="/inventory/86ba13bd-85f4-4b73-849f-531b40f8ded0/edit">                                                                                                                | `/inventory/86ba13bd-85f4-4b73-849f-531b40f8ded0/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__assignments.webp" width="420" alt="/inventory/assignments">                                                                                                                                                                             | `/inventory/assignments`                                                                                                                                 |
| <img src="docs/images/pages/inventory__audits.webp" width="420" alt="/inventory/audits">                                                                                                                                                                                       | `/inventory/audits`                                                                                                                                      |
| <img src="docs/images/pages/inventory__audits__ead21e37-e917-483e-a2f2-7ead18b0911f.webp" width="420" alt="/inventory/audits/ead21e37-e917-483e-a2f2-7ead18b0911f">                                                                                                            | `/inventory/audits/ead21e37-e917-483e-a2f2-7ead18b0911f`                                                                                                 |
| <img src="docs/images/pages/inventory__audits__ead21e37-e917-483e-a2f2-7ead18b0911f__q7c527fef.webp" width="420" alt="/inventory/audits/ead21e37-e917-483e-a2f2-7ead18b0911f?unitId=833c0b90-a834-4f61-bf6b-280ba0b1c496&academicYearId=1c26ab5d-3bac-44fa-812e-00e02d0306da"> | `/inventory/audits/ead21e37-e917-483e-a2f2-7ead18b0911f?unitId=833c0b90-a834-4f61-bf6b-280ba0b1c496&academicYearId=1c26ab5d-3bac-44fa-812e-00e02d0306da` |
| <img src="docs/images/pages/inventory__b89e88fb-d324-4a4e-bf0a-601aacbfd292.webp" width="420" alt="/inventory/b89e88fb-d324-4a4e-bf0a-601aacbfd292">                                                                                                                           | `/inventory/b89e88fb-d324-4a4e-bf0a-601aacbfd292`                                                                                                        |
| <img src="docs/images/pages/inventory__b89e88fb-d324-4a4e-bf0a-601aacbfd292__edit.webp" width="420" alt="/inventory/b89e88fb-d324-4a4e-bf0a-601aacbfd292/edit">                                                                                                                | `/inventory/b89e88fb-d324-4a4e-bf0a-601aacbfd292/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__ce1274df-8a82-483a-8174-83131909d6f3.webp" width="420" alt="/inventory/ce1274df-8a82-483a-8174-83131909d6f3">                                                                                                                           | `/inventory/ce1274df-8a82-483a-8174-83131909d6f3`                                                                                                        |
| <img src="docs/images/pages/inventory__ce1274df-8a82-483a-8174-83131909d6f3__edit.webp" width="420" alt="/inventory/ce1274df-8a82-483a-8174-83131909d6f3/edit">                                                                                                                | `/inventory/ce1274df-8a82-483a-8174-83131909d6f3/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__d2d86693-0b3a-42ad-bca3-a7166450feca.webp" width="420" alt="/inventory/d2d86693-0b3a-42ad-bca3-a7166450feca">                                                                                                                           | `/inventory/d2d86693-0b3a-42ad-bca3-a7166450feca`                                                                                                        |
| <img src="docs/images/pages/inventory__d2d86693-0b3a-42ad-bca3-a7166450feca__edit.webp" width="420" alt="/inventory/d2d86693-0b3a-42ad-bca3-a7166450feca/edit">                                                                                                                | `/inventory/d2d86693-0b3a-42ad-bca3-a7166450feca/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__d87e0ac1-81b9-4b37-ade6-e63fd824dac9.webp" width="420" alt="/inventory/d87e0ac1-81b9-4b37-ade6-e63fd824dac9">                                                                                                                           | `/inventory/d87e0ac1-81b9-4b37-ade6-e63fd824dac9`                                                                                                        |
| <img src="docs/images/pages/inventory__d87e0ac1-81b9-4b37-ade6-e63fd824dac9__edit.webp" width="420" alt="/inventory/d87e0ac1-81b9-4b37-ade6-e63fd824dac9/edit">                                                                                                                | `/inventory/d87e0ac1-81b9-4b37-ade6-e63fd824dac9/edit`                                                                                                   |
| <img src="docs/images/pages/inventory__maintenance.webp" width="420" alt="/inventory/maintenance">                                                                                                                                                                             | `/inventory/maintenance`                                                                                                                                 |
| <img src="docs/images/pages/inventory__new.webp" width="420" alt="/inventory/new">                                                                                                                                                                                             | `/inventory/new`                                                                                                                                         |

</details>

<details>
<summary><strong>Fasilitas</strong> — 1 halaman</summary>

| Halaman                                                                     | Rute          |
| --------------------------------------------------------------------------- | ------------- |
| <img src="docs/images/pages/facilities.webp" width="420" alt="/facilities"> | `/facilities` |

</details>

<details>
<summary><strong>Ekstrakurikuler</strong> — 3 halaman</summary>

| Halaman                                                                                                                                                          | Rute                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| <img src="docs/images/pages/extracurricular.webp" width="420" alt="/extracurricular">                                                                            | `/extracurricular`                                      |
| <img src="docs/images/pages/extracurricular__0196d388-2bc5-4c0a-a2f4-f546e9988d49.webp" width="420" alt="/extracurricular/0196d388-2bc5-4c0a-a2f4-f546e9988d49"> | `/extracurricular/0196d388-2bc5-4c0a-a2f4-f546e9988d49` |
| <img src="docs/images/pages/extracurricular__new.webp" width="420" alt="/extracurricular/new">                                                                   | `/extracurricular/new`                                  |

</details>

<details>
<summary><strong>Notifikasi</strong> — 15 halaman</summary>

| Halaman                                                                                                                                                      | Rute                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| <img src="docs/images/pages/notifications.webp" width="420" alt="/notifications">                                                                            | `/notifications`                                      |
| <img src="docs/images/pages/notifications__038dbeee-7077-4b29-9000-0643a5527806.webp" width="420" alt="/notifications/038dbeee-7077-4b29-9000-0643a5527806"> | `/notifications/038dbeee-7077-4b29-9000-0643a5527806` |
| <img src="docs/images/pages/notifications__03fdcf82-674d-4667-a5fd-4bd7df47faa1.webp" width="420" alt="/notifications/03fdcf82-674d-4667-a5fd-4bd7df47faa1"> | `/notifications/03fdcf82-674d-4667-a5fd-4bd7df47faa1` |
| <img src="docs/images/pages/notifications__0a2a9b0a-25c1-45a9-91e8-d6d08e6f4175.webp" width="420" alt="/notifications/0a2a9b0a-25c1-45a9-91e8-d6d08e6f4175"> | `/notifications/0a2a9b0a-25c1-45a9-91e8-d6d08e6f4175` |
| <img src="docs/images/pages/notifications__2963c95e-8eee-44d6-bf77-1f0527772b8a.webp" width="420" alt="/notifications/2963c95e-8eee-44d6-bf77-1f0527772b8a"> | `/notifications/2963c95e-8eee-44d6-bf77-1f0527772b8a` |
| <img src="docs/images/pages/notifications__731ffd62-082d-4844-a1d6-ac8108e464ba.webp" width="420" alt="/notifications/731ffd62-082d-4844-a1d6-ac8108e464ba"> | `/notifications/731ffd62-082d-4844-a1d6-ac8108e464ba` |
| <img src="docs/images/pages/notifications__74b3b8d5-36bd-48d2-99b7-1b7747534bb7.webp" width="420" alt="/notifications/74b3b8d5-36bd-48d2-99b7-1b7747534bb7"> | `/notifications/74b3b8d5-36bd-48d2-99b7-1b7747534bb7` |
| <img src="docs/images/pages/notifications__a924087d-7ad6-4536-829d-3bd6ac2abc28.webp" width="420" alt="/notifications/a924087d-7ad6-4536-829d-3bd6ac2abc28"> | `/notifications/a924087d-7ad6-4536-829d-3bd6ac2abc28` |
| <img src="docs/images/pages/notifications__f844c8e4-d0e2-4ad2-8667-2fd324930351.webp" width="420" alt="/notifications/f844c8e4-d0e2-4ad2-8667-2fd324930351"> | `/notifications/f844c8e4-d0e2-4ad2-8667-2fd324930351` |
| <img src="docs/images/pages/notifications__new.webp" width="420" alt="/notifications/new">                                                                   | `/notifications/new`                                  |
| <img src="docs/images/pages/notifications__quick-send.webp" width="420" alt="/notifications/quick-send">                                                     | `/notifications/quick-send`                           |
| <img src="docs/images/pages/notifications__settings.webp" width="420" alt="/notifications/settings">                                                         | `/notifications/settings`                             |
| <img src="docs/images/pages/notifications__templates.webp" width="420" alt="/notifications/templates">                                                       | `/notifications/templates`                            |
| <img src="docs/images/pages/notifications__templates__new.webp" width="420" alt="/notifications/templates/new">                                              | `/notifications/templates/new`                        |
| <img src="docs/images/pages/notifications__whatsapp.webp" width="420" alt="/notifications/whatsapp">                                                         | `/notifications/whatsapp`                             |

</details>

<details>
<summary><strong>Pengumuman & Berita</strong> — 1 halaman</summary>

| Halaman                                                                           | Rute             |
| --------------------------------------------------------------------------------- | ---------------- |
| <img src="docs/images/pages/announcements.webp" width="420" alt="/announcements"> | `/announcements` |

</details>

<details>
<summary><strong>E-Office</strong> — 6 halaman</summary>

| Halaman                                                                                                                                                           | Rute                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| <img src="docs/images/pages/e-office.webp" width="420" alt="/e-office">                                                                                           | `/e-office`                                             |
| <img src="docs/images/pages/e-office__archive.webp" width="420" alt="/e-office/archive">                                                                          | `/e-office/archive`                                     |
| <img src="docs/images/pages/e-office__create.webp" width="420" alt="/e-office/create">                                                                            | `/e-office/create`                                      |
| <img src="docs/images/pages/e-office__inbox.webp" width="420" alt="/e-office/inbox">                                                                              | `/e-office/inbox`                                       |
| <img src="docs/images/pages/e-office__letter__a94715a5-07f6-4de1-b7a8-a80f6ee1339f.webp" width="420" alt="/e-office/letter/a94715a5-07f6-4de1-b7a8-a80f6ee1339f"> | `/e-office/letter/a94715a5-07f6-4de1-b7a8-a80f6ee1339f` |
| <img src="docs/images/pages/e-office__outbox.webp" width="420" alt="/e-office/outbox">                                                                            | `/e-office/outbox`                                      |

</details>

<details>
<summary><strong>Kepegawaian (HR)</strong> — 55 halaman</summary>

| Halaman                                                                                                                                                                  | Rute                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| <img src="docs/images/pages/hr.webp" width="420" alt="/hr">                                                                                                              | `/hr`                                                      |
| <img src="docs/images/pages/hr__attendance.webp" width="420" alt="/hr/attendance">                                                                                       | `/hr/attendance`                                           |
| <img src="docs/images/pages/hr__departments.webp" width="420" alt="/hr/departments">                                                                                     | `/hr/departments`                                          |
| <img src="docs/images/pages/hr__employees.webp" width="420" alt="/hr/employees">                                                                                         | `/hr/employees`                                            |
| <img src="docs/images/pages/hr__employees__124057da-2474-4e99-8a90-0c0e05e03886.webp" width="420" alt="/hr/employees/124057da-2474-4e99-8a90-0c0e05e03886">              | `/hr/employees/124057da-2474-4e99-8a90-0c0e05e03886`       |
| <img src="docs/images/pages/hr__employees__124057da-2474-4e99-8a90-0c0e05e03886__edit.webp" width="420" alt="/hr/employees/124057da-2474-4e99-8a90-0c0e05e03886/edit">   | `/hr/employees/124057da-2474-4e99-8a90-0c0e05e03886/edit`  |
| <img src="docs/images/pages/hr__employees__12b9b9e3-bf76-4505-acc2-6e8ed902910d.webp" width="420" alt="/hr/employees/12b9b9e3-bf76-4505-acc2-6e8ed902910d">              | `/hr/employees/12b9b9e3-bf76-4505-acc2-6e8ed902910d`       |
| <img src="docs/images/pages/hr__employees__12b9b9e3-bf76-4505-acc2-6e8ed902910d__edit.webp" width="420" alt="/hr/employees/12b9b9e3-bf76-4505-acc2-6e8ed902910d/edit">   | `/hr/employees/12b9b9e3-bf76-4505-acc2-6e8ed902910d/edit`  |
| <img src="docs/images/pages/hr__employees__131e1e15-3b52-479d-a086-fe78251c2dde.webp" width="420" alt="/hr/employees/131e1e15-3b52-479d-a086-fe78251c2dde">              | `/hr/employees/131e1e15-3b52-479d-a086-fe78251c2dde`       |
| <img src="docs/images/pages/hr__employees__131e1e15-3b52-479d-a086-fe78251c2dde__edit.webp" width="420" alt="/hr/employees/131e1e15-3b52-479d-a086-fe78251c2dde/edit">   | `/hr/employees/131e1e15-3b52-479d-a086-fe78251c2dde/edit`  |
| <img src="docs/images/pages/hr__employees__17f0c98f-4ecc-4e91-b5d1-4de2a120b266.webp" width="420" alt="/hr/employees/17f0c98f-4ecc-4e91-b5d1-4de2a120b266">              | `/hr/employees/17f0c98f-4ecc-4e91-b5d1-4de2a120b266`       |
| <img src="docs/images/pages/hr__employees__17f0c98f-4ecc-4e91-b5d1-4de2a120b266__edit.webp" width="420" alt="/hr/employees/17f0c98f-4ecc-4e91-b5d1-4de2a120b266/edit">   | `/hr/employees/17f0c98f-4ecc-4e91-b5d1-4de2a120b266/edit`  |
| <img src="docs/images/pages/hr__employees__1ddd3965-afa0-4574-b450-058e88f4fbcf.webp" width="420" alt="/hr/employees/1ddd3965-afa0-4574-b450-058e88f4fbcf">              | `/hr/employees/1ddd3965-afa0-4574-b450-058e88f4fbcf`       |
| <img src="docs/images/pages/hr__employees__1ddd3965-afa0-4574-b450-058e88f4fbcf__edit.webp" width="420" alt="/hr/employees/1ddd3965-afa0-4574-b450-058e88f4fbcf/edit">   | `/hr/employees/1ddd3965-afa0-4574-b450-058e88f4fbcf/edit`  |
| <img src="docs/images/pages/hr__employees__22695045-04df-4f64-a592-286794d11121.webp" width="420" alt="/hr/employees/22695045-04df-4f64-a592-286794d11121">              | `/hr/employees/22695045-04df-4f64-a592-286794d11121`       |
| <img src="docs/images/pages/hr__employees__22695045-04df-4f64-a592-286794d11121__edit.webp" width="420" alt="/hr/employees/22695045-04df-4f64-a592-286794d11121/edit">   | `/hr/employees/22695045-04df-4f64-a592-286794d11121/edit`  |
| <img src="docs/images/pages/hr__employees__320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e.webp" width="420" alt="/hr/employees/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e">              | `/hr/employees/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e`       |
| <img src="docs/images/pages/hr__employees__320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e__edit.webp" width="420" alt="/hr/employees/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e/edit">   | `/hr/employees/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e/edit`  |
| <img src="docs/images/pages/hr__employees__41fba8c6-007a-4b39-a32d-5414ed384382.webp" width="420" alt="/hr/employees/41fba8c6-007a-4b39-a32d-5414ed384382">              | `/hr/employees/41fba8c6-007a-4b39-a32d-5414ed384382`       |
| <img src="docs/images/pages/hr__employees__41fba8c6-007a-4b39-a32d-5414ed384382__edit.webp" width="420" alt="/hr/employees/41fba8c6-007a-4b39-a32d-5414ed384382/edit">   | `/hr/employees/41fba8c6-007a-4b39-a32d-5414ed384382/edit`  |
| <img src="docs/images/pages/hr__employees__43abf78b-4cc7-4c36-a992-81532b7075b4.webp" width="420" alt="/hr/employees/43abf78b-4cc7-4c36-a992-81532b7075b4">              | `/hr/employees/43abf78b-4cc7-4c36-a992-81532b7075b4`       |
| <img src="docs/images/pages/hr__employees__43abf78b-4cc7-4c36-a992-81532b7075b4__edit.webp" width="420" alt="/hr/employees/43abf78b-4cc7-4c36-a992-81532b7075b4/edit">   | `/hr/employees/43abf78b-4cc7-4c36-a992-81532b7075b4/edit`  |
| <img src="docs/images/pages/hr__employees__53d2b3d7-f244-4115-b54f-6e2390639693.webp" width="420" alt="/hr/employees/53d2b3d7-f244-4115-b54f-6e2390639693">              | `/hr/employees/53d2b3d7-f244-4115-b54f-6e2390639693`       |
| <img src="docs/images/pages/hr__employees__53d2b3d7-f244-4115-b54f-6e2390639693__edit.webp" width="420" alt="/hr/employees/53d2b3d7-f244-4115-b54f-6e2390639693/edit">   | `/hr/employees/53d2b3d7-f244-4115-b54f-6e2390639693/edit`  |
| <img src="docs/images/pages/hr__employees__7788e5a3-3212-4ed8-a1e7-8b9456b2f956.webp" width="420" alt="/hr/employees/7788e5a3-3212-4ed8-a1e7-8b9456b2f956">              | `/hr/employees/7788e5a3-3212-4ed8-a1e7-8b9456b2f956`       |
| <img src="docs/images/pages/hr__employees__7788e5a3-3212-4ed8-a1e7-8b9456b2f956__edit.webp" width="420" alt="/hr/employees/7788e5a3-3212-4ed8-a1e7-8b9456b2f956/edit">   | `/hr/employees/7788e5a3-3212-4ed8-a1e7-8b9456b2f956/edit`  |
| <img src="docs/images/pages/hr__employees__7a3bc5f0-1a2b-438f-aa68-58b600d7a415.webp" width="420" alt="/hr/employees/7a3bc5f0-1a2b-438f-aa68-58b600d7a415">              | `/hr/employees/7a3bc5f0-1a2b-438f-aa68-58b600d7a415`       |
| <img src="docs/images/pages/hr__employees__7a3bc5f0-1a2b-438f-aa68-58b600d7a415__edit.webp" width="420" alt="/hr/employees/7a3bc5f0-1a2b-438f-aa68-58b600d7a415/edit">   | `/hr/employees/7a3bc5f0-1a2b-438f-aa68-58b600d7a415/edit`  |
| <img src="docs/images/pages/hr__employees__97ca3f02-4499-4a17-aba6-b82671bb8d03.webp" width="420" alt="/hr/employees/97ca3f02-4499-4a17-aba6-b82671bb8d03">              | `/hr/employees/97ca3f02-4499-4a17-aba6-b82671bb8d03`       |
| <img src="docs/images/pages/hr__employees__97ca3f02-4499-4a17-aba6-b82671bb8d03__edit.webp" width="420" alt="/hr/employees/97ca3f02-4499-4a17-aba6-b82671bb8d03/edit">   | `/hr/employees/97ca3f02-4499-4a17-aba6-b82671bb8d03/edit`  |
| <img src="docs/images/pages/hr__employees__9fac1ddb-dcfe-48a9-940d-da541b68addc.webp" width="420" alt="/hr/employees/9fac1ddb-dcfe-48a9-940d-da541b68addc">              | `/hr/employees/9fac1ddb-dcfe-48a9-940d-da541b68addc`       |
| <img src="docs/images/pages/hr__employees__9fac1ddb-dcfe-48a9-940d-da541b68addc__edit.webp" width="420" alt="/hr/employees/9fac1ddb-dcfe-48a9-940d-da541b68addc/edit">   | `/hr/employees/9fac1ddb-dcfe-48a9-940d-da541b68addc/edit`  |
| <img src="docs/images/pages/hr__employees__b2d4f826-f89f-4116-a3e6-12ea5f7266cb.webp" width="420" alt="/hr/employees/b2d4f826-f89f-4116-a3e6-12ea5f7266cb">              | `/hr/employees/b2d4f826-f89f-4116-a3e6-12ea5f7266cb`       |
| <img src="docs/images/pages/hr__employees__b2d4f826-f89f-4116-a3e6-12ea5f7266cb__edit.webp" width="420" alt="/hr/employees/b2d4f826-f89f-4116-a3e6-12ea5f7266cb/edit">   | `/hr/employees/b2d4f826-f89f-4116-a3e6-12ea5f7266cb/edit`  |
| <img src="docs/images/pages/hr__employees__b538786e-d0fe-4164-bc7d-9f9e8a2084c6.webp" width="420" alt="/hr/employees/b538786e-d0fe-4164-bc7d-9f9e8a2084c6">              | `/hr/employees/b538786e-d0fe-4164-bc7d-9f9e8a2084c6`       |
| <img src="docs/images/pages/hr__employees__b538786e-d0fe-4164-bc7d-9f9e8a2084c6__edit.webp" width="420" alt="/hr/employees/b538786e-d0fe-4164-bc7d-9f9e8a2084c6/edit">   | `/hr/employees/b538786e-d0fe-4164-bc7d-9f9e8a2084c6/edit`  |
| <img src="docs/images/pages/hr__employees__c4b0f0af-bd8e-4def-99ff-7971f8cd49ea.webp" width="420" alt="/hr/employees/c4b0f0af-bd8e-4def-99ff-7971f8cd49ea">              | `/hr/employees/c4b0f0af-bd8e-4def-99ff-7971f8cd49ea`       |
| <img src="docs/images/pages/hr__employees__c4b0f0af-bd8e-4def-99ff-7971f8cd49ea__edit.webp" width="420" alt="/hr/employees/c4b0f0af-bd8e-4def-99ff-7971f8cd49ea/edit">   | `/hr/employees/c4b0f0af-bd8e-4def-99ff-7971f8cd49ea/edit`  |
| <img src="docs/images/pages/hr__employees__e4311f00-699d-4d92-b8cf-c20d6fed888e.webp" width="420" alt="/hr/employees/e4311f00-699d-4d92-b8cf-c20d6fed888e">              | `/hr/employees/e4311f00-699d-4d92-b8cf-c20d6fed888e`       |
| <img src="docs/images/pages/hr__employees__e4311f00-699d-4d92-b8cf-c20d6fed888e__edit.webp" width="420" alt="/hr/employees/e4311f00-699d-4d92-b8cf-c20d6fed888e/edit">   | `/hr/employees/e4311f00-699d-4d92-b8cf-c20d6fed888e/edit`  |
| <img src="docs/images/pages/hr__employees__e5a97eb6-e07b-4562-9a85-a8370a592db4.webp" width="420" alt="/hr/employees/e5a97eb6-e07b-4562-9a85-a8370a592db4">              | `/hr/employees/e5a97eb6-e07b-4562-9a85-a8370a592db4`       |
| <img src="docs/images/pages/hr__employees__e5a97eb6-e07b-4562-9a85-a8370a592db4__edit.webp" width="420" alt="/hr/employees/e5a97eb6-e07b-4562-9a85-a8370a592db4/edit">   | `/hr/employees/e5a97eb6-e07b-4562-9a85-a8370a592db4/edit`  |
| <img src="docs/images/pages/hr__employees__ee867d91-7cc0-4699-b409-ea9b0719f91a.webp" width="420" alt="/hr/employees/ee867d91-7cc0-4699-b409-ea9b0719f91a">              | `/hr/employees/ee867d91-7cc0-4699-b409-ea9b0719f91a`       |
| <img src="docs/images/pages/hr__employees__ee867d91-7cc0-4699-b409-ea9b0719f91a__edit.webp" width="420" alt="/hr/employees/ee867d91-7cc0-4699-b409-ea9b0719f91a/edit">   | `/hr/employees/ee867d91-7cc0-4699-b409-ea9b0719f91a/edit`  |
| <img src="docs/images/pages/hr__employees__new.webp" width="420" alt="/hr/employees/new">                                                                                | `/hr/employees/new`                                        |
| <img src="docs/images/pages/hr__leaves.webp" width="420" alt="/hr/leaves">                                                                                               | `/hr/leaves`                                               |
| <img src="docs/images/pages/hr__leaves__f86d6ea5-e1e6-452d-a340-cd9d67f22542.webp" width="420" alt="/hr/leaves/f86d6ea5-e1e6-452d-a340-cd9d67f22542">                    | `/hr/leaves/f86d6ea5-e1e6-452d-a340-cd9d67f22542`          |
| <img src="docs/images/pages/hr__leaves__new.webp" width="420" alt="/hr/leaves/new">                                                                                      | `/hr/leaves/new`                                           |
| <img src="docs/images/pages/hr__payroll.webp" width="420" alt="/hr/payroll">                                                                                             | `/hr/payroll`                                              |
| <img src="docs/images/pages/hr__payroll__330ecd48-8d3d-4461-b563-576bd97ab70f.webp" width="420" alt="/hr/payroll/330ecd48-8d3d-4461-b563-576bd97ab70f">                  | `/hr/payroll/330ecd48-8d3d-4461-b563-576bd97ab70f`         |
| <img src="docs/images/pages/hr__payroll__components.webp" width="420" alt="/hr/payroll/components">                                                                      | `/hr/payroll/components`                                   |
| <img src="docs/images/pages/hr__payroll__periods.webp" width="420" alt="/hr/payroll/periods">                                                                            | `/hr/payroll/periods`                                      |
| <img src="docs/images/pages/hr__payroll__periods__330ecd48-8d3d-4461-b563-576bd97ab70f.webp" width="420" alt="/hr/payroll/periods/330ecd48-8d3d-4461-b563-576bd97ab70f"> | `/hr/payroll/periods/330ecd48-8d3d-4461-b563-576bd97ab70f` |
| <img src="docs/images/pages/hr__payroll__staff-salary.webp" width="420" alt="/hr/payroll/staff-salary">                                                                  | `/hr/payroll/staff-salary`                                 |
| <img src="docs/images/pages/hr__teachers__compliance.webp" width="420" alt="/hr/teachers/compliance">                                                                    | `/hr/teachers/compliance`                                  |

</details>

<details>
<summary><strong>Jadwal Piket</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                  | Rute                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| <img src="docs/images/pages/duty-roster.webp" width="420" alt="/duty-roster">                                                                            | `/duty-roster`                                      |
| <img src="docs/images/pages/duty-roster__42d02748-affa-4732-ab4f-32be53e8f298.webp" width="420" alt="/duty-roster/42d02748-affa-4732-ab4f-32be53e8f298"> | `/duty-roster/42d02748-affa-4732-ab4f-32be53e8f298` |
| <img src="docs/images/pages/duty-roster__6692473b-e590-4777-9a98-7962922e4399.webp" width="420" alt="/duty-roster/6692473b-e590-4777-9a98-7962922e4399"> | `/duty-roster/6692473b-e590-4777-9a98-7962922e4399` |
| <img src="docs/images/pages/duty-roster__new.webp" width="420" alt="/duty-roster/new">                                                                   | `/duty-roster/new`                                  |

</details>

<details>
<summary><strong>Dashboard Guru</strong> — 1 halaman</summary>

| Halaman                                                               | Rute       |
| --------------------------------------------------------------------- | ---------- |
| <img src="docs/images/pages/teacher.webp" width="420" alt="/teacher"> | `/teacher` |

</details>

<details>
<summary><strong>Dashboard Staff</strong> — 1 halaman</summary>

| Halaman                                                           | Rute     |
| ----------------------------------------------------------------- | -------- |
| <img src="docs/images/pages/staff.webp" width="420" alt="/staff"> | `/staff` |

</details>

<details>
<summary><strong>Payroll</strong> — 1 halaman</summary>

| Halaman                                                               | Rute       |
| --------------------------------------------------------------------- | ---------- |
| <img src="docs/images/pages/payroll.webp" width="420" alt="/payroll"> | `/payroll` |

</details>

<details>
<summary><strong>Keuangan</strong> — 37 halaman</summary>

| Halaman                                                                                                                                                                              | Rute                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| <img src="docs/images/pages/finance.webp" width="420" alt="/finance">                                                                                                                | `/finance`                                                       |
| <img src="docs/images/pages/finance__accounting.webp" width="420" alt="/finance/accounting">                                                                                         | `/finance/accounting`                                            |
| <img src="docs/images/pages/finance__accounting__coa.webp" width="420" alt="/finance/accounting/coa">                                                                                | `/finance/accounting/coa`                                        |
| <img src="docs/images/pages/finance__accounting__journals__create.webp" width="420" alt="/finance/accounting/journals/create">                                                       | `/finance/accounting/journals/create`                            |
| <img src="docs/images/pages/finance__billing.webp" width="420" alt="/finance/billing">                                                                                               | `/finance/billing`                                               |
| <img src="docs/images/pages/finance__bills__033a8f56-1f29-47a8-a7e5-db73f3784a0c.webp" width="420" alt="/finance/bills/033a8f56-1f29-47a8-a7e5-db73f3784a0c">                        | `/finance/bills/033a8f56-1f29-47a8-a7e5-db73f3784a0c`            |
| <img src="docs/images/pages/finance__bills__1d221689-d4ab-4b1e-b6d4-1ee7611c42e7.webp" width="420" alt="/finance/bills/1d221689-d4ab-4b1e-b6d4-1ee7611c42e7">                        | `/finance/bills/1d221689-d4ab-4b1e-b6d4-1ee7611c42e7`            |
| <img src="docs/images/pages/finance__bills__32b8a8b1-a42f-4980-9a92-617ef174cc03.webp" width="420" alt="/finance/bills/32b8a8b1-a42f-4980-9a92-617ef174cc03">                        | `/finance/bills/32b8a8b1-a42f-4980-9a92-617ef174cc03`            |
| <img src="docs/images/pages/finance__bills__3f8d64ae-3560-46fe-8818-52482ff5c7fa.webp" width="420" alt="/finance/bills/3f8d64ae-3560-46fe-8818-52482ff5c7fa">                        | `/finance/bills/3f8d64ae-3560-46fe-8818-52482ff5c7fa`            |
| <img src="docs/images/pages/finance__bills__43cfbee2-6eb4-4f04-a872-84f0bf87a151.webp" width="420" alt="/finance/bills/43cfbee2-6eb4-4f04-a872-84f0bf87a151">                        | `/finance/bills/43cfbee2-6eb4-4f04-a872-84f0bf87a151`            |
| <img src="docs/images/pages/finance__bills__5c8c77bb-c208-4801-ba18-34d8c82b7509.webp" width="420" alt="/finance/bills/5c8c77bb-c208-4801-ba18-34d8c82b7509">                        | `/finance/bills/5c8c77bb-c208-4801-ba18-34d8c82b7509`            |
| <img src="docs/images/pages/finance__bills__9b39303e-0c67-4c09-8c19-a38261acd8da.webp" width="420" alt="/finance/bills/9b39303e-0c67-4c09-8c19-a38261acd8da">                        | `/finance/bills/9b39303e-0c67-4c09-8c19-a38261acd8da`            |
| <img src="docs/images/pages/finance__bills__a9b07d8d-7efd-4e9a-8df9-f92dbccda43b.webp" width="420" alt="/finance/bills/a9b07d8d-7efd-4e9a-8df9-f92dbccda43b">                        | `/finance/bills/a9b07d8d-7efd-4e9a-8df9-f92dbccda43b`            |
| <img src="docs/images/pages/finance__bills__bulk.webp" width="420" alt="/finance/bills/bulk">                                                                                        | `/finance/bills/bulk`                                            |
| <img src="docs/images/pages/finance__bills__daded72d-e784-4eef-9b61-e5f1edd7a790.webp" width="420" alt="/finance/bills/daded72d-e784-4eef-9b61-e5f1edd7a790">                        | `/finance/bills/daded72d-e784-4eef-9b61-e5f1edd7a790`            |
| <img src="docs/images/pages/finance__bills__new.webp" width="420" alt="/finance/bills/new">                                                                                          | `/finance/bills/new`                                             |
| <img src="docs/images/pages/finance__bos.webp" width="420" alt="/finance/bos">                                                                                                       | `/finance/bos`                                                   |
| <img src="docs/images/pages/finance__budgeting.webp" width="420" alt="/finance/budgeting">                                                                                           | `/finance/budgeting`                                             |
| <img src="docs/images/pages/finance__payment-components.webp" width="420" alt="/finance/payment-components">                                                                         | `/finance/payment-components`                                    |
| <img src="docs/images/pages/finance__payments.webp" width="420" alt="/finance/payments">                                                                                             | `/finance/payments`                                              |
| <img src="docs/images/pages/finance__payments__13ef2888-639f-4e47-bbc3-3c89b2627151__receipt.webp" width="420" alt="/finance/payments/13ef2888-639f-4e47-bbc3-3c89b2627151/receipt"> | `/finance/payments/13ef2888-639f-4e47-bbc3-3c89b2627151/receipt` |
| <img src="docs/images/pages/finance__payments__48014ff0-57dc-4213-a691-0476c699e1f2__receipt.webp" width="420" alt="/finance/payments/48014ff0-57dc-4213-a691-0476c699e1f2/receipt"> | `/finance/payments/48014ff0-57dc-4213-a691-0476c699e1f2/receipt` |
| <img src="docs/images/pages/finance__payments__670162bf-86e7-479b-94e8-4a51d421a7c2__receipt.webp" width="420" alt="/finance/payments/670162bf-86e7-479b-94e8-4a51d421a7c2/receipt"> | `/finance/payments/670162bf-86e7-479b-94e8-4a51d421a7c2/receipt` |
| <img src="docs/images/pages/finance__payments__d9f08e80-cd15-47a9-99ae-e6ebb9c5b8ed__receipt.webp" width="420" alt="/finance/payments/d9f08e80-cd15-47a9-99ae-e6ebb9c5b8ed/receipt"> | `/finance/payments/d9f08e80-cd15-47a9-99ae-e6ebb9c5b8ed/receipt` |
| <img src="docs/images/pages/finance__payments__effb22b0-05fc-497d-814f-d2d3de668b29__receipt.webp" width="420" alt="/finance/payments/effb22b0-05fc-497d-814f-d2d3de668b29/receipt"> | `/finance/payments/effb22b0-05fc-497d-814f-d2d3de668b29/receipt` |
| <img src="docs/images/pages/finance__payments__f2946d96-e43a-4753-8d5a-e740f38c33e3__receipt.webp" width="420" alt="/finance/payments/f2946d96-e43a-4753-8d5a-e740f38c33e3/receipt"> | `/finance/payments/f2946d96-e43a-4753-8d5a-e740f38c33e3/receipt` |
| <img src="docs/images/pages/finance__reports.webp" width="420" alt="/finance/reports">                                                                                               | `/finance/reports`                                               |
| <img src="docs/images/pages/finance__reports__balance-sheet.webp" width="420" alt="/finance/reports/balance-sheet">                                                                  | `/finance/reports/balance-sheet`                                 |
| <img src="docs/images/pages/finance__reports__cash-flow.webp" width="420" alt="/finance/reports/cash-flow">                                                                          | `/finance/reports/cash-flow`                                     |
| <img src="docs/images/pages/finance__reports__cash-flow-forecast.webp" width="420" alt="/finance/reports/cash-flow-forecast">                                                        | `/finance/reports/cash-flow-forecast`                            |
| <img src="docs/images/pages/finance__reports__general-ledger.webp" width="420" alt="/finance/reports/general-ledger">                                                                | `/finance/reports/general-ledger`                                |
| <img src="docs/images/pages/finance__reports__income-statement.webp" width="420" alt="/finance/reports/income-statement">                                                            | `/finance/reports/income-statement`                              |
| <img src="docs/images/pages/finance__reports__trial-balance.webp" width="420" alt="/finance/reports/trial-balance">                                                                  | `/finance/reports/trial-balance`                                 |
| <img src="docs/images/pages/finance__scholarships.webp" width="420" alt="/finance/scholarships">                                                                                     | `/finance/scholarships`                                          |
| <img src="docs/images/pages/finance__spp-matrix.webp" width="420" alt="/finance/spp-matrix">                                                                                         | `/finance/spp-matrix`                                            |
| <img src="docs/images/pages/finance__verification.webp" width="420" alt="/finance/verification">                                                                                     | `/finance/verification`                                          |
| <img src="docs/images/pages/finance__wallet.webp" width="420" alt="/finance/wallet">                                                                                                 | `/finance/wallet`                                                |

</details>

<details>
<summary><strong>Pengadaan</strong> — 9 halaman</summary>

| Halaman                                                                                                                                                                       | Rute                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| <img src="docs/images/pages/procurement.webp" width="420" alt="/procurement">                                                                                                 | `/procurement`                                                |
| <img src="docs/images/pages/procurement__235c140d-1fde-4d87-b6ce-d794e67f4848.webp" width="420" alt="/procurement/235c140d-1fde-4d87-b6ce-d794e67f4848">                      | `/procurement/235c140d-1fde-4d87-b6ce-d794e67f4848`           |
| <img src="docs/images/pages/procurement__7a282fee-bcdf-4210-9dcf-c5d62221643a.webp" width="420" alt="/procurement/7a282fee-bcdf-4210-9dcf-c5d62221643a">                      | `/procurement/7a282fee-bcdf-4210-9dcf-c5d62221643a`           |
| <img src="docs/images/pages/procurement__create.webp" width="420" alt="/procurement/create">                                                                                  | `/procurement/create`                                         |
| <img src="docs/images/pages/procurement__suppliers.webp" width="420" alt="/procurement/suppliers">                                                                            | `/procurement/suppliers`                                      |
| <img src="docs/images/pages/procurement__suppliers__0c6d8a46-a79d-4d42-97d5-fb429ba91659.webp" width="420" alt="/procurement/suppliers/0c6d8a46-a79d-4d42-97d5-fb429ba91659"> | `/procurement/suppliers/0c6d8a46-a79d-4d42-97d5-fb429ba91659` |
| <img src="docs/images/pages/procurement__suppliers__7a282fee-bcdf-4210-9dcf-c5d62221643a.webp" width="420" alt="/procurement/suppliers/7a282fee-bcdf-4210-9dcf-c5d62221643a"> | `/procurement/suppliers/7a282fee-bcdf-4210-9dcf-c5d62221643a` |
| <img src="docs/images/pages/procurement__suppliers__create.webp" width="420" alt="/procurement/suppliers/create">                                                             | `/procurement/suppliers/create`                               |
| <img src="docs/images/pages/procurement__suppliers__f235ccea-2de5-49c4-a073-794f19483c0a.webp" width="420" alt="/procurement/suppliers/f235ccea-2de5-49c4-a073-794f19483c0a"> | `/procurement/suppliers/f235ccea-2de5-49c4-a073-794f19483c0a` |

</details>

<details>
<summary><strong>Yayasan</strong> — 9 halaman</summary>

| Halaman                                                                                                                                                                                | Rute                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| <img src="docs/images/pages/foundation.webp" width="420" alt="/foundation">                                                                                                            | `/foundation`                                                     |
| <img src="docs/images/pages/foundation__accreditation.webp" width="420" alt="/foundation/accreditation">                                                                               | `/foundation/accreditation`                                       |
| <img src="docs/images/pages/foundation__accreditation__readiness.webp" width="420" alt="/foundation/accreditation/readiness">                                                          | `/foundation/accreditation/readiness`                             |
| <img src="docs/images/pages/foundation__board__b8e55827-6cc9-43c2-a8d4-cf2ae0a5242e__edit.webp" width="420" alt="/foundation/board/b8e55827-6cc9-43c2-a8d4-cf2ae0a5242e/edit">         | `/foundation/board/b8e55827-6cc9-43c2-a8d4-cf2ae0a5242e/edit`     |
| <img src="docs/images/pages/foundation__board__new.webp" width="420" alt="/foundation/board/new">                                                                                      | `/foundation/board/new`                                           |
| <img src="docs/images/pages/foundation__dashboard.webp" width="420" alt="/foundation/dashboard">                                                                                       | `/foundation/dashboard`                                           |
| <img src="docs/images/pages/foundation__documents__c0d1684a-8a17-432d-a211-2ea8359a2d3e__edit.webp" width="420" alt="/foundation/documents/c0d1684a-8a17-432d-a211-2ea8359a2d3e/edit"> | `/foundation/documents/c0d1684a-8a17-432d-a211-2ea8359a2d3e/edit` |
| <img src="docs/images/pages/foundation__documents__new.webp" width="420" alt="/foundation/documents/new">                                                                              | `/foundation/documents/new`                                       |
| <img src="docs/images/pages/foundation__finance__consolidation.webp" width="420" alt="/foundation/finance/consolidation">                                                              | `/foundation/finance/consolidation`                               |

</details>

<details>
<summary><strong>Unit Pendidikan</strong> — 12 halaman</summary>

| Halaman                                                                                                                                                 | Rute                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| <img src="docs/images/pages/units.webp" width="420" alt="/units">                                                                                       | `/units`                                           |
| <img src="docs/images/pages/units__1904917e-8a82-4313-9799-c9a73d3445b7.webp" width="420" alt="/units/1904917e-8a82-4313-9799-c9a73d3445b7">            | `/units/1904917e-8a82-4313-9799-c9a73d3445b7`      |
| <img src="docs/images/pages/units__1904917e-8a82-4313-9799-c9a73d3445b7__edit.webp" width="420" alt="/units/1904917e-8a82-4313-9799-c9a73d3445b7/edit"> | `/units/1904917e-8a82-4313-9799-c9a73d3445b7/edit` |
| <img src="docs/images/pages/units__833c0b90-a834-4f61-bf6b-280ba0b1c496.webp" width="420" alt="/units/833c0b90-a834-4f61-bf6b-280ba0b1c496">            | `/units/833c0b90-a834-4f61-bf6b-280ba0b1c496`      |
| <img src="docs/images/pages/units__833c0b90-a834-4f61-bf6b-280ba0b1c496__edit.webp" width="420" alt="/units/833c0b90-a834-4f61-bf6b-280ba0b1c496/edit"> | `/units/833c0b90-a834-4f61-bf6b-280ba0b1c496/edit` |
| <img src="docs/images/pages/units__8facb25a-209a-4ae3-932b-d9c723751444.webp" width="420" alt="/units/8facb25a-209a-4ae3-932b-d9c723751444">            | `/units/8facb25a-209a-4ae3-932b-d9c723751444`      |
| <img src="docs/images/pages/units__8facb25a-209a-4ae3-932b-d9c723751444__edit.webp" width="420" alt="/units/8facb25a-209a-4ae3-932b-d9c723751444/edit"> | `/units/8facb25a-209a-4ae3-932b-d9c723751444/edit` |
| <img src="docs/images/pages/units__a91eba8f-57f9-4208-9d6e-b48b8b68328f.webp" width="420" alt="/units/a91eba8f-57f9-4208-9d6e-b48b8b68328f">            | `/units/a91eba8f-57f9-4208-9d6e-b48b8b68328f`      |
| <img src="docs/images/pages/units__a91eba8f-57f9-4208-9d6e-b48b8b68328f__edit.webp" width="420" alt="/units/a91eba8f-57f9-4208-9d6e-b48b8b68328f/edit"> | `/units/a91eba8f-57f9-4208-9d6e-b48b8b68328f/edit` |
| <img src="docs/images/pages/units__d711970b-5945-468b-b923-a32b09cb2ca4.webp" width="420" alt="/units/d711970b-5945-468b-b923-a32b09cb2ca4">            | `/units/d711970b-5945-468b-b923-a32b09cb2ca4`      |
| <img src="docs/images/pages/units__d711970b-5945-468b-b923-a32b09cb2ca4__edit.webp" width="420" alt="/units/d711970b-5945-468b-b923-a32b09cb2ca4/edit"> | `/units/d711970b-5945-468b-b923-a32b09cb2ca4/edit` |
| <img src="docs/images/pages/units__new.webp" width="420" alt="/units/new">                                                                              | `/units/new`                                       |

</details>

<details>
<summary><strong>Perencanaan</strong> — 5 halaman</summary>

| Halaman                                                                                                                                                  | Rute                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| <img src="docs/images/pages/perencanaan.webp" width="420" alt="/perencanaan">                                                                            | `/perencanaan`                                      |
| <img src="docs/images/pages/perencanaan__2fb6fa9d-ea2c-41b8-a060-394058015cf7.webp" width="420" alt="/perencanaan/2fb6fa9d-ea2c-41b8-a060-394058015cf7"> | `/perencanaan/2fb6fa9d-ea2c-41b8-a060-394058015cf7` |
| <img src="docs/images/pages/perencanaan__6f344871-305c-412c-9859-f333942373b2.webp" width="420" alt="/perencanaan/6f344871-305c-412c-9859-f333942373b2"> | `/perencanaan/6f344871-305c-412c-9859-f333942373b2` |
| <img src="docs/images/pages/perencanaan__7f271d0e-c267-4c12-b96f-8caf3959bc5c.webp" width="420" alt="/perencanaan/7f271d0e-c267-4c12-b96f-8caf3959bc5c"> | `/perencanaan/7f271d0e-c267-4c12-b96f-8caf3959bc5c` |
| <img src="docs/images/pages/perencanaan__strategy-map.webp" width="420" alt="/perencanaan/strategy-map">                                                 | `/perencanaan/strategy-map`                         |

</details>

<details>
<summary><strong>Kinerja</strong> — 4 halaman</summary>

| Halaman                                                                                    | Rute                 |
| ------------------------------------------------------------------------------------------ | -------------------- |
| <img src="docs/images/pages/kinerja.webp" width="420" alt="/kinerja">                      | `/kinerja`           |
| <img src="docs/images/pages/kinerja__analytics.webp" width="420" alt="/kinerja/analytics"> | `/kinerja/analytics` |
| <img src="docs/images/pages/kinerja__evaluasi.webp" width="420" alt="/kinerja/evaluasi">   | `/kinerja/evaluasi`  |
| <img src="docs/images/pages/kinerja__pk.webp" width="420" alt="/kinerja/pk">               | `/kinerja/pk`        |

</details>

<details>
<summary><strong>Penjaminan Mutu (SPMI)</strong> — 8 halaman</summary>

| Halaman                                                                                                                                                                                                                                                                    | Rute                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <img src="docs/images/pages/quality.webp" width="420" alt="/quality">                                                                                                                                                                                                      | `/quality`                                                                                                                                             |
| <img src="docs/images/pages/quality__audits.webp" width="420" alt="/quality/audits">                                                                                                                                                                                       | `/quality/audits`                                                                                                                                      |
| <img src="docs/images/pages/quality__audits__68b96fb5-44e5-41fa-a036-f4f2a0b9b150__q83e9f43e.webp" width="420" alt="/quality/audits/68b96fb5-44e5-41fa-a036-f4f2a0b9b150?unitId=a91eba8f-57f9-4208-9d6e-b48b8b68328f&academicYearId=1c26ab5d-3bac-44fa-812e-00e02d0306da"> | `/quality/audits/68b96fb5-44e5-41fa-a036-f4f2a0b9b150?unitId=a91eba8f-57f9-4208-9d6e-b48b8b68328f&academicYearId=1c26ab5d-3bac-44fa-812e-00e02d0306da` |
| <img src="docs/images/pages/quality__b76cd2ba-c74c-4110-abf4-9ab3536aa26e.webp" width="420" alt="/quality/b76cd2ba-c74c-4110-abf4-9ab3536aa26e">                                                                                                                           | `/quality/b76cd2ba-c74c-4110-abf4-9ab3536aa26e`                                                                                                        |
| <img src="docs/images/pages/quality__complaints.webp" width="420" alt="/quality/complaints">                                                                                                                                                                               | `/quality/complaints`                                                                                                                                  |
| <img src="docs/images/pages/quality__complaints__29d0f1b5-b5ac-4540-98a6-8f43a8baf917.webp" width="420" alt="/quality/complaints/29d0f1b5-b5ac-4540-98a6-8f43a8baf917">                                                                                                    | `/quality/complaints/29d0f1b5-b5ac-4540-98a6-8f43a8baf917`                                                                                             |
| <img src="docs/images/pages/quality__complaints__3a6f03f1-833f-44d0-b488-34a47adce824.webp" width="420" alt="/quality/complaints/3a6f03f1-833f-44d0-b488-34a47adce824">                                                                                                    | `/quality/complaints/3a6f03f1-833f-44d0-b488-34a47adce824`                                                                                             |
| <img src="docs/images/pages/quality__complaints__create.webp" width="420" alt="/quality/complaints/create">                                                                                                                                                                | `/quality/complaints/create`                                                                                                                           |

</details>

<details>
<summary><strong>Manajemen Risiko</strong> — 3 halaman</summary>

| Halaman                                                                                                                                                                                                                 | Rute                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| <img src="docs/images/pages/risk-management.webp" width="420" alt="/risk-management">                                                                                                                                   | `/risk-management`                                                                                  |
| <img src="docs/images/pages/risk-management__b5497bb3-797c-45f9-a6a4-35f05e432063__q1c683e1a.webp" width="420" alt="/risk-management/b5497bb3-797c-45f9-a6a4-35f05e432063?unitId=a91eba8f-57f9-4208-9d6e-b48b8b68328f"> | `/risk-management/b5497bb3-797c-45f9-a6a4-35f05e432063?unitId=a91eba8f-57f9-4208-9d6e-b48b8b68328f` |
| <img src="docs/images/pages/risk-management__create.webp" width="420" alt="/risk-management/create">                                                                                                                    | `/risk-management/create`                                                                           |

</details>

<details>
<summary><strong>Penelitian & Pengembangan</strong> — 1 halaman</summary>

| Halaman                                                                 | Rute        |
| ----------------------------------------------------------------------- | ----------- |
| <img src="docs/images/pages/research.webp" width="420" alt="/research"> | `/research` |

</details>

<details>
<summary><strong>GRC Dashboard</strong> — 1 halaman</summary>

| Halaman                                                                           | Rute             |
| --------------------------------------------------------------------------------- | ---------------- |
| <img src="docs/images/pages/grc-dashboard.webp" width="420" alt="/grc-dashboard"> | `/grc-dashboard` |

</details>

<details>
<summary><strong>Analitik</strong> — 8 halaman</summary>

| Halaman                                                                                                        | Rute                           |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| <img src="docs/images/pages/analytics.webp" width="420" alt="/analytics">                                      | `/analytics`                   |
| <img src="docs/images/pages/analytics__academic.webp" width="420" alt="/analytics/academic">                   | `/analytics/academic`          |
| <img src="docs/images/pages/analytics__benchmark.webp" width="420" alt="/analytics/benchmark">                 | `/analytics/benchmark`         |
| <img src="docs/images/pages/analytics__education.webp" width="420" alt="/analytics/education">                 | `/analytics/education`         |
| <img src="docs/images/pages/analytics__export.webp" width="420" alt="/analytics/export">                       | `/analytics/export`            |
| <img src="docs/images/pages/analytics__forecast.webp" width="420" alt="/analytics/forecast">                   | `/analytics/forecast`          |
| <img src="docs/images/pages/analytics__grc.webp" width="420" alt="/analytics/grc">                             | `/analytics/grc`               |
| <img src="docs/images/pages/analytics__parent-engagement.webp" width="420" alt="/analytics/parent-engagement"> | `/analytics/parent-engagement` |

</details>

<details>
<summary><strong>Laporan</strong> — 2 halaman</summary>

| Halaman                                                                                | Rute               |
| -------------------------------------------------------------------------------------- | ------------------ |
| <img src="docs/images/pages/reports.webp" width="420" alt="/reports">                  | `/reports`         |
| <img src="docs/images/pages/reports__builder.webp" width="420" alt="/reports/builder"> | `/reports/builder` |

</details>

<details>
<summary><strong>Marketing</strong> — 9 halaman</summary>

| Halaman                                                                                                                                                           | Rute                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| <img src="docs/images/pages/marketing.webp" width="420" alt="/marketing">                                                                                         | `/marketing`                                            |
| <img src="docs/images/pages/marketing__campaigns.webp" width="420" alt="/marketing/campaigns">                                                                    | `/marketing/campaigns`                                  |
| <img src="docs/images/pages/marketing__leads.webp" width="420" alt="/marketing/leads">                                                                            | `/marketing/leads`                                      |
| <img src="docs/images/pages/marketing__leads__2060f91c-2932-43d0-9e38-c0fc37c56d47.webp" width="420" alt="/marketing/leads/2060f91c-2932-43d0-9e38-c0fc37c56d47"> | `/marketing/leads/2060f91c-2932-43d0-9e38-c0fc37c56d47` |
| <img src="docs/images/pages/marketing__leads__317111de-4552-43ef-a8fd-ea8776c52dd6.webp" width="420" alt="/marketing/leads/317111de-4552-43ef-a8fd-ea8776c52dd6"> | `/marketing/leads/317111de-4552-43ef-a8fd-ea8776c52dd6` |
| <img src="docs/images/pages/marketing__leads__3d501a3c-f9f0-4eb4-b3b9-a3f383c7473e.webp" width="420" alt="/marketing/leads/3d501a3c-f9f0-4eb4-b3b9-a3f383c7473e"> | `/marketing/leads/3d501a3c-f9f0-4eb4-b3b9-a3f383c7473e` |
| <img src="docs/images/pages/marketing__leads__54a911a8-97d7-4762-9d21-22da066c307a.webp" width="420" alt="/marketing/leads/54a911a8-97d7-4762-9d21-22da066c307a"> | `/marketing/leads/54a911a8-97d7-4762-9d21-22da066c307a` |
| <img src="docs/images/pages/marketing__leads__76b4aa5f-bb62-44d2-85e6-b505e2942a37.webp" width="420" alt="/marketing/leads/76b4aa5f-bb62-44d2-85e6-b505e2942a37"> | `/marketing/leads/76b4aa5f-bb62-44d2-85e6-b505e2942a37` |
| <img src="docs/images/pages/marketing__leads__f24c5764-6d41-4536-ba02-5f78867d717b.webp" width="420" alt="/marketing/leads/f24c5764-6d41-4536-ba02-5f78867d717b"> | `/marketing/leads/f24c5764-6d41-4536-ba02-5f78867d717b` |

</details>

<details>
<summary><strong>SPMB / PPDB</strong> — 8 halaman</summary>

| Halaman                                                                                                                                                                 | Rute                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| <img src="docs/images/pages/spmb.webp" width="420" alt="/spmb">                                                                                                         | `/spmb`                                                    |
| <img src="docs/images/pages/spmb__registrations.webp" width="420" alt="/spmb/registrations">                                                                            | `/spmb/registrations`                                      |
| <img src="docs/images/pages/spmb__registrations__2060f91c-2932-43d0-9e38-c0fc37c56d47.webp" width="420" alt="/spmb/registrations/2060f91c-2932-43d0-9e38-c0fc37c56d47"> | `/spmb/registrations/2060f91c-2932-43d0-9e38-c0fc37c56d47` |
| <img src="docs/images/pages/spmb__registrations__317111de-4552-43ef-a8fd-ea8776c52dd6.webp" width="420" alt="/spmb/registrations/317111de-4552-43ef-a8fd-ea8776c52dd6"> | `/spmb/registrations/317111de-4552-43ef-a8fd-ea8776c52dd6` |
| <img src="docs/images/pages/spmb__registrations__3d501a3c-f9f0-4eb4-b3b9-a3f383c7473e.webp" width="420" alt="/spmb/registrations/3d501a3c-f9f0-4eb4-b3b9-a3f383c7473e"> | `/spmb/registrations/3d501a3c-f9f0-4eb4-b3b9-a3f383c7473e` |
| <img src="docs/images/pages/spmb__registrations__54a911a8-97d7-4762-9d21-22da066c307a.webp" width="420" alt="/spmb/registrations/54a911a8-97d7-4762-9d21-22da066c307a"> | `/spmb/registrations/54a911a8-97d7-4762-9d21-22da066c307a` |
| <img src="docs/images/pages/spmb__registrations__76b4aa5f-bb62-44d2-85e6-b505e2942a37.webp" width="420" alt="/spmb/registrations/76b4aa5f-bb62-44d2-85e6-b505e2942a37"> | `/spmb/registrations/76b4aa5f-bb62-44d2-85e6-b505e2942a37` |
| <img src="docs/images/pages/spmb__registrations__f24c5764-6d41-4536-ba02-5f78867d717b.webp" width="420" alt="/spmb/registrations/f24c5764-6d41-4536-ba02-5f78867d717b"> | `/spmb/registrations/f24c5764-6d41-4536-ba02-5f78867d717b` |

</details>

<details>
<summary><strong>Admisi</strong> — 3 halaman</summary>

| Halaman                                                                                          | Rute                    |
| ------------------------------------------------------------------------------------------------ | ----------------------- |
| <img src="docs/images/pages/admissions.webp" width="420" alt="/admissions">                      | `/admissions`           |
| <img src="docs/images/pages/admissions__analytics.webp" width="420" alt="/admissions/analytics"> | `/admissions/analytics` |
| <img src="docs/images/pages/admissions__waves.webp" width="420" alt="/admissions/waves">         | `/admissions/waves`     |

</details>

<details>
<summary><strong>Donasi & Wakaf</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                                 | Rute                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| <img src="docs/images/pages/donation.webp" width="420" alt="/donation">                                                                                                 | `/donation`                                                |
| <img src="docs/images/pages/donation__campaigns__d48c478a-dd17-4c79-bf80-7f95e1d11eb6.webp" width="420" alt="/donation/campaigns/d48c478a-dd17-4c79-bf80-7f95e1d11eb6"> | `/donation/campaigns/d48c478a-dd17-4c79-bf80-7f95e1d11eb6` |
| <img src="docs/images/pages/donation__campaigns__new.webp" width="420" alt="/donation/campaigns/new">                                                                   | `/donation/campaigns/new`                                  |
| <img src="docs/images/pages/donation__new.webp" width="420" alt="/donation/new">                                                                                        | `/donation/new`                                            |

</details>

<details>
<summary><strong>Alumni</strong> — 20 halaman</summary>

| Halaman                                                                                                                                                   | Rute                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| <img src="docs/images/pages/alumni.webp" width="420" alt="/alumni">                                                                                       | `/alumni`                                           |
| <img src="docs/images/pages/alumni__4843c94e-5d78-4eef-8b5d-df0264d7a580.webp" width="420" alt="/alumni/4843c94e-5d78-4eef-8b5d-df0264d7a580">            | `/alumni/4843c94e-5d78-4eef-8b5d-df0264d7a580`      |
| <img src="docs/images/pages/alumni__4843c94e-5d78-4eef-8b5d-df0264d7a580__edit.webp" width="420" alt="/alumni/4843c94e-5d78-4eef-8b5d-df0264d7a580/edit"> | `/alumni/4843c94e-5d78-4eef-8b5d-df0264d7a580/edit` |
| <img src="docs/images/pages/alumni__6c0c1536-567a-4ff5-aa5f-a2d4ee81a304.webp" width="420" alt="/alumni/6c0c1536-567a-4ff5-aa5f-a2d4ee81a304">            | `/alumni/6c0c1536-567a-4ff5-aa5f-a2d4ee81a304`      |
| <img src="docs/images/pages/alumni__6c0c1536-567a-4ff5-aa5f-a2d4ee81a304__edit.webp" width="420" alt="/alumni/6c0c1536-567a-4ff5-aa5f-a2d4ee81a304/edit"> | `/alumni/6c0c1536-567a-4ff5-aa5f-a2d4ee81a304/edit` |
| <img src="docs/images/pages/alumni__73a77729-fffa-4b07-8517-ab040a4c561e.webp" width="420" alt="/alumni/73a77729-fffa-4b07-8517-ab040a4c561e">            | `/alumni/73a77729-fffa-4b07-8517-ab040a4c561e`      |
| <img src="docs/images/pages/alumni__73a77729-fffa-4b07-8517-ab040a4c561e__edit.webp" width="420" alt="/alumni/73a77729-fffa-4b07-8517-ab040a4c561e/edit"> | `/alumni/73a77729-fffa-4b07-8517-ab040a4c561e/edit` |
| <img src="docs/images/pages/alumni__778ad3cf-35e9-4701-94bf-ef52d9789d3e.webp" width="420" alt="/alumni/778ad3cf-35e9-4701-94bf-ef52d9789d3e">            | `/alumni/778ad3cf-35e9-4701-94bf-ef52d9789d3e`      |
| <img src="docs/images/pages/alumni__778ad3cf-35e9-4701-94bf-ef52d9789d3e__edit.webp" width="420" alt="/alumni/778ad3cf-35e9-4701-94bf-ef52d9789d3e/edit"> | `/alumni/778ad3cf-35e9-4701-94bf-ef52d9789d3e/edit` |
| <img src="docs/images/pages/alumni__80b71082-79ae-44cd-bbb4-f4276148bcee.webp" width="420" alt="/alumni/80b71082-79ae-44cd-bbb4-f4276148bcee">            | `/alumni/80b71082-79ae-44cd-bbb4-f4276148bcee`      |
| <img src="docs/images/pages/alumni__80b71082-79ae-44cd-bbb4-f4276148bcee__edit.webp" width="420" alt="/alumni/80b71082-79ae-44cd-bbb4-f4276148bcee/edit"> | `/alumni/80b71082-79ae-44cd-bbb4-f4276148bcee/edit` |
| <img src="docs/images/pages/alumni__a169e200-3bd6-4314-88eb-561dcabe9908.webp" width="420" alt="/alumni/a169e200-3bd6-4314-88eb-561dcabe9908">            | `/alumni/a169e200-3bd6-4314-88eb-561dcabe9908`      |
| <img src="docs/images/pages/alumni__a169e200-3bd6-4314-88eb-561dcabe9908__edit.webp" width="420" alt="/alumni/a169e200-3bd6-4314-88eb-561dcabe9908/edit"> | `/alumni/a169e200-3bd6-4314-88eb-561dcabe9908/edit` |
| <img src="docs/images/pages/alumni__a3b10ebf-c153-4320-8114-1e21ad034c6e.webp" width="420" alt="/alumni/a3b10ebf-c153-4320-8114-1e21ad034c6e">            | `/alumni/a3b10ebf-c153-4320-8114-1e21ad034c6e`      |
| <img src="docs/images/pages/alumni__a3b10ebf-c153-4320-8114-1e21ad034c6e__edit.webp" width="420" alt="/alumni/a3b10ebf-c153-4320-8114-1e21ad034c6e/edit"> | `/alumni/a3b10ebf-c153-4320-8114-1e21ad034c6e/edit` |
| <img src="docs/images/pages/alumni__d59879f2-a46b-4fea-95f3-d627c06b01d8.webp" width="420" alt="/alumni/d59879f2-a46b-4fea-95f3-d627c06b01d8">            | `/alumni/d59879f2-a46b-4fea-95f3-d627c06b01d8`      |
| <img src="docs/images/pages/alumni__d59879f2-a46b-4fea-95f3-d627c06b01d8__edit.webp" width="420" alt="/alumni/d59879f2-a46b-4fea-95f3-d627c06b01d8/edit"> | `/alumni/d59879f2-a46b-4fea-95f3-d627c06b01d8/edit` |
| <img src="docs/images/pages/alumni__new.webp" width="420" alt="/alumni/new">                                                                              | `/alumni/new`                                       |
| <img src="docs/images/pages/alumni__placement.webp" width="420" alt="/alumni/placement">                                                                  | `/alumni/placement`                                 |
| <img src="docs/images/pages/alumni__sanad.webp" width="420" alt="/alumni/sanad">                                                                          | `/alumni/sanad`                                     |

</details>

<details>
<summary><strong>Organisasi Siswa</strong> — 1 halaman</summary>

| Halaman                                                                       | Rute           |
| ----------------------------------------------------------------------------- | -------------- |
| <img src="docs/images/pages/student-org.webp" width="420" alt="/student-org"> | `/student-org` |

</details>

<details>
<summary><strong>Portal Wali Santri</strong> — 17 halaman</summary>

| Halaman                                                                                                                                                                   | Rute                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <img src="docs/images/pages/parent.webp" width="420" alt="/parent">                                                                                                       | `/parent`                                                   |
| <img src="docs/images/pages/parent__announcements.webp" width="420" alt="/parent/announcements">                                                                          | `/parent/announcements`                                     |
| <img src="docs/images/pages/parent__buku-penghubung.webp" width="420" alt="/parent/buku-penghubung">                                                                      | `/parent/buku-penghubung`                                   |
| <img src="docs/images/pages/parent__children.webp" width="420" alt="/parent/children">                                                                                    | `/parent/children`                                          |
| <img src="docs/images/pages/parent__counseling.webp" width="420" alt="/parent/counseling">                                                                                | `/parent/counseling`                                        |
| <img src="docs/images/pages/parent__daily-report.webp" width="420" alt="/parent/daily-report">                                                                            | `/parent/daily-report`                                      |
| <img src="docs/images/pages/parent__finance.webp" width="420" alt="/parent/finance">                                                                                      | `/parent/finance`                                           |
| <img src="docs/images/pages/parent__health.webp" width="420" alt="/parent/health">                                                                                        | `/parent/health`                                            |
| <img src="docs/images/pages/parent__ibadah.webp" width="420" alt="/parent/ibadah">                                                                                        | `/parent/ibadah`                                            |
| <img src="docs/images/pages/parent__ibadah__3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd.webp" width="420" alt="/parent/ibadah/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd">             | `/parent/ibadah/3a4a3ce5-ccbf-4a92-91c5-e6f78f9196fd`       |
| <img src="docs/images/pages/parent__messages.webp" width="420" alt="/parent/messages">                                                                                    | `/parent/messages`                                          |
| <img src="docs/images/pages/parent__notifications__preferences.webp" width="420" alt="/parent/notifications/preferences">                                                 | `/parent/notifications/preferences`                         |
| <img src="docs/images/pages/parent__permits.webp" width="420" alt="/parent/permits">                                                                                      | `/parent/permits`                                           |
| <img src="docs/images/pages/parent__report-cards.webp" width="420" alt="/parent/report-cards">                                                                            | `/parent/report-cards`                                      |
| <img src="docs/images/pages/parent__report-cards__98c5be11-0f6e-4b89-b152-ff39872e8974.webp" width="420" alt="/parent/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974"> | `/parent/report-cards/98c5be11-0f6e-4b89-b152-ff39872e8974` |
| <img src="docs/images/pages/parent__rewards.webp" width="420" alt="/parent/rewards">                                                                                      | `/parent/rewards`                                           |
| <img src="docs/images/pages/parent__violations.webp" width="420" alt="/parent/violations">                                                                                | `/parent/violations`                                        |

</details>

<details>
<summary><strong>Manajemen User</strong> — 5 halaman</summary>

| Halaman                                                                                                                                                   | Rute                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| <img src="docs/images/pages/users.webp" width="420" alt="/users">                                                                                         | `/users`                                            |
| <img src="docs/images/pages/users__320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e.webp" width="420" alt="/users/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e">              | `/users/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e`       |
| <img src="docs/images/pages/users__320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e__edit.webp" width="420" alt="/users/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e/edit">   | `/users/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e/edit`  |
| <img src="docs/images/pages/users__320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e__roles.webp" width="420" alt="/users/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e/roles"> | `/users/320fb4e6-4c1f-4cc1-9f31-4219d3c5e14e/roles` |
| <img src="docs/images/pages/users__new.webp" width="420" alt="/users/new">                                                                                | `/users/new`                                        |

</details>

<details>
<summary><strong>Pengaturan</strong> — 81 halaman</summary>

| Halaman                                                                                                                                                         | Rute                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| <img src="docs/images/pages/settings.webp" width="420" alt="/settings">                                                                                         | `/settings`                                            |
| <img src="docs/images/pages/settings__chatbot.webp" width="420" alt="/settings/chatbot">                                                                        | `/settings/chatbot`                                    |
| <img src="docs/images/pages/settings__chatbot__percakapan.webp" width="420" alt="/settings/chatbot/percakapan">                                                 | `/settings/chatbot/percakapan`                         |
| <img src="docs/images/pages/settings__esign.webp" width="420" alt="/settings/esign">                                                                            | `/settings/esign`                                      |
| <img src="docs/images/pages/settings__roles.webp" width="420" alt="/settings/roles">                                                                            | `/settings/roles`                                      |
| <img src="docs/images/pages/settings__roles__049ca777-88b7-4afe-b559-a9b1af81f73c.webp" width="420" alt="/settings/roles/049ca777-88b7-4afe-b559-a9b1af81f73c"> | `/settings/roles/049ca777-88b7-4afe-b559-a9b1af81f73c` |
| <img src="docs/images/pages/settings__roles__090cc031-7985-4961-bd76-d7c96302615f.webp" width="420" alt="/settings/roles/090cc031-7985-4961-bd76-d7c96302615f"> | `/settings/roles/090cc031-7985-4961-bd76-d7c96302615f` |
| <img src="docs/images/pages/settings__roles__0e06fdf0-4f06-463d-840e-ce292d198e61.webp" width="420" alt="/settings/roles/0e06fdf0-4f06-463d-840e-ce292d198e61"> | `/settings/roles/0e06fdf0-4f06-463d-840e-ce292d198e61` |
| <img src="docs/images/pages/settings__roles__11218893-b976-4f76-8cc9-b37ea15ed6a2.webp" width="420" alt="/settings/roles/11218893-b976-4f76-8cc9-b37ea15ed6a2"> | `/settings/roles/11218893-b976-4f76-8cc9-b37ea15ed6a2` |
| <img src="docs/images/pages/settings__roles__11631126-3c94-476e-a4e1-3d57b82502d5.webp" width="420" alt="/settings/roles/11631126-3c94-476e-a4e1-3d57b82502d5"> | `/settings/roles/11631126-3c94-476e-a4e1-3d57b82502d5` |
| <img src="docs/images/pages/settings__roles__1179ee2c-3996-41b2-939c-e8d4e7dd2e59.webp" width="420" alt="/settings/roles/1179ee2c-3996-41b2-939c-e8d4e7dd2e59"> | `/settings/roles/1179ee2c-3996-41b2-939c-e8d4e7dd2e59` |
| <img src="docs/images/pages/settings__roles__128d28b2-a34d-4205-9d14-809e9184aa03.webp" width="420" alt="/settings/roles/128d28b2-a34d-4205-9d14-809e9184aa03"> | `/settings/roles/128d28b2-a34d-4205-9d14-809e9184aa03` |
| <img src="docs/images/pages/settings__roles__16b528e7-df9d-4eb2-88f4-2f631b77e4fb.webp" width="420" alt="/settings/roles/16b528e7-df9d-4eb2-88f4-2f631b77e4fb"> | `/settings/roles/16b528e7-df9d-4eb2-88f4-2f631b77e4fb` |
| <img src="docs/images/pages/settings__roles__1b02e65d-9108-4c3e-8231-59011b4c9650.webp" width="420" alt="/settings/roles/1b02e65d-9108-4c3e-8231-59011b4c9650"> | `/settings/roles/1b02e65d-9108-4c3e-8231-59011b4c9650` |
| <img src="docs/images/pages/settings__roles__1edf85dd-5841-4dfb-ab77-5fd529f3f5c7.webp" width="420" alt="/settings/roles/1edf85dd-5841-4dfb-ab77-5fd529f3f5c7"> | `/settings/roles/1edf85dd-5841-4dfb-ab77-5fd529f3f5c7` |
| <img src="docs/images/pages/settings__roles__1f71f48b-bb61-4f26-a1fa-a22a70306b3b.webp" width="420" alt="/settings/roles/1f71f48b-bb61-4f26-a1fa-a22a70306b3b"> | `/settings/roles/1f71f48b-bb61-4f26-a1fa-a22a70306b3b` |
| <img src="docs/images/pages/settings__roles__217793d2-6b1a-43e0-b9c9-131caa7c6d0a.webp" width="420" alt="/settings/roles/217793d2-6b1a-43e0-b9c9-131caa7c6d0a"> | `/settings/roles/217793d2-6b1a-43e0-b9c9-131caa7c6d0a` |
| <img src="docs/images/pages/settings__roles__218724ad-bd2c-4253-9b12-20a074826d09.webp" width="420" alt="/settings/roles/218724ad-bd2c-4253-9b12-20a074826d09"> | `/settings/roles/218724ad-bd2c-4253-9b12-20a074826d09` |
| <img src="docs/images/pages/settings__roles__2dfed9a8-94d7-408c-b7e0-6f6e5a37b8b6.webp" width="420" alt="/settings/roles/2dfed9a8-94d7-408c-b7e0-6f6e5a37b8b6"> | `/settings/roles/2dfed9a8-94d7-408c-b7e0-6f6e5a37b8b6` |
| <img src="docs/images/pages/settings__roles__2fb86660-9ae1-48aa-9e1a-553804b04571.webp" width="420" alt="/settings/roles/2fb86660-9ae1-48aa-9e1a-553804b04571"> | `/settings/roles/2fb86660-9ae1-48aa-9e1a-553804b04571` |
| <img src="docs/images/pages/settings__roles__31fdd110-4080-4dc8-af7e-2a3da4f80efc.webp" width="420" alt="/settings/roles/31fdd110-4080-4dc8-af7e-2a3da4f80efc"> | `/settings/roles/31fdd110-4080-4dc8-af7e-2a3da4f80efc` |
| <img src="docs/images/pages/settings__roles__32ce065c-c815-45ce-9757-ba3290a4b6ff.webp" width="420" alt="/settings/roles/32ce065c-c815-45ce-9757-ba3290a4b6ff"> | `/settings/roles/32ce065c-c815-45ce-9757-ba3290a4b6ff` |
| <img src="docs/images/pages/settings__roles__3917fc7f-8e5d-412f-9542-9a1598db0a85.webp" width="420" alt="/settings/roles/3917fc7f-8e5d-412f-9542-9a1598db0a85"> | `/settings/roles/3917fc7f-8e5d-412f-9542-9a1598db0a85` |
| <img src="docs/images/pages/settings__roles__3c35e7b8-a627-40e1-b882-5d2f4e85b0ce.webp" width="420" alt="/settings/roles/3c35e7b8-a627-40e1-b882-5d2f4e85b0ce"> | `/settings/roles/3c35e7b8-a627-40e1-b882-5d2f4e85b0ce` |
| <img src="docs/images/pages/settings__roles__3cf3cc46-6901-430a-a576-ecb42959a243.webp" width="420" alt="/settings/roles/3cf3cc46-6901-430a-a576-ecb42959a243"> | `/settings/roles/3cf3cc46-6901-430a-a576-ecb42959a243` |
| <img src="docs/images/pages/settings__roles__3de73db3-6219-486f-891a-7cbdf693504a.webp" width="420" alt="/settings/roles/3de73db3-6219-486f-891a-7cbdf693504a"> | `/settings/roles/3de73db3-6219-486f-891a-7cbdf693504a` |
| <img src="docs/images/pages/settings__roles__4164ad52-0dd9-42d9-8d99-c36fb6a94119.webp" width="420" alt="/settings/roles/4164ad52-0dd9-42d9-8d99-c36fb6a94119"> | `/settings/roles/4164ad52-0dd9-42d9-8d99-c36fb6a94119` |
| <img src="docs/images/pages/settings__roles__41e2b074-ae6c-4847-a8b7-b0ebba43531e.webp" width="420" alt="/settings/roles/41e2b074-ae6c-4847-a8b7-b0ebba43531e"> | `/settings/roles/41e2b074-ae6c-4847-a8b7-b0ebba43531e` |
| <img src="docs/images/pages/settings__roles__47991989-1e9e-4507-86d2-2c639db9e2c3.webp" width="420" alt="/settings/roles/47991989-1e9e-4507-86d2-2c639db9e2c3"> | `/settings/roles/47991989-1e9e-4507-86d2-2c639db9e2c3` |
| <img src="docs/images/pages/settings__roles__4cab6f35-e59c-49ce-8cab-b1072841d70c.webp" width="420" alt="/settings/roles/4cab6f35-e59c-49ce-8cab-b1072841d70c"> | `/settings/roles/4cab6f35-e59c-49ce-8cab-b1072841d70c` |
| <img src="docs/images/pages/settings__roles__4dcc20c7-9571-430e-bdb7-0466a79d1de6.webp" width="420" alt="/settings/roles/4dcc20c7-9571-430e-bdb7-0466a79d1de6"> | `/settings/roles/4dcc20c7-9571-430e-bdb7-0466a79d1de6` |
| <img src="docs/images/pages/settings__roles__50873864-6a0a-4acb-86eb-09c6acf810ca.webp" width="420" alt="/settings/roles/50873864-6a0a-4acb-86eb-09c6acf810ca"> | `/settings/roles/50873864-6a0a-4acb-86eb-09c6acf810ca` |
| <img src="docs/images/pages/settings__roles__58d61069-21af-46ac-9fc6-38d85a1b78a5.webp" width="420" alt="/settings/roles/58d61069-21af-46ac-9fc6-38d85a1b78a5"> | `/settings/roles/58d61069-21af-46ac-9fc6-38d85a1b78a5` |
| <img src="docs/images/pages/settings__roles__5a4f3638-540c-4138-b155-c7b879bc5e68.webp" width="420" alt="/settings/roles/5a4f3638-540c-4138-b155-c7b879bc5e68"> | `/settings/roles/5a4f3638-540c-4138-b155-c7b879bc5e68` |
| <img src="docs/images/pages/settings__roles__5bc1454a-6bcd-4a20-9d93-b1a145a0c435.webp" width="420" alt="/settings/roles/5bc1454a-6bcd-4a20-9d93-b1a145a0c435"> | `/settings/roles/5bc1454a-6bcd-4a20-9d93-b1a145a0c435` |
| <img src="docs/images/pages/settings__roles__5d3cba15-a987-45bb-871a-843d4eb086bd.webp" width="420" alt="/settings/roles/5d3cba15-a987-45bb-871a-843d4eb086bd"> | `/settings/roles/5d3cba15-a987-45bb-871a-843d4eb086bd` |
| <img src="docs/images/pages/settings__roles__609079bc-65d9-4e26-881d-8d0781b3c097.webp" width="420" alt="/settings/roles/609079bc-65d9-4e26-881d-8d0781b3c097"> | `/settings/roles/609079bc-65d9-4e26-881d-8d0781b3c097` |
| <img src="docs/images/pages/settings__roles__64556fd8-8a73-4d81-a0b1-7e4f316c27f7.webp" width="420" alt="/settings/roles/64556fd8-8a73-4d81-a0b1-7e4f316c27f7"> | `/settings/roles/64556fd8-8a73-4d81-a0b1-7e4f316c27f7` |
| <img src="docs/images/pages/settings__roles__687b91af-ba0d-4c0b-b7c0-bc03f46d1c3e.webp" width="420" alt="/settings/roles/687b91af-ba0d-4c0b-b7c0-bc03f46d1c3e"> | `/settings/roles/687b91af-ba0d-4c0b-b7c0-bc03f46d1c3e` |
| <img src="docs/images/pages/settings__roles__6bb5264f-cda7-4fb3-8d40-57d79271bcf3.webp" width="420" alt="/settings/roles/6bb5264f-cda7-4fb3-8d40-57d79271bcf3"> | `/settings/roles/6bb5264f-cda7-4fb3-8d40-57d79271bcf3` |
| <img src="docs/images/pages/settings__roles__6d04f699-749b-41d1-8c4b-347e4b5c9a71.webp" width="420" alt="/settings/roles/6d04f699-749b-41d1-8c4b-347e4b5c9a71"> | `/settings/roles/6d04f699-749b-41d1-8c4b-347e4b5c9a71` |
| <img src="docs/images/pages/settings__roles__6da7abea-2978-4186-b80f-8f5fbb4be013.webp" width="420" alt="/settings/roles/6da7abea-2978-4186-b80f-8f5fbb4be013"> | `/settings/roles/6da7abea-2978-4186-b80f-8f5fbb4be013` |
| <img src="docs/images/pages/settings__roles__6f8c6ac6-8423-45d1-8edf-466f8597d26e.webp" width="420" alt="/settings/roles/6f8c6ac6-8423-45d1-8edf-466f8597d26e"> | `/settings/roles/6f8c6ac6-8423-45d1-8edf-466f8597d26e` |
| <img src="docs/images/pages/settings__roles__72c2dc99-16ba-411d-aea5-793a02a3f404.webp" width="420" alt="/settings/roles/72c2dc99-16ba-411d-aea5-793a02a3f404"> | `/settings/roles/72c2dc99-16ba-411d-aea5-793a02a3f404` |
| <img src="docs/images/pages/settings__roles__75880153-2e0d-4b84-b670-88c1e577b4bb.webp" width="420" alt="/settings/roles/75880153-2e0d-4b84-b670-88c1e577b4bb"> | `/settings/roles/75880153-2e0d-4b84-b670-88c1e577b4bb` |
| <img src="docs/images/pages/settings__roles__7711a167-b7ac-43ad-aa54-7c298c279bc3.webp" width="420" alt="/settings/roles/7711a167-b7ac-43ad-aa54-7c298c279bc3"> | `/settings/roles/7711a167-b7ac-43ad-aa54-7c298c279bc3` |
| <img src="docs/images/pages/settings__roles__780bd648-f876-45a9-926b-a03588ae22c6.webp" width="420" alt="/settings/roles/780bd648-f876-45a9-926b-a03588ae22c6"> | `/settings/roles/780bd648-f876-45a9-926b-a03588ae22c6` |
| <img src="docs/images/pages/settings__roles__7d15bac7-97ba-4a64-8201-1fffbd4d2deb.webp" width="420" alt="/settings/roles/7d15bac7-97ba-4a64-8201-1fffbd4d2deb"> | `/settings/roles/7d15bac7-97ba-4a64-8201-1fffbd4d2deb` |
| <img src="docs/images/pages/settings__roles__8307e948-121d-4503-b650-a2e50dcdfe20.webp" width="420" alt="/settings/roles/8307e948-121d-4503-b650-a2e50dcdfe20"> | `/settings/roles/8307e948-121d-4503-b650-a2e50dcdfe20` |
| <img src="docs/images/pages/settings__roles__895e0142-25a5-4efa-b714-fdf565fcc58e.webp" width="420" alt="/settings/roles/895e0142-25a5-4efa-b714-fdf565fcc58e"> | `/settings/roles/895e0142-25a5-4efa-b714-fdf565fcc58e` |
| <img src="docs/images/pages/settings__roles__8befedcf-e211-4e74-b92d-3947413f681f.webp" width="420" alt="/settings/roles/8befedcf-e211-4e74-b92d-3947413f681f"> | `/settings/roles/8befedcf-e211-4e74-b92d-3947413f681f` |
| <img src="docs/images/pages/settings__roles__967cbc1a-e6cf-45e8-ba0f-5c19c2dd9712.webp" width="420" alt="/settings/roles/967cbc1a-e6cf-45e8-ba0f-5c19c2dd9712"> | `/settings/roles/967cbc1a-e6cf-45e8-ba0f-5c19c2dd9712` |
| <img src="docs/images/pages/settings__roles__9718e1c7-54c0-417e-891b-024e7b6a591d.webp" width="420" alt="/settings/roles/9718e1c7-54c0-417e-891b-024e7b6a591d"> | `/settings/roles/9718e1c7-54c0-417e-891b-024e7b6a591d` |
| <img src="docs/images/pages/settings__roles__a22bef4d-ef78-4be3-9cbc-d07eed5f8c4d.webp" width="420" alt="/settings/roles/a22bef4d-ef78-4be3-9cbc-d07eed5f8c4d"> | `/settings/roles/a22bef4d-ef78-4be3-9cbc-d07eed5f8c4d` |
| <img src="docs/images/pages/settings__roles__a7186ae7-ad86-4ab4-abd1-cdda2179b8d8.webp" width="420" alt="/settings/roles/a7186ae7-ad86-4ab4-abd1-cdda2179b8d8"> | `/settings/roles/a7186ae7-ad86-4ab4-abd1-cdda2179b8d8` |
| <img src="docs/images/pages/settings__roles__aa0c3881-1cb1-4981-870a-c77b1796c4a5.webp" width="420" alt="/settings/roles/aa0c3881-1cb1-4981-870a-c77b1796c4a5"> | `/settings/roles/aa0c3881-1cb1-4981-870a-c77b1796c4a5` |
| <img src="docs/images/pages/settings__roles__aa5b1338-ad5c-432d-944b-92f3160570ec.webp" width="420" alt="/settings/roles/aa5b1338-ad5c-432d-944b-92f3160570ec"> | `/settings/roles/aa5b1338-ad5c-432d-944b-92f3160570ec` |
| <img src="docs/images/pages/settings__roles__aecb67bd-3d57-447c-81fc-3e95a226d2b8.webp" width="420" alt="/settings/roles/aecb67bd-3d57-447c-81fc-3e95a226d2b8"> | `/settings/roles/aecb67bd-3d57-447c-81fc-3e95a226d2b8` |
| <img src="docs/images/pages/settings__roles__b974bf1b-276e-4dbd-ad52-27846ae37a10.webp" width="420" alt="/settings/roles/b974bf1b-276e-4dbd-ad52-27846ae37a10"> | `/settings/roles/b974bf1b-276e-4dbd-ad52-27846ae37a10` |
| <img src="docs/images/pages/settings__roles__bea95567-270d-4347-9e6d-9d3161aefe63.webp" width="420" alt="/settings/roles/bea95567-270d-4347-9e6d-9d3161aefe63"> | `/settings/roles/bea95567-270d-4347-9e6d-9d3161aefe63` |
| <img src="docs/images/pages/settings__roles__c284ce9d-7bb8-46d3-a623-3cd8bd564f61.webp" width="420" alt="/settings/roles/c284ce9d-7bb8-46d3-a623-3cd8bd564f61"> | `/settings/roles/c284ce9d-7bb8-46d3-a623-3cd8bd564f61` |
| <img src="docs/images/pages/settings__roles__c6175db6-aafa-45be-9751-8b2cd353160c.webp" width="420" alt="/settings/roles/c6175db6-aafa-45be-9751-8b2cd353160c"> | `/settings/roles/c6175db6-aafa-45be-9751-8b2cd353160c` |
| <img src="docs/images/pages/settings__roles__ce88c52e-43c5-4e83-a113-8379877b22f3.webp" width="420" alt="/settings/roles/ce88c52e-43c5-4e83-a113-8379877b22f3"> | `/settings/roles/ce88c52e-43c5-4e83-a113-8379877b22f3` |
| <img src="docs/images/pages/settings__roles__d15cc95e-9e41-4e17-bcb8-d04f359594ba.webp" width="420" alt="/settings/roles/d15cc95e-9e41-4e17-bcb8-d04f359594ba"> | `/settings/roles/d15cc95e-9e41-4e17-bcb8-d04f359594ba` |
| <img src="docs/images/pages/settings__roles__d1b05602-5b04-42bd-958a-cbe4a078c3a1.webp" width="420" alt="/settings/roles/d1b05602-5b04-42bd-958a-cbe4a078c3a1"> | `/settings/roles/d1b05602-5b04-42bd-958a-cbe4a078c3a1` |
| <img src="docs/images/pages/settings__roles__d23f3840-de05-45e5-b2d1-78ac97d12ab8.webp" width="420" alt="/settings/roles/d23f3840-de05-45e5-b2d1-78ac97d12ab8"> | `/settings/roles/d23f3840-de05-45e5-b2d1-78ac97d12ab8` |
| <img src="docs/images/pages/settings__roles__d6132a9b-3d73-4925-b845-469a0569a9d3.webp" width="420" alt="/settings/roles/d6132a9b-3d73-4925-b845-469a0569a9d3"> | `/settings/roles/d6132a9b-3d73-4925-b845-469a0569a9d3` |
| <img src="docs/images/pages/settings__roles__d63fb812-6879-4e8b-bd22-14afc77569cd.webp" width="420" alt="/settings/roles/d63fb812-6879-4e8b-bd22-14afc77569cd"> | `/settings/roles/d63fb812-6879-4e8b-bd22-14afc77569cd` |
| <img src="docs/images/pages/settings__roles__d6a194e7-bcb8-407b-9de7-cb4162594586.webp" width="420" alt="/settings/roles/d6a194e7-bcb8-407b-9de7-cb4162594586"> | `/settings/roles/d6a194e7-bcb8-407b-9de7-cb4162594586` |
| <img src="docs/images/pages/settings__roles__d9e3ff76-e746-4f7e-aab0-bf06811bb6d1.webp" width="420" alt="/settings/roles/d9e3ff76-e746-4f7e-aab0-bf06811bb6d1"> | `/settings/roles/d9e3ff76-e746-4f7e-aab0-bf06811bb6d1` |
| <img src="docs/images/pages/settings__roles__db5ff839-aa35-4650-968c-ec2d31c5a6c4.webp" width="420" alt="/settings/roles/db5ff839-aa35-4650-968c-ec2d31c5a6c4"> | `/settings/roles/db5ff839-aa35-4650-968c-ec2d31c5a6c4` |
| <img src="docs/images/pages/settings__roles__ddcd419f-c7ab-491e-a02d-8546962d57ca.webp" width="420" alt="/settings/roles/ddcd419f-c7ab-491e-a02d-8546962d57ca"> | `/settings/roles/ddcd419f-c7ab-491e-a02d-8546962d57ca` |
| <img src="docs/images/pages/settings__roles__e18d03fe-1837-4154-8794-912ff2bf31be.webp" width="420" alt="/settings/roles/e18d03fe-1837-4154-8794-912ff2bf31be"> | `/settings/roles/e18d03fe-1837-4154-8794-912ff2bf31be` |
| <img src="docs/images/pages/settings__roles__e3faae27-c868-4779-abfa-0af48acacd8c.webp" width="420" alt="/settings/roles/e3faae27-c868-4779-abfa-0af48acacd8c"> | `/settings/roles/e3faae27-c868-4779-abfa-0af48acacd8c` |
| <img src="docs/images/pages/settings__roles__ead34c6e-4596-4e92-a62d-385f2bdde939.webp" width="420" alt="/settings/roles/ead34c6e-4596-4e92-a62d-385f2bdde939"> | `/settings/roles/ead34c6e-4596-4e92-a62d-385f2bdde939` |
| <img src="docs/images/pages/settings__roles__eb29a8b9-2c9f-4633-ae1c-a60de5cb19be.webp" width="420" alt="/settings/roles/eb29a8b9-2c9f-4633-ae1c-a60de5cb19be"> | `/settings/roles/eb29a8b9-2c9f-4633-ae1c-a60de5cb19be` |
| <img src="docs/images/pages/settings__roles__ebf197b7-72ea-4e22-aaa8-b2dba9e89703.webp" width="420" alt="/settings/roles/ebf197b7-72ea-4e22-aaa8-b2dba9e89703"> | `/settings/roles/ebf197b7-72ea-4e22-aaa8-b2dba9e89703` |
| <img src="docs/images/pages/settings__roles__f81c5d89-ed01-4a9f-82ca-e3abc9c12537.webp" width="420" alt="/settings/roles/f81c5d89-ed01-4a9f-82ca-e3abc9c12537"> | `/settings/roles/f81c5d89-ed01-4a9f-82ca-e3abc9c12537` |
| <img src="docs/images/pages/settings__roles__fbbae884-e34c-4834-a756-1222a40e5ff5.webp" width="420" alt="/settings/roles/fbbae884-e34c-4834-a756-1222a40e5ff5"> | `/settings/roles/fbbae884-e34c-4834-a756-1222a40e5ff5` |
| <img src="docs/images/pages/settings__roles__ff97ab8d-f459-4d7d-b6df-a01b52350450.webp" width="420" alt="/settings/roles/ff97ab8d-f459-4d7d-b6df-a01b52350450"> | `/settings/roles/ff97ab8d-f459-4d7d-b6df-a01b52350450` |
| <img src="docs/images/pages/settings__roles__new.webp" width="420" alt="/settings/roles/new">                                                                   | `/settings/roles/new`                                  |

</details>

<details>
<summary><strong>Resepsionis</strong> — 5 halaman</summary>

| Halaman                                                                                            | Rute                     |
| -------------------------------------------------------------------------------------------------- | ------------------------ |
| <img src="docs/images/pages/reception.webp" width="420" alt="/reception">                          | `/reception`             |
| <img src="docs/images/pages/reception__gate.webp" width="420" alt="/reception/gate">               | `/reception/gate`        |
| <img src="docs/images/pages/reception__guest-books.webp" width="420" alt="/reception/guest-books"> | `/reception/guest-books` |
| <img src="docs/images/pages/reception__packages.webp" width="420" alt="/reception/packages">       | `/reception/packages`    |
| <img src="docs/images/pages/reception__visits.webp" width="420" alt="/reception/visits">           | `/reception/visits`      |

</details>

<details>
<summary><strong>Proyek</strong> — 2 halaman</summary>

| Halaman                                                                                                                                          | Rute                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| <img src="docs/images/pages/project.webp" width="420" alt="/project">                                                                            | `/project`                                      |
| <img src="docs/images/pages/project__b632b81d-9137-43c5-abd0-64210e283334.webp" width="420" alt="/project/b632b81d-9137-43c5-abd0-64210e283334"> | `/project/b632b81d-9137-43c5-abd0-64210e283334` |

</details>

<details>
<summary><strong>Wilayah</strong> — 1 halaman</summary>

| Halaman                                                               | Rute       |
| --------------------------------------------------------------------- | ---------- |
| <img src="docs/images/pages/wilayah.webp" width="420" alt="/wilayah"> | `/wilayah` |

</details>

<details>
<summary><strong>Laporan Harian</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                    | Rute                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <img src="docs/images/pages/daily-report.webp" width="420" alt="/daily-report">                                                                            | `/daily-report`                                      |
| <img src="docs/images/pages/daily-report__bulk.webp" width="420" alt="/daily-report/bulk">                                                                 | `/daily-report/bulk`                                 |
| <img src="docs/images/pages/daily-report__c2126588-25f1-4da4-a34f-23c1372ef8ab.webp" width="420" alt="/daily-report/c2126588-25f1-4da4-a34f-23c1372ef8ab"> | `/daily-report/c2126588-25f1-4da4-a34f-23c1372ef8ab` |
| <img src="docs/images/pages/daily-report__create.webp" width="420" alt="/daily-report/create">                                                             | `/daily-report/create`                               |

</details>

<details>
<summary><strong>Situs Unit</strong> — 6 halaman</summary>

| Halaman                                                                              | Rute              |
| ------------------------------------------------------------------------------------ | ----------------- |
| <img src="docs/images/pages/unit.webp" width="420" alt="/unit">                      | `/unit`           |
| <img src="docs/images/pages/unit__sdit.webp" width="420" alt="/unit/sdit">           | `/unit/sdit`      |
| <img src="docs/images/pages/unit__sma-quran.webp" width="420" alt="/unit/sma-quran"> | `/unit/sma-quran` |
| <img src="docs/images/pages/unit__smpit.webp" width="420" alt="/unit/smpit">         | `/unit/smpit`     |
| <img src="docs/images/pages/unit__takhosus.webp" width="420" alt="/unit/takhosus">   | `/unit/takhosus`  |
| <img src="docs/images/pages/unit__tkq.webp" width="420" alt="/unit/tkq">             | `/unit/tkq`       |

</details>

<details>
<summary><strong>Berita (Publik)</strong> — 5 halaman</summary>

| Halaman                                                                                                                                            | Rute                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| <img src="docs/images/pages/berita.webp" width="420" alt="/berita">                                                                                | `/berita`                                        |
| <img src="docs/images/pages/berita__bmw-championship-road-to-malaysia-2026.webp" width="420" alt="/berita/bmw-championship-road-to-malaysia-2026"> | `/berita/bmw-championship-road-to-malaysia-2026` |
| <img src="docs/images/pages/berita__marhaban-ya-ramadhan-1447.webp" width="420" alt="/berita/marhaban-ya-ramadhan-1447">                           | `/berita/marhaban-ya-ramadhan-1447`              |
| <img src="docs/images/pages/berita__osn-kecamatan-kadipaten-2026.webp" width="420" alt="/berita/osn-kecamatan-kadipaten-2026">                     | `/berita/osn-kecamatan-kadipaten-2026`           |
| <img src="docs/images/pages/berita__prestasi-pentas-pai-kadipaten.webp" width="420" alt="/berita/prestasi-pentas-pai-kadipaten">                   | `/berita/prestasi-pentas-pai-kadipaten`          |

</details>

<details>
<summary><strong>Profil Yayasan (Publik)</strong> — 3 halaman</summary>

| Halaman                                                                                  | Rute                |
| ---------------------------------------------------------------------------------------- | ------------------- |
| <img src="docs/images/pages/profil.webp" width="420" alt="/profil">                      | `/profil`           |
| <img src="docs/images/pages/profil__legalitas.webp" width="420" alt="/profil/legalitas"> | `/profil/legalitas` |
| <img src="docs/images/pages/profil__pimpinan.webp" width="420" alt="/profil/pimpinan">   | `/profil/pimpinan`  |

</details>

<details>
<summary><strong>Program Unggulan (Publik)</strong> — 1 halaman</summary>

| Halaman                                                                                 | Rute                |
| --------------------------------------------------------------------------------------- | ------------------- |
| <img src="docs/images/pages/program-unggulan.webp" width="420" alt="/program-unggulan"> | `/program-unggulan` |

</details>

<details>
<summary><strong>Wakaf & Infaq (Publik)</strong> — 1 halaman</summary>

| Halaman                                                                       | Rute           |
| ----------------------------------------------------------------------------- | -------------- |
| <img src="docs/images/pages/wakaf-infaq.webp" width="420" alt="/wakaf-infaq"> | `/wakaf-infaq` |

</details>

<details>
<summary><strong>Kontak (Publik)</strong> — 1 halaman</summary>

| Halaman                                                             | Rute      |
| ------------------------------------------------------------------- | --------- |
| <img src="docs/images/pages/kontak.webp" width="420" alt="/kontak"> | `/kontak` |

</details>

<details>
<summary><strong>Halaman Publik Lain</strong> — 5 halaman</summary>

| Halaman                                                                                          | Rute                    |
| ------------------------------------------------------------------------------------------------ | ----------------------- |
| <img src="docs/images/pages/public__spmb.webp" width="420" alt="/public/spmb">                   | `/public/spmb`          |
| <img src="docs/images/pages/public__spmb__track.webp" width="420" alt="/public/spmb/track">      | `/public/spmb/track`    |
| <img src="docs/images/pages/public__verify-card.webp" width="420" alt="/public/verify-card">     | `/public/verify-card`   |
| <img src="docs/images/pages/public__verify-letter.webp" width="420" alt="/public/verify-letter"> | `/public/verify-letter` |
| <img src="docs/images/pages/public__verify-sanad.webp" width="420" alt="/public/verify-sanad">   | `/public/verify-sanad`  |

</details>

<details>
<summary><strong>Tidak Berwenang</strong> — 1 halaman</summary>

| Halaman                                                                         | Rute            |
| ------------------------------------------------------------------------------- | --------------- |
| <img src="docs/images/pages/unauthorized.webp" width="420" alt="/unauthorized"> | `/unauthorized` |

</details>

<details>
<summary><strong>Reset Password</strong> — 1 halaman</summary>

| Halaman                                                                             | Rute              |
| ----------------------------------------------------------------------------------- | ----------------- |
| <img src="docs/images/pages/reset-password.webp" width="420" alt="/reset-password"> | `/reset-password` |

</details>

<details>
<summary><strong>Admin</strong> — 1 halaman</summary>

| Halaman                                                                                | Rute               |
| -------------------------------------------------------------------------------------- | ------------------ |
| <img src="docs/images/pages/admin__marketing.webp" width="420" alt="/admin/marketing"> | `/admin/marketing` |

</details>

<details>
<summary><strong>Assignments</strong> — 3 halaman</summary>

| Halaman                                                                                                                                                  | Rute                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| <img src="docs/images/pages/assignments.webp" width="420" alt="/assignments">                                                                            | `/assignments`                                      |
| <img src="docs/images/pages/assignments__create.webp" width="420" alt="/assignments/create">                                                             | `/assignments/create`                               |
| <img src="docs/images/pages/assignments__ff926aa0-b666-4c7a-bd5e-4c95b13df1a8.webp" width="420" alt="/assignments/ff926aa0-b666-4c7a-bd5e-4c95b13df1a8"> | `/assignments/ff926aa0-b666-4c7a-bd5e-4c95b13df1a8` |

</details>

<details>
<summary><strong>Calendar</strong> — 3 halaman</summary>

| Halaman                                                                                         | Rute                   |
| ----------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/pages/calendar.webp" width="420" alt="/calendar">                         | `/calendar`            |
| <img src="docs/images/pages/calendar__events.webp" width="420" alt="/calendar/events">          | `/calendar/events`     |
| <img src="docs/images/pages/calendar__events__new.webp" width="420" alt="/calendar/events/new"> | `/calendar/events/new` |

</details>

<details>
<summary><strong>Emis</strong> — 1 halaman</summary>

| Halaman                                                         | Rute    |
| --------------------------------------------------------------- | ------- |
| <img src="docs/images/pages/emis.webp" width="420" alt="/emis"> | `/emis` |

</details>

<details>
<summary><strong>Galeri</strong> — 1 halaman</summary>

| Halaman                                                             | Rute      |
| ------------------------------------------------------------------- | --------- |
| <img src="docs/images/pages/galeri.webp" width="420" alt="/galeri"> | `/galeri` |

</details>

<details>
<summary><strong>Lingkungan</strong> — 1 halaman</summary>

| Halaman                                                                     | Rute          |
| --------------------------------------------------------------------------- | ------------- |
| <img src="docs/images/pages/lingkungan.webp" width="420" alt="/lingkungan"> | `/lingkungan` |

</details>

<details>
<summary><strong>Organisasi</strong> — 3 halaman</summary>

| Halaman                                                                                                                                                               | Rute                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| <img src="docs/images/pages/organisasi.webp" width="420" alt="/organisasi">                                                                                           | `/organisasi`                                             |
| <img src="docs/images/pages/organisasi__posisi__ee6dd00d-93c5-43ea-a6cd-b2a7a4734fb6.webp" width="420" alt="/organisasi/posisi/ee6dd00d-93c5-43ea-a6cd-b2a7a4734fb6"> | `/organisasi/posisi/ee6dd00d-93c5-43ea-a6cd-b2a7a4734fb6` |
| <img src="docs/images/pages/organisasi__struktur.webp" width="420" alt="/organisasi/struktur">                                                                        | `/organisasi/struktur`                                    |

</details>

<details>
<summary><strong>Pengawasan</strong> — 2 halaman</summary>

| Halaman                                                                                                                                                | Rute                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| <img src="docs/images/pages/pengawasan.webp" width="420" alt="/pengawasan">                                                                            | `/pengawasan`                                      |
| <img src="docs/images/pages/pengawasan__ce805da4-8f54-4e6d-be43-a3fd08a05a03.webp" width="420" alt="/pengawasan/ce805da4-8f54-4e6d-be43-a3fd08a05a03"> | `/pengawasan/ce805da4-8f54-4e6d-be43-a3fd08a05a03` |

</details>

<details>
<summary><strong>Practicum</strong> — 2 halaman</summary>

| Halaman                                                                            | Rute             |
| ---------------------------------------------------------------------------------- | ---------------- |
| <img src="docs/images/pages/practicum.webp" width="420" alt="/practicum">          | `/practicum`     |
| <img src="docs/images/pages/practicum__new.webp" width="420" alt="/practicum/new"> | `/practicum/new` |

</details>

<details>
<summary><strong>Student</strong> — 4 halaman</summary>

| Halaman                                                                                                                                                                  | Rute                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| <img src="docs/images/pages/student.webp" width="420" alt="/student">                                                                                                    | `/student`                                                 |
| <img src="docs/images/pages/student__achievements.webp" width="420" alt="/student/achievements">                                                                         | `/student/achievements`                                    |
| <img src="docs/images/pages/student__exams.webp" width="420" alt="/student/exams">                                                                                       | `/student/exams`                                           |
| <img src="docs/images/pages/student__exams__e8a73c30-d814-42fe-a1fb-6d315d54a404__take.webp" width="420" alt="/student/exams/e8a73c30-d814-42fe-a1fb-6d315d54a404/take"> | `/student/exams/e8a73c30-d814-42fe-a1fb-6d315d54a404/take` |

</details>

<details>
<summary><strong>Syariah</strong> — 2 halaman</summary>

| Halaman                                                                                                                                          | Rute                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| <img src="docs/images/pages/syariah.webp" width="420" alt="/syariah">                                                                            | `/syariah`                                      |
| <img src="docs/images/pages/syariah__61cdd312-9261-4b0b-8e60-d9d0c1b08365.webp" width="420" alt="/syariah/61cdd312-9261-4b0b-8e60-d9d0c1b08365"> | `/syariah/61cdd312-9261-4b0b-8e60-d9d0c1b08365` |

</details>

<details>
<summary><strong>Talenta</strong> — 5 halaman</summary>

| Halaman                                                                                                                                          | Rute                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| <img src="docs/images/pages/talenta.webp" width="420" alt="/talenta">                                                                            | `/talenta`                                      |
| <img src="docs/images/pages/talenta__7ed09f96-73d2-44fe-b916-ec0d02bcdb9f.webp" width="420" alt="/talenta/7ed09f96-73d2-44fe-b916-ec0d02bcdb9f"> | `/talenta/7ed09f96-73d2-44fe-b916-ec0d02bcdb9f` |
| <img src="docs/images/pages/talenta__analytics.webp" width="420" alt="/talenta/analytics">                                                       | `/talenta/analytics`                            |
| <img src="docs/images/pages/talenta__matrix.webp" width="420" alt="/talenta/matrix">                                                             | `/talenta/matrix`                               |
| <img src="docs/images/pages/talenta__succession.webp" width="420" alt="/talenta/succession">                                                     | `/talenta/succession`                           |

</details>

<details>
<summary><strong>Tata Laksana</strong> — 2 halaman</summary>

| Halaman                                                                                                                                                    | Rute                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <img src="docs/images/pages/tata-laksana.webp" width="420" alt="/tata-laksana">                                                                            | `/tata-laksana`                                      |
| <img src="docs/images/pages/tata-laksana__95103671-aa30-4cce-bfef-5120e096d71f.webp" width="420" alt="/tata-laksana/95103671-aa30-4cce-bfef-5120e096d71f"> | `/tata-laksana/95103671-aa30-4cce-bfef-5120e096d71f` |

</details>

<details>
<summary><strong>Unit Usaha</strong> — 3 halaman</summary>

| Halaman                                                                                                                                                | Rute                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| <img src="docs/images/pages/unit-usaha.webp" width="420" alt="/unit-usaha">                                                                            | `/unit-usaha`                                      |
| <img src="docs/images/pages/unit-usaha__1510e99e-72c4-4a51-9b4b-b1c74881ccfe.webp" width="420" alt="/unit-usaha/1510e99e-72c4-4a51-9b4b-b1c74881ccfe"> | `/unit-usaha/1510e99e-72c4-4a51-9b4b-b1c74881ccfe` |
| <img src="docs/images/pages/unit-usaha__33048f6b-eea8-4ebc-afd0-fc6b6406ea3c.webp" width="420" alt="/unit-usaha/33048f6b-eea8-4ebc-afd0-fc6b6406ea3c"> | `/unit-usaha/33048f6b-eea8-4ebc-afd0-fc6b6406ea3c` |

</details>

<!-- END:GENERATED-GALLERY -->

---

<!-- BEGIN:GENERATED-ROLES -->

## Galeri Per Peran

Setiap dari **66 akun demo** (`RoleCode`) beserta halaman yang benar-benar dibuka oleh menunya, ditangkap dengan sesi login peran tersebut. Halaman yang sengaja hanya menampilkan pesan RBAC tidak dihitung sebagai kegagalan.

<details>
<summary><code>business-manager</code> — 12 halaman</summary>

| Halaman                                                                                                                         | Rute                  |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/business-manager__spmb.webp" width="360" alt="business-manager /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/business-manager__staff.webp" width="360" alt="business-manager /staff">                            | `/staff`              |
| <img src="docs/images/roles/business-manager__health.webp" width="360" alt="business-manager /health">                          | `/health`             |
| <img src="docs/images/roles/business-manager__finance.webp" width="360" alt="business-manager /finance">                        | `/finance`            |
| <img src="docs/images/roles/business-manager__kinerja.webp" width="360" alt="business-manager /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/business-manager__permits.webp" width="360" alt="business-manager /permits">                        | `/permits`            |
| <img src="docs/images/roles/business-manager__rewards.webp" width="360" alt="business-manager /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/business-manager__e-office.webp" width="360" alt="business-manager /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/business-manager__lingkungan.webp" width="360" alt="business-manager /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/business-manager__violations.webp" width="360" alt="business-manager /violations">                  | `/violations`         |
| <img src="docs/images/roles/business-manager__announcements.webp" width="360" alt="business-manager /announcements">            | `/announcements`      |
| <img src="docs/images/roles/business-manager__quality__complaints.webp" width="360" alt="business-manager /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>business-staff</code> — 12 halaman</summary>

| Halaman                                                                                                                     | Rute                  |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/business-staff__spmb.webp" width="360" alt="business-staff /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/business-staff__staff.webp" width="360" alt="business-staff /staff">                            | `/staff`              |
| <img src="docs/images/roles/business-staff__health.webp" width="360" alt="business-staff /health">                          | `/health`             |
| <img src="docs/images/roles/business-staff__finance.webp" width="360" alt="business-staff /finance">                        | `/finance`            |
| <img src="docs/images/roles/business-staff__kinerja.webp" width="360" alt="business-staff /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/business-staff__permits.webp" width="360" alt="business-staff /permits">                        | `/permits`            |
| <img src="docs/images/roles/business-staff__rewards.webp" width="360" alt="business-staff /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/business-staff__e-office.webp" width="360" alt="business-staff /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/business-staff__lingkungan.webp" width="360" alt="business-staff /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/business-staff__violations.webp" width="360" alt="business-staff /violations">                  | `/violations`         |
| <img src="docs/images/roles/business-staff__announcements.webp" width="360" alt="business-staff /announcements">            | `/announcements`      |
| <img src="docs/images/roles/business-staff__quality__complaints.webp" width="360" alt="business-staff /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>keamanan</code> — 13 halaman</summary>

| Halaman                                                                                                         | Rute                  |
| --------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/keamanan__spmb.webp" width="360" alt="keamanan /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/keamanan__staff.webp" width="360" alt="keamanan /staff">                            | `/staff`              |
| <img src="docs/images/roles/keamanan__health.webp" width="360" alt="keamanan /health">                          | `/health`             |
| <img src="docs/images/roles/keamanan__finance.webp" width="360" alt="keamanan /finance">                        | `/finance`            |
| <img src="docs/images/roles/keamanan__kinerja.webp" width="360" alt="keamanan /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/keamanan__permits.webp" width="360" alt="keamanan /permits">                        | `/permits`            |
| <img src="docs/images/roles/keamanan__rewards.webp" width="360" alt="keamanan /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/keamanan__e-office.webp" width="360" alt="keamanan /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/keamanan__students.webp" width="360" alt="keamanan /students">                      | `/students`           |
| <img src="docs/images/roles/keamanan__lingkungan.webp" width="360" alt="keamanan /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/keamanan__violations.webp" width="360" alt="keamanan /violations">                  | `/violations`         |
| <img src="docs/images/roles/keamanan__announcements.webp" width="360" alt="keamanan /announcements">            | `/announcements`      |
| <img src="docs/images/roles/keamanan__quality__complaints.webp" width="360" alt="keamanan /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>laboran</code> — 13 halaman</summary>

| Halaman                                                                                                       | Rute                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/laboran__spmb.webp" width="360" alt="laboran /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/laboran__staff.webp" width="360" alt="laboran /staff">                            | `/staff`              |
| <img src="docs/images/roles/laboran__health.webp" width="360" alt="laboran /health">                          | `/health`             |
| <img src="docs/images/roles/laboran__finance.webp" width="360" alt="laboran /finance">                        | `/finance`            |
| <img src="docs/images/roles/laboran__kinerja.webp" width="360" alt="laboran /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/laboran__permits.webp" width="360" alt="laboran /permits">                        | `/permits`            |
| <img src="docs/images/roles/laboran__rewards.webp" width="360" alt="laboran /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/laboran__e-office.webp" width="360" alt="laboran /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/laboran__students.webp" width="360" alt="laboran /students">                      | `/students`           |
| <img src="docs/images/roles/laboran__lingkungan.webp" width="360" alt="laboran /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/laboran__violations.webp" width="360" alt="laboran /violations">                  | `/violations`         |
| <img src="docs/images/roles/laboran__announcements.webp" width="360" alt="laboran /announcements">            | `/announcements`      |
| <img src="docs/images/roles/laboran__quality__complaints.webp" width="360" alt="laboran /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>muhafidz</code> — 24 halaman</summary>

| Halaman                                                                                                         | Rute                  |
| --------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/muhafidz__meals.webp" width="360" alt="muhafidz /meals">                            | `/meals`              |
| <img src="docs/images/roles/muhafidz__health.webp" width="360" alt="muhafidz /health">                          | `/health`             |
| <img src="docs/images/roles/muhafidz__ibadah.webp" width="360" alt="muhafidz /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/muhafidz__laundry.webp" width="360" alt="muhafidz /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/muhafidz__musyrif.webp" width="360" alt="muhafidz /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/muhafidz__permits.webp" width="360" alt="muhafidz /permits">                        | `/permits`            |
| <img src="docs/images/roles/muhafidz__rewards.webp" width="360" alt="muhafidz /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/muhafidz__tahfidz.webp" width="360" alt="muhafidz /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/muhafidz__teacher.webp" width="360" alt="muhafidz /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/muhafidz__e-office.webp" width="360" alt="muhafidz /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/muhafidz__schedule.webp" width="360" alt="muhafidz /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/muhafidz__students.webp" width="360" alt="muhafidz /students">                      | `/students`           |
| <img src="docs/images/roles/muhafidz__takhosus.webp" width="360" alt="muhafidz /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/muhafidz__muhasabah.webp" width="360" alt="muhafidz /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/muhafidz__muhadatsah.webp" width="360" alt="muhafidz /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/muhafidz__muhadhoroh.webp" width="360" alt="muhafidz /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/muhafidz__violations.webp" width="360" alt="muhafidz /violations">                  | `/violations`         |
| <img src="docs/images/roles/muhafidz__dormitories.webp" width="360" alt="muhafidz /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/muhafidz__duty-roster.webp" width="360" alt="muhafidz /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/muhafidz__daily-report.webp" width="360" alt="muhafidz /daily-report">              | `/daily-report`       |
| <img src="docs/images/roles/muhafidz__announcements.webp" width="360" alt="muhafidz /announcements">            | `/announcements`      |
| <img src="docs/images/roles/muhafidz__kitab-progress.webp" width="360" alt="muhafidz /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/muhafidz__rapor-pesantren.webp" width="360" alt="muhafidz /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/muhafidz__quality__complaints.webp" width="360" alt="muhafidz /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>muhafidzah</code> — 24 halaman</summary>

| Halaman                                                                                                             | Rute                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/muhafidzah__meals.webp" width="360" alt="muhafidzah /meals">                            | `/meals`              |
| <img src="docs/images/roles/muhafidzah__health.webp" width="360" alt="muhafidzah /health">                          | `/health`             |
| <img src="docs/images/roles/muhafidzah__ibadah.webp" width="360" alt="muhafidzah /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/muhafidzah__laundry.webp" width="360" alt="muhafidzah /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/muhafidzah__musyrif.webp" width="360" alt="muhafidzah /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/muhafidzah__permits.webp" width="360" alt="muhafidzah /permits">                        | `/permits`            |
| <img src="docs/images/roles/muhafidzah__rewards.webp" width="360" alt="muhafidzah /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/muhafidzah__tahfidz.webp" width="360" alt="muhafidzah /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/muhafidzah__teacher.webp" width="360" alt="muhafidzah /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/muhafidzah__e-office.webp" width="360" alt="muhafidzah /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/muhafidzah__schedule.webp" width="360" alt="muhafidzah /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/muhafidzah__students.webp" width="360" alt="muhafidzah /students">                      | `/students`           |
| <img src="docs/images/roles/muhafidzah__takhosus.webp" width="360" alt="muhafidzah /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/muhafidzah__muhasabah.webp" width="360" alt="muhafidzah /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/muhafidzah__muhadatsah.webp" width="360" alt="muhafidzah /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/muhafidzah__muhadhoroh.webp" width="360" alt="muhafidzah /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/muhafidzah__violations.webp" width="360" alt="muhafidzah /violations">                  | `/violations`         |
| <img src="docs/images/roles/muhafidzah__dormitories.webp" width="360" alt="muhafidzah /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/muhafidzah__duty-roster.webp" width="360" alt="muhafidzah /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/muhafidzah__daily-report.webp" width="360" alt="muhafidzah /daily-report">              | `/daily-report`       |
| <img src="docs/images/roles/muhafidzah__announcements.webp" width="360" alt="muhafidzah /announcements">            | `/announcements`      |
| <img src="docs/images/roles/muhafidzah__kitab-progress.webp" width="360" alt="muhafidzah /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/muhafidzah__rapor-pesantren.webp" width="360" alt="muhafidzah /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/muhafidzah__quality__complaints.webp" width="360" alt="muhafidzah /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>murabbi</code> — 24 halaman</summary>

| Halaman                                                                                                       | Rute                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/murabbi__meals.webp" width="360" alt="murabbi /meals">                            | `/meals`              |
| <img src="docs/images/roles/murabbi__health.webp" width="360" alt="murabbi /health">                          | `/health`             |
| <img src="docs/images/roles/murabbi__ibadah.webp" width="360" alt="murabbi /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/murabbi__laundry.webp" width="360" alt="murabbi /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/murabbi__musyrif.webp" width="360" alt="murabbi /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/murabbi__permits.webp" width="360" alt="murabbi /permits">                        | `/permits`            |
| <img src="docs/images/roles/murabbi__rewards.webp" width="360" alt="murabbi /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/murabbi__tahfidz.webp" width="360" alt="murabbi /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/murabbi__teacher.webp" width="360" alt="murabbi /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/murabbi__e-office.webp" width="360" alt="murabbi /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/murabbi__schedule.webp" width="360" alt="murabbi /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/murabbi__students.webp" width="360" alt="murabbi /students">                      | `/students`           |
| <img src="docs/images/roles/murabbi__takhosus.webp" width="360" alt="murabbi /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/murabbi__muhasabah.webp" width="360" alt="murabbi /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/murabbi__muhadatsah.webp" width="360" alt="murabbi /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/murabbi__muhadhoroh.webp" width="360" alt="murabbi /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/murabbi__violations.webp" width="360" alt="murabbi /violations">                  | `/violations`         |
| <img src="docs/images/roles/murabbi__dormitories.webp" width="360" alt="murabbi /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/murabbi__duty-roster.webp" width="360" alt="murabbi /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/murabbi__daily-report.webp" width="360" alt="murabbi /daily-report">              | `/daily-report`       |
| <img src="docs/images/roles/murabbi__announcements.webp" width="360" alt="murabbi /announcements">            | `/announcements`      |
| <img src="docs/images/roles/murabbi__kitab-progress.webp" width="360" alt="murabbi /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/murabbi__rapor-pesantren.webp" width="360" alt="murabbi /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/murabbi__quality__complaints.webp" width="360" alt="murabbi /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>musyrif</code> — 24 halaman</summary>

| Halaman                                                                                                       | Rute                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/musyrif__meals.webp" width="360" alt="musyrif /meals">                            | `/meals`              |
| <img src="docs/images/roles/musyrif__health.webp" width="360" alt="musyrif /health">                          | `/health`             |
| <img src="docs/images/roles/musyrif__ibadah.webp" width="360" alt="musyrif /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/musyrif__laundry.webp" width="360" alt="musyrif /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/musyrif__musyrif.webp" width="360" alt="musyrif /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/musyrif__permits.webp" width="360" alt="musyrif /permits">                        | `/permits`            |
| <img src="docs/images/roles/musyrif__rewards.webp" width="360" alt="musyrif /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/musyrif__tahfidz.webp" width="360" alt="musyrif /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/musyrif__teacher.webp" width="360" alt="musyrif /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/musyrif__e-office.webp" width="360" alt="musyrif /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/musyrif__schedule.webp" width="360" alt="musyrif /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/musyrif__students.webp" width="360" alt="musyrif /students">                      | `/students`           |
| <img src="docs/images/roles/musyrif__takhosus.webp" width="360" alt="musyrif /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/musyrif__muhasabah.webp" width="360" alt="musyrif /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/musyrif__muhadatsah.webp" width="360" alt="musyrif /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/musyrif__muhadhoroh.webp" width="360" alt="musyrif /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/musyrif__violations.webp" width="360" alt="musyrif /violations">                  | `/violations`         |
| <img src="docs/images/roles/musyrif__dormitories.webp" width="360" alt="musyrif /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/musyrif__duty-roster.webp" width="360" alt="musyrif /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/musyrif__daily-report.webp" width="360" alt="musyrif /daily-report">              | `/daily-report`       |
| <img src="docs/images/roles/musyrif__announcements.webp" width="360" alt="musyrif /announcements">            | `/announcements`      |
| <img src="docs/images/roles/musyrif__kitab-progress.webp" width="360" alt="musyrif /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/musyrif__rapor-pesantren.webp" width="360" alt="musyrif /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/musyrif__quality__complaints.webp" width="360" alt="musyrif /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>musyrifah</code> — 24 halaman</summary>

| Halaman                                                                                                           | Rute                  |
| ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/musyrifah__meals.webp" width="360" alt="musyrifah /meals">                            | `/meals`              |
| <img src="docs/images/roles/musyrifah__health.webp" width="360" alt="musyrifah /health">                          | `/health`             |
| <img src="docs/images/roles/musyrifah__ibadah.webp" width="360" alt="musyrifah /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/musyrifah__laundry.webp" width="360" alt="musyrifah /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/musyrifah__musyrif.webp" width="360" alt="musyrifah /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/musyrifah__permits.webp" width="360" alt="musyrifah /permits">                        | `/permits`            |
| <img src="docs/images/roles/musyrifah__rewards.webp" width="360" alt="musyrifah /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/musyrifah__tahfidz.webp" width="360" alt="musyrifah /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/musyrifah__teacher.webp" width="360" alt="musyrifah /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/musyrifah__e-office.webp" width="360" alt="musyrifah /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/musyrifah__schedule.webp" width="360" alt="musyrifah /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/musyrifah__students.webp" width="360" alt="musyrifah /students">                      | `/students`           |
| <img src="docs/images/roles/musyrifah__takhosus.webp" width="360" alt="musyrifah /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/musyrifah__muhasabah.webp" width="360" alt="musyrifah /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/musyrifah__muhadatsah.webp" width="360" alt="musyrifah /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/musyrifah__muhadhoroh.webp" width="360" alt="musyrifah /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/musyrifah__violations.webp" width="360" alt="musyrifah /violations">                  | `/violations`         |
| <img src="docs/images/roles/musyrifah__dormitories.webp" width="360" alt="musyrifah /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/musyrifah__duty-roster.webp" width="360" alt="musyrifah /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/musyrifah__daily-report.webp" width="360" alt="musyrifah /daily-report">              | `/daily-report`       |
| <img src="docs/images/roles/musyrifah__announcements.webp" width="360" alt="musyrifah /announcements">            | `/announcements`      |
| <img src="docs/images/roles/musyrifah__kitab-progress.webp" width="360" alt="musyrifah /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/musyrifah__rapor-pesantren.webp" width="360" alt="musyrifah /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/musyrifah__quality__complaints.webp" width="360" alt="musyrifah /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>perawat</code> — 13 halaman</summary>

| Halaman                                                                                                       | Rute                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/perawat__spmb.webp" width="360" alt="perawat /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/perawat__staff.webp" width="360" alt="perawat /staff">                            | `/staff`              |
| <img src="docs/images/roles/perawat__health.webp" width="360" alt="perawat /health">                          | `/health`             |
| <img src="docs/images/roles/perawat__finance.webp" width="360" alt="perawat /finance">                        | `/finance`            |
| <img src="docs/images/roles/perawat__kinerja.webp" width="360" alt="perawat /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/perawat__permits.webp" width="360" alt="perawat /permits">                        | `/permits`            |
| <img src="docs/images/roles/perawat__rewards.webp" width="360" alt="perawat /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/perawat__e-office.webp" width="360" alt="perawat /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/perawat__students.webp" width="360" alt="perawat /students">                      | `/students`           |
| <img src="docs/images/roles/perawat__lingkungan.webp" width="360" alt="perawat /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/perawat__violations.webp" width="360" alt="perawat /violations">                  | `/violations`         |
| <img src="docs/images/roles/perawat__announcements.webp" width="360" alt="perawat /announcements">            | `/announcements`      |
| <img src="docs/images/roles/perawat__quality__complaints.webp" width="360" alt="perawat /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>pesantren-direktur</code> — 26 halaman</summary>

| Halaman                                                                                                                             | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/pesantren-direktur__meals.webp" width="360" alt="pesantren-direktur /meals">                            | `/meals`              |
| <img src="docs/images/roles/pesantren-direktur__health.webp" width="360" alt="pesantren-direktur /health">                          | `/health`             |
| <img src="docs/images/roles/pesantren-direktur__ibadah.webp" width="360" alt="pesantren-direktur /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/pesantren-direktur__canteen.webp" width="360" alt="pesantren-direktur /canteen">                        | `/canteen`            |
| <img src="docs/images/roles/pesantren-direktur__laundry.webp" width="360" alt="pesantren-direktur /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/pesantren-direktur__musyrif.webp" width="360" alt="pesantren-direktur /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/pesantren-direktur__permits.webp" width="360" alt="pesantren-direktur /permits">                        | `/permits`            |
| <img src="docs/images/roles/pesantren-direktur__reports.webp" width="360" alt="pesantren-direktur /reports">                        | `/reports`            |
| <img src="docs/images/roles/pesantren-direktur__rewards.webp" width="360" alt="pesantren-direktur /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/pesantren-direktur__tahfidz.webp" width="360" alt="pesantren-direktur /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/pesantren-direktur__teacher.webp" width="360" alt="pesantren-direktur /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/pesantren-direktur__e-office.webp" width="360" alt="pesantren-direktur /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/pesantren-direktur__students.webp" width="360" alt="pesantren-direktur /students">                      | `/students`           |
| <img src="docs/images/roles/pesantren-direktur__takhosus.webp" width="360" alt="pesantren-direktur /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/pesantren-direktur__analytics.webp" width="360" alt="pesantren-direktur /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/pesantren-direktur__muhasabah.webp" width="360" alt="pesantren-direktur /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/pesantren-direktur__counseling.webp" width="360" alt="pesantren-direktur /counseling">                  | `/counseling`         |
| <img src="docs/images/roles/pesantren-direktur__muhadatsah.webp" width="360" alt="pesantren-direktur /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/pesantren-direktur__muhadhoroh.webp" width="360" alt="pesantren-direktur /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/pesantren-direktur__violations.webp" width="360" alt="pesantren-direktur /violations">                  | `/violations`         |
| <img src="docs/images/roles/pesantren-direktur__dormitories.webp" width="360" alt="pesantren-direktur /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/pesantren-direktur__duty-roster.webp" width="360" alt="pesantren-direktur /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/pesantren-direktur__announcements.webp" width="360" alt="pesantren-direktur /announcements">            | `/announcements`      |
| <img src="docs/images/roles/pesantren-direktur__kitab-progress.webp" width="360" alt="pesantren-direktur /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/pesantren-direktur__rapor-pesantren.webp" width="360" alt="pesantren-direktur /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/pesantren-direktur__quality__complaints.webp" width="360" alt="pesantren-direktur /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>pesantren-pengasuh</code> — 26 halaman</summary>

| Halaman                                                                                                                             | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/pesantren-pengasuh__meals.webp" width="360" alt="pesantren-pengasuh /meals">                            | `/meals`              |
| <img src="docs/images/roles/pesantren-pengasuh__health.webp" width="360" alt="pesantren-pengasuh /health">                          | `/health`             |
| <img src="docs/images/roles/pesantren-pengasuh__ibadah.webp" width="360" alt="pesantren-pengasuh /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/pesantren-pengasuh__canteen.webp" width="360" alt="pesantren-pengasuh /canteen">                        | `/canteen`            |
| <img src="docs/images/roles/pesantren-pengasuh__laundry.webp" width="360" alt="pesantren-pengasuh /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/pesantren-pengasuh__musyrif.webp" width="360" alt="pesantren-pengasuh /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/pesantren-pengasuh__permits.webp" width="360" alt="pesantren-pengasuh /permits">                        | `/permits`            |
| <img src="docs/images/roles/pesantren-pengasuh__reports.webp" width="360" alt="pesantren-pengasuh /reports">                        | `/reports`            |
| <img src="docs/images/roles/pesantren-pengasuh__rewards.webp" width="360" alt="pesantren-pengasuh /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/pesantren-pengasuh__tahfidz.webp" width="360" alt="pesantren-pengasuh /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/pesantren-pengasuh__teacher.webp" width="360" alt="pesantren-pengasuh /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/pesantren-pengasuh__e-office.webp" width="360" alt="pesantren-pengasuh /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/pesantren-pengasuh__students.webp" width="360" alt="pesantren-pengasuh /students">                      | `/students`           |
| <img src="docs/images/roles/pesantren-pengasuh__takhosus.webp" width="360" alt="pesantren-pengasuh /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/pesantren-pengasuh__analytics.webp" width="360" alt="pesantren-pengasuh /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/pesantren-pengasuh__muhasabah.webp" width="360" alt="pesantren-pengasuh /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/pesantren-pengasuh__counseling.webp" width="360" alt="pesantren-pengasuh /counseling">                  | `/counseling`         |
| <img src="docs/images/roles/pesantren-pengasuh__muhadatsah.webp" width="360" alt="pesantren-pengasuh /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/pesantren-pengasuh__muhadhoroh.webp" width="360" alt="pesantren-pengasuh /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/pesantren-pengasuh__violations.webp" width="360" alt="pesantren-pengasuh /violations">                  | `/violations`         |
| <img src="docs/images/roles/pesantren-pengasuh__dormitories.webp" width="360" alt="pesantren-pengasuh /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/pesantren-pengasuh__duty-roster.webp" width="360" alt="pesantren-pengasuh /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/pesantren-pengasuh__announcements.webp" width="360" alt="pesantren-pengasuh /announcements">            | `/announcements`      |
| <img src="docs/images/roles/pesantren-pengasuh__kitab-progress.webp" width="360" alt="pesantren-pengasuh /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/pesantren-pengasuh__rapor-pesantren.webp" width="360" alt="pesantren-pengasuh /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/pesantren-pengasuh__quality__complaints.webp" width="360" alt="pesantren-pengasuh /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>pesantren-tata-usaha</code> — 13 halaman</summary>

| Halaman                                                                                                                                 | Rute                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/pesantren-tata-usaha__spmb.webp" width="360" alt="pesantren-tata-usaha /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/pesantren-tata-usaha__staff.webp" width="360" alt="pesantren-tata-usaha /staff">                            | `/staff`              |
| <img src="docs/images/roles/pesantren-tata-usaha__health.webp" width="360" alt="pesantren-tata-usaha /health">                          | `/health`             |
| <img src="docs/images/roles/pesantren-tata-usaha__finance.webp" width="360" alt="pesantren-tata-usaha /finance">                        | `/finance`            |
| <img src="docs/images/roles/pesantren-tata-usaha__kinerja.webp" width="360" alt="pesantren-tata-usaha /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/pesantren-tata-usaha__permits.webp" width="360" alt="pesantren-tata-usaha /permits">                        | `/permits`            |
| <img src="docs/images/roles/pesantren-tata-usaha__rewards.webp" width="360" alt="pesantren-tata-usaha /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/pesantren-tata-usaha__e-office.webp" width="360" alt="pesantren-tata-usaha /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/pesantren-tata-usaha__students.webp" width="360" alt="pesantren-tata-usaha /students">                      | `/students`           |
| <img src="docs/images/roles/pesantren-tata-usaha__lingkungan.webp" width="360" alt="pesantren-tata-usaha /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/pesantren-tata-usaha__violations.webp" width="360" alt="pesantren-tata-usaha /violations">                  | `/violations`         |
| <img src="docs/images/roles/pesantren-tata-usaha__announcements.webp" width="360" alt="pesantren-tata-usaha /announcements">            | `/announcements`      |
| <img src="docs/images/roles/pesantren-tata-usaha__quality__complaints.webp" width="360" alt="pesantren-tata-usaha /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>pustakawan</code> — 13 halaman</summary>

| Halaman                                                                                                             | Rute                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/pustakawan__spmb.webp" width="360" alt="pustakawan /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/pustakawan__staff.webp" width="360" alt="pustakawan /staff">                            | `/staff`              |
| <img src="docs/images/roles/pustakawan__health.webp" width="360" alt="pustakawan /health">                          | `/health`             |
| <img src="docs/images/roles/pustakawan__finance.webp" width="360" alt="pustakawan /finance">                        | `/finance`            |
| <img src="docs/images/roles/pustakawan__kinerja.webp" width="360" alt="pustakawan /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/pustakawan__permits.webp" width="360" alt="pustakawan /permits">                        | `/permits`            |
| <img src="docs/images/roles/pustakawan__rewards.webp" width="360" alt="pustakawan /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/pustakawan__e-office.webp" width="360" alt="pustakawan /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/pustakawan__students.webp" width="360" alt="pustakawan /students">                      | `/students`           |
| <img src="docs/images/roles/pustakawan__lingkungan.webp" width="360" alt="pustakawan /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/pustakawan__violations.webp" width="360" alt="pustakawan /violations">                  | `/violations`         |
| <img src="docs/images/roles/pustakawan__announcements.webp" width="360" alt="pustakawan /announcements">            | `/announcements`      |
| <img src="docs/images/roles/pustakawan__quality__complaints.webp" width="360" alt="pustakawan /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>sdit-admin</code> — 40 halaman</summary>

| Halaman                                                                                                             | Rute                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/sdit-admin__hr.webp" width="360" alt="sdit-admin /hr">                                  | `/hr`                 |
| <img src="docs/images/roles/sdit-admin__tk.webp" width="360" alt="sdit-admin /tk">                                  | `/tk`                 |
| <img src="docs/images/roles/sdit-admin__emis.webp" width="360" alt="sdit-admin /emis">                              | `/emis`               |
| <img src="docs/images/roles/sdit-admin__spmb.webp" width="360" alt="sdit-admin /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/sdit-admin__users.webp" width="360" alt="sdit-admin /users">                            | `/users`              |
| <img src="docs/images/roles/sdit-admin__alumni.webp" width="360" alt="sdit-admin /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/sdit-admin__health.webp" width="360" alt="sdit-admin /health">                          | `/health`             |
| <img src="docs/images/roles/sdit-admin__ibadah.webp" width="360" alt="sdit-admin /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/sdit-admin__classes.webp" width="360" alt="sdit-admin /classes">                        | `/classes`            |
| <img src="docs/images/roles/sdit-admin__finance.webp" width="360" alt="sdit-admin /finance">                        | `/finance`            |
| <img src="docs/images/roles/sdit-admin__kinerja.webp" width="360" alt="sdit-admin /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/sdit-admin__library.webp" width="360" alt="sdit-admin /library">                        | `/library`            |
| <img src="docs/images/roles/sdit-admin__payroll.webp" width="360" alt="sdit-admin /payroll">                        | `/payroll`            |
| <img src="docs/images/roles/sdit-admin__project.webp" width="360" alt="sdit-admin /project">                        | `/project`            |
| <img src="docs/images/roles/sdit-admin__quality.webp" width="360" alt="sdit-admin /quality">                        | `/quality`            |
| <img src="docs/images/roles/sdit-admin__reports.webp" width="360" alt="sdit-admin /reports">                        | `/reports`            |
| <img src="docs/images/roles/sdit-admin__tahfidz.webp" width="360" alt="sdit-admin /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/sdit-admin__talenta.webp" width="360" alt="sdit-admin /talenta">                        | `/talenta`            |
| <img src="docs/images/roles/sdit-admin__donation.webp" width="360" alt="sdit-admin /donation">                      | `/donation`           |
| <img src="docs/images/roles/sdit-admin__e-office.webp" width="360" alt="sdit-admin /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/sdit-admin__settings.webp" width="360" alt="sdit-admin /settings">                      | `/settings`           |
| <img src="docs/images/roles/sdit-admin__students.webp" width="360" alt="sdit-admin /students">                      | `/students`           |
| <img src="docs/images/roles/sdit-admin__analytics.webp" width="360" alt="sdit-admin /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/sdit-admin__dashboard.webp" width="360" alt="sdit-admin /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/sdit-admin__marketing.webp" width="360" alt="sdit-admin /marketing">                    | `/marketing`          |
| <img src="docs/images/roles/sdit-admin__reception.webp" width="360" alt="sdit-admin /reception">                    | `/reception`          |
| <img src="docs/images/roles/sdit-admin__assessment.webp" width="360" alt="sdit-admin /assessment">                  | `/assessment`         |
| <img src="docs/images/roles/sdit-admin__attendance.webp" width="360" alt="sdit-admin /attendance">                  | `/attendance`         |
| <img src="docs/images/roles/sdit-admin__counseling.webp" width="360" alt="sdit-admin /counseling">                  | `/counseling`         |
| <img src="docs/images/roles/sdit-admin__facilities.webp" width="360" alt="sdit-admin /facilities">                  | `/facilities`         |
| <img src="docs/images/roles/sdit-admin__muhadhoroh.webp" width="360" alt="sdit-admin /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/sdit-admin__unit-usaha.webp" width="360" alt="sdit-admin /unit-usaha">                  | `/unit-usaha`         |
| <img src="docs/images/roles/sdit-admin__dormitories.webp" width="360" alt="sdit-admin /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/sdit-admin__perencanaan.webp" width="360" alt="sdit-admin /perencanaan">                | `/perencanaan`        |
| <img src="docs/images/roles/sdit-admin__procurement.webp" width="360" alt="sdit-admin /procurement">                | `/procurement`        |
| <img src="docs/images/roles/sdit-admin__grc-dashboard.webp" width="360" alt="sdit-admin /grc-dashboard">            | `/grc-dashboard`      |
| <img src="docs/images/roles/sdit-admin__notifications.webp" width="360" alt="sdit-admin /notifications">            | `/notifications`      |
| <img src="docs/images/roles/sdit-admin__kitab-progress.webp" width="360" alt="sdit-admin /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/sdit-admin__extracurricular.webp" width="360" alt="sdit-admin /extracurricular">        | `/extracurricular`    |
| <img src="docs/images/roles/sdit-admin__finance__accounting.webp" width="360" alt="sdit-admin /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>sdit-bendahara</code> — 13 halaman</summary>

| Halaman                                                                                                                     | Rute                  |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/sdit-bendahara__spmb.webp" width="360" alt="sdit-bendahara /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/sdit-bendahara__staff.webp" width="360" alt="sdit-bendahara /staff">                            | `/staff`              |
| <img src="docs/images/roles/sdit-bendahara__health.webp" width="360" alt="sdit-bendahara /health">                          | `/health`             |
| <img src="docs/images/roles/sdit-bendahara__finance.webp" width="360" alt="sdit-bendahara /finance">                        | `/finance`            |
| <img src="docs/images/roles/sdit-bendahara__kinerja.webp" width="360" alt="sdit-bendahara /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/sdit-bendahara__permits.webp" width="360" alt="sdit-bendahara /permits">                        | `/permits`            |
| <img src="docs/images/roles/sdit-bendahara__rewards.webp" width="360" alt="sdit-bendahara /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/sdit-bendahara__e-office.webp" width="360" alt="sdit-bendahara /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/sdit-bendahara__students.webp" width="360" alt="sdit-bendahara /students">                      | `/students`           |
| <img src="docs/images/roles/sdit-bendahara__lingkungan.webp" width="360" alt="sdit-bendahara /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/sdit-bendahara__violations.webp" width="360" alt="sdit-bendahara /violations">                  | `/violations`         |
| <img src="docs/images/roles/sdit-bendahara__announcements.webp" width="360" alt="sdit-bendahara /announcements">            | `/announcements`      |
| <img src="docs/images/roles/sdit-bendahara__quality__complaints.webp" width="360" alt="sdit-bendahara /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>sdit-guru</code> — 19 halaman</summary>

| Halaman                                                                                                             | Rute                   |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/sdit-guru__ibadah.webp" width="360" alt="sdit-guru /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/sdit-guru__classes.webp" width="360" alt="sdit-guru /classes">                          | `/classes`             |
| <img src="docs/images/roles/sdit-guru__kinerja.webp" width="360" alt="sdit-guru /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/sdit-guru__tahfidz.webp" width="360" alt="sdit-guru /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/sdit-guru__teacher.webp" width="360" alt="sdit-guru /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/sdit-guru__e-office.webp" width="360" alt="sdit-guru /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/sdit-guru__homeroom.webp" width="360" alt="sdit-guru /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/sdit-guru__students.webp" width="360" alt="sdit-guru /students">                        | `/students`            |
| <img src="docs/images/roles/sdit-guru__portfolio.webp" width="360" alt="sdit-guru /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/sdit-guru__attendance.webp" width="360" alt="sdit-guru /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/sdit-guru__muhadatsah.webp" width="360" alt="sdit-guru /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/sdit-guru__muhadhoroh.webp" width="360" alt="sdit-guru /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/sdit-guru__daily-report.webp" width="360" alt="sdit-guru /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/sdit-guru__announcements.webp" width="360" alt="sdit-guru /announcements">              | `/announcements`       |
| <img src="docs/images/roles/sdit-guru__kitab-progress.webp" width="360" alt="sdit-guru /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/sdit-guru__homeroom__behavior.webp" width="360" alt="sdit-guru /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/sdit-guru__homeroom__messages.webp" width="360" alt="sdit-guru /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/sdit-guru__quality__complaints.webp" width="360" alt="sdit-guru /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/sdit-guru__homeroom__attendance.webp" width="360" alt="sdit-guru /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>sdit-kepala-sekolah</code> — 19 halaman</summary>

| Halaman                                                                                                                    | Rute             |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| <img src="docs/images/roles/sdit-kepala-sekolah__hr.webp" width="360" alt="sdit-kepala-sekolah /hr">                       | `/hr`            |
| <img src="docs/images/roles/sdit-kepala-sekolah__users.webp" width="360" alt="sdit-kepala-sekolah /users">                 | `/users`         |
| <img src="docs/images/roles/sdit-kepala-sekolah__classes.webp" width="360" alt="sdit-kepala-sekolah /classes">             | `/classes`       |
| <img src="docs/images/roles/sdit-kepala-sekolah__kinerja.webp" width="360" alt="sdit-kepala-sekolah /kinerja">             | `/kinerja`       |
| <img src="docs/images/roles/sdit-kepala-sekolah__permits.webp" width="360" alt="sdit-kepala-sekolah /permits">             | `/permits`       |
| <img src="docs/images/roles/sdit-kepala-sekolah__reports.webp" width="360" alt="sdit-kepala-sekolah /reports">             | `/reports`       |
| <img src="docs/images/roles/sdit-kepala-sekolah__rewards.webp" width="360" alt="sdit-kepala-sekolah /rewards">             | `/rewards`       |
| <img src="docs/images/roles/sdit-kepala-sekolah__tahfidz.webp" width="360" alt="sdit-kepala-sekolah /tahfidz">             | `/tahfidz`       |
| <img src="docs/images/roles/sdit-kepala-sekolah__e-office.webp" width="360" alt="sdit-kepala-sekolah /e-office">           | `/e-office`      |
| <img src="docs/images/roles/sdit-kepala-sekolah__settings.webp" width="360" alt="sdit-kepala-sekolah /settings">           | `/settings`      |
| <img src="docs/images/roles/sdit-kepala-sekolah__students.webp" width="360" alt="sdit-kepala-sekolah /students">           | `/students`      |
| <img src="docs/images/roles/sdit-kepala-sekolah__analytics.webp" width="360" alt="sdit-kepala-sekolah /analytics">         | `/analytics`     |
| <img src="docs/images/roles/sdit-kepala-sekolah__dashboard.webp" width="360" alt="sdit-kepala-sekolah /dashboard">         | `/dashboard`     |
| <img src="docs/images/roles/sdit-kepala-sekolah__admissions.webp" width="360" alt="sdit-kepala-sekolah /admissions">       | `/admissions`    |
| <img src="docs/images/roles/sdit-kepala-sekolah__assessment.webp" width="360" alt="sdit-kepala-sekolah /assessment">       | `/assessment`    |
| <img src="docs/images/roles/sdit-kepala-sekolah__attendance.webp" width="360" alt="sdit-kepala-sekolah /attendance">       | `/attendance`    |
| <img src="docs/images/roles/sdit-kepala-sekolah__violations.webp" width="360" alt="sdit-kepala-sekolah /violations">       | `/violations`    |
| <img src="docs/images/roles/sdit-kepala-sekolah__announcements.webp" width="360" alt="sdit-kepala-sekolah /announcements"> | `/announcements` |
| <img src="docs/images/roles/sdit-kepala-sekolah__notifications.webp" width="360" alt="sdit-kepala-sekolah /notifications"> | `/notifications` |

</details>

<details>
<summary><code>sdit-komite</code> — 10 halaman</summary>

| Halaman                                                                                                               | Rute                  |
| --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/sdit-komite__finance.webp" width="360" alt="sdit-komite /finance">                        | `/finance`            |
| <img src="docs/images/roles/sdit-komite__quality.webp" width="360" alt="sdit-komite /quality">                        | `/quality`            |
| <img src="docs/images/roles/sdit-komite__reports.webp" width="360" alt="sdit-komite /reports">                        | `/reports`            |
| <img src="docs/images/roles/sdit-komite__rewards.webp" width="360" alt="sdit-komite /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/sdit-komite__donation.webp" width="360" alt="sdit-komite /donation">                      | `/donation`           |
| <img src="docs/images/roles/sdit-komite__schedule.webp" width="360" alt="sdit-komite /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/sdit-komite__students.webp" width="360" alt="sdit-komite /students">                      | `/students`           |
| <img src="docs/images/roles/sdit-komite__analytics.webp" width="360" alt="sdit-komite /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/sdit-komite__announcements.webp" width="360" alt="sdit-komite /announcements">            | `/announcements`      |
| <img src="docs/images/roles/sdit-komite__quality__complaints.webp" width="360" alt="sdit-komite /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>sdit-orang-tua</code> — 16 halaman</summary>

| Halaman                                                                                                                                                  | Rute                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| <img src="docs/images/roles/sdit-orang-tua__parent.webp" width="360" alt="sdit-orang-tua /parent">                                                       | `/parent`                           |
| <img src="docs/images/roles/sdit-orang-tua__parent__health.webp" width="360" alt="sdit-orang-tua /parent/health">                                        | `/parent/health`                    |
| <img src="docs/images/roles/sdit-orang-tua__parent__ibadah.webp" width="360" alt="sdit-orang-tua /parent/ibadah">                                        | `/parent/ibadah`                    |
| <img src="docs/images/roles/sdit-orang-tua__parent__finance.webp" width="360" alt="sdit-orang-tua /parent/finance">                                      | `/parent/finance`                   |
| <img src="docs/images/roles/sdit-orang-tua__parent__permits.webp" width="360" alt="sdit-orang-tua /parent/permits">                                      | `/parent/permits`                   |
| <img src="docs/images/roles/sdit-orang-tua__parent__rewards.webp" width="360" alt="sdit-orang-tua /parent/rewards">                                      | `/parent/rewards`                   |
| <img src="docs/images/roles/sdit-orang-tua__parent__children.webp" width="360" alt="sdit-orang-tua /parent/children">                                    | `/parent/children`                  |
| <img src="docs/images/roles/sdit-orang-tua__parent__messages.webp" width="360" alt="sdit-orang-tua /parent/messages">                                    | `/parent/messages`                  |
| <img src="docs/images/roles/sdit-orang-tua__parent__counseling.webp" width="360" alt="sdit-orang-tua /parent/counseling">                                | `/parent/counseling`                |
| <img src="docs/images/roles/sdit-orang-tua__parent__violations.webp" width="360" alt="sdit-orang-tua /parent/violations">                                | `/parent/violations`                |
| <img src="docs/images/roles/sdit-orang-tua__quality__complaints.webp" width="360" alt="sdit-orang-tua /quality/complaints">                              | `/quality/complaints`               |
| <img src="docs/images/roles/sdit-orang-tua__parent__daily-report.webp" width="360" alt="sdit-orang-tua /parent/daily-report">                            | `/parent/daily-report`              |
| <img src="docs/images/roles/sdit-orang-tua__parent__report-cards.webp" width="360" alt="sdit-orang-tua /parent/report-cards">                            | `/parent/report-cards`              |
| <img src="docs/images/roles/sdit-orang-tua__parent__announcements.webp" width="360" alt="sdit-orang-tua /parent/announcements">                          | `/parent/announcements`             |
| <img src="docs/images/roles/sdit-orang-tua__parent__buku-penghubung.webp" width="360" alt="sdit-orang-tua /parent/buku-penghubung">                      | `/parent/buku-penghubung`           |
| <img src="docs/images/roles/sdit-orang-tua__parent__notifications__preferences.webp" width="360" alt="sdit-orang-tua /parent/notifications/preferences"> | `/parent/notifications/preferences` |

</details>

<details>
<summary><code>sdit-siswa</code> — 13 halaman</summary>

| Halaman                                                                                                                 | Rute                    |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| <img src="docs/images/roles/sdit-siswa__ibadah.webp" width="360" alt="sdit-siswa /ibadah">                              | `/ibadah`               |
| <img src="docs/images/roles/sdit-siswa__student.webp" width="360" alt="sdit-siswa /student">                            | `/student`              |
| <img src="docs/images/roles/sdit-siswa__tahfidz.webp" width="360" alt="sdit-siswa /tahfidz">                            | `/tahfidz`              |
| <img src="docs/images/roles/sdit-siswa__schedule.webp" width="360" alt="sdit-siswa /schedule">                          | `/schedule`             |
| <img src="docs/images/roles/sdit-siswa__muhasabah.webp" width="360" alt="sdit-siswa /muhasabah">                        | `/muhasabah`            |
| <img src="docs/images/roles/sdit-siswa__portfolio.webp" width="360" alt="sdit-siswa /portfolio">                        | `/portfolio`            |
| <img src="docs/images/roles/sdit-siswa__muhadatsah.webp" width="360" alt="sdit-siswa /muhadatsah">                      | `/muhadatsah`           |
| <img src="docs/images/roles/sdit-siswa__muhadhoroh.webp" width="360" alt="sdit-siswa /muhadhoroh">                      | `/muhadhoroh`           |
| <img src="docs/images/roles/sdit-siswa__announcements.webp" width="360" alt="sdit-siswa /announcements">                | `/announcements`        |
| <img src="docs/images/roles/sdit-siswa__student__exams.webp" width="360" alt="sdit-siswa /student/exams">               | `/student/exams`        |
| <img src="docs/images/roles/sdit-siswa__kitab-progress.webp" width="360" alt="sdit-siswa /kitab-progress">              | `/kitab-progress`       |
| <img src="docs/images/roles/sdit-siswa__quality__complaints.webp" width="360" alt="sdit-siswa /quality/complaints">     | `/quality/complaints`   |
| <img src="docs/images/roles/sdit-siswa__student__achievements.webp" width="360" alt="sdit-siswa /student/achievements"> | `/student/achievements` |

</details>

<details>
<summary><code>sdit-tata-usaha</code> — 13 halaman</summary>

| Halaman                                                                                                                       | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/sdit-tata-usaha__spmb.webp" width="360" alt="sdit-tata-usaha /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/sdit-tata-usaha__staff.webp" width="360" alt="sdit-tata-usaha /staff">                            | `/staff`              |
| <img src="docs/images/roles/sdit-tata-usaha__health.webp" width="360" alt="sdit-tata-usaha /health">                          | `/health`             |
| <img src="docs/images/roles/sdit-tata-usaha__finance.webp" width="360" alt="sdit-tata-usaha /finance">                        | `/finance`            |
| <img src="docs/images/roles/sdit-tata-usaha__kinerja.webp" width="360" alt="sdit-tata-usaha /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/sdit-tata-usaha__permits.webp" width="360" alt="sdit-tata-usaha /permits">                        | `/permits`            |
| <img src="docs/images/roles/sdit-tata-usaha__rewards.webp" width="360" alt="sdit-tata-usaha /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/sdit-tata-usaha__e-office.webp" width="360" alt="sdit-tata-usaha /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/sdit-tata-usaha__students.webp" width="360" alt="sdit-tata-usaha /students">                      | `/students`           |
| <img src="docs/images/roles/sdit-tata-usaha__lingkungan.webp" width="360" alt="sdit-tata-usaha /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/sdit-tata-usaha__violations.webp" width="360" alt="sdit-tata-usaha /violations">                  | `/violations`         |
| <img src="docs/images/roles/sdit-tata-usaha__announcements.webp" width="360" alt="sdit-tata-usaha /announcements">            | `/announcements`      |
| <img src="docs/images/roles/sdit-tata-usaha__quality__complaints.webp" width="360" alt="sdit-tata-usaha /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>sdit-wakasek</code> — 19 halaman</summary>

| Halaman                                                                                                                   | Rute                   |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/sdit-wakasek__ibadah.webp" width="360" alt="sdit-wakasek /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/sdit-wakasek__classes.webp" width="360" alt="sdit-wakasek /classes">                          | `/classes`             |
| <img src="docs/images/roles/sdit-wakasek__kinerja.webp" width="360" alt="sdit-wakasek /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/sdit-wakasek__tahfidz.webp" width="360" alt="sdit-wakasek /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/sdit-wakasek__teacher.webp" width="360" alt="sdit-wakasek /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/sdit-wakasek__e-office.webp" width="360" alt="sdit-wakasek /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/sdit-wakasek__homeroom.webp" width="360" alt="sdit-wakasek /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/sdit-wakasek__students.webp" width="360" alt="sdit-wakasek /students">                        | `/students`            |
| <img src="docs/images/roles/sdit-wakasek__portfolio.webp" width="360" alt="sdit-wakasek /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/sdit-wakasek__attendance.webp" width="360" alt="sdit-wakasek /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/sdit-wakasek__muhadatsah.webp" width="360" alt="sdit-wakasek /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/sdit-wakasek__muhadhoroh.webp" width="360" alt="sdit-wakasek /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/sdit-wakasek__daily-report.webp" width="360" alt="sdit-wakasek /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/sdit-wakasek__announcements.webp" width="360" alt="sdit-wakasek /announcements">              | `/announcements`       |
| <img src="docs/images/roles/sdit-wakasek__kitab-progress.webp" width="360" alt="sdit-wakasek /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/sdit-wakasek__homeroom__behavior.webp" width="360" alt="sdit-wakasek /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/sdit-wakasek__homeroom__messages.webp" width="360" alt="sdit-wakasek /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/sdit-wakasek__quality__complaints.webp" width="360" alt="sdit-wakasek /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/sdit-wakasek__homeroom__attendance.webp" width="360" alt="sdit-wakasek /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>sdit-wali-kelas</code> — 19 halaman</summary>

| Halaman                                                                                                                         | Rute                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/sdit-wali-kelas__ibadah.webp" width="360" alt="sdit-wali-kelas /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/sdit-wali-kelas__classes.webp" width="360" alt="sdit-wali-kelas /classes">                          | `/classes`             |
| <img src="docs/images/roles/sdit-wali-kelas__kinerja.webp" width="360" alt="sdit-wali-kelas /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/sdit-wali-kelas__tahfidz.webp" width="360" alt="sdit-wali-kelas /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/sdit-wali-kelas__teacher.webp" width="360" alt="sdit-wali-kelas /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/sdit-wali-kelas__e-office.webp" width="360" alt="sdit-wali-kelas /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/sdit-wali-kelas__homeroom.webp" width="360" alt="sdit-wali-kelas /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/sdit-wali-kelas__students.webp" width="360" alt="sdit-wali-kelas /students">                        | `/students`            |
| <img src="docs/images/roles/sdit-wali-kelas__portfolio.webp" width="360" alt="sdit-wali-kelas /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/sdit-wali-kelas__attendance.webp" width="360" alt="sdit-wali-kelas /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/sdit-wali-kelas__muhadatsah.webp" width="360" alt="sdit-wali-kelas /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/sdit-wali-kelas__muhadhoroh.webp" width="360" alt="sdit-wali-kelas /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/sdit-wali-kelas__daily-report.webp" width="360" alt="sdit-wali-kelas /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/sdit-wali-kelas__announcements.webp" width="360" alt="sdit-wali-kelas /announcements">              | `/announcements`       |
| <img src="docs/images/roles/sdit-wali-kelas__kitab-progress.webp" width="360" alt="sdit-wali-kelas /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/sdit-wali-kelas__homeroom__behavior.webp" width="360" alt="sdit-wali-kelas /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/sdit-wali-kelas__homeroom__messages.webp" width="360" alt="sdit-wali-kelas /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/sdit-wali-kelas__quality__complaints.webp" width="360" alt="sdit-wali-kelas /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/sdit-wali-kelas__homeroom__attendance.webp" width="360" alt="sdit-wali-kelas /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smaq-admin</code> — 40 halaman</summary>

| Halaman                                                                                                             | Rute                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smaq-admin__hr.webp" width="360" alt="smaq-admin /hr">                                  | `/hr`                 |
| <img src="docs/images/roles/smaq-admin__tk.webp" width="360" alt="smaq-admin /tk">                                  | `/tk`                 |
| <img src="docs/images/roles/smaq-admin__emis.webp" width="360" alt="smaq-admin /emis">                              | `/emis`               |
| <img src="docs/images/roles/smaq-admin__spmb.webp" width="360" alt="smaq-admin /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/smaq-admin__users.webp" width="360" alt="smaq-admin /users">                            | `/users`              |
| <img src="docs/images/roles/smaq-admin__alumni.webp" width="360" alt="smaq-admin /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/smaq-admin__health.webp" width="360" alt="smaq-admin /health">                          | `/health`             |
| <img src="docs/images/roles/smaq-admin__ibadah.webp" width="360" alt="smaq-admin /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/smaq-admin__classes.webp" width="360" alt="smaq-admin /classes">                        | `/classes`            |
| <img src="docs/images/roles/smaq-admin__finance.webp" width="360" alt="smaq-admin /finance">                        | `/finance`            |
| <img src="docs/images/roles/smaq-admin__kinerja.webp" width="360" alt="smaq-admin /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/smaq-admin__library.webp" width="360" alt="smaq-admin /library">                        | `/library`            |
| <img src="docs/images/roles/smaq-admin__payroll.webp" width="360" alt="smaq-admin /payroll">                        | `/payroll`            |
| <img src="docs/images/roles/smaq-admin__project.webp" width="360" alt="smaq-admin /project">                        | `/project`            |
| <img src="docs/images/roles/smaq-admin__quality.webp" width="360" alt="smaq-admin /quality">                        | `/quality`            |
| <img src="docs/images/roles/smaq-admin__reports.webp" width="360" alt="smaq-admin /reports">                        | `/reports`            |
| <img src="docs/images/roles/smaq-admin__tahfidz.webp" width="360" alt="smaq-admin /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/smaq-admin__talenta.webp" width="360" alt="smaq-admin /talenta">                        | `/talenta`            |
| <img src="docs/images/roles/smaq-admin__donation.webp" width="360" alt="smaq-admin /donation">                      | `/donation`           |
| <img src="docs/images/roles/smaq-admin__e-office.webp" width="360" alt="smaq-admin /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/smaq-admin__settings.webp" width="360" alt="smaq-admin /settings">                      | `/settings`           |
| <img src="docs/images/roles/smaq-admin__students.webp" width="360" alt="smaq-admin /students">                      | `/students`           |
| <img src="docs/images/roles/smaq-admin__analytics.webp" width="360" alt="smaq-admin /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/smaq-admin__dashboard.webp" width="360" alt="smaq-admin /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/smaq-admin__marketing.webp" width="360" alt="smaq-admin /marketing">                    | `/marketing`          |
| <img src="docs/images/roles/smaq-admin__reception.webp" width="360" alt="smaq-admin /reception">                    | `/reception`          |
| <img src="docs/images/roles/smaq-admin__assessment.webp" width="360" alt="smaq-admin /assessment">                  | `/assessment`         |
| <img src="docs/images/roles/smaq-admin__attendance.webp" width="360" alt="smaq-admin /attendance">                  | `/attendance`         |
| <img src="docs/images/roles/smaq-admin__counseling.webp" width="360" alt="smaq-admin /counseling">                  | `/counseling`         |
| <img src="docs/images/roles/smaq-admin__facilities.webp" width="360" alt="smaq-admin /facilities">                  | `/facilities`         |
| <img src="docs/images/roles/smaq-admin__muhadhoroh.webp" width="360" alt="smaq-admin /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/smaq-admin__unit-usaha.webp" width="360" alt="smaq-admin /unit-usaha">                  | `/unit-usaha`         |
| <img src="docs/images/roles/smaq-admin__dormitories.webp" width="360" alt="smaq-admin /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/smaq-admin__perencanaan.webp" width="360" alt="smaq-admin /perencanaan">                | `/perencanaan`        |
| <img src="docs/images/roles/smaq-admin__procurement.webp" width="360" alt="smaq-admin /procurement">                | `/procurement`        |
| <img src="docs/images/roles/smaq-admin__grc-dashboard.webp" width="360" alt="smaq-admin /grc-dashboard">            | `/grc-dashboard`      |
| <img src="docs/images/roles/smaq-admin__notifications.webp" width="360" alt="smaq-admin /notifications">            | `/notifications`      |
| <img src="docs/images/roles/smaq-admin__kitab-progress.webp" width="360" alt="smaq-admin /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/smaq-admin__extracurricular.webp" width="360" alt="smaq-admin /extracurricular">        | `/extracurricular`    |
| <img src="docs/images/roles/smaq-admin__finance__accounting.webp" width="360" alt="smaq-admin /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>smaq-alumni</code> — 8 halaman</summary>

| Halaman                                                                                                               | Rute                  |
| --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smaq-alumni__alumni.webp" width="360" alt="smaq-alumni /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/smaq-alumni__donation.webp" width="360" alt="smaq-alumni /donation">                      | `/donation`           |
| <img src="docs/images/roles/smaq-alumni__portfolio.webp" width="360" alt="smaq-alumni /portfolio">                    | `/portfolio`          |
| <img src="docs/images/roles/smaq-alumni__alumni__sanad.webp" width="360" alt="smaq-alumni /alumni/sanad">             | `/alumni/sanad`       |
| <img src="docs/images/roles/smaq-alumni__certificates.webp" width="360" alt="smaq-alumni /certificates">              | `/certificates`       |
| <img src="docs/images/roles/smaq-alumni__announcements.webp" width="360" alt="smaq-alumni /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smaq-alumni__alumni__placement.webp" width="360" alt="smaq-alumni /alumni/placement">     | `/alumni/placement`   |
| <img src="docs/images/roles/smaq-alumni__quality__complaints.webp" width="360" alt="smaq-alumni /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smaq-bendahara</code> — 13 halaman</summary>

| Halaman                                                                                                                     | Rute                  |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smaq-bendahara__spmb.webp" width="360" alt="smaq-bendahara /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/smaq-bendahara__staff.webp" width="360" alt="smaq-bendahara /staff">                            | `/staff`              |
| <img src="docs/images/roles/smaq-bendahara__health.webp" width="360" alt="smaq-bendahara /health">                          | `/health`             |
| <img src="docs/images/roles/smaq-bendahara__finance.webp" width="360" alt="smaq-bendahara /finance">                        | `/finance`            |
| <img src="docs/images/roles/smaq-bendahara__kinerja.webp" width="360" alt="smaq-bendahara /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/smaq-bendahara__permits.webp" width="360" alt="smaq-bendahara /permits">                        | `/permits`            |
| <img src="docs/images/roles/smaq-bendahara__rewards.webp" width="360" alt="smaq-bendahara /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/smaq-bendahara__e-office.webp" width="360" alt="smaq-bendahara /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/smaq-bendahara__students.webp" width="360" alt="smaq-bendahara /students">                      | `/students`           |
| <img src="docs/images/roles/smaq-bendahara__lingkungan.webp" width="360" alt="smaq-bendahara /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/smaq-bendahara__violations.webp" width="360" alt="smaq-bendahara /violations">                  | `/violations`         |
| <img src="docs/images/roles/smaq-bendahara__announcements.webp" width="360" alt="smaq-bendahara /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smaq-bendahara__quality__complaints.webp" width="360" alt="smaq-bendahara /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smaq-guru</code> — 19 halaman</summary>

| Halaman                                                                                                             | Rute                   |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smaq-guru__ibadah.webp" width="360" alt="smaq-guru /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smaq-guru__classes.webp" width="360" alt="smaq-guru /classes">                          | `/classes`             |
| <img src="docs/images/roles/smaq-guru__kinerja.webp" width="360" alt="smaq-guru /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smaq-guru__tahfidz.webp" width="360" alt="smaq-guru /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smaq-guru__teacher.webp" width="360" alt="smaq-guru /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smaq-guru__e-office.webp" width="360" alt="smaq-guru /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smaq-guru__homeroom.webp" width="360" alt="smaq-guru /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smaq-guru__students.webp" width="360" alt="smaq-guru /students">                        | `/students`            |
| <img src="docs/images/roles/smaq-guru__portfolio.webp" width="360" alt="smaq-guru /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smaq-guru__attendance.webp" width="360" alt="smaq-guru /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smaq-guru__muhadatsah.webp" width="360" alt="smaq-guru /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smaq-guru__muhadhoroh.webp" width="360" alt="smaq-guru /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smaq-guru__daily-report.webp" width="360" alt="smaq-guru /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smaq-guru__announcements.webp" width="360" alt="smaq-guru /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smaq-guru__kitab-progress.webp" width="360" alt="smaq-guru /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smaq-guru__homeroom__behavior.webp" width="360" alt="smaq-guru /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smaq-guru__homeroom__messages.webp" width="360" alt="smaq-guru /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smaq-guru__quality__complaints.webp" width="360" alt="smaq-guru /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smaq-guru__homeroom__attendance.webp" width="360" alt="smaq-guru /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smaq-guru-bk</code> — 19 halaman</summary>

| Halaman                                                                                                                   | Rute                   |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smaq-guru-bk__ibadah.webp" width="360" alt="smaq-guru-bk /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smaq-guru-bk__classes.webp" width="360" alt="smaq-guru-bk /classes">                          | `/classes`             |
| <img src="docs/images/roles/smaq-guru-bk__kinerja.webp" width="360" alt="smaq-guru-bk /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smaq-guru-bk__tahfidz.webp" width="360" alt="smaq-guru-bk /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smaq-guru-bk__teacher.webp" width="360" alt="smaq-guru-bk /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smaq-guru-bk__e-office.webp" width="360" alt="smaq-guru-bk /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smaq-guru-bk__homeroom.webp" width="360" alt="smaq-guru-bk /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smaq-guru-bk__students.webp" width="360" alt="smaq-guru-bk /students">                        | `/students`            |
| <img src="docs/images/roles/smaq-guru-bk__portfolio.webp" width="360" alt="smaq-guru-bk /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smaq-guru-bk__attendance.webp" width="360" alt="smaq-guru-bk /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smaq-guru-bk__muhadatsah.webp" width="360" alt="smaq-guru-bk /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smaq-guru-bk__muhadhoroh.webp" width="360" alt="smaq-guru-bk /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smaq-guru-bk__daily-report.webp" width="360" alt="smaq-guru-bk /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smaq-guru-bk__announcements.webp" width="360" alt="smaq-guru-bk /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smaq-guru-bk__kitab-progress.webp" width="360" alt="smaq-guru-bk /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smaq-guru-bk__homeroom__behavior.webp" width="360" alt="smaq-guru-bk /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smaq-guru-bk__homeroom__messages.webp" width="360" alt="smaq-guru-bk /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smaq-guru-bk__quality__complaints.webp" width="360" alt="smaq-guru-bk /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smaq-guru-bk__homeroom__attendance.webp" width="360" alt="smaq-guru-bk /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smaq-kepala-sekolah</code> — 19 halaman</summary>

| Halaman                                                                                                                    | Rute             |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| <img src="docs/images/roles/smaq-kepala-sekolah__hr.webp" width="360" alt="smaq-kepala-sekolah /hr">                       | `/hr`            |
| <img src="docs/images/roles/smaq-kepala-sekolah__users.webp" width="360" alt="smaq-kepala-sekolah /users">                 | `/users`         |
| <img src="docs/images/roles/smaq-kepala-sekolah__classes.webp" width="360" alt="smaq-kepala-sekolah /classes">             | `/classes`       |
| <img src="docs/images/roles/smaq-kepala-sekolah__kinerja.webp" width="360" alt="smaq-kepala-sekolah /kinerja">             | `/kinerja`       |
| <img src="docs/images/roles/smaq-kepala-sekolah__permits.webp" width="360" alt="smaq-kepala-sekolah /permits">             | `/permits`       |
| <img src="docs/images/roles/smaq-kepala-sekolah__reports.webp" width="360" alt="smaq-kepala-sekolah /reports">             | `/reports`       |
| <img src="docs/images/roles/smaq-kepala-sekolah__rewards.webp" width="360" alt="smaq-kepala-sekolah /rewards">             | `/rewards`       |
| <img src="docs/images/roles/smaq-kepala-sekolah__tahfidz.webp" width="360" alt="smaq-kepala-sekolah /tahfidz">             | `/tahfidz`       |
| <img src="docs/images/roles/smaq-kepala-sekolah__e-office.webp" width="360" alt="smaq-kepala-sekolah /e-office">           | `/e-office`      |
| <img src="docs/images/roles/smaq-kepala-sekolah__settings.webp" width="360" alt="smaq-kepala-sekolah /settings">           | `/settings`      |
| <img src="docs/images/roles/smaq-kepala-sekolah__students.webp" width="360" alt="smaq-kepala-sekolah /students">           | `/students`      |
| <img src="docs/images/roles/smaq-kepala-sekolah__analytics.webp" width="360" alt="smaq-kepala-sekolah /analytics">         | `/analytics`     |
| <img src="docs/images/roles/smaq-kepala-sekolah__dashboard.webp" width="360" alt="smaq-kepala-sekolah /dashboard">         | `/dashboard`     |
| <img src="docs/images/roles/smaq-kepala-sekolah__admissions.webp" width="360" alt="smaq-kepala-sekolah /admissions">       | `/admissions`    |
| <img src="docs/images/roles/smaq-kepala-sekolah__assessment.webp" width="360" alt="smaq-kepala-sekolah /assessment">       | `/assessment`    |
| <img src="docs/images/roles/smaq-kepala-sekolah__attendance.webp" width="360" alt="smaq-kepala-sekolah /attendance">       | `/attendance`    |
| <img src="docs/images/roles/smaq-kepala-sekolah__violations.webp" width="360" alt="smaq-kepala-sekolah /violations">       | `/violations`    |
| <img src="docs/images/roles/smaq-kepala-sekolah__announcements.webp" width="360" alt="smaq-kepala-sekolah /announcements"> | `/announcements` |
| <img src="docs/images/roles/smaq-kepala-sekolah__notifications.webp" width="360" alt="smaq-kepala-sekolah /notifications"> | `/notifications` |

</details>

<details>
<summary><code>smaq-komite</code> — 10 halaman</summary>

| Halaman                                                                                                               | Rute                  |
| --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smaq-komite__finance.webp" width="360" alt="smaq-komite /finance">                        | `/finance`            |
| <img src="docs/images/roles/smaq-komite__quality.webp" width="360" alt="smaq-komite /quality">                        | `/quality`            |
| <img src="docs/images/roles/smaq-komite__reports.webp" width="360" alt="smaq-komite /reports">                        | `/reports`            |
| <img src="docs/images/roles/smaq-komite__rewards.webp" width="360" alt="smaq-komite /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/smaq-komite__donation.webp" width="360" alt="smaq-komite /donation">                      | `/donation`           |
| <img src="docs/images/roles/smaq-komite__schedule.webp" width="360" alt="smaq-komite /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/smaq-komite__students.webp" width="360" alt="smaq-komite /students">                      | `/students`           |
| <img src="docs/images/roles/smaq-komite__analytics.webp" width="360" alt="smaq-komite /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/smaq-komite__announcements.webp" width="360" alt="smaq-komite /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smaq-komite__quality__complaints.webp" width="360" alt="smaq-komite /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smaq-orang-tua</code> — 16 halaman</summary>

| Halaman                                                                                                                                                  | Rute                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| <img src="docs/images/roles/smaq-orang-tua__parent.webp" width="360" alt="smaq-orang-tua /parent">                                                       | `/parent`                           |
| <img src="docs/images/roles/smaq-orang-tua__parent__health.webp" width="360" alt="smaq-orang-tua /parent/health">                                        | `/parent/health`                    |
| <img src="docs/images/roles/smaq-orang-tua__parent__ibadah.webp" width="360" alt="smaq-orang-tua /parent/ibadah">                                        | `/parent/ibadah`                    |
| <img src="docs/images/roles/smaq-orang-tua__parent__finance.webp" width="360" alt="smaq-orang-tua /parent/finance">                                      | `/parent/finance`                   |
| <img src="docs/images/roles/smaq-orang-tua__parent__permits.webp" width="360" alt="smaq-orang-tua /parent/permits">                                      | `/parent/permits`                   |
| <img src="docs/images/roles/smaq-orang-tua__parent__rewards.webp" width="360" alt="smaq-orang-tua /parent/rewards">                                      | `/parent/rewards`                   |
| <img src="docs/images/roles/smaq-orang-tua__parent__children.webp" width="360" alt="smaq-orang-tua /parent/children">                                    | `/parent/children`                  |
| <img src="docs/images/roles/smaq-orang-tua__parent__messages.webp" width="360" alt="smaq-orang-tua /parent/messages">                                    | `/parent/messages`                  |
| <img src="docs/images/roles/smaq-orang-tua__parent__counseling.webp" width="360" alt="smaq-orang-tua /parent/counseling">                                | `/parent/counseling`                |
| <img src="docs/images/roles/smaq-orang-tua__parent__violations.webp" width="360" alt="smaq-orang-tua /parent/violations">                                | `/parent/violations`                |
| <img src="docs/images/roles/smaq-orang-tua__quality__complaints.webp" width="360" alt="smaq-orang-tua /quality/complaints">                              | `/quality/complaints`               |
| <img src="docs/images/roles/smaq-orang-tua__parent__daily-report.webp" width="360" alt="smaq-orang-tua /parent/daily-report">                            | `/parent/daily-report`              |
| <img src="docs/images/roles/smaq-orang-tua__parent__report-cards.webp" width="360" alt="smaq-orang-tua /parent/report-cards">                            | `/parent/report-cards`              |
| <img src="docs/images/roles/smaq-orang-tua__parent__announcements.webp" width="360" alt="smaq-orang-tua /parent/announcements">                          | `/parent/announcements`             |
| <img src="docs/images/roles/smaq-orang-tua__parent__buku-penghubung.webp" width="360" alt="smaq-orang-tua /parent/buku-penghubung">                      | `/parent/buku-penghubung`           |
| <img src="docs/images/roles/smaq-orang-tua__parent__notifications__preferences.webp" width="360" alt="smaq-orang-tua /parent/notifications/preferences"> | `/parent/notifications/preferences` |

</details>

<details>
<summary><code>smaq-siswa</code> — 13 halaman</summary>

| Halaman                                                                                                                 | Rute                    |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| <img src="docs/images/roles/smaq-siswa__ibadah.webp" width="360" alt="smaq-siswa /ibadah">                              | `/ibadah`               |
| <img src="docs/images/roles/smaq-siswa__student.webp" width="360" alt="smaq-siswa /student">                            | `/student`              |
| <img src="docs/images/roles/smaq-siswa__tahfidz.webp" width="360" alt="smaq-siswa /tahfidz">                            | `/tahfidz`              |
| <img src="docs/images/roles/smaq-siswa__schedule.webp" width="360" alt="smaq-siswa /schedule">                          | `/schedule`             |
| <img src="docs/images/roles/smaq-siswa__muhasabah.webp" width="360" alt="smaq-siswa /muhasabah">                        | `/muhasabah`            |
| <img src="docs/images/roles/smaq-siswa__portfolio.webp" width="360" alt="smaq-siswa /portfolio">                        | `/portfolio`            |
| <img src="docs/images/roles/smaq-siswa__muhadatsah.webp" width="360" alt="smaq-siswa /muhadatsah">                      | `/muhadatsah`           |
| <img src="docs/images/roles/smaq-siswa__muhadhoroh.webp" width="360" alt="smaq-siswa /muhadhoroh">                      | `/muhadhoroh`           |
| <img src="docs/images/roles/smaq-siswa__announcements.webp" width="360" alt="smaq-siswa /announcements">                | `/announcements`        |
| <img src="docs/images/roles/smaq-siswa__student__exams.webp" width="360" alt="smaq-siswa /student/exams">               | `/student/exams`        |
| <img src="docs/images/roles/smaq-siswa__kitab-progress.webp" width="360" alt="smaq-siswa /kitab-progress">              | `/kitab-progress`       |
| <img src="docs/images/roles/smaq-siswa__quality__complaints.webp" width="360" alt="smaq-siswa /quality/complaints">     | `/quality/complaints`   |
| <img src="docs/images/roles/smaq-siswa__student__achievements.webp" width="360" alt="smaq-siswa /student/achievements"> | `/student/achievements` |

</details>

<details>
<summary><code>smaq-tata-usaha</code> — 13 halaman</summary>

| Halaman                                                                                                                       | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smaq-tata-usaha__spmb.webp" width="360" alt="smaq-tata-usaha /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/smaq-tata-usaha__staff.webp" width="360" alt="smaq-tata-usaha /staff">                            | `/staff`              |
| <img src="docs/images/roles/smaq-tata-usaha__health.webp" width="360" alt="smaq-tata-usaha /health">                          | `/health`             |
| <img src="docs/images/roles/smaq-tata-usaha__finance.webp" width="360" alt="smaq-tata-usaha /finance">                        | `/finance`            |
| <img src="docs/images/roles/smaq-tata-usaha__kinerja.webp" width="360" alt="smaq-tata-usaha /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/smaq-tata-usaha__permits.webp" width="360" alt="smaq-tata-usaha /permits">                        | `/permits`            |
| <img src="docs/images/roles/smaq-tata-usaha__rewards.webp" width="360" alt="smaq-tata-usaha /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/smaq-tata-usaha__e-office.webp" width="360" alt="smaq-tata-usaha /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/smaq-tata-usaha__students.webp" width="360" alt="smaq-tata-usaha /students">                      | `/students`           |
| <img src="docs/images/roles/smaq-tata-usaha__lingkungan.webp" width="360" alt="smaq-tata-usaha /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/smaq-tata-usaha__violations.webp" width="360" alt="smaq-tata-usaha /violations">                  | `/violations`         |
| <img src="docs/images/roles/smaq-tata-usaha__announcements.webp" width="360" alt="smaq-tata-usaha /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smaq-tata-usaha__quality__complaints.webp" width="360" alt="smaq-tata-usaha /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smaq-wakasek</code> — 19 halaman</summary>

| Halaman                                                                                                                   | Rute                   |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smaq-wakasek__ibadah.webp" width="360" alt="smaq-wakasek /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smaq-wakasek__classes.webp" width="360" alt="smaq-wakasek /classes">                          | `/classes`             |
| <img src="docs/images/roles/smaq-wakasek__kinerja.webp" width="360" alt="smaq-wakasek /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smaq-wakasek__tahfidz.webp" width="360" alt="smaq-wakasek /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smaq-wakasek__teacher.webp" width="360" alt="smaq-wakasek /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smaq-wakasek__e-office.webp" width="360" alt="smaq-wakasek /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smaq-wakasek__homeroom.webp" width="360" alt="smaq-wakasek /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smaq-wakasek__students.webp" width="360" alt="smaq-wakasek /students">                        | `/students`            |
| <img src="docs/images/roles/smaq-wakasek__portfolio.webp" width="360" alt="smaq-wakasek /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smaq-wakasek__attendance.webp" width="360" alt="smaq-wakasek /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smaq-wakasek__muhadatsah.webp" width="360" alt="smaq-wakasek /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smaq-wakasek__muhadhoroh.webp" width="360" alt="smaq-wakasek /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smaq-wakasek__daily-report.webp" width="360" alt="smaq-wakasek /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smaq-wakasek__announcements.webp" width="360" alt="smaq-wakasek /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smaq-wakasek__kitab-progress.webp" width="360" alt="smaq-wakasek /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smaq-wakasek__homeroom__behavior.webp" width="360" alt="smaq-wakasek /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smaq-wakasek__homeroom__messages.webp" width="360" alt="smaq-wakasek /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smaq-wakasek__quality__complaints.webp" width="360" alt="smaq-wakasek /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smaq-wakasek__homeroom__attendance.webp" width="360" alt="smaq-wakasek /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smaq-wali-kelas</code> — 19 halaman</summary>

| Halaman                                                                                                                         | Rute                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smaq-wali-kelas__ibadah.webp" width="360" alt="smaq-wali-kelas /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smaq-wali-kelas__classes.webp" width="360" alt="smaq-wali-kelas /classes">                          | `/classes`             |
| <img src="docs/images/roles/smaq-wali-kelas__kinerja.webp" width="360" alt="smaq-wali-kelas /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smaq-wali-kelas__tahfidz.webp" width="360" alt="smaq-wali-kelas /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smaq-wali-kelas__teacher.webp" width="360" alt="smaq-wali-kelas /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smaq-wali-kelas__e-office.webp" width="360" alt="smaq-wali-kelas /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smaq-wali-kelas__homeroom.webp" width="360" alt="smaq-wali-kelas /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smaq-wali-kelas__students.webp" width="360" alt="smaq-wali-kelas /students">                        | `/students`            |
| <img src="docs/images/roles/smaq-wali-kelas__portfolio.webp" width="360" alt="smaq-wali-kelas /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smaq-wali-kelas__attendance.webp" width="360" alt="smaq-wali-kelas /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smaq-wali-kelas__muhadatsah.webp" width="360" alt="smaq-wali-kelas /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smaq-wali-kelas__muhadhoroh.webp" width="360" alt="smaq-wali-kelas /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smaq-wali-kelas__daily-report.webp" width="360" alt="smaq-wali-kelas /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smaq-wali-kelas__announcements.webp" width="360" alt="smaq-wali-kelas /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smaq-wali-kelas__kitab-progress.webp" width="360" alt="smaq-wali-kelas /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smaq-wali-kelas__homeroom__behavior.webp" width="360" alt="smaq-wali-kelas /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smaq-wali-kelas__homeroom__messages.webp" width="360" alt="smaq-wali-kelas /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smaq-wali-kelas__quality__complaints.webp" width="360" alt="smaq-wali-kelas /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smaq-wali-kelas__homeroom__attendance.webp" width="360" alt="smaq-wali-kelas /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smpit-admin</code> — 40 halaman</summary>

| Halaman                                                                                                               | Rute                  |
| --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smpit-admin__hr.webp" width="360" alt="smpit-admin /hr">                                  | `/hr`                 |
| <img src="docs/images/roles/smpit-admin__tk.webp" width="360" alt="smpit-admin /tk">                                  | `/tk`                 |
| <img src="docs/images/roles/smpit-admin__emis.webp" width="360" alt="smpit-admin /emis">                              | `/emis`               |
| <img src="docs/images/roles/smpit-admin__spmb.webp" width="360" alt="smpit-admin /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/smpit-admin__users.webp" width="360" alt="smpit-admin /users">                            | `/users`              |
| <img src="docs/images/roles/smpit-admin__alumni.webp" width="360" alt="smpit-admin /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/smpit-admin__health.webp" width="360" alt="smpit-admin /health">                          | `/health`             |
| <img src="docs/images/roles/smpit-admin__ibadah.webp" width="360" alt="smpit-admin /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/smpit-admin__classes.webp" width="360" alt="smpit-admin /classes">                        | `/classes`            |
| <img src="docs/images/roles/smpit-admin__finance.webp" width="360" alt="smpit-admin /finance">                        | `/finance`            |
| <img src="docs/images/roles/smpit-admin__kinerja.webp" width="360" alt="smpit-admin /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/smpit-admin__library.webp" width="360" alt="smpit-admin /library">                        | `/library`            |
| <img src="docs/images/roles/smpit-admin__payroll.webp" width="360" alt="smpit-admin /payroll">                        | `/payroll`            |
| <img src="docs/images/roles/smpit-admin__project.webp" width="360" alt="smpit-admin /project">                        | `/project`            |
| <img src="docs/images/roles/smpit-admin__quality.webp" width="360" alt="smpit-admin /quality">                        | `/quality`            |
| <img src="docs/images/roles/smpit-admin__reports.webp" width="360" alt="smpit-admin /reports">                        | `/reports`            |
| <img src="docs/images/roles/smpit-admin__tahfidz.webp" width="360" alt="smpit-admin /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/smpit-admin__talenta.webp" width="360" alt="smpit-admin /talenta">                        | `/talenta`            |
| <img src="docs/images/roles/smpit-admin__donation.webp" width="360" alt="smpit-admin /donation">                      | `/donation`           |
| <img src="docs/images/roles/smpit-admin__e-office.webp" width="360" alt="smpit-admin /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/smpit-admin__settings.webp" width="360" alt="smpit-admin /settings">                      | `/settings`           |
| <img src="docs/images/roles/smpit-admin__students.webp" width="360" alt="smpit-admin /students">                      | `/students`           |
| <img src="docs/images/roles/smpit-admin__analytics.webp" width="360" alt="smpit-admin /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/smpit-admin__dashboard.webp" width="360" alt="smpit-admin /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/smpit-admin__marketing.webp" width="360" alt="smpit-admin /marketing">                    | `/marketing`          |
| <img src="docs/images/roles/smpit-admin__reception.webp" width="360" alt="smpit-admin /reception">                    | `/reception`          |
| <img src="docs/images/roles/smpit-admin__assessment.webp" width="360" alt="smpit-admin /assessment">                  | `/assessment`         |
| <img src="docs/images/roles/smpit-admin__attendance.webp" width="360" alt="smpit-admin /attendance">                  | `/attendance`         |
| <img src="docs/images/roles/smpit-admin__counseling.webp" width="360" alt="smpit-admin /counseling">                  | `/counseling`         |
| <img src="docs/images/roles/smpit-admin__facilities.webp" width="360" alt="smpit-admin /facilities">                  | `/facilities`         |
| <img src="docs/images/roles/smpit-admin__muhadhoroh.webp" width="360" alt="smpit-admin /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/smpit-admin__unit-usaha.webp" width="360" alt="smpit-admin /unit-usaha">                  | `/unit-usaha`         |
| <img src="docs/images/roles/smpit-admin__dormitories.webp" width="360" alt="smpit-admin /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/smpit-admin__perencanaan.webp" width="360" alt="smpit-admin /perencanaan">                | `/perencanaan`        |
| <img src="docs/images/roles/smpit-admin__procurement.webp" width="360" alt="smpit-admin /procurement">                | `/procurement`        |
| <img src="docs/images/roles/smpit-admin__grc-dashboard.webp" width="360" alt="smpit-admin /grc-dashboard">            | `/grc-dashboard`      |
| <img src="docs/images/roles/smpit-admin__notifications.webp" width="360" alt="smpit-admin /notifications">            | `/notifications`      |
| <img src="docs/images/roles/smpit-admin__kitab-progress.webp" width="360" alt="smpit-admin /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/smpit-admin__extracurricular.webp" width="360" alt="smpit-admin /extracurricular">        | `/extracurricular`    |
| <img src="docs/images/roles/smpit-admin__finance__accounting.webp" width="360" alt="smpit-admin /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>smpit-alumni</code> — 8 halaman</summary>

| Halaman                                                                                                                 | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smpit-alumni__alumni.webp" width="360" alt="smpit-alumni /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/smpit-alumni__donation.webp" width="360" alt="smpit-alumni /donation">                      | `/donation`           |
| <img src="docs/images/roles/smpit-alumni__portfolio.webp" width="360" alt="smpit-alumni /portfolio">                    | `/portfolio`          |
| <img src="docs/images/roles/smpit-alumni__alumni__sanad.webp" width="360" alt="smpit-alumni /alumni/sanad">             | `/alumni/sanad`       |
| <img src="docs/images/roles/smpit-alumni__certificates.webp" width="360" alt="smpit-alumni /certificates">              | `/certificates`       |
| <img src="docs/images/roles/smpit-alumni__announcements.webp" width="360" alt="smpit-alumni /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smpit-alumni__alumni__placement.webp" width="360" alt="smpit-alumni /alumni/placement">     | `/alumni/placement`   |
| <img src="docs/images/roles/smpit-alumni__quality__complaints.webp" width="360" alt="smpit-alumni /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smpit-bendahara</code> — 13 halaman</summary>

| Halaman                                                                                                                       | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smpit-bendahara__spmb.webp" width="360" alt="smpit-bendahara /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/smpit-bendahara__staff.webp" width="360" alt="smpit-bendahara /staff">                            | `/staff`              |
| <img src="docs/images/roles/smpit-bendahara__health.webp" width="360" alt="smpit-bendahara /health">                          | `/health`             |
| <img src="docs/images/roles/smpit-bendahara__finance.webp" width="360" alt="smpit-bendahara /finance">                        | `/finance`            |
| <img src="docs/images/roles/smpit-bendahara__kinerja.webp" width="360" alt="smpit-bendahara /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/smpit-bendahara__permits.webp" width="360" alt="smpit-bendahara /permits">                        | `/permits`            |
| <img src="docs/images/roles/smpit-bendahara__rewards.webp" width="360" alt="smpit-bendahara /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/smpit-bendahara__e-office.webp" width="360" alt="smpit-bendahara /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/smpit-bendahara__students.webp" width="360" alt="smpit-bendahara /students">                      | `/students`           |
| <img src="docs/images/roles/smpit-bendahara__lingkungan.webp" width="360" alt="smpit-bendahara /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/smpit-bendahara__violations.webp" width="360" alt="smpit-bendahara /violations">                  | `/violations`         |
| <img src="docs/images/roles/smpit-bendahara__announcements.webp" width="360" alt="smpit-bendahara /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smpit-bendahara__quality__complaints.webp" width="360" alt="smpit-bendahara /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smpit-guru</code> — 19 halaman</summary>

| Halaman                                                                                                               | Rute                   |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smpit-guru__ibadah.webp" width="360" alt="smpit-guru /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smpit-guru__classes.webp" width="360" alt="smpit-guru /classes">                          | `/classes`             |
| <img src="docs/images/roles/smpit-guru__kinerja.webp" width="360" alt="smpit-guru /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smpit-guru__tahfidz.webp" width="360" alt="smpit-guru /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smpit-guru__teacher.webp" width="360" alt="smpit-guru /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smpit-guru__e-office.webp" width="360" alt="smpit-guru /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smpit-guru__homeroom.webp" width="360" alt="smpit-guru /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smpit-guru__students.webp" width="360" alt="smpit-guru /students">                        | `/students`            |
| <img src="docs/images/roles/smpit-guru__portfolio.webp" width="360" alt="smpit-guru /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smpit-guru__attendance.webp" width="360" alt="smpit-guru /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smpit-guru__muhadatsah.webp" width="360" alt="smpit-guru /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smpit-guru__muhadhoroh.webp" width="360" alt="smpit-guru /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smpit-guru__daily-report.webp" width="360" alt="smpit-guru /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smpit-guru__announcements.webp" width="360" alt="smpit-guru /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smpit-guru__kitab-progress.webp" width="360" alt="smpit-guru /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smpit-guru__homeroom__behavior.webp" width="360" alt="smpit-guru /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smpit-guru__homeroom__messages.webp" width="360" alt="smpit-guru /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smpit-guru__quality__complaints.webp" width="360" alt="smpit-guru /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smpit-guru__homeroom__attendance.webp" width="360" alt="smpit-guru /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smpit-guru-bk</code> — 19 halaman</summary>

| Halaman                                                                                                                     | Rute                   |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smpit-guru-bk__ibadah.webp" width="360" alt="smpit-guru-bk /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smpit-guru-bk__classes.webp" width="360" alt="smpit-guru-bk /classes">                          | `/classes`             |
| <img src="docs/images/roles/smpit-guru-bk__kinerja.webp" width="360" alt="smpit-guru-bk /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smpit-guru-bk__tahfidz.webp" width="360" alt="smpit-guru-bk /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smpit-guru-bk__teacher.webp" width="360" alt="smpit-guru-bk /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smpit-guru-bk__e-office.webp" width="360" alt="smpit-guru-bk /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smpit-guru-bk__homeroom.webp" width="360" alt="smpit-guru-bk /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smpit-guru-bk__students.webp" width="360" alt="smpit-guru-bk /students">                        | `/students`            |
| <img src="docs/images/roles/smpit-guru-bk__portfolio.webp" width="360" alt="smpit-guru-bk /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smpit-guru-bk__attendance.webp" width="360" alt="smpit-guru-bk /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smpit-guru-bk__muhadatsah.webp" width="360" alt="smpit-guru-bk /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smpit-guru-bk__muhadhoroh.webp" width="360" alt="smpit-guru-bk /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smpit-guru-bk__daily-report.webp" width="360" alt="smpit-guru-bk /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smpit-guru-bk__announcements.webp" width="360" alt="smpit-guru-bk /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smpit-guru-bk__kitab-progress.webp" width="360" alt="smpit-guru-bk /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smpit-guru-bk__homeroom__behavior.webp" width="360" alt="smpit-guru-bk /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smpit-guru-bk__homeroom__messages.webp" width="360" alt="smpit-guru-bk /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smpit-guru-bk__quality__complaints.webp" width="360" alt="smpit-guru-bk /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smpit-guru-bk__homeroom__attendance.webp" width="360" alt="smpit-guru-bk /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smpit-kepala-sekolah</code> — 19 halaman</summary>

| Halaman                                                                                                                      | Rute             |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| <img src="docs/images/roles/smpit-kepala-sekolah__hr.webp" width="360" alt="smpit-kepala-sekolah /hr">                       | `/hr`            |
| <img src="docs/images/roles/smpit-kepala-sekolah__users.webp" width="360" alt="smpit-kepala-sekolah /users">                 | `/users`         |
| <img src="docs/images/roles/smpit-kepala-sekolah__classes.webp" width="360" alt="smpit-kepala-sekolah /classes">             | `/classes`       |
| <img src="docs/images/roles/smpit-kepala-sekolah__kinerja.webp" width="360" alt="smpit-kepala-sekolah /kinerja">             | `/kinerja`       |
| <img src="docs/images/roles/smpit-kepala-sekolah__permits.webp" width="360" alt="smpit-kepala-sekolah /permits">             | `/permits`       |
| <img src="docs/images/roles/smpit-kepala-sekolah__reports.webp" width="360" alt="smpit-kepala-sekolah /reports">             | `/reports`       |
| <img src="docs/images/roles/smpit-kepala-sekolah__rewards.webp" width="360" alt="smpit-kepala-sekolah /rewards">             | `/rewards`       |
| <img src="docs/images/roles/smpit-kepala-sekolah__tahfidz.webp" width="360" alt="smpit-kepala-sekolah /tahfidz">             | `/tahfidz`       |
| <img src="docs/images/roles/smpit-kepala-sekolah__e-office.webp" width="360" alt="smpit-kepala-sekolah /e-office">           | `/e-office`      |
| <img src="docs/images/roles/smpit-kepala-sekolah__settings.webp" width="360" alt="smpit-kepala-sekolah /settings">           | `/settings`      |
| <img src="docs/images/roles/smpit-kepala-sekolah__students.webp" width="360" alt="smpit-kepala-sekolah /students">           | `/students`      |
| <img src="docs/images/roles/smpit-kepala-sekolah__analytics.webp" width="360" alt="smpit-kepala-sekolah /analytics">         | `/analytics`     |
| <img src="docs/images/roles/smpit-kepala-sekolah__dashboard.webp" width="360" alt="smpit-kepala-sekolah /dashboard">         | `/dashboard`     |
| <img src="docs/images/roles/smpit-kepala-sekolah__admissions.webp" width="360" alt="smpit-kepala-sekolah /admissions">       | `/admissions`    |
| <img src="docs/images/roles/smpit-kepala-sekolah__assessment.webp" width="360" alt="smpit-kepala-sekolah /assessment">       | `/assessment`    |
| <img src="docs/images/roles/smpit-kepala-sekolah__attendance.webp" width="360" alt="smpit-kepala-sekolah /attendance">       | `/attendance`    |
| <img src="docs/images/roles/smpit-kepala-sekolah__violations.webp" width="360" alt="smpit-kepala-sekolah /violations">       | `/violations`    |
| <img src="docs/images/roles/smpit-kepala-sekolah__announcements.webp" width="360" alt="smpit-kepala-sekolah /announcements"> | `/announcements` |
| <img src="docs/images/roles/smpit-kepala-sekolah__notifications.webp" width="360" alt="smpit-kepala-sekolah /notifications"> | `/notifications` |

</details>

<details>
<summary><code>smpit-komite</code> — 10 halaman</summary>

| Halaman                                                                                                                 | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smpit-komite__finance.webp" width="360" alt="smpit-komite /finance">                        | `/finance`            |
| <img src="docs/images/roles/smpit-komite__quality.webp" width="360" alt="smpit-komite /quality">                        | `/quality`            |
| <img src="docs/images/roles/smpit-komite__reports.webp" width="360" alt="smpit-komite /reports">                        | `/reports`            |
| <img src="docs/images/roles/smpit-komite__rewards.webp" width="360" alt="smpit-komite /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/smpit-komite__donation.webp" width="360" alt="smpit-komite /donation">                      | `/donation`           |
| <img src="docs/images/roles/smpit-komite__schedule.webp" width="360" alt="smpit-komite /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/smpit-komite__students.webp" width="360" alt="smpit-komite /students">                      | `/students`           |
| <img src="docs/images/roles/smpit-komite__analytics.webp" width="360" alt="smpit-komite /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/smpit-komite__announcements.webp" width="360" alt="smpit-komite /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smpit-komite__quality__complaints.webp" width="360" alt="smpit-komite /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smpit-orang-tua</code> — 16 halaman</summary>

| Halaman                                                                                                                                                    | Rute                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| <img src="docs/images/roles/smpit-orang-tua__parent.webp" width="360" alt="smpit-orang-tua /parent">                                                       | `/parent`                           |
| <img src="docs/images/roles/smpit-orang-tua__parent__health.webp" width="360" alt="smpit-orang-tua /parent/health">                                        | `/parent/health`                    |
| <img src="docs/images/roles/smpit-orang-tua__parent__ibadah.webp" width="360" alt="smpit-orang-tua /parent/ibadah">                                        | `/parent/ibadah`                    |
| <img src="docs/images/roles/smpit-orang-tua__parent__finance.webp" width="360" alt="smpit-orang-tua /parent/finance">                                      | `/parent/finance`                   |
| <img src="docs/images/roles/smpit-orang-tua__parent__permits.webp" width="360" alt="smpit-orang-tua /parent/permits">                                      | `/parent/permits`                   |
| <img src="docs/images/roles/smpit-orang-tua__parent__rewards.webp" width="360" alt="smpit-orang-tua /parent/rewards">                                      | `/parent/rewards`                   |
| <img src="docs/images/roles/smpit-orang-tua__parent__children.webp" width="360" alt="smpit-orang-tua /parent/children">                                    | `/parent/children`                  |
| <img src="docs/images/roles/smpit-orang-tua__parent__messages.webp" width="360" alt="smpit-orang-tua /parent/messages">                                    | `/parent/messages`                  |
| <img src="docs/images/roles/smpit-orang-tua__parent__counseling.webp" width="360" alt="smpit-orang-tua /parent/counseling">                                | `/parent/counseling`                |
| <img src="docs/images/roles/smpit-orang-tua__parent__violations.webp" width="360" alt="smpit-orang-tua /parent/violations">                                | `/parent/violations`                |
| <img src="docs/images/roles/smpit-orang-tua__quality__complaints.webp" width="360" alt="smpit-orang-tua /quality/complaints">                              | `/quality/complaints`               |
| <img src="docs/images/roles/smpit-orang-tua__parent__daily-report.webp" width="360" alt="smpit-orang-tua /parent/daily-report">                            | `/parent/daily-report`              |
| <img src="docs/images/roles/smpit-orang-tua__parent__report-cards.webp" width="360" alt="smpit-orang-tua /parent/report-cards">                            | `/parent/report-cards`              |
| <img src="docs/images/roles/smpit-orang-tua__parent__announcements.webp" width="360" alt="smpit-orang-tua /parent/announcements">                          | `/parent/announcements`             |
| <img src="docs/images/roles/smpit-orang-tua__parent__buku-penghubung.webp" width="360" alt="smpit-orang-tua /parent/buku-penghubung">                      | `/parent/buku-penghubung`           |
| <img src="docs/images/roles/smpit-orang-tua__parent__notifications__preferences.webp" width="360" alt="smpit-orang-tua /parent/notifications/preferences"> | `/parent/notifications/preferences` |

</details>

<details>
<summary><code>smpit-siswa</code> — 13 halaman</summary>

| Halaman                                                                                                                   | Rute                    |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| <img src="docs/images/roles/smpit-siswa__ibadah.webp" width="360" alt="smpit-siswa /ibadah">                              | `/ibadah`               |
| <img src="docs/images/roles/smpit-siswa__student.webp" width="360" alt="smpit-siswa /student">                            | `/student`              |
| <img src="docs/images/roles/smpit-siswa__tahfidz.webp" width="360" alt="smpit-siswa /tahfidz">                            | `/tahfidz`              |
| <img src="docs/images/roles/smpit-siswa__schedule.webp" width="360" alt="smpit-siswa /schedule">                          | `/schedule`             |
| <img src="docs/images/roles/smpit-siswa__muhasabah.webp" width="360" alt="smpit-siswa /muhasabah">                        | `/muhasabah`            |
| <img src="docs/images/roles/smpit-siswa__portfolio.webp" width="360" alt="smpit-siswa /portfolio">                        | `/portfolio`            |
| <img src="docs/images/roles/smpit-siswa__muhadatsah.webp" width="360" alt="smpit-siswa /muhadatsah">                      | `/muhadatsah`           |
| <img src="docs/images/roles/smpit-siswa__muhadhoroh.webp" width="360" alt="smpit-siswa /muhadhoroh">                      | `/muhadhoroh`           |
| <img src="docs/images/roles/smpit-siswa__announcements.webp" width="360" alt="smpit-siswa /announcements">                | `/announcements`        |
| <img src="docs/images/roles/smpit-siswa__student__exams.webp" width="360" alt="smpit-siswa /student/exams">               | `/student/exams`        |
| <img src="docs/images/roles/smpit-siswa__kitab-progress.webp" width="360" alt="smpit-siswa /kitab-progress">              | `/kitab-progress`       |
| <img src="docs/images/roles/smpit-siswa__quality__complaints.webp" width="360" alt="smpit-siswa /quality/complaints">     | `/quality/complaints`   |
| <img src="docs/images/roles/smpit-siswa__student__achievements.webp" width="360" alt="smpit-siswa /student/achievements"> | `/student/achievements` |

</details>

<details>
<summary><code>smpit-tata-usaha</code> — 13 halaman</summary>

| Halaman                                                                                                                         | Rute                  |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/smpit-tata-usaha__spmb.webp" width="360" alt="smpit-tata-usaha /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/smpit-tata-usaha__staff.webp" width="360" alt="smpit-tata-usaha /staff">                            | `/staff`              |
| <img src="docs/images/roles/smpit-tata-usaha__health.webp" width="360" alt="smpit-tata-usaha /health">                          | `/health`             |
| <img src="docs/images/roles/smpit-tata-usaha__finance.webp" width="360" alt="smpit-tata-usaha /finance">                        | `/finance`            |
| <img src="docs/images/roles/smpit-tata-usaha__kinerja.webp" width="360" alt="smpit-tata-usaha /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/smpit-tata-usaha__permits.webp" width="360" alt="smpit-tata-usaha /permits">                        | `/permits`            |
| <img src="docs/images/roles/smpit-tata-usaha__rewards.webp" width="360" alt="smpit-tata-usaha /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/smpit-tata-usaha__e-office.webp" width="360" alt="smpit-tata-usaha /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/smpit-tata-usaha__students.webp" width="360" alt="smpit-tata-usaha /students">                      | `/students`           |
| <img src="docs/images/roles/smpit-tata-usaha__lingkungan.webp" width="360" alt="smpit-tata-usaha /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/smpit-tata-usaha__violations.webp" width="360" alt="smpit-tata-usaha /violations">                  | `/violations`         |
| <img src="docs/images/roles/smpit-tata-usaha__announcements.webp" width="360" alt="smpit-tata-usaha /announcements">            | `/announcements`      |
| <img src="docs/images/roles/smpit-tata-usaha__quality__complaints.webp" width="360" alt="smpit-tata-usaha /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>smpit-wakasek</code> — 19 halaman</summary>

| Halaman                                                                                                                     | Rute                   |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smpit-wakasek__ibadah.webp" width="360" alt="smpit-wakasek /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smpit-wakasek__classes.webp" width="360" alt="smpit-wakasek /classes">                          | `/classes`             |
| <img src="docs/images/roles/smpit-wakasek__kinerja.webp" width="360" alt="smpit-wakasek /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smpit-wakasek__tahfidz.webp" width="360" alt="smpit-wakasek /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smpit-wakasek__teacher.webp" width="360" alt="smpit-wakasek /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smpit-wakasek__e-office.webp" width="360" alt="smpit-wakasek /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smpit-wakasek__homeroom.webp" width="360" alt="smpit-wakasek /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smpit-wakasek__students.webp" width="360" alt="smpit-wakasek /students">                        | `/students`            |
| <img src="docs/images/roles/smpit-wakasek__portfolio.webp" width="360" alt="smpit-wakasek /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smpit-wakasek__attendance.webp" width="360" alt="smpit-wakasek /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smpit-wakasek__muhadatsah.webp" width="360" alt="smpit-wakasek /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smpit-wakasek__muhadhoroh.webp" width="360" alt="smpit-wakasek /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smpit-wakasek__daily-report.webp" width="360" alt="smpit-wakasek /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smpit-wakasek__announcements.webp" width="360" alt="smpit-wakasek /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smpit-wakasek__kitab-progress.webp" width="360" alt="smpit-wakasek /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smpit-wakasek__homeroom__behavior.webp" width="360" alt="smpit-wakasek /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smpit-wakasek__homeroom__messages.webp" width="360" alt="smpit-wakasek /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smpit-wakasek__quality__complaints.webp" width="360" alt="smpit-wakasek /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smpit-wakasek__homeroom__attendance.webp" width="360" alt="smpit-wakasek /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>smpit-wali-kelas</code> — 19 halaman</summary>

| Halaman                                                                                                                           | Rute                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/smpit-wali-kelas__ibadah.webp" width="360" alt="smpit-wali-kelas /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/smpit-wali-kelas__classes.webp" width="360" alt="smpit-wali-kelas /classes">                          | `/classes`             |
| <img src="docs/images/roles/smpit-wali-kelas__kinerja.webp" width="360" alt="smpit-wali-kelas /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/smpit-wali-kelas__tahfidz.webp" width="360" alt="smpit-wali-kelas /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/smpit-wali-kelas__teacher.webp" width="360" alt="smpit-wali-kelas /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/smpit-wali-kelas__e-office.webp" width="360" alt="smpit-wali-kelas /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/smpit-wali-kelas__homeroom.webp" width="360" alt="smpit-wali-kelas /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/smpit-wali-kelas__students.webp" width="360" alt="smpit-wali-kelas /students">                        | `/students`            |
| <img src="docs/images/roles/smpit-wali-kelas__portfolio.webp" width="360" alt="smpit-wali-kelas /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/smpit-wali-kelas__attendance.webp" width="360" alt="smpit-wali-kelas /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/smpit-wali-kelas__muhadatsah.webp" width="360" alt="smpit-wali-kelas /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/smpit-wali-kelas__muhadhoroh.webp" width="360" alt="smpit-wali-kelas /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/smpit-wali-kelas__daily-report.webp" width="360" alt="smpit-wali-kelas /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/smpit-wali-kelas__announcements.webp" width="360" alt="smpit-wali-kelas /announcements">              | `/announcements`       |
| <img src="docs/images/roles/smpit-wali-kelas__kitab-progress.webp" width="360" alt="smpit-wali-kelas /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/smpit-wali-kelas__homeroom__behavior.webp" width="360" alt="smpit-wali-kelas /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/smpit-wali-kelas__homeroom__messages.webp" width="360" alt="smpit-wali-kelas /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/smpit-wali-kelas__quality__complaints.webp" width="360" alt="smpit-wali-kelas /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/smpit-wali-kelas__homeroom__attendance.webp" width="360" alt="smpit-wali-kelas /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>super-admin</code> — 42 halaman</summary>

| Halaman                                                                                                               | Rute                  |
| --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/super-admin__hr.webp" width="360" alt="super-admin /hr">                                  | `/hr`                 |
| <img src="docs/images/roles/super-admin__tk.webp" width="360" alt="super-admin /tk">                                  | `/tk`                 |
| <img src="docs/images/roles/super-admin__emis.webp" width="360" alt="super-admin /emis">                              | `/emis`               |
| <img src="docs/images/roles/super-admin__spmb.webp" width="360" alt="super-admin /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/super-admin__users.webp" width="360" alt="super-admin /users">                            | `/users`              |
| <img src="docs/images/roles/super-admin__alumni.webp" width="360" alt="super-admin /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/super-admin__health.webp" width="360" alt="super-admin /health">                          | `/health`             |
| <img src="docs/images/roles/super-admin__ibadah.webp" width="360" alt="super-admin /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/super-admin__classes.webp" width="360" alt="super-admin /classes">                        | `/classes`            |
| <img src="docs/images/roles/super-admin__finance.webp" width="360" alt="super-admin /finance">                        | `/finance`            |
| <img src="docs/images/roles/super-admin__kinerja.webp" width="360" alt="super-admin /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/super-admin__library.webp" width="360" alt="super-admin /library">                        | `/library`            |
| <img src="docs/images/roles/super-admin__payroll.webp" width="360" alt="super-admin /payroll">                        | `/payroll`            |
| <img src="docs/images/roles/super-admin__project.webp" width="360" alt="super-admin /project">                        | `/project`            |
| <img src="docs/images/roles/super-admin__quality.webp" width="360" alt="super-admin /quality">                        | `/quality`            |
| <img src="docs/images/roles/super-admin__reports.webp" width="360" alt="super-admin /reports">                        | `/reports`            |
| <img src="docs/images/roles/super-admin__tahfidz.webp" width="360" alt="super-admin /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/super-admin__talenta.webp" width="360" alt="super-admin /talenta">                        | `/talenta`            |
| <img src="docs/images/roles/super-admin__wilayah.webp" width="360" alt="super-admin /wilayah">                        | `/wilayah`            |
| <img src="docs/images/roles/super-admin__donation.webp" width="360" alt="super-admin /donation">                      | `/donation`           |
| <img src="docs/images/roles/super-admin__e-office.webp" width="360" alt="super-admin /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/super-admin__settings.webp" width="360" alt="super-admin /settings">                      | `/settings`           |
| <img src="docs/images/roles/super-admin__students.webp" width="360" alt="super-admin /students">                      | `/students`           |
| <img src="docs/images/roles/super-admin__analytics.webp" width="360" alt="super-admin /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/super-admin__dashboard.webp" width="360" alt="super-admin /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/super-admin__marketing.webp" width="360" alt="super-admin /marketing">                    | `/marketing`          |
| <img src="docs/images/roles/super-admin__reception.webp" width="360" alt="super-admin /reception">                    | `/reception`          |
| <img src="docs/images/roles/super-admin__assessment.webp" width="360" alt="super-admin /assessment">                  | `/assessment`         |
| <img src="docs/images/roles/super-admin__attendance.webp" width="360" alt="super-admin /attendance">                  | `/attendance`         |
| <img src="docs/images/roles/super-admin__counseling.webp" width="360" alt="super-admin /counseling">                  | `/counseling`         |
| <img src="docs/images/roles/super-admin__facilities.webp" width="360" alt="super-admin /facilities">                  | `/facilities`         |
| <img src="docs/images/roles/super-admin__foundation.webp" width="360" alt="super-admin /foundation">                  | `/foundation`         |
| <img src="docs/images/roles/super-admin__muhadhoroh.webp" width="360" alt="super-admin /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/super-admin__unit-usaha.webp" width="360" alt="super-admin /unit-usaha">                  | `/unit-usaha`         |
| <img src="docs/images/roles/super-admin__dormitories.webp" width="360" alt="super-admin /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/super-admin__perencanaan.webp" width="360" alt="super-admin /perencanaan">                | `/perencanaan`        |
| <img src="docs/images/roles/super-admin__procurement.webp" width="360" alt="super-admin /procurement">                | `/procurement`        |
| <img src="docs/images/roles/super-admin__grc-dashboard.webp" width="360" alt="super-admin /grc-dashboard">            | `/grc-dashboard`      |
| <img src="docs/images/roles/super-admin__notifications.webp" width="360" alt="super-admin /notifications">            | `/notifications`      |
| <img src="docs/images/roles/super-admin__kitab-progress.webp" width="360" alt="super-admin /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/super-admin__extracurricular.webp" width="360" alt="super-admin /extracurricular">        | `/extracurricular`    |
| <img src="docs/images/roles/super-admin__finance__accounting.webp" width="360" alt="super-admin /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>tkq-admin</code> — 40 halaman</summary>

| Halaman                                                                                                           | Rute                  |
| ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/tkq-admin__hr.webp" width="360" alt="tkq-admin /hr">                                  | `/hr`                 |
| <img src="docs/images/roles/tkq-admin__tk.webp" width="360" alt="tkq-admin /tk">                                  | `/tk`                 |
| <img src="docs/images/roles/tkq-admin__emis.webp" width="360" alt="tkq-admin /emis">                              | `/emis`               |
| <img src="docs/images/roles/tkq-admin__spmb.webp" width="360" alt="tkq-admin /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/tkq-admin__users.webp" width="360" alt="tkq-admin /users">                            | `/users`              |
| <img src="docs/images/roles/tkq-admin__alumni.webp" width="360" alt="tkq-admin /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/tkq-admin__health.webp" width="360" alt="tkq-admin /health">                          | `/health`             |
| <img src="docs/images/roles/tkq-admin__ibadah.webp" width="360" alt="tkq-admin /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/tkq-admin__classes.webp" width="360" alt="tkq-admin /classes">                        | `/classes`            |
| <img src="docs/images/roles/tkq-admin__finance.webp" width="360" alt="tkq-admin /finance">                        | `/finance`            |
| <img src="docs/images/roles/tkq-admin__kinerja.webp" width="360" alt="tkq-admin /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/tkq-admin__library.webp" width="360" alt="tkq-admin /library">                        | `/library`            |
| <img src="docs/images/roles/tkq-admin__payroll.webp" width="360" alt="tkq-admin /payroll">                        | `/payroll`            |
| <img src="docs/images/roles/tkq-admin__project.webp" width="360" alt="tkq-admin /project">                        | `/project`            |
| <img src="docs/images/roles/tkq-admin__quality.webp" width="360" alt="tkq-admin /quality">                        | `/quality`            |
| <img src="docs/images/roles/tkq-admin__reports.webp" width="360" alt="tkq-admin /reports">                        | `/reports`            |
| <img src="docs/images/roles/tkq-admin__tahfidz.webp" width="360" alt="tkq-admin /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/tkq-admin__talenta.webp" width="360" alt="tkq-admin /talenta">                        | `/talenta`            |
| <img src="docs/images/roles/tkq-admin__donation.webp" width="360" alt="tkq-admin /donation">                      | `/donation`           |
| <img src="docs/images/roles/tkq-admin__e-office.webp" width="360" alt="tkq-admin /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/tkq-admin__settings.webp" width="360" alt="tkq-admin /settings">                      | `/settings`           |
| <img src="docs/images/roles/tkq-admin__students.webp" width="360" alt="tkq-admin /students">                      | `/students`           |
| <img src="docs/images/roles/tkq-admin__analytics.webp" width="360" alt="tkq-admin /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/tkq-admin__dashboard.webp" width="360" alt="tkq-admin /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/tkq-admin__marketing.webp" width="360" alt="tkq-admin /marketing">                    | `/marketing`          |
| <img src="docs/images/roles/tkq-admin__reception.webp" width="360" alt="tkq-admin /reception">                    | `/reception`          |
| <img src="docs/images/roles/tkq-admin__assessment.webp" width="360" alt="tkq-admin /assessment">                  | `/assessment`         |
| <img src="docs/images/roles/tkq-admin__attendance.webp" width="360" alt="tkq-admin /attendance">                  | `/attendance`         |
| <img src="docs/images/roles/tkq-admin__counseling.webp" width="360" alt="tkq-admin /counseling">                  | `/counseling`         |
| <img src="docs/images/roles/tkq-admin__facilities.webp" width="360" alt="tkq-admin /facilities">                  | `/facilities`         |
| <img src="docs/images/roles/tkq-admin__muhadhoroh.webp" width="360" alt="tkq-admin /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/tkq-admin__unit-usaha.webp" width="360" alt="tkq-admin /unit-usaha">                  | `/unit-usaha`         |
| <img src="docs/images/roles/tkq-admin__dormitories.webp" width="360" alt="tkq-admin /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/tkq-admin__perencanaan.webp" width="360" alt="tkq-admin /perencanaan">                | `/perencanaan`        |
| <img src="docs/images/roles/tkq-admin__procurement.webp" width="360" alt="tkq-admin /procurement">                | `/procurement`        |
| <img src="docs/images/roles/tkq-admin__grc-dashboard.webp" width="360" alt="tkq-admin /grc-dashboard">            | `/grc-dashboard`      |
| <img src="docs/images/roles/tkq-admin__notifications.webp" width="360" alt="tkq-admin /notifications">            | `/notifications`      |
| <img src="docs/images/roles/tkq-admin__kitab-progress.webp" width="360" alt="tkq-admin /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/tkq-admin__extracurricular.webp" width="360" alt="tkq-admin /extracurricular">        | `/extracurricular`    |
| <img src="docs/images/roles/tkq-admin__finance__accounting.webp" width="360" alt="tkq-admin /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>tkq-bendahara</code> — 13 halaman</summary>

| Halaman                                                                                                                   | Rute                  |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/tkq-bendahara__spmb.webp" width="360" alt="tkq-bendahara /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/tkq-bendahara__staff.webp" width="360" alt="tkq-bendahara /staff">                            | `/staff`              |
| <img src="docs/images/roles/tkq-bendahara__health.webp" width="360" alt="tkq-bendahara /health">                          | `/health`             |
| <img src="docs/images/roles/tkq-bendahara__finance.webp" width="360" alt="tkq-bendahara /finance">                        | `/finance`            |
| <img src="docs/images/roles/tkq-bendahara__kinerja.webp" width="360" alt="tkq-bendahara /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/tkq-bendahara__permits.webp" width="360" alt="tkq-bendahara /permits">                        | `/permits`            |
| <img src="docs/images/roles/tkq-bendahara__rewards.webp" width="360" alt="tkq-bendahara /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/tkq-bendahara__e-office.webp" width="360" alt="tkq-bendahara /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/tkq-bendahara__students.webp" width="360" alt="tkq-bendahara /students">                      | `/students`           |
| <img src="docs/images/roles/tkq-bendahara__lingkungan.webp" width="360" alt="tkq-bendahara /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/tkq-bendahara__violations.webp" width="360" alt="tkq-bendahara /violations">                  | `/violations`         |
| <img src="docs/images/roles/tkq-bendahara__announcements.webp" width="360" alt="tkq-bendahara /announcements">            | `/announcements`      |
| <img src="docs/images/roles/tkq-bendahara__quality__complaints.webp" width="360" alt="tkq-bendahara /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>tkq-guru</code> — 19 halaman</summary>

| Halaman                                                                                                           | Rute                   |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/tkq-guru__ibadah.webp" width="360" alt="tkq-guru /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/tkq-guru__classes.webp" width="360" alt="tkq-guru /classes">                          | `/classes`             |
| <img src="docs/images/roles/tkq-guru__kinerja.webp" width="360" alt="tkq-guru /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/tkq-guru__tahfidz.webp" width="360" alt="tkq-guru /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/tkq-guru__teacher.webp" width="360" alt="tkq-guru /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/tkq-guru__e-office.webp" width="360" alt="tkq-guru /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/tkq-guru__homeroom.webp" width="360" alt="tkq-guru /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/tkq-guru__students.webp" width="360" alt="tkq-guru /students">                        | `/students`            |
| <img src="docs/images/roles/tkq-guru__portfolio.webp" width="360" alt="tkq-guru /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/tkq-guru__attendance.webp" width="360" alt="tkq-guru /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/tkq-guru__muhadatsah.webp" width="360" alt="tkq-guru /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/tkq-guru__muhadhoroh.webp" width="360" alt="tkq-guru /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/tkq-guru__daily-report.webp" width="360" alt="tkq-guru /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/tkq-guru__announcements.webp" width="360" alt="tkq-guru /announcements">              | `/announcements`       |
| <img src="docs/images/roles/tkq-guru__kitab-progress.webp" width="360" alt="tkq-guru /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/tkq-guru__homeroom__behavior.webp" width="360" alt="tkq-guru /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/tkq-guru__homeroom__messages.webp" width="360" alt="tkq-guru /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/tkq-guru__quality__complaints.webp" width="360" alt="tkq-guru /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/tkq-guru__homeroom__attendance.webp" width="360" alt="tkq-guru /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>tkq-kepala-sekolah</code> — 19 halaman</summary>

| Halaman                                                                                                                  | Rute             |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| <img src="docs/images/roles/tkq-kepala-sekolah__hr.webp" width="360" alt="tkq-kepala-sekolah /hr">                       | `/hr`            |
| <img src="docs/images/roles/tkq-kepala-sekolah__users.webp" width="360" alt="tkq-kepala-sekolah /users">                 | `/users`         |
| <img src="docs/images/roles/tkq-kepala-sekolah__classes.webp" width="360" alt="tkq-kepala-sekolah /classes">             | `/classes`       |
| <img src="docs/images/roles/tkq-kepala-sekolah__kinerja.webp" width="360" alt="tkq-kepala-sekolah /kinerja">             | `/kinerja`       |
| <img src="docs/images/roles/tkq-kepala-sekolah__permits.webp" width="360" alt="tkq-kepala-sekolah /permits">             | `/permits`       |
| <img src="docs/images/roles/tkq-kepala-sekolah__reports.webp" width="360" alt="tkq-kepala-sekolah /reports">             | `/reports`       |
| <img src="docs/images/roles/tkq-kepala-sekolah__rewards.webp" width="360" alt="tkq-kepala-sekolah /rewards">             | `/rewards`       |
| <img src="docs/images/roles/tkq-kepala-sekolah__tahfidz.webp" width="360" alt="tkq-kepala-sekolah /tahfidz">             | `/tahfidz`       |
| <img src="docs/images/roles/tkq-kepala-sekolah__e-office.webp" width="360" alt="tkq-kepala-sekolah /e-office">           | `/e-office`      |
| <img src="docs/images/roles/tkq-kepala-sekolah__settings.webp" width="360" alt="tkq-kepala-sekolah /settings">           | `/settings`      |
| <img src="docs/images/roles/tkq-kepala-sekolah__students.webp" width="360" alt="tkq-kepala-sekolah /students">           | `/students`      |
| <img src="docs/images/roles/tkq-kepala-sekolah__analytics.webp" width="360" alt="tkq-kepala-sekolah /analytics">         | `/analytics`     |
| <img src="docs/images/roles/tkq-kepala-sekolah__dashboard.webp" width="360" alt="tkq-kepala-sekolah /dashboard">         | `/dashboard`     |
| <img src="docs/images/roles/tkq-kepala-sekolah__admissions.webp" width="360" alt="tkq-kepala-sekolah /admissions">       | `/admissions`    |
| <img src="docs/images/roles/tkq-kepala-sekolah__assessment.webp" width="360" alt="tkq-kepala-sekolah /assessment">       | `/assessment`    |
| <img src="docs/images/roles/tkq-kepala-sekolah__attendance.webp" width="360" alt="tkq-kepala-sekolah /attendance">       | `/attendance`    |
| <img src="docs/images/roles/tkq-kepala-sekolah__violations.webp" width="360" alt="tkq-kepala-sekolah /violations">       | `/violations`    |
| <img src="docs/images/roles/tkq-kepala-sekolah__announcements.webp" width="360" alt="tkq-kepala-sekolah /announcements"> | `/announcements` |
| <img src="docs/images/roles/tkq-kepala-sekolah__notifications.webp" width="360" alt="tkq-kepala-sekolah /notifications"> | `/notifications` |

</details>

<details>
<summary><code>tkq-komite</code> — 10 halaman</summary>

| Halaman                                                                                                             | Rute                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/tkq-komite__finance.webp" width="360" alt="tkq-komite /finance">                        | `/finance`            |
| <img src="docs/images/roles/tkq-komite__quality.webp" width="360" alt="tkq-komite /quality">                        | `/quality`            |
| <img src="docs/images/roles/tkq-komite__reports.webp" width="360" alt="tkq-komite /reports">                        | `/reports`            |
| <img src="docs/images/roles/tkq-komite__rewards.webp" width="360" alt="tkq-komite /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/tkq-komite__donation.webp" width="360" alt="tkq-komite /donation">                      | `/donation`           |
| <img src="docs/images/roles/tkq-komite__schedule.webp" width="360" alt="tkq-komite /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/tkq-komite__students.webp" width="360" alt="tkq-komite /students">                      | `/students`           |
| <img src="docs/images/roles/tkq-komite__analytics.webp" width="360" alt="tkq-komite /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/tkq-komite__announcements.webp" width="360" alt="tkq-komite /announcements">            | `/announcements`      |
| <img src="docs/images/roles/tkq-komite__quality__complaints.webp" width="360" alt="tkq-komite /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>tkq-orang-tua</code> — 16 halaman</summary>

| Halaman                                                                                                                                                | Rute                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| <img src="docs/images/roles/tkq-orang-tua__parent.webp" width="360" alt="tkq-orang-tua /parent">                                                       | `/parent`                           |
| <img src="docs/images/roles/tkq-orang-tua__parent__health.webp" width="360" alt="tkq-orang-tua /parent/health">                                        | `/parent/health`                    |
| <img src="docs/images/roles/tkq-orang-tua__parent__ibadah.webp" width="360" alt="tkq-orang-tua /parent/ibadah">                                        | `/parent/ibadah`                    |
| <img src="docs/images/roles/tkq-orang-tua__parent__finance.webp" width="360" alt="tkq-orang-tua /parent/finance">                                      | `/parent/finance`                   |
| <img src="docs/images/roles/tkq-orang-tua__parent__permits.webp" width="360" alt="tkq-orang-tua /parent/permits">                                      | `/parent/permits`                   |
| <img src="docs/images/roles/tkq-orang-tua__parent__rewards.webp" width="360" alt="tkq-orang-tua /parent/rewards">                                      | `/parent/rewards`                   |
| <img src="docs/images/roles/tkq-orang-tua__parent__children.webp" width="360" alt="tkq-orang-tua /parent/children">                                    | `/parent/children`                  |
| <img src="docs/images/roles/tkq-orang-tua__parent__messages.webp" width="360" alt="tkq-orang-tua /parent/messages">                                    | `/parent/messages`                  |
| <img src="docs/images/roles/tkq-orang-tua__parent__counseling.webp" width="360" alt="tkq-orang-tua /parent/counseling">                                | `/parent/counseling`                |
| <img src="docs/images/roles/tkq-orang-tua__parent__violations.webp" width="360" alt="tkq-orang-tua /parent/violations">                                | `/parent/violations`                |
| <img src="docs/images/roles/tkq-orang-tua__quality__complaints.webp" width="360" alt="tkq-orang-tua /quality/complaints">                              | `/quality/complaints`               |
| <img src="docs/images/roles/tkq-orang-tua__parent__daily-report.webp" width="360" alt="tkq-orang-tua /parent/daily-report">                            | `/parent/daily-report`              |
| <img src="docs/images/roles/tkq-orang-tua__parent__report-cards.webp" width="360" alt="tkq-orang-tua /parent/report-cards">                            | `/parent/report-cards`              |
| <img src="docs/images/roles/tkq-orang-tua__parent__announcements.webp" width="360" alt="tkq-orang-tua /parent/announcements">                          | `/parent/announcements`             |
| <img src="docs/images/roles/tkq-orang-tua__parent__buku-penghubung.webp" width="360" alt="tkq-orang-tua /parent/buku-penghubung">                      | `/parent/buku-penghubung`           |
| <img src="docs/images/roles/tkq-orang-tua__parent__notifications__preferences.webp" width="360" alt="tkq-orang-tua /parent/notifications/preferences"> | `/parent/notifications/preferences` |

</details>

<details>
<summary><code>tkq-tata-usaha</code> — 13 halaman</summary>

| Halaman                                                                                                                     | Rute                  |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/tkq-tata-usaha__spmb.webp" width="360" alt="tkq-tata-usaha /spmb">                              | `/spmb`               |
| <img src="docs/images/roles/tkq-tata-usaha__staff.webp" width="360" alt="tkq-tata-usaha /staff">                            | `/staff`              |
| <img src="docs/images/roles/tkq-tata-usaha__health.webp" width="360" alt="tkq-tata-usaha /health">                          | `/health`             |
| <img src="docs/images/roles/tkq-tata-usaha__finance.webp" width="360" alt="tkq-tata-usaha /finance">                        | `/finance`            |
| <img src="docs/images/roles/tkq-tata-usaha__kinerja.webp" width="360" alt="tkq-tata-usaha /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/tkq-tata-usaha__permits.webp" width="360" alt="tkq-tata-usaha /permits">                        | `/permits`            |
| <img src="docs/images/roles/tkq-tata-usaha__rewards.webp" width="360" alt="tkq-tata-usaha /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/tkq-tata-usaha__e-office.webp" width="360" alt="tkq-tata-usaha /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/tkq-tata-usaha__students.webp" width="360" alt="tkq-tata-usaha /students">                      | `/students`           |
| <img src="docs/images/roles/tkq-tata-usaha__lingkungan.webp" width="360" alt="tkq-tata-usaha /lingkungan">                  | `/lingkungan`         |
| <img src="docs/images/roles/tkq-tata-usaha__violations.webp" width="360" alt="tkq-tata-usaha /violations">                  | `/violations`         |
| <img src="docs/images/roles/tkq-tata-usaha__announcements.webp" width="360" alt="tkq-tata-usaha /announcements">            | `/announcements`      |
| <img src="docs/images/roles/tkq-tata-usaha__quality__complaints.webp" width="360" alt="tkq-tata-usaha /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>tkq-wakasek</code> — 19 halaman</summary>

| Halaman                                                                                                                 | Rute                   |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/tkq-wakasek__ibadah.webp" width="360" alt="tkq-wakasek /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/tkq-wakasek__classes.webp" width="360" alt="tkq-wakasek /classes">                          | `/classes`             |
| <img src="docs/images/roles/tkq-wakasek__kinerja.webp" width="360" alt="tkq-wakasek /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/tkq-wakasek__tahfidz.webp" width="360" alt="tkq-wakasek /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/tkq-wakasek__teacher.webp" width="360" alt="tkq-wakasek /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/tkq-wakasek__e-office.webp" width="360" alt="tkq-wakasek /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/tkq-wakasek__homeroom.webp" width="360" alt="tkq-wakasek /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/tkq-wakasek__students.webp" width="360" alt="tkq-wakasek /students">                        | `/students`            |
| <img src="docs/images/roles/tkq-wakasek__portfolio.webp" width="360" alt="tkq-wakasek /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/tkq-wakasek__attendance.webp" width="360" alt="tkq-wakasek /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/tkq-wakasek__muhadatsah.webp" width="360" alt="tkq-wakasek /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/tkq-wakasek__muhadhoroh.webp" width="360" alt="tkq-wakasek /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/tkq-wakasek__daily-report.webp" width="360" alt="tkq-wakasek /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/tkq-wakasek__announcements.webp" width="360" alt="tkq-wakasek /announcements">              | `/announcements`       |
| <img src="docs/images/roles/tkq-wakasek__kitab-progress.webp" width="360" alt="tkq-wakasek /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/tkq-wakasek__homeroom__behavior.webp" width="360" alt="tkq-wakasek /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/tkq-wakasek__homeroom__messages.webp" width="360" alt="tkq-wakasek /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/tkq-wakasek__quality__complaints.webp" width="360" alt="tkq-wakasek /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/tkq-wakasek__homeroom__attendance.webp" width="360" alt="tkq-wakasek /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>tkq-wali-kelas</code> — 19 halaman</summary>

| Halaman                                                                                                                       | Rute                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| <img src="docs/images/roles/tkq-wali-kelas__ibadah.webp" width="360" alt="tkq-wali-kelas /ibadah">                            | `/ibadah`              |
| <img src="docs/images/roles/tkq-wali-kelas__classes.webp" width="360" alt="tkq-wali-kelas /classes">                          | `/classes`             |
| <img src="docs/images/roles/tkq-wali-kelas__kinerja.webp" width="360" alt="tkq-wali-kelas /kinerja">                          | `/kinerja`             |
| <img src="docs/images/roles/tkq-wali-kelas__tahfidz.webp" width="360" alt="tkq-wali-kelas /tahfidz">                          | `/tahfidz`             |
| <img src="docs/images/roles/tkq-wali-kelas__teacher.webp" width="360" alt="tkq-wali-kelas /teacher">                          | `/teacher`             |
| <img src="docs/images/roles/tkq-wali-kelas__e-office.webp" width="360" alt="tkq-wali-kelas /e-office">                        | `/e-office`            |
| <img src="docs/images/roles/tkq-wali-kelas__homeroom.webp" width="360" alt="tkq-wali-kelas /homeroom">                        | `/homeroom`            |
| <img src="docs/images/roles/tkq-wali-kelas__students.webp" width="360" alt="tkq-wali-kelas /students">                        | `/students`            |
| <img src="docs/images/roles/tkq-wali-kelas__portfolio.webp" width="360" alt="tkq-wali-kelas /portfolio">                      | `/portfolio`           |
| <img src="docs/images/roles/tkq-wali-kelas__attendance.webp" width="360" alt="tkq-wali-kelas /attendance">                    | `/attendance`          |
| <img src="docs/images/roles/tkq-wali-kelas__muhadatsah.webp" width="360" alt="tkq-wali-kelas /muhadatsah">                    | `/muhadatsah`          |
| <img src="docs/images/roles/tkq-wali-kelas__muhadhoroh.webp" width="360" alt="tkq-wali-kelas /muhadhoroh">                    | `/muhadhoroh`          |
| <img src="docs/images/roles/tkq-wali-kelas__daily-report.webp" width="360" alt="tkq-wali-kelas /daily-report">                | `/daily-report`        |
| <img src="docs/images/roles/tkq-wali-kelas__announcements.webp" width="360" alt="tkq-wali-kelas /announcements">              | `/announcements`       |
| <img src="docs/images/roles/tkq-wali-kelas__kitab-progress.webp" width="360" alt="tkq-wali-kelas /kitab-progress">            | `/kitab-progress`      |
| <img src="docs/images/roles/tkq-wali-kelas__homeroom__behavior.webp" width="360" alt="tkq-wali-kelas /homeroom/behavior">     | `/homeroom/behavior`   |
| <img src="docs/images/roles/tkq-wali-kelas__homeroom__messages.webp" width="360" alt="tkq-wali-kelas /homeroom/messages">     | `/homeroom/messages`   |
| <img src="docs/images/roles/tkq-wali-kelas__quality__complaints.webp" width="360" alt="tkq-wali-kelas /quality/complaints">   | `/quality/complaints`  |
| <img src="docs/images/roles/tkq-wali-kelas__homeroom__attendance.webp" width="360" alt="tkq-wali-kelas /homeroom/attendance"> | `/homeroom/attendance` |

</details>

<details>
<summary><code>ustadz</code> — 24 halaman</summary>

| Halaman                                                                                                     | Rute                  |
| ----------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/ustadz__meals.webp" width="360" alt="ustadz /meals">                            | `/meals`              |
| <img src="docs/images/roles/ustadz__health.webp" width="360" alt="ustadz /health">                          | `/health`             |
| <img src="docs/images/roles/ustadz__ibadah.webp" width="360" alt="ustadz /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/ustadz__laundry.webp" width="360" alt="ustadz /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/ustadz__musyrif.webp" width="360" alt="ustadz /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/ustadz__permits.webp" width="360" alt="ustadz /permits">                        | `/permits`            |
| <img src="docs/images/roles/ustadz__rewards.webp" width="360" alt="ustadz /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/ustadz__tahfidz.webp" width="360" alt="ustadz /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/ustadz__teacher.webp" width="360" alt="ustadz /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/ustadz__e-office.webp" width="360" alt="ustadz /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/ustadz__schedule.webp" width="360" alt="ustadz /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/ustadz__students.webp" width="360" alt="ustadz /students">                      | `/students`           |
| <img src="docs/images/roles/ustadz__takhosus.webp" width="360" alt="ustadz /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/ustadz__muhasabah.webp" width="360" alt="ustadz /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/ustadz__muhadatsah.webp" width="360" alt="ustadz /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/ustadz__muhadhoroh.webp" width="360" alt="ustadz /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/ustadz__violations.webp" width="360" alt="ustadz /violations">                  | `/violations`         |
| <img src="docs/images/roles/ustadz__dormitories.webp" width="360" alt="ustadz /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/ustadz__duty-roster.webp" width="360" alt="ustadz /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/ustadz__daily-report.webp" width="360" alt="ustadz /daily-report">              | `/daily-report`       |
| <img src="docs/images/roles/ustadz__announcements.webp" width="360" alt="ustadz /announcements">            | `/announcements`      |
| <img src="docs/images/roles/ustadz__kitab-progress.webp" width="360" alt="ustadz /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/ustadz__rapor-pesantren.webp" width="360" alt="ustadz /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/ustadz__quality__complaints.webp" width="360" alt="ustadz /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>wali-kamar</code> — 24 halaman</summary>

| Halaman                                                                                                             | Rute                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/wali-kamar__meals.webp" width="360" alt="wali-kamar /meals">                            | `/meals`              |
| <img src="docs/images/roles/wali-kamar__health.webp" width="360" alt="wali-kamar /health">                          | `/health`             |
| <img src="docs/images/roles/wali-kamar__ibadah.webp" width="360" alt="wali-kamar /ibadah">                          | `/ibadah`             |
| <img src="docs/images/roles/wali-kamar__laundry.webp" width="360" alt="wali-kamar /laundry">                        | `/laundry`            |
| <img src="docs/images/roles/wali-kamar__musyrif.webp" width="360" alt="wali-kamar /musyrif">                        | `/musyrif`            |
| <img src="docs/images/roles/wali-kamar__permits.webp" width="360" alt="wali-kamar /permits">                        | `/permits`            |
| <img src="docs/images/roles/wali-kamar__rewards.webp" width="360" alt="wali-kamar /rewards">                        | `/rewards`            |
| <img src="docs/images/roles/wali-kamar__tahfidz.webp" width="360" alt="wali-kamar /tahfidz">                        | `/tahfidz`            |
| <img src="docs/images/roles/wali-kamar__teacher.webp" width="360" alt="wali-kamar /teacher">                        | `/teacher`            |
| <img src="docs/images/roles/wali-kamar__e-office.webp" width="360" alt="wali-kamar /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/wali-kamar__schedule.webp" width="360" alt="wali-kamar /schedule">                      | `/schedule`           |
| <img src="docs/images/roles/wali-kamar__students.webp" width="360" alt="wali-kamar /students">                      | `/students`           |
| <img src="docs/images/roles/wali-kamar__takhosus.webp" width="360" alt="wali-kamar /takhosus">                      | `/takhosus`           |
| <img src="docs/images/roles/wali-kamar__muhasabah.webp" width="360" alt="wali-kamar /muhasabah">                    | `/muhasabah`          |
| <img src="docs/images/roles/wali-kamar__muhadatsah.webp" width="360" alt="wali-kamar /muhadatsah">                  | `/muhadatsah`         |
| <img src="docs/images/roles/wali-kamar__muhadhoroh.webp" width="360" alt="wali-kamar /muhadhoroh">                  | `/muhadhoroh`         |
| <img src="docs/images/roles/wali-kamar__violations.webp" width="360" alt="wali-kamar /violations">                  | `/violations`         |
| <img src="docs/images/roles/wali-kamar__dormitories.webp" width="360" alt="wali-kamar /dormitories">                | `/dormitories`        |
| <img src="docs/images/roles/wali-kamar__duty-roster.webp" width="360" alt="wali-kamar /duty-roster">                | `/duty-roster`        |
| <img src="docs/images/roles/wali-kamar__daily-report.webp" width="360" alt="wali-kamar /daily-report">              | `/daily-report`       |
| <img src="docs/images/roles/wali-kamar__announcements.webp" width="360" alt="wali-kamar /announcements">            | `/announcements`      |
| <img src="docs/images/roles/wali-kamar__kitab-progress.webp" width="360" alt="wali-kamar /kitab-progress">          | `/kitab-progress`     |
| <img src="docs/images/roles/wali-kamar__rapor-pesantren.webp" width="360" alt="wali-kamar /rapor-pesantren">        | `/rapor-pesantren`    |
| <img src="docs/images/roles/wali-kamar__quality__complaints.webp" width="360" alt="wali-kamar /quality/complaints"> | `/quality/complaints` |

</details>

<details>
<summary><code>yayasan-anggota</code> — 14 halaman</summary>

| Halaman                                                                                                                       | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/yayasan-anggota__alumni.webp" width="360" alt="yayasan-anggota /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/yayasan-anggota__finance.webp" width="360" alt="yayasan-anggota /finance">                        | `/finance`            |
| <img src="docs/images/roles/yayasan-anggota__kinerja.webp" width="360" alt="yayasan-anggota /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/yayasan-anggota__quality.webp" width="360" alt="yayasan-anggota /quality">                        | `/quality`            |
| <img src="docs/images/roles/yayasan-anggota__reports.webp" width="360" alt="yayasan-anggota /reports">                        | `/reports`            |
| <img src="docs/images/roles/yayasan-anggota__donation.webp" width="360" alt="yayasan-anggota /donation">                      | `/donation`           |
| <img src="docs/images/roles/yayasan-anggota__e-office.webp" width="360" alt="yayasan-anggota /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/yayasan-anggota__analytics.webp" width="360" alt="yayasan-anggota /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/yayasan-anggota__dashboard.webp" width="360" alt="yayasan-anggota /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/yayasan-anggota__foundation.webp" width="360" alt="yayasan-anggota /foundation">                  | `/foundation`         |
| <img src="docs/images/roles/yayasan-anggota__procurement.webp" width="360" alt="yayasan-anggota /procurement">                | `/procurement`        |
| <img src="docs/images/roles/yayasan-anggota__announcements.webp" width="360" alt="yayasan-anggota /announcements">            | `/announcements`      |
| <img src="docs/images/roles/yayasan-anggota__risk-management.webp" width="360" alt="yayasan-anggota /risk-management">        | `/risk-management`    |
| <img src="docs/images/roles/yayasan-anggota__finance__accounting.webp" width="360" alt="yayasan-anggota /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>yayasan-bendahara</code> — 14 halaman</summary>

| Halaman                                                                                                                           | Rute                  |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/yayasan-bendahara__alumni.webp" width="360" alt="yayasan-bendahara /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/yayasan-bendahara__finance.webp" width="360" alt="yayasan-bendahara /finance">                        | `/finance`            |
| <img src="docs/images/roles/yayasan-bendahara__kinerja.webp" width="360" alt="yayasan-bendahara /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/yayasan-bendahara__quality.webp" width="360" alt="yayasan-bendahara /quality">                        | `/quality`            |
| <img src="docs/images/roles/yayasan-bendahara__reports.webp" width="360" alt="yayasan-bendahara /reports">                        | `/reports`            |
| <img src="docs/images/roles/yayasan-bendahara__donation.webp" width="360" alt="yayasan-bendahara /donation">                      | `/donation`           |
| <img src="docs/images/roles/yayasan-bendahara__e-office.webp" width="360" alt="yayasan-bendahara /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/yayasan-bendahara__analytics.webp" width="360" alt="yayasan-bendahara /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/yayasan-bendahara__dashboard.webp" width="360" alt="yayasan-bendahara /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/yayasan-bendahara__foundation.webp" width="360" alt="yayasan-bendahara /foundation">                  | `/foundation`         |
| <img src="docs/images/roles/yayasan-bendahara__procurement.webp" width="360" alt="yayasan-bendahara /procurement">                | `/procurement`        |
| <img src="docs/images/roles/yayasan-bendahara__announcements.webp" width="360" alt="yayasan-bendahara /announcements">            | `/announcements`      |
| <img src="docs/images/roles/yayasan-bendahara__risk-management.webp" width="360" alt="yayasan-bendahara /risk-management">        | `/risk-management`    |
| <img src="docs/images/roles/yayasan-bendahara__finance__accounting.webp" width="360" alt="yayasan-bendahara /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>yayasan-ketua</code> — 14 halaman</summary>

| Halaman                                                                                                                   | Rute                  |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/yayasan-ketua__alumni.webp" width="360" alt="yayasan-ketua /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/yayasan-ketua__finance.webp" width="360" alt="yayasan-ketua /finance">                        | `/finance`            |
| <img src="docs/images/roles/yayasan-ketua__kinerja.webp" width="360" alt="yayasan-ketua /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/yayasan-ketua__quality.webp" width="360" alt="yayasan-ketua /quality">                        | `/quality`            |
| <img src="docs/images/roles/yayasan-ketua__reports.webp" width="360" alt="yayasan-ketua /reports">                        | `/reports`            |
| <img src="docs/images/roles/yayasan-ketua__donation.webp" width="360" alt="yayasan-ketua /donation">                      | `/donation`           |
| <img src="docs/images/roles/yayasan-ketua__e-office.webp" width="360" alt="yayasan-ketua /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/yayasan-ketua__analytics.webp" width="360" alt="yayasan-ketua /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/yayasan-ketua__dashboard.webp" width="360" alt="yayasan-ketua /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/yayasan-ketua__foundation.webp" width="360" alt="yayasan-ketua /foundation">                  | `/foundation`         |
| <img src="docs/images/roles/yayasan-ketua__procurement.webp" width="360" alt="yayasan-ketua /procurement">                | `/procurement`        |
| <img src="docs/images/roles/yayasan-ketua__announcements.webp" width="360" alt="yayasan-ketua /announcements">            | `/announcements`      |
| <img src="docs/images/roles/yayasan-ketua__risk-management.webp" width="360" alt="yayasan-ketua /risk-management">        | `/risk-management`    |
| <img src="docs/images/roles/yayasan-ketua__finance__accounting.webp" width="360" alt="yayasan-ketua /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>yayasan-pembina</code> — 14 halaman</summary>

| Halaman                                                                                                                       | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/yayasan-pembina__alumni.webp" width="360" alt="yayasan-pembina /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/yayasan-pembina__finance.webp" width="360" alt="yayasan-pembina /finance">                        | `/finance`            |
| <img src="docs/images/roles/yayasan-pembina__kinerja.webp" width="360" alt="yayasan-pembina /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/yayasan-pembina__quality.webp" width="360" alt="yayasan-pembina /quality">                        | `/quality`            |
| <img src="docs/images/roles/yayasan-pembina__reports.webp" width="360" alt="yayasan-pembina /reports">                        | `/reports`            |
| <img src="docs/images/roles/yayasan-pembina__donation.webp" width="360" alt="yayasan-pembina /donation">                      | `/donation`           |
| <img src="docs/images/roles/yayasan-pembina__e-office.webp" width="360" alt="yayasan-pembina /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/yayasan-pembina__analytics.webp" width="360" alt="yayasan-pembina /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/yayasan-pembina__dashboard.webp" width="360" alt="yayasan-pembina /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/yayasan-pembina__foundation.webp" width="360" alt="yayasan-pembina /foundation">                  | `/foundation`         |
| <img src="docs/images/roles/yayasan-pembina__procurement.webp" width="360" alt="yayasan-pembina /procurement">                | `/procurement`        |
| <img src="docs/images/roles/yayasan-pembina__announcements.webp" width="360" alt="yayasan-pembina /announcements">            | `/announcements`      |
| <img src="docs/images/roles/yayasan-pembina__risk-management.webp" width="360" alt="yayasan-pembina /risk-management">        | `/risk-management`    |
| <img src="docs/images/roles/yayasan-pembina__finance__accounting.webp" width="360" alt="yayasan-pembina /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>yayasan-pengawas</code> — 14 halaman</summary>

| Halaman                                                                                                                         | Rute                  |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/yayasan-pengawas__alumni.webp" width="360" alt="yayasan-pengawas /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/yayasan-pengawas__finance.webp" width="360" alt="yayasan-pengawas /finance">                        | `/finance`            |
| <img src="docs/images/roles/yayasan-pengawas__kinerja.webp" width="360" alt="yayasan-pengawas /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/yayasan-pengawas__quality.webp" width="360" alt="yayasan-pengawas /quality">                        | `/quality`            |
| <img src="docs/images/roles/yayasan-pengawas__reports.webp" width="360" alt="yayasan-pengawas /reports">                        | `/reports`            |
| <img src="docs/images/roles/yayasan-pengawas__donation.webp" width="360" alt="yayasan-pengawas /donation">                      | `/donation`           |
| <img src="docs/images/roles/yayasan-pengawas__e-office.webp" width="360" alt="yayasan-pengawas /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/yayasan-pengawas__analytics.webp" width="360" alt="yayasan-pengawas /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/yayasan-pengawas__dashboard.webp" width="360" alt="yayasan-pengawas /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/yayasan-pengawas__foundation.webp" width="360" alt="yayasan-pengawas /foundation">                  | `/foundation`         |
| <img src="docs/images/roles/yayasan-pengawas__procurement.webp" width="360" alt="yayasan-pengawas /procurement">                | `/procurement`        |
| <img src="docs/images/roles/yayasan-pengawas__announcements.webp" width="360" alt="yayasan-pengawas /announcements">            | `/announcements`      |
| <img src="docs/images/roles/yayasan-pengawas__risk-management.webp" width="360" alt="yayasan-pengawas /risk-management">        | `/risk-management`    |
| <img src="docs/images/roles/yayasan-pengawas__finance__accounting.webp" width="360" alt="yayasan-pengawas /finance/accounting"> | `/finance/accounting` |

</details>

<details>
<summary><code>yayasan-sekretaris</code> — 14 halaman</summary>

| Halaman                                                                                                                             | Rute                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| <img src="docs/images/roles/yayasan-sekretaris__alumni.webp" width="360" alt="yayasan-sekretaris /alumni">                          | `/alumni`             |
| <img src="docs/images/roles/yayasan-sekretaris__finance.webp" width="360" alt="yayasan-sekretaris /finance">                        | `/finance`            |
| <img src="docs/images/roles/yayasan-sekretaris__kinerja.webp" width="360" alt="yayasan-sekretaris /kinerja">                        | `/kinerja`            |
| <img src="docs/images/roles/yayasan-sekretaris__quality.webp" width="360" alt="yayasan-sekretaris /quality">                        | `/quality`            |
| <img src="docs/images/roles/yayasan-sekretaris__reports.webp" width="360" alt="yayasan-sekretaris /reports">                        | `/reports`            |
| <img src="docs/images/roles/yayasan-sekretaris__donation.webp" width="360" alt="yayasan-sekretaris /donation">                      | `/donation`           |
| <img src="docs/images/roles/yayasan-sekretaris__e-office.webp" width="360" alt="yayasan-sekretaris /e-office">                      | `/e-office`           |
| <img src="docs/images/roles/yayasan-sekretaris__analytics.webp" width="360" alt="yayasan-sekretaris /analytics">                    | `/analytics`          |
| <img src="docs/images/roles/yayasan-sekretaris__dashboard.webp" width="360" alt="yayasan-sekretaris /dashboard">                    | `/dashboard`          |
| <img src="docs/images/roles/yayasan-sekretaris__foundation.webp" width="360" alt="yayasan-sekretaris /foundation">                  | `/foundation`         |
| <img src="docs/images/roles/yayasan-sekretaris__procurement.webp" width="360" alt="yayasan-sekretaris /procurement">                | `/procurement`        |
| <img src="docs/images/roles/yayasan-sekretaris__announcements.webp" width="360" alt="yayasan-sekretaris /announcements">            | `/announcements`      |
| <img src="docs/images/roles/yayasan-sekretaris__risk-management.webp" width="360" alt="yayasan-sekretaris /risk-management">        | `/risk-management`    |
| <img src="docs/images/roles/yayasan-sekretaris__finance__accounting.webp" width="360" alt="yayasan-sekretaris /finance/accounting"> | `/finance/accounting` |

</details>

<!-- END:GENERATED-ROLES -->

---

## Fitur Utama

- **Multi-unit** — TK, SD, SMP, SMA, dan pesantren dalam satu dashboard
  terpusat, dengan unit sebagai _scope_ data.
- **Tahfidz & kepesantrenan** — target hafalan, setoran (ziyadah/murojaah),
  simaan/tasmi', kitab, ibadah harian, dan poin kedisiplinan.
- **Akademik terpadu** — kelas, jadwal, absensi, penilaian, rapor K13 &
  Kurikulum Merdeka, CBT.
- **Keuangan** — SPP, uang gedung, tabungan santri (e-wallet), payroll, dan
  laporan yayasan.
- **SDM & e-office** — kepegawaian, cuti, presensi, surat-menyurat dengan
  tanda tangan elektronik dan tautan verifikasi.
- **Portal orang tua** — hafalan, akademik, kesehatan, dan tagihan anak.
- **PWA** — aplikasi mobile adalah Web ini yang dipasang sebagai PWA
  (khusus host portal).

---

## Modul API

Modul API tersusun per domain. Ringkasannya:

| Domain             | Contoh modul                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autentikasi & RBAC | `auth`, `roles`, `users`                                                                                                                                 |
| Akademik           | `students`, `classes`, `academic-years`, `attendance`, `assessment`, `curriculum`, `kurikulum-merdeka`, `cbt`, `reporting`                               |
| Kepesantrenan      | `tahfidz`, `takhosus`, `simaan`, `murojaah`, `ibadah`, `muhasabah`, `kitab-progress`, `muhadhoroh`, `muhadatsah`, `dormitories`, `violations`, `rewards` |
| Keuangan & SDM     | `finance`, `payroll`, `hr`, `procurement`, `inventory`, `suppliers`                                                                                      |
| Layanan            | `library`, `health`, `meals`, `laundry`, `canteen`, `facilities`                                                                                         |
| Komunikasi         | `announcements`, `messages`, `notifications`, `correspondence`, `chatbot`                                                                                |
| Yayasan & mutu     | `foundation`, `quality`, `risk`, `research`, `marketing`, `spmb`                                                                                         |
| Portal             | `parent`, `portfolio`, `wallet`, `alumni`                                                                                                                |

Dokumentasi API interaktif tersedia di `/api/docs` ketika service API berjalan.

---

## Teknologi

**Backend (`apps/api`)**

- Express 5, TypeScript 5, Zod
- PostgreSQL 17 via Prisma 7 (`@prisma/adapter-pg`)
- Socket.IO + Redis (realtime), ioredis
- JWT (access/refresh) + 2FA (otplib)
- Vitest (unit) + suite integrasi DB opt-in

**Frontend (`apps/web`)**

- Next.js 16 (App Router), React 19
- Tailwind CSS + Radix UI (shadcn/ui)
- React Query, Zustand
- Playwright (e2e) + Vitest (unit)

**Infrastruktur**

- pnpm workspaces + Turborepo
- Docker & Docker Compose
- GitHub Actions

---

## Menjalankan Secara Lokal

### Prasyarat

- Node.js 20+ (dikembangkan pada Node 22)
- pnpm 9 (lewat Corepack)
- PostgreSQL 15+ (17 direkomendasikan) — atau Docker
- Redis 7+ (opsional; hanya untuk fitur realtime)

### Langkah

```bash
# 1. Install dependency
pnpm install

# 2. Konfigurasi environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# sesuaikan DATABASE_URL / REDIS_URL / JWT_SECRET

# 3. Bangun paket shared (dipakai kedua aplikasi)
pnpm --filter @cipansor/shared build

# 4. Siapkan database
pnpm --filter api db:generate
pnpm --filter api db:push
pnpm --filter api db:seed

# 5. Jalankan (API + Web)
pnpm dev
```

Akses:

- Web: `http://localhost:3000`
- API: `http://localhost:3001` (health check `/health`)

### Menjalankan stack lokal dengan Docker

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres + Redis
pnpm --filter api db:push
pnpm --filter api db:seed
pnpm dev
```

### Login demo

Halaman login (`/login`) menampilkan kartu akun demo — satu per peran.
Kata sandi default ada di `DEMO_PASSWORD` (`packages/shared/src/types/demo-accounts.ts`).

---

## Testing

```bash
# API — unit (Prisma dimock)
pnpm --filter api test

# Web — unit
pnpm --filter web test

# Web — end-to-end (butuh stack + seed)
pnpm --filter web test:e2e
```

**Playwright** memakai Page Object Model + fixture di `apps/web/e2e`. Spesifikasi
menjalankan alur nyata melawan API yang sudah di-seed, bukan mock.

---

## Visual QA

Selain e2e, ada dua skrip sweep yang merender **setiap** halaman lalu menyimpan
tangkapan layar, sekaligus menandai halaman yang kosong, melempar error, memantul
ke rute lain, atau _overflow_ horizontal:

```bash
cd apps/web
# Seluruh rute App Router (login sebagai SUPER_ADMIN)
../api/node_modules/.bin/tsx scripts/screenshot-all.ts .qa-all
# Setiap menu per peran (semua akun demo)
../api/node_modules/.bin/tsx scripts/screenshot-roles.ts .qa-screens
```

Keduanya memerlukan stack lokal yang sudah di-seed. Hasil terakhir:

| Sweep              | Cakupan                                     | Kegagalan |
| ------------------ | ------------------------------------------- | --------- |
| `screenshot-all`   | 781 tangkapan (755 rute unik + host publik) | **0**     |
| `screenshot-roles` | 1.200 halaman di 66 peran                   | **0**     |

Skrip juga menghapus toast Sonner sebelum menangkap gambar, sehingga banner
"akses ditolak" yang bersifat sementara tidak menutupi halaman yang sebenarnya
baik. Permintaan API yang ditolak karena RBAC (403/404 yang memang disengaja)
dicatat sebagai **peringatan**, bukan kegagalan.

Setelah sweep, dua skrip membangun galeri di README dan
`docs/images` dari tangkapan terbaru:

```bash
python3 scripts/audit-screenshots.py apps/web/.qa-all      # deteksi halaman kosong
python3 scripts/audit-screenshots.py apps/web/.qa-screens
python3 scripts/build-doc-images.py       # gambar utama docs/images
python3 scripts/build-page-gallery.py     # galeri lengkap (755 halaman)
python3 scripts/build-role-gallery.py     # galeri per peran (66 peran)
python3 scripts/check-doc-refs.py         # gagal bila ada gambar yatim
```

> Galeri adalah hasil generate — jangan menyunting bagian di antara penanda
> `BEGIN:GENERATED-GALLERY`/`BEGIN:GENERATED-ROLES` di README secara manual.
> `audit-screenshots.py` memakai allowlist kecil untuk halaman yang memang
> hampir seluruhnya putih (mis. `/unauthorized`); setiap entri wajib beralasan.
> Nama berkas galeri tidak boleh memuat query string — rute dinamis yang
> membawanya diganti dengan sufiks `__q<hash>` oleh `build-page-gallery.py`.

---

## Kualitas & Gate Rilis

Jalankan seluruh gate berikut **secara lokal** sebelum push — CI hanya jaring
pengaman:

```bash
pnpm --filter @cipansor/shared build
pnpm --filter api db:generate
pnpm --filter api build          # tsc (build config)
pnpm --filter api build:strict   # tsc strict — target sebenarnya
pnpm --filter api test
pnpm --filter web build
pnpm --filter web test
pnpm --filter web test:e2e
pnpm format
pnpm lint
```

Aturan yang dijaga gate ini:

- Setiap service/controller baru **wajib** membawa test vitest pada commit yang sama.
- Setiap route/alur web baru **wajib** membawa cakupan e2e Playwright.
- Fitur harus terhubung end-to-end: endpoint baru disertai konsumen web-nya,
  dan halaman tanpa data mock.
- Jangan pernah menimpa `apps/api/prisma/schema.prisma` secara keseluruhan —
  edit dengan bedah.

---

## Dokumentasi

| Dokumen                                                    | Isi                                            |
| ---------------------------------------------------------- | ---------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)             | Peta sistem, alur request, dua host            |
| [`docs/QUICK_START.md`](docs/QUICK_START.md)               | Orientasi cepat untuk kontributor baru         |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                 | Deployment produksi                            |
| [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)             | Cacat & technical debt                         |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                       | Rencana kerja berikutnya                       |
| [`docs/MOBILE_API.md`](docs/MOBILE_API.md)                 | Kontrak API aplikasi wali (PWA)                |
| [`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md)               | Konfigurasi email keluar                       |
| [`docs/EOFFICE_ESIGN_PLAN.md`](docs/EOFFICE_ESIGN_PLAN.md) | Rencana e-office & e-signature                 |
| [`docs/planning/`](docs/planning/)                         | Dokumen desain awal (backend, DB, chatbot, UI) |
| [`AGENTS.md`](AGENTS.md)                                   | Konvensi kanonik untuk agen & developer        |

---

## Kontribusi

1. Buat branch dari `main` (mis. `feat/fitur-keren`).
2. Terapkan perubahan + test-nya.
3. Jalankan gate kualitas di atas.
4. Commit dengan pesan jelas, push ke branch.
5. Buka Pull Request ke `main`.

Jangan push langsung ke `main`.

---

## Lisensi

Dilisensikan di bawah [MIT License](LICENSE).

---

**Dibuat dengan ❤️ untuk kemajuan pendidikan Islam di Indonesia**
