# surat-keterangan-lewat-eoffice

> A santri's surat keterangan is an E-Office naskah: numbered from the agenda, signed with TTE by the unit's head, verifiable by upload. The page that made its own number in the browser is routed through E-Office. Decided by the user on 2026-10-02.

## The decision

`/students/documents` starts a **Surat Keterangan** (`LetterType.SURAT_KETERANGAN`) in E-Office instead of printing one of its own.

1. TU or the unit admin picks a santri and the kind of letter (aktif, kelakuan baik, rekomendasi, …).
2. The draft's content is filled from the student's record: name, NISN, class, place and date of birth, and wali. Nobody retypes it.
3. The letter then follows the ordinary E-Office flow (the `naskah-dinas` skill):
   - its number is taken from the unit's outgoing agenda when it leaves DRAFT;
   - the unit's head (`GET /units/:id/head`) signs it with TTE;
   - its recipient can verify it at `/public/verify-letter` by uploading the PDF.
4. The page moves into the menu under *Akademik → Students*.

Its own number, made in the browser, and its own print window go away.

## Why

- **Outside parties rely on it.** A surat keterangan aktif goes to the bank for a PIP payout, to a parent's employer for the child allowance, and to another school. A letter that people outside rely on must be in the register and must be checkable. A printed number with no register behind it is neither, and anyone can type one.
- **One register.** Two numbering systems for one kind of letter split the agenda. The browser's numbers also collide.
- **The standard.** The general guideline on official correspondence, PerANRI 5/2021 (Pedoman Umum Tata Naskah Dinas), sets the numbering and the signing official of a naskah dinas. It binds state bodies, not a yayasan, but it is the practice the yayasan's E-Office already follows.

## Rejected

- **Delete the page and let TU write the letter in E-Office by hand.** This works today, but the student's data is retyped and a mistyped NISN goes to the bank.
- **Keep printing, with a number taken from the agenda but no TTE.** The letter would be registered, but a forged copy cannot be told apart from a real one.
- **Not needed at all.** Parents need these letters, so this was not a real option.

## Not decided — do not build

- **A wali requesting a letter from the parent portal.** Not asked. TU issues the letters.

## Sources

- PerANRI 5/2021, Pedoman Umum Tata Naskah Dinas — https://peraturan.go.id/id/peraturan-anri-no-5-tahun-2021
- PIP payout needs a letter from the head — https://puslapdik.kemdikbud.go.id/orang-tua-siswa-penerima-pip-diminta-perhatikan-aktivasi-rekening/
