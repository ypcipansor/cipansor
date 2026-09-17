-- Pengikat suara ke rekaman kunci tepercaya + invariant e-seal tunggal.
--
-- Dua lubang yang ditutup migrasi ini:
--
-- 1. `foundation_decision_votes.public_key` dipercaya apa adanya. Baris suara
--    yang disisipkan langsung ke basis data dapat membawa pasangan kunci
--    karangan penyerang beserta tanda tangan yang "cocok" dengan kunci itu
--    sendiri, sehingga suara palsu lolos verifikasi dan memicu e-seal Yayasan.
--    Kolom `signing_key_id` + `public_key_fingerprint` mengikat setiap suara ke
--    baris `user_signing_key_history` milik pemilih yang sama; verifikasi
--    memakai kunci PUBLIK dari rekaman itu, bukan dari baris suara.
--
-- 2. `ensureSeal` melakukan find-then-create tanpa invariant basis data,
--    sehingga dua approval pertama yang berjalan paralel dapat sama-sama
--    membuat seal baru dan meninggalkan DUA seal aktif sekaligus.
--
-- `user_signing_key_history` append-only: barisnya tidak pernah dihapus.
-- `UserSigningKey` satu baris per pengguna dan dihapus saat penerbitan ulang,
-- jadi riwayat kunci publik harus hidup di tabel sendiri agar tanda tangan
-- lama tetap dapat diverifikasi setelah rotasi/pencabutan — inilah yang
-- mencegah perbaikan lubang (1) merusak keputusan yang sudah sah.
--
-- Migrasi ini HANYA menambah. Tidak ada kolom/tabel lama yang diubah atau
-- dihapus. Idempoten (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) untuk basis
-- data pengembangan yang sudah ter-`db push`, DENGAN preflight yang memeriksa
-- bentuk objek yang sudah ada alih-alih menerimanya apa pun.

-- Preflight: objek milik migrasi ini yang sudah ada harus kompatibel.
DO $$
DECLARE
  expected_columns text[][] := ARRAY[
    ARRAY['user_signing_key_history', 'id', 'text', 'NO'],
    ARRAY['user_signing_key_history', 'user_id', 'text', 'NO'],
    ARRAY['user_signing_key_history', 'algorithm', 'text', 'NO'],
    ARRAY['user_signing_key_history', 'public_key', 'text', 'NO'],
    ARRAY['user_signing_key_history', 'fingerprint', 'text', 'NO'],
    ARRAY['user_signing_key_history', 'issued_at', 'timestamp without time zone', 'NO'],
    ARRAY['user_signing_key_history', 'superseded_at', 'timestamp without time zone', 'YES'],
    ARRAY['user_signing_key_history', 'revoked_at', 'timestamp without time zone', 'YES']
  ];
  -- Kolom yang DITAMBAHKAN ke tabel yang sudah ada: bila sudah ada, tipenya
  -- harus benar. Selain itu akan dibiarkan dan ditambahkan di bawah.
  added_columns text[][] := ARRAY[
    ARRAY['foundation_decision_votes', 'signing_key_id', 'text', 'YES'],
    ARRAY['foundation_decision_votes', 'public_key_fingerprint', 'text', 'YES']
  ];
  required_fks text[][] := ARRAY[
    ARRAY['user_signing_key_history_user_id_fkey', 'user_signing_key_history', 'users', 'c'],
    ARRAY['foundation_decision_votes_signing_key_id_fkey', 'foundation_decision_votes', 'user_signing_key_history', 'r']
  ];
  spec text[];
  actual_type text;
  actual_null text;
  actual_pk text;
  actual_ref text;
  actual_del text;
  actual_def text;
  seal_unique boolean;
  seal_predicate text;
  seal_expr text;
BEGIN
  -- Tabel riwayat: kolom, tipe, nullability.
  FOREACH spec SLICE 1 IN ARRAY expected_columns LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = spec[1]) THEN
      actual_type := NULL;
      SELECT
        CASE WHEN c.data_type = 'USER-DEFINED' THEN 'ENUM:' || c.udt_name ELSE c.data_type END,
        c.is_nullable
      INTO actual_type, actual_null
      FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = spec[1] AND c.column_name = spec[2];

      IF actual_type IS NULL THEN
        RAISE EXCEPTION
          'Migrasi foundation_decision_vote_key_binding: tabel % sudah ada tetapi tidak memiliki kolom %.',
          spec[1], spec[2];
      END IF;
      IF actual_type <> spec[3] OR actual_null <> spec[4] THEN
        RAISE EXCEPTION
          'Migrasi foundation_decision_vote_key_binding: kolom %.% bertipe %/nullable % tetapi skema mengharapkan %/%.',
          spec[1], spec[2], actual_type, actual_null, spec[3], spec[4];
      END IF;
    END IF;
  END LOOP;

  -- Kolom yang ditambahkan: bila sudah ada, tipenya harus tepat.
  FOREACH spec SLICE 1 IN ARRAY added_columns LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = spec[1]) THEN
      actual_type := NULL;
      SELECT
        CASE WHEN c.data_type = 'USER-DEFINED' THEN 'ENUM:' || c.udt_name ELSE c.data_type END,
        c.is_nullable
      INTO actual_type, actual_null
      FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = spec[1] AND c.column_name = spec[2];

      IF actual_type IS NOT NULL AND (actual_type <> spec[3] OR actual_null <> spec[4]) THEN
        RAISE EXCEPTION
          'Migrasi foundation_decision_vote_key_binding: kolom %.% sudah ada dengan tipe %/nullable % tetapi skema mengharapkan %/%.',
          spec[1], spec[2], actual_type, actual_null, spec[3], spec[4];
      END IF;
    END IF;
  END LOOP;

  -- Primary key tabel riwayat: harus kolom tunggal `id`.
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = current_schema() AND table_name = 'user_signing_key_history') THEN
    actual_pk := NULL;
    SELECT a.attname INTO actual_pk
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = current_schema() AND t.relname = 'user_signing_key_history'
      AND i.indisprimary AND i.indnkeyatts = 1;

    IF actual_pk IS DISTINCT FROM 'id' THEN
      RAISE EXCEPTION
        'Migrasi foundation_decision_vote_key_binding: primary key user_signing_key_history adalah (%) tetapi skema mengharapkan (id).',
        COALESCE(actual_pk, 'tidak ada');
    END IF;

    actual_def := NULL;
    SELECT indexdef INTO actual_def FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'user_signing_key_history'
      AND indexname = 'user_signing_key_history_user_id_fingerprint_key';
    IF actual_def IS NULL OR actual_def NOT LIKE 'CREATE UNIQUE INDEX%' THEN
      RAISE EXCEPTION
        'Migrasi foundation_decision_vote_key_binding: indeks unik (user_id, fingerprint) pada user_signing_key_history tidak ada atau tidak unik (%).',
        COALESCE(actual_def, 'tidak ada');
    END IF;
  END IF;

  -- Foreign key: bila constraint dengan nama itu sudah ada, tujuannya harus benar.
  FOREACH spec SLICE 1 IN ARRAY required_fks LOOP
    actual_ref := NULL;
    SELECT c.confrelid::regclass::text, c.confdeltype INTO actual_ref, actual_del
    FROM pg_constraint c
    WHERE c.conname = spec[1] AND c.contype = 'f'
      AND c.conrelid::regclass::text = spec[2];
    IF actual_ref IS NOT NULL AND (actual_ref <> spec[3] OR actual_del <> spec[4]) THEN
      RAISE EXCEPTION
        'Migrasi foundation_decision_vote_key_binding: foreign key % menunjuk % (ON DELETE %) tetapi skema mengharapkan % (ON DELETE %).',
        spec[1], actual_ref, actual_del, spec[3], spec[4];
    END IF;
  END LOOP;

  /**
   * Invariant e-seal: indeks parsial yang sudah ada harus benar-benar
   * "unik" pada baris yang belum dicabut. `CREATE UNIQUE INDEX IF NOT EXISTS`
   * akan diam-diam melewati indeks bernama sama yang definisinya BERBEDA,
   * sehingga pemeriksaan ini yang menutup celah tersebut.
   */
  SELECT i.indisunique, pg_get_expr(i.indpred, i.indrelid), pg_get_expr(i.indexprs, i.indrelid)
  INTO seal_unique, seal_predicate, seal_expr
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = current_schema() AND t.relname = 'foundation_eseals'
    AND i.indexrelid = to_regclass(current_schema() || '.foundation_eseals_single_active_key');

  IF seal_predicate IS NOT NULL OR seal_unique IS NOT NULL THEN
    IF seal_unique IS NOT TRUE
       OR seal_predicate IS DISTINCT FROM '(revoked_at IS NULL)'
       -- Ekspresi kuncinya harus konstanta `true`, bukan kolom ("id" misalnya):
       -- indeks unik pada kolom hanya melarang DUPLIKAT, sedangkan yang
       -- dibutuhkan adalah "paling banyak satu baris".
       OR seal_expr IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION
        'Migrasi foundation_decision_vote_key_binding: indeks foundation_eseals_single_active_key sudah ada dengan definisi berbeda (unique=%, predikat=%, kunci=%).',
        COALESCE(seal_unique::text, 'tidak ada'), COALESCE(seal_predicate, 'tanpa predikat'),
        COALESCE(seal_expr, 'bukan ekspresi');
    END IF;
  END IF;
END $$;

-- Tabel riwayat kunci publik (append-only).
CREATE TABLE IF NOT EXISTS "user_signing_key_history" (
    "id"            TEXT NOT NULL,
    "user_id"       TEXT NOT NULL,
    "algorithm"     TEXT NOT NULL DEFAULT 'Ed25519',
    "public_key"    TEXT NOT NULL,
    "fingerprint"   TEXT NOT NULL,
    "issued_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMP(3),
    "revoked_at"    TIMESTAMP(3),

    CONSTRAINT "user_signing_key_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_signing_key_history_user_id_fingerprint_key"
  ON "user_signing_key_history"("user_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "user_signing_key_history_user_id_idx"
  ON "user_signing_key_history"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_signing_key_history_user_id_fkey') THEN
    ALTER TABLE "user_signing_key_history"
      ADD CONSTRAINT "user_signing_key_history_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

/**
 * Backfill: setiap kunci yang SEDANG berlaku sudah tentu pernah diterbitkan,
 * sehingga riwayatnya dapat direkonstruksi dari `user_signing_keys`. Kunci
 * yang lebih lama tidak dapat direkonstruksi — barisnya sudah dihapus oleh
 * penerbitan ulang — dan suara yang memakainya akan ditolak verifikasi (fail
 * closed, bukan fail open). Fitur ini belum pernah dirilis, jadi tidak ada
 * suara historis yang bergantung padanya.
 *
 * `fingerprint` dihitung dari byte UTF-8 teks kunci (base64), sama persis
 * dengan `publicKeyFingerprint()` di aplikasi.
 */
INSERT INTO "user_signing_key_history"
  ("id", "user_id", "algorithm", "public_key", "fingerprint", "issued_at")
SELECT
  gen_random_uuid()::text,
  k."user_id",
  k."algorithm",
  k."public_key",
  encode(sha256(convert_to(k."public_key", 'UTF8')), 'hex'),
  k."created_at"
FROM "user_signing_keys" k
ON CONFLICT ("user_id", "fingerprint") DO NOTHING;

-- Kolom pengikat pada baris suara.
ALTER TABLE "foundation_decision_votes"
  ADD COLUMN IF NOT EXISTS "signing_key_id" TEXT;
ALTER TABLE "foundation_decision_votes"
  ADD COLUMN IF NOT EXISTS "public_key_fingerprint" TEXT;

/**
 * Riwayat untuk kunci yang dipakai suara-suara yang SUDAH ada (basis data
 * pengembangan). Baris history-nya dibuat dari kunci publik yang tercatat di
 * baris suara — bukan dari `user_signing_keys` — karena kunci itulah yang
 * benar-benar menandatangani, dan pemiliknya harus pemilih yang sama. Ini
 * hanya memindahkan pengikat yang sebelumnya implisit ("percaya pada
 * public_key baris suara") menjadi eksplisit untuk data yang sudah terlanjur
 * ada; tidak ada suara baru yang dibuat.
 */
INSERT INTO "user_signing_key_history"
  ("id", "user_id", "algorithm", "public_key", "fingerprint", "issued_at")
SELECT
  gen_random_uuid()::text,
  v."user_id",
  v."algorithm",
  v."public_key",
  encode(sha256(convert_to(v."public_key", 'UTF8')), 'hex'),
  v."signed_at"
FROM "foundation_decision_votes" v
WHERE v."public_key" IS NOT NULL
ON CONFLICT ("user_id", "fingerprint") DO NOTHING;

UPDATE "foundation_decision_votes" v
SET "signing_key_id" = h."id",
    "public_key_fingerprint" = h."fingerprint"
FROM "user_signing_key_history" h
WHERE v."signing_key_id" IS NULL
  AND h."user_id" = v."user_id"
  AND h."fingerprint" = encode(sha256(convert_to(v."public_key", 'UTF8')), 'hex');

CREATE INDEX IF NOT EXISTS "foundation_decision_votes_signing_key_id_idx"
  ON "foundation_decision_votes"("signing_key_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decision_votes_signing_key_id_fkey') THEN
    ALTER TABLE "foundation_decision_votes"
      ADD CONSTRAINT "foundation_decision_votes_signing_key_id_fkey"
      FOREIGN KEY ("signing_key_id") REFERENCES "user_signing_key_history"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

/**
 * Invariant e-seal tunggal.
 *
 * `ensureSeal` melakukan find-then-create. Dua approval pertama yang berjalan
 * paralel sama-sama menemukan "belum ada seal yang dapat dipakai", lalu
 * sama-sama membuat seal baru — dan keduanya benar-benar aktif. Sebuah
 * indeks unik parsial membuat keadaan itu mustahil di basis data; aplikasi
 * tetap menangani balapan dengan membaca ulang pemenangnya, tetapi invariant
 * ini berlaku bahkan bila aplikasi lalai.
 *
 * Konsekuensi yang perlu diketahui operator: bila basis data yang sudah ada
 * terlanjur memuat lebih dari satu seal aktif (akibat bug yang sama), migrasi
 * ini merapikannya dengan mencabut semua kecuali yang TERBARU. Verifikasi
 * keputusan lama tidak terpengaruh — ia mencari seal lewat `eseal_id` yang
 * tercatat di barisnya, dan kunci publik seal yang sudah dicabut tetap dipakai
 * untuk memverifikasi tanda tangan lama.
 */
DO $$
DECLARE
  active_count int;
BEGIN
  IF to_regclass(current_schema() || '.foundation_eseals') IS NOT NULL THEN
    SELECT count(*) INTO active_count FROM "foundation_eseals" WHERE "revoked_at" IS NULL;
    IF active_count > 1 THEN
      RAISE NOTICE
        'foundation_decisions: % seal aktif ditemukan; mencabut semua kecuali yang terbaru.', active_count;
      UPDATE "foundation_eseals"
      SET "revoked_at" = NOW()
      WHERE "revoked_at" IS NULL
        AND "id" <> (
          SELECT "id" FROM "foundation_eseals"
          WHERE "revoked_at" IS NULL
          ORDER BY "created_at" DESC, "id" DESC
          LIMIT 1
        );
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "foundation_eseals_single_active_key"
  ON "foundation_eseals" ((true))
  WHERE "revoked_at" IS NULL;