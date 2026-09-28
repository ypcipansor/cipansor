# pemutus-izin-santri

> Keputusan pengguna 2026-09-25 — izin santri diputuskan pembimbing langsungnya (musyrif atau wali kelas), bukan kepala sekolah; kepala unit hanya untuk izin panjang, santri tanpa pembimbing, atau ambil alih. 2026-09-27: batas 7 hari tetap; surat dokter bila perlu; pulang/menginap → koordinator asrama; izin staf keluar pondok menunggu wali. 2026-09-28: surat dokter disimpan sampai akhir TA, dibuka pemutus + wali + kepala unit (#606); koordinator asrama dibangun — "menginap" = di luar pondok melewati tengah malam WIB

**Kepala sekolah terlalu tinggi untuk izin seorang anak.** Itu kata pengguna
atas #564, yang menaruh keputusan pada kepala sekolah, Pimpinan Pesantren dan
admin unit. Riset praktik umum membenarkannya, dan #568 menerapkannya.

## Praktik yang diriset (2026-09-25)

| Konteks | Wali | Yang memutuskan | Naik bila |
|---|---|---|---|
| Pesantren — [Al-Muttaqien](https://almuttaqienbpn.ponpes.id/prosedur-sakit-dan-perizinan-santri/), [Darul Amilin](https://ponpesdarulamilin.com/prosedur-izin-keluar-tata-cara-resmi-pengajuan-permintaan-untuk-meninggalkan-area-pondok/), [Gontor](https://gontor.ac.id/pengasuhan-santri/) | mengajukan | musyrif / ketua asrama | pulang atau menginap → pengasuhan / pimpinan; keamanan memeriksa kartu izin di gerbang |
| Boarding school — [Tonbridge](https://www.tonbridge-school.co.uk/living/our-house-system/), [Grey High](https://www.greyhighschool.com/boarding/rules-and-regulations/) | wajib memberi persetujuan | housemaster | — |
| Sekolah harian — [SMA 1 Sukawati](https://www.sma1-sukawati.sch.id/tata-tertib-peserta-didik.html), [SMAN 2 Pandeglang](https://sman2pandeglang.sch.id/tata-tertib/) | memberi tahu | wali kelas (guru piket saat jam pelajaran) | lebih dari seminggu → kepala sekolah |

**Wali memberi persetujuan, tetapi bukan pemutus.** Walilah yang biasanya
mengajukan, dan menyetujui permintaan sendiri bukan pemeriksaan. Selama anak di
pesantren, lembaga yang memegang pengasuhan: musyrif tahu bila santri sakit,
sedang disanksi, atau besok ujian.

## Aturannya

| Izin siapa | Diputuskan oleh |
|---|---|
| santri mukim (punya kamar aktif) | musyrif yang ditugaskan di kamar itu atau di seluruh asrama |
| selain itu | wali kelas dari kelas aktifnya |
| lebih dari `PERMIT_HEAD_AFTER_DAYS` (7) hari kalender WIB | kepala sekolah unitnya; untuk santri mukim atau Takhosus juga Pimpinan Pesantren |
| santri mukim pulang, atau di luar pondok melewati tengah malam WIB | koordinator asrama (`MusyrifAssignment.role = KOORDINATOR`) |
| belum ada pembimbing tercatat | kepala unit, dan izinnya menyatakan itu |

- **Ambil alih.** Kepala unit boleh mengambil alih izin milik pembimbing yang
  berhalangan — hanya dari halaman izin, dengan konfirmasi. Tercatat
  (`decidedAs`, `tookOver`) dan pembimbingnya diberi tahu.
- **Admin unit dan super admin tidak memutuskan izin.** Mereka menjalankan
  sistem, bukan mengasuh anak.
- **Organ yayasan tidak memutuskan izin** (sejak #564); Pengawas justru
  mengaudit keputusan ini.
- **"Boleh memutuskan" bukan sifat peran, melainkan sifat izin.** Server
  memeriksanya per izin, dan setiap izin di jawaban API membawa `decision`
  (jalur, nama pembimbing, apakah pemanggil boleh, apakah itu ambil alih).
  Tombol di web berasal dari situ, bukan dari daftar peran.

Kodenya: `apps/api/src/modules/permits/permits.decider.ts` (fungsi murni),
daftar peran di `packages/shared/src/schemas/permits.ts`. Penugasan musyrif
dimasukkan di **Asrama → (asrama) → tab Musyrif** (#569); tanpa penugasan,
izin santri mukim jatuh ke kepala unit.

## Tiga parameter — diputuskan pengguna 2026-09-27

Riset tambahan 2026-09-27 (jangan diulang): struktur pondok
([Ummul Quro](https://ummulquroprob.sch.id/page/tugas-pokok-dan-fungsi-pengurus),
[Al-Anwar 3](https://ppalanwar3.com/tata-tertib-pp-al-anwar-3-putra/),
[ePesantren](https://tutorial.epesantren.co.id/panduan/cara-izin-pulang-santri/)),
alur izin boarding ([Orah/Boardingware](https://www.orah.com/blog/process-your-leave-requests-with-greater-flexibility-and-control)),
dan panduan DfE [*Working together to improve school attendance*](https://assets.publishing.service.gov.uk/media/66bf300da44f1c4c23e5bd1b/Working_together_to_improve_school_attendance_-_August_2024.pdf) (2024).

1. **Batas naik ke kepala unit tetap 7 hari.** Batas 3 hari yang lazim di tata
   tertib sekolah mengatur *bukti*, bukan *siapa yang memutuskan*.
2. **Surat dokter diminta bila perlu, bukan wajib.** Wali boleh melampirkannya;
   pembimbing boleh memintanya bila ragu atau santri sering sakit. DfE §374:
   sekolah "should not have blanket rules requiring" bukti medis. UKS pondok
   sendiri tahu santri mukim yang sakit. Dibangun 2026-09-28 — lihat di bawah.
3. **Santri mukim pulang atau menginap diputuskan koordinator asrama**
   (`MusyrifAssignment.role = KOORDINATOR`), seperti kepala asrama/bagian
   pengasuhan di pondok. Izin keluar singkat tetap musyrif kamar. Asrama tanpa
   koordinator → Pimpinan Pesantren.
4. **Izin yang diajukan staf dan membawa santri keluar pondok** (pulang,
   menginap, keluar area) **menunggu persetujuan wali** sebelum berlaku — surat
   izin pondok tidak berlaku tanpa tanda tangan wali, dan sistem boarding
   menunggu orang tua. Izin di dalam pondok (sakit di UKS, tidak ikut
   kegiatan) cukup diberitahukan. Butuh perubahan skema.

Butir 3 dibangun 2026-09-28; butir 4 belum (urutannya di `roadmap.md`).

**Cara butir 3 dibaca sistem.** Izin punya kolom `offCampus` (santri di luar
pondok selama izin). PULANG, KELUAR dan KELUARGA selalu di luar pondok; untuk
SAKIT dan OTHER formulir bertanya kepada pengaju, hanya bila santrinya
mukim ("Pondok — UKS atau asrama" / "Luar pondok"). Koordinator memutuskan
bila santri mukim di luar pondok **dan** izinnya PULANG atau melewati tengah
malam WIB; selain itu musyrif kamar. Izin lebih dari 7 hari tetap ke kepala
unit. Asrama tanpa koordinator → Pimpinan Pesantren, atau kepala sekolah
santri itu (keduanya kepala atas santri mukim, sama seperti izin panjang).
Baris lama yang tak pernah mencatat tempat dianggap di luar pondok — bacaan
yang lebih ketat. Formulir menampilkan "Akan diputuskan oleh …" sebelum
dikirim (`GET /permits/decider`).

## Surat dokter — penyimpanan dan akses (diputuskan pengguna 2026-09-28)

Surat dokter adalah data kesehatan anak — **data pribadi spesifik** menurut
UU PDP 27/2022 Ps. 4(2); Ps. 16(2) mewajibkan data dihapus saat masa
retensinya habis, tanpa memberi angka. JRA Permendikbud 45/2016 hanya untuk
satuan kerja Kemendikbud, bukan yayasan. Pedoman sekolah Inggris (IRMS
*Information Management Toolkit for Schools* 2019 §3.3.2) menyimpan surat
ketidakhadiran selama tahun ajaran berjalan + 2 tahun. Pilihan pengguna, keduanya
rekomendasi:

1. **Disimpan sampai akhir tahun ajaran izin itu**, lalu berkasnya dihapus
   otomatis; yang tetap di izin: bahwa surat dokter pernah dilampirkan,
   SHA-256-nya, dan siapa pemutus yang pertama melihatnya. Rekap Sakit/Izin
   sudah masuk rapor di akhir semester, jadi berkasnya tak diperlukan lagi.
   Ditolak: TA + 2 tahun (data kesehatan anak tersimpan sampai tiga tahun),
   30 hari (bukti hilang sebelum rapor), tanpa berkas sama sekali (wali yang
   mengajukan dari rumah tak bisa menunjukkan suratnya).
2. **Dibuka oleh pemutus izin itu** (musyrif atau wali kelas santri, atau
   yang memutuskannya), **wali santri, dan kepala unit** (yang bisa mengambil
   alih). Staf lain yang melihat izin hanya melihat tanda "ada surat dokter".
   Ditolak: semua yang bisa melihat izin (terlalu lebar), hanya pemutus + wali
   (kepala yang mengambil alih tak bisa melihat dasarnya). Super Admin tidak
   termasuk.

Siapa pun yang boleh mengajukan izin boleh melampirkan surat dokter selama
izin menunggu atau sudah disetujui; **mengganti** surat yang sudah ada hanya
bagi yang boleh membukanya — tidak ada yang menimpa bukti yang tak bisa ia
lihat. Berkasnya disimpan di basis
data (bukan `public/uploads`), hanya dibaca lewat endpoint yang memeriksa
pemanggil, dan setiap pembukaan tercatat di log audit.

Jangan kembalikan keputusan ke kepala sekolah atau admin tanpa alasan baru dari
yayasan.
