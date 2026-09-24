import { prisma } from '@/lib/prisma';

/**
 * Lead Scoring Service
 * Optimized implementation to avoid N+1 queries.
 */
export async function calculateLeadScores(registrantIds: string[]) {
  const registrants = await prisma.registrant.findMany({
    where: { id: { in: registrantIds } },
    include: {
      interactions: true,
      _count: { select: { documents: true } },
    },
  });

  return registrants.map((reg) => {
    let score = 0;

    // 1. Interaction History
    const interactionCount = reg.interactions.length;
    score += Math.min(20, interactionCount * 5);
    if (reg.interactions.some((i) => i.type === 'VISIT')) score += 15;

    // 2. Test Scores
    if (reg.testScore) score += Number(reg.testScore) * 0.4;
    if (reg.interviewScore) score += Number(reg.interviewScore) * 0.2;

    // 3. Document Completeness
    score += Math.min(15, reg._count.documents * 3);

    // 4. Quran Ability
    if (reg.quranAbility === 'TAHFIDZ') score += 10;
    if ((reg.memorizedJuz || 0) >= 1) score += 5;

    return { registrantId: reg.id, leadScore: Math.round(score) };
  });
}

export async function getPriorityLeads(unitId?: string) {
  const registrants = await prisma.registrant.findMany({
    where: {
      status: { in: ['REGISTERED', 'DOCUMENT_CHECK', 'TEST_SCHEDULED'] },
      ...(unitId && { admissionPeriod: { unitId } }),
    },
    select: { id: true, fullName: true, registrationNo: true, status: true },
    take: 50,
  });

  if (registrants.length === 0) return [];

  const scores = await calculateLeadScores(registrants.map((r) => r.id));
  const scoreMap = new Map(scores.map((s) => [s.registrantId, s.leadScore]));

  return registrants
    .map((reg) => ({ ...reg, leadScore: scoreMap.get(reg.id) || 0 }))
    .sort((a, b) => b.leadScore - a.leadScore);
}
