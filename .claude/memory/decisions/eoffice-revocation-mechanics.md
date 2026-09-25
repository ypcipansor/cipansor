# eoffice-revocation-mechanics

> Pencabutan itu pernyataan bertanda tangan (bukan kolom status) — passphrase, cap DICABUT, dan alur permohonan

Tiga keputusan mekanis pada pencabutan naskah dinas, semuanya mudah dibalik
keliru oleh orang yang belum membaca alasannya.

**1. Mencabut menuntut passphrase, dan menghasilkan tanda tangan.**
Alasan pertama saya menolaknya ("mencabut tidak menghasilkan bukti kriptografis
baru") **salah**: sebuah CRL adalah struktur data yang ditandatangani dan
diberi stempel waktu (RFC 5280). Pencabut menandatangani pernyataan yang
mengikat *signatureId, letterId, pencabut, jabatan, waktu, alasan* dengan
**kuncinya sendiri** (`signRevocation`/`verifyRevocation` di `utils/esign.ts`).
Akibatnya: passphrase yang bocor tidak menghalangi (Pengawas pakai kuncinya
sendiri), sesi yang tertinggal terbuka tidak cukup, dan halaman publik
**membuktikan** pencabutan (`revocationVerified`) alih-alih mempercayainya.
Menyunting alasan setelahnya membatalkan tanda tangannya.

**2. Naskah yang dicabut TETAP dicetak, bercap DICABUT.**
Bukan ditolak — kantor tetap harus mengarsipkan salinannya (DocuSign pun
mem-watermark VOID dan tetap membiarkannya diunduh). Caranya penting: naskah
dibangun ulang **seolah belum dicabut**, di-hash, dan **baru dicap setelah
hash-nya sama dengan `pdfHash`**. Kalau tidak sama, byte-nya sudah bergeser
sejak penandatanganan (risiko §2.4) dan pencetakan ditolak. `stampRevoked()`
mencap SALINAN; berkas yang ditandatangani tidak boleh berubah.

**3. Mengajukan ≠ memutuskan.** `LetterRevocationRequest`: siapa pun yang boleh
membaca suratnya boleh memohon (alasan + lampiran, tanpa passphrase); yang
berwenang memutuskan **di halaman suratnya sendiri**, bukan di menu terpisah.
Tanpa ini, petugas TU yang menemukan nomor ganda tidak punya saluran apa pun —
dan dialah yang paling mungkin menemukannya lebih dulu.

Istilahnya **"Pencabutan Naskah Dinas"**, bukan "cabut tanda tangan": tanda
tangannya tetap utuh secara matematis, naskahnyalah yang berhenti berlaku.

Kewenangannya di [eoffice-revocation-authority](./eoffice-revocation-authority.md).
