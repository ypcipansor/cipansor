import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { talentaService } from './talenta.service';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    talentProfile: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('Talenta Service Enhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Talent Analytics', () => {
    it('should calculate correct distribution and percentages', async () => {
      const mockProfiles = [
        {
          id: '1',
          category: 'HIGH_POTENTIAL',
          currentRole: 'Teacher',
          user: { id: 'u1', name: 'User 1' },
          assessments: [
            { performanceRating: 'OUTSTANDING', potentialRating: 'OUTSTANDING', overallScore: 100 },
          ],
        },
        {
          id: '2',
          category: 'HIGH_POTENTIAL',
          currentRole: 'Teacher',
          user: { id: 'u2', name: 'User 2' },
          assessments: [
            { performanceRating: 'EXCEEDS', potentialRating: 'EXCEEDS', overallScore: 80 },
          ],
        },
        {
          id: '3',
          category: 'KEY_TALENT',
          currentRole: 'Staff',
          user: { id: 'u3', name: 'User 3' },
          assessments: [],
        },
        {
          id: '4',
          category: 'EMERGING',
          currentRole: 'Staff',
          user: { id: 'u4', name: 'User 4' },
          assessments: [],
        },
        {
          id: '5',
          category: 'SOLID_PERFORMER',
          currentRole: 'Admin',
          user: { id: 'u5', name: 'User 5' },
          assessments: [],
        },
        {
          id: '6',
          category: 'NEEDS_DEVELOPMENT',
          currentRole: 'Admin',
          user: { id: 'u6', name: 'User 6' },
          assessments: [],
        },
        {
          id: '7',
          category: 'INVALID',
          currentRole: 'Other',
          user: { id: 'u7', name: 'User 7' },
          assessments: [],
        }, // Should be ignored
      ];

      vi.mocked(prisma.talentProfile.findMany).mockResolvedValue(mockProfiles as any);

      const result = await talentaService.getTalentAnalytics('unit-1');

      expect(result.total).toBe(6); // INVALID excluded from total
      expect(result.distribution.HIGH_POTENTIAL).toBe(2);
      expect(result.distribution.KEY_TALENT).toBe(1);
      expect(result.percentages.HIGH_POTENTIAL).toBe(33); // 2/6 * 100 (INVALID excluded from denominator)
      expect(result.percentages.NEEDS_DEVELOPMENT).toBe(17); // 1/6 * 100

      // profiles should exclude INVALID category entries
      expect(result.profiles).toHaveLength(6);
      expect(result.profiles.find((p: any) => p.category === 'INVALID')).toBeUndefined();

      // Verify score mapping for profiles with assessments
      const user1 = result.profiles.find((p: any) => p.id === '1')!;
      expect(user1.name).toBe('User 1');
      expect(user1.performanceScore).toBe(100); // OUTSTANDING
      expect(user1.potentialScore).toBe(100); // OUTSTANDING

      // Verify profiles without assessments default to 0
      const user3 = result.profiles.find((p: any) => p.id === '3')!;
      expect(user3.performanceScore).toBe(0);
      expect(user3.potentialScore).toBe(0);
    });

    it('should handle empty profiles', async () => {
      vi.mocked(prisma.talentProfile.findMany).mockResolvedValue([]);

      const result = await talentaService.getTalentAnalytics('unit-1');

      expect(result.total).toBe(0);
      expect(result.distribution.HIGH_POTENTIAL).toBe(0);
      expect(result.percentages.HIGH_POTENTIAL).toBe(0);
      expect(result.profiles).toHaveLength(0);
    });
  });
});
