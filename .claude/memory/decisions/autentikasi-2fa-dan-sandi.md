# autentikasi-2fa-dan-sandi

> KEPUTUSAN 2026-09-28: siapa yang wajib 2FA (admin, organ, kepala unit), siapa
> yang diajak sesudah login (staf dan wali, "Nanti saja" tanpa batas), dan
> kebijakan sandi (ganti karena kejadian, bukan kalender; panjang dan daftar
> terlarang, bukan aturan campuran). Riset dan sumbernya ada di bawah; jangan
> diulang.

**Keputusan pengguna 2026-09-28.** Usulan awalnya: tidak ada yang wajib 2FA,
dan semua pengguna diajak mengaktifkannya setiap selesai login. Pengguna lalu
memilih dari opsi yang disertai riset berikut.

## 2FA

- **Wajib:** Super Admin, admin unit, organ yayasan (Pembina, Pengurus,
  Pengawas), dan **kepala setiap unit**:
  - kepala sekolah TK Qur'an, SD IT, SMP IT dan SMA Qur'an;
  - Pimpinan Pesantren.
  Kewajiban berlaku bila **salah satu** penugasan aktifnya memegang peran itu,
  sama seperti aturan yang sudah ada (`requiresSecondFactor` di
  `apps/api/src/middleware/auth.ts`).
- **Diajak, tidak wajib:** semua staf dan pendidik yang tidak wajib, dan wali
  santri. Jendela ajakan muncul sesudah login, dengan tombol **"Nanti saja"
  tanpa batas**, dan muncul lagi pada login berikutnya. Karena sesi bertahan 30
  hari, dalam praktiknya ajakan muncul sekitar sebulan sekali per perangkat.
- **Tidak diajak:** santri. Santri SD dan santri mukim umumnya tidak memegang
  ponsel, jadi ajakan akan selalu ditunda. Santri tetap bisa mengaktifkan 2FA
  sendiri di Profil.
- **Tinjau ulang** tingkat aktivasi sesudah satu semester.
- **Prasyarat, dikerjakan lebih dulu:** kode pemulihan harus bisa dipakai, dan
  admin harus bisa mematikan 2FA pengguna yang kehilangan ponsel. Tanpa
  keduanya, mengajak lebih banyak orang berarti mengunci lebih banyak orang.
- **Catatan:** kewajiban setup tidak melindungi akun yang belum pernah
  mendaftar. Orang yang tahu sandinya akan diminta memasang 2FA di ponselnya
  sendiri. Yang melindungi akun seperti itu adalah kewajiban ganti sandi di
  bawah.

## Sandi

- **Tidak ada kedaluwarsa berkala.** Ganti sandi dipaksa karena kejadian,
  untuk semua pengguna:
  - login pertama;
  - sesudah sandi dibuat atau diatur orang lain (admin, impor, seed);
  - bila ada tanda bocor, termasuk akun yang ditandai admin;
  - sekali untuk semua akun pada rilis yang membawa aturan ini.
- **Isi sandi:**
  - minimal 8 karakter untuk akun ber-2FA, 15 untuk yang tanpa 2FA;
  - dianjurkan berupa kalimat;
  - aturan campuran huruf besar/kecil/angka dilepas;
  - sandi umum atau bocor ditolak lewat **daftar lokal**, tanpa mengirim apa
    pun ke layanan pihak ketiga.

## Opsi yang ditolak dan alasannya

- **"Tidak ada yang wajib 2FA":** melanggar CIS Controls v8 Safeguard 6.5
  (*Require MFA for Administrative Access*, IG1 = batas minimum). Akun admin
  dan organ bisa membuat akun, memberi peran, dan melihat semua unit.
- **Tunda dibatasi 3 kali lalu wajib** (bawaan Microsoft untuk kampanye
  Authenticator): dalam praktiknya menjadikan 2FA wajib bagi semua yang diajak.
- **Kedaluwarsa 90 hari untuk semua, atau 12 bulan untuk akun wajib:**
  NIST melarangnya ("SHALL NOT"). Pola sandi jadi mudah ditebak, yang lupa
  bertambah, dan sandi yang dicuri tetap berlaku sampai tanggalnya.

## Sumber

- NIST SP 800-63B-4, bagian *Password Verifiers* — SHALL NOT ganti berkala;
  SHALL paksa ganti bila bocor; SHALL NOT aturan campuran; minimal 15 (faktor
  tunggal) atau 8 (dengan MFA); SHALL cek daftar sandi umum/bocor:
  <https://pages.nist.gov/800-63-4/sp800-63b.html>
- NIST SP 800-63B — minimal AAL2 (dua faktor) untuk akses daring ke data
  pribadi: <https://pages.nist.gov/800-63-3/sp800-63b.html>
- CIS Controls v8 Safeguard 6.5, IG1:
  <https://controls-assessment-specification.readthedocs.io/en/latest/control-6/control-6.5.html>
- Microsoft Entra *registration campaign* — ajakan sesudah login, "Skip for
  now", tunda 0–14 hari, opsi batas 3 kali, sasaran per kelompok:
  <https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-mfa-registration-campaign>
- Microsoft security baseline Windows 10 v1903 (2019) — kedaluwarsa sandi
  dicabut, "ancient and obsolete mitigation of very low value":
  <https://learn.microsoft.com/en-us/archive/blogs/secguide/security-baseline-final-for-windows-10-v1903-and-windows-server-v1903>
