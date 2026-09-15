# CIPANSOR

> **Sistem Informasi Cipansor** - Platform terintegrasi untuk TK, SD IT, SMP IT, SMA Al-Qur'an dengan fokus tahfidz dan kurikulum pesantren terintegrasi.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-blueviolet.svg)](https://www.prisma.io/)
[![Express](https://img.shields.io/badge/Express-5-green.svg)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📋 Daftar Isi

- [Overview](#-overview)
- [Antarmuka](#-antarmuka)
- [Fitur Utama](#-fitur-utama)
- [Modul](#-modul)
- [Teknologi](#-teknologi)
- [Instalasi](#-instalasi)
- [Pengembangan](#-pengembangan)
- [Dokumentasi API](#-dokumentasi-api)
- [Kontribusi](#-kontribusi)
- [Lisensi](#-lisensi)

---

## 🎯 Overview

**Cipansor** adalah sistem manajemen terintegrasi (ERP) yang dirancang khusus untuk kebutuhan **Yayasan Pesantren Cipansor**. Sistem ini mengelola berbagai unit pendidikan mulai dari TK, SD IT, SMP IT, hingga SMA Al-Qur'an dalam satu platform terpadu.

Sistem ini menggabungkan manajemen akademik sekolah formal dengan manajemen kepesantrenan (tahfidz, asrama, perizinan) serta manajemen administratif yayasan (keuangan, SDM, aset).

---

## 💻 Antarmuka

Cipansor menyediakan antarmuka modern yang responsif dan terorganisir berdasarkan modul fungsional.

### 1. Dashboard Eksekutif & Unit

Pusat kendali utama untuk memantau statistik dan kinerja seluruh unit pendidikan.

| Dashboard Global                                      | Dashboard SMA Al-Qur'an                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| ![Dashboard Global](docs/images/dashboard-global.png) | ![Dashboard SMA](docs/images/dashboard-sma.png) |

| Dashboard SMP IT                                | Dashboard SD IT                               |
| ----------------------------------------------- | --------------------------------------------- |
| ![Dashboard SMP](docs/images/dashboard-smp.png) | ![Dashboard SD](docs/images/dashboard-sd.png) |

| Dashboard PAUD/TK                                 | Dashboard Umum                          |
| ------------------------------------------------- | --------------------------------------- |
| ![Dashboard PAUD](docs/images/dashboard-paud.png) | ![Dashboard](docs/images/dashboard.png) |

| Login System                    |     |
| ------------------------------- | --- |
| ![Login](docs/images/login.png) |     |

### 2. Manajemen Yayasan & Administrasi (Foundation)

Pengelolaan sumber daya yayasan, keuangan, dan administrasi perkantoran.

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

| Dashboard Staff                 |     |
| ------------------------------- | --- |
| ![Staff](docs/images/staff.png) |     |

### 3. Akademik & Pembelajaran

Sistem administrasi sekolah yang komprehensif.

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

| Detail Siswa                                      |     |
| ------------------------------------------------- | --- |
| ![Student Detail](docs/images/student-detail.png) |     |

| Perpustakaan                        | Rapor PAUD                                     |
| ----------------------------------- | ---------------------------------------------- |
| ![Library](docs/images/library.png) | ![PAUD Rapor](docs/images/tk-daily-report.png) |

| Manajemen PAUD                | Daftar Siswa PAUD                       |
| ----------------------------- | --------------------------------------- |
| ![PAUD](docs/images/paud.png) | ![PAUD List](docs/images/paud-list.png) |

| Laporan Harian (Bulk)                                   |     |
| ------------------------------------------------------- | --- |
| ![Daily Report Bulk](docs/images/daily-report-bulk.png) |     |

| Portofolio Siswa                        |     |
| --------------------------------------- | --- |
| ![Portfolio](docs/images/portfolio.png) |     |

### 4. Kepesantrenan (Boarding System)

Fitur unggulan untuk manajemen pendidikan Islam berasrama.

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

Modul pendukung operasional harian dan pelayanan santri.

| Kesehatan (UKS)                   | Tabungan Santri (E-Wallet)        |
| --------------------------------- | --------------------------------- |
| ![Health](docs/images/health.png) | ![Wallet](docs/images/wallet.png) |

| Makan (Catering)                | Laundry                             |
| ------------------------------- | ----------------------------------- |
| ![Meals](docs/images/meals.png) | ![Laundry](docs/images/laundry.png) |

| Kantin                              | Inventaris & Aset                       |
| ----------------------------------- | --------------------------------------- |
| ![Canteen](docs/images/canteen.png) | ![Inventory](docs/images/inventory.png) |

| Fasilitas                                 | Jadwal Makan                    |
| ----------------------------------------- | ------------------------------- |
| ![Facilities](docs/images/facilities.png) | ![Meals](docs/images/meals.png) |

| Ekstrakurikuler                                     | Notifikasi                                      |
| --------------------------------------------------- | ----------------------------------------------- |
| ![Extracurricular](docs/images/extracurricular.png) | ![Notifications](docs/images/notifications.png) |

### 6. Komunikasi & Penerimaan

| Pengumuman & Notifikasi                | PSB & PPDB                    |
| -------------------------------------- | ----------------------------- |
| ![News](docs/images/announcements.png) | ![PPDB](docs/images/ppdb.png) |

| Portal PSB Online           |     |
| --------------------------- | --- |
| ![PSB](docs/images/psb.png) |     |

| Alumni                            | Donasi                                |
| --------------------------------- | ------------------------------------- |
| ![Alumni](docs/images/alumni.png) | ![Donation](docs/images/donation.png) |

### 7. Portal Wali Santri

Akses khusus bagi orang tua untuk memantau perkembangan anak.

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

| Pengaturan Sistem                     |     |
| ------------------------------------- | --- |
| ![Settings](docs/images/settings.png) |     |

| Manajemen User (Settings)                         | Tampilan & Tema                                    |
| ------------------------------------------------- | -------------------------------------------------- |
| ![Users Settings](docs/images/settings-users.png) | ![Appearance](docs/images/settings-appearance.png) |

---

## ✨ Fitur Utama

Sistem Cipansor memiliki fitur-fitur unggulan yang disesuaikan dengan kebutuhan pesantren modern:

- **Multi-Unit Management**: Mengelola TK, SD, SMP, SMA dalam satu dashboard terpusat.
- **Manajemen Tahfidz**: Pencatatan hafalan (ziyadah, murojaah), penilaian, dan laporan perkembangan santri.
- **Kesantrian & Asrama**: Pengelolaan kamar, perizinan keluar/pulang, pelanggaran, dan poin penghargaan.
- **Akademik Terpadu**: Jadwal pelajaran, absensi, penilaian, dan rapor (K13 & Kurikulum Merdeka).
- **Keuangan & SPP**: Tagihan otomatis, pembayaran via berbagai metode, dan laporan keuangan yayasan.
- **Portal Orang Tua**: Akses bagi wali santri untuk memantau hafalan, akademik, dan tagihan anak.

---

## 🧩 Modul

Cipansor terdiri dari berbagai modul yang saling terintegrasi:

### 1. Modul Akademik

- Manajemen Siswa & Guru
- Kelas & Tahun Ajaran
- Jadwal Pelajaran
- Absensi (Siswa & Guru)
- Penilaian & Rapor

### 2. Modul Kepesantrenan

- **Tahfidz**: Target hafalan, setoran harian, ujian tahfidz.
- **Asrama**: Data kamar, penempatan santri, piket.
- **Perizinan**: Izin sakit, pulang, atau keluar komplek.
- **Kedisiplinan**: Poin pelanggaran dan prestasi.

### 3. Modul Administratif

- **Keuangan**: SPP, uang gedung, tabungan santri.
- **SDM**: Data pegawai, penggajian (payroll), cuti.
- **Aset & Inventaris**: Manajemen aset yayasan dan pemeliharaan.
- **PSB (Penerimaan Santri Baru)**: Pendaftaran online, seleksi, dan pengumuman.

### 4. Modul Pendukung

- **Perpustakaan**: Sirkulasi buku dan katalog.
- **UKS (Kesehatan)**: Rekam medis santri dan stok obat.
- **Alumni**: Database alumni dan legalisir ijazah.

---

## 🛠 Teknologi

Dibangun dengan teknologi modern untuk performa dan skalabilitas tinggi:

### Backend (`apps/api`)

- **Framework**: Express.js
- **Bahasa**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Real-time**: Socket.IO + Redis
- **Testing**: Vitest

### Frontend (`apps/web`)

- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19, Tailwind CSS, shadcn/ui
- **State Management**: Zustand, React Query
- **Testing**: Playwright (E2E)

### Infrastruktur

- **Package Manager**: pnpm
- **Monorepo Tool**: Turborepo
- **Containerization**: Docker
- **CI/CD**: GitHub Actions

---

## 🚀 Instalasi

Ikuti langkah berikut untuk menjalankan proyek di lingkungan lokal Anda:

### Prasyarat

- Node.js (v20+)
- pnpm
- PostgreSQL
- Docker (Opsional)

### Langkah-langkah

1.  **Clone Repository**

    ```bash
    git clone https://github.com/your-org/cipansor.git
    cd cipansor
    ```

2.  **Install Dependencies**

    ```bash
    pnpm install
    ```

3.  **Setup Environment Variables**
    Salin file `.env.example` ke `.env` dan sesuaikan konfigurasinya.

    ```bash
    cp .env.example .env
    ```

4.  **Setup Database**
    Pastikan PostgreSQL berjalan, lalu jalankan migrasi dan seeding data awal.

    ```bash
    pnpm db:push
    pnpm db:seed
    ```

5.  **Jalankan Aplikasi**

    ```bash
    pnpm dev
    ```

    Akses aplikasi di:
    - Web: `http://localhost:3000`
    - API: `http://localhost:3001`

### Prasyarat Deployment: Regenerasi Kartu Pelajar

Verifikasi QR kartu pelajar/santri hanya menerima tanda tangan **HMAC-SHA256
16 karakter**, sesuai desain keamanan kartu fisik yang tidak boleh divalidasi
oleh hash lama yang mudah dipalsukan. **Kartu yang tercetak dengan QR generasi
lama (SHA-256 8 karakter tanpa secret TIDAK akan lolos verifikasi** dan harus
diregenerasi sebelum verifikasi ketat dipakai di produksi.

Sebelum mengaktifkan verifikasi ketat, jalankan regenerasi massal untuk
seluruh kartu aktif:

1. Masuk sebagai **SUPER_ADMIN** (atau admin unit yang bisa mengakses menu
   Generator Kartu Pelajar).
2. Buka **Generator Kartu Pelajar** (`/students/id-card`).
3. Pilih unit/kelas (atau biarkan kosong sebagai SUPER_ADMIN untuk semua unit),
   lalu klik **Regenerasi Kartu**.
4. Cetak ulang seluruh kartu yang sudah diregenerasi dan distribusikan ke
   pemegang kartu.

Endpoint `POST /api/students/id-cards/bulk-regenerate` melakukan regenerasi
tersebut. Tanpa langkah ini, kartu fisik lama akan ditolak oleh endpoint
verifikasi. Verifikasi QR 8 karakter/non-HMAC tetap ditolak oleh desain — ini
disengaja, bukan bug.

---

## 💻 Pengembangan

Perintah-perintah umum yang digunakan dalam pengembangan:

- `pnpm dev`: Menjalankan semua aplikasi dalam mode development.
- `pnpm build`: Membuild aplikasi untuk produksi.
- `pnpm lint`: Memeriksa kode dengan ESLint.
- `pnpm test`: Menjalankan unit test.
- `pnpm db:studio`: Membuka Prisma Studio untuk melihat data database.

### Testing

#### E2E Testing (Playwright)

```bash
# Run all E2E tests
cd apps/web
pnpm test:e2e

# Run with UI mode
pnpm test:e2e:ui

# Run in headed mode (see browser)
pnpm test:e2e:headed

# Debug tests
pnpm test:e2e:debug

# View test report
pnpm test:e2e:report

# Cross-browser testing
pnpm test:e2e:firefox
pnpm test:e2e:webkit
pnpm test:e2e:mobile

# Using test runner script (recommended)
./run-e2e.sh              # All tests with pre-flight checks
./run-e2e.sh --ui         # UI mode
./run-e2e.sh --file auth.spec.ts  # Specific file
```

**Test Coverage:**

- ✅ Authentication (11 tests)
- ✅ Dashboard Real-time (9 tests)
- ✅ Tahfidz Dashboard (8 tests)
- ✅ PAUD Module (15 tests)
- ✅ Finance Reports (5 tests)
- ✅ Analytics (8 tests)

**Total:** ~56 E2E tests | **Performance:** 62% faster | **Flakiness:** <5%

---

## 📚 Dokumentasi API

Dokumentasi lengkap API tersedia di endpoint `/docs` pada service API (jika Swagger diaktifkan) atau dapat dilihat pada file spesifikasi di folder `docs/`.

Contoh endpoint utama:

- `POST /api/auth/login`: Masuk ke sistem
- `GET /api/students`: Mengambil daftar santri
- `GET /api/tahfidz/records`: Mengambil data hafalan

---

## 🤝 Kontribusi

Kami menyambut kontribusi dari komunitas! Silakan ikuti langkah berikut:

1.  Fork repository ini.
2.  Buat branch fitur baru (`git checkout -b fitur-keren`).
3.  Commit perubahan Anda (`git commit -m 'Menambahkan fitur keren'`).
4.  Push ke branch (`git push origin fitur-keren`).
5.  Buat Pull Request.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

---

**Dibuat dengan ❤️ untuk Kemajuan Pendidikan Islam di Indonesia**
