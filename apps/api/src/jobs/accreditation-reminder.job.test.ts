import { describe, it, expect, vi, beforeEach } from 'vitest';

// The accreditation reminder: the kepala and the admin of a unit whose
// certificate ends within 12 months are told once, with the date in words and
// a link to the unit's page; a unit with nobody told is tried again tomorrow.

vi.mock('@/modules/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/modules/units/unit-accreditation.service', () => ({
  accreditationsToRemind: vi.fn(),
  markReminded: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { createNotification } from '@/modules/notifications';
import { accreditationsToRemind, markReminded } from '@/modules/units/unit-accreditation.service';
import { runAccreditationReminder } from './accreditation-reminder.job';

const DUE = {
  id: 'acc-1',
  unitId: 'unit-smp',
  unitName: 'SMP IT Cipansor',
  rating: 'B' as const,
  certificateNumber: '01758/32/SMP/2023',
  decreeNumber: '036/BAN-PDM/SK/2023',
  decreedAt: '2023-08-29',
  validUntil: '2028-08-29',
  issuer: 'BAN-PDM',
  recipients: ['u-kepala', 'u-admin'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createNotification).mockResolvedValue({} as never);
});

describe('runAccreditationReminder', () => {
  it("tells the unit's kepala and admin, then marks it reminded", async () => {
    vi.mocked(accreditationsToRemind).mockResolvedValue([DUE]);
    expect(await runAccreditationReminder()).toEqual({ units: 1, told: 2 });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-kepala',
        type: 'REMINDER',
        title: 'Akreditasi SMP IT Cipansor berakhir 29 Agustus 2028',
        link: '/units/unit-smp',
        channels: ['IN_APP', 'EMAIL'],
      })
    );
    expect(markReminded).toHaveBeenCalledWith(['acc-1'], expect.any(Date));
  });

  it('leaves a unit nobody could be told about for tomorrow', async () => {
    vi.mocked(accreditationsToRemind).mockResolvedValue([{ ...DUE, recipients: [] }]);
    expect(await runAccreditationReminder()).toEqual({ units: 0, told: 0 });
    expect(markReminded).toHaveBeenCalledWith([], expect.any(Date));
  });
});
