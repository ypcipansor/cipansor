# rka-dua-tingkat

> Keputusan pengguna 2026-09-06 — tingkat tahunan bertingkat DUA (RKA Yayasan konsolidasi → RKA Unit); jangan usulkan lagi rantai tiga tingkat

**Rantai perencanaan yayasan punya EMPAT tingkat, bukan tiga.** Diputuskan
pengguna 2026-09-06 dan diterapkan di PR #415:

```
RPJP     (20 th, unitId null)
  └── RENSTRA        (5 th, unitId null)
        └── RKA Yayasan   (1 th, unitId null)   ← konsolidasi, yang disahkan Pembina
              └── RKA Unit    (1 th, unitId terisi)  ← irisan tiap sekolah
```

Jangan usulkan ulang rantai tiga tingkat (RPJP → Renstra → RKA datar). Tiga
alasan yang sudah dibahas dan disepakati:

1. **Cocok dengan praktik nasional.** RPJPD → RPJMD → **RKPD** (konsolidasi,
   satu per tahun) → **Renja/RKA-OPD** (per unit). Tingkat tahunan memang
   bertingkat dua di sana.
2. **Anggaran konsolidasi butuh baris sendiri.** Pembina mengesahkan SATU
   dokumen anggaran tahunan, dengan satu pengesah dan satu tanggal. Dengan RKA
   unit menggantung langsung pada Renstra, total tahunan yayasan hanya ada
   sebagai penjumlahan saudara — tidak ada objek yang memegangnya.
3. **Aturan keunikannya jadi konsisten.** Satu RPJP aktif, satu Renstra aktif,
   **satu RKA Yayasan aktif per tahun**, N RKA unit di bawahnya.

Tidak perlu migrasi: `parentId` dan `unitId` nullable sudah ada di skema sejak
awal. Yang berubah cuma aturan induknya di `perencanaan.service.ts` dan induk
`smpRka` di seed.

**Jebakan yang membuatnya tak terlihat selama ini:** seed sudah *menulis* RKA
SMP IT sebagai "turunan unit dari RKA Yayasan 2027" di kolom deskripsi,
sementara `parent`-nya menunjuk Renstra. Satu-satunya aturan yang ada berbunyi
`RKA must refer to a RENSTRA parent` — aturan itu **mewajibkan** susunan yang
keliru, jadi tidak ada uji yang bisa menangkapnya. Lihat
[teacher-dashboard-fake-stats](../lessons/teacher-dashboard-fake-stats.md) untuk pola "satu fakta di dua tempat, satu di
antaranya karangan".

**Dokumen tingkat yayasan bisa dibuat lewat aplikasi — oleh Pengurus.**
Sebelumnya `createPlan` menuntut unit dari semua orang (`Unit ID is required`),
sehingga RPJP, Renstra, dan RKA Yayasan hanya bisa lahir dari seed. Gerbang
2026-09-06 (`isPrivileged && seesAll`) diganti 2026-09-11 dengan
`canAuthorFoundationPlan`: Super Admin atau Pengurus (Ketua, Sekretaris,
Bendahara, Anggota) — **bukan** Pembina yang mengesahkan, bukan Pengawas yang
mereviu. **`seesAll` sendirian tetap terlalu lebar** — ia juga benar untuk
perawat, pustakawan, dan laboran (`CROSS_UNIT_SCOPE_ROLES`). RKA unit disusun
kepala sekolah atau admin unit itu. Cara mengesahkannya:
[pengesahan-dokumen-yayasan](./pengesahan-dokumen-yayasan.md).
