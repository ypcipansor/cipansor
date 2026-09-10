import { prisma } from '@/lib/prisma';
import {
  GetRaporQuery,
  ListRaporQuery,
  GenerateBatchRaporInput,
  UpdateRaporInput,
  GetLegerQuery,
  LegerItem,
  RaporConfig,
  RaporPesantren,
  TahfidzSummary,
  TakhosusSummary,
  IbadahSummary,
  MuhadhorohSummary,
  MuhadatsahSummary,
  KitabProgressSummary,
  AkhlakSummary,
  AttendanceSummary,
  AcademicSummary,
  getGradeFromScore,
} from './rapor-pesantren.schema';
import type { Prisma } from '@prisma/client';
import { createNotification } from '../notifications/notifications.service';

const DEFAULT_CONFIG: Omit<RaporConfig, 'unitId'> = {
  componentWeights: {
    tahfidz: 20,
    takhosus: 10,
    ibadah: 15,
    muhadhoroh: 15,
    muhadatsah: 15,
    kitabProgress: 15,
    akhlak: 10,
  },
  gradeThresholds: {
    mumtaz: 90,
    jayyidJiddan: 80,
    jayyid: 70,
    maqbul: 60,
  },
  includeAttendance: true,
  includeViolations: true,
  includeRewards: true,
};

export async function getRaporConfig(unitId: string): Promise<RaporConfig> {
  const setting = await prisma.setting.findUnique({
    where: {
      unitId_key: {
        unitId,
        key: 'rapor_pesantren_config',
      },
    },
  });

  if (setting?.value) {
    try {
      const parsed = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
      return { unitId, ...parsed };
    } catch {
      // Fall through to default config if parsing fails
    }
  }

  return { unitId, ...DEFAULT_CONFIG };
}

export async function saveRaporConfig(config: RaporConfig): Promise<RaporConfig> {
  const { unitId, ...configData } = config;

  await prisma.setting.upsert({
    where: {
      unitId_key: {
        unitId,
        key: 'rapor_pesantren_config',
      },
    },
    update: {
      value: configData as unknown as Prisma.InputJsonValue,
    },
    create: {
      unitId,
      key: 'rapor_pesantren_config',
      value: configData as unknown as Prisma.InputJsonValue,
    },
  });

  return config;
}

type StudentWithRelations = Awaited<ReturnType<typeof getStudentWithRelations>>;

async function getStudentWithRelations(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      enrollments: {
        where: { status: 'active' },
        include: { class: true },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
      },
      roomAssignments: {
        where: { isActive: true },
        include: { room: true },
        orderBy: { assignedAt: 'desc' },
        take: 1,
      },
    },
  });

  return student;
}

function formatStudentInfo(student: NonNullable<StudentWithRelations>) {
  const currentClass = student.enrollments[0]?.class;
  const dormRoom = student.roomAssignments[0]?.room;

  return {
    id: student.id,
    name: student.user.name,
    nisn: student.nisn || undefined,
    nik: student.nik || undefined,
    gender: student.gender,
    birthDate: student.birthDate?.toISOString(),
    photo: student.photoUrl || undefined,
    class: currentClass ? { id: currentClass.id, name: currentClass.name } : { id: '', name: '-' },
    dormRoom: dormRoom ? { id: dormRoom.id, name: dormRoom.name } : undefined,
  };
}

async function getTahfidzSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<TahfidzSummary> {
  const records = await prisma.tahfidzRecord.findMany({
    where: {
      studentId,
      recordedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { recordedAt: 'desc' },
  });

  const ziyadahRecords = records.filter((r) => r.activityType === 'ZIYADAH');
  const murojaahRecords = records.filter((r) => r.activityType === 'MUROJAAH');
  const tasmiRecords = records.filter((r) => r.activityType === 'TASMI');

  const totalAyah = ziyadahRecords.reduce((sum, r) => sum + r.totalAyah, 0);
  const uniqueSurah = [...new Set(records.map((r) => r.surahName))];
  const uniqueJuz = [...new Set(records.map((r) => r.juz))];

  const assessmentRecords = records.filter((r) => r.score !== null);
  const averageScore =
    assessmentRecords.length > 0
      ? assessmentRecords.reduce((sum, r) => sum + (r.score || 0), 0) / assessmentRecords.length
      : 70;

  const progressPercentage = Math.min((totalAyah / 6236) * 100, 100);

  const score = averageScore;
  const grade = getGradeFromScore(score, config.gradeThresholds);

  return {
    totalSurah: uniqueSurah.length,
    totalJuz: uniqueJuz.length,
    totalAyah,
    setoranCount: tasmiRecords.length,
    murajaahCount: murojaahRecords.length,
    tasmiCount: tasmiRecords.length,
    averageGrade: grade,
    latestSurah: records[0]?.surahName || '-',
    latestJuz: records[0]?.juz || 0,
    progressPercentage,
    grade,
    score,
    records: records.slice(0, 10).map((r) => ({
      date: r.recordedAt.toISOString(),
      surah: r.surahName,
      juz: r.juz,
      type: r.activityType,
      grade: grade,
    })),
  };
}

export async function getTakhosusSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<TakhosusSummary> {
  const [takhosusEnrollments, simaanExamCount] = await Promise.all([
    prisma.takhosusEnrollment.findMany({
      where: {
        studentId,
        status: 'ACTIVE',
        enrolledAt: {
          lte: endDate,
        },
      },
      include: {
        halaqoh: {
          select: { name: true, isActive: true },
        },
        sanadRecords: {
          where: {
            certifiedAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    }),
    prisma.simaanExam.count({
      where: {
        studentId,
        passed: true,
        examDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    }),
  ]);

  const enrolledHalaqoh = takhosusEnrollments.length;

  if (enrolledHalaqoh === 0) {
    return {
      enrolledHalaqoh: 0,
      totalSessions: 0,
      averageScore: 0,
      grade: 'MUMTAZ',
      score: 100,
      halaqohDetails: [],
      formulaVersion: 2,
      baseScore: 100,
      simaanBonus: 0,
      simaanExamCount: 0,
    };
  }

  let totalSanadScores = 0;
  let totalSessions = 0;

  const halaqohDetails = takhosusEnrollments.map((enr) => {
    const sessionScores = enr.sanadRecords.reduce((sum, s) => {
      let numericScore = 0;
      if (s.grade) {
        const gradeKey = s.grade.toUpperCase().replace(/\s+/g, '_');
        if (gradeKey === 'MUMTAZ') numericScore = 95;
        else if (gradeKey === 'JAYYID_JIDDAN') numericScore = 85;
        else if (gradeKey === 'JAYYID') numericScore = 75;
        else if (gradeKey === 'MAQBUL') numericScore = 65;
        else numericScore = 50;
      }
      return sum + numericScore;
    }, 0);
    const sessions = enr.sanadRecords.length;

    totalSanadScores += sessionScores;
    totalSessions += sessions;

    const avgScore = sessions > 0 ? sessionScores / sessions : 0;

    return {
      halaqohName: enr.halaqoh?.name ?? "-",
      status: enr.status,
      progress: enr.targetJuz ? Math.round((enr.completedJuz / enr.targetJuz) * 100) : 0,
      latestGrade: getGradeFromScore(avgScore, config.gradeThresholds),
      sessionsCount: sessions,
    };
  });

  const averageScore = totalSessions > 0 ? totalSanadScores / totalSessions : 0;

  const baseScore = totalSessions > 0
    ? averageScore
    : takhosusEnrollments.reduce((sum, e) => sum + (e.targetJuz ? Math.round((e.completedJuz / e.targetJuz) * 100) : 0), 0) /
      enrolledHalaqoh;

  const simaanBonus = baseScore > 0 ? Math.min(simaanExamCount * 5, 20) : 0;
  const finalScore = Math.min(100, baseScore + simaanBonus);

  return {
    enrolledHalaqoh,
    totalSessions,
    averageScore,
    grade: getGradeFromScore(finalScore, config.gradeThresholds),
    score: finalScore,
    halaqohDetails,
    formulaVersion: 2,
    baseScore,
    simaanBonus,
    simaanExamCount,
  };
}

async function getIbadahSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<IbadahSummary> {
  const records = await prisma.dailyIbadahRecord.findMany({
    where: {
      studentId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      target: true,
    },
  });

  const totalPoints = records.reduce((sum, r) => sum + r.pointsEarned, 0);
  const bonusPoints = records.reduce((sum, r) => sum + r.bonusEarned, 0);
  const completedRecords = records.filter((r) => r.isCompleted);
  const completionRate = records.length > 0 ? (completedRecords.length / records.length) * 100 : 0;

  const sortedDates = [
    ...new Set(records.filter((r) => r.isCompleted).map((r) => r.date.toISOString().split('T')[0])),
  ]
    .sort()
    .reverse();
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  for (let i = 0; i < sortedDates.length; i++) {
    if (
      i === 0 ||
      new Date(sortedDates[i - 1]).getTime() - new Date(sortedDates[i]).getTime() === 86400000
    ) {
      tempStreak++;
      if (i === 0) currentStreak = tempStreak;
    } else {
      tempStreak = 1;
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  const categoryMap = new Map<string, { points: number; completed: number; total: number }>();
  records.forEach((r) => {
    const cat = r.target?.category || 'OTHER';
    const current = categoryMap.get(cat) || { points: 0, completed: 0, total: 0 };
    categoryMap.set(cat, {
      points: current.points + r.pointsEarned + r.bonusEarned,
      completed: current.completed + (r.isCompleted ? 1 : 0),
      total: current.total + 1,
    });
  });

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    points: data.points,
    completionRate: data.total > 0 ? (data.completed / data.total) * 100 : 0,
  }));

  const score = Math.min(completionRate, 100);
  const grade = getGradeFromScore(score, config.gradeThresholds);

  return {
    totalPoints,
    bonusPoints,
    currentStreak,
    longestStreak,
    completionRate,
    categoryBreakdown,
    grade,
    score,
  };
}

async function getMuhadhorohSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<MuhadhorohSummary> {
  const records = await prisma.muhadhoroh.findMany({
    where: {
      studentId,
      scheduledAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  const completedRecords = records.filter((r) => r.status === 'COMPLETED');
  const totalSessions = records.length;
  const attendedSessions = completedRecords.length;

  const averageScore =
    completedRecords.length > 0
      ? completedRecords.reduce((sum, r) => sum + (r.totalScore || 0), 0) / completedRecords.length
      : 0;

  const themes = [...new Set(records.map((r) => r.topic).filter(Boolean))] as string[];

  const score = averageScore || 70;
  const grade = getGradeFromScore(score, config.gradeThresholds);

  return {
    totalSessions,
    attendedSessions,
    performanceCount: completedRecords.length,
    averageScore,
    themes: themes.slice(0, 5),
    grade,
    score,
    performances: completedRecords.slice(0, 10).map((r) => ({
      date: r.scheduledAt.toISOString(),
      theme: r.topic || '-',
      score: r.totalScore || 0,
      feedback: r.feedback || undefined,
    })),
  };
}

async function getMuhadatsahSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<MuhadatsahSummary> {
  const records = await prisma.muhadatsah.findMany({
    where: {
      studentId,
      scheduledAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  const completedRecords = records.filter((r) => r.status === 'COMPLETED');
  const totalSessions = records.length;
  const attendedSessions = completedRecords.length;

  const averageScore =
    completedRecords.length > 0
      ? completedRecords.reduce((sum, r) => sum + (r.totalScore || 0), 0) / completedRecords.length
      : 0;

  const languages = [...new Set(records.map((r) => r.language).filter(Boolean))] as string[];

  const score = averageScore || 70;
  const grade = getGradeFromScore(score, config.gradeThresholds);

  return {
    totalSessions,
    attendedSessions,
    practiceCount: completedRecords.length,
    averageScore,
    languages: languages.slice(0, 5),
    grade,
    score,
    practices: completedRecords.slice(0, 10).map((r) => ({
      date: r.scheduledAt.toISOString(),
      language: r.language || '-',
      topic: r.topic || '-',
      score: r.totalScore || 0,
      feedback: r.feedback || undefined,
    })),
  };
}

async function getKitabProgressSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<KitabProgressSummary> {
  const progress = await prisma.kitabProgress.findMany({
    where: {
      studentId,
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      kitab: true,
    },
  });

  const totalKitab = progress.length;
  const completedKitab = progress.filter((p) => p.completedAt !== null).length;
  const inProgressKitab = progress.filter(
    (p) => p.completedAt === null && p.currentPage > 0
  ).length;

  const totalPages = progress.reduce((sum, p) => sum + (p.kitab.totalPages || 0), 0);
  const readPages = progress.reduce((sum, p) => sum + (p.currentPage || 0), 0);
  const progressPercentage = totalPages > 0 ? (readPages / totalPages) * 100 : 0;

  const gradeToScore: Record<string, number> = {
    MUMTAZ: 100,
    JAYYID_JIDDAN: 85,
    JAYYID: 75,
    MAQBUL: 65,
    RASIB: 50,
  };

  const gradedProgress = progress.filter((p) => p.grade);
  const averageGradeScore =
    gradedProgress.length > 0
      ? gradedProgress.reduce((sum, p) => sum + (gradeToScore[p.grade || ''] || 0), 0) /
        gradedProgress.length
      : progressPercentage || 70;

  const score = averageGradeScore;
  const grade = getGradeFromScore(score, config.gradeThresholds);

  return {
    totalKitab,
    completedKitab,
    inProgressKitab,
    totalPages,
    readPages,
    progressPercentage,
    grade,
    score,
    kitabList: progress.map((p) => ({
      name: p.kitab.title,
      category: p.kitab.category || '-',
      totalPages: p.kitab.totalPages || 0,
      completedPages: p.currentPage || 0,
      status: p.completedAt ? 'COMPLETED' : p.currentPage > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
    })),
  };
}

async function getAkhlakSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<AkhlakSummary> {
  const violations = config.includeViolations
    ? await prisma.violation.findMany({
        where: {
          studentId,
          occurredAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { occurredAt: 'desc' },
      })
    : [];

  const rewards = config.includeRewards
    ? await prisma.reward.findMany({
        where: {
          studentId,
          givenAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { givenAt: 'desc' },
      })
    : [];

  const violationPoints = violations.reduce((sum, v) => sum + (v.points || 0), 0);
  const rewardPoints = rewards.reduce((sum, r) => sum + (r.points || 0), 0);
  const netPoints = rewardPoints - violationPoints;

  const baseScore = 100;
  const score = Math.max(0, Math.min(100, baseScore - violationPoints + rewardPoints * 0.5));
  const grade = getGradeFromScore(score, config.gradeThresholds);

  let behaviorGrade = 'BAIK';
  if (violationPoints === 0 && rewardPoints > 10) behaviorGrade = 'SANGAT BAIK';
  else if (violationPoints > 20) behaviorGrade = 'PERLU PEMBINAAN';
  else if (violationPoints > 10) behaviorGrade = 'CUKUP';

  return {
    totalViolations: violations.length,
    totalRewards: rewards.length,
    violationPoints,
    rewardPoints,
    netPoints,
    behaviorGrade,
    grade,
    score,
    violations: violations.slice(0, 10).map((v) => ({
      date: v.occurredAt.toISOString(),
      category: v.category,
      description: v.description || '-',
      points: v.points || 0,
    })),
    rewards: rewards.slice(0, 10).map((r) => ({
      date: r.givenAt.toISOString(),
      category: r.category,
      description: r.description || '-',
      points: r.points || 0,
    })),
  };
}

async function getAttendanceSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<AttendanceSummary> {
  if (!config.includeAttendance) {
    return {
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
      sickDays: 0,
      permitDays: 0,
      lateDays: 0,
      attendanceRate: 100,
      grade: 'MUMTAZ',
    };
  }

  const attendances = await prisma.attendance.findMany({
    where: {
      studentId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const totalDays = attendances.length;
  const presentDays = attendances.filter((a) => a.status === 'PRESENT').length;
  const absentDays = attendances.filter((a) => a.status === 'ABSENT').length;
  const sickDays = attendances.filter((a) => a.status === 'SICK').length;
  const permitDays = attendances.filter((a) => a.status === 'EXCUSED').length;
  const lateDays = attendances.filter((a) => a.status === 'LATE').length;

  const attendanceRate = totalDays > 0 ? ((presentDays + lateDays) / totalDays) * 100 : 100;
  const grade = getGradeFromScore(attendanceRate, config.gradeThresholds);

  return {
    totalDays,
    presentDays,
    absentDays,
    sickDays,
    permitDays,
    lateDays,
    attendanceRate,
    grade,
  };
}

export async function getAcademicSummary(
  studentId: string,
  startDate: Date,
  endDate: Date,
  config: RaporConfig
): Promise<AcademicSummary> {
  const grades = await prisma.grade.findMany({
    where: {
      studentId,
      gradedAt: { gte: startDate, lte: endDate },
    },
    include: { subject: { select: { name: true, passingScore: true } } },
    orderBy: { gradedAt: 'asc' },
  });

  if (grades.length === 0) {
    return { averageScore: 0, grade: 'MAQBUL', totalSubjects: 0, subjects: [], monthlyTrend: [] };
  }

  const subjectAgg = new Map<
    string,
    { total: number; count: number; name: string; passingScore: number }
  >();
  const monthAgg = new Map<string, { total: number; count: number }>();

  for (const grade of grades) {
    const entry = subjectAgg.get(grade.subjectId) ?? {
      total: 0,
      count: 0,
      name: grade.subject.name,
      passingScore: Number(grade.subject.passingScore),
    };
    entry.total += Number(grade.score);
    entry.count += 1;
    subjectAgg.set(grade.subjectId, entry);

    const month = grade.gradedAt.toISOString().slice(0, 7);
    const monthEntry = monthAgg.get(month) ?? { total: 0, count: 0 };
    monthEntry.total += Number(grade.score);
    monthEntry.count += 1;
    monthAgg.set(month, monthEntry);
  }

  const subjects = [...subjectAgg.values()].map((subject) => {
    const score = Math.round((subject.total / subject.count) * 100) / 100;
    return {
      subjectName: subject.name,
      score,
      grade: getGradeFromScore(score, config.gradeThresholds),
      isPassing: score >= subject.passingScore,
    };
  });

  const averageScore =
    Math.round((subjects.reduce((sum, s) => sum + s.score, 0) / subjects.length) * 100) / 100;

  const monthlyTrend = [...monthAgg.entries()]
    .map(([month, value]) => ({
      month,
      average: Math.round((value.total / value.count) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    averageScore,
    grade: getGradeFromScore(averageScore, config.gradeThresholds),
    totalSubjects: subjects.length,
    subjects,
    monthlyTrend,
  };
}

export async function generateRaporPesantren(query: GetRaporQuery): Promise<RaporPesantren> {
  const { studentId, academicYearId, semester, unitId } = query;

  const student = await getStudentWithRelations(studentId);

  if (!student) {
    throw new Error('Student not found');
  }

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
  });

  if (!academicYear) {
    throw new Error('Academic year not found');
  }

  const yearStart = new Date(academicYear.startDate);
  const yearEnd = new Date(academicYear.endDate);
  const midPoint = new Date((yearStart.getTime() + yearEnd.getTime()) / 2);

  const startDate = semester === 1 ? yearStart : midPoint;
  const endDate = semester === 1 ? midPoint : yearEnd;

  const config = await getRaporConfig(unitId || student.unitId);

  const [tahfidz, takhosus, ibadah, muhadhoroh, muhadatsah, kitabProgress, akhlak, attendance, academic] =
    await Promise.all([
      getTahfidzSummary(studentId, startDate, endDate, config),
      getTakhosusSummary(studentId, startDate, endDate, config),
      getIbadahSummary(studentId, startDate, endDate, config),
      getMuhadhorohSummary(studentId, startDate, endDate, config),
      getMuhadatsahSummary(studentId, startDate, endDate, config),
      getKitabProgressSummary(studentId, startDate, endDate, config),
      getAkhlakSummary(studentId, startDate, endDate, config),
      getAttendanceSummary(studentId, startDate, endDate, config),
      getAcademicSummary(studentId, startDate, endDate, config),
    ]);

  const weights = config.componentWeights;
  const overallScore =
    (tahfidz.score * weights.tahfidz) / 100 +
    (takhosus.score * weights.takhosus) / 100 +
    (ibadah.score * weights.ibadah) / 100 +
    (muhadhoroh.score * weights.muhadhoroh) / 100 +
    (muhadatsah.score * weights.muhadatsah) / 100 +
    (kitabProgress.score * weights.kitabProgress) / 100 +
    (akhlak.score * weights.akhlak) / 100;

  const overallGrade = getGradeFromScore(overallScore, config.gradeThresholds);

  const existingRapor = await prisma.raporPesantren.findFirst({
    where: {
      studentId,
      academicYearId,
      semester,
    },
  });

  const raporData = {
    studentId,
    unitId: unitId || student.unitId,
    academicYearId,
    semester,
    status: 'DRAFT' as const,
    tahfidzData: tahfidz as unknown as Prisma.InputJsonValue,
    takhosusData: takhosus as unknown as Prisma.InputJsonValue,
    ibadahData: ibadah as unknown as Prisma.InputJsonValue,
    muhadhorohData: muhadhoroh as unknown as Prisma.InputJsonValue,
    muhadatsahData: muhadatsah as unknown as Prisma.InputJsonValue,
    kitabProgressData: kitabProgress as unknown as Prisma.InputJsonValue,
    akhlakData: akhlak as unknown as Prisma.InputJsonValue,
    attendanceData: attendance as unknown as Prisma.InputJsonValue,
    academicData: academic as unknown as Prisma.InputJsonValue,
    overallScore,
    overallGrade,
    generatedAt: new Date(),
  };

  let rapor;
  if (existingRapor) {
    rapor = await prisma.raporPesantren.update({
      where: { id: existingRapor.id },
      data: raporData,
    });
  } else {
    rapor = await prisma.raporPesantren.create({
      data: raporData,
    });
  }

  return {
    id: rapor.id,
    studentId: student.id,
    unitId: rapor.unitId,
    academicYearId,
    semester,
    status: rapor.status as RaporPesantren['status'],
    student: formatStudentInfo(student),
    academicYear: {
      id: academicYear.id,
      name: academicYear.name,
      startDate: academicYear.startDate.toISOString(),
      endDate: academicYear.endDate.toISOString(),
    },
    tahfidz,
    takhosus,
    ibadah,
    muhadhoroh,
    muhadatsah,
    kitabProgress,
    akhlak,
    attendance,
    overallScore,
    overallGrade,
    notes: rapor.notes || undefined,
    headTeacherNotes: rapor.headTeacherNotes || undefined,
    musyrifNotes: rapor.musyrifNotes || undefined,
    principalNotes: rapor.principalNotes || undefined,
    generatedAt: rapor.generatedAt.toISOString(),
    publishedAt: rapor.publishedAt?.toISOString(),
    createdAt: rapor.createdAt.toISOString(),
    updatedAt: rapor.updatedAt.toISOString(),
  };
}

export async function listRaporPesantren(query: ListRaporQuery) {
  const { unitId, classId, academicYearId, semester, status, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.RaporPesantrenWhereInput = {};
  if (unitId) where.unitId = unitId;
  if (academicYearId) where.academicYearId = academicYearId;
  if (semester) where.semester = semester;
  if (status) where.status = status;

  let studentIds: string[] | undefined;
  if (classId) {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId, status: 'active' },
      select: { studentId: true },
    });
    studentIds = enrollments.map((e) => e.studentId);
    where.studentId = { in: studentIds };
  }

  const [rapors, total] = await Promise.all([
    prisma.raporPesantren.findMany({
      where,
      include: {
        student: {
          include: {
            user: true,
            enrollments: {
              where: { status: 'active' },
              include: { class: true },
              take: 1,
            },
          },
        },
        academicYear: true,
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.raporPesantren.count({ where }),
  ]);

  return {
    data: rapors.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: r.student.user.name,
      studentNisn: r.student.nisn,
      studentNik: r.student.nik,
      className: r.student.enrollments[0]?.class?.name,
      academicYearName: r.academicYear.name,
      semester: r.semester,
      status: r.status,
      overallScore: r.overallScore,
      overallGrade: r.overallGrade,
      generatedAt: r.generatedAt,
      publishedAt: r.publishedAt,
    })),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateRaporPesantren(id: string, data: UpdateRaporInput) {
  const result = await prisma.raporPesantren.update({
    where: { id },
    data: {
      ...data,
      publishedAt: data.status === 'PUBLISHED' ? new Date() : undefined,
    },
    include: {
      student: {
        include: {
          parents: {
            include: {
              parent: true,
            },
          },
          user: true,
        },
      },
      academicYear: true,
      unit: true,
    },
  });

  if (data.status === 'PUBLISHED') {
    const parents = result.student.parents;
    const studentName = result.student.user.name;
    const period = result.academicYear.name;
    const semester = result.semester;

    await Promise.all(
      parents.map((p) =>
        createNotification({
          userId: p.parent.id,
          type: 'ACADEMIC',
          priority: 'HIGH',
          recipientType: 'INDIVIDUAL',
          channels: ['IN_APP', 'EMAIL'],
          title: 'Rapor Pesantren Diterbitkan',
          message: `Rapor Pesantren ananda ${studentName} untuk periode ${period} Semester ${semester} telah diterbitkan. Silakan cek di portal wali santri.`,
          link: `/rapor-pesantren/preview?id=${result.id}`,
          data: {
            studentId: result.studentId,
            raporId: result.id,
          },
        })
      )
    );
  }

  return result;
}

export async function generateBatchRaporPesantren(input: GenerateBatchRaporInput) {
  const { unitId, classId, academicYearId, semester, studentIds } = input;

  let studentIdsToProcess: string[] = [];

  if (studentIds && studentIds.length > 0) {
    studentIdsToProcess = studentIds;
  } else if (classId) {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId, status: 'active' },
      select: { studentId: true },
    });
    studentIdsToProcess = enrollments.map((e) => e.studentId);
  } else {
    const students = await prisma.student.findMany({
      where: { unitId, status: 'active' },
      select: { id: true },
    });
    studentIdsToProcess = students.map((s) => s.id);
  }

  const results = await Promise.allSettled(
    studentIdsToProcess.map((studentId) =>
      generateRaporPesantren({
        studentId,
        academicYearId,
        semester,
        unitId,
      })
    )
  );

  const success = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return { total: studentIdsToProcess.length, success, failed };
}

export async function getRaporPesantrenById(id: string): Promise<RaporPesantren | null> {
  const rapor = await prisma.raporPesantren.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          user: true,
          enrollments: {
            where: { status: 'active' },
            include: { class: true },
            take: 1,
          },
          roomAssignments: {
            where: { isActive: true },
            include: { room: true },
            take: 1,
          },
        },
      },
      academicYear: true,
      unit: true,
    },
  });

  if (!rapor) return null;

  const currentClass = rapor.student.enrollments[0]?.class;
  const dormRoom = rapor.student.roomAssignments[0]?.room;

  return {
    id: rapor.id,
    studentId: rapor.studentId,
    unitId: rapor.unitId,
    unit: {
      id: rapor.unit.id,
      name: rapor.unit.name,
      address: rapor.unit.address,
      phone: rapor.unit.phone,
      email: rapor.unit.email,
      website: '',
      logoUrl: rapor.unit.logoUrl,
    },
    academicYearId: rapor.academicYearId,
    semester: rapor.semester,
    status: rapor.status as RaporPesantren['status'],
    student: {
      id: rapor.student.id,
      name: rapor.student.user.name,
      nisn: rapor.student.nisn || undefined,
      nik: rapor.student.nik || undefined,
      gender: rapor.student.gender,
      birthDate: rapor.student.birthDate?.toISOString(),
      photo: rapor.student.photoUrl || undefined,
      class: currentClass
        ? { id: currentClass.id, name: currentClass.name }
        : { id: '', name: '-' },
      dormRoom: dormRoom ? { id: dormRoom.id, name: dormRoom.name } : undefined,
    },
    academicYear: {
      id: rapor.academicYear.id,
      name: rapor.academicYear.name,
      startDate: rapor.academicYear.startDate.toISOString(),
      endDate: rapor.academicYear.endDate.toISOString(),
    },
    tahfidz: rapor.tahfidzData as unknown as TahfidzSummary,
    takhosus: rapor.takhosusData as unknown as TakhosusSummary,
    ibadah: rapor.ibadahData as unknown as IbadahSummary,
    muhadhoroh: rapor.muhadhorohData as unknown as MuhadhorohSummary,
    muhadatsah: rapor.muhadatsahData as unknown as MuhadatsahSummary,
    kitabProgress: rapor.kitabProgressData as unknown as KitabProgressSummary,
    akhlak: rapor.akhlakData as unknown as AkhlakSummary,
    attendance: rapor.attendanceData as unknown as AttendanceSummary,
    academic: (rapor.academicData as unknown as AcademicSummary) ?? undefined,
    overallScore: rapor.overallScore || 0,
    overallGrade: rapor.overallGrade || 'MAQBUL',
    notes: rapor.notes || undefined,
    headTeacherNotes: rapor.headTeacherNotes || undefined,
    musyrifNotes: rapor.musyrifNotes || undefined,
    principalNotes: rapor.principalNotes || undefined,
    generatedAt: rapor.generatedAt.toISOString(),
    publishedAt: rapor.publishedAt?.toISOString(),
    createdAt: rapor.createdAt.toISOString(),
    updatedAt: rapor.updatedAt.toISOString(),
  };
}

export async function getLegerPesantren(query: GetLegerQuery): Promise<LegerItem[]> {
  const { unitId, classId, academicYearId, semester } = query;

  const enrollments = await prisma.classEnrollment.findMany({
    where: {
      classId,
      status: 'active',
    },
    include: {
      student: {
        include: {
          user: true,
        },
      },
    },
    orderBy: {
      student: {
        user: {
          name: 'asc',
        },
      },
    },
  });

  if (enrollments.length === 0) {
    return [];
  }

  const studentIds = enrollments.map((e) => e.studentId);

  const rapors = await prisma.raporPesantren.findMany({
    where: {
      studentId: { in: studentIds },
      academicYearId,
      semester,
    },
  });

  const raporMap = new Map(rapors.map((r) => [r.studentId, r]));

  const getComponent = (data: unknown) => {
    const typedData = data as { score?: number; grade?: string } | null;
    return {
      score: typeof typedData?.score === 'number' ? typedData.score : 0,
      grade: typeof typedData?.grade === 'string' ? typedData.grade : '-',
    };
  };

  const leger: LegerItem[] = enrollments.map((enrollment) => {
    const student = enrollment.student;
    const rapor = raporMap.get(student.id);

    if (!rapor) {
      return {
        id: '',
        studentId: student.id,
        studentName: student.user.name,
        studentNisn: student.nisn,
        studentNik: student.nik,
        tahfidzScore: 0,
        tahfidzGrade: '-',
        takhosusScore: 0,
        takhosusGrade: '-',
        ibadahScore: 0,
        ibadahGrade: '-',
        muhadhorohScore: 0,
        muhadhorohGrade: '-',
        muhadatsahScore: 0,
        muhadatsahGrade: '-',
        kitabScore: 0,
        kitabGrade: '-',
        akhlakScore: 0,
        akhlakGrade: '-',
        attendanceScore: 0,
        attendanceGrade: '-',
        overallScore: 0,
        overallGrade: '-',
      };
    }

    const tahfidz = getComponent(rapor.tahfidzData);
    const takhosus = getComponent(rapor.takhosusData);
    const ibadah = getComponent(rapor.ibadahData);
    const muhadhoroh = getComponent(rapor.muhadhorohData);
    const muhadatsah = getComponent(rapor.muhadatsahData);
    const kitab = getComponent(rapor.kitabProgressData);
    const akhlak = getComponent(rapor.akhlakData);
    const attendance = getComponent(rapor.attendanceData);

    return {
      id: rapor.id,
      studentId: student.id,
      studentName: student.user.name,
      studentNisn: student.nisn,
      studentNik: student.nik,

      tahfidzScore: tahfidz.score,
      tahfidzGrade: tahfidz.grade,

      takhosusScore: takhosus.score,
      takhosusGrade: takhosus.grade,

      ibadahScore: ibadah.score,
      ibadahGrade: ibadah.grade,

      muhadhorohScore: muhadhoroh.score,
      muhadhorohGrade: muhadhoroh.grade,

      muhadatsahScore: muhadatsah.score,
      muhadatsahGrade: muhadatsah.grade,

      kitabScore: kitab.score,
      kitabGrade: kitab.grade,

      akhlakScore: akhlak.score,
      akhlakGrade: akhlak.grade,

      attendanceScore: attendance.score,
      attendanceGrade: attendance.grade,

      overallScore: rapor.overallScore || 0,
      overallGrade: rapor.overallGrade || '-',
      rank: undefined as number | undefined,
    };
  });

  const sortedByScore = [...leger].sort((a, b) => b.overallScore - a.overallScore);

  sortedByScore.forEach((item, index) => {
    item.rank = index + 1;
  });

  const rankMap = new Map(sortedByScore.map((item) => [item.id, item.rank]));

  return leger.map((item) => ({
    ...item,
    rank: rankMap.get(item.id),
  }));
}

export async function deleteRaporPesantren(id: string) {
  return prisma.raporPesantren.delete({ where: { id } });
}
