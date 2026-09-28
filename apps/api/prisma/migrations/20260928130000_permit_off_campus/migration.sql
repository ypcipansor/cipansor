-- A santri mukim going home or staying off the pondok overnight is decided by
-- the koordinator asrama (decided 2026-09-27, decisions/pemutus-izin-santri.md).
--
-- Additive. `off_campus` says whether the leave takes the learner off the
-- pondok; PULANG, KELUAR and KELUARGA always do, and for SAKIT and OTHER the
-- filer says from now on. Existing rows take the default, true: for a sick
-- santri whose whereabouts were never recorded, the stricter reading (the
-- koordinator, not the kamar's musyrif, decides a pending multi-day permit)
-- is the safe one.
--
-- The new enum value is not used in this transaction, which PostgreSQL 12+
-- allows inside BEGIN/COMMIT.
BEGIN;

ALTER TYPE "PermitDecider" ADD VALUE 'KOORDINATOR_ASRAMA';

ALTER TABLE "permits"
  ADD COLUMN "off_campus" BOOLEAN NOT NULL DEFAULT true;

COMMIT;
