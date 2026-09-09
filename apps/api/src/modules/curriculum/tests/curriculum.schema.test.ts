import { describe, expect, it } from 'vitest';
import {
  updateSubjectSchema,
  updateLessonPlanSchema,
  updateScheduleSchema,
} from '../curriculum.schema';

describe('curriculum update schemas (partial update must not apply .default())', () => {
  it('updateSubjectSchema keeps only the fields sent (no credits/isActive defaults)', () => {
    expect(updateSubjectSchema.parse({ name: 'Matematika' })).toEqual({
      name: 'Matematika',
    });
  });

  it('updateSubjectSchema with a single field does not reset credits/isActive', () => {
    expect(updateSubjectSchema.parse({})).toEqual({});
    expect(updateSubjectSchema.parse({ code: 'MTK' })).toEqual({ code: 'MTK' });
  });

  it('updateSubjectSchema still applies validation on sent fields', () => {
    expect(updateSubjectSchema.parse({ credits: 5, isActive: false })).toEqual({
      credits: 5,
      isActive: false,
    });
    expect(updateSubjectSchema.safeParse({ credits: 0 }).success).toBe(false);
  });

  it('updateLessonPlanSchema keeps only the fields sent (no duration default)', () => {
    expect(updateLessonPlanSchema.parse({ title: 'Bab 1: Bilangan' })).toEqual({
      title: 'Bab 1: Bilangan',
    });
    expect(updateLessonPlanSchema.parse({})).toEqual({});
  });

  it('updateScheduleSchema keeps only the fields sent (no isActive default)', () => {
    expect(updateScheduleSchema.parse({ room: 'R-01' })).toEqual({ room: 'R-01' });
    expect(updateScheduleSchema.parse({})).toEqual({});
  });
});
