# showcase-portofolio

> KEPUTUSAN 2026-10-10 (pengguna): *showcase* portofolio santri **tetap
> terbatas cakupan**. Yang melihatnya hanya akun yang memang menjangkau santri
> itu (`studentScope`): santri sendiri, walinya, guru dan staf unitnya, dan
> peran lintas unit. Rancangan bertingkat dicatat di roadmap dan baru dibangun
> saat ada kebutuhan nyata.

## Asal keputusan

#747 merapikan akses portofolio ke `studentScope`. `getStudentShowcase` dulu
mengembalikan portofolio `isShowcase` atau `isPublic` milik santri mana pun
kepada akun yang masuk dari unit mana pun. Gerbang tinjau menanyakan apakah
pembatasan itu disengaja atau regresi. Ada tiga fakta:

- rutenya selalu di belakang `authenticate`, jadi "publik" tidak pernah
  berarti anonim, melainkan "akun dari unit mana pun", termasuk wali dan santri
  unit lain;
- penanda `isPublic`/`isShowcase` diisi lewat formulir portofolio tanpa
  persetujuan wali;
- hook `useStudentShowcase` belum dipakai halaman mana pun.

Pengguna diberi tiga pilihan: tetap terbatas dengan rancangan di roadmap,
membangun visibilitas bertingkat sekarang, atau menghapus showcase. Pilihannya
yang pertama.

## Aturannya

- Bawaannya pribadi. Setiap perluasan (kelas atau unit, yayasan, situs publik)
  membutuhkan **kurasi guru** dan, di luar unit, **izin wali yang tercatat dan
  bisa ditarik**.
- Di situs publik, identitas diminimalkan: hindari gabungan nama, wajah, dan
  sekolah.
- Rancangan bertingkat (pribadi → kelas/unit dengan kurasi guru →
  yayasan/situs dengan izin wali) ada di `roadmap.md` § 7.

## Sumber

- PP 17/2025 (PP TUNAS) Pasal 10 ayat (1): fitur yang diakses anak berada pada
  "tingkat privasi tinggi secara baku" —
  <https://pasal.id/peraturan/pp/pp-no-17-tahun-2025>
- UU 27/2022 Pasal 25: pemrosesan data pribadi anak wajib dengan persetujuan
  orang tua dan/atau wali —
  <https://peraturan.bpk.go.id/Download/224884/UU%20Nomor%2027%20Tahun%202022.pdf>
- ICO Children's Code standar 7 ("high privacy by default") —
  <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/7-default-settings/>
- Seesaw: karya hanya terlihat di kelas, dan masuk blog kelas sesudah guru
  menyetujuinya — <https://seesaw.com/privacy-policy/privacy-security/>
- Google Classroom: teman sekelas tidak melihat karya kecuali guru sengaja
  membagikannya — <https://support.google.com/edu/classroom/answer/6386395>
- KPAI tentang publikasi identitas anak (dikutip lewat Diskominfo Kota
  Cirebon) — <https://dkis.cirebonkota.go.id/artikel/etika-mengunggah-foto-anak-di-media-sosial>
