-- AlterEnum
-- Add the KILAT level so a naskah whose deadline is the tightest (24 hours,
-- Peraturan ANRI 5/2021) has its own value instead of being recorded as
-- "Segera" and moved one tier later. Existing values are untouched, so rows
-- already written keep their meaning.
ALTER TYPE "LetterUrgency" ADD VALUE 'KILAT' BEFORE 'IMMEDIATE';
