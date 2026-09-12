-- AlterEnum
-- Add the EDITED action so an in-place naskah edit is recorded as its own
-- event rather than being (incorrectly) logged as a disposition follow-up.
ALTER TYPE "LetterFlowAction" ADD VALUE 'EDITED';
