# realtime-polling

> KEPUTUSAN 2026-09-28: portal tidak punya kanal dorong (Socket.IO, WebSocket,
> SSE). Web segar lewat polling React Query. Server Socket.IO dihapus karena
> tidak punya klien. Di bawah: pembandingnya, sumbernya, dan syarat membangun
> kanal dorong kelak. Jangan ulang risetnya.

**Keputusan pengguna 2026-09-28**, sesudah dua putaran perbandingan (A hapus,
B perbaiki tanpa pemakai, C perbaiki dan sambungkan ke web, D ganti SSE; lalu
A lawan C untuk jangka panjang): **A — hapus, dengan syarat pembuka dicatat.**

## Keadaan yang diukur

- **Server Socket.IO tidak pernah punya klien.** Provider web tidak dipasang
  di halaman mana pun. Token yang dikirimnya adalah `user.id`, bukan JWT. Nama
  event web (`join:notifications`, `dashboard:metrics`, …) juga tidak ada di
  server. Jadi server itu API yatim (aturan emas 8), dan setiap kejadian
  (absensi, setoran, pembayaran, santri baru, UKS) tetap menghitung ulang
  metrik dasbor (6 kueri) untuk pendengar yang tidak ada.
- **Web sudah polling:**
  - lonceng notifikasi tiap 30 detik;
  - pesan tiap 60 detik;
  - dasbor tiap 1–5 menit;
  - ditambah muat ulang saat jendela kembali difokuskan.
- **Web Push baru separuh.** `apps/web/public/sw.js` sudah menangani `push`
  dan `notificationclick`, dan web memanggil `/notifications/push/subscribe`.
  Sisi server belum ada: tidak ada kunci VAPID, rutenya, maupun pengirimnya.
- **Infrastruktur tidak menghalangi WebSocket.** App Service mengaktifkan
  WebSocket dan afinitas ARR, dan saat ini berjalan satu instans. Hambatan
  baru muncul bila instans ditambah: Socket.IO lalu butuh sticky session dan
  Redis adapter.

## Mengapa A, bukan C

1. **Yang paling mungkin butuh kabar cepat adalah wali santri**, dan mereka
   biasanya di ponsel dengan portal tertutup. WebSocket hanya mengirim selama
   tab terbuka, jadi C tidak menjangkau mereka. Yang menjangkau adalah Web
   Push dan email, yang sudah hidup.
2. **Staf di meja tidak dirugikan oleh jeda 30 detik** untuk izin,
   pembayaran, atau buku tamu. Yang benar-benar butuh seketika — obrolan
   langsung, pengawasan CBT, papan antrean — belum ada di roadmap sebagai
   kebutuhan instan.
3. **Kode lama bukan modal awal.** Rancangannya tidak dibuat untuk syarat di
   bawah, dan klien webnya tidak pernah tersambung. C yang benar adalah tulis
   ulang. Git tetap menyimpan kode lamanya.
4. **Dua jalur otorisasi.** REST dan soket harus dijaga sama, dan Model A
   (izin per fitur + lingkup data, roadmap) akan mengganti aturan lingkupnya.
   Aturan soket yang dibangun sekarang di atas bucket lama harus dibangun
   ulang nanti.

**B ditolak** karena tetap API yatim yang harus dirawat. **D (SSE) ditolak**
karena `EventSource` tidak bisa membawa header Bearer. Pilihannya tinggal
cookie sesi (rombakan yang belum diambil) atau token di URL, yang masuk ke
log. D juga butuh heartbeat melewati Cloudflare.

## Syarat pembuka

- **Notifikasi ke ponsel → Web Push** (VAPID, endpoint subscribe, pengirim,
  preferensi per penerima). Ia melengkapi polling, bukan menggantikannya. Di
  iPhone hanya berlaku sejak iOS 16.4 dan untuk portal yang dipasang ke layar
  utama.
- **WebSocket hanya bila sebuah fitur butuh pembaruan dalam hitungan detik
  selama halamannya terbuka.** Syaratnya:
  - dibangun sesudah Model A, di atas izinnya;
  - ruang per pengguna atau per izin, bukan per unit;
  - otorisasi diperiksa pada setiap aksi, bukan hanya saat jabat tangan;
  - token sementara (2FA belum selesai) ditolak;
  - koneksi ditutup saat token kedaluwarsa, logout, atau peran dicabut;
  - payload hanya berisi yang boleh dilihat penerimanya;
  - bila instans lebih dari satu, pakai Redis adapter dan sticky session.
- `apps/api/src/utils/push-channel.guard.test.ts` memerah bila paket kanal
  dorong ditambahkan. Mengubah uji itu adalah bagian dari keputusan baru, di
  PR yang sama.

## Sumber

- OWASP WebSocket Security Cheat Sheet — otorisasi tiap aksi; tutup koneksi
  saat sesi berakhir; token di query string masuk log:
  <https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html>
- OWASP Attack Surface Analysis Cheat Sheet — fitur yang tidak dipakai
  menambah permukaan serangan:
  <https://cheatsheetseries.owasp.org/cheatsheets/Attack_Surface_Analysis_Cheat_Sheet.html>
- Socket.IO, *Using multiple nodes* — sticky session dan adapter:
  <https://socket.io/docs/v4/using-multiple-nodes/>
- Cloudflare WebSockets — koneksi diputus saat Cloudflare merilis kode:
  <https://developers.cloudflare.com/network/websockets/>
- MDN, *Using server-sent events* — batas 6 koneksi per domain tanpa HTTP/2:
  <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>
- WebKit, *Web Push for Web Apps on iOS and iPadOS* — iOS 16.4, layar utama:
  <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>
- UU 27/2022 (PDP) Ps. 16 ayat (2) — pemrosesan terbatas dan spesifik.
