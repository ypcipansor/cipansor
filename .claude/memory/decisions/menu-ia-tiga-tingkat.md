# menu-ia-tiga-tingkat

> Riset IA menu (maks 3 tingkat, submenu maks 2 tingkat) + keputusan 2026-09-07 mengelompokkan menu utama per disiplin; jangan riset ulang dan jangan usulkan tingkat keempat

**Batas yang sudah diriset — jangan diriset ulang.** Konsensus IA (NN/g dan
turunannya): **maksimal tiga tingkat**, dan **tidak lebih dari dua tingkat
submenu**; rasio lebar/dalam yang dianjurkan ~7 butir per tingkat dengan
kedalaman 3; utamakan lebar daripada dalam; pada 3 tingkat, breadcrumb jadi
keharusan. AWS dan Salesforce adalah contoh 3 tingkat yang berhasil.

Struktur kita `grup → menu → submenu` **sudah tiga tingkat**. Karena itu:
**jangan usulkan sub-sub-menu.** Kebutuhan kedalaman berikutnya diselesaikan
dengan **tab di dalam halaman**, bukan menu — pola itu sudah dipakai (Manajemen
Talenta punya tab Profil/Pelatihan/Suksesi).

**Submenu sempat berupa data mati.** `NavItem.children` sudah ada di
`apps/web/src/config/navigation.ts` sejak lama, tetapi `sidebar.tsx` tak pernah
merendernya — tak ada satu pun `children` terisi, jadi tidak ada yang tampak
salah. Dibuka di PR #415 (2026-09-06) berikut penyusunan ulang: 126 → 88 baris
bilah sisi (30% lebih pendek), 15 menu induk bersubmenu.

**Keputusan pengguna 2026-09-07: kelompokkan menu utama per disiplin, 16 → 9
grup.** Penyebab yang disepakati: grup lama mencampur **empat taksonomi yang
tak sebanding** — fungsional (Marketing, Academic, Compliance), organisasi
(TK/PAUD, Pesantren, Boarding), kantong serbaguna (**Management,
Administration, Operations**), dan teknis (Reference Data, Settings). Tiga
kantong itu tak punya batas yang bisa didefinisikan — tak ada jawaban untuk
"kenapa Penggajian di Administration tapi Dompet Santri di Operations".

Grup barunya: Ringkasan · Akademik · Kesantrian & Pesantren · SDM · Keuangan ·
Pemasaran & Penerimaan · **Perencanaan & Kinerja** · Sarana & Layanan · Sistem.

Dua hal yang sengaja **tidak** diikuti dari taksonomi murni:

1. **Nama domain, bukan kosakata buku manajemen.** Penggunanya ustadz dan tata
   usaha; mereka mencari "Absensi", bukan "SDM → Manajemen Kehadiran".
2. **Kinerja TIDAK dipindah ke bawah SDM**, walau secara keilmuan memang fungsi
   SDM. Memisahkannya memutus kedekatan RKA→PK, justru rantai yang paling sulit
   dipahami orang. Kedekatan di menu yang mengajarkannya.

**Manfaatnya lebih kecil dari kelihatannya** dan itu sudah disampaikan: menu
sudah disaring per peran (guru melihat ~6 grup, bukan 16), jadi yang benar-benar
tertolong adalah super admin dan admin unit.

Href **tidak** berubah dalam penyusunan ulang ini — hanya penempatan grup — jadi
tak ada halaman yang berpindah alamat. Lihat [rbac-nav-contract](../lessons/rbac-nav-contract.md)
untuk penjaga yang memverifikasinya, dan [breadth-over-depth](../lessons/breadth-over-depth.md) untuk
kenapa jumlah menunya sebesar itu.

**Diterapkan (2026-09-07, `65c0a4fc`; di-merge ke PR #415 2026-09-11).**
Diukur di tumpukan terisolasi dengan `sidebar.tsx` yang sama di kedua sisi
(induk = tautan + chevron terpisah): 16 → 9 grup, 91 → 76 baris tampak,
3663 → 2244 px tinggi isi. Menu kepala sekolah (7 grup/25 tautan) dan yayasan
(5/22) memakai kosakata yang sama; "Overview" → "Ringkasan" di semua menu.
`/hr/talenta` dihapus dan `/hr/talenta/succession` dilebur ke
`/talenta/succession` (keputusan pengguna "kalau bisa digabung").

**Jebakan penyuntingan:** `s.replace(old, new, 1)` untuk mengganti label
"Foundation" mengenai kemunculan PERTAMA — di menu yayasan, bukan admin yang
dimaksud. Di berkas yang sama ada 14 menu peran dengan item kembar; ganti label
dengan membatasi pencarian ke blok `const xNavigation` yang dituju.
