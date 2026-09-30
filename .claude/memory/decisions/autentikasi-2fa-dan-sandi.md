# autentikasi-2fa-dan-sandi

> KEPUTUSAN 2026-09-28: siapa yang wajib 2FA (admin, organ, kepala unit), siapa
> yang diajak sesudah login (staf dan wali, "Nanti saja" tanpa batas), dan
> kebijakan sandi (ganti karena kejadian, bukan kalender; panjang dan daftar
> terlarang, bukan aturan campuran). KEPUTUSAN 2026-09-29: "Masuk dengan
> Google" untuk akun @cipansor.or.id saja, dan peran wajib 2FA tetap memasukkan
> kode Cipansor sesudah Google. KEPUTUSAN 2026-09-30: passkey Cipansor sebagai
> jalur masuk **pertama** (Model A), sandi + TOTP + kode pemulihan tetap sebagai
> fallback; satu passkey memenuhi kewajiban 2FA. Riset dan sumbernya ada di
> bawah; jangan diulang.

**Keputusan pengguna 2026-09-28.** Usulan awalnya: tidak ada yang wajib 2FA,
dan semua pengguna diajak mengaktifkannya setiap selesai login. Pengguna lalu
memilih dari opsi yang disertai riset berikut.

## 2FA

- **Wajib:** Super Admin, admin unit, organ yayasan (Pembina, Pengurus,
  Pengawas), dan **kepala setiap unit**:
  - kepala sekolah TK Qur'an, SD IT, SMP IT dan SMA Qur'an;
  - Pimpinan Pesantren.
  Kewajiban berlaku bila **salah satu** penugasan aktifnya memegang peran itu.
  Daftarnya satu: `SECOND_FACTOR_ROLE_CODES` di `packages/shared/src/roles.ts`,
  dibaca `requiresSecondFactor` (login, perpindahan peran, pembaruan sesi, dan
  larangan mematikan) dan oleh seed `E2E_FIXED_2FA`. Akun wajib hanya bisa
  dimatikan 2FA-nya oleh Super Admin, untuk pengguna yang kehilangan ponsel
  sekaligus kode pemulihannya.
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

## Passkey (FIDO2/WebAuthn) — diputuskan 2026-09-30

Pengguna memilih **Model A versi ringan**: passkey Cipansor sebagai **jalur masuk
pertama**, bukan sebagai faktor kedua setelah sandi.

- **Tampilan Masuk.** Tombol **"Masuk dengan passkey"** di atas form sandi, bukan
  di bawahnya; form sandi tetap ada sebagai *fallback* (FIDO Alliance: passkey
  adalah pengganti faktor pertama, bukan tambahan di belakangnya).
- **Satu passkey memenuhi kewajiban 2FA.** Passkey adalah autentikator
  multifaktor (memiliki perangkat + biometrik/PIN) dan memenuhi AAL2 menurut
  NIST SP 800-63B-4 dan OWASP, jadi pengguna ber-`requiresSecondFactor` yang
  masuk lewat passkey Cipansor **tidak** diminta kode Cipansor lagi. Kewajiban
  tetap dipenuhi lewat `SECOND_FACTOR_ROLE_CODES` — tidak ada daftar kedua.
  Berbeda dari SSO Google, passkey Cipansor **dapat dibuktikan** lewat flag
  *user verification* WebAuthn; itulah alasan keduanya diperlakukan berbeda.
- **Fallback utuh: sandi + TOTP + kode pemulihan tetap ada.** Karena itu tidak
  ada kanal pemulihan kedua yang dibangun — kehilangan perangkat memakai kode
  TOTP atau kode pemulihan, sama seperti sekarang. Inilah yang membedakannya
  dari Model C (tanpa sandi) yang pemulihannya harus dirancang dari nol.
- **TOTP tetap** untuk pengguna yang belum mendaftarkan passkey.
- **Integritas faktor — hanya untuk akun wajib 2FA.** Bagi akun yang
  `requiresSecondFactor`, autentikator terakhir tidak boleh dihapus: bila TOTP
  dimatikan, minimal satu passkey harus tersisa, dan sebaliknya — akun wajib
  tidak pernah turun di bawah AAL2. Akun yang 2FA-nya **opsional** (staf, wali,
  santri) tetap boleh mematikan faktor terakhirnya dan kembali ke sandi saja,
  sesuai kebijakan 2FA yang sudah berlaku (dan akun wajib hanya bisa dimatikan
  oleh Super Admin, seperti aturan di atas). Untuk semua orang, menambah atau
  menghapus autentikator adalah tindakan berisiko — wajib autentikasi ulang
  dengan faktor yang sudah terdaftar, dan pemilik diberi tahu lewat surel
  (OWASP MFA Cheat Sheet).
- **Pendaftaran** di *Profil → Keamanan*, di sebelah daftar 2FA yang ada.
- **Urutan:** sesudah Google SSO (butir 4.A) dan Sandi bagian B, sebagai jalur
  multi-PR sendiri. Jangan dikerjakan paralel dengan keduanya.
- **Opsi yang ditolak:**
  - **Passkey sebagai faktor kedua setelah sandi (Model B):** sah sebagai
    langkah transisi, tetapi mempertahankan sandi — faktor yang paling phishable
    — di depan, sehingga *credential stuffing* dan phishing sandi tetap hidup.
    FIDO menaruh penekanannya pada **menggantikan** "sandi + OTP", bukan
    melapisinya.
  - **Tanpa sandi penuh (Model C):** postur terbaik, tetapi pemulihan harus
    dirancang dari nol; tidak dipilih sekarang.
- **Catatan teknis:** `rpID = cipansor.or.id` (mencakup portal dan apex; dev
  `localhost`); WebAuthn wajib HTTPS kecuali localhost. Pustaka
  `@simplewebauthn/server` + `@simplewebauthn/browser`; challenge di Redis TTL
  pendek. Model Prisma `WebAuthnCredential` (sunting `schema.prisma` secara
  bedah). Aplikasi wali (PWA) memakai basis kode web yang sama sehingga ceremony
  ikut jalan; klien native Bearer-JWT tidak otomatis dapat passkey. e2e Playwright
  memakai *virtual authenticator* CDP — hanya Chromium.

## Masuk dengan Google (SSO)

Diputuskan 2026-09-29, sesudah audit ketiga #441 (PR itu ditutup dan
dibangun ulang; lihat `roadmap.md` butir 4).

- **Hanya Google, tanpa jalur Microsoft.** Microsoft berada di hilir Google
  (`struktur-organisasi-dan-identitas.md`).
- **Tahap pertama: akun `@cipansor.or.id` saja**, yaitu staf dan santri yang
  punya akun Workspace yayasan.
  - Syaratnya: klaim `hd` sama dengan domain yayasan, dan `email_verified`
    benar.
  - Wali tetap memakai sandi, dengan ajakan 2FA.
  - Alasannya: yayasan mengendalikan akun itu, termasuk 2SV, OU, dan
    penonaktifan saat orangnya keluar.
- **Peran wajib 2FA tetap memasukkan kode Cipansor sesudah Google.**
  - Aturannya sama dengan login sandi: `requiresSecondFactor`, bukan peran
    utama saja.
  - Klaim `amr` Google boleh ditinjau ulang kelak. Syaratnya: aplikasi Google
    sudah terverifikasi, dan klaim itu diminta lewat parameter `claims`.
- **Cara verifikasi dan penautan:**
  - ID token diverifikasi di server: `iss`, `aud`, `exp`, `sub`, `hd`.
  - Akun dicari lebih dulu lewat subjek penyedia (`sub`), bukan email.
  - Penautan pertama ke akun yang sudah ada mengirim email pemberitahuan.
  - *Profil → Keamanan* menampilkan akun yang tertaut, dengan tombol putus.
  - Login yang ditolak tidak pernah membuat tautan.
- **Tampilan:**
  - Tombol standar Google (renderButton, kompatibel FedCM), bukan One Tap
    sebagai jalur utama.
  - Tombol tampil hanya bila `GOOGLE_CLIENT_ID` dikonfigurasi.
  - Tanpa Turnstile kedua.
  - Semua pesan berbahasa Indonesia.

## Opsi yang ditolak dan alasannya

- **"Tidak ada yang wajib 2FA":** melanggar CIS Controls v8 Safeguard 6.5
  (*Require MFA for Administrative Access*, IG1 = batas minimum). Akun admin
  dan organ bisa membuat akun, memberi peran, dan melihat semua unit.
- **Tunda dibatasi 3 kali lalu wajib** (bawaan Microsoft untuk kampanye
  Authenticator): dalam praktiknya menjadikan 2FA wajib bagi semua yang diajak.
- **SSO dianggap sudah memenuhi 2FA** (percaya 2SV Workspace yang diwajibkan
  dari Admin Console): Cipansor tidak bisa membuktikannya per login. Menerima
  `amr` Google sekarang juga ditunda, karena butuh aplikasi terverifikasi dan
  alur yang lebih rumit, sementara TOTP sudah berjalan untuk semua jalur.
- **SSO untuk wali lewat Gmail pribadi di tahap pertama:** Google memang
  menganggap @gmail.com otoritatif, tetapi siklus akun wali di luar kendali
  yayasan. Ditinjau lagi sesudah akun @cipansor.or.id berjalan.
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
- Google, verifikasi ID token (email otoritatif hanya untuk @gmail.com, atau
  bila `email_verified` benar dan `hd` ada):
  <https://developers.google.com/identity/gsi/web/guides/verify-google-id-token>
- Google, FedCM wajib sejak Agustus 2025; `use_fedcm_for_prompt` diabaikan:
  <https://developers.google.com/identity/gsi/web/guides/fedcm-migration>
- Google Developers Blog, 16 Juni 2026, klaim `auth_time` dan `amr` (opt-in,
  aplikasi terverifikasi):
  <https://developers.googleblog.com/enhance-security-and-trust-new-session-metadata-in-sign-in-with-google/>
- FIDO Alliance, *Passkeys* — passkey adalah pengganti faktor **pertama**;
  berdiri sendiri lebih kuat daripada "sandi + OTP" atau "sandi + push":
  <https://fidoalliance.org/passkeys>
- FIDO Alliance, *Displace Password + OTP Authentication with Passkeys* —
  passkey bisa jadi faktor pertama **atau** faktor kedua; panduan migrasi dari
  OTP: <https://fidoalliance.org/white-paper-displace-password-otp-authentication-with-passkeys>
- OWASP, *Multifactor Authentication Cheat Sheet* — passkey sebagai bentuk MFA;
  wajib autentikasi ulang dan pemberitahuan saat mengubah/menghapus faktor:
  <https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html>
- NIST SP 800-63B-4, *AAL2* — satu autentikator multifaktor **atau** dua faktor;
  passkey tersinkronisasi memenuhi AAL2, terikat perangkat untuk AAL3:
  <https://pages.nist.gov/800-63-4/sp800-63b.html>
- Corbado, *NIST Passkeys* — ringkasan Rev. 4: tersinkron AAL2, terikat
  perangkat AAL3: <https://www.corbado.com/blog/nist-passkeys>
- *Passwordless Login Enterprise 2026* — fase migrasi: passkey berdampingan →
  sandi hanya sebagai fallback:
  <https://credentialgovernance.avatier.com/en/blog/passwordless-login-future-enterprise-2026>
