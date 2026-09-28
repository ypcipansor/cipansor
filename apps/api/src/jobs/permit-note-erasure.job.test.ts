import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/permits/permit-doctor-note.service', () => ({
  erasePermitNotes: vi.fn(async () => 3),
}));

import { erasePermitNotes } from '@/modules/permits/permit-doctor-note.service';
import { runPermitNoteErasure } from './permit-note-erasure.job';

describe('runPermitNoteErasure', () => {
  it('erases the notes past their academic year, as of now', async () => {
    const now = new Date('2027-07-01T18:15:00Z');
    await expect(runPermitNoteErasure(now)).resolves.toEqual({ erased: 3 });
    expect(erasePermitNotes).toHaveBeenCalledWith(now);
  });
});
