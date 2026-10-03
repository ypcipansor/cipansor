# Notifikasi push (Web Push)

> Diputuskan pengguna 2026-10-03, saat audit PR #626. Pengirim dibangun
> sekarang, bukan dipisah atau dibuang. Di bawah: empat keputusannya, cara
> kerjanya, dan riset yang **jangan diulang**. Syarat pembukanya ada di
> [`realtime-polling.md`](realtime-polling.md).

## Keputusan pengguna (2026-10-03)

1. **Bangun pengirimnya sekarang.** PR #626 hanya membawa separuh: tombol
   langganan, tabel, dan endpoint, tanpa pengirim dan tanpa preferensi yang
   tersimpan. Pilihan lain yang ditolak: memisahkan bagian push ke PR lain,
   menggabung dengan kartu tersembunyi, atau tanpa Web Push sama sekali.
2. **Layar kunci per kategori.**
   - Notifikasi rutin tampil lengkap: pengumuman, tagihan, kehadiran, izin,
     dan tahfidz.
   - Data spesifik hanya tampil generik ("Ada pemberitahuan baru. Buka portal
     untuk membacanya."): kesehatan/UKS, konseling BK, pelanggaran, aduan
     (WBS), serta temuan pengawasan/risiko. Isinya dibaca setelah membuka
     portal.
   - Catatan: "izin" ikut rutin, jadi "Izin Sakit untuk <nama>" tetap tampil.
     Ubah lewat `data.sensitive` di produsen izin bila ingin generik.
3. **Semua isi lonceng ikut push**, disaring pilihan per jenis milik penerima.
   Bawaannya semua jenis aktif. Push hanya ke perangkat yang menekan
   "Aktifkan".
4. **Jam tenang diatur pengguna**, tanpa nilai bawaan. Selama jam tenang push
   tidak dikirim, tetapi tetap tersimpan di lonceng. Jamnya WIB.
5. **Kunci VAPID dipasang di staging** sekarang. Produksi memakai pasangan
   kuncinya sendiri dan ikut rilis.

## Cara kerjanya (agar tidak dibangun ulang dengan cara lain)

- **Tabel `notifications` adalah outbox.** Setiap baris baru berstatus
  `push_state = PENDING` lewat default kolom. Dispatcher
  (`push-dispatch.service.ts`, berjalan tiap 15 detik) mengklaim baris dengan
  `FOR UPDATE SKIP LOCKED` lalu mengirimnya. Lebih dari dua puluh produsen
  tidak perlu tahu push ada. Baris yang lebih tua dari migrasi bernilai NULL
  dan tidak pernah dikirim.
- **Dilewati tanpa dikirim** (SKIPPED): penerima tanpa perangkat, notifikasi
  sudah dibaca, sudah lewat 2 jam, saluran Push dimatikan, jenisnya
  dimatikan, atau sedang jam tenang. Notifikasi terjadwal menunggu
  `scheduled_at`.
- **Perangkat yang dilaporkan hilang** (404/410) dihapus.
- **Endpoint hanya boleh di layanan push peramban.** Daftar izinnya: FCM,
  Mozilla autopush, Apple, dan WNS, wajib HTTPS di port 443 tanpa
  kredensial. Diperiksa saat langganan dan diperiksa ulang saat kirim
  (`isSafePushEndpoint`, `@cipansor/shared`). Pendekatan "tolak IP privat"
  ditinggalkan karena nama host bisa meresolve ke IP privat.
- **Satu pasangan kunci VAPID per lingkungan.** Langganan terikat pada kunci
  publik yang dipakai saat berlangganan. Layanan push menolak kiriman yang
  ditandatangani kunci lain; ini terbukti 2026-10-03 lewat autopush Mozilla,
  yang menjawab 401. Karena itu salinan data produksi di staging tetap tidak
  bisa menjangkau perangkat produksi, dan dispatcher sengaja tidak bergantung
  pada `SCHEDULER_ENABLED`. Kunci publik sampai ke web lewat
  `GET /notifications/push/config` saat aplikasi berjalan, bukan dibakar ke
  bundel web.
- **Langganan milik akun yang menekan "Aktifkan".** `push-owner` disimpan di
  localStorage. Orang lain yang masuk di peramban yang sama tidak mewarisi
  langganan itu: langganannya dilepas, dan orang itu memutuskan sendiri.
  Endpoint yang di server masih tercatat milik akun lain (409) diganti
  dengan langganan baru.
- **Protokol ditulis di atas `node:crypto`** (`web-push.ts`): RFC 8291
  (aes128gcm) dan RFC 8292 (JWT ES256). Paket `web-push` tidak dirilis lagi
  sejak Januari 2024 dan membawa lima dependensi transitif. Kebenaran
  protokol dipaku ke vektor uji resmi RFC 8291 Lampiran A, dan sudah
  dibuktikan pulang-pergi ke layanan push Mozilla yang sungguhan.

## Riset yang sudah dilakukan — jangan diulang

- **Permintaan izin:** hanya lewat tombol, di halaman yang menjelaskan
  nilainya; jangan saat halaman dimuat. Sediakan cara mematikannya di UI.
  Sumber: web.dev, *Permission UX*
  <https://web.dev/articles/push-notifications-permissions-ux>.
- **Data sensitif di notifikasi:** pakai teks generik, dan isinya dibaca
  setelah membuka kunci. Sumber: OWASP MASTG-BEST-0027
  <https://mas.owasp.org/MASTG/best-practices/MASTG-BEST-0027/>. UU PDP
  27/2022 Ps. 4(2) menggolongkan data kesehatan dan data anak sebagai data
  spesifik. iPhone ber-Face ID secara bawaan menampilkan pratinjau hanya
  setelah terbuka; Android menampilkan isinya.
- **SSRF lewat endpoint push:** gunakan daftar izin host, bukan daftar
  larangan. Sumber: OWASP SSRF Prevention Cheat Sheet.
- **iOS:** push hanya berjalan sejak iOS 16.4 dan untuk portal yang dipasang
  ke Layar Utama (WebKit, lihat `realtime-polling.md`). Sejak iOS 26, menu
  *Bagikan* ada di balik tombol "⋯" (MacRumors, Apple Support *Open as Web
  App*).
- **Promosi pemasangan:** tampilkan sesudah pengguna terlibat (sesudah
  masuk), bukan di halaman pertama, dan hanya satu promosi pada satu waktu.
  Sumber: web.dev, *Patterns for promoting PWA installation*
  <https://web.dev/articles/promote-install>.

## Belum (sengaja, dicatat di `known-issues.md`)

- Sakelar SMS dan WhatsApp kini tersimpan, tetapi pengirim WhatsApp belum
  membacanya.
- "Laporan Bulanan" dan "Frekuensi Pengingat" belum punya produsen.
- Declarative Web Push (Safari 18.4+) belum dipakai. Handler `push` di
  service worker berlaku di semua peramban.
