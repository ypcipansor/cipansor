# Ulasan & Koreksi: Proposal PKI Tanda Tangan Digital Risalah Dewan Pembina (dari Gemini)

> **Status:** Dokumen review + ADR (koreksi), bukan spesifikasi implementasi.
> Ditulis berdasarkan audit kode, pengecekan lintas ke skema basis data, dan riset standar.
> Disertakan pada PR #509 bersama modul `foundation-decisions`. Ikuti aturan
> golden AGENTS.md: koreksi dalam bentuk kode lewat branch + PR, dan "selesai"
> berarti kode **dan** tesnya dalam satu commit.
>
> **⚠️ Sebagian rekomendasi di bawah SUDAH DITOLAK oleh implementasi.** Baca
> §0 (Keputusan arsitektur final) lebih dulu. §5 dan §6 tetap disimpan sebagai
> catatan historis alasan rekomendasi tersebut diajukan, tetapi **bukan** peta
> yang diikuti PR #509. Jangan mengikuti §5/§6 tanpa membaca §0.

**Topik yang diulas:** proposal Gemini untuk membangun sistem TTE/PKI internal
bagi risalah & penetapan keputusan Dewan Pembina (5 anggota, skenario mufakat /
voting mayoritas / dominan tidak setuju), dengan kunci per anggota, E-Seal
yayasan, verifikasi + audit trail.

---

## 0. Keputusan arsitektur final (ADR) — koreksi terhadap §5 & §6

Implementasi yang benar-benar di-merge (PR #509, modul
`apps/api/src/modules/foundation-decisions`) **tidak** mengikuti rekomendasi §5
"perluas `Letter`" dan **tidak** menunda e-seal sebagaimana §6 butir 8. Bagian ini
mencatat keputusannya secara eksplisit, supaya dokumen ini tidak lagi menyatakan
kebalikan dari arsitektur aktual.

**Keputusan: modul `foundation-decisions` berdiri sendiri, dengan model
`FoundationDecision`/`…Vote`/`…Member`/`…Rule`/`FoundationEseal`/`…Document`
— bukan perluasan `Letter`.**

Alasan menolak rekomendasi "perluas `Letter`":

1. **Bentuk data berbeda, bukan sekadar nilai enum baru.** `Letter` adalah
   naskah korespondensi (perihal, tujuan, isi, alur review). Keputusan organ
   adalah _kuorum terkunci_: snapshot anggota yang **immutable** pada saat
   keputusan dibuat, matriks kewenangan per organ, aturan kuorum yang dapat
   dikonfigurasi (UU 16/2001 jo. 28/2004 & PP 63/2008), dan hasil yang
   menutup/membuka keputusan. Memaksakan bentuk ini ke `Letter` + `LetterReviewer`
   berarti menambah kolom khusus-keputusan yang tak pernah dipakai surat, dan
   membuat setiap query surat harus menyaring baris keputusan keluar.
2. **Snapshot bukan relasi hidup.** Rekomendasi §5 memakai `LetterReviewer`
   (relasi ke pengguna _saat ini_). Semantik keputusan menuntut roster yang
   terkunci: anggota yang kemudian berpindah peran tetap dapat menandatangani
   dan membaca keputusannya, dan nama yang dicetak adalah nama **saat keputusan
   dibuat**. Relasi hidup tidak dapat menjamin itu tanpa mengubah arti
   `LetterReviewer` bagi surat.
3. **Kewenangan organ berbeda dari review surat.** Matriks Pembina/Pengurus/
   Pengawas dan komposisi GABUNGAN punya aturan komposisi sendiri
   (`foundation-authority.ts`); memetakannya ke `LetterReviewer` menuntut
   mengubah model itu untuk dua konsumen yang aturannya tidak sama.

**Keputusan kedua: e-seal internal Yayasan benar-benar diterbitkan pada PR ini,
tidak ditunda.** Rekomendasi §6 butir 8 ditolak karena tanpa sesuatu yang
membubuhkan tanda tangan akhir, "keputusan sah" tidak punya artefak yang dapat
diverifikasi publik; menunda berarti mengirim alur kuorum tanpa penutupnya.
Trade-off yang diterima dan dinyatakan jujur:

- **Trust model.** e-seal adalah kunci milik Yayasan, bukan kunci pihak ketiga.
  Kunci privat disegel AES-256-GCM dengan KEK dari passphrase server-side
  (`FOUNDATION_ESEAL_PASSPHRASE`, produksi menolak boot tanpa nilai eksplisit);
  admin basis data hanya melihat blob tersegel. Ini **bukan** PKI dan **bukan**
  sertifikat.
- **Status TTE: Tidak Tersertifikasi** (PP 71/2019 Ps. 60). Konsekuensinya persis
  seperti yang ditulis §4: bobot pembuktian ada pada pihak yang mengandalkannya.
  Karena itu bahasa UI/halaman verifikasi menyebut verifikasi arsip internal,
  tidak pernah mengklaim "tersertifikasi", dan tidak menyalin kalimat BSrE.
- **Mengapa bukan PAdES.** Sejalan dengan §4/§6 butir 5: PAdES menuntut
  Ed25519 → RSA-3072/ECDSA P-256 + `@signpdf` + sertifikat. Itu Tier-1 terpisah
  dan tidak dicampur ke PR ini. Yang dipakai adalah **detached Ed25519 atas
  digest kanonis** + arsip byte PDF (`FoundationDecisionDocument`) — tanda tangan
  tidak ditanam ke dalam PDF, sehingga digest yang ditandatangani sama persis
  dengan arsip yang disimpan dan diunggah pemverifikasi.
- **Yang TIDAK berubah dari rekomendasi ini:** jangan menyebut kunci raw
  Yayasan sebagai "sertifikat"; JANGAN menyalin kalimat BSrE; tandai dokumen
  sebagai TTE internal tidak tersertifikasi (§4 & §6 butir 9 tetap berlaku).

**Ikatan kunci suara (dikoreksi saat audit PR).** Suara anggota tidak boleh
dipercaya dari `publicKey` yang menempel pada baris suara — admin basis data
dapat menyisipkan pasangan kunci karangan. Perbaikannya mengikat setiap suara ke
`user_signing_key_history` (append-only) milik pemilih yang sama lewat
`signingKeyId` + `publicKeyFingerprint`, dan memverifikasi memakai kunci publik
dari **rekaman tepercaya itu**. Riwayat append-only inilah yang menjaga tanda
tangan lama tetap sah setelah rotasi/pencabutan kunci
(`apps/api/src/modules/foundation-decisions/foundation-decisions.service.ts`).

**Jadi, untuk pembaca berikutnya:** §5 dan §6 di bawah adalah proposal awal yang
ditolak, bukan deskripsi sistem. Peta kode yang benar adalah modul
`apps/api/src/modules/foundation-decisions` dan util murni
`foundation-authority.ts`, `foundation-quorum.ts`, `foundation-eseal.ts`,
`generate-decision-pdf.ts`.

---

## 1. Ringkasan eksekutif (verdict)

Proposal ini **secara arah benar** pada beberapa hal, tetapi **salah langkah dan
jauh tertinggal dari keadaan sebenarnya repository ini**, dan membuat **beberapa
cacat kriptografi/kepatuhan** bila dianggap "selaras best practice". Poin-poin
paling penting:

1. **Fitur yang diminta sudah 90% ada, dan lebih matang dari yang diusulkan.**
   Repositori ini memiliki modul TTE internal lengkap (`apps/api/src/modules/esign`),
   generator PDF (`utils/generate-letter-pdf.ts`), arsip byte PDF
   (`LetterSignedDocument`), kunci privat tersegel passphrase, lifecycle kunci,
   pencabutan (RFC 5280-style), dan verifikasi publik. Yang **tidak ada** hanyalah
   lapisan **alur keputusan Dewan Pembina / risalah** (skenario mufakat/voting) —
   justru lapisan yang paling sedikit butuh kriptografi baru.
2. **"X.509 Public Key" adalah kesalahan konsep.** X.509 adalah _sertifikat_
   (pengikat identitas oleh CA), bukan tipe kunci. Proposal mencampur "buat
   pasangan kunci" dengan "terbitkan sertifikat X.509". Self-signed X.509 **tidak
   menaikkan bobot hukum apa pun** di Indonesia dan justru bisa menyesatkan
   (lihat `docs/EOFFICE_ESIGN_PLAN.md` §4.3 & (c), dan bagian 4 di bawah).
3. **"PBKDF2/Argon2 + AES-GCM" lebih lemah dari yang sudah ada.** Kode sekarang
   memakai **scrypt + AES-256-GCM** dengan _tidak menyimpan hash passphrase sama
   sekali_ — pekerjaan yang lebih benar daripada menebak arsitektur ulang.
4. **Pilihan library PDF keliru kategorinya.** `pdf-lib` **tidak bisa** membuat
   PAdES; ia hanya dipakai untuk render _visual_. PAdES embedded butuh
   `@signpdf/signpdf` + `node-forge`/`signer-p12` + sertifikat, dan itu menuntut
   **migrasi Ed25519 → RSA-3072/ECDSA P-256** (EdDSA-in-CMS dukungan Acrobat
   tipis, RFC 8419). Ini bukan tweak, ini Tier-1 utuh (`EOFFICE_ESIGN_PLAN.md` §4.3).
5. **E-Seal yayasan berbasis kunci sendiri premiatur** dan polanya keliru
   berdasarkan pedoman BSrE (lihat `EOFFICE_ESIGN_PLAN.md` §(c)).
6. **Sisi hukum:** sistem ini = **TTE Tidak Tersertifikasi** (PP 71/2019 Ps.60).
   Proposal tidak boleh mengklaim bobot "tersertifikasi", dan sebaiknya menyalin
   praktik penulisan catatan verifikasi yang jujur (bukan tiruan kata-kata BSrE).

**Rekomendasi:** Jangan membangun PKI paralel. Bangun **modul `risalah`** yang
memperluas alur `Letter`/`LetterReviewer` yang sudah ada untuk memodelkan quorum
Dewan Pembina, dan _reuse_ seluruh infrastruktur penandatanganan yang ada. Berikut
rinciannya.

---

## 2. Yang SUDAH ADA dan TIDAK boleh dibangun ulang

Crosscheck ke kode & skema basis data saat ini:

| Kebutuhan dalam proposal                                   | Implementasi yang sudah ada                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pasangan kunci per anggota                                 | `UserSigningKey` (+ `UserIdentity` untuk identitas, `SigningKeyRequest` untuk lifecycle, `SigningKeyRevocationCode` untuk sebab pencabutan RFC 5280)                                                                                                                                                                                                                  |
| Privat key terenkripsi di DB, tanpa plaintext              | `utils/esign.ts` — **scrypt (RFC 7914) + AES-256-GCM**, IV/salt/authTag per kunci. Passphrase **tidak pernah disimpan** (buat sebagai hash pun tidak); bukti benar = GCM berhasil didekripsi. Ada penguncian setelah 5x salah (`MAX_PASSPHRASE_ATTEMPTS`, `lockoutUntil`)                                                                                             |
| Dekripsi private key di memori saat menandatangani         | `signPayload` / `signPdfHash` / `signRevocation` di `utils/esign.ts` (`unsealPrivateKey`)                                                                                                                                                                                                                                                                             |
| Penandatanganan PDF                                        | `POST /esign/letters/:letterId/sign` — tanda tangan Ed25519 atas **SHA-256 byte PDF final** (detached), disimpan di `LetterSignature` (`pdfHash`/`pdfSignature`), byte PDF di-arsip-kan di `LetterSignedDocument`                                                                                                                                                     |
| Akumulasi banyak tanda tangan tanpa membatalkan sebelumnya | Setiap tanda tangan menimbulkan **arsip byte PDF baru** yang berisi panel tanda tangan sebelumnya; `pdfHash` per tanda tangan mengikat byte terkini. `resolveLetterPdf` (`modules/correspondence/signed-pdf.ts`) selalu menyajikan byte arsip, **tidak pernah render ulang ulang** naskah yang sudah ditandatangani                                                   |
| Verifikasi keutuhan (integrity)                            | `POST /esign/verify-pdf` (publik, dibatasi rate, di belakang Turnstile) + **QR yang benar-benar dirender** di kaki surat (`generate-letter-pdf.ts`) yang mengarah ke halaman unggah `/public/verify-letter` — QR membawa **alamat halaman, bukan token**, dan token cetak dilayani terpisah; `utils/letter-verification.ts`; checksum `documents`-style + signer list |
| Audit log                                                  | `LetterFlowEvent` (append-only, terstruktur per surat), `AuditLog` (generik), `SigningKeyRequest` (riwayat penerbitan kunci tidak pernah dihapus)                                                                                                                                                                                                                     |
| UI modal passphrase & status verifikasi                    | `apps/web/src/components/settings/esign-panel.tsx`, `esign-key-inventory.tsx`, `hooks/use-esign.ts`, halaman `app/public/verify-letter`                                                                                                                                                                                                                               |
| Role Dewan Pembina                                         | `RoleCode.YAYASAN_PEMBINA` + `YAYASAN_KETUA`, `YAYASAN_SEKRETARIS` (Pembina/Pengurus/Pengawas sudah sebagai organ, bukan admin)                                                                                                                                                                                                                                       |
| Jenis naskah keputusan                                     | `LetterType.SURAT_KEPUTUSAN`, `BERITA_ACARA`, `PENGUMUMAN` sudah ada (tidak ada `RISALAH` — bagian 5)                                                                                                                                                                                                                                                                 |

> Konsekuensi golden rule #8: **kode TTE yang baru harus memakai primitif di
> atas, bukan menduplikasinya.** Menambahkan tabel `Certificate`/`Document`/
> `AuditLog` paralel dan library PDF baru adalah pemborosan yang menyalahi
> `apps/api/AGENTS.md` ("Reuse, don't reinvent").

---

## 3. Cacat konsep & kriptografi yang harus dikoreksi

### 3.1 "X.509 Public Key" untuk tiap anggota → salah konsep

- X.509 adalah format _sertifikat_, bukan tipe pasangan kunci. "Generate
  pasangan kunci X.509" tidak masuk akal; yang bisa dibuat adalah kunci
  RSA/EC/Ed25519 lalu dibungkus sertifikat X.509 v3.
- **Membuat sendiri self-signed X.509 tidak menambah jaminan yayasan mana
  pun.** Kunci raw Ed25519 + binding identitas `UserIdentity` (legalName, NIK,
  tempat/tanggal lahir, diverifikasi Super Admin) sudah mengikat kunci ke orang
  nyata. Sertifikat yang masih "percaya pada kita" sama nilainya dengan raw key
  yang "percaya pada kita"; bedanya hanya bentuk bungkusnya.
- Kapan sertifikat X.509 MENJADI wajib? **Tier-1 (PAdES embedded)** dan
  **Tier-2 (PSrE/BSrE tersertifikasi)**. Pada saat itu, sertifikatnya bukan
  self-signed yayasan, melainkan diterbitkan PSrE. Membuat X.509 self-signed
  sekarang adalah jalan buntu: saat naik Tier-2, sertifikat itu dibuang.

**Koreksi:** Pertahankan **Ed25519 raw key** (atau — bila sepakat menuju PAdES
Tier-1 — naikkan sekaligus ke **RSA-3072 / ECDSA P-256**, lihat 3.3). Jangan
menambah tabel `Certificate` sampai Tier-1/2 benar-benar diimplementasi.

### 3.2 KDF: "PBKDF2/Argon2" → sebaiknya pertahankan scrypt, naikkan parameter

- OWASP 2024/2025: **Argon2id** pilihan utama; **scrypt** bila Argon2id tidak
  tersedia; **PBKDF2** hanya untuk kepatuhan FIPS. Kode sekarang memakai
  **scrypt** (tanpa dependensi biner, di Node inti) — sudah _memory-hard_, dan
  parameternya **disimpan per kunci** (`kdfParams`) sehingga bisa dinaikkan tanpa
  migrasi.
- Koreksi kecil yang bernilai nyata: `SCRYPT_PARAMS = { N: 1<<15, r, p }`
  ≈ 33 MB memori; OWASP menyarankan ≥ `2^17` + `r=8` ≈ 128 MB+. `rewrapKeyMaterial`
  sudah ada untuk menerapkan ulang (naikkan saat `changePassphrase`). Saran:
  naikkan `N` ke `1<<17`, `maxmem` ikut dinaikkan, dan tulis tes regresi bahwa
  kunci lama tetap terbaca (parameternya diambil dari `kdfParams`).
- Catatan penting yang sudah benar di kode: **tidak menyimpan hash passphrase**.
  Ini justru menutup jalur tebak-offline bagi pencuri DB — simpanan itu sendiri
  menjadi bahan serangan. Pertahankan desain ini (jangan coba "memperbaiki" dengan
  menambah hash passphrase, karena itu justru menambah vektor serangan).

### 3.3 Pilihan library PDF: `pdf-lib` ≠ PAdES

- `pdf-lib` **tidak dapat menghasilkan tanda tangan PAdES** (tidak ada
  CMS/PKCS#7, tidak ada `Sig` dictionary + `ByteRange`). Di repositori ini ia
  hanya merender naskah secara **visual**.
- Standar PAdES (ETSI EN 319 142, ISO 32000-2) menuntut **signature dictionary
  dengan `ByteRange`** dan **payload CMS/PKCS#7** (`ETSI.CAdES.detached` /
  `Adobe.PPKLite`). Tool yang benar di stack Node: **`@signpdf/signpdf`**
  (penerus node-signpdf) + **`node-forge`** (atau `@signpdf/signer-p12`) untuk
  membangun envelope CMS, + sertifikat.
- **Akumulasi banyak tanda tangan** (proposal #3) di PAdES: tiap tanda tangan = Satu
  `Sig` dictionary + ByteRange sendiri lewat **incremental save** (ETSI EN 319
  142-2). `@signpdf` mendukung ini dengan pola placeholder berurutan. Ini
  **berbeda** dari mekanisme arsip-per-tanda-tangan yang dipakai sekarang,
  meski keduanya sah.
- **Pindah ke PAdES embedded = migrasi algoritma.** Ed25519 di dalam CMS hanya
  didefinisikan RFC 8419, dan **dukungan Acrobat terhadap EdDSA-in-CMS sangat
  tipis**. `EOFFICE_ESIGN_PLAN.md` §4.3 sudah menetapkan: bila ke PAdES, ganti
  lapisan PDF ke **RSA-3072 atau ECDSA P-256** (sertifikat self-signed fine di
  Tier-1), lalu Tier-2 tukar dengan sertifikat BSrE/PSrE.

### 3.4 E-Seal yayasan → koreksi bobot & urutan

- PP 71/2019 mendefinisikan segel elektronik sebagai TTE milik **badan
  usaha/instansi**. Petunjuk Teknis BSrE v2.0 (per `EOFFICE_ESIGN_PLAN.md` §(c)):
  **satu segel per dokumen**, boleh nol/satu/banyak tanda tangan; **segel harus
  diterapkan dulu, baru tanda tangan**; segel tembus-transparan menuntut tanda
  tangan juga transparan; segel dipakai otomatis (tanpa klik).
- **Koreksi kritik:** proposal Gemini membayangkan E-Seal sebagai "kunci ke-6"
  tambahan yang ikut ditandatangani. Itu menghasilkan **artifak kriptografis
  kedua yang tidak tersertifikasi untuk membuktikan hal yang sudah dibuktikan
  kunci pertama** — duplikasi tanpa penambahan yang bisa dibuktikan.
- Jalan yang benar saat ini: (a) tunda E-Seal sampai ada sertifikat PSrE/keadaan
  dokumen tanpa penandatangan manusia, ATAU (b) wujudkan jaminan organisasi lewat
  **kunci tanda tangan milik organ yayasan** (mis. `YAYASAN_KETUA`) sebagai
  penanda "diterbitkan oleh yayasan", bukan sebagai segel paralel. Yang WAJIB
  dilakukan sekarang hanyalah menjaga **urutan alur**: finalisasi PDF (arsip/Hash)
  → (nanti) segel → tanda tangan. Desain `risalah` di bagian 5 berpijak pada itu.

### 3.5 "Server tidak boleh menyimpan private key plaintext" → sudah benar, tapi

perlu ekspektasi jujur soal residu risiko

- Klaim proposal benar dan sudah terpenuhi. Tambahan yang perlu ditegaskan:
  - Pencuri DB hanya mendapat **blob tersegel**, tanpa bahan tebak passphrase
    (tidak ada hash passphrase) → tidak bisa memalsukan tanda tangan secara
    offline, dan tidak bisa menebak passphrase secara efisien (ditambah lockout).
  - Administrator yang **sedang menandatangani** tetap melihat kunci dalam
    memori proses (karena signing terjadi server-side). Ini residual risk yang
    hanya bisa dikecilkan dengan **HSM/signing server** atau **PSrE sign-aside**
    (Tier-2). Proposal tidak boleh menyiratkan bahwa "schema + enkripsi DB"
    menghapus risiko ini.

---

## 4. Kepatuhan hukum (jangan mengklaim lebih dari yang dibuktikan)

- UU ITE Ps.11 + **PP 71/2019 Ps.60**: sistem ini = **TTE Tidak Tersertifikasi**.
  Sah dan dapat diterima secara hukum, tetapi **beban pembuktian ada pada pihak
  yang mengandalkannya**. Hanya TTE yang dibuat di PSrE Indonesia yang
  "tersertifikasi".
- Konsekuensi: (1) split biarkan pembuktian klarifikasi itu jujur;
  (2) **jangan menyalin kalimat** _"Dokumen ini telah ditandatangani secara
  elektronik menggunakan sertifikat elektronik yang diterbitkan oleh Balai
  Sertifikasi Elektronik (BSrE), BSSN"_ — itu tidak benar untuk kunci yayasan
  sendiri (`EOFFICE_ESIGN_PLAN.md` §4.3). Tulis nama yang sebenarnya: "dibuat &
  diverifikasi oleh sistem TTE internal yayasan".
- **Jangan menulis "sertifikat"** di dokumentasi/UI untuk kunci raw yayasan;
  tulis "kunci tanda tangan".

---

## 5. Alur keputusan Dewan Pembina: desain modul `risalah` yang benar

> **⛔ SUPERSEDED — lihat §0.** Rancangan ini DITOLAK; implementasi memakai modul
> `foundation-decisions` mandiri. Bagian ini disimpan sebagai catatan historis.

Yang benar-benar belum ada bukan kriptografinya, melainkan **lapisan keputusan
bareng** (quorum Dewan Pembina). Ini pikiran desain:

**a. Model data baru (perluasan `Letter`, bukan PKI paralel):**

```
model RisalahDecision {
  id              String  @id
  letterId        String  @unique               // satu risalah = satu naskah
  decisionType    RisalahDecisionType           // MUFTAKAT | VOTING
  status          RisalahDecisionStatus         // DRAFT | VOTING | APPROVED | REJECTED
  decidedAt       DateTime?
  tallySetuju     Int?
  tallyTidak      Int?
  submitterId     String                        // panitia risalah
  closedById      String?                       // yang menetapkan hasil
  createdAt       DateTime
}

enum RisalahDecisionType { MUFTAKAT VOTING }    // mufakat=5/5
enum RisalahDecisionStatus { DRAFT VOTING APPROVED REJECTED }
  // APPROVED jika have >=3 setuju; REJECTED jika <3 (dominan tidak setuju)
```

- Skor **anggota** memakai `LetterReviewer` yang **sudah ada** (`isSigner`,
  `status: APPROVED/REJECTED`, `order`) — tidak perlu tabel pemilih baru.
  Tambah kolom `vote: 'SETUJU' | 'TIDAK'` dan `memberRole` pada `LetterReviewer`
  untuk menuliskan suara secara eksplisit.
- Status surat diperluas: `LetterStatus.READY_TO_SIGN` → keputusan divote →
  bila `APPROVED`, hanya `LetterReviewer` yang `SETUJU` yang `isSigner=true`
  (ditetapkan oleh panitia/ketua); bila `REJECTED`, naskah ditandai
  `LetterStatus` baru `REJECTED` dan **tidak** boleh ditandatangani.
- `LetterType`: tambahkan `RISALAH` dan `RISALAH_KEPUTUSAN` (nilai baru pada
  enum yang ada), bukan tabel dokumen terpisah.

**b. Alur penandatanganan:**

1. Panitia membuat `Letter(type: RISALAH_KEPUTUSAN)` + `RisalahDecision`.
2. Dewan Pembina (5) diverifikasi sebagai `LetterReviewer`; admin mensubmit
   `MUFTAKAT` atau `VOTING`.
3. Suara direkam; saat kuorum tertutup:
   - **Mufakat (5/5)** → semua 5 `isSigner=true`, masing-masing tanda tangan via
     `POST /esign/letters/:id/sign` (passphrase) **yang sudah ada**.
   - **Voting (3 atau 4)** → hanya pihak `SETUJU` `isSigner=true`.
   - **Dominan tidak setuju (<3)** → `RisalahDecision.status=REJECTED`,
     `Letter.status` batal; **tidak** ada yang menandatangani (atau dicatat
     "ditolak" tanpa tanda tangan).
   - PDF final memuat **rincian perolehan suara** (dihitung dari `RisalahDecision`
     - `LetterReviewer.vote`) — data ini di-render ke dalam PDF oleh
       `generateLetterPdfBuffer` _sebelum_ ditandatangani, sehingga tercakup dalam
       `pdfHash` yang ditandatangani setiap anggota.
4. Setelah semua pihak yang berwenang menandatangani, tanda tangan orang
   terakhir menutup dokumen (status `SIGNED`); arsip byte final otomatis
   (mekanisme `LetterSignedDocument` yang ada).

**c. Api dibangun di atas modul `esign` yang ada:**

- Semua primitif (`signLetter`, `verifyPdf`, `resolveLetterPdf`, dll.) di-reuse.
- Tes vitest wajib untuk logika quorum (mufakat/voting/rejected) — golden rule #7;
  Perlu e2e Playwright untuk alur voting + render suara + pasangan passphrase.

---

## 6. Checklist koreksi konkret (prioritas)

> **⛔ SUPERSEDED — lihat §0.** Butir 1–4 dan 8 di bawah bertentangan dengan
> arsitektur final dan tidak diikuti. Butir 5/6/9 (PAdES Tier-1 terpisah, scrypt,
> bahasa TTE jujur) tetap relevan.

1. [ ] JANGAN tambah tabel `Certificate`/`Document`/`AuditLog` paralel.
2. [ ] Tambah `RisalahDecision` (+ tipe/status), kolom `vote` pada `LetterReviewer`,
       `LetterType` risalah, status `REJECTED` — lewat migrasi Prisma + `db:generate`.
3. [ ] Tulis layanan `risalah.{service,controller,routes,schema,index}` + tes
       quorum (mufakat/voting/rejected), reuse `esign.signLetter`.
4. [ ] Render "perolehan suara" ke PDF di `generateLetterPdfBuffer` (sebelum
       finalisasi) dan pastikan tercakup di `pdfHash`.
5. [ ] Putuskan visi PAdES: sekarang cukup **detached + arsip**. Jika ingin PDF
       yang "bisa diverifikasi di Acrobat", lakukan **Tier-1 sebagai PR terpisah**:
       naikkan ke RSA-3072/ECDSA P-256 + `@signpdf` + `node-forge`, pertahankan
       arsip & upload-verify. Jangan campur ke PR donor risalah.
6. [ ] Naikkan `SCRYPT_PARAMS.N` ke `1<<17` (rewrap pada `changePassphrase`),
       dengan tes bahwa kunci lama tetap terbaca.
7. [ ] Dependensi baru (bila Tier-1): `@signpdf/signpdf`, `node-forge`,
       `@signpdf/signer-p12`; tambah ke `docker-compose.yml` bila ada env baru
       (aturan `apps/api/AGENTS.md`).
8. [ ] E-Seal: tunda atau wujudkan sebagai tanda tangan organ yayasan, bukan
       kunci paralel; patuhi urutan finalise→segel→sign.
9. [ ] Bahasa UI/dokumen yang jujur: "TTE internal (tidak tersertifikasi)", bukan
       kutipan BSrE, bukan kata "sertifikat resmi".

---

## 7. Catatan invariant keamanan modul `foundation-decisions`

Narasi audit yang dulu hidup sebagai komentar panjang di dalam
`apps/api/src/modules/foundation-decisions/foundation-decisions.service.ts`
dipindahkan ke sini. Kode hanya menyisakan komentar singkat yang menjelaskan
invariant setempat; rationale historis ("cacat apa yang diperbaiki") ada di
bagian ini agar logika operasional tidak terkubur.

### 7.1 Verifikasi suara terikat pada riwayat kunci yang tepercaya

`isVoteAuthentic` mengikat empat hal sekaligus: pemilih adalah anggota organ
pada SNAPSHOT terkunci; `canonicalDigest` tersimpan sama dengan digest yang
dihitung ulang dari isi keputusan + pilihan + `signedAt`; kunci yang
memverifikasi menunjuk rekaman `user_signing_key_history` milik pemilih yang
sama; dan `signature` benar atas digest itu menurut kunci tepercaya tersebut.

Sebelum perbaikan, verifikasi memakai `vote.publicKey` — kunci yang ditulis pada
baris suara itu sendiri. Siapa pun yang dapat menulis langsung ke
`foundation_decision_votes` cukup menyisipkan pasangan kunci karangan,
menandatangani digest dengannya, lalu menulis baris suara. Tanda tangan itu
"sah" terhadap kuncinya sendiri, suara palsu lolos, dan keputusan memperoleh
e-seal Yayasan atas dasar suara palsu. Sekarang `vote.publicKey` hanya menjadi
pembanding terhadap kunci tepercaya; kunci yang benar-benar memverifikasi
berasal dari rekaman riwayat. Baris yang gagal tidak pernah dihitung ke kuorum.

### 7.2 TOCTOU rotasi/pencabutan kunci di dalam transaksi suara

`castVote` membaca `UserSigningKey`, menandatangani, lalu membuka transaksi.
Antara pembacaan dan `INSERT`, jalur lain dapat merotasi kunci
(`esign.activateKey`) atau mencabutnya (`esign.revokeKey`) — keduanya di
transaksi sendiri. Bila rotasi menang, baris suara yang terlanjur ditulis akan
ditolak `isVoteAuthentic`, sehingga (a) suara tidak masuk rekap tetapi barisnya
tetap ada, dan (b) percobaan ulang ditolak "sudah memberikan suara" — pengguna
terkunci tanpa suara dan tanpa jalan pulih.

`assertSigningKeyStillCurrent` membuktikan ULANG di dalam transaksi suara bahwa
kunci yang menandatangani masih berlaku bagi pemiliknya. Ini cukup tanpa lock
baru karena segmen kritis rotasi dan pencabutan masing-masing berjalan dalam
satu transaksi, sehingga pembacaan ulang hanya dapat melihat keadaan SEBELUM
atau SESUDAH, bukan di tengahnya. `signedAt` sengaja ditetapkan sebelum
penandatanganan: bila ditetapkan sesudah, cap rotasi akan jatuh mendahuluinya
dan suara yang sudah commit menjadi tidak autentik.

### 7.3 Masa berlaku kunci pada `vote.signedAt`

`keyUsableAt` membaca `issuedAt`, `revokedAt`, dan `supersededAt` terhadap
`vote.signedAt`, bukan hari ini: tanda tangan sebelum penerbitan mustahil;
tanda tangan pada/di setelah pencabutan atau penggantian ditolak sebagai tanda
tangan BARU; suara historis tetap sah. Karena `signedAt` termasuk payload
kanonis yang diverifikasi, penyerang tidak dapat memindah-mundurkannya tanpa
memalsukan tanda tangan.

### 7.4 Invariant satu e-seal aktif

`ensureSeal` sengaja tidak mengambil "seal tertua" (yang mungkin sudah dicabut),
dan menyaring kandidat dengan probe kemampuan menandatangani memakai passphrase
SEKARANG — setelah rotasi passphrase, seal lama masih `revokedAt: null` tetapi
kunci privatnya tersegel dengan passphrase lama. Pola find-then-create memiliki
balapan nyata: dua approval paralel sama-sama membaca "tidak ada seal" lalu
sama-sama membuat seal baru. Indeks unik parsial
`foundation_eseals_single_active_key` (migrasi
`20260917000000_foundation_decision_vote_key_binding`) menegakkan invariant di
tingkat basis data; aplikasi menangani balapan dengan membaca ulang pemenangnya.

### 7.5 Riwayat kunci & backfill migrasi

`UserSigningKey` dihapus saat kunci diterbitkan ulang, sehingga tanpa
`user_signing_key_history` tidak ada tempat tepercaya untuk memverifikasi suara
setelah rotasi. Rekaman dibuat idempoten (`upsert` pada `(userId, fingerprint)`).
Migrasi backfill merekonstruksi riwayat dari `user_signing_keys` yang SEDANG
berlaku; ia tidak mempromosikan `foundation_decision_votes.public_key` (data
yang justru ingin dibuat tidak tepercaya) menjadi riwayat tepercaya. Suara lama
dibiarkan tanpa pengikat — `trustedKeyForVote` memperlakukannya sebagai tidak
sah (fail closed).

### 7.6 Rapat vs sirkuler & finalisasi

Rapat ditutup lewat `finalize` dengan `closed: true` setelah kuorum hadir
terpenuhi. Sirkuler tidak punya "rapat": `closed` sengaja tidak diteruskan
(`closed: d.kind !== 'CIRCULAR'`), sehingga hasilnya hanya bergantung pada
himpunan suara. Konsekuensinya: sirkuler APPROVED hanya saat ambang mufakat
tercapai, REJECTED hanya saat mufakat terbukti mustahil, dan selama masih
mungkin statusnya tetap VOTING — pimpinan tidak boleh menggugurkannya lebih
awal.

### 7.7 Publikasi metadata & sensor verifikasi publik

`setPublication` hanya menerima `PUBLIC` bila status `APPROVED` DAN artefak
final lengkap (`finalPdfDigest`, tanda tangan e-seal, `esealId`, arsip dokumen).
`REJECTED` tidak boleh diterbitkan. Baris keputusan dikunci lebih dulu dan
`publication` dibaca setelah lock, sehingga dua request paralel tidak dapat
mencatat `oldValues` yang sama; perubahan no-op tidak menulis audit.

`verifyByToken`/`verifyPdf` adalah endpoint anonim: metadata tata kelola
(subject, organ, tanggal, rekap suara) hanya keluar bila keputusannya `PUBLIC`,
bawaannya PRIVATE (fail closed). Bukti keabsahan (`isValid`, `digest`,
`digestOk`, `sealVerified`, `reason`, `decisionId`) tetap dikembalikan.

---

## 8. Referensi

- `docs/EOFFICE_ESIGN_PLAN.md` (audit sebelumnya + peta Tier PAdES + aturan segel BSrE)
- `apps/api/src/modules/esign/*`, `apps/api/src/utils/esign.ts`, `esign-lifecycle.ts`,
  `esign-revocation.ts`, `signer-identity.ts`, `generate-letter-pdf.ts`,
  `correspondence/signed-pdf.ts`
- Skema: `UserSigningKey`, `UserIdentity`, `SigningKeyRequest`, `LetterSignature`,
  `LetterSignedDocument`, `LetterReviewer`, `LetterFlowEvent`, `AuditLog`,
  enums `RoleCode`, `LetterType`, `LetterStatus`
- Standar: ETSI EN 319 142-1/-2 (PAdES), ISO 32000-2 (PDF), RFC 5280, RFC 8419
  (EdDSA-in-CMS), RFC 7914 (scrypt), RFC 9106 (Argon2), OWASP Password Storage
  Cheat Sheet; UU ITE Ps.11 + PP 71/2019 (TTE Tersertifikasi/Tidak Tersertifikasi).
