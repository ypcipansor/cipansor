import { prisma } from '@/lib/prisma';
import { ScholarshipCriterion } from '@prisma/client';
import { householdIncome, needScore } from '@/utils/household-income';

export class ScholarshipScoringService {
  /**
   * Automatically assess a student's eligibility for a scholarship based on criteria
   */
  async assessRecipient(recipientId: string) {
    const recipient = await prisma.scholarshipRecipient.findUnique({
      where: { id: recipientId },
      include: {
        scholarship: {
          include: {
            criteria: true,
          },
        },
        student: {
          include: {
            user: true,
            tahfidzRecords: {
              orderBy: { recordedAt: 'desc' },
              take: 1,
            },
            grades: {
              take: 10,
              orderBy: { gradedAt: 'desc' },
            },
          },
        },
      },
    });

    if (!recipient) throw new Error('Recipient not found');

    const criteria = recipient.scholarship.criteria;
    const assessments = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const criterion of criteria) {
      const scoreResult = await this.calculateScoreForCriterion(recipient, criterion);
      assessments.push({
        recipientId: recipient.id,
        criterionId: criterion.id,
        value: scoreResult.value.toString(),
        score: scoreResult.score,
      });
      totalScore += scoreResult.score * criterion.weight;
      totalWeight += criterion.weight;
    }

    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Save assessments and total score
    await prisma.$transaction([
      ...assessments.map((a) =>
        prisma.scholarshipAssessment.upsert({
          where: {
            recipientId_criterionId: {
              recipientId: a.recipientId,
              criterionId: a.criterionId,
            },
          },
          update: {
            value: a.value,
            score: a.score,
          },
          create: a,
        })
      ),
      prisma.scholarshipRecipient.update({
        where: { id: recipientId },
        data: { totalScore: normalizedScore },
      }),
    ]);

    return { totalScore: normalizedScore, assessments };
  }

  private async calculateScoreForCriterion(recipient: any, criterion: ScholarshipCriterion) {
    const student = recipient.student;
    let value: string | number = 0;
    let score = 0;

    // Intelligent scoring logic based on criterion name/type
    if (
      criterion.name.toLowerCase().includes('hafalan') ||
      criterion.name.toLowerCase().includes('tahfidz')
    ) {
      // Use latest tahfidz record or total juz
      const lastRecord = student.tahfidzRecords[0];
      value = lastRecord ? lastRecord.juz : 0;
      const target = criterion.targetValue ? parseInt(criterion.targetValue) : 30;
      score = Math.min(100, (Number(value) / target) * 100);
    } else if (
      criterion.name.toLowerCase().includes('akademik') ||
      criterion.name.toLowerCase().includes('nilai')
    ) {
      // Use average of recent grades
      const avgGrade =
        student.grades.length > 0
          ? student.grades.reduce((sum: number, g: any) => sum + Number(g.score), 0) /
            student.grades.length
          : 0;
      value = avgGrade;
      const target = criterion.targetValue ? parseFloat(criterion.targetValue) : 100;
      score = Math.min(100, (Number(value) / target) * 100);
    } else if (criterion.name.toLowerCase().includes('penghasilan')) {
      // Economy status: the poorer the household, the higher the score.
      //
      // This read `student.fatherIncome` alone, which inverted the result for
      // the families the criterion exists to find: a santri whose father has
      // died has no fatherIncome, so they scored 0 — the lowest possible —
      // while a comfortable single-earner family scored higher. It also
      // ignored working mothers entirely. See utils/household-income.
      const income = householdIncome(student);
      value = income.known ? income.bracket : 'UNKNOWN';
      score = needScore(income);
    } else {
      // Default to manual/placeholder
      value = 'MANUAL_REQUIRED';
      score = 0;
    }

    return { value, score };
  }
}

export const scholarshipScoringService = new ScholarshipScoringService();
