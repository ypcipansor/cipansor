# penyimpanan-berkas

> KEPUTUSAN 2026-09-29: berkas unggahan (foto, dokumen, surat) dicatat di satu
> tabel berkas dengan pemilik dan status; isinya di Azure Blob **privat**,
> diakses lewat managed identity dan SAS delegasi pengguna berumur pendek;
> tanpa kunci akun dan tanpa kontainer publik; berkas yang tidak pernah
> ditautkan dihapus sesudah 24 jam. Riset di bawah; jangan diulang.

**Asal keputusan.** Audit ketiga #441 (2026-09-29). PR itu memakai tiga hal
yang ditolak di sini:

- kunci akun (connection string dan SAS kunci akun) serta kontainer publik;
- otorisasi dengan mencari URL berkas di sekitar 40 tabel;
- protokol klaim/tombstone dengan job rekonsiliasi untuk berkas yatim.

Pengguna memilih pola baku di bawah. #441 ditutup dan dibangun ulang
(`roadmap.md` butir 4).

## Aturannya

- **Satu tabel berkas.** Isinya:
  - pemilik (akun pengunggah) dan unit;
  - tujuan (jenis dokumen);
  - status: *belum ditautkan* atau *ditautkan*;
  - ukuran, tipe MIME, dan nama blob acak (tidak dari nama asli berkas).
- **Catatan menautkan berkas lewat id berkas, bukan URL.** Penautan terjadi di
  transaksi yang sama dengan penyimpanan catatannya. Karena status berubah
  bersama catatan, tidak perlu kunci atau klaim terdistribusi.
- **Membaca berkas selalu lewat API.** Hak dibaca dari catatan yang menautkan
  berkas itu, dengan aturan yang sama dengan membaca catatannya. Sesudah itu
  API memberi SAS delegasi pengguna berumur sekitar lima menit, atau
  mengalirkan isinya. URL yang disimpan stabil, dan SAS tidak pernah
  disimpan.
- **Azure:**
  - akses lewat managed identity (`DefaultAzureCredential`);
  - Shared Key dimatikan di akun penyimpanan;
  - akses anonim dimatikan, jadi tidak ada kontainer publik.
- **Media publik** (logo, foto situs) disajikan lewat endpoint yang hanya
  mengeluarkan berkas yang ditandai publik oleh catatannya, atau ikut di build
  situs. Tidak ada kontainer anonim.
- **Pembersihan:** job harian menghapus berkas *belum ditautkan* yang berumur
  lebih dari 24 jam. Alternatifnya: lifecycle policy Azure dengan filter tag
  indeks blob.
- **Pengembangan lokal:** provider disk dengan antarmuka yang sama.
- **Pemindahan bertahap, modul demi modul.** Mulai dari yang polanya sudah
  begini di `main`: sertifikat akreditasi unit dan surat dokter izin.

## Opsi yang ditolak

- **Rancangan #441 yang diperbaiki** (penelusuran pemilik lintas tabel dan
  protokol klaim): berat dan rapuh. Setiap fitur baru yang menyimpan berkas
  wajib didaftarkan, dan yang lupa didaftarkan tidak bisa dibuka.
- **Tetap di disk lokal App Service:** terikat satu server, dan kapasitasnya
  dibatasi paket.

## Sumber

- Microsoft, SAS (menganjurkan user delegation SAS dengan kredensial Entra ID):
  <https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview>
- Microsoft, mematikan Shared Key:
  <https://learn.microsoft.com/en-us/azure/storage/common/shared-key-authorization-prevent>
- Microsoft, mematikan akses baca anonim:
  <https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-prevent>
- Microsoft, lifecycle management (filter prefix dan tag indeks blob; aksi
  hapus): <https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-overview>
- Rails Active Storage, *purging unattached uploads* (tabel blob dan
  attachment; hapus yang tak tertaut sesudah dua hari):
  <https://guides.rubyonrails.org/active_storage_overview.html>
