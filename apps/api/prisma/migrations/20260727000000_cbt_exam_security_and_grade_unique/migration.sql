-- AlterTable
ALTER TABLE "exam_attempts" ADD COLUMN "tab_switch_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "exam_security_logs" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_security_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_security_logs_attempt_id_idx" ON "exam_security_logs"("attempt_id");

-- AddForeignKey
ALTER TABLE "exam_security_logs" ADD CONSTRAINT "exam_security_logs_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deduplicate existing grades before creating unique index
-- Deduplicate existing grades before creating unique index (keep the most recent record based on updated_at)
--
-- Best-practice guard (review item H): the dedup below permanently deletes
-- older duplicate grade rows, losing their old score/notes/grader/timestamp.
-- Before deleting, archive every affected row into a backup table so the
-- history is recoverable if it turns out to carry meaningful data.
CREATE TABLE "exam_grade_duplicates_backup" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "exam_id" TEXT,
    "academic_year_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL,
    "percentage" DECIMAL(5,2),
    "letter_grade" TEXT,
    "notes" TEXT,
    "graded_by_id" TEXT NOT NULL,
    "graded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "backed_up_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_grade_duplicates_backup_pkey" PRIMARY KEY ("id")
);

INSERT INTO "exam_grade_duplicates_backup" (
    "id", "student_id", "subject_id", "exam_id", "academic_year_id", "type",
    "score", "max_score", "percentage", "letter_grade", "notes",
    "graded_by_id", "graded_at", "created_at", "updated_at"
)
SELECT g1."id", g1."student_id", g1."subject_id", g1."exam_id", g1."academic_year_id", g1."type",
       g1."score", g1."max_score", g1."percentage", g1."letter_grade", g1."notes",
       g1."graded_by_id", g1."graded_at", g1."created_at", g1."updated_at"
FROM "grades" g1
JOIN "grades" g2
  ON g1."student_id" = g2."student_id"
 AND g1."exam_id" IS NOT NULL
 AND g1."exam_id" = g2."exam_id"
WHERE g1."updated_at" < g2."updated_at"
   OR (g1."updated_at" = g2."updated_at" AND g1."id" > g2."id");

DELETE FROM "grades" g1
USING "grades" g2
WHERE g1.student_id = g2.student_id
  AND g1.exam_id IS NOT NULL
  AND g1.exam_id = g2.exam_id
  AND (
    g1.updated_at < g2.updated_at
    OR (g1.updated_at = g2.updated_at AND g1.id > g2.id)
  );

-- CreateIndex
CREATE UNIQUE INDEX "grades_student_id_exam_id_key" ON "grades"("student_id", "exam_id");
