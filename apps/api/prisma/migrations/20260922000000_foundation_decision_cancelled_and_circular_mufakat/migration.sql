-- Status CANCELLED untuk rapat yang gagal kuorum hadir + normalisasi aturan
-- kuorum sirkuler menjadi mufakat (MUTLAK).
--
-- DUA perubahan, keduanya MENAMBAH nilai tanpa menghapus apa pun:
--
-- 1. `FoundationDecisionStatus` mendapat label `CANCELLED`. Sebelumnya rapat
--    yang kuorum HADIR-nya tidak pernah tercapai tidak punya status terminal
--    yang benar: `finalize` menolaknya, sehingga keputusan tergantung VOTING
--    tanpa akhir, dan satu-satunya "jalan keluar" adalah menandainya REJECTED —
--    yang berarti menyatakan materi ditolak padahal rapatnya tidak pernah
--    memutus apa pun. `CANCELLED` menutup rapat itu tanpa mengesahkan maupun
--    menolak isinya.
--
-- 2. Aturan kuorum yang tersimpan untuk `decisionKind = 'CIRCULAR'`
--    dinormalisasi ke `MUTLAK` (mufakat) untuk kedua ambang. Keputusan
--    sirkuler tidak punya rapat, sehingga ambang mayoritas tidak punya dasar:
--    ia dapat mengesahkan naskah atas dasar suara sebagian anggota sementara
--    sisanya menolak. Larangan itu kini ditegakkan di kontrak Zod
--    (`upsertFoundationRuleSchema`), dan baris LAMA yang menyimpang diperbaiki
--    di sini supaya basis data yang sudah ada tidak terus menyimpan aturan
--    yang tidak lagi dapat ditulis lewat API. Baris MEETING tidak disentuh.
--
-- Idempoten dengan preflight: label enum ditambahkan hanya bila belum ada, dan
-- pembaruan aturan hanya menyentuh baris yang benar-benar menyimpang. Bentuk
-- kolom/indeks lain tidak diubah.

DO $$
DECLARE
  actual_labels text[];
  missing_label text;
BEGIN
  -- Enum status: bila tipenya sudah ada, ia harus memuat seluruh label lama
  -- (DRAFT,VOTING,APPROVED,REJECTED) — label yang HILANG berarti basis data
  -- dibuat dari skema yang berbeda dan migrasi tidak boleh menutupinya.
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionStatus') THEN
    SELECT array_agg(e.enumlabel ORDER BY e.enumlabel) INTO actual_labels
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionStatus';

    FOREACH missing_label IN ARRAY ARRAY['DRAFT', 'VOTING', 'APPROVED', 'REJECTED'] LOOP
      IF NOT (missing_label = ANY (actual_labels)) THEN
        RAISE EXCEPTION
          'Migrasi foundation_decision_cancelled: enum % tidak memuat label % (ada: %).',
          'FoundationDecisionStatus', missing_label,
          COALESCE(array_to_string(actual_labels, ', '), 'kosong');
      END IF;
    END LOOP;
  END IF;
END $$;

-- Tambah label CANCELLED bila belum ada (idempoten).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionStatus') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = current_schema()
        AND t.typname = 'FoundationDecisionStatus'
        AND e.enumlabel = 'CANCELLED'
    ) THEN
      ALTER TYPE "FoundationDecisionStatus" ADD VALUE 'CANCELLED';
    END IF;
  END IF;
END $$;

-- Normalisasi aturan kuorum sirkuler ke mufakat. Hanya baris yang menyimpang
-- yang diperbarui; `updated_by_id` sengaja TIDAK diubah karena ini bukan
-- keputusan editor manusia, melainkan penegakan invariant kontrak.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = current_schema() AND table_name = 'foundation_decision_rules') THEN
    UPDATE "foundation_decision_rules"
    SET "quorum_present_mode"  = 'MUTLAK',
        "quorum_present_value" = 1,
        "quorum_decision_mode" = 'MUTLAK',
        "quorum_decision_value" = 1
    WHERE "decision_kind" = 'CIRCULAR'
      AND (
        "quorum_present_mode"  <> 'MUTLAK'
        OR "quorum_decision_mode" <> 'MUTLAK'
        OR "quorum_present_value"  <> 1
        OR "quorum_decision_value" <> 1
      );
  END IF;
END $$;
