-- Alur pengesahan dokumen tingkat yayasan: RPJP, Renstra, dan RKA Yayasan.
--
-- Mengapa: dokumen yayasan selama ini "disetujui" dengan satu tombol oleh
-- siapa pun yang punya akses tulis. UU 16/2001 membagi perannya — Pengurus
-- menyusun (Ps. 31 ayat 1), Pengawas mengawasi dan memberi nasihat kepada
-- Pengurus (Ps. 40 ayat 1), Pembina menetapkan kebijakan umum dan mengesahkan
-- program kerja serta rancangan anggaran tahunan (Ps. 28 ayat 2 huruf c, d).
-- Alurnya kini: Pengurus mengajukan → Pengawas mereviu → Pengurus menanggapi
-- (merevisi, atau tidak dengan alasan) → Pembina menetapkan atau mengembalikan.
--
-- review_stage terpisah dari status karena PlanStatus dipakai bersama oleh PK
-- dan evaluasi. NULL berarti dokumen belum masuk alur, atau RKA Unit — yang
-- disahkan Ketua Pengurus langsung. Dokumen yang sudah APPROVED/IN_PROGRESS
-- sebelum migrasi ini tetap NULL: sudah berlaku, tidak diulang.
--
-- plan_review_events hanya ditambah, tidak pernah diubah: siapa, dengan
-- jabatan apa, kapan, dan catatannya — termasuk hasil reviu Pengawas yang ikut
-- diajukan ke Pembina bersama dokumennya.

-- CreateEnum
CREATE TYPE "PlanReviewStage" AS ENUM ('DIREVIU_PENGAWAS', 'HASIL_REVIU', 'DIAJUKAN_PEMBINA', 'DITETAPKAN', 'DIKEMBALIKAN');

-- CreateEnum
CREATE TYPE "PlanReviewAction" AS ENUM ('AJUKAN_REVIU', 'KIRIM_HASIL_REVIU', 'AJUKAN_PENETAPAN', 'TETAPKAN', 'KEMBALIKAN');

-- AlterTable
ALTER TABLE "strategic_plans" ADD COLUMN     "review_stage" "PlanReviewStage";

-- CreateTable
CREATE TABLE "plan_review_events" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "action" "PlanReviewAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role_code" TEXT NOT NULL,
    "notes" TEXT,
    "revised" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_review_events_plan_id_created_at_idx" ON "plan_review_events"("plan_id", "created_at");

-- AddForeignKey
ALTER TABLE "plan_review_events" ADD CONSTRAINT "plan_review_events_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "strategic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_review_events" ADD CONSTRAINT "plan_review_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
