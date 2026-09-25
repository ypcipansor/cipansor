# pimpinan-pesantren-kiai

> KEPUTUSAN 2026-09-24: tidak ada Direktur Pesantren di Cipansor — PESANTREN_DIREKTUR dihapus; Kiai = Pimpinan/Pengasuh = kepala unit pesantren DAN Pembina yayasan (dua peran); dasar UU 18/2019 Ps. 1(9), 9(2); UU 16/2001 Ps. 5, 29, 35(3) — jangan riset ulang

**Keputusan pengguna 2026-09-24** (sesudah riset yang ia minta: "direktur sepertinya tidak ada di cipansor … kepala
unit pesantren itu ya kyai … kyai itu merangkap juga jadi pembina yayasan"):
1. **Hapus `PESANTREN_DIREKTUR`** — tak ada padanannya (situs pesantrencipansor.com hanya menyebut "Pimpinan Pesantren", tanpa
   direktur). Satu akun demo → **nonaktifkan, jangan hapus**.
2. **`PESANTREN_PENGASUH` = "Pimpinan Pesantren (Kiai)" = kepala unit pesantren** (wewenang setara kepala sekolah +
   pengesahan di unitnya).
3. **Kiai juga Pembina yayasan** (menurut akta, kata pengguna). Data demo sudah punya seorang Pembina
   lain — Kiai DITAMBAH sebagai Pembina (dua penugasan, berganti peran). Aturan pemisahan tugas: sebagai Pembina ia TIDAK
   mengesahkan RKA/PK unit pesantrennya sendiri.

**Dasar (sudah diriset — jangan ulang):**
- UU 18/2019 Ps. 1 angka 9: Kiai = pendidik … "figur, teladan, dan/atau pengasuh Pesantren"; **Ps. 9 ayat (2): Kiai
  "pemimpin tertinggi Pesantren"**. Ps. 1 angka 10 + Ps. 27: Dewan Masyayikh = penjaminan mutu internal pendidikan
  pesantren FORMAL (muadalah/diniyah formal) — belum perlu peran selama Cipansor tak menyelenggarakannya.
- UU 16/2001 **Ps. 29**: Pembina tak boleh merangkap Pengurus/Pengawas — pimpinan pesantren BUKAN organ, melainkan
  "pelaksana kegiatan" yang diangkat Pengurus (**Ps. 35 ayat 3**), jadi rangkap itu tidak dilarang pasal ini.
  **Ps. 5**: kekayaan yayasan tak boleh dialihkan ke Pembina sebagai gaji/honorarium → bila Kiai digaji sebagai
  pimpinan, sarankan cek ke notaris (disampaikan ke pengguna).
- Sistem: `findOrganConflict` hanya menolak kombinasi Pembina/Pengurus/Pengawas; PENGASUH + PEMBINA sudah bisa.

Terkait [pengesahan-dokumen-yayasan](./pengesahan-dokumen-yayasan.md), [unit-vs-asrama-vs-takhosus](./unit-vs-asrama-vs-takhosus.md), [pk-organ-yayasan-tanpa-kontrak](./pk-organ-yayasan-tanpa-kontrak.md).
