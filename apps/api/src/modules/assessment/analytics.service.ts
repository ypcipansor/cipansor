import { prisma } from '@/lib/prisma';
import { Errors } from '@/middleware/error';

export class AssessmentAnalyticsService {
  /**
   * Calculate a holistic score for a student.
   * Integrates Academic, Tahfidz, Behavior (Violations), Attendance, and Ibadah.
   */
  static async getStudentHolisticAnalytics(studentId: string, academicYearId: string) {
    // Look up the academic year's date range to scope all queries
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { startDate: true, endDate: true },
    });

    if (!academicYear) {
      throw Errors.notFound(`Academic year with id ${academicYearId}`);
    }

    const yearStart = academicYear.startDate;
    const yearEnd = academicYear.endDate;

    const [
      academicGrades,
      tahfidzProgress,
      violations,
      rewards,
      attendance,
      ibadahPoints,
      examAttempts,
    ] = await Promise.all([
      // 1. Academic: Average of all subject percentages
      prisma.grade.aggregate({
        where: { studentId, academicYearId },
        _avg: { percentage: true },
      }),

      // 2. Tahfidz: Progress against target (cumulative, not year-scoped)
      prisma.tahfidzRecord.aggregate({
        where: { studentId },
        _sum: { totalAyah: true },
        _max: { juz: true },
      }),

      // 3. Behavior (Violations): Total violation points within academic year
      prisma.violation.aggregate({
        where: {
          studentId,
          ...(yearStart && yearEnd ? { occurredAt: { gte: yearStart, lte: yearEnd } } : {}),
        },
        _sum: { points: true },
      }),

      // 3.5 Behavior (Rewards): Total reward points within academic year.
      // The Reward model timestamps points with `givenAt` (not `occurredAt`,
      // which belongs to Violation).
      prisma.reward.aggregate({
        where: {
          studentId,
          ...(yearStart && yearEnd ? { givenAt: { gte: yearStart, lte: yearEnd } } : {}),
        },
        _sum: { points: true },
      }),

      // 4. Attendance: Presence percentage within academic year
      prisma.attendance.groupBy({
        by: ['status'],
        where: {
          studentId,
          class: { academicYearId },
        },
        _count: { _all: true },
      }),

      // 5. Ibadah: Points from daily ibadah records within academic year
      prisma.dailyIbadahRecord.aggregate({
        where: {
          studentId,
          isCompleted: true,
          ...(yearStart && yearEnd ? { date: { gte: yearStart, lte: yearEnd } } : {}),
        },
        _sum: { pointsEarned: true },
      }),

      // 6. CBT Performance: Mastery trends
      prisma.examAttempt.findMany({
        where: {
          studentId,
          exam: { academicYearId },
          status: { in: ['COMPLETED', 'NEEDS_REVIEW'] },
        },
        select: { score: true, exam: { select: { maxScore: true } } },
      }),
    ]);

    // Calculate sub-scores (scaled 0-100)
    // Use null for dimensions without data so consumers can distinguish
    // "no data" from "genuinely scored 0". Only non-null dimensions
    // participate in the weighted holistic score.
    const hasAcademicData = academicGrades._avg.percentage !== null;
    const hasTahfidzData = tahfidzProgress._max.juz !== null;
    const hasRawAttendanceData = attendance.length > 0;
    const hasIbadahData =
      ibadahPoints._sum.pointsEarned !== null && Number(ibadahPoints._sum.pointsEarned) > 0;

    const academicScore = hasAcademicData ? Number(academicGrades._avg.percentage) : null;

    // Tahfidz score: assuming 30 juz is 100% for high level
    const tahfidzScore = hasTahfidzData
      ? Math.min(100, ((tahfidzProgress._max.juz || 0) / 30) * 100)
      : null;

    // Behavior score: starting at 100, subtract violation points and add reward points.
    // Unlike grades or attendance (where records are created per student),
    // behavior events are only recorded when they occur. The absence of
    // records means the student has a neutral/clean record, NOT that they
    // haven't been assessed. Therefore behavior data is always considered
    // present for enrolled students.
    const hasBehaviorData = true;
    const violationPoints = Number(violations._sum.points || 0);
    const rewardPoints = Number(rewards._sum.points || 0);
    // Score is capped at 100 but can go down to 0. Rewards offset violations.
    const behaviorScore = hasBehaviorData
      ? Math.max(0, Math.min(100, 100 - violationPoints + rewardPoints))
      : null;

    // Attendance score
    // SICK and EXCUSED are counted as partial presence (50% weight) since they are
    // legitimate absences that shouldn't penalize students the same as unexcused ones.
    const attMap: any = attendance.reduce(
      (acc: any, curr: any) => ({ ...acc, [curr.status]: curr._count._all }),
      {}
    );
    const totalDays = Object.values(attMap).reduce(
      (a: any, b: any) => (a as number) + (b as number),
      0
    ) as number;
    const presentDays = ((attMap['PRESENT'] as number) || 0) + ((attMap['LATE'] as number) || 0);
    const excusedDays = ((attMap['SICK'] as number) || 0) + ((attMap['EXCUSED'] as number) || 0);
    const hasAttendanceData = hasRawAttendanceData && totalDays > 0;
    const attendanceScore = hasAttendanceData
      ? ((presentDays + excusedDays * 0.5) / totalDays) * 100
      : null;

    // Ibadah score (relative to an arbitrary yearly target of 3000 pts)
    const ibadahScore = hasIbadahData
      ? Math.min(100, (Number(ibadahPoints._sum.pointsEarned) / 3000) * 100)
      : null;

    // 6. CBT Mastery Score
    // Filter out attempts with null scores (edge cases like direct DB updates
    // or migration artifacts) so they don't drag the average to zero.
    // Also guard against zero/missing maxScore: `a.exam.maxScore` is a Prisma
    // Decimal object which is always truthy, so `|| 100` would never fire —
    // we coerce to Number first and then apply the fallback.
    const scoredAttempts = examAttempts.filter((a) => a.score !== null);
    const hasCBTData = scoredAttempts.length > 0;
    // Cap each attempt's ratio at 1.0 so manually-graded essays with bonus
    // points (where score can exceed maxScore) don't push the average above
    // 100, which would inflate the holistic weighted score and break the
    // interpretation thresholds in `getHolisticInterpretation`.
    const cbtScore = hasCBTData
      ? (scoredAttempts.reduce((sum, a) => {
          const max = Number(a.exam.maxScore) || 100;
          return sum + Math.min(1, Number(a.score) / max);
        }, 0) /
          scoredAttempts.length) *
        100
      : null;

    // Holistic Score (Weighted) — only include dimensions that have actual data.
    // This prevents a new student with no records from being scored as 0%.
    const weights: { score: number | null; weight: number }[] = [
      { score: academicScore, weight: 0.25 },
      { score: tahfidzScore, weight: 0.2 },
      { score: behaviorScore, weight: 0.15 },
      { score: attendanceScore, weight: 0.1 },
      { score: ibadahScore, weight: 0.1 },
      { score: cbtScore, weight: 0.2 },
    ];
    const activeWeights = weights.filter((w) => w.score !== null);
    const totalWeight = activeWeights.reduce((sum, w) => sum + w.weight, 0);
    // Re-normalize: divide each weight by totalWeight so partial data is scaled
    // back to 0-100 instead of being penalized for missing dimensions.
    const normalizedScore =
      totalWeight > 0
        ? activeWeights.reduce((sum, w) => sum + w.score! * (w.weight / totalWeight), 0)
        : 0;

    const dimensionsWithData = [
      hasAcademicData,
      hasTahfidzData,
      hasBehaviorData,
      hasAttendanceData,
      hasIbadahData,
      hasCBTData,
    ].filter(Boolean).length;
    const dataCompleteness =
      dimensionsWithData >= 5 ? 'COMPLETE' : dimensionsWithData >= 2 ? 'PARTIAL' : 'INSUFFICIENT';

    const roundOrNull = (v: number | null) => (v !== null ? Math.round(v * 100) / 100 : null);

    // When data is insufficient (only behavior with no other dimensions),
    // return 0 instead of a misleading renormalized score.
    const finalScore =
      dataCompleteness === 'INSUFFICIENT' ? 0 : Math.round(normalizedScore * 100) / 100;

    const baseInterpretation = this.getHolisticInterpretation(finalScore);
    const interpretation =
      dataCompleteness === 'INSUFFICIENT'
        ? 'Dhoif (Perlu Bimbingan/Needs Improvement)'
        : dataCompleteness === 'PARTIAL'
          ? `${baseInterpretation} — Data Sebagian (${dimensionsWithData}/6 dimensi)`
          : baseInterpretation;

    const breakdown = {
      academic: roundOrNull(academicScore),
      tahfidz: roundOrNull(tahfidzScore),
      behavior: roundOrNull(behaviorScore),
      attendance: roundOrNull(attendanceScore),
      ibadah: roundOrNull(ibadahScore),
      cbt: roundOrNull(cbtScore),
    };

    // Boarding School Logic: Integration with Dormitory data for holistic view
    const roomAssignment = await prisma.roomAssignment.findFirst({
      where: { studentId, isActive: true },
      include: { room: { select: { name: true, dormitory: { select: { name: true } } } } },
    });

    return {
      studentId,
      holisticScore: finalScore,
      breakdown,
      dataCompleteness,
      interpretation,
      recommendation: this.generateRecommendation(breakdown, dataCompleteness),
      boardingInfo: roomAssignment
        ? {
            room: roomAssignment.room.name,
            dormitory: roomAssignment.room.dormitory.name,
          }
        : null,
    };
  }

  /**
   * Generate a development recommendation based on the holistic breakdown.
   * This is the single source of truth for recommendation text — the frontend
   * should use the `recommendation` field from the API response instead of
   * duplicating this logic.
   */
  private static generateRecommendation(
    breakdown: Record<string, number | null>,
    dataCompleteness: string
  ): string {
    const genericMessage =
      'Pertahankan prestasi dan terus kembangkan potensi diri di segala aspek.';
    const entries: [string, number][] = Object.entries(breakdown)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, Number(v)] as [string, number]);
    if (entries.length === 0 || dataCompleteness === 'INSUFFICIENT') {
      return genericMessage;
    }
    const lowest = entries.reduce((a, b) => (a[1] <= b[1] ? a : b), entries[0]);

    if (lowest[1] >= 80) {
      return genericMessage;
    }

    const recommendations: Record<string, string> = {
      academic:
        'Fokus pada peningkatan jam belajar mandiri dan konsultasi dengan guru mata pelajaran yang nilainya masih di bawah KKM.',
      tahfidz:
        'Tingkatkan intensitas murojaah harian dan pastikan setoran ziyadah konsisten sesuai target juz per semester.',
      behavior:
        'Perlu bimbingan intensif dalam kedisiplinan dan kepatuhan terhadap tata tertib pesantren.',
      attendance: 'Tingkatkan kedisiplinan dalam kehadiran di kelas dan kegiatan wajib lainnya.',
      ibadah:
        'Meningkatkan kesadaran dalam menjalankan ibadah yaumiyah secara mandiri dan tepat waktu.',
      cbt: 'Latih kemampuan mengerjakan soal ujian berbasis komputer secara berkala untuk meningkatkan ketajaman analisis.',
    };

    return recommendations[lowest[0]] || genericMessage;
  }

  private static getHolisticInterpretation(score: number): string {
    if (score >= 90) return 'Mumtaz (Sangat Baik/Outstanding)';
    if (score >= 80) return 'Jayyid Jiddan (Baik Sekali/Very Good)';
    if (score >= 70) return 'Jayyid (Baik/Good)';
    if (score >= 60) return 'Maqbul (Cukup/Average)';
    return 'Dhoif (Perlu Bimbingan/Needs Improvement)';
  }

  /**
   * Identifies students requiring integrated intervention.
   *
   * Logic: a student is flagged when at least 2 of the per-dimension thresholds
   * trip (academic < 70, behavior < 70, tahfidz < 60). Priority is CRITICAL
   * when all 3 dimension reasons trip, otherwise HIGH.
   *
   * Implementation: this used to call `getStudentHolisticAnalytics` per
   * student (≈6 queries each) inside a `BATCH_SIZE=10` loop. For a unit
   * with N active students that's O(N) DB round-trips and would time out
   * once N reaches the low hundreds. We now run THREE grouped aggregations
   * (grades, violations, tahfidz) scoped to the unit + academic year in a
   * single round-trip each — total cost is O(1) round-trips regardless of
   * student count.
   *
   * Trade-off: this no longer evaluates the `lowHolistic` (overall score
   * < 65) trigger or attendance/ibadah/CBT dimensions, because computing
   * those via grouped queries requires several more aggregations and
   * complicates the holistic re-normalization. The single-student
   * `getStudentHolisticAnalytics` endpoint still surfaces those signals
   * for deep dives; this endpoint is intentionally a fast triage list.
   */
  static async getIntegratedRiskAlerts(unitId: string, academicYearId: string) {
    const students = await prisma.student.findMany({
      where: { unitId, status: 'active' },
      select: { id: true, nisn: true, nik: true, user: { select: { name: true } } },
    });

    if (students.length === 0) return [];

    const studentIds = students.map((s) => s.id);

    // Look up the academic year window so violation aggregation matches the
    // single-student endpoint's scoping behaviour.
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { startDate: true, endDate: true },
    });

    const [gradeAggs, violationAggs, rewardAggs, tahfidzAggs] = await Promise.all([
      // 1. Academic: average percentage per student
      prisma.grade.groupBy({
        by: ['studentId'],
        where: { studentId: { in: studentIds }, academicYearId },
        _avg: { percentage: true },
      }),
      // 2. Behavior (Violations): total violation points per student
      prisma.violation.groupBy({
        by: ['studentId'],
        where: {
          studentId: { in: studentIds },
          ...(academicYear?.startDate && academicYear?.endDate
            ? { occurredAt: { gte: academicYear.startDate, lte: academicYear.endDate } }
            : {}),
        },
        _sum: { points: true },
      }),
      // 2.5 Behavior (Rewards): total reward points per student
      prisma.reward.groupBy({
        by: ['studentId'],
        where: {
          studentId: { in: studentIds },
          ...(academicYear?.startDate && academicYear?.endDate
            ? { givenAt: { gte: academicYear.startDate, lte: academicYear.endDate } }
            : {}),
        },
        _sum: { points: true },
      }),
      // 3. Tahfidz: max juz reached (cumulative — matches per-student logic)
      prisma.tahfidzRecord.groupBy({
        by: ['studentId'],
        where: { studentId: { in: studentIds } },
        _max: { juz: true },
      }),
    ]);

    const academicMap = new Map<string, number | null>(
      gradeAggs.map((g) => [
        g.studentId,
        g._avg.percentage !== null ? Number(g._avg.percentage) : null,
      ])
    );
    const violationMap = new Map<string, number>(
      violationAggs.map((v) => [v.studentId, Number(v._sum.points || 0)])
    );
    const rewardMap = new Map<string, number>(
      rewardAggs.map((r) => [r.studentId, Number(r._sum.points || 0)])
    );
    const tahfidzMap = new Map<string, number | null>(
      tahfidzAggs.map((t) => [t.studentId, t._max.juz])
    );

    const alerts: Array<{
      studentId: string;
      name: string;
      nisn: string | null;
      score: number;
      alerts: string[];
      priority: 'CRITICAL' | 'HIGH';
    }> = [];

    for (const student of students) {
      const academic = academicMap.get(student.id) ?? null;
      const behavior = Math.max(
        0,
        Math.min(100, 100 - (violationMap.get(student.id) || 0) + (rewardMap.get(student.id) || 0))
      );
      const tahfidzJuz = tahfidzMap.get(student.id);
      const tahfidz =
        tahfidzJuz !== null && tahfidzJuz !== undefined
          ? Math.min(100, (tahfidzJuz / 30) * 100)
          : null;

      const reasons: string[] = [];
      if (academic !== null && academic < 70) reasons.push('Akademik Rendah');
      // Behavior is always considered present (no record === clean record),
      // mirroring `hasBehaviorData = true` in `getStudentHolisticAnalytics`.
      if (behavior < 70) reasons.push('Kedisiplinan Rendah');
      if (tahfidz !== null && tahfidz < 60) reasons.push('Tahfidz Lambat');

      if (reasons.length < 2) continue;

      // Surface a representative score so the UI can sort by severity.
      // Use the lowest tripped dimension to highlight the worst signal.
      const dimensionScores: number[] = [];
      if (academic !== null && academic < 70) dimensionScores.push(academic);
      if (behavior < 70) dimensionScores.push(behavior);
      if (tahfidz !== null && tahfidz < 60) dimensionScores.push(tahfidz);
      const score = dimensionScores.length > 0 ? Math.min(...dimensionScores) : behavior;

      alerts.push({
        studentId: student.id,
        name: student.user.name,
        nisn: student.nisn,
        score: Math.round(score * 100) / 100,
        alerts: reasons,
        priority: reasons.length >= 3 ? 'CRITICAL' : 'HIGH',
      });
    }

    return alerts.sort((a, b) => a.score - b.score);
  }

  /**
   * Get education analytics for a unit (aggregated)
   */
  static async getUnitEducationAnalytics(unitId: string, academicYearId: string) {
    const [avgScores, tahfidzStats, enrollmentCount] = await Promise.all([
      // 1. Avg Scores per Subject in Unit
      prisma.grade.groupBy({
        by: ['subjectId'],
        where: { academicYearId, student: { unitId } },
        _avg: { percentage: true },
      }),
      // 2. Tahfidz progress summary for unit
      prisma.tahfidzRecord.aggregate({
        where: { student: { unitId } },
        _avg: { juz: true },
        _count: { id: true },
      }),
      // 3. Student count
      prisma.student.count({
        where: { unitId, status: 'active' },
      }),
    ]);

    return {
      unitId,
      academicYearId,
      studentCount: enrollmentCount,
      averageJuz: Math.round(Number(tahfidzStats._avg.juz || 0) * 10) / 10,
      subjectAverages: avgScores.map((s) => ({
        subjectId: s.subjectId,
        averagePercentage: Math.round(Number(s._avg.percentage || 0) * 100) / 100,
      })),
    };
  }
}
