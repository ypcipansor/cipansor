# pengawasan-dan-rapat-pembina

> KEPUTUSAN 2026-09-28 — PR #508 (pemberhentian sementara Pengurus + WBS) dan
> #509 (keputusan dan risalah organ) ditutup; keduanya dibangun ulang dengan
> syarat di bawah. Dasar hukum dan standarnya sudah diriset, jangan diulang.
> Rancangannya diputuskan pengguna pada hari yang sama (bagian "Diputuskan").

**Keputusan pengguna 2026-09-28**, sesudah audit kedua PR (laporan:
<https://claude.ai/artifact/Cs8yAjGuZcYJzrVi874k9d>):

- **#508 → tutup, pecah, rancang ulang.** Bagian yang terbukti benar diambil
  sebagai PR kecil masing-masing dengan uji gagal-sebelum/lulus-sesudah:
  - halaman Pengawasan untuk organ yayasan;
  - perbaikan auth yang masih berlaku di `main`.

  Pemberhentian sementara dan WBS dirancang ulang menurut syarat di bawah.
- **#509 → tutup; jadikan "keputusan rapat Pembina" di alur yang ada.** Yang
  dibangun bukan modul keputusan baru, melainkan langkah "Pembina tetapkan"
  pada alur pengesahan RPJP/Renstra/RKA
  ([pengesahan-dokumen-yayasan](./pengesahan-dokumen-yayasan.md)) dan putusan
  Ps. 43 ayat 4. Keduanya menjadi keputusan rapat, bukan satu akun menekan
  tombol.

## Syarat yang mengikat pembangunan ulang

**Pemberhentian sementara Pengurus (UU 16/2001 Ps. 43).**

| Ayat | Isi | Artinya di sistem |
|---|---|---|
| (1) | Pengawas **dapat** memberhentikan sementara anggota Pengurus, dengan menyebut alasannya | hanya organ Pengawas yang memulai, tidak pernah Super Admin |
| (2) | lapor tertulis ke Pembina paling lambat 7 hari | pemberitahuan dan tenggat tercatat |
| (3) | Pembina wajib memanggil yang bersangkutan untuk membela diri, paling lambat 7 hari sejak laporan | tahap pembelaan; akun yang bersangkutan tetap bisa masuk untuk menyiapkannya — yang dicabut adalah kewenangan (peran, kunci TTE), bukan seluruh akses |
| (4) | paling lambat 7 hari sesudah pembelaan, Pembina wajib **mencabut** atau **memberhentikan** | dua putusan, keduanya keputusan rapat Pembina |
| (5) | bila (3) dan (4) tidak dilaksanakan, pemberhentian sementara **batal demi hukum** | berakhir otomatis oleh sistem saat tenggat lewat, bukan menunggu tombol |

Siapa pelaksana harian (Plh) selama pemberhentian sementara ditentukan oleh AD
dan Pembina (Ps. 32: Pengurus diangkat Pembina), bukan oleh Pengawas. Bunyi AD
yayasan belum dilihat; tanyakan sebelum membangun.

**WBS / pelaporan pelanggaran.**
- Tidak memihak:
  - pihak terlapor tidak pernah membaca laporan tentang dirinya (*recusal*);
  - ada jalur untuk laporan tentang Pembina dan tentang Kiai, yang merangkap
    kepala unit dan Pembina ([pimpinan-pesantren-kiai](./pimpinan-pesantren-kiai.md));
  - Super Admin bukan penerima laporan.
- Data seminimal mungkin. Bukti diunggah ke sistem, bukan tautan luar: tautan
  Drive membuka identitas pelapor anonim, dan berkasnya bisa dihapus.
- Halaman publik memuat pernyataan perlindungan pelapor, pemberitahuan
  privasi (UU PDP 27/2022), masa simpan, dan larangan laporan palsu.
- Garis tegas dengan modul `complaints` (Aduan & Aspirasi):
  - pengaduan layanan (ISO 10002) tetap di sana;
  - pelanggaran (ISO 37002) masuk WBS.

  Satu konsep, satu modul.
- **Kekerasan terhadap santri bukan urusan WBS organ.** Laporannya dialihkan
  ke TPPK unit (Permendikbudristek 46/2023; PMA 73/2022 untuk satuan di bawah
  Kemenag, termasuk pesantren). Modul TPPK belum ada di `main`.

**Keputusan rapat organ (dari #509, untuk alur yang ada).**
- Hanya organ itu sendiri yang menyusun draf dan mengesahkannya. Super Admin
  tidak pernah menyusun draf, memfinalisasi, atau membubuhkan segel. Ketua
  dan Sekretaris Pengurus tidak memfinalisasi keputusan Pembina.
- Aturan kuorum mengikuti AD: kuorum hadir 2/3, mufakat, lalu suara 2/3 yang
  hadir (Ps. 18–19 untuk perubahan AD). Aturan itu dicatat dengan rujukan
  akta, bukan diatur Super Admin.
- Risalah yang sungguhan memuat:
  - daftar hadir;
  - agenda;
  - pembahasan dan pendapat berbeda;
  - pimpinan dan sekretaris rapat.

  Perubahan AD tetap memerlukan akta notaris (Ps. 18 ayat 3), dan pergantian
  Pengurus dilaporkan ke Menteri (Ps. 33). Sistem hanya menyiapkan bahannya,
  dan layar harus mengatakan itu.
- Yang boleh dipakai ulang dari #509:
  - mesin kuorum;
  - tanda tangan suara per anggota (Ed25519, digest kanonis);
  - label jujur "TTE tidak tersertifikasi";
  - verifikasi dengan mengunggah PDF.

  Verifikasi lewat token tidak dipakai
  ([eoffice-verify-by-upload-not-qr](./eoffice-verify-by-upload-not-qr.md)).
- Model otorisasi tetap satu untuk seluruh aplikasi: penugasan utama, lalu
  Model A. Tidak ada `authorizeAnyRole` tersendiri.

**Ditolak dari kedua PR, beserta alasannya:**
- `JWT_SECRET` di kontainer web: web yang dibobol bisa mencetak token API
  (pola yang sama ditolak di audit #441).
- Rahasia baru yang membuat aplikasi menolak boot bila belum diset:
  merge-nya mematikan staging.
- `invoices.unit_id NOT NULL` diselipkan di PR tata kelola.
- Nama santri penunggak ditampilkan kepada organ yayasan; organ cukup
  melihat angka agregat.
- Istilah Inggris di layar portal.
- Istilah "Pembekuan Pengurus"; bunyi UU adalah "pemberhentian sementara".

## Dasar hukum dan standar (sudah dibaca)

- UU 16/2001 jo. UU 28/2004:
  - Ps. 28: wewenang Pembina;
  - Ps. 29, 31 ayat 3, 40 ayat 4: larangan rangkap organ;
  - Ps. 32: Pengurus diangkat dan diberhentikan Pembina;
  - Ps. 33: lapor Menteri;
  - Ps. 18–19: rapat Pembina;
  - Ps. 40–44: Pengawas;
  - **Ps. 43**.

  Teks: portal AHU
  (<https://portal.ahu.go.id/uploads/_uploads/dl/PP_UU/Dit.Perdata/uu%20no.%2016%20thn.%202001%20tentang%20yayasan.pdf>),
  <https://pasal.id/peraturan/uu/uu-no-16-tahun-2001/pasal-43>.
- ISO 37002:2021, sistem manajemen *whistleblowing*: prinsip trust,
  impartiality, protection; alur receive → assess → address → conclude
  (<https://www.iso.org/standard/65035.html>).
- KNKG, Pedoman Sistem Pelaporan Pelanggaran 2008, dengan tiga aspek:
  - struktural: komitmen, perlindungan pelapor, pengelola;
  - operasional: anonimitas, investigasi;
  - perawatan.
- Permendikbudristek 46/2023 (PPKSP): TPPK wajib di tiap satuan pendidikan
  (<https://peraturan.bpk.go.id/Details/285721/permendikbudriset-no-46-tahun-2023>);
  PMA 73/2022 untuk kekerasan seksual di satuan pendidikan Kemenag.

## Diputuskan pengguna 2026-09-28 (keempat rekomendasi)

Riset tambahannya:
- keputusan di luar rapat adalah klausul AD yang lazim, bukan pasal UU:
  <https://legalitas.org/tulisan/semua-tentang-yayasan>;
- susunan TPPK menurut Permendikbudristek 46/2023: ganjil, paling sedikit
  3 orang, pendidik bukan kepala sekolah ditambah komite atau wali, tenaga
  kependidikan boleh ditambahkan, ditetapkan kepala sekolah;
- satgas pesantren: PMA 73/2022, KMA 83/2023, dan Kepdirjen Pendis
  1262/2024 tentang pengasuhan ramah anak.

1. **Ps. 43 — ringkas: kunci kewenangan + tenggat.**
   - Pengawas mencatat pemberhentian sementara beserta alasannya.
   - Sistem seketika menahan kewenangan organ orang itu (menyetujui,
     menandatangani TTE). Akunnya tetap bisa masuk untuk menyiapkan
     pembelaan.
   - Semua Pembina dan yang bersangkutan diberi tahu. Tenggat 7/7/7 hari
     tampil.
   - Putusan cabut atau berhentikan adalah keputusan rapat Pembina (butir 4).
   - Kalau tenggat lewat tanpa putusan, pemberhentian **batal demi hukum**
     dan kewenangan pulih otomatis.
   - Plh belum dimodelkan; menunggu AD.
2. **WBS — satu pintu di Aduan & Aspirasi** (modul `complaints`).
   - Kategori pelanggaran dipisah dari pengaduan layanan.
   - Penerimanya Pengawas. Laporan tentang Pengawas ke Pembina; tentang
     Pembina atau Kiai ke Pengawas.
   - Terlapor tidak pernah bisa membaca laporan tentang dirinya.
   - Kekerasan terhadap santri dialihkan ke TPPK atau Satgas (butir 3).
   - Anonim boleh; bukti diunggah, bukan tautan. Super Admin tidak membaca.
3. **TPPK dan Satgas — tim per unit sebagai penugasan berjangka**, bukan
   kode peran baru ([peran-dan-tugas-tambahan](./peran-dan-tugas-tambahan.md)).
   - TPPK di TK, SD, SMP, dan SMA.
   - Satgas di pesantren.
   - Laporan kekerasan hanya terbaca tim unit itu, seperti konseling
     rahasia. Kepala unit menerima rekomendasinya.
4. **Keputusan Pembina: rapat tercatat ATAU sirkuler bulat.**
   - (a) Rapat fisik atau daring dicatat: daftar hadir, kuorum, agenda,
     hasil, pendapat berbeda. Risalah ditandatangani pimpinan dan sekretaris
     rapat.
   - (b) Keputusan di luar rapat sah hanya bila **semua** Pembina menyetujui
     secara tertulis, dengan TTE per anggota (mesin suara Ed25519 dari #509
     dipakai ulang).
   - Berlaku untuk langkah "tetapkan" RPJP/Renstra/RKA dan putusan Ps. 43.
   - Angka kuorum diambil dari AD.

**Masih terbuka:** salinan Anggaran Dasar (akta) yayasan — untuk angka
kuorum rapat Pembina dan penunjukan Plh. Minta ke pengguna; jangan menebak
angkanya.

**Urutan bangun:** 4 → 1 (putusan Ps. 43 memakai keputusan rapat) → 3 → 2
(WBS mengalihkan kekerasan ke tim di butir 3).

Lihat juga [pk-organ-yayasan-tanpa-kontrak](./pk-organ-yayasan-tanpa-kontrak.md)
dan [eoffice-revocation-authority](./eoffice-revocation-authority.md) (tidak
pernah Super Admin).
