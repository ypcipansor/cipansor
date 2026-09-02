import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';

/** Well-known UUID for the seeded SYSTEM user (see prisma/seed.ts) */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export class TalentaService {
  // ==================== TALENT PROFILES ====================

  async createProfile(data: {
    userId: string;
    unitId: string;
    currentRole: string;
    category?: 'HIGH_POTENTIAL' | 'KEY_TALENT' | 'EMERGING' | 'SOLID_PERFORMER' | 'NEEDS_DEVELOPMENT';
    potentialRole?: string;
    readinessLevel?: string;
    strengths?: string;
    developmentAreas?: string;
    careerAspiration?: string;
  }) {
    return prisma.talentProfile.create({
      data: {
        user: { connect: { id: data.userId } },
        unitRel: { connect: { id: data.unitId } },
        currentRole: data.currentRole,
        category: data.category,
        potentialRole: data.potentialRole,
        readinessLevel: data.readinessLevel,
        strengths: data.strengths,
        developmentAreas: data.developmentAreas,
        careerAspiration: data.careerAspiration,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        unitRel: { select: { id: true, name: true } },
      },
    });
  }

  async getProfiles(unitId: string | undefined, query: { category?: string }) {
    const where: Prisma.TalentProfileWhereInput = unitId ? { unitId } : {};
    if (query.category) where.category = query.category as any;

    return prisma.talentProfile.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        unitRel: { select: { id: true, name: true } },
        assessments: {
          orderBy: { assessedAt: 'desc' },
          take: 1,
          select: { performanceRating: true, potentialRating: true, overallScore: true, assessedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProfileById(id: string) {
    return prisma.talentProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        unitRel: { select: { id: true, name: true } },
        assessments: {
          include: { assessor: { select: { id: true, name: true } } },
          orderBy: { assessedAt: 'desc' },
        },
        succession: true,
      },
    });
  }

  async getProfileByUserId(userId: string) {
    return prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true, unitId: true },
    });
  }

  async updateProfile(id: string, data: Prisma.TalentProfileUpdateInput) {
    return prisma.talentProfile.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  async deleteProfile(id: string) {
    return prisma.talentProfile.delete({ where: { id } });
  }

  // ==================== ASSESSMENTS ====================

  async createAssessment(data: {
    talentId: string;
    assessorId: string;
    period: string;
    performanceRating: 'OUTSTANDING' | 'EXCEEDS' | 'MEETS' | 'BELOW' | 'UNSATISFACTORY';
    potentialRating: 'OUTSTANDING' | 'EXCEEDS' | 'MEETS' | 'BELOW' | 'UNSATISFACTORY';
    overallScore: number;
    competencies?: any;
    feedback?: string;
    developmentPlan?: string;
    assessedAt: string;
  }) {
    const assessment = await prisma.talentAssessment.create({
      data: {
        talent: { connect: { id: data.talentId } },
        assessor: { connect: { id: data.assessorId } },
        period: data.period,
        performanceRating: data.performanceRating,
        potentialRating: data.potentialRating,
        overallScore: data.overallScore,
        competencies: data.competencies,
        feedback: data.feedback,
        developmentPlan: data.developmentPlan,
        assessedAt: new Date(data.assessedAt),
      },
      include: {
        assessor: { select: { id: true, name: true } },
      },
    });

    // Update talent profile with latest assessment info
    const newCategory = this.determineTalentCategory(data.performanceRating, data.potentialRating);
    await prisma.talentProfile.update({
      where: { id: data.talentId },
      data: {
        category: newCategory,
        lastAssessedAt: new Date(data.assessedAt),
      },
    });

    return assessment;
  }

  // ==================== TRAINING PROGRAMS ====================

  async createTraining(data: {
    title: string;
    description?: string;
    category: string;
    trainer?: string;
    startDate?: string;
    endDate?: string;
    maxParticipants?: number;
    budget?: number;
    location?: string;
    unitId: string;
    createdById: string;
  }) {
    return prisma.trainingProgram.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        trainer: data.trainer,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        maxParticipants: data.maxParticipants,
        budget: data.budget ? new Prisma.Decimal(data.budget) : undefined,
        location: data.location,
        unitRel: { connect: { id: data.unitId } },
        createdBy: { connect: { id: data.createdById } },
      },
      include: {
        unitRel: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        enrollments: { select: { id: true, userId: true, status: true } },
      },
    });
  }

  async getTrainings(unitId: string | undefined, query: { status?: string }) {
    const where: Prisma.TrainingProgramWhereInput = unitId ? { unitId } : {};
    if (query.status) where.status = query.status as any;

    return prisma.trainingProgram.findMany({
      where,
      include: {
        unitRel: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        enrollments: { select: { id: true, userId: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTrainingById(id: string) {
    return prisma.trainingProgram.findUnique({
      where: { id },
      include: {
        unitRel: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        enrollments: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }

  async updateTraining(id: string, data: any) {
    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);
    if (data.budget !== undefined) updateData.budget = new Prisma.Decimal(data.budget);

    return prisma.trainingProgram.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteTraining(id: string) {
    return prisma.trainingProgram.delete({ where: { id } });
  }

  async enrollUser(programId: string, userId: string) {
    return prisma.trainingEnrollment.create({
      data: {
        program: { connect: { id: programId } },
        user: { connect: { id: userId } },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  // ==================== SUCCESSION PLANNING ====================

  async createSuccession(data: {
    positionTitle: string;
    currentHolderId?: string | null;
    successorId?: string | null;
    readinessLevel?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    notes?: string;
    targetDate?: string;
    unitId: string;
  }) {
    return prisma.successionPlan.create({
      data: {
        positionTitle: data.positionTitle,
        currentHolder: data.currentHolderId ? { connect: { id: data.currentHolderId } } : undefined,
        successor: data.successorId ? { connect: { id: data.successorId } } : undefined,
        readinessLevel: data.readinessLevel,
        priority: data.priority,
        notes: data.notes,
        targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
        unitRel: { connect: { id: data.unitId } },
      },
      include: {
        currentHolder: { select: { id: true, name: true } },
        successor: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async getSuccessions(unitId: string | undefined) {
    return prisma.successionPlan.findMany({
      where: unitId ? { unitId } : {},
      include: {
        currentHolder: { select: { id: true, name: true } },
        successor: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSuccessionById(id: string) {
    return prisma.successionPlan.findUnique({
      where: { id },
      include: {
        currentHolder: { select: { id: true, name: true } },
        successor: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  }

  /**
   * Automatically suggest potential successors based on Talent Matrix.
   * Enhanced algorithm that considers keyword matches, training completion,
   * Sharia certification bonuses, and organizational position requirements.
   */
  async suggestSuccessors(positionTitle: string, unitId: string | undefined, targetPositionId?: string) {
    // 1. Fetch target position requirements if provided
    let targetRequirements: string[] = [];
    let targetRequirementLevels: Record<string, number> = {};

    if (targetPositionId) {
      const position = await prisma.orgPosition.findUnique({
        where: { id: targetPositionId },
        select: { requirements: true }
      });

      if (position?.requirements) {
        try {
          const parsed = JSON.parse(position.requirements);
          if (Array.isArray(parsed)) {
            targetRequirements = parsed.map(r => String(r).trim());
          } else if (typeof parsed === 'object' && parsed !== null) {
            targetRequirements = Object.keys(parsed).map(r => r.trim());
            targetRequirementLevels = Object.fromEntries(
              Object.entries(parsed).map(([k, v]) => [k.trim(), Number(v) || 4])
            );
          }
        } catch {
          targetRequirements = position.requirements.split(',').map(r => r.trim());
        }
      }
    }

    // 2. Fetch ALL eligible talent profiles with their latest assessment and trainings
    const topTalents = await prisma.talentProfile.findMany({
      where: {
        ...(unitId ? { unitId } : {}),
        category: { in: ['HIGH_POTENTIAL', 'KEY_TALENT', 'EMERGING'] },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            trainingEnrollments: {
              where: { status: 'COMPLETED' },
              select: { id: true, program: { select: { title: true, category: true } } },
            },
          },
        },
        assessments: {
          orderBy: { assessedAt: 'desc' },
          take: 1,
          select: { competencies: true, overallScore: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
    });

    // 3. Score and rank candidates
    const positionKeywords = positionTitle
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    return topTalents.map((t) => {
      // a. Keyword Match Score (up to 10 pts)
      const roleWords = (t.currentRole || '').toLowerCase();
      const keywordMatches = positionKeywords.filter((kw) => roleWords.includes(kw)).length;
      const keywordBonus = positionKeywords.length > 0
        ? Math.round((keywordMatches / positionKeywords.length) * 10)
        : 0;

      // b. Training Bonus (up to 15 pts)
      const completedTrainings = t.user.trainingEnrollments?.length || 0;
      const trainingBonus = Math.min(15, completedTrainings * 5);

      // c. Sharia Match Bonus (10 pts)
      const hasShariaTraining = t.user.trainingEnrollments?.some((te: any) =>
        te.program?.category?.toLowerCase().includes('syariah') ||
        te.program?.title?.toLowerCase().includes('syariah')
      );
      const shariaBonus = hasShariaTraining ? 10 : 0;

      // d. Competency Gap Score (up to 25 pts)
      let competencyScore = 0;
      if (targetRequirements.length > 0) {
        const userCompetencies = (t.assessments[0]?.competencies as any) || {};
        const gaps = targetRequirements.map(req => {
          const userLevel = userCompetencies[req] ?? 0;
          const targetLevel = targetRequirementLevels[req] || 4;
          return Math.max(0, targetLevel - userLevel);
        });
        const averageGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
        competencyScore = Math.max(0, 25 - (averageGap * 5));
      }

      // e. Base Score by Category - aligned with organization standards
      const baseScore = t.category === 'HIGH_POTENTIAL' ? 80 : t.category === 'KEY_TALENT' ? 70 : 60;

      const totalMatchScore = Math.min(
        100,
        baseScore + keywordBonus + trainingBonus + shariaBonus + (competencyScore || 0)
      );

      // Show the working. Every component except the base was silently zero in
      // production — no completed trainings, no position requirements on
      // record — so the total was just the category base and came back
      // identical for "Kepala Sekolah", "Tukang Kebun" and a nonsense string
      // alike, under a badge reading "AI Powered Recommendations". A number
      // that cannot vary with the question is not an answer to it, and a
      // succession decision is not a place to imply precision that isn't
      // there. The caller now gets the parts and what was missing, so the UI
      // can say "belum bisa dinilai" instead of drawing a confident bar.
      const components = [
        {
          key: 'base',
          label: 'Kategori talenta',
          points: baseScore,
          max: 80,
          basis: t.category.replace(/_/g, ' '),
          available: true,
        },
        {
          key: 'roleRelevance',
          label: 'Relevansi peran saat ini',
          points: keywordBonus,
          max: 10,
          basis: t.currentRole || 'peran saat ini belum dicatat',
          available: Boolean(t.currentRole),
        },
        {
          key: 'training',
          label: 'Pelatihan diselesaikan',
          points: trainingBonus,
          max: 15,
          basis: `${completedTrainings} pelatihan selesai`,
          available: completedTrainings > 0,
        },
        {
          key: 'sharia',
          label: 'Pelatihan syariah',
          points: shariaBonus,
          max: 10,
          basis: hasShariaTraining ? 'terdeteksi' : 'tidak terdeteksi',
          available: completedTrainings > 0,
        },
        {
          key: 'competency',
          label: 'Kesesuaian kompetensi',
          points: Math.round(competencyScore),
          max: 25,
          basis:
            targetRequirements.length > 0
              ? `${targetRequirements.length} syarat jabatan dinilai`
              : 'syarat jabatan belum dicatat',
          available: targetRequirements.length > 0,
        },
      ];

      const missingInputs = components
        .filter((c) => !c.available && c.key !== 'base')
        .map((c) => c.label);

      // True when nothing but the category moved the number, so the total is
      // the base score wearing a percent sign. Deliberately not called
      // "meaningful": this states a fact about the arithmetic rather than
      // passing judgement. The role-keyword part CAN vary with the position —
      // searching "Guru Tetap" would match this candidate — it simply scored
      // zero for every title tried against the current data.
      const scoreReflectsOnlyCategory = !components.some(
        (c) => c.key !== 'base' && c.points > 0
      );

      return {
        talentProfileId: t.id,
        name: t.user.name,
        currentRole: t.currentRole,
        category: t.category,
        // Derived from the category alone — not an independent judgement.
        readiness: t.category === 'HIGH_POTENTIAL' ? 'READY_NOW' : 'READY_IN_1_YEAR',
        readinessBasis: 'kategori talenta',
        matchScore: Math.round(totalMatchScore),
        scoreReflectsOnlyCategory,
        components,
        missingInputs,
        shariaMatch: hasShariaTraining,
        competencyMatch:
          targetRequirements.length > 0 ? Math.round((competencyScore / 25) * 100) : null,
      };
    }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);
  }

  async updateSuccession(id: string, data: any) {
    const updateData: any = { ...data };

    // Convert targetDate if provided
    if (data.targetDate) {
      updateData.targetDate = new Date(data.targetDate);
    } else if (data.targetDate === null) {
      updateData.targetDate = null;
    }

    // Handle relations
    if (data.currentHolderId !== undefined) {
      updateData.currentHolder = data.currentHolderId
        ? { connect: { id: data.currentHolderId } }
        : { disconnect: true };
      delete updateData.currentHolderId;
    }

    if (data.successorId !== undefined) {
      updateData.successor = data.successorId
        ? { connect: { id: data.successorId } }
        : { disconnect: true };
      delete updateData.successorId;
    }

    return prisma.successionPlan.update({
      where: { id },
      data: updateData,
      include: {
        currentHolder: { select: { id: true, name: true } },
        successor: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async deleteSuccession(id: string) {
    return prisma.successionPlan.delete({ where: { id } });
  }

  // ==================== ANALYTICS ====================

  async getCompetencyGap(userId: string, targetPositionId?: string) {
    const userProfile = await prisma.talentProfile.findUnique({
      where: { userId },
      include: {
        assessments: {
          orderBy: { assessedAt: 'desc' },
          take: 1,
        },
        user: {
          include: {
            orgPositions: {
              include: { orgUnit: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!userProfile) throw Errors.notFound('Talent profile');

    const targetPosition = targetPositionId
      ? await prisma.orgPosition.findUnique({ where: { id: targetPositionId } })
      : userProfile.user.orgPositions[0];

    if (!targetPosition || !targetPosition.requirements) {
      return { position: targetPosition?.title || null, gaps: [], matchScore: 100 };
    }

    // Requirements are stored as text (e.g., "Skill A, Skill B") or JSON.
    // If stored as JSON object with levels (e.g., {"Skill A": 3, "Skill B": 5}),
    // use those as per-competency target levels. Otherwise default to 4 (scale of 5).
    let requirements: string[];
    let requirementLevels: Record<string, number> = {};
    try {
      const parsed = JSON.parse(targetPosition.requirements);
      if (Array.isArray(parsed)) {
        requirements = parsed.map((r: any) => String(r).trim());
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Object format: {"Skill A": 3, "Skill B": 5}
        requirements = Object.keys(parsed).map((r) => r.trim());
        requirementLevels = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k.trim(), Number(v) || 4])
        );
      } else {
        requirements = targetPosition.requirements.split(',').map((r) => r.trim());
      }
    } catch {
      requirements = targetPosition.requirements.split(',').map((r) => r.trim());
    }
    requirements = requirements.filter((r) => r.length > 0);

    if (requirements.length === 0) {
      return { position: targetPosition.title, gaps: [], matchScore: 100 };
    }

    const userCompetencies = (userProfile.assessments[0]?.competencies as any) || {};
    const DEFAULT_TARGET_LEVEL = 4; // Default target on a scale of 5

    const gaps = requirements.map((req) => {
      const userLevel = userCompetencies[req] ?? 0;
      const targetLevel = requirementLevels[req] || DEFAULT_TARGET_LEVEL;
      return {
        competency: req,
        userLevel,
        targetLevel,
        gap: targetLevel - userLevel,
      };
    });

    const averageGap = gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length;
    const matchScore = Math.min(100, Math.max(0, 100 - averageGap * 20));

    return {
      position: targetPosition.title,
      gaps,
      matchScore,
    };
  }

  async getTalentAnalytics(unitId: string | undefined) {
    const talentProfiles = await prisma.talentProfile.findMany({
      where: unitId ? { unitId } : {},
      select: {
        id: true,
        category: true,
        currentRole: true,
        user: { select: { id: true, name: true } },
        assessments: {
          orderBy: { assessedAt: 'desc' },
          take: 1,
          select: { performanceRating: true, potentialRating: true, overallScore: true },
        },
      },
    });

    const distribution: Record<string, number> = {
      HIGH_POTENTIAL: 0,
      KEY_TALENT: 0,
      EMERGING: 0,
      SOLID_PERFORMER: 0,
      NEEDS_DEVELOPMENT: 0,
    };

    talentProfiles.forEach((p) => {
      if (p.category && distribution[p.category] !== undefined) {
        distribution[p.category]++;
      }
    });

    const validTotal = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    const total = validTotal;
    const percentages = Object.keys(distribution).reduce((acc, key) => {
      acc[key] = validTotal > 0 ? Math.round((distribution[key] / validTotal) * 100) : 0;
      return acc;
    }, {} as Record<string, number>);

    const ratingToScore: Record<string, number> = {
      OUTSTANDING: 100, EXCEEDS: 80, MEETS: 60, BELOW: 40, UNSATISFACTORY: 20,
    };

    const validCategories = new Set(Object.keys(distribution));

    const profiles = talentProfiles
      .filter((p) => p.category && validCategories.has(p.category))
      .map((p) => {
        const latest = p.assessments[0];
        return {
          id: p.id,
          name: p.user.name,
          currentRole: p.currentRole,
          performanceScore: latest ? (ratingToScore[latest.performanceRating] || 0) : 0,
          potentialScore: latest ? (ratingToScore[latest.potentialRating] || 0) : 0,
          category: p.category || 'SOLID_PERFORMER',
        };
      });

    return {
      total,
      distribution,
      percentages,
      profiles,
    };
  }

  // ==================== HELPERS ====================

  private determineTalentCategory(
    performance: string,
    potential: string
  ): 'HIGH_POTENTIAL' | 'KEY_TALENT' | 'EMERGING' | 'SOLID_PERFORMER' | 'NEEDS_DEVELOPMENT' {
    const perfScore = { OUTSTANDING: 5, EXCEEDS: 4, MEETS: 3, BELOW: 2, UNSATISFACTORY: 1 }[performance] || 3;
    const potScore = { OUTSTANDING: 5, EXCEEDS: 4, MEETS: 3, BELOW: 2, UNSATISFACTORY: 1 }[potential] || 3;
    const combined = perfScore + potScore;

    if (combined >= 9) return 'HIGH_POTENTIAL';
    if (combined >= 7) return 'KEY_TALENT';
    if (combined >= 5) return 'EMERGING';
    if (combined >= 4) return 'SOLID_PERFORMER';
    return 'NEEDS_DEVELOPMENT';
  }
}

export const talentaService = new TalentaService();
