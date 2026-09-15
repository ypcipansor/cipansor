-- CreateEnum
CREATE TYPE "WbsCategory" AS ENUM ('KEUANGAN_ASET', 'SOP_TATA_KELOLA', 'ETIKA_PERILAKU', 'PELAYANAN_AKADEMIK_PENGASUHAN', 'LAINNYA');

-- CreateEnum
CREATE TYPE "WbsTargetLevel" AS ENUM ('PENGURUS_YAYASAN', 'PENGAWAS_YAYASAN', 'KEPALA_UNIT', 'STAF_PEGAWAI', 'SISWA_SANTRI');

-- CreateEnum
CREATE TYPE "WbsStatus" AS ENUM ('DIAJUKAN', 'DALAM_PENYELIDIKAN', 'DITINDAKLANJUTI', 'SELESAI', 'TIDAK_DAPAT_DITINDAKLANJUTI');

-- CreateEnum
CREATE TYPE "WbsSenderType" AS ENUM ('REPORTER', 'HANDLER');

-- CreateEnum
CREATE TYPE "BoardSuspensionStatus" AS ENUM ('ACTIVE', 'LIFTED', 'PERMANENT_DISMISSAL');

-- CreateTable
CREATE TABLE "wbs_reports" (
    "id" TEXT NOT NULL,
    "ticket_code" TEXT NOT NULL,
    "tracking_token" TEXT NOT NULL,
    "unit_id" TEXT,
    "category" "WbsCategory" NOT NULL,
    "target_level" "WbsTargetLevel" NOT NULL,
    "target_name" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "incident_date" TIMESTAMP(3),
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "reporter_name" TEXT,
    "reporter_contact" TEXT,
    "attachments" JSONB,
    "status" "WbsStatus" NOT NULL DEFAULT 'DIAJUKAN',
    "primary_handler_role" TEXT NOT NULL,
    "assigned_user_id" TEXT,
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wbs_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_comments" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "sender_type" "WbsSenderType" NOT NULL,
    "sender_id" TEXT,
    "sender_name" TEXT,
    "message" TEXT NOT NULL,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wbs_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_forward_logs" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "forwarded_by_id" TEXT NOT NULL,
    "from_role" TEXT NOT NULL,
    "to_role" TEXT NOT NULL,
    "to_user_id" TEXT,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wbs_forward_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_member_suspensions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sk_number" TEXT NOT NULL,
    "audit_reason" TEXT NOT NULL,
    "document_url" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projected_end_date" TIMESTAMP(3),
    "status" "BoardSuspensionStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspended_by_id" TEXT NOT NULL,
    "plh_user_id" TEXT,
    "plh_role_code" TEXT,
    "lifted_at" TIMESTAMP(3),
    "lifted_by_id" TEXT,
    "lift_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_member_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wbs_reports_ticket_code_key" ON "wbs_reports"("ticket_code");
CREATE INDEX "wbs_reports_ticket_code_idx" ON "wbs_reports"("ticket_code");
CREATE INDEX "wbs_reports_status_idx" ON "wbs_reports"("status");
CREATE INDEX "wbs_reports_primary_handler_role_idx" ON "wbs_reports"("primary_handler_role");

-- CreateIndex
CREATE INDEX "wbs_comments_report_id_idx" ON "wbs_comments"("report_id");

-- CreateIndex
CREATE INDEX "wbs_forward_logs_report_id_idx" ON "wbs_forward_logs"("report_id");

-- CreateIndex
CREATE INDEX "board_member_suspensions_user_id_idx" ON "board_member_suspensions"("user_id");
CREATE INDEX "board_member_suspensions_status_idx" ON "board_member_suspensions"("status");

-- AddForeignKey
ALTER TABLE "wbs_reports" ADD CONSTRAINT "wbs_reports_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wbs_reports" ADD CONSTRAINT "wbs_reports_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_comments" ADD CONSTRAINT "wbs_comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "wbs_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wbs_comments" ADD CONSTRAINT "wbs_comments_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_forward_logs" ADD CONSTRAINT "wbs_forward_logs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "wbs_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wbs_forward_logs" ADD CONSTRAINT "wbs_forward_logs_forwarded_by_id_fkey" FOREIGN KEY ("forwarded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wbs_forward_logs" ADD CONSTRAINT "wbs_forward_logs_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_member_suspensions" ADD CONSTRAINT "board_member_suspensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "board_member_suspensions" ADD CONSTRAINT "board_member_suspensions_suspended_by_id_fkey" FOREIGN KEY ("suspended_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "board_member_suspensions" ADD CONSTRAINT "board_member_suspensions_plh_user_id_fkey" FOREIGN KEY ("plh_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "board_member_suspensions" ADD CONSTRAINT "board_member_suspensions_lifted_by_id_fkey" FOREIGN KEY ("lifted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
