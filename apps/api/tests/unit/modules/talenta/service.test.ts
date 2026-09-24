import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockTalentProfile,
  mockTalentAssessment,
  mockTrainingProgram,
  mockTrainingEnrollment,
  mockSuccessionPlan,
} = vi.hoisted(() => ({
  mockTalentProfile: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockTalentAssessment: {
    create: vi.fn(),
  },
  mockTrainingProgram: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockTrainingEnrollment: {
    create: vi.fn(),
  },
  mockSuccessionPlan: {
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    talentProfile = mockTalentProfile;
    talentAssessment = mockTalentAssessment;
    trainingProgram = mockTrainingProgram;
    trainingEnrollment = mockTrainingEnrollment;
    successionPlan = mockSuccessionPlan;
  },
  Prisma: {
    Decimal: class {
      constructor(v: number) {
        return v;
      }
    },
  },
}));

vi.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    talentProfile: mockTalentProfile,
    talentAssessment: mockTalentAssessment,
    trainingProgram: mockTrainingProgram,
    trainingEnrollment: mockTrainingEnrollment,
    successionPlan: mockSuccessionPlan,
  },
}));

import { TalentaService } from '../../../../src/modules/talenta/talenta.service';

describe('TalentaService', () => {
  let service: TalentaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TalentaService();
  });

  describe('createProfile', () => {
    it('should create a talent profile', async () => {
      const mockResult = {
        id: 'talent-1',
        currentRole: 'Guru',
        category: 'SOLID_PERFORMER',
        user: { id: 'user-1', name: 'Ahmad', email: 'ahmad@test.com' },
        unitRel: { id: 'unit-1', name: 'Unit A' },
      };

      mockTalentProfile.create.mockResolvedValue(mockResult);

      const result = await service.createProfile({
        userId: 'user-1',
        unitId: 'unit-1',
        currentRole: 'Guru',
      });

      expect(result.currentRole).toBe('Guru');
      expect(result.category).toBe('SOLID_PERFORMER');
    });
  });

  describe('createAssessment', () => {
    it('should create assessment and update talent category to HIGH_POTENTIAL', async () => {
      const mockAssessment = {
        id: 'assess-1',
        performanceRating: 'OUTSTANDING',
        potentialRating: 'OUTSTANDING',
        overallScore: 95,
        assessor: { id: 'admin-1', name: 'Admin' },
      };

      mockTalentAssessment.create.mockResolvedValue(mockAssessment);
      mockTalentProfile.update.mockResolvedValue({});

      const result = await service.createAssessment({
        talentId: 'talent-1',
        assessorId: 'admin-1',
        period: '2025 Semester 1',
        performanceRating: 'OUTSTANDING',
        potentialRating: 'OUTSTANDING',
        overallScore: 95,
        assessedAt: '2025-06-01T00:00:00.000Z',
      });

      expect(result.overallScore).toBe(95);

      // Should update to HIGH_POTENTIAL (5+5=10 >= 9)
      expect(mockTalentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'HIGH_POTENTIAL' }),
        })
      );
    });

    it('should set NEEDS_DEVELOPMENT for low ratings', async () => {
      mockTalentAssessment.create.mockResolvedValue({ id: 'assess-2' });
      mockTalentProfile.update.mockResolvedValue({});

      await service.createAssessment({
        talentId: 'talent-1',
        assessorId: 'admin-1',
        period: '2025 Semester 1',
        performanceRating: 'UNSATISFACTORY',
        potentialRating: 'BELOW',
        overallScore: 30,
        assessedAt: '2025-06-01T00:00:00.000Z',
      });

      // 1+2=3 < 4 → NEEDS_DEVELOPMENT
      expect(mockTalentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'NEEDS_DEVELOPMENT' }),
        })
      );
    });

    it('should set KEY_TALENT for good performance+potential', async () => {
      mockTalentAssessment.create.mockResolvedValue({ id: 'assess-3' });
      mockTalentProfile.update.mockResolvedValue({});

      await service.createAssessment({
        talentId: 'talent-1',
        assessorId: 'admin-1',
        period: '2025 Semester 1',
        performanceRating: 'EXCEEDS',
        potentialRating: 'MEETS',
        overallScore: 75,
        assessedAt: '2025-06-01T00:00:00.000Z',
      });

      // 4+3=7 → KEY_TALENT
      expect(mockTalentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'KEY_TALENT' }),
        })
      );
    });
  });

  describe('createTraining', () => {
    it('should create a training program', async () => {
      const mockResult = {
        id: 'training-1',
        title: 'Pelatihan Kurikulum Merdeka',
        category: 'Pedagogik',
        status: 'PLANNED',
        unitRel: { id: 'unit-1', name: 'Unit A' },
        createdBy: { id: 'user-1', name: 'Admin' },
        enrollments: [],
      };

      mockTrainingProgram.create.mockResolvedValue(mockResult);

      const result = await service.createTraining({
        title: 'Pelatihan Kurikulum Merdeka',
        category: 'Pedagogik',
        unitId: 'unit-1',
        createdById: 'user-1',
      });

      expect(result.title).toBe('Pelatihan Kurikulum Merdeka');
      expect(result.status).toBe('PLANNED');
    });
  });

  describe('enrollUser', () => {
    it('should enroll a user in a training program', async () => {
      const mockResult = {
        id: 'enroll-1',
        user: { id: 'user-2', name: 'Teacher' },
      };

      mockTrainingEnrollment.create.mockResolvedValue(mockResult);

      const result = await service.enrollUser('training-1', 'user-2');

      expect(result.user.name).toBe('Teacher');
      expect(mockTrainingEnrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            program: { connect: { id: 'training-1' } },
            user: { connect: { id: 'user-2' } },
          }),
        })
      );
    });
  });

  describe('createSuccession', () => {
    it('should create a succession plan', async () => {
      const mockResult = {
        id: 'succ-1',
        positionTitle: 'Kepala Sekolah',
        priority: 'HIGH',
        currentHolder: { id: 'user-1', name: 'Current' },
        successor: null,
      };

      mockSuccessionPlan.create.mockResolvedValue(mockResult);

      const result = await service.createSuccession({
        positionTitle: 'Kepala Sekolah',
        currentHolderId: 'user-1',
        priority: 'HIGH',
        unitId: 'unit-1',
      });

      expect(result.positionTitle).toBe('Kepala Sekolah');
    });
  });
});
