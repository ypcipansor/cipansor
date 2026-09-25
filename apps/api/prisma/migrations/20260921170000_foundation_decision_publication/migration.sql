-- Klasifikasi publikasi keputusan organ yayasan.
--
-- Endpoint verifikasi (`GET /foundation/verify`, `POST /foundation/verify-pdf`)
-- terbuka untuk anonim: pemindai QR, dinas, atau siapa pun yang menemukan
-- tautan. Sebelum migrasi ini, responsnya memuat `subject`, organ, tanggal,
-- dan rekap suara TANPA SYARAT — padahal keputusan yayasan dapat menyangkut
-- personalia ("Pemberhentian Sementara Pengurus X") atau operasi internal
-- yang tidak untuk dibaca pihak luar. Modelnya tidak punya cara menyatakan
-- "keputusan ini boleh dipublikasikan", sehingga ketiadaan itu menjadi
-- publikasi paksa.
--
-- Kolom `publication` dengan default PRIVATE adalah fail-closed: setiap baris
-- yang sudah ada (dan setiap baris baru) menyensor metadata sampai seseorang
-- sengaja menerbitkannya. Ia HANYA menambah kolom; tidak ada tabel/kolom lain
-- yang diubah atau dihapus, sehingga image lama yang belum mengenal kolom ini
-- tetap berjalan (default diisi peladen, bukan aplikasi).
--
-- Idempoten dengan preflight: bila kolom sudah ada (basis data pengembangan
-- hasil `db push`), bentuknya diperiksa — tipe dan nullability — alih-alih
-- diterima apa pun. Enum dengan label yang menyimpang juga ditolak.

DO $$
DECLARE
  actual_type text;
  actual_null text;
  actual_default text;
  actual_labels text[];
  expected_labels text[];
BEGIN
  -- Enum: himpunan label harus sama persis bila tipenya sudah ada.
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionPublication') THEN
    SELECT array_agg(e.enumlabel ORDER BY e.enumlabel) INTO actual_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionPublication';

    SELECT array_agg(l ORDER BY l) INTO expected_labels
    FROM unnest(string_to_array('PRIVATE,PUBLIC', ',')) AS l;

    IF actual_labels IS DISTINCT FROM expected_labels THEN
      RAISE EXCEPTION
        'Migrasi foundation_decision_publication: label enum % adalah (%) tetapi skema mengharapkan (%).',
        'FoundationDecisionPublication',
        COALESCE(array_to_string(actual_labels, ', '), 'kosong'),
        array_to_string(expected_labels, ', ');
    END IF;
  END IF;

  -- Kolom: bila tabel ada dan kolomnya sudah ada, bentuknya harus benar.
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = current_schema() AND table_name = 'foundation_decisions') THEN
    SELECT CASE WHEN c.data_type = 'USER-DEFINED' THEN 'ENUM:' || c.udt_name ELSE c.data_type END,
           c.is_nullable,
           c.column_default
    INTO actual_type, actual_null, actual_default
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.table_name = 'foundation_decisions' AND c.column_name = 'publication';

    IF actual_type IS NOT NULL THEN
      IF actual_type <> 'ENUM:FoundationDecisionPublication' OR actual_null <> 'NO' THEN
        RAISE EXCEPTION
          'Migrasi foundation_decision_publication: kolom publication bertipe %/nullable % tetapi skema mengharapkan ENUM:FoundationDecisionPublication/NO.',
          actual_type, actual_null;
      END IF;
      IF actual_default IS DISTINCT FROM '''PRIVATE''::"FoundationDecisionPublication"' THEN
        RAISE EXCEPTION
          'Migrasi foundation_decision_publication: default kolom publication adalah (%) tetapi skema mengharapkan PRIVATE.',
          COALESCE(actual_default, 'tidak ada');
      END IF;
    END IF;
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionPublication') THEN
    CREATE TYPE "FoundationDecisionPublication" AS ENUM ('PRIVATE', 'PUBLIC');
  END IF;
END $$;

-- AlterTable: fail-closed default untuk baris lama maupun baru.
ALTER TABLE "foundation_decisions"
  ADD COLUMN IF NOT EXISTS "publication" "FoundationDecisionPublication" NOT NULL DEFAULT 'PRIVATE';
