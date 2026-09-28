# pk-organ-yayasan-tanpa-kontrak

> Keputusan 2026-09-06 — Pembina, Pengurus, dan Pengawas TIDAK membuat Perjanjian Kinerja; kontrak Pengurus sudah berupa RKA Yayasan, dan PK unit menginduk pada dokumen RKA

**Tidak satu pun organ yayasan membuat Perjanjian Kinerja.** Diputuskan
pengguna 2026-09-06 setelah pembahasan lengkap; diterapkan di PR #415
(`pk.service.ts`, konstanta `ORGAN_TANPA_PK`). Alasannya per organ:

| Organ | Kenapa tidak |
|---|---|
| **Pembina** | Organ yang **mengesahkan** program kerja dan RKA (UU 16/2001 jo. 28/2004). Ia menilai, bukan dinilai; dan biasanya tidak fulltime. |
| **Pengurus** (Ketua/Sekretaris/Bendahara/Anggota) | Bertanggung jawab **kolektif kolegial** — tanggung jawabnya tak bisa dipecah per orang. Kontraknya SUDAH ada dan hanya satu: **RKA Yayasan yang disahkan Pembina**. |
| **Pengawas** | Mengawasi Pengurus. Memberinya PK yang dinilai pihak yang ia awasi merusak independensinya (larangan rangkap jabatan ada justru untuk itu). |

**Aturan yang paling menentukan bentuknya, dari pengguna sendiri:**
*"pastikan jangan sampai ada duplikasi ada untuk buat RKA dan ada untuk buat
perjanjian kinerja isinya RKA juga untuk pengurus!"* — saya sempat mengusulkan
Ketua Pengurus menandatangani PK tingkat lembaga; itu **menyalin isi RKA ke
dokumen kedua**. Dibatalkan seluruhnya. Kalau muncul lagi ide "PK yayasan",
jawabannya sudah ada: dokumen itu bernama RKA Yayasan.

**Konsekuensi teknisnya — PK menginduk pada dokumen, bukan pada PK atasan.**
Rantai PK biasa mewajibkan atasan punya PK ber-status APPROVED lebih dulu.
Karena organ yayasan tak punya PK, PK yang atasan penilainya organ (mis. Kepala
SD IT → Ketua Pengurus) **wajib menyebut `strategicPlanId`**, dan dokumen itu
(diperketat 2026-09-11, keputusan pengguna):

- bertipe **RKA** — bukan RPJP atau Renstra;
- milik **unit pemilik PK itu sendiri**: kepala unit menginduk RKA Unit-nya,
  pegawai yayasan menginduk RKA Yayasan;
- sudah **disahkan** (APPROVED/IN_PROGRESS), bukan sekadar non-DRAFT —
  PermenPANRB 53/2014 C.2: PK disusun setelah dokumen anggaran disahkan.

Unit sebuah PK = unit rencana induknya, jatuh ke unit pegawai
(`pkOwnerUnitId`). Hak akses dan analitik kini memakai fungsi yang sama; dulu
keduanya berbeda pendapat tentang PK yang menginduk RKA Yayasan.

Ini menjawab kebingungan "kalau ada RKA unit, apakah PK-nya jadi dobel?".
Tidak: RKA unit adalah *apa yang dikerjakan unit*, PK adalah *siapa yang
mempertaruhkan namanya atas itu* — satu menunjuk yang lain, isinya tidak
disalin.

**Atasan penilai dipilih manual, dengan usulan.** `getSupervisors` mengembalikan
`roleCodes` + `suggested` (kepala unit → Ketua Pengurus; guru/staf → kepala
sekolah unitnya berdasarkan awalan TKQ/SDIT/SMPIT/SMAQ); Pembina dan Pengawas
tidak masuk daftar calon sama sekali (2026-09-11). Usulan, bukan paksaan —
struktur yayasan berubah dan PermenPANRB 53/2014 pun hanya menyebut "pimpinan
instansi yang lebih tinggi".

Pengecualian yang **belum dimodelkan**: Pengurus non-pendiri yang fulltime dan
digaji lewat pengecualian Pasal 5 UU 28/2004. Kalau yayasan mengangkat satu,
aturan ini perlu ditinjau lagi.

Lihat [rka-dua-tingkat](./rka-dua-tingkat.md) untuk rantai perencanaannya, dan
[guard-tests-that-measure-the-wrong-thing](../lessons/guard-tests-that-measure-the-wrong-thing.md) untuk kebuntuan yang saya pasang
sendiri saat menegakkan rantai ini.
