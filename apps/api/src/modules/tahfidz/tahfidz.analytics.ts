import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  TahfidzRecord,
  QuranProgressMap,
  QuranSurahProgress,
  QuranSurahStatus,
} from '@cipansor/shared';
import { Prisma } from '@prisma/client';

import { QURAN_SURAHS } from './quran-surahs';


export const getQuranProgressMap = async (studentId: string): Promise<QuranProgressMap> => {
  // Execute queries in parallel for optimization
  const [ziyadahRecords, assessmentRecords, murojaahRecords] = await Promise.all([
    // 1. Fetch Ziyadah records (memorization progress)
    prisma.tahfidzRecord.findMany({
      where: {
        studentId,
        activityType: 'ZIYADAH',
      },
      select: {
        surahNumber: true,
        ayahStart: true,
        ayahEnd: true,
        recordedAt: true,
      },
      orderBy: {
        recordedAt: 'desc',
      },
    }),

    // 2. Fetch Assessment records (passed exams)
    prisma.tahfidzRecord.findMany({
      where: {
        studentId,
        activityType: 'ASSESSMENT',
        score: { gte: 75 }, // Passing score
      },
      select: {
        surahNumber: true,
        score: true,
        recordedAt: true,
      },
    }),

    // 3. Fetch Murojaah records (for strength/quality)
    prisma.tahfidzRecord.findMany({
      where: {
        studentId,
        activityType: 'MUROJAAH',
      },
      select: {
        surahNumber: true,
        score: true,
        recordedAt: true,
      },
      orderBy: {
        recordedAt: 'desc',
      },
    }),
  ]);

  // Process data per Surah
  const surahs: QuranSurahProgress[] = QURAN_SURAHS.map((surah) => {
    let status: QuranSurahStatus = 'NOT_STARTED';
    let strength = 0;
    let lastReview: Date | undefined = undefined;

    // Check if fully memorized via Assessment
    const assessment = assessmentRecords.find((r) => r.surahNumber === surah.number);
    if (assessment) {
      status = 'MEMORIZED';
      strength = assessment.score || 100;
      lastReview = assessment.recordedAt;
    }

    // Check Ziyadah coverage if not passed assessment
    if (status !== 'MEMORIZED') {
      const surahZiyadah = ziyadahRecords.filter((r) => r.surahNumber === surah.number);
      if (surahZiyadah.length > 0) {
        // Calculate coverage
        // Simple logic: if max ayahEnd >= surah.verses, consider memorized (or check continuous ranges)
        // For simplicity: Max ayahEnd
        const maxAyah = Math.max(...surahZiyadah.map((r) => r.ayahEnd));
        if (maxAyah >= surah.verses) {
          status = 'MEMORIZED';
        } else {
          status = 'IN_PROGRESS';
        }

        const latestZiyadah = surahZiyadah[0].recordedAt; // already sorted desc
        if (!lastReview || latestZiyadah > lastReview) {
          lastReview = latestZiyadah;
        }
      }
    }

    // Calculate strength from Murojaah
    const recentMurojaah = murojaahRecords
      .filter((r) => r.surahNumber === surah.number)
      .slice(0, 3);
    if (recentMurojaah.length > 0) {
      const avgScore =
        recentMurojaah.reduce((acc, curr) => acc + (curr.score || 0), 0) / recentMurojaah.length;
      strength = avgScore;
      if (recentMurojaah[0].recordedAt > (lastReview || new Date(0))) {
        lastReview = recentMurojaah[0].recordedAt;
      }
    }

    return {
      surahNumber: surah.number,
      surahName: surah.name,
      status,
      strength: Math.round(strength),
      lastReview,
    };
  });

  // Calculate stats
  const totalMemorized = surahs.filter((s) => s.status === 'MEMORIZED').length;
  const totalInProgress = surahs.filter((s) => s.status === 'IN_PROGRESS').length;
  const totalNotStarted = surahs.filter((s) => s.status === 'NOT_STARTED').length;
  const percentage = Math.round((totalMemorized / 114) * 100);

  return {
    studentId,
    surahs,
    stats: {
      totalMemorized,
      totalInProgress,
      totalNotStarted,
      percentage,
    },
  };
};
