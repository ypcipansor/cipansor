# Riwayat Revisi

| Versi | Tanggal | Basis aplikasi | Tingkat verifikasi | Perubahan |
|---|---|---|---|---|
| 0.1 | 29 September 2026 | commit `aefc719`, cabang `main` | **T2 — dari kode, belum dicoba di aplikasi berjalan** | Penyusunan awal |

> **Tingkat verifikasi T2.** Semua kartu tugas di bawah disusun dengan membaca
> kode pada commit yang tertera; belum dijalankan pada aplikasi berjalan.
> Setiap kartu bertanda ⚠ dan perlu diuji oleh seorang guru sungguhan sebelum
> dinaikkan ke T1.

# 1. Tentang Buklet Ini

Buklet ini untuk **guru** (`*_GURU`, `*_GURU_BK`) di semua unit — TK Qur'an,
SD IT, SMP IT, dan SMA Qur'an. Bagian umum (masuk, dasbor, konsep, glosarium)
ada di *Panduan Pengguna — Bagian Umum*.

## 1.1 Siapa Anda di aplikasi

Sebagai guru, dasbor awal Anda adalah `/teacher`. Menu Anda memuat kelompok
**Mengajar** (tahfidz, kelas, siswa, absensi, laporan harian/Mutabaah, portofolio)
dan, bila Anda ditunjuk wali kelas sebuah kelas pada tahun ajaran berjalan,
kelompok tambahan **Wali Kelas**. Wali kelas bukan kode peran terpisah: ia melekat
pada kelas (`Class.homeroomTeacherId`), sehingga bisa muncul dan hilang sesuai
penugasan Anda.

## 1.2 Yang bisa dan tidak bisa Anda lakukan

- Anda melihat kelas dan mata pelajaran yang Anda ampu; guru lain tidak.
- Anda **mengisi absensi** kelas yang Anda ajar maupun kelas yang Anda wali.
- Anda **memutuskan izin** hanya untuk santri yang menjadi tanggung jawab Anda:
  wali kelas untuk santri harian, musyrif untuk santri mukim. Untuk santri lain,
  tombolnya tidak muncul; kepala unit hanya turun tangan untuk izin panjang,
  santri tanpa pembimbing, atau ambil alih.
- Data anak hanya tampil sebatas lingkup kelas/unit Anda.

## 1.3 Tugas dalam buklet ini

| Tugas | Seberapa sering | Tersedia |
|---|---|---|
| Mencatat absensi harian | Harian | `main` (perbaikan #585; produksi menyusul) |
| Menindaklanjuti Alpa | Harian saat ada Alpa | `main` |
| Menulis catatan perilaku | Sesuai kejadian | `main` |
| Memutuskan izin santri | Sesuai pengajuan | `main` |

# 2. Tugas

## Mencatat absensi harian

> ⚠ **Belum dicoba di aplikasi berjalan.** Langkah disusun dari kode pada commit `aefc719`.

**Tujuan.** Mencatat kehadiran santri satu kelas untuk satu tanggal.

**Siapa.** Wali kelas kelas itu, guru yang mengajar di kelas itu, dan operator
unit. Guru lain tidak dapat mengisi.

**Jalur menu.** Wali Kelas → Absensi Harian — `\`/attendance/record\``.
Guru yang bukan wali kelas membuka Mengajar → Absensi — `\`/attendance\``.

**Sebelum mulai.** Kelas dan daftar santri tahun ajaran berjalan sudah ada.

**Langkah.**

1. Buka **Absensi Harian**. Halaman terbuka pada kelas tempat Anda wali kelas.
   *Judul kelas dan daftar santri tampil.*
2. Periksa **kelas** dan **tanggal**. Tanggal esok hari dan sesudahnya tidak
   dapat dipilih (tombolnya menonaktifkan tanggal setelah hari ini).
   *Tanggal terpilih menampilkan register hari itu.*
3. Untuk tiap santri, pilih status: **Hadir**, **Terlambat**, **Sakit**,
   **Izin**, atau **Alpa**.
   *Simbol ringkasan di atas memperbarui hitungannya.*
4. Gunakan **Semua Hadir** atau **Semua Tidak Hadir** bila ingin mengisi massal,
   lalu sesuaikan penyimpangannya.
5. Tambahkan **Keterangan** bila perlu.
6. Klik **Simpan Kehadiran**.
   *Muncul pesan hasil; menyimpan ulang pada tanggal yang sama memperbaiki
   register itu, bukan menggandakannya.*

**Hasilnya, dan giliran siapa berikutnya.** Register tersimpan. Bila ada Alpa
tanpa keterangan, muncul pekerjaan tindak lanjut untuk pemiliknya (wali kelas
untuk santri harian, musyrif untuk santri mukim).

**Bila tidak berhasil.**

| Yang terlihat | Penyebab umum | Yang perlu dilakukan |
|---|---|---|
| "Pilih kelas terlebih dahulu" | Belum memilih kelas | Pilih kelas lalu ulangi |
| Tombol **Simpan Kehadiran** nonaktif | Belum ada perubahan/perubahan tak lengkap | Periksa setiap santri terisi |
| 403 saat menyimpan | Anda bukan wali kelas, guru pengampu, atau operator unit ini | Pastikan Anda mengajar di kelas itu |

**Ketersediaan.** Sudah di `main`; belum tentu di produksi.

## Menindaklanjuti Alpa

> ⚠ **Belum dicoba di aplikasi berjalan.** Langkah disusun dari kode pada commit `aefc719`.

**Tujuan.** Menghubungi wali santri yang anaknya Alpa tanpa keterangan dan
mencatat hasilnya.

**Siapa.** Wali kelas (santri harian) atau musyrif (santri mukim).

**Jalur menu.** Wali Kelas → Tindak Lanjut Absensi — `\`/attendance/follow-ups\``.

**Sebelum mulai.** Ada Alpa tanpa keterangan dalam 7 hari terakhir.

**Langkah.**

1. Buka **Tindak Lanjut Absensi**.
   *Daftar Alpa 7 hari terakhir, lengkap dengan kontak wali dan yang sudah
   dicoba.*
2. Hubungi wali memakai tautan telepon atau WhatsApp pada baris itu.
3. Klik **Catat hasil**.
   *Dialog "Catat hasil tindak lanjut" terbuka.*
4. Isi hasil kontaknya, lalu klik **Simpan**.

**Hasilnya, dan giliran siapa berikutnya.** Hasil kontak tercatat; status Alpa
dapat berubah menjadi Sakit/Izin bila wali memberi alasan.

**Bila tidak berhasil.**

| Yang terlihat | Penyebab umum | Yang perlu dilakukan |
|---|---|---|
| Daftar kosong | Tidak ada Alpa tanpa keterangan | Tidak ada tindakan |
| Baris milik musyrif | Santri itu mukim | Musyrifnya yang menindaklanjuti |

**Ketersediaan.** Sudah di `main`.

## Menulis catatan perilaku

> ⚠ **Belum dicoba di aplikasi berjalan.** Langkah disusun dari kode pada commit `aefc719`.

**Tujuan.** Mencatat perilaku santri (positif maupun yang perlu perhatian).

**Siapa.** Wali kelas kelas santri itu.

**Jalur menu.** Wali Kelas → Catatan Perilaku — `\`/homeroom/behavior\``.

**Langkah.**

1. Buka **Catatan Perilaku**.
   *Daftar catatan kelas tampil.*
2. Klik **Tambah Catatan**.
   *Dialog "Tambah Catatan Perilaku" terbuka.*
3. Pilih siswa dan kategori, lalu isi "Apa yang terjadi?" dan "Apa yang sudah
   atau akan dilakukan?".
4. Klik **Simpan**.
   *Catatan muncul di daftar.*

**Hasilnya, dan giliran siapa berikutnya.** Catatan tersimpan; catatan positif
tidak lagi tersimpan sebagai pelanggaran.

**Bila tidak berhasil.**

| Yang terlihat | Penyebab umum | Yang perlu dilakukan |
|---|---|---|
| "Lengkapi siswa, kategori dan isi catatan" | Ada isian kosong | Lengkapi semua kolom wajib |

**Ketersediaan.** Sudah di `main`.

## Memutuskan izin santri

> ⚠ **Belum dicoba di aplikasi berjalan.** Langkah disusun dari kode pada commit `aefc719`.

**Tujuan.** Menyetujui atau menolak permohonan izin santri yang menjadi
tanggung jawab Anda.

**Siapa.** Musyrif (santri mukim) atau wali kelas (santri harian). Kepala unit
hanya untuk izin lebih dari 7 hari, santri tanpa pembimbing, atau ambil alih.

**Jalur menu.** Wali Kelas → Perizinan — `\`/permits\``. Izin yang menunggu Anda
terkumpul di penyaring **"Perlu keputusan saya"**.

**Langkah.**

1. Buka **Perizinan**, aktifkan penyaring **Perlu keputusan saya**.
   *Daftar izin yang menunggu keputusan Anda.*
2. Buka satu izin (klik barisnya).
   *Rincian izin dan tombol keputusan tampil.*
3. Untuk menerima, klik **Setujui**, lalu konfirmasi pada dialog.
   *Pesan "Izin disetujui".*
4. Untuk menolak, klik **Tolak**, isi alasannya, lalu konfirmasi.
   *Pesan "Izin ditolak".*
5. Bila perlu mengambil alih sebagai kepala unit, gunakan **Setujui (ambil
   alih)** — hanya kepala unit yang melihat tombol ini.

**Hasilnya, dan giliran siapa berikutnya.** Izin disetujui menunggu pintu
gerbang mencatat keberangkatan dan kepulangan; izin ditolak kembali ke pemohon
dengan alasan.

**Bila tidak berhasil.**

| Yang terlihat | Penyebab umum | Yang perlu dilakukan |
|---|---|---|
| Izin tidak ada di daftar | Bukan tanggung jawab Anda | Pemutus yang benar adalah musyrif/wali kelas santri itu |
| Tombol keputusan hilang | Sudah diputuskan atau di luar lingkup | Muat ulang halaman |

**Ketersediaan.** Sudah di `main`.

# 3. Bila Ada Masalah

- **Tidak bisa membuka halaman.** Laporkan ke admin unit; sebutkan jalur menu
  dan pesan yang muncul.
- **Tombol tampil tetapi tindakan ditolak.** Aplikasi memeriksa lagi di server;
  laporkan sebagai temuan.
- **Data terlihat salah atau kosong.** Pastikan tahun ajaran dan kelas benar,
  lalu laporkan bila masih salah.

Ke mana melapor: **admin unit** Anda (bukan nama orang tertentu).
