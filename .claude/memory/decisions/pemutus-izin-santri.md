# pemutus-izin-santri

> Keputusan pengguna 2026-09-25 — izin santri diputuskan pembimbing langsungnya (musyrif atau wali kelas), bukan kepala sekolah; kepala unit hanya untuk izin panjang, santri tanpa pembimbing, atau ambil alih

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

## Masih terbuka — untuk yayasan

1. **Batas naik ke kepala unit: 7 hari?** Diambil dari satu tata tertib sekolah
   (Sukawati). Satu konstanta.
2. **Santri mukim pulang atau menginap:** cukup musyrif kamar, koordinator
   asrama (`MusyrifAssignment.role = KOORDINATOR` sudah membedakannya), atau
   selalu Pimpinan Pesantren seperti di kebanyakan pondok?
3. **Izin yang diajukan staf:** cukup memberi tahu wali (yang berlaku sekarang),
   atau wali harus menekan "setuju" dulu? Yang kedua butuh perubahan skema.

Jangan kembalikan keputusan ke kepala sekolah atau admin tanpa alasan baru dari
yayasan.
