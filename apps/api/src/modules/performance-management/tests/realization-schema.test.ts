import { describe, it, expect } from 'vitest';
import { updateIndicatorRealizationSchema } from '@cipansor/shared';

const VALID_INDICATOR_ID = '11111111-1111-4111-8111-111111111111';

describe('updateIndicatorRealizationSchema — realisasi negatif (Bug regresi #4)', () => {
  it('menolak realisasi negatif', () => {
    const parsed = () =>
      updateIndicatorRealizationSchema.parse({
        indicatorId: VALID_INDICATOR_ID,
        realization: -5,
      });
    expect(parsed).toThrowError();
    expect(parsed).toThrowError(/too_small|min/i);
  });

  it('menolak realisasi desimal negatif', () => {
    expect(() =>
      updateIndicatorRealizationSchema.parse({
        indicatorId: VALID_INDICATOR_ID,
        realization: -0.01,
      })
    ).toThrowError();
  });

  it('menerima realisasi nol dan positif', () => {
    const zero = updateIndicatorRealizationSchema.parse({
      indicatorId: VALID_INDICATOR_ID,
      realization: 0,
    });
    const positive = updateIndicatorRealizationSchema.parse({
      indicatorId: VALID_INDICATOR_ID,
      realization: 88.5,
    });
    expect(zero.realization).toBe(0);
    expect(positive.realization).toBe(88.5);
  });
});
