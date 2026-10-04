# Siaran: Pengumuman adalah satu-satunya jalan

> Diputuskan pengguna 2026-10-03, sesudah audit PR #626 menemukan bahwa
> *Notifications → Quick Send* dan *Buat Notifikasi* ke kelas/unit/peran tidak
> sampai ke siapa pun, dan bahwa Pengumuman tidak pernah masuk lonceng. Empat
> pertanyaan, keempatnya memilih rekomendasi. Riset di bawah **jangan
> diulang**.

## Keputusan

1. **Siapa mengirim ke siapa: menurut relasi.**
   - Guru → santri dan wali di kelas yang ia ajar (jadwal aktif) atau
     walikan (`Class.homeroomTeacherId`).
   - Musyrif → santri mukim di kamar yang ia bina, dan walinya.
   - Kepala sekolah, TU, dan admin unit → seluruh unitnya.
   - Organ yayasan dan Pimpinan Pesantren → seluruh yayasan, atau satu unit.
   - **Super Admin tidak menulis isi.** Ia pengelola sistem, bukan organ
     (sejalan dengan `eoffice-revocation-authority.md`).
2. **Satu fitur: Pengumuman.** Menerbitkan pengumuman langsung mengisi
   lonceng dan push audiensnya, dan pengumuman tetap bisa dibaca ulang di
   papan *Pengumuman*. *Quick Send* dan *Buat Notifikasi* dihapus dan
   alamatnya diarahkan ke Pengumuman (satu konsep, satu modul — `AGENTS.md`).
3. **Saluran: lonceng + push saja.** Email dan WhatsApp tetap untuk
   notifikasi sistem yang penting (tagihan, izin), supaya tidak menjadi
   saluran spam dan tidak berbiaya per pesan. Preferensi penerima (jenis
   *Pengumuman*, jam tenang) berlaku seperti notifikasi lain.
4. **Tanpa persetujuan, tetapi tercatat.** Yang boleh menyiarkan ke seluruh
   unit memang hanya pimpinan, TU, dan admin. Pengirim tercatat, dan kepala
   unit (atau admin unit, atau organ yayasan untuk siaran yayasan) bisa
   **menarik** siaran: pengumuman hilang dari papan dan dari lonceng. Push
   yang sudah terkirim tidak bisa ditarik.
5. **Halaman Notifikasi admin dipensiunkan** (2026-10-04, sesudah #651).
   Daftar semua notifikasi dan statistiknya dihapus; yang tersisa untuk
   pengirim dan pengawas unit adalah angka **per pengumuman** di papan:
   masuk ke berapa lonceng, dibaca berapa. Admin tidak membaca isi lonceng
   pribadi orang lain — notifikasi hanya bisa dibuka dan dihapus oleh
   pemiliknya. Alamat `/notifications` mengarah ke *Notifikasi Saya*.
   Jalan siaran lain yang tersisa (tab *Broadcast Pengumuman* di halaman
   WhatsApp) ikut ditutup, karena keputusan 2.
6. **Templat notifikasi dihapus** (2026-10-04): halaman, rute, dan isinya.
   Pengumuman ditulis per kejadian; templat bisa dibangun lagi bila nanti
   ada kebutuhan nyata.

## Riset (2026-10-03)

- Platform komunikasi sekolah (ParentSquare, dipakai banyak distrik AS):
  guru kelas menghubungi orang tua dan murid di kelasnya sendiri; admin
  menghubungi seluruh sekolah; pengumuman sekolah dari guru dititipkan ke
  admin. Sumber: [Amphitheater Public Schools](https://www.amphi.com/263611_3),
  [Jenkintown School District](https://jenkintowndrakes.org/parentsquare-resources-for-staff/).
- Praktik Indonesia: wali kelas adalah penghubung utama sekolah dengan orang
  tua (buku penghubung, pertemuan wali kelas, grup kelas). Sumber:
  [skripsi UIN Jakarta](https://repository.uinjkt.ac.id/dspace/bitstream/123456789/11697/1/TIHAROH-FITK.pdf),
  [BPMP NTB](https://bpmpntb.kemdikbud.go.id/artikel/27/meningkatkan-kolaborasi-sekolah-dan-orang-tua-dalam-peningkatan-mutu-pendidikan).
- Relasinya sudah ada di data: wali kelas (#579), jadwal mengajar (dipakai
  absensi, `attendance.access.ts`), dan penugasan musyrif (`boarders.ts`).

- Statistik per pesan untuk pengirimnya, bukan daftar lonceng semua orang:
  ParentSquare menampilkan "Delivery Stats" per postingan — siapa menerima,
  lewat apa, terkirim, dibuka. Sumber:
  [ParentSquare](https://www.parentsquare.com/blog/2016-4-16-post-approval-and-delivery-stats/).
- UU 27/2022 (PDP) Pasal 16 ayat (2): pemrosesan data pribadi dilakukan
  secara terbatas dan spesifik. Sumber:
  [pasal.id](https://pasal.id/peraturan/uu/uu-no-27-tahun-2022/pasal-16).

## Yang ditolak

- *Per unit* (setiap guru/staf ke seluruh unitnya) — seorang guru bisa
  mengirim ke semua wali satu sekolah.
- *Hanya pimpinan & admin* — memutus jalur wali kelas yang justru penghubung
  utama.
- *Dua fitur* (Pengumuman + Kirim Notifikasi) dan *tanpa siaran*.
- Pengirim memilih email/WhatsApp; persetujuan kepala unit sebelum terkirim.
- Mempertahankan daftar Notifikasi admin (dibatasi ke unit, kolom
  diperbaiki): admin tetap membaca notifikasi pribadi (izin, tagihan) tanpa
  kebutuhan. Menghapusnya tanpa pengganti: pengirim tidak tahu berapa yang
  membaca. Templat dipakai dari Pengumuman: belum ada kebutuhan nyata.
