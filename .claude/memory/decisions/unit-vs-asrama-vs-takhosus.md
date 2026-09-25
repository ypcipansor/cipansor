# unit-vs-asrama-vs-takhosus

> RISET + REKOMENDASI 2026-09-13: asrama/boarding BUKAN unit (mukim/non-mukim itu atribut EMIS); pesantren = Foundation; Takhasus butuh unit TAPI TakhosusEnrollment yang sudah ada adalah sumbu lain; DIPUTUSKAN: unit pesantren = `UnitType.PESANTREN` yang sudah ada, syahadah saja

Pertanyaan pengguna 2026-09-13: santri SD/SMP/SMA nanti **boarding** juga (SD
opsional, SMP & SMA wajib asrama) dan mondok; Takhasus fokus pesantren saja
tanpa sekolah. Perlu unit baru atau tidak?

**Uji pembedanya, dan pakai ini untuk pertanyaan serupa berikutnya:** satu
*unit* = satu satuan/program yang **menerbitkan kelulusannya sendiri** (punya
NPSN Kemendikbud, atau SK izin operasional Kemenag untuk PKPPS/Muadalah/PDF,
DAN mengeluarkan rapor/ijazah/syahadah sendiri). Kalau ia hanya menjelaskan *di
mana santri tinggal* atau kegiatan tambahan → atribut, bukan unit.

| Hal | Unit baru? | Tempatnya |
|---|---|---|
| Asrama SD (opsional) / SMP, SMA (wajib) | **TIDAK** | `Dormitory`/`Room`/`RoomAssignment` + `Unit.boardingPolicy` (belum ada) |
| Pesantren sebagai wadah | **TIDAK** | `Foundation` (NSPP) |
| Takhasus (pesantren murni, tanpa sekolah formal) | **YA** | `Unit` baru + nilai `UnitType` baru |

**Dasar regulasinya, sudah diriset — jangan ulang.** Kemenag sendiri mencatat
boarding sebagai atribut santri: **mukim vs non-mukim** di EMIS, bukan dua
lembaga. UU 18/2019 memberi pesantren tiga jalur pendidikan (Muadalah, Diniyah
Formal, Ma'had Aly) plus **PKPPS** Ula/Wustha/Ulya yang izinnya terbit terpisah
(Ula+Wustha di Kantor Kemenag, Ulya di Kanwil, diverval atas NSPP). Praktik
lazim santri takhasus: **dua ijazah** — syahadah pesantren + kesetaraan
(PKPPS atau Paket B/C).

**Skemanya sudah benar untuk asrama, dan keputusannya tertulis di sana.**
`Dormitory.unitId` sengaja nullable: *"asrama is run at foundation level … santri
study at SD IT / SMP IT / SMA Qur'an and board in the same asrama."* Dulu kolom
itu wajib sehingga setiap asrama mengaku milik SMP IT.

**Yang kurang:** tidak ada yang mencatat **kebijakan** asrama, jadi "wajib
asrama tapi kamarnya belum ditetapkan" tidak bisa dibedakan dari "SD yang
memilih tidak mondok". Tambahan yang tepat `Unit.boardingPolicy`
(WAJIB/OPSIONAL/TIDAK_ADA); status mukim per tanggal tetap dibaca dari
`RoomAssignment` (sudah punya `assignedAt`/`endedAt`).

**KOREKSI PENTING atas rekomendasi awal: `TakhosusEnrollment` SUDAH ADA**
(`schema.prisma:3203`, modul api lengkap — murojaah/simaan/sanad/target, 11
halaman `/takhosus/*`). Ia memodelkan takhosus sebagai
**program hafalan** yang menempel pada Student (`targetJuz`, halaqoh, sanad) —
**bukan** satuan pendidikan. Jadi keduanya **ortogonal, bukan bersaing**:
santri SMP IT yang ikut takhosus punya KEDUANYA; santri takhosus-only butuh
unit Takhasus (karena `students.unit_id` NOT NULL harus menunjuk sesuatu yang
benar) **ditambah** `TakhosusEnrollment`. Jangan buang yang sudah ada.

**Jangan pakai `UnitType.PESANTREN`** (nilai itu ada dan belum terpakai) untuk
asrama — pesantren adalah badan penyelenggara, tempatnya `Foundation`.
Kalau dijadikan unit ke-6, setiap santri jadi anggota dua unit dan seluruh
laporan per unit pecah.

**Bug sampingan yang ditemukan:** `TakhosusEnrollment.@@unique([studentId])`
berkomentar "satu santri hanya bisa satu enrollment **aktif**", padahal
constraint-nya mengunci satu enrollment **selamanya** — santri yang selesai lalu
ambil target baru tidak bisa didaftarkan lagi. Obatnya partial unique index
`(student_id) WHERE status='ACTIVE'`, pola yang sudah dipakai
`student_card_state_one_active_per_student`.

**KEPUTUSAN PENGGUNA 2026-09-13: PESANTREN MURNI, SYAHADAH SAJA** — tanpa
PKPPS, tanpa Muadalah. Alasannya: jenjang formal sudah ditutup TK Qur'an, SD IT,
SMP IT, SMA Qur'an, jadi kesetaraan cuma menduplikasi.

**Dan itu berarti JANGAN tambah nilai `UnitType` baru — pakai
`UnitType.PESANTREN` yang sudah ada.** Nilai itu memang ada untuk ini dan belum
terpakai. (Nasihat "jangan pakai `UnitType.PESANTREN`" di atas tetap berlaku
untuk hal yang BERBEDA: jangan bikin unit-wadah yang SELURUH santri SD/SMP/SMA
jadi anggotanya — itu yang memecah laporan. Satu unit pesantren yang anggotanya
HANYA santri takhasus-murni tidak punya masalah itu.)

**Yang sudah ada, sehingga biayanya kecil:**
- `UnitType.PESANTREN` di enum — tidak perlu migrasi enum sama sekali.
- Peran pesantren sudah ada: `PESANTREN_PENGASUH` (Pimpinan Pesantren / Kiai),
  `PESANTREN_TATA_USAHA`, `MUSYRIF`, `MUHAFIDZ` (katalog dirapikan #552,
  2026-09-25 — tanpa Direktur, Musyrifah dilebur ke Musyrif), dan
  `resolve-unit-id.ts` menjadikannya peran ber-lingkup unit.
- `STUDENT_LOGIN_POLICY[UnitType.PESANTREN] = true`.
- `bos.service.ts:439` sudah punya tarif `PESANTREN: 1500000`.
- **`model RaporPesantren`** (schema:6374) sudah berbentuk tepat untuk unit
  non-formal: `unitId`, semester, plus `tahfidzData`, `takhosusData`,
  `ibadahData`, `muhadhorohData`, `muhadatsahData`, `kitabProgressData`,
  `akhlakData`, `attendanceData`. Tidak ada Dapodik, tidak ada NISN, bukan rapor
  Merdeka. Inilah jalur rapornya — jangan bangun yang baru.
- `TakhosusEnrollment` menangani sumbu program hafalannya.

**BUKTI TERUKUR 2026-09-13 yang membuat unit ini perlu TERLEPAS dari Takhasus:**
peran pesantren sudah dipakai, dan **semuanya ber-lingkup SMP IT Cipansor** —
termasuk Pimpinan Pesantren, yang enum-nya sendiri menyebut "Kyai / pimpinan
tertinggi pesantren". Tidak ada unit pesantren untuk menautkan mereka. Ini cacat yang
sama persis dengan yang sudah didokumentasikan pada `Dormitory.unitId`
("every asrama claimed to belong to SMP IT while housing santri from three
units"). Jadi Kyai, menurut lingkup aksesnya, saat ini "milik" SMP IT.

**SATU KEHATI-HATIAN yang belum dijawab (tidak memblokir kode apa pun):** umur
santri takhasus. Kalau mereka pasca-SMA/dewasa, syahadah saja memang normal dan
selesai. Kalau ada yang masih usia sekolah (9–15), syahadah tanpa kesetaraan
menempatkan mereka di luar wajib belajar dan tanpa ijazah yang diakui — itulah
yang PKPPS/Paket B-C ada untuk menutup. Keputusannya **rendah-risiko** ke arah
mana pun: unitnya unit yang sama (`type = PESANTREN`); menambah kesetaraan
kelak bersifat menambah, bukan menata ulang.

**Dan ini yang membuat "pindah unit tengah tahun" jadi nyata** — lihat
[`roadmap.md`](../roadmap.md) §7 (riwayat unit). Kini ada empat unit, satu per jenjang,
jadi pindah setingkat mustahil hari ini. Begitu Takhasus jadi unit: SMP IT →
Takhasus (berhenti sekolah formal, bisa di tengah tahun, karena takhasus tak
punya siklus kelulusan kaku) dan Takhasus → SMP IT (setelah kesetaraan Ula).
Itu `PINDAH_UNIT` yang sah; naik jenjang antar tahun tetap `LULUS`.
