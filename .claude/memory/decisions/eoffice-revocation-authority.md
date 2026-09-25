# eoffice-revocation-authority

> Kewenangan mencabut naskah dinas — tabelnya, tiga sumber yang menyepakatinya, dan mengapa Super Admin tidak termasuk

Pencabutan naskah dinas (PR #436, cabang `feat/eoffice-revocation`, bertumpu
pada #435). Aturannya **bukan** `signer OR SUPER_ADMIN` — itu versi pertama yang
salah, dan yayasan yang menangkapnya lebih dulu.

**Tabelnya** — `packages/shared/src/types/letter-revocation-authority.ts`, dibaca
dua sisi (server menegakkan, UI menawarkan tombol yang sama):

| Pelaku | Boleh mencabut |
|---|---|
| siapa pun | tanda tangannya sendiri |
| **YAYASAN_PENGAWAS** | sendiri + Pengurus + seluruh jabatan unit |
| **YAYASAN_PEMBINA** | sendiri + naskah Pembina mana pun (kesinambungan jabatan) |
| Ketua/Sekretaris/Bendahara | sendiri saja |
| **SUPER_ADMIN** | **tidak sama sekali** |

**Mengapa Pengawas, bukan Ketua.** Menganulir naskah organ pelaksana adalah
perbuatan *pengawasan*. Menaruhnya pada Ketua = organ pelaksana menganulir
pekerjaannya sendiri, persis yang dicegah UU 16/2001 jo. UU 28/2004 Pasal 29.

**Mengapa Pembina hanya naskah Pembina, tapi termasuk milik pendahulunya.** Tak
ada organ di atasnya; tanpa kesinambungan jabatan, naskah Pembina yang sudah
berhenti tak bisa dicabut selamanya. ANRI melekatkan kewenangan pada jabatan.

**Mengapa Super Admin tidak.** Ia mengelola kunci/sertifikat, bukan kewenangan
menandatangani atas nama yayasan — pembagian CA vs pemilik sertifikat (RFC 5280).
Ia **tetap** boleh mencabut *kunci*, kini dengan kode sebab RFC 5280 §5.3.1.

Tiga sumber sepakat: kewenangan mencabut mengikuti kewenangan **menerbitkan**.
ANRI ("pejabat yang berwenang menetapkan naskah dinas tersebut"), RFC 5280/BSrE
(pemilik *mengajukan*, penerbit *memutuskan*), DocuSign (hanya pengirim yang
boleh *void*; penandatangan justru tidak).

Lihat [eoffice-revocation-mechanics](./eoffice-revocation-mechanics.md) untuk passphrase, cap DICABUT dan
permohonan; [eoffice-verify-by-upload-not-qr](./eoffice-verify-by-upload-not-qr.md) untuk verifikasi publik.
