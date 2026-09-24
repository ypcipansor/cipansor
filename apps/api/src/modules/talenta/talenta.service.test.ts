import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { talentaService } from './talenta.service';

// Mock external dependencies
vi.mock('../../lib/prisma', () => ({
  prisma: {
    talentProfile: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    talentAssessment: {
      create: vi.fn(),
    },
    trainingProgram: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    trainingEnrollment: {
      create: vi.fn(),
    },
    successionPlan: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

describe('Talenta Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Talent Profiles', () => {
    it('should create a new talent profile', async () => {
      const dto = {
        userId: 'user-1',
        unitId: 'unit-1',
        currentRole: 'Staff IT',
        category: 'EMERGING' as any,
        careerAspiration: 'IT Manager',
      };

      vi.mocked(prisma.talentProfile.create).mockResolvedValue({ id: 'prof-1', ...dto } as any);

      const result = await talentaService.createProfile(dto);

      expect(prisma.talentProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentRole: 'Staff IT',
          careerAspiration: 'IT Manager',
        }),
        include: expect.any(Object),
      });
      expect(result.id).toBe('prof-1');
    });
  });

  describe('suggestSuccessors', () => {
    it('should rank successors with training bonus', async () => {
      const mockProfiles = [
        {
          id: 'prof-1',
          currentRole: 'Teacher',
          category: 'HIGH_POTENTIAL',
          user: {
            id: 'user-1',
            name: 'High Potential Trained',
            trainingEnrollments: [{ id: 'enr-1' }, { id: 'enr-2' }], // 2 completed trainings
          },
        },
        {
          id: 'prof-2',
          currentRole: 'Teacher',
          category: 'HIGH_POTENTIAL',
          user: {
            id: 'user-2',
            name: 'High Potential Untrained',
            trainingEnrollments: [],
          },
        },
      ];

      vi.mocked(prisma.talentProfile.findMany).mockResolvedValue(mockProfiles as any);

      const result = await talentaService.suggestSuccessors('Teacher', 'unit-1');

      // Both are HIGH_POTENTIAL (base 80)
      // prof-1 has 2 trainings => 10 bonus, 'Teacher' match => 10 bonus => 100
      // prof-2 has 0 trainings => 0 bonus, 'Teacher' match => 10 bonus => 90
      expect(result[0].name).toBe('High Potential Trained');
      expect(result[0].matchScore).toBe(100);
      expect(result[1].name).toBe('High Potential Untrained');
      expect(result[1].matchScore).toBe(90);
    });

    it('flags the score as category-only when nothing else contributed', async () => {
      // Production state: one talent profile, no completed trainings, no
      // position requirements on record. Every component except the category
      // base scored zero, so "Kepala Sekolah", "Tukang Kebun" and a nonsense
      // string all returned the same 80 under an "AI Powered Recommendations"
      // badge. A number that cannot vary with the question is not an answer to
      // it, and the caller has to be able to tell.
      vi.mocked(prisma.talentProfile.findMany).mockResolvedValue([
        {
          id: 'prof-1',
          currentRole: 'Guru Tetap SMP IT / Wali Kelas 7A',
          category: 'HIGH_POTENTIAL',
          user: { id: 'user-1', name: 'Ustadz Ahmad', trainingEnrollments: [] },
          assessments: [],
        },
      ] as any);

      const result = await talentaService.suggestSuccessors('Tukang Kebun', 'unit-1');

      expect(result[0].scoreReflectsOnlyCategory).toBe(true);
      expect(result[0].missingInputs).toContain('Pelatihan diselesaikan');
      expect(result[0].missingInputs).toContain('Kesesuaian kompetensi');
      // competencyMatch must stay null, never 0 — "0%" reads as measured.
      expect(result[0].competencyMatch).toBeNull();
      // The breakdown has to show the base was the only contributor.
      const contributing = result[0].components.filter(
        (c: { key: string; points: number }) => c.key !== 'base' && c.points > 0
      );
      expect(contributing).toEqual([]);
    });

    it('stops being category-only once a real input contributes', async () => {
      vi.mocked(prisma.talentProfile.findMany).mockResolvedValue([
        {
          id: 'prof-1',
          currentRole: 'Guru Tetap SMP IT',
          category: 'HIGH_POTENTIAL',
          user: {
            id: 'user-1',
            name: 'Ustadz Ahmad',
            trainingEnrollments: [
              { id: 'e1', program: { title: 'Manajemen Sekolah', category: 'LEADERSHIP' } },
            ],
          },
          assessments: [],
        },
      ] as any);

      const result = await talentaService.suggestSuccessors('Kepala Sekolah', 'unit-1');

      expect(result[0].scoreReflectsOnlyCategory).toBe(false);
      expect(result[0].missingInputs).not.toContain('Pelatihan diselesaikan');
    });
  });

  describe('Assessments', () => {
    it('should create assessment and update profile category correctly', async () => {
      const dto = {
        talentId: 'prof-1',
        assessorId: 'user-2',
        period: 'Q1 2026',
        performanceRating: 'OUTSTANDING' as any, // 5
        potentialRating: 'EXCEEDS' as any, // 4 => sum = 9 => HIGH_POTENTIAL
        overallScore: 90,
        assessedAt: new Date().toISOString(),
      };

      vi.mocked(prisma.talentAssessment.create).mockResolvedValue({ id: 'assess-1' } as any);
      vi.mocked(prisma.talentProfile.update).mockResolvedValue({} as any);

      await talentaService.createAssessment(dto);

      expect(prisma.talentAssessment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          period: 'Q1 2026',
          overallScore: 90,
        }),
        include: expect.any(Object),
      });

      expect(prisma.talentProfile.update).toHaveBeenCalledWith({
        where: { id: 'prof-1' },
        data: expect.objectContaining({
          category: 'HIGH_POTENTIAL',
          lastAssessedAt: expect.any(Date),
        }),
      });
    });

    it('should calculate category based on internal logic', async () => {
      const dto = {
        talentId: 'prof-1',
        assessorId: 'user-2',
        period: 'Q1 2026',
        performanceRating: 'MEETS' as any, // 3
        potentialRating: 'BELOW' as any, // 2 => sum = 5 => EMERGING
        overallScore: 70,
        assessedAt: new Date().toISOString(),
      };

      vi.mocked(prisma.talentAssessment.create).mockResolvedValue({ id: 'assess-2' } as any);
      vi.mocked(prisma.talentProfile.update).mockResolvedValue({} as any);

      await talentaService.createAssessment(dto);

      expect(prisma.talentProfile.update).toHaveBeenCalledWith({
        where: { id: 'prof-1' },
        data: expect.objectContaining({
          category: 'EMERGING',
        }),
      });
    });
  });

  describe('Training Programs', () => {
    it('should enroll user in training program', async () => {
      vi.mocked(prisma.trainingEnrollment.create).mockResolvedValue({ id: 'enr-1' } as any);

      await talentaService.enrollUser('prog-1', 'user-1');

      expect(prisma.trainingEnrollment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          program: { connect: { id: 'prog-1' } },
          user: { connect: { id: 'user-1' } },
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('Unit scoping on reads', () => {
    it('getSuccessions filters by unit when a unitId is given', async () => {
      vi.mocked(prisma.successionPlan.findMany).mockResolvedValue([] as any);

      await talentaService.getSuccessions('unit-1');

      expect(prisma.successionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unitId: 'unit-1' } })
      );
    });

    it('getSuccessions returns the cross-unit view when unitId is undefined (global super admin)', async () => {
      vi.mocked(prisma.successionPlan.findMany).mockResolvedValue([] as any);

      await talentaService.getSuccessions(undefined);

      expect(prisma.successionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it('getProfiles omits the unit filter when unitId is undefined', async () => {
      vi.mocked(prisma.talentProfile.findMany).mockResolvedValue([] as any);

      await talentaService.getProfiles(undefined, {});

      expect(prisma.talentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it('getTrainings omits the unit filter when unitId is undefined', async () => {
      vi.mocked(prisma.trainingProgram.findMany).mockResolvedValue([] as any);

      await talentaService.getTrainings(undefined, {});

      expect(prisma.trainingProgram.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });
  });

  describe('Succession Planning', () => {
    it('should create succession plan', async () => {
      const dto = {
        positionTitle: 'Kepala Sekolah',
        currentHolderId: 'user-1',
        successorId: 'user-2',
        readinessLevel: 'READY_IN_1_YEAR',
        priority: 'HIGH' as any,
        unitId: 'unit-1',
      };

      vi.mocked(prisma.successionPlan.create).mockResolvedValue({ id: 'succ-1', ...dto } as any);

      await talentaService.createSuccession(dto);

      expect(prisma.successionPlan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          positionTitle: 'Kepala Sekolah',
          currentHolder: { connect: { id: 'user-1' } },
          successor: { connect: { id: 'user-2' } },
        }),
        include: expect.any(Object),
      });
    });

    it('should create succession plan with null holder/successor (none selected in dialog)', async () => {
      vi.mocked(prisma.successionPlan.create).mockResolvedValue({ id: 'succ-2' } as any);

      await talentaService.createSuccession({
        positionTitle: 'Kepala TU',
        currentHolderId: null,
        successorId: null,
        unitId: 'unit-1',
      });

      expect(prisma.successionPlan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          positionTitle: 'Kepala TU',
          currentHolder: undefined,
          successor: undefined,
        }),
        include: expect.any(Object),
      });
    });

    it('should update succession plan and handle relations', async () => {
      const updateDto = {
        positionTitle: 'Direktur Utama',
        currentHolderId: 'user-3',
        successorId: null, // this should cause disconnect
      };

      vi.mocked(prisma.successionPlan.update).mockResolvedValue({
        id: 'succ-1',
        ...updateDto,
      } as any);

      await talentaService.updateSuccession('succ-1', updateDto);

      expect(prisma.successionPlan.update).toHaveBeenCalledWith({
        where: { id: 'succ-1' },
        data: expect.objectContaining({
          positionTitle: 'Direktur Utama',
          currentHolder: { connect: { id: 'user-3' } },
          successor: { disconnect: true },
        }),
        include: expect.any(Object),
      });
    });
  });
});
