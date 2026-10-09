# Lisensi

> **Diputuskan pengguna 2026-10-09:** kode sumber berlisensi **Apache License
> 2.0**. Menggantikan keputusan 2026-09-25 (proprietary, karena repositori
> akan menjadi privat). Pengguna meminta "MIT atau Apache, yang mana yang lebih
> baik"; Apache 2.0 dipilih atas alasan di bawah.

## Mengapa Apache 2.0, bukan MIT

Keduanya permisif, dan keduanya cocok dengan dependensi yang terpasang
(diukur 2026-10-09: MIT, ISC, BSD, Apache; LGPL/MPL/EPL hanya pada paket
pihak ketiga yang dipakai tanpa diubah; tidak ada GPL/AGPL). Apache 2.0 lebih
cocok untuk sebuah yayasan karena empat hal yang tidak ada di MIT:

- **§6 Trademarks:** lisensi tidak memberi hak atas nama dan logo. Nama
  Cipansor dan lambangnya tetap milik Yayasan, dan fork tidak boleh tampil
  sebagai Yayasan.
- **§3 Patent grant:** setiap kontributor memberi lisensi paten, dan lisensi
  itu gugur bagi pihak yang menggugat paten.
- **§5 Contributions:** kontribusi masuk dengan syarat yang sama, tanpa
  perjanjian tambahan.
- **§4(d) NOTICE:** batas lisensi di `NOTICE` wajib ikut terbawa ke setiap
  salinan turunan.

Sumber: teks lisensi di <https://www.apache.org/licenses/LICENSE-2.0>;
perbandingan di <https://choosealicense.com/licenses/>.

## Yang tidak dilisensikan (`NOTICE`)

- nama, logo, dan lambang Yayasan serta unit-unitnya;
- foto, isi brosur, dan gambar Yayasan, orang-orangnya, dan santrinya
  (`apps/web/public/images/`, `docs/images/`). Seluruh haknya tetap milik
  Yayasan, dan foto orang juga tunduk pada hak potret (UU 28/2014 Ps. 12);
- data pribadi dalam data demo atau seed (UU 27/2022).

## Akibat yang harus diingat

- **Tidak bisa ditarik untuk versi yang sudah terbit.** Siapa pun yang sudah
  menyalin sebuah versi berlisensi Apache tetap boleh memakainya, walaupun
  repositori kelak menjadi privat atau lisensinya diganti.
- Pihak lain boleh memakai, mengubah, dan menjual kode ini, termasuk sebagai
  layanan daring, asalkan menyertakan `LICENSE` dan `NOTICE`.
- File baru tidak wajib memuat kepala lisensi; `LICENSE` di akar sudah cukup.
