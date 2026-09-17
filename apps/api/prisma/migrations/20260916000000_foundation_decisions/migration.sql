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
-- dijalankan di basis data pengembangan yang sudah ter-`db push`.
--
-- Idempotensi itu TIDAK boleh berarti "terima apa pun". Sebuah tabel yang
-- sudah ada dengan bentuk BERBEDA — hasil `db push` dari skema yang menyimpang —
-- akan dilewati diam-diam oleh IF NOT EXISTS, sehingga `migrate deploy` "lolos"
-- sementara basis data tidak sesuai skema yang dijanjikan Prisma. Guard di
-- bawah ini menutup celah itu: bila tabel/enum yang menjadi milik migrasi ini
-- sudah ada tetapi kolom/labelnya tidak lengkap, migrasi GAGAL dengan pesan
-- yang menyebut apa yang hilang, bukan melanjutkan dengan skema yang salah.

-- Preflight: tolak artefak `db push` yang tak kompatibel.
DO $$
DECLARE
  expected_tables text[][] := ARRAY[
    ARRAY['foundation_decisions', 'organ_type,kind,subject,body,decision_type,quorum_snapshot,vote_summary,created_by_id,decided_by_id,decided_at,final_pdf_digest,final_pdf_byte_size,final_pdf_seal_signature,eseal_id,verification_token,created_at,updated_at'],
    ARRAY['foundation_decision_votes', 'decision_id,user_id,choice,canonical_digest,signature,public_key,algorithm,note,signed_at'],
    ARRAY['foundation_decision_members', 'decision_id,user_id,role_code,name'],
    ARRAY['foundation_decision_rules', 'organ_type,decision_kind,quorum_present_mode,quorum_present_value,quorum_decision_mode,quorum_decision_value,updated_by_id,updated_at'],
    ARRAY['foundation_eseals', 'algorithm,public_key,encrypted_private_key,kdf_salt,kdf_params,iv,auth_tag,activated_at,revoked_at,created_at'],
    ARRAY['foundation_decision_documents', 'decision_id,bytes,sha256,byte_size,generator,archived_at']
  ];
  expected_enums text[][] := ARRAY[
    ARRAY['FoundationOrganType', 'PEMBINA,PENGURUS,PENGAWAS,GABUNGAN'],
    ARRAY['FoundationDecisionKind', 'CIRCULAR,MEETING'],
    ARRAY['FoundationDecisionStatus', 'DRAFT,VOTING,APPROVED,REJECTED'],
    ARRAY['FoundationVoteChoice', 'APPROVE,REJECT,ABSTAIN'],
    ARRAY['FoundationQuorumMode', 'MAJORITY,TWO_THIRDS,THREE_QUARTERS,MUTLAK']
  ];
  tbl text[];
  enm text[];
  missing text;
BEGIN
  FOREACH tbl SLICE 1 IN ARRAY expected_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_name = tbl[1]) THEN
      SELECT string_agg(c, ', ') INTO missing
      FROM unnest(string_to_array(tbl[2], ',')) AS c
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = tbl[1] AND column_name = c);
      IF missing IS NOT NULL THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: tabel % sudah ada tetapi kekurangan kolom: %. '
          'Ini artefak db push yang tidak kompatibel — perbaiki skema sebelum migrate deploy.',
          tbl[1], missing;
      END IF;
    END IF;
  END LOOP;

  FOREACH enm SLICE 1 IN ARRAY expected_enums LOOP
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = current_schema() AND t.typname = enm[1]) THEN
      SELECT string_agg(l, ', ') INTO missing
      FROM unnest(string_to_array(enm[2], ',')) AS l
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema() AND t.typname = enm[1]
          AND e.enumlabel = l);
      IF missing IS NOT NULL THEN
        RAISE EXCEPTION
          'Migrasi foundation_decisions: enum % sudah ada tetapi kekurangan nilai: %.',
          enm[1], missing;
      END IF;
    END IF;
  END LOOP;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FoundationOrganType') THEN
    CREATE TYPE "FoundationOrganType" AS ENUM ('PEMBINA', 'PENGURUS', 'PENGAWAS', 'GABUNGAN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FoundationDecisionKind') THEN
    CREATE TYPE "FoundationDecisionKind" AS ENUM ('CIRCULAR', 'MEETING');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FoundationDecisionStatus') THEN
    CREATE TYPE "FoundationDecisionStatus" AS ENUM ('DRAFT', 'VOTING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FoundationVoteChoice') THEN
    CREATE TYPE "FoundationVoteChoice" AS ENUM ('APPROVE', 'REJECT', 'ABSTAIN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FoundationQuorumMode') THEN
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
