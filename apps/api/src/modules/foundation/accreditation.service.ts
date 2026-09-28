import { prisma } from '@/lib/prisma';
import { currentAccreditations } from '@/modules/units';
import { Decimal } from '@prisma/client/runtime/client';

// =====================================
// 8 STANDAR NASIONAL PENDIDIKAN (SNP)
// =====================================

export const SNP_STANDARDS = [
  {
    code: 'SKL',
    name: 'Standar Kompetensi Lulusan',
    description:
      'Kriteria kualifikasi kemampuan lulusan yang mencakup sikap, pengetahuan, dan keterampilan',
    weight: 12.5,
    indicators: [
      { code: 'SKL.1', name: 'Lulusan memiliki kompetensi pada dimensi sikap', maxScore: 25 },
      { code: 'SKL.2', name: 'Lulusan memiliki kompetensi pada dimensi pengetahuan', maxScore: 25 },
      {
        code: 'SKL.3',
        name: 'Lulusan memiliki kompetensi pada dimensi keterampilan',
        maxScore: 25,
      },
      { code: 'SKL.4', name: 'Lulusan memiliki karakter religius dan nasionalis', maxScore: 25 },
    ],
  },
  {
    code: 'SI',
    name: 'Standar Isi',
    description:
      'Kriteria ruang lingkup materi dan tingkat kompetensi untuk mencapai kompetensi lulusan',
    weight: 12.5,
    indicators: [
      { code: 'SI.1', name: 'Kurikulum sesuai ketentuan yang berlaku', maxScore: 25 },
      { code: 'SI.2', name: 'Sekolah memiliki perangkat kurikulum', maxScore: 25 },
      { code: 'SI.3', name: 'Sekolah melaksanakan kurikulum sesuai ketentuan', maxScore: 25 },
      { code: 'SI.4', name: 'Sekolah melaksanakan muatan lokal dan kepesantrenan', maxScore: 25 },
    ],
  },
  {
    code: 'SPR',
    name: 'Standar Proses',
    description:
      'Kriteria mengenai pelaksanaan pembelajaran untuk mencapai standar kompetensi lulusan',
    weight: 12.5,
    indicators: [
      { code: 'SPR.1', name: 'Pembelajaran dilaksanakan secara interaktif', maxScore: 20 },
      { code: 'SPR.2', name: 'Perencanaan pembelajaran tersedia dan sesuai', maxScore: 20 },
      { code: 'SPR.3', name: 'Pelaksanaan pembelajaran sesuai silabus dan RPP', maxScore: 20 },
      { code: 'SPR.4', name: 'Penilaian pembelajaran terlaksana dengan baik', maxScore: 20 },
      { code: 'SPR.5', name: 'Pengawasan pembelajaran terlaksana', maxScore: 20 },
    ],
  },
  {
    code: 'SPE',
    name: 'Standar Penilaian Pendidikan',
    description:
      'Kriteria mengenai mekanisme, prosedur, dan instrumen penilaian hasil belajar peserta didik',
    weight: 12.5,
    indicators: [
      {
        code: 'SPE.1',
        name: 'Penilaian mencakup aspek sikap, pengetahuan, keterampilan',
        maxScore: 25,
      },
      {
        code: 'SPE.2',
        name: 'Teknik penilaian sesuai dengan kompetensi yang dinilai',
        maxScore: 25,
      },
      {
        code: 'SPE.3',
        name: 'Penilaian dilakukan secara terencana dan berkesinambungan',
        maxScore: 25,
      },
      { code: 'SPE.4', name: 'Hasil penilaian dianalisis dan ditindaklanjuti', maxScore: 25 },
    ],
  },
  {
    code: 'SPTK',
    name: 'Standar Pendidik dan Tenaga Kependidikan',
    description:
      'Kriteria pendidikan prajabatan dan kelayakan maupun mental, serta pendidikan dalam jabatan',
    weight: 12.5,
    indicators: [
      { code: 'SPTK.1', name: 'Guru memenuhi kualifikasi akademik', maxScore: 20 },
      { code: 'SPTK.2', name: 'Guru memiliki sertifikat pendidik', maxScore: 20 },
      { code: 'SPTK.3', name: 'Guru memiliki kompetensi pedagogik', maxScore: 20 },
      { code: 'SPTK.4', name: 'Tenaga kependidikan memenuhi kualifikasi', maxScore: 20 },
      { code: 'SPTK.5', name: 'Pengembangan keprofesian berkelanjutan', maxScore: 20 },
    ],
  },
  {
    code: 'SSP',
    name: 'Standar Sarana dan Prasarana',
    description:
      'Kriteria mengenai ruang belajar, tempat berolahraga, tempat beribadah, perpustakaan, laboratorium, dll',
    weight: 12.5,
    indicators: [
      { code: 'SSP.1', name: 'Lahan sekolah memenuhi ketentuan', maxScore: 20 },
      { code: 'SSP.2', name: 'Bangunan sekolah memenuhi ketentuan', maxScore: 20 },
      { code: 'SSP.3', name: 'Ruang kelas dan ruang guru memadai', maxScore: 20 },
      { code: 'SSP.4', name: 'Perpustakaan dan laboratorium tersedia', maxScore: 20 },
      { code: 'SSP.5', name: 'Tempat ibadah dan fasilitas penunjang tersedia', maxScore: 20 },
    ],
  },
  {
    code: 'SPG',
    name: 'Standar Pengelolaan',
    description: 'Kriteria mengenai perencanaan, pelaksanaan, dan pengawasan kegiatan pendidikan',
    weight: 12.5,
    indicators: [
      { code: 'SPG.1', name: 'Visi, misi, dan tujuan sekolah tersedia', maxScore: 20 },
      { code: 'SPG.2', name: 'Rencana kerja sekolah tersedia', maxScore: 20 },
      { code: 'SPG.3', name: 'Struktur organisasi jelas', maxScore: 20 },
      { code: 'SPG.4', name: 'Pelaksanaan kegiatan sesuai rencana', maxScore: 20 },
      { code: 'SPG.5', name: 'Pengawasan dan evaluasi terlaksana', maxScore: 20 },
    ],
  },
  {
    code: 'SPB',
    name: 'Standar Pembiayaan',
    description: 'Kriteria mengenai komponen dan besarnya biaya operasi satuan pendidikan',
    weight: 12.5,
    indicators: [
      { code: 'SPB.1', name: 'Sumber pembiayaan jelas dan terkelola', maxScore: 25 },
      { code: 'SPB.2', name: 'Penggunaan dana sesuai ketentuan', maxScore: 25 },
      { code: 'SPB.3', name: 'Laporan keuangan transparan dan akuntabel', maxScore: 25 },
      { code: 'SPB.4', name: 'Subsidi silang untuk siswa kurang mampu', maxScore: 25 },
    ],
  },
];

// =====================================
// TYPES
// =====================================

interface AccreditationInput {
  unitId: string;
  academicYearId: string;
  assessorId: string;
  assessmentDate: Date;
  assessments: Array<{
    standardCode: string;
    indicatorCode: string;
    score: number;
    evidence: string;
    notes?: string;
  }>;
}

interface AccreditationResult {
  id: string;
  unitId: string;
  academicYearId: string;
  totalScore: number;
  grade: string;
  gradeDescription: string;
  standardScores: Array<{
    standardCode: string;
    standardName: string;
    weight: number;
    rawScore: number;
    weightedScore: number;
    indicators: Array<{
      code: string;
      name: string;
      score: number;
      maxScore: number;
      percentage: number;
      evidence: string;
      notes?: string;
    }>;
  }>;
  recommendations: string[];
  assessedAt: Date;
  assessedBy: string;
}

// =====================================
// HELPER FUNCTIONS
// =====================================

function calculateGrade(score: number): { grade: string; description: string } {
  if (score >= 91) return { grade: 'A', description: 'Unggul' };
  if (score >= 81) return { grade: 'B', description: 'Baik' };
  if (score >= 71) return { grade: 'C', description: 'Cukup' };
  return { grade: 'TT', description: 'Tidak Terakreditasi' };
}

function generateRecommendations(standardScores: AccreditationResult['standardScores']): string[] {
  const recommendations: string[] = [];

  for (const std of standardScores) {
    const percentage = (std.rawScore / 100) * 100;

    if (percentage < 70) {
      recommendations.push(
        `Perbaikan mendesak diperlukan pada ${std.standardName}. Skor saat ini ${percentage.toFixed(1)}% masih di bawah standar minimal.`
      );

      // Add specific indicator recommendations
      for (const ind of std.indicators) {
        if (ind.percentage < 60) {
          recommendations.push(
            `- ${ind.name}: Perlu peningkatan segera (skor ${ind.percentage.toFixed(0)}%)`
          );
        }
      }
    } else if (percentage < 80) {
      recommendations.push(
        `Peningkatan pada ${std.standardName} diperlukan untuk mencapai predikat Baik.`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Pertahankan kinerja yang sudah baik dan terus tingkatkan mutu pendidikan.'
    );
  }

  return recommendations;
}

// =====================================
// SERVICE FUNCTIONS
// =====================================

export async function createAccreditationAssessment(
  input: AccreditationInput
): Promise<AccreditationResult> {
  const { unitId, academicYearId, assessorId, assessmentDate, assessments } = input;

  // Get unit info
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
  });

  if (!unit) {
    throw new Error('Unit tidak ditemukan');
  }

  // Get assessor info
  const assessor = await prisma.user.findUnique({
    where: { id: assessorId },
  });

  if (!assessor) {
    throw new Error('Assessor tidak ditemukan');
  }

  // Calculate scores per standard
  const standardScores: AccreditationResult['standardScores'] = [];

  for (const standard of SNP_STANDARDS) {
    const standardAssessments = assessments.filter((a) => a.standardCode === standard.code);

    const indicators = standard.indicators.map((ind) => {
      const assessment = standardAssessments.find((a) => a.indicatorCode === ind.code);
      const score = assessment?.score ?? 0;
      const percentage = (score / ind.maxScore) * 100;

      return {
        code: ind.code,
        name: ind.name,
        score,
        maxScore: ind.maxScore,
        percentage,
        evidence: assessment?.evidence ?? '',
        notes: assessment?.notes,
      };
    });

    const totalMaxScore = standard.indicators.reduce((sum, ind) => sum + ind.maxScore, 0);
    const rawScore = indicators.reduce((sum, ind) => sum + ind.score, 0);
    const rawPercentage = (rawScore / totalMaxScore) * 100;
    const weightedScore = (rawPercentage * standard.weight) / 100;

    standardScores.push({
      standardCode: standard.code,
      standardName: standard.name,
      weight: standard.weight,
      rawScore: rawPercentage,
      weightedScore,
      indicators,
    });
  }

  // Calculate total score
  const totalScore = standardScores.reduce((sum, std) => sum + std.weightedScore, 0);
  const { grade, description } = calculateGrade(totalScore);

  // Generate recommendations
  const recommendations = generateRecommendations(standardScores);

  // Store assessment in database (using a generic JSON field or create dedicated table)
  // For now, we'll return the result directly

  const result: AccreditationResult = {
    id: `ACC-${unitId}-${academicYearId}`,
    unitId,
    academicYearId,
    totalScore: Math.round(totalScore * 100) / 100,
    grade,
    gradeDescription: description,
    standardScores,
    recommendations,
    assessedAt: assessmentDate,
    assessedBy: assessor.name,
  };

  // A self-assessment is readiness, not accreditation: it used to overwrite
  // the unit's grade, which the EMIS and Dapodik exports and the SKHUN then
  // printed as if BAN-PDM had given it. The grade in force is the certificate
  // on record (decisions/akreditasi-unit.md), and only that.
  return result;
}

export async function getAccreditationStandards() {
  return SNP_STANDARDS;
}

export async function getUnitAccreditationStatus(unitId: string) {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      id: true,
      name: true,
      npsn: true,
    },
  });

  if (!unit) {
    throw new Error('Unit tidak ditemukan');
  }
  const inForce = (await currentAccreditations([unit.id])).get(unit.id);

  // Get teacher statistics for PTK standard
  const teacherStats = await prisma.teacher.aggregate({
    where: { unitId },
    _count: true,
  });

  // Count teachers with NUPTK as proxy for certification
  const certifiedTeachers = await prisma.teacher.count({
    where: {
      unitId,
      nuptk: { not: null },
    },
  });

  // Get student statistics
  const studentStats = await prisma.student.aggregate({
    where: { unitId, status: 'active' },
    _count: true,
  });

  // Dormitory room stats, counted by who sleeps in them.
  //
  // This used to be `dormitory.findMany({ where: { unitId } })`, which credited
  // a unit with an asrama only if that asrama's unit_id named it. Since the
  // asrama is run at foundation level and takes santri from every school, SMP
  // IT was reported as having all the kamar and SD IT none — while SD IT santri
  // slept in them. An asesor asking about asrama facilities means the ones this
  // unit's santri actually occupy, so that is what is counted.
  const occupiedByThisUnit = {
    assignments: {
      some: { isActive: true, student: { unitId, status: 'active' } },
    },
  };

  const totalRooms = await prisma.room.count({
    where: { isActive: true, ...occupiedByThisUnit },
  });

  const dormitoryCount = await prisma.dormitory.count({
    where: {
      deletedAt: null,
      rooms: { some: { isActive: true, ...occupiedByThisUnit } },
    },
  });

  // Get class count
  const classStats = await prisma.class.count({
    where: { unitId },
  });

  // Get financial stats
  const currentYear = new Date().getFullYear();
  const financialStats = await prisma.invoice.aggregate({
    where: {
      student: { unitId },
      createdAt: {
        gte: new Date(`${currentYear}-01-01`),
        lte: new Date(`${currentYear}-12-31`),
      },
    },
    _sum: { amount: true },
  });

  return {
    unit: {
      id: unit.id,
      name: unit.name,
      npsn: unit.npsn,
      /** The certificate in force, if any; never the self-assessment's grade. */
      currentAccreditation: inForce?.rating ?? null,
      accreditationValidUntil: inForce?.validUntil ?? null,
    },
    statistics: {
      teachers: {
        total: teacherStats._count,
        certified: certifiedTeachers,
        certificationRate:
          teacherStats._count > 0 ? Math.round((certifiedTeachers / teacherStats._count) * 100) : 0,
      },
      students: {
        total: studentStats._count,
      },
      facilities: {
        dormitories: dormitoryCount,
        totalRooms,
        classes: classStats,
      },
      finance: {
        annualRevenue: Number(financialStats._sum?.amount ?? 0),
      },
    },
    standards: SNP_STANDARDS.map((std) => ({
      code: std.code,
      name: std.name,
      weight: std.weight,
      indicatorCount: std.indicators.length,
    })),
  };
}

export async function getAccreditationDashboard(unitId: string) {
  const status = await getUnitAccreditationStatus(unitId);

  // Calculate readiness score per standard based on available data
  const readinessScores = SNP_STANDARDS.map((std) => {
    let autoScore = 0;

    switch (std.code) {
      case 'SPTK': // Standar Pendidik dan Tenaga Kependidikan
        autoScore = Math.min(status.statistics.teachers.certificationRate, 100);
        break;
      case 'SPB': // Standar Pembiayaan
        autoScore = status.statistics.finance.annualRevenue > 0 ? 70 : 40;
        break;
      default:
        autoScore = 60; // Default placeholder
    }

    return {
      standardCode: std.code,
      standardName: std.name,
      autoScore,
      needsManualAssessment: autoScore < 70,
    };
  });

  const overallReadiness =
    readinessScores.reduce((sum, r) => sum + r.autoScore, 0) / readinessScores.length;

  return {
    ...status,
    readinessScores,
    overallReadiness: Math.round(overallReadiness),
    recommendedActions: [
      status.statistics.teachers.certificationRate < 80
        ? 'Tingkatkan jumlah guru bersertifikasi'
        : null,
      status.statistics.teachers.total < 10 ? 'Tambah jumlah tenaga pendidik' : null,
    ].filter(Boolean),
  };
}

/**
 * Cross-unit accreditation readiness overview for the foundation dashboard.
 * Reuses the per-unit dashboard computation for every active unit.
 */
export async function getAccreditationReadinessOverview() {
  const units = await prisma.unit.findMany({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { name: 'asc' },
  });

  const dashboards = await Promise.all(units.map((u) => getAccreditationDashboard(u.id)));

  const items = dashboards.map((dashboard) => ({
    unitId: dashboard.unit.id,
    unitName: dashboard.unit.name,
    npsn: dashboard.unit.npsn,
    currentGrade: dashboard.unit.currentAccreditation,
    overallReadiness: dashboard.overallReadiness,
    standards: dashboard.readinessScores,
    statistics: dashboard.statistics,
    recommendedActions: dashboard.recommendedActions,
  }));

  const averageReadiness =
    items.length > 0
      ? Math.round(items.reduce((sum, item) => sum + item.overallReadiness, 0) / items.length)
      : 0;

  return { units: items, averageReadiness };
}

export async function simulateAccreditationScore(
  unitId: string,
  manualScores: Record<string, number>
): Promise<{
  totalScore: number;
  grade: string;
  gradeDescription: string;
  breakdown: Array<{
    standardCode: string;
    standardName: string;
    score: number;
    weightedScore: number;
  }>;
}> {
  const breakdown = SNP_STANDARDS.map((std) => {
    const score = manualScores[std.code] ?? 70; // Default 70 if not provided
    const weightedScore = (score * std.weight) / 100;

    return {
      standardCode: std.code,
      standardName: std.name,
      score,
      weightedScore,
    };
  });

  const totalScore = breakdown.reduce((sum, b) => sum + b.weightedScore, 0);
  const { grade, description } = calculateGrade(totalScore);

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    grade,
    gradeDescription: description,
    breakdown,
  };
}
