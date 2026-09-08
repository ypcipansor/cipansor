-- CreateEnum
CREATE TYPE "StudentCardStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "student_card_state" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "status" "StudentCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regenerated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "generated_by_id" TEXT,

    CONSTRAINT "student_card_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_card_state_student_id_idx" ON "student_card_state"("student_id");

-- CreateIndex
CREATE INDEX "student_card_state_status_idx" ON "student_card_state"("status");
