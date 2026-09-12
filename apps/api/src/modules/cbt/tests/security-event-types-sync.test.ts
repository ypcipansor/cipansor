import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SecurityEventType } from '@cipansor/shared';

/**
 * The list of exam-integrity event names exists in two places that nothing else
 * ties together: the TypeScript enum in `@cipansor/shared` (what the code may
 * write) and the CHECK constraint on `exam_security_logs.type` (what the database
 * will accept). A value added to one and not the other fails at runtime, on a
 * write that only happens while a student is sitting an exam — the worst possible
 * moment to discover it.
 *
 * This test is the type the two of them do not have. It reads the migration SQL
 * rather than a copy of the list, so it also catches a constraint that was edited
 * directly in a later migration without touching the enum.
 */
const MIGRATION = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260727000000_cbt_exam_security_and_grade_unique/migration.sql'
);

function checkConstraintValues(sql: string): string[] {
  // CONSTRAINT "exam_security_logs_type_check" CHECK ("type" IN ( 'A', 'B', … ))
  const match = sql.match(
    /CONSTRAINT\s+"exam_security_logs_type_check"\s+CHECK\s*\(\s*"type"\s+IN\s*\(([^)]*)\)/i
  );
  if (!match) throw new Error('CHECK constraint exam_security_logs_type_check tidak ditemukan');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('daftar jenis kejadian keamanan ujian', () => {
  it('CHECK di basis data memuat tepat nilai yang sama dengan enum bersama', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const inDatabase = checkConstraintValues(sql).sort();
    const inCode = Object.values(SecurityEventType).sort();

    expect(inDatabase).toEqual(inCode);
  });

  it('nilai yang ditulis oleh sistem sendiri ada di daftar', () => {
    // finishExamAttempt menulis nilai ini ketika jam menutup lembar jawaban.
    expect(Object.values(SecurityEventType)).toContain('TIME_EXPIRED_AUTO_SUBMIT');
  });
});
