-- AlterTable
-- Simpan sidik jari kunci publik agar layanan status kunci (AATL ICA7) dapat
-- mencarinya langsung. Baris lama diberi nilai; baris berikutnya menulisnya
-- saat kunci diterbitkan atau diperpanjang.
ALTER TABLE "user_signing_keys" ADD COLUMN "fingerprint" TEXT;

-- Backfill: sidik jari = SHA-256 atas subjectPublicKeyInfo (DER) yang didekode
-- dari base64 di kolom public_key. Perlu ekstensi pgcrypto; bila tidak tersedia
-- migrasi berhenti di sini, dan itu memang yang diinginkan — backfill yang
-- diam-diam meninggalkan kolom kosong akan membuat endpoint publik melaporkan
-- "tidak ditemukan" untuk kunci yang sah.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "user_signing_keys"
SET "fingerprint" = upper(
  regexp_replace(
    encode(digest(decode("public_key", 'base64'), 'sha256'), 'hex'),
    '(..)(?!$)',
    '\1:',
    'g'
  )
);

CREATE UNIQUE INDEX "user_signing_keys_fingerprint_key" ON "user_signing_keys"("fingerprint");
