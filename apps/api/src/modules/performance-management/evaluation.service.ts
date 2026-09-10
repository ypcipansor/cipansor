import { prisma } from '@/lib/prisma';
import { predikatKinerja } from './predikat';
import { IndicatorAggregation } from '@prisma/client';
import { PlanStatus, PerformanceRating, Prisma } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { pkService } from './pk.service';

/**
 * Monthly PK evaluations: realizations per indicator, SAFTI behavior
 * scores, weighted score roll-ups, and (on approval) YTD sync to the
 * PK plus an automated talent-matrix assessment.
 */
/**
 * Capaian YTD sebuah indikator dari daftar realisasi bulanannya, menurut sifat
 * agregasi indikator. SATU-SATUNYA tempat agregasi ini didefinisikan — dipakai
 * oleh penilaian evaluasi (`recalculateEvaluationScores`) DAN oleh sinkronisasi
 * PK/talent (`syncToPKAndTalentInTx`). Kalau salah satu menyimpang, skor
 * evaluasi dan capaian YTD PK tidak akan pernah selaras.
 *
 * `values` harus sudah terurut dari periode tertua ke terbaru agar mode
 * TERAKHIR mengambil entri yang benar.
 */
function aggregateValues(values: number[], aggregation: IndicatorAggregation): number {
  if (values.length === 0) return 0;
  if (aggregation === IndicatorAggregation.RATA_RATA) {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  if (aggregation === IndicatorAggregation.TERAKHIR) {
    return values[values.length - 1];
  }
  return values.reduce((sum, v) => sum + v, 0);
}

export class EvaluationService {
  // ==================== BEHAVIORAL VALUES (ADMIN) ====================

  async createBehavioralValue(data: { name: string; description?: string; weight: number }) {
    return prisma.behavioralValue.create({ data });
  }

  async getBehavioralValues() {
    return prisma.behavioralValue.findMany({ where: { isActive: true } });
  }

  async updateBehavioralValue(
    id: string,
    data: { name?: string; description?: string; weight?: number; isActive?: boolean }
  ) {
    return prisma.behavioralValue.update({ where: { id }, data });
  }

  async deleteBehavioralValue(id: string) {
    // Soft-deactivate so historical evaluations keep their reference.
    return prisma.behavioralValue.update({ where: { id }, data: { isActive: false } });
  }

  // ==================== EVALUATIONS ====================

  async createEvaluation(
    callerId: string,
    isAdmin: boolean,
    data: { pkId: string; month: number; year: number; feedback?: string; notes?: string }
  ) {
    const pk = await prisma.performanceAgreement.findUnique({
      where: { id: data.pkId },
      include: { indicators: true },
    });

    if (!pk) throw Errors.notFound('PK');
    pkService.assertAccess(pk, callerId, isAdmin);
    if (pk.status !== PlanStatus.APPROVED) {
      throw Errors.badRequest('Cannot evaluate a PK that is not APPROVED');
    }

    // Validate that month and year fall within the PK agreement period
    const evalDate = new Date(data.year, data.month - 1, 1);
    const startMonthDate = new Date(pk.periodStart.getFullYear(), pk.periodStart.getMonth(), 1);
    const endMonthDate = new Date(pk.periodEnd.getFullYear(), pk.periodEnd.getMonth(), 1);

    if (evalDate < startMonthDate || evalDate > endMonthDate) {
      throw Errors.badRequest('Evaluation month and year must fall within the PK agreement period');
    }

    const behaviorValues = await this.getBehavioralValues();
    const period = new Date(data.year, data.month - 1, 1);

    const evaluation = await prisma.$transaction(async (tx) => {
      const created = await tx.pKEvaluation.create({
        data: {
          pkId: data.pkId,
          month: data.month,
          year: data.year,
          period,
          feedback: data.feedback,
          notes: data.notes,
        },
      });

      await tx.pKIndicatorEvaluation.createMany({
        data: pk.indicators.map((ind) => ({
          evaluationId: created.id,
          indicatorId: ind.id,
          realization: 0,
        })),
      });

      await tx.pKBehaviorEvaluation.createMany({
        data: behaviorValues.map((bv) => ({
          evaluationId: created.id,
          behaviorValueId: bv.id,
          score: 0,
        })),
      });

      return created;
    });

    return this.getEvaluationById(evaluation.id);
  }

  async getEvaluationById(id: string) {
    const evaluation = await prisma.pKEvaluation.findUnique({
      where: { id },
      include: {
        pk: {
          include: {
            user: { select: { id: true, name: true } },
            supervisor: { select: { id: true, name: true } },
          },
        },
        indicatorDetails: {
          include: { indicator: true },
        },
        behaviorDetails: {
          include: { behaviorValue: true },
        },
      },
    });

    if (!evaluation) return evaluation;

    // Predikat diturunkan, bukan disimpan — jadi tidak ada kolom baru, tidak
    // ada migrasi, dan tidak ada dua sumber kebenaran yang bisa berbeda.
    return {
      ...evaluation,
      predikat: predikatKinerja(evaluation.performanceScore, evaluation.behaviorScore),
    };
  }

  /** Loads an evaluation inside a transaction and locks the parent PerformanceAgreement row. */
  private async loadEditableEvaluationInTx(
    evaluationId: string,
    callerId: string,
    isAdmin: boolean,
    tx: Prisma.TransactionClient,
    opts: { ownerOnly?: boolean; supervisorOnly?: boolean } = {}
  ) {
    const initialEval = await tx.pKEvaluation.findUnique({
      where: { id: evaluationId },
      select: { pkId: true },
    });
    if (!initialEval) throw Errors.notFound('Evaluation');

    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT id FROM "performance_agreements" WHERE id = ${initialEval.pkId} FOR UPDATE`;
    }

    const evaluation = await tx.pKEvaluation.findUnique({
      where: { id: evaluationId },
      include: { pk: true },
    });
    if (!evaluation) throw Errors.notFound('Evaluation');
    pkService.assertAccess(evaluation.pk, callerId, isAdmin, opts);
    if (evaluation.status === PlanStatus.APPROVED) {
      throw Errors.conflict('An approved evaluation can no longer be edited');
    }
    return evaluation;
  }

  async updateIndicatorRealization(
    evaluationId: string,
    indicatorId: string,
    callerId: string,
    isAdmin: boolean,
    data: { realization: number; activities?: string }
  ) {
    return prisma.$transaction(async (tx) => {
      await this.loadEditableEvaluationInTx(evaluationId, callerId, isAdmin, tx);

      const detail = await tx.pKIndicatorEvaluation.findUnique({
        where: { evaluationId_indicatorId: { evaluationId, indicatorId } },
        include: { indicator: true },
      });
      if (!detail) throw Errors.notFound('Indicator detail for this evaluation');

      // Simpan realisasi bulanan MENTAH. Skor indikator tidak dihitung di sini
      // bulan-per-bulan: untuk indikator KUMULATIF, menyentuh target setahun
      // yang dicicil 12 bulan akan memberi skor ~1/12 pada setiap bulannya, dan
      // merata-ratakannya pun tetap salah. Skor dihitung di
      // `recalculateEvaluationScores` dari capaian YTD ter-agregasi (sesuai
      // `indicator.aggregation`) dibanding target.
      const updated = await tx.pKIndicatorEvaluation.update({
        where: { id: detail.id },
        data: {
          realization: data.realization,
          activities: data.activities,
        },
        include: { indicator: true },
      });

      await this.recalculateEvaluationScores(evaluationId, tx);
      return updated;
    });
  }

  async updateBehaviorScore(
    evaluationId: string,
    behaviorValueId: string,
    callerId: string,
    isAdmin: boolean,
    data: { score: number; notes?: string }
  ) {
    return prisma.$transaction(async (tx) => {
      await this.loadEditableEvaluationInTx(evaluationId, callerId, isAdmin, tx, {
        supervisorOnly: true,
      });

      const detail = await tx.pKBehaviorEvaluation.findUnique({
        where: { evaluationId_behaviorValueId: { evaluationId, behaviorValueId } },
      });
      if (!detail) throw Errors.notFound('Behavior detail for this evaluation');

      const updated = await tx.pKBehaviorEvaluation.update({
        where: { id: detail.id },
        data: { score: data.score, notes: data.notes },
      });

      await this.recalculateEvaluationScores(evaluationId, tx);
      return updated;
    });
  }

  async recalculateEvaluationScores(
    evaluationId: string,
    txClient?: Prisma.TransactionClient | typeof prisma
  ) {
    const client = txClient || prisma;
    const evaluation = await client.pKEvaluation.findUnique({
      where: { id: evaluationId },
      include: {
        indicatorDetails: { include: { indicator: true } },
        behaviorDetails: { include: { behaviorValue: true } },
      },
    });

    if (!evaluation) return;

    // Kumpulkan realisasi indikator PK, terurut menurut tahun/bulan, TETAPI
    // hanya sampai periode evaluasi yang sedang dihitung. Ini dasar hitung
    // capaian YTD: skor indikator bukan jumlah skor bulanan mentah (yang untuk
    // KUMULATIF memberi ~1/12 untuk tiap bulan yang dicicil menuju target
    // setahun), melainkan capaian YTD ter-agregasi menurut
    // `indicator.aggregation` dibanding target.
    //
    // Tanpa dua pembatas ini skor YTD bulan berikutnya mengontaminasi bulan
    // yang lebih awal: evaluasi Januari memuat realisasi Februari yang belum
    // ada saat Januari dinilai. Jadi bentuk agregasi hanya dari evaluasi yang
    // PERIODENYA sudah tiba (year/month <= current) dan SUDAH DISETUJUI
    // (APPROVED), plus evaluasi saat ini sendiri yang sedang dinilai
    // realisasinya. Evaluasi PROPOSED sengaja TIDAK dihitung: statusnya tidak
    // terkunci (masih bisa diubah lewat `loadEditableEvaluationInTx` yang hanya
    // memblokir APPROVED), sehingga realisasinya belum otoritatif dan bisa
    // mengontaminasi YTD dengan angka yang masih akan dikoreksi.
    const relevantStatuses = [PlanStatus.APPROVED];
    const periodCondition =
      evaluation.year !== undefined && evaluation.year !== null
        ? [
            {
              OR: [
                { year: { lt: evaluation.year } },
                { year: evaluation.year, month: { lte: evaluation.month ?? 12 } },
              ],
            },
          ]
        : [];

    const aggs = await client.pKIndicatorEvaluation.findMany({
      where: {
        evaluation: {
          AND: [
            { pkId: evaluation.pkId },
            { OR: [{ id: evaluationId }, { status: { in: relevantStatuses } }] },
            ...periodCondition,
          ],
        },
      },
      select: {
        indicatorId: true,
        realization: true,
        evaluation: { select: { year: true, month: true } },
      },
      orderBy: [{ evaluation: { year: 'asc' } }, { evaluation: { month: 'asc' } }],
    });
    const byIndicator = new Map<string, number[]>();
    for (const agg of aggs) {
      const arr = byIndicator.get(agg.indicatorId) ?? [];
      arr.push(agg.realization);
      byIndicator.set(agg.indicatorId, arr);
    }

    // Performance: skor per indikator dari capaian YTD vs target, ditimbang
    // bobot indikator (bobot total 100). Skor yang dihitung ini dipersist
    // kembali ke detail evaluasi supaya nilai yang tersimpan mencerminkan
    // capaian ter-agregasi, bukan hanya bulan yang baru saja diubah.
    let performanceScore = 0;
    for (const det of evaluation.indicatorDetails) {
      const values = byIndicator.get(det.indicatorId) ?? [];
      const achieved = aggregateValues(values, det.indicator.aggregation);
      let indScore = 0;
      if (det.indicator.target > 0) {
        indScore = Math.min(100, (achieved / det.indicator.target) * 100);
      } else if (det.indicator.target === 0 && achieved === 0) {
        indScore = 100;
      }
      await client.pKIndicatorEvaluation.update({
        where: { id: det.id },
        data: { score: indScore },
      });
      performanceScore += (indScore * det.indicator.weight) / 100;
    }

    // Behavior: weighted by BehavioralValue.weight (simple average when
    // all weights are equal, which is the SAFTI default).
    const totalBehaviorWeight = evaluation.behaviorDetails.reduce(
      (sum, det) => sum + det.behaviorValue.weight,
      0
    );
    const behaviorScore =
      totalBehaviorWeight > 0
        ? evaluation.behaviorDetails.reduce(
            (sum, det) => sum + det.score * det.behaviorValue.weight,
            0
          ) / totalBehaviorWeight
        : 0;

    // Overall: 60% performance, 40% behavior (as per Cipansor SAFTI standard).
    //
    // Angka ini dipertahankan untuk pemeringkatan dan rata-rata, TETAPI ia
    // bukan penilaiannya. PermenPANRB No. 6/2022 tidak menjumlahkan hasil
    // kerja dan perilaku kerja menjadi satu angka: keduanya dinilai terpisah
    // terhadap ekspektasi, lalu predikatnya diambil dari kuadran. Bedanya
    // nyata — dengan penjumlahan berbobot, capaian KPI 100% menutupi perilaku
    // yang buruk (0,6 mendominasi), dan itu persis yang dicegah kuadran.
    // Predikatnya diturunkan di `predikat.ts`, tanpa kolom baru.
    const overallScore = performanceScore * 0.6 + behaviorScore * 0.4;

    await client.pKEvaluation.update({
      where: { id: evaluationId },
      data: { performanceScore, behaviorScore, overallScore },
    });
  }

  async approveEvaluation(id: string, callerId: string, isAdmin: boolean, feedback?: string) {
    return prisma.$transaction(async (tx) => {
      const evaluation = await tx.pKEvaluation.findUnique({
        where: { id },
        include: { pk: true },
      });
      if (!evaluation) throw Errors.notFound('Evaluation');
      pkService.assertAccess(evaluation.pk, callerId, isAdmin, { supervisorOnly: true });

      // Acquire an explicit row lock on the PerformanceAgreement row to serialize concurrent approvals for the same PK
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM "performance_agreements" WHERE id = ${evaluation.pkId} FOR UPDATE`;
      }

      // Atomic conditional update ensuring status is not already APPROVED
      const updateResult = await tx.pKEvaluation.updateMany({
        where: {
          id,
          status: { not: PlanStatus.APPROVED },
        },
        data: {
          status: PlanStatus.APPROVED,
          feedback: feedback !== undefined ? feedback : evaluation.feedback,
        },
      });

      if (updateResult.count === 0) {
        throw Errors.conflict('Evaluation already approved');
      }

      await this.syncToPKAndTalentInTx(tx, evaluation.pkId);
      const approved = await tx.pKEvaluation.findUnique({
        where: { id },
        include: {
          pk: {
            include: {
              user: { select: { id: true, name: true } },
              supervisor: { select: { id: true, name: true } },
            },
          },
          indicatorDetails: { include: { indicator: true } },
          behaviorDetails: { include: { behaviorValue: true } },
        },
      });

      // Predikat ikut di sini, bukan hanya di getEvaluationById.
      // Ditemukan saat menjalankan alurnya sungguhan: persetujuan mengembalikan
      // predikat null sementara GET yang sama mengisinya, sehingga layar
      // persetujuan menampilkan skor tanpa predikatnya sampai halaman dimuat
      // ulang — padahal predikat itulah kesimpulan penilaiannya.
      return approved
        ? {
            ...approved,
            predikat: predikatKinerja(approved.performanceScore, approved.behaviorScore),
          }
        : approved;
    }, {
      // Di dalam satu transaksi ini ada SELECT ... FOR UPDATE, updateMany,
      // satu update per indikator secara berurutan, sinkronisasi matriks
      // talenta, lalu satu findUnique dengan empat include. Batas bawaan
      // Prisma 5 detik terlampaui pada PK dengan belasan indikator di basis
      // data yang sedang sibuk: P2028, rollback, penyetuju melihat 500, dan
      // penguncian baris sempat ditahan selama seluruh jendela itu.
      timeout: 30_000,
      maxWait: 10_000,
    });
  }

  /**
   * After an evaluation is approved: roll YTD realizations up into the
   * PK indicators, refresh the PK's aggregate scores, and mirror the
   * result into the talent matrix when a talent profile exists. Executed
   * within the approval Prisma transaction client for full atomicity.
   */
  private async syncToPKAndTalentInTx(tx: Prisma.TransactionClient, pkId: string) {
    const pk = await tx.performanceAgreement.findUnique({
      where: { id: pkId },
      include: {
        indicators: {
          include: {
            evaluations: {
              where: { evaluation: { status: PlanStatus.APPROVED } },
              // Urutan wajib: mode TERAKHIR mengambil entri paling akhir, dan
              // tanpa orderBy urutan baris tidak dijamin oleh basis data.
              orderBy: [{ evaluation: { year: 'asc' } }, { evaluation: { month: 'asc' } }],
            },
          },
        },
        evaluations: {
          where: { status: PlanStatus.APPROVED },
          // Urutan wajib: periode terakhir = evaluasi paling akhir (max period).
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
    });

    if (!pk) return;

    // 1. Capaian YTD per indikator, dihitung menurut sifat indikatornya.
    //
    // Dulu selalu dijumlahkan. Untuk indikator persentase itu menghasilkan
    // angka mustahil yang tampil apa adanya di layar: target 85 persen,
    // dievaluasi 88 lalu 80, tertulis "Realisasi YTD 168 persen".
    const realizationByIndicator = new Map<string, number>();
    for (const indicator of pk.indicators) {
      const entries = indicator.evaluations as Array<{ realization: number }>;
      // `aggregateValues` sudah terurut terlebih dahulu lewat orderBy di atas,
      // sehingga mode TERAKHIR dan RATA_RATA mengambil entri yang benar.
      const realization = aggregateValues(
        entries.map((ev) => ev.realization),
        indicator.aggregation
      );
      realizationByIndicator.set(indicator.id, realization);
      await tx.pKIndicator.update({
        where: { id: indicator.id },
        data: { realization },
      });
    }

    // 2. PK aggregate scores = capaian YTD TERKINI, bukan rata-rata skor
    //    bulanan. Setiap `performanceScore` bulanan SUDAH merupakan capaian
    //    YTD (naik bertahap terhadap target setahun); merata-ratakannya kembali
    //    membuat target tahunan yang tercapai penuh terbaca jauh di bawah 100%.
    //    Pakai skor perioda terakhir (teragregasi) yang sudah diurut naik.
    const approvedCount = pk.evaluations.length;
    if (approvedCount === 0) return;

    const latest = pk.evaluations[pk.evaluations.length - 1];

    // Bug regresi #2 — skor PK tidak boleh basi dari realisasi ter-agregasi.
    //
    // Realisasi indikator (langkah 1) SELALU diagregasi dari seluruh evaluasi
    // approved. Bila periode yang lebih awal disetujui SETELAH periode yang
    // lebih baru, `performanceScore` tersimpan pada evaluasi periode terakhir
    // belum mencerminkan realisasi periode awal itu (skor itu dihitung saat
    // realisasinya terakhir disunting, sebelum periode awal ikut approved).
    // Menyalin `performanceScore` tersimpan apa adanya membuat PK memegang
    // realisasi YTD dan skor yang tidak konsisten. Karena itu skor performa PK
    // dihitung ULANG dari realisasi ter-agregasi yang sama persis dengan
    // langkah 1, lalu ditulis balik ke evaluasi supaya datanya ikut terkoreksi.
    let latestPerformance = 0;
    for (const indicator of pk.indicators) {
      const achieved = realizationByIndicator.get(indicator.id) ?? 0;
      let indScore = 0;
      if (indicator.target > 0) {
        indScore = Math.min(100, (achieved / indicator.target) * 100);
      } else if (indicator.target === 0 && achieved === 0) {
        indScore = 100;
      }
      latestPerformance += (indScore * indicator.weight) / 100;
    }
    const latestBehavior = latest?.behaviorScore ?? 0;
    const latestOverall = latestPerformance * 0.6 + latestBehavior * 0.4;

    // Tulis balik skor yang telah dihitung ulang ke evaluasi periode terakhir
    // supaya baris yang tersimpan tidak ikut berbeda dari PK yang dibacanya.
    await tx.pKEvaluation.update({
      where: { id: latest.id },
      data: { performanceScore: latestPerformance, overallScore: latestOverall },
    });

    await tx.performanceAgreement.update({
      where: { id: pkId },
      data: {
        totalScore: latestPerformance,
        behaviorScore: latestBehavior,
        overallScore: latestOverall,
      },
    });

    // 3. Mirror into the talent matrix. Requires a real assessor — skip
    //    when the PK has no supervisor rather than inventing one.
    if (!pk.supervisorId) return;

    const talentProfile = await tx.talentProfile.findUnique({
      where: { userId: pk.userId },
      include: { assessments: { orderBy: { assessedAt: 'desc' }, take: 1 } },
    });
    if (!talentProfile) return;

    let rating: PerformanceRating;
    if (latestOverall >= 90) rating = PerformanceRating.OUTSTANDING;
    else if (latestOverall >= 80) rating = PerformanceRating.EXCEEDS;
    else if (latestOverall >= 70) rating = PerformanceRating.MEETS;
    else if (latestOverall >= 60) rating = PerformanceRating.BELOW;
    else rating = PerformanceRating.UNSATISFACTORY;

    const period = `PK Sync ${pk.periodStart.getFullYear()} (${pkId.slice(0, 8)})`;
    const assessmentData = {
      performanceRating: rating,
      potentialRating: talentProfile.assessments[0]?.potentialRating ?? PerformanceRating.MEETS,
      overallScore: latestOverall,
      feedback:
        `Automated sync from Perjanjian Kinerja. Performance: ${latestPerformance.toFixed(2)}, ` +
        `Behavior (SAFTI): ${latestBehavior.toFixed(2)}. Potential rating carried forward — review manually.`,
      assessedAt: new Date(),
    };

    const existing = await tx.talentAssessment.findFirst({
      where: { talentId: talentProfile.id, period },
    });
    if (existing) {
      await tx.talentAssessment.update({ where: { id: existing.id }, data: assessmentData });
    } else {
      await tx.talentAssessment.create({
        data: {
          talentId: talentProfile.id,
          assessorId: pk.supervisorId,
          period,
          ...assessmentData,
        },
      });
    }
  }
}

export const evaluationService = new EvaluationService();
