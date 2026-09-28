# pengesahan-dokumen-yayasan

> KEPUTUSAN 2026-09-11 — RPJP, Renstra, dan RKA Yayasan disahkan lewat Pengurus → Pengawas (reviu) → Pengurus (tanggapan) → Pembina (tetapkan/kembalikan); RKA Unit disusun kepala sekolah dan disahkan Ketua Pengurus; dokumen yang sudah disahkan beku; dasar hukumnya sudah diriset

**Keputusan pengguna 2026-09-11, diterapkan di PR #415 (`d5c4947b`).** Empat keputusan
sekaligus, lalu satu perluasan dari pengguna sendiri: *"bukan hanya RKA yayasan
saja … tapi juga seperti Renstra dan RPJP"*.

| Dokumen | Menyusun | Mengesahkan | Alur |
|---|---|---|---|
| RPJP, Renstra, RKA Yayasan (`unitId` null) | Pengurus, diwakili Ketua | **Pembina** | Pengurus ajukan → **Pengawas reviu** → Pengurus tanggapi (revisi, atau tidak dengan alasan) → Pembina tetapkan atau kembalikan |
| RKA Unit | **kepala sekolah** dan admin unit itu | **Ketua Pengurus**, satu tombol | — |
| PK kepala unit | kepala unit | Ketua Pengurus | wajib menginduk RKA **unitnya sendiri** yang sudah disahkan |

**Dasar hukum — sudah diriset, jangan diulang:**
- UU 16/2001 Ps. 28 ayat 2: huruf c "penetapan kebijakan umum Yayasan
  berdasarkan Anggaran Dasar" (RPJP/Renstra) dan huruf d "pengesahan program
  kerja dan rancangan anggaran tahunan Yayasan" (RKA) — keduanya wewenang Pembina.
- Ps. 31 ayat 1: Pengurus melaksanakan kepengurusan. Ps. 40 ayat 1: Pengawas
  "melakukan pengawasan serta memberi nasihat" — maka **mereviu, tidak memveto**.
- Pembanding BUMN, UU 19/2003 Ps. 21–22: Direksi menyusun RJP, ditandatangani
  bersama Komisaris, disahkan RUPS; RKAP juga disahkan RUPS.
- BoardSource: manajemen menyusun, dewan menyetujui rencana strategis final.
- PermenPANRB 53/2014 C.2: PK disusun setelah dokumen anggaran disahkan.

**Bentuk teknis, dengan alasannya:**
- Tahap di kolom sendiri `review_stage` (`PlanReviewStage`), **bukan** status
  baru — `PlanStatus` dipakai bersama PK dan evaluasi.
- Tiap langkah = compare-and-set atomik (`updateMany` dengan tahap asal) plus
  baris `plan_review_events` yang hanya ditambah. Dua tab yang menekan
  bersamaan → satu menang, satu mendapat "Tahap … sudah berubah".
- **Hanya organ itu sendiri.** Super Admin tidak bisa mengajukan, mereviu, atau
  menetapkan; `/approve` menolak semua dokumen yayasan.
- Selama di tangan Pengawas/Pembina, dokumen terkunci (kepala + subrecord).
- **Sudah disahkan = beku.** Kepala rencana kini ikut aturan subrecord (hanya
  DRAFT/IN_PROGRESS), dan hanya DRAF yang bisa dihapus — menghapus ikut
  menghanyutkan riwayat pengesahan (cascade). Keduanya dulu terbuka.
- Dokumen PROPOSED lama tanpa tahap boleh masuk alur; tanpa itu ia buntu.
- Kontrak keempat langkah hidup di `@cipansor/shared` (`schemas/planning.ts`);
  tombol Kirim di dialog aktif persis ketika skema yang sama lolos.

**Bukti 2026-09-11 (stack terisolasi, 34 pemeriksaan API + tangkapan tiap
organ):** putaran penuh dengan satu kali "kembalikan", 8 kejadian di riwayat;
RKA SMP IT disahkan Ketua; PK kepala SMP IT menginduk padanya (201) dan
ditolak bila menginduk RKA Yayasan. Uji e2e:
`apps/web/e2e/perencanaan-pengesahan.spec.ts`.

**Belum dimodelkan:** keputusan Pembina sebagai keputusan *rapat* (kini satu
akun Pembina yang menekan); aturan per-medan untuk rencana BERJALAN — kepala
rencana IN_PROGRESS masih bisa diubah penyusunnya.

Lihat [rka-dua-tingkat](./rka-dua-tingkat.md), [pk-organ-yayasan-tanpa-kontrak](./pk-organ-yayasan-tanpa-kontrak.md).
