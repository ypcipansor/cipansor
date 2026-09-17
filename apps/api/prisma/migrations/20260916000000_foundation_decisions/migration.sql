-- Keputusan & Risalah Organ Yayasan: 6 tabel + 5 enum baru.
--
-- Menambahkan mesin keputusan organ (Pembina/Pengurus/Pengawas) dengan kuorum
-- terkunci (snapshot immutable), suara anggota bertanda tangan Ed25519, dan
-- e-seal Yayasan yang hanya dibubuhkan bila kuorum sah.
--
-- Migrasi ini HANYA menambah: enam tabel baru, lima enum, dan satu kolom
-- referensi e-seal (`foundation_decisions.eseal_id`). Tidak ada tabel/kolom
-- lama yang diubah atau dihapus, sehingga image lama tetap berjalan.
--
-- `prisma migrate deploy` dijalankan dari basis data kosong. Pernyataan
-- idempoten (IF NOT EXISTS) dipakai agar migrasi ini tidak melempar ketika
-- dijalankan pada basis data pengembangan yang sudah ter-`db push`.
--
-- Idempotensi itu TIDAK boleh berarti "terima apa pun". Sebuah tabel yang
-- sudah ada dengan bentuk BERBEDA — hasil `db push` dari skema yang menyimpang —
-- akan dilewati diam-diam oleh IF NOT EXISTS, sehingga `migrate deploy` "lolos"
-- sementara basis data tidak sesuai skema yang dijanjikan Prisma.
--
-- Karena itu preflight di bawah memeriksa SELURUH bentuk yang menjadi milik
-- migrasi ini, bukan sekadar nama kolom:
--   * setiap kolom: keberadaan, `data_type` (enum diperiksa sebagai
--     ENUM:<nama tipe>, bukan sekadar "USER-DEFINED"), dan nullability;
--   * primary key: harus ada dan berkolom tunggal `id`;
--   * indeks unik: harus ada dan benar-benar UNIQUE;
--   * foreign key: nama, tabel sumber, tabel tujuan, dan aksi ON DELETE;
--   * enum: himpunan label harus SAMA PERSIS dengan yang dijanjikan —
--     label yang kurang MAUPUN berlebih ditolak, sebab keduanya berarti
--     Prisma akan membandingkan label yang tidak sepakat dengan basis data;
--   * semuanya dibatasi pada `current_schema()`, supaya objek bernama sama di
--     skema lain tidak pernah dianggap memenuhi syarat.
--
-- Urutan label di dalam enum sengaja TIDAK dipaku: `db push` dan `migrate`
-- dapat menuliskannya dalam urutan yang berbeda tanpa mengubah arti label, dan
-- Prisma membandingkan enum berdasarkan label, bukan posisinya. Yang dipaku
-- adalah himpunannya.
--
-- Keterbatasan yang jujur: preflight ini memeriksa bentuk objek, bukan isi
-- barisnya. Ia tidak dapat membuktikan indeks unik benar-benar menolak
-- duplikat, dan tidak memeriksa `column_default` (nilai default tidak dipakai
-- Prisma untuk membaca/menulis baris). Bila kelak dibutuhkan jaminan yang lebih
-- kuat, ganti migrasi ini dengan `prisma migrate dev` standar diikuti prosedur
-- baseline eksplisit — jangan menambah klaim yang tidak diperiksa.
--
-- Bila tabel/enum yang menjadi milik migrasi ini sudah ada tetapi tidak sesuai,
-- migrasi GAGAL dengan pesan yang menyebut objek mana yang menyimpang.

-- Preflight: tolak artefak `db push` yang tak kompatibel.
DO $$
DECLARE
  -- (tabel, kolom, tipe yang diharapkan, nullability). Tipe `USER-DEFINED`
  -- ditulis `ENUM:<nama>` supaya enum yang tertukar pun tertangkap.
  expected_columns text[][] := ARRAY[
    ARRAY['foundation_decisions', 'id', 'text', 'NO'],
    ARRAY['foundation_decisions', 'organ_type', 'ENUM:FoundationOrganType', 'NO'],
    ARRAY['foundation_decisions', 'kind', 'ENUM:FoundationDecisionKind', 'NO'],
    ARRAY['foundation_decisions', 'status', 'ENUM:FoundationDecisionStatus', 'NO'],
    ARRAY['foundation_decisions', 'subject', 'text', 'NO'],
    ARRAY['foundation_decisions', 'body', 'text', 'NO'],
    ARRAY['foundation_decisions', 'decision_type', 'text', 'NO'],
    ARRAY['foundation_decisions', 'quorum_snapshot', 'jsonb', 'NO'],
    ARRAY['foundation_decisions', 'vote_summary', 'jsonb', 'NO'],
    ARRAY['foundation_decisions', 'created_by_id', 'text', 'NO'],
    ARRAY['foundation_decisions', 'decided_by_id', 'text', 'YES'],
    ARRAY['foundation_decisions', 'decided_at', 'timestamp without time zone', 'YES'],
    ARRAY['foundation_decisions', 'final_pdf_digest', 'text', 'YES'],
    ARRAY['foundation_decisions', 'final_pdf_byte_size', 'integer', 'YES'],
    ARRAY['foundation_decisions', 'final_pdf_seal_signature', 'text', 'YES'],
    ARRAY['foundation_decisions', 'eseal_id', 'text', 'YES'],
    ARRAY['foundation_decisions', 'verification_token', 'text', 'YES'],
    ARRAY['foundation_decisions', 'created_at', 'timestamp without time zone', 'NO'],
    ARRAY['foundation_decisions', 'updated_at', 'timestamp without time zone', 'NO'],

    ARRAY['foundation_decision_votes', 'id', 'text', 'NO'],
    ARRAY['foundation_decision_votes', 'decision_id', 'text', 'NO'],
    ARRAY['foundation_decision_votes', 'user_id', 'text', 'NO'],
    ARRAY['foundation_decision_votes', 'choice', 'ENUM:FoundationVoteChoice', 'NO'],
    ARRAY['foundation_decision_votes', 'canonical_digest', 'text', 'NO'],
    ARRAY['foundation_decision_votes', 'signature', 'text', 'NO'],
    ARRAY['foundation_decision_votes', 'public_key', 'text', 'NO'],
    ARRAY['foundation_decision_votes', 'algorithm', 'text', 'NO'],
    ARRAY['foundation_decision_votes', 'note', 'text', 'YES'],
    ARRAY['foundation_decision_votes', 'signed_at', 'timestamp without time zone', 'NO'],

    ARRAY['foundation_decision_members', 'id', 'text', 'NO'],
    ARRAY['foundation_decision_members', 'decision_id', 'text', 'NO'],
    ARRAY['foundation_decision_members', 'user_id', 'text', 'NO'],
    ARRAY['foundation_decision_members', 'role_code', 'text', 'NO'],
    ARRAY['foundation_decision_members', 'name', 'text', 'NO'],

    ARRAY['foundation_decision_rules', 'id', 'text', 'NO'],
    ARRAY['foundation_decision_rules', 'organ_type', 'ENUM:FoundationOrganType', 'NO'],
    ARRAY['foundation_decision_rules', 'decision_kind', 'ENUM:FoundationDecisionKind', 'NO'],
    ARRAY['foundation_decision_rules', 'quorum_present_mode', 'ENUM:FoundationQuorumMode', 'NO'],
    ARRAY['foundation_decision_rules', 'quorum_present_value', 'double precision', 'NO'],
    ARRAY['foundation_decision_rules', 'quorum_decision_mode', 'ENUM:FoundationQuorumMode', 'NO'],
    ARRAY['foundation_decision_rules', 'quorum_decision_value', 'double precision', 'NO'],
    ARRAY['foundation_decision_rules', 'updated_by_id', 'text', 'YES'],
    ARRAY['foundation_decision_rules', 'updated_at', 'timestamp without time zone', 'NO'],

    ARRAY['foundation_eseals', 'id', 'text', 'NO'],
    ARRAY['foundation_eseals', 'algorithm', 'text', 'NO'],
    ARRAY['foundation_eseals', 'public_key', 'text', 'NO'],
    ARRAY['foundation_eseals', 'encrypted_private_key', 'text', 'NO'],
    ARRAY['foundation_eseals', 'kdf_salt', 'text', 'NO'],
    ARRAY['foundation_eseals', 'kdf_params', 'jsonb', 'NO'],
    ARRAY['foundation_eseals', 'iv', 'text', 'NO'],
    ARRAY['foundation_eseals', 'auth_tag', 'text', 'NO'],
    ARRAY['foundation_eseals', 'activated_at', 'timestamp without time zone', 'YES'],
    ARRAY['foundation_eseals', 'revoked_at', 'timestamp without time zone', 'YES'],
    ARRAY['foundation_eseals', 'created_at', 'timestamp without time zone', 'NO'],

    ARRAY['foundation_decision_documents', 'id', 'text', 'NO'],
    ARRAY['foundation_decision_documents', 'decision_id', 'text', 'NO'],
    ARRAY['foundation_decision_documents', 'bytes', 'bytea', 'NO'],
    ARRAY['foundation_decision_documents', 'sha256', 'text', 'NO'],
    ARRAY['foundation_decision_documents', 'byte_size', 'integer', 'NO'],
    ARRAY['foundation_decision_documents', 'generator', 'text', 'NO'],
    ARRAY['foundation_decision_documents', 'archived_at', 'timestamp without time zone', 'NO']
  ];
  -- (tabel, kolom primary key) — dipaku agar tabel tanpa identifier tertangkap.
  expected_pks text[][] := ARRAY[
    ARRAY['foundation_decisions', 'id'],
    ARRAY['foundation_decision_votes', 'id'],
    ARRAY['foundation_decision_members', 'id'],
    ARRAY['foundation_decision_rules', 'id'],
    ARRAY['foundation_eseals', 'id'],
    ARRAY['foundation_decision_documents', 'id']
  ];
  -- (tabel, nama indeks yang HARUS unik).
  expected_unique text[][] := ARRAY[
    ARRAY['foundation_decisions', 'foundation_decisions_final_pdf_digest_key'],
    ARRAY['foundation_decisions', 'foundation_decisions_verification_token_key'],
    ARRAY['foundation_decision_votes', 'foundation_decision_votes_decision_id_user_id_key'],
    ARRAY['foundation_decision_members', 'foundation_decision_members_decision_id_user_id_key'],
    ARRAY['foundation_decision_rules', 'foundation_decision_rules_organ_type_decision_kind_key'],
    ARRAY['foundation_decision_documents', 'foundation_decision_documents_decision_id_key']
  ];
  -- (nama constraint, tabel sumber, tabel tujuan, aksi ON DELETE).
  expected_fks text[][] := ARRAY[
    ARRAY['foundation_decisions_created_by_id_fkey', 'foundation_decisions', 'users', 'r'],
    ARRAY['foundation_decisions_decided_by_id_fkey', 'foundation_decisions', 'users', 'n'],
    ARRAY['foundation_decisions_eseal_id_fkey', 'foundation_decisions', 'foundation_eseals', 'n'],
    ARRAY['foundation_decision_votes_decision_id_fkey', 'foundation_decision_votes', 'foundation_decisions', 'c'],
    ARRAY['foundation_decision_votes_user_id_fkey', 'foundation_decision_votes', 'users', 'r'],
    ARRAY['foundation_decision_members_decision_id_fkey', 'foundation_decision_members', 'foundation_decisions', 'c'],
    ARRAY['foundation_decision_members_user_id_fkey', 'foundation_decision_members', 'users', 'r'],
    ARRAY['foundation_decision_rules_updated_by_id_fkey', 'foundation_decision_rules', 'users', 'n'],
    ARRAY['foundation_decision_documents_decision_id_fkey', 'foundation_decision_documents', 'foundation_decisions', 'c']
  ];
  expected_enums text[][] := ARRAY[
    ARRAY['FoundationOrganType', 'PEMBINA,PENGURUS,PENGAWAS,GABUNGAN'],
    ARRAY['FoundationDecisionKind', 'CIRCULAR,MEETING'],
    ARRAY['FoundationDecisionStatus', 'DRAFT,VOTING,APPROVED,REJECTED'],
    ARRAY['FoundationVoteChoice', 'APPROVE,REJECT,ABSTAIN'],
    ARRAY['FoundationQuorumMode', 'MAJORITY,TWO_THIRDS,THREE_QUARTERS,MUTLAK']
  ];
  spec text[];
  actual_type text;
  actual_null text;
  actual_pk text;
  actual_ref text;
  actual_del text;
  actual_def text;
  actual_labels text[];
  expected_labels text[];
BEGIN
  -- Kolom: keberadaan, tipe, nullability.
  FOREACH spec SLICE 1 IN ARRAY expected_columns LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = spec[1]) THEN
      SELECT
        CASE WHEN c.data_type = 'USER-DEFINED' THEN 'ENUM:' || c.udt_name ELSE c.data_type END,
        c.is_nullable
      INTO actual_type, actual_null
      FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = spec[1] AND c.column_name = spec[2];

      IF actual_type IS NULL THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: tabel % sudah ada tetapi tidak memiliki kolom %. '
          'Ini artefak db push yang tidak kompatibel — perbaiki skema sebelum migrate deploy.',
          spec[1], spec[2];
      END IF;

      IF actual_type <> spec[3] OR actual_null <> spec[4] THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: kolom %.% bertipe %/nullable % tetapi skema mengharapkan %/%.',
          spec[1], spec[2], actual_type, actual_null, spec[3], spec[4];
      END IF;
    END IF;
  END LOOP;

  -- Primary key: harus ada, berkolom tunggal, dan berkolom yang diharapkan.
  FOREACH spec SLICE 1 IN ARRAY expected_pks LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = spec[1]) THEN
      actual_pk := NULL;
      SELECT a.attname INTO actual_pk
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
      WHERE n.nspname = current_schema() AND t.relname = spec[1]
        AND i.indisprimary AND i.indnkeyatts = 1;

      IF actual_pk IS DISTINCT FROM spec[2] THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: primary key tabel % adalah (%) tetapi skema mengharapkan kolom tunggal (%).',
          spec[1], COALESCE(actual_pk, 'tidak ada'), spec[2];
      END IF;
    END IF;
  END LOOP;

  -- Indeks unik: harus ada DAN benar-benar unik.
  FOREACH spec SLICE 1 IN ARRAY expected_unique LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = spec[1]) THEN
      actual_def := NULL;
      SELECT indexdef INTO actual_def
      FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = spec[1] AND indexname = spec[2];

      IF actual_def IS NULL THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: indeks unik % pada tabel % tidak ada.',
          spec[2], spec[1];
      END IF;
      IF actual_def NOT LIKE 'CREATE UNIQUE INDEX%' THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: indeks % pada tabel % TIDAK unik (%).',
          spec[2], spec[1], actual_def;
      END IF;
    END IF;
  END LOOP;

  -- Foreign key: nama, tabel sumber, tabel tujuan, aksi ON DELETE.
  FOREACH spec SLICE 1 IN ARRAY expected_fks LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = spec[2]) THEN
      actual_ref := NULL;
      actual_del := NULL;
      SELECT c.confrelid::regclass::text, c.confdeltype INTO actual_ref, actual_del
      FROM pg_constraint c
      WHERE c.conname = spec[1] AND c.contype = 'f'
        AND c.conrelid::regclass::text = spec[2];

      IF actual_ref IS NULL THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: foreign key % pada tabel % tidak ada.',
          spec[1], spec[2];
      END IF;
      IF actual_ref <> spec[3] OR actual_del <> spec[4] THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: foreign key % menunjuk % (ON DELETE %) tetapi skema mengharapkan % (ON DELETE %).',
          spec[1], actual_ref, actual_del, spec[3], spec[4];
      END IF;
    END IF;
  END LOOP;

  -- Enum: himpunan label harus sama persis (kurang ATAU lebih ditolak).
  FOREACH spec SLICE 1 IN ARRAY expected_enums LOOP
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = current_schema() AND t.typname = spec[1]) THEN
      actual_labels := NULL;
      SELECT array_agg(e.enumlabel ORDER BY e.enumlabel) INTO actual_labels
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = current_schema() AND t.typname = spec[1];

      expected_labels := NULL;
      SELECT array_agg(l ORDER BY l) INTO expected_labels
      FROM unnest(string_to_array(spec[2], ',')) AS l;

      IF actual_labels IS DISTINCT FROM expected_labels THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: label enum % adalah (%) tetapi skema mengharapkan (%).',
          spec[1], COALESCE(array_to_string(actual_labels, ', '), 'kosong'),
          array_to_string(expected_labels, ', ');
      END IF;
    END IF;
  END LOOP;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = current_schema() AND t.typname = 'FoundationOrganType') THEN
    CREATE TYPE "FoundationOrganType" AS ENUM ('PEMBINA', 'PENGURUS', 'PENGAWAS', 'GABUNGAN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionKind') THEN
    CREATE TYPE "FoundationDecisionKind" AS ENUM ('CIRCULAR', 'MEETING');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = current_schema() AND t.typname = 'FoundationDecisionStatus') THEN
    CREATE TYPE "FoundationDecisionStatus" AS ENUM ('DRAFT', 'VOTING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = current_schema() AND t.typname = 'FoundationVoteChoice') THEN
    CREATE TYPE "FoundationVoteChoice" AS ENUM ('APPROVE', 'REJECT', 'ABSTAIN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = current_schema() AND t.typname = 'FoundationQuorumMode') THEN
    CREATE TYPE "FoundationQuorumMode" AS ENUM ('MAJORITY', 'TWO_THIRDS', 'THREE_QUARTERS', 'MUTLAK');
  END IF;
END $$;

-- CreateTable foundation_decisions
CREATE TABLE IF NOT EXISTS "foundation_decisions" (
    "id" TEXT NOT NULL,
    "organ_type" "FoundationOrganType" NOT NULL,
    "kind" "FoundationDecisionKind" NOT NULL,
    "status" "FoundationDecisionStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "decision_type" TEXT NOT NULL,
    "quorum_snapshot" JSONB NOT NULL,
    "vote_summary" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "final_pdf_digest" TEXT,
    "final_pdf_byte_size" INTEGER,
    "final_pdf_seal_signature" TEXT,
    -- E-seal spesifik yang membubuhkan tanda tangan, disimpan agar rotasi /
    -- pencabutan seal tidak mengubah hasil verifikasi keputusan lama.
    "eseal_id" TEXT,
    "verification_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foundation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable foundation_decision_votes
CREATE TABLE IF NOT EXISTS "foundation_decision_votes" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "choice" "FoundationVoteChoice" NOT NULL,
    "canonical_digest" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "note" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foundation_decision_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable foundation_decision_members
CREATE TABLE IF NOT EXISTS "foundation_decision_members" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "foundation_decision_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable foundation_decision_rules
CREATE TABLE IF NOT EXISTS "foundation_decision_rules" (
    "id" TEXT NOT NULL,
    "organ_type" "FoundationOrganType" NOT NULL,
    "decision_kind" "FoundationDecisionKind" NOT NULL,
    "quorum_present_mode" "FoundationQuorumMode" NOT NULL DEFAULT 'MAJORITY',
    "quorum_present_value" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "quorum_decision_mode" "FoundationQuorumMode" NOT NULL DEFAULT 'MAJORITY',
    "quorum_decision_value" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foundation_decision_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable foundation_eseals
CREATE TABLE IF NOT EXISTS "foundation_eseals" (
    "id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "public_key" TEXT NOT NULL,
    "encrypted_private_key" TEXT NOT NULL,
    "kdf_salt" TEXT NOT NULL,
    "kdf_params" JSONB NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "activated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foundation_eseals_pkey" PRIMARY KEY ("id")
);

-- CreateTable foundation_decision_documents
CREATE TABLE IF NOT EXISTS "foundation_decision_documents" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "generator" TEXT NOT NULL DEFAULT 'decision-pdf',
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foundation_decision_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "foundation_decisions_final_pdf_digest_key" ON "foundation_decisions"("final_pdf_digest");
CREATE UNIQUE INDEX IF NOT EXISTS "foundation_decisions_verification_token_key" ON "foundation_decisions"("verification_token");
CREATE INDEX IF NOT EXISTS "foundation_decisions_organ_type_status_idx" ON "foundation_decisions"("organ_type", "status");
CREATE INDEX IF NOT EXISTS "foundation_decisions_created_by_id_idx" ON "foundation_decisions"("created_by_id");
CREATE INDEX IF NOT EXISTS "foundation_decisions_eseal_id_idx" ON "foundation_decisions"("eseal_id");

CREATE INDEX IF NOT EXISTS "foundation_decision_votes_user_id_idx" ON "foundation_decision_votes"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "foundation_decision_votes_decision_id_user_id_key" ON "foundation_decision_votes"("decision_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "foundation_decision_members_decision_id_user_id_key" ON "foundation_decision_members"("decision_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "foundation_decision_rules_organ_type_decision_kind_key" ON "foundation_decision_rules"("organ_type", "decision_kind");

CREATE UNIQUE INDEX IF NOT EXISTS "foundation_decision_documents_decision_id_key" ON "foundation_decision_documents"("decision_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decisions_created_by_id_fkey') THEN
    ALTER TABLE "foundation_decisions" ADD CONSTRAINT "foundation_decisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decisions_decided_by_id_fkey') THEN
    ALTER TABLE "foundation_decisions" ADD CONSTRAINT "foundation_decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decisions_eseal_id_fkey') THEN
    ALTER TABLE "foundation_decisions" ADD CONSTRAINT "foundation_decisions_eseal_id_fkey" FOREIGN KEY ("eseal_id") REFERENCES "foundation_eseals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decision_votes_decision_id_fkey') THEN
    ALTER TABLE "foundation_decision_votes" ADD CONSTRAINT "foundation_decision_votes_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "foundation_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decision_votes_user_id_fkey') THEN
    ALTER TABLE "foundation_decision_votes" ADD CONSTRAINT "foundation_decision_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decision_members_decision_id_fkey') THEN
    ALTER TABLE "foundation_decision_members" ADD CONSTRAINT "foundation_decision_members_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "foundation_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decision_members_user_id_fkey') THEN
    ALTER TABLE "foundation_decision_members" ADD CONSTRAINT "foundation_decision_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decision_rules_updated_by_id_fkey') THEN
    ALTER TABLE "foundation_decision_rules" ADD CONSTRAINT "foundation_decision_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foundation_decision_documents_decision_id_fkey') THEN
    ALTER TABLE "foundation_decision_documents" ADD CONSTRAINT "foundation_decision_documents_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "foundation_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
