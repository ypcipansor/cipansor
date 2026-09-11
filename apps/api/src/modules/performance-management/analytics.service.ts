import { prisma } from '@/lib/prisma';
import { PlanStatus } from '@prisma/client';

type PkUnitView = {
  user?: { unitId: string | null } | null;
  strategicPlan?: { unitId: string | null } | null;
};

type PkWithUnit = PkUnitView & {
  id: string;
  status: PlanStatus;
  overallScore: number;
  totalScore: number;
  behaviorScore: number;
};

/**
 * Unit yang "memiliki" sebuah PK, untuk keperluan laporan.
 *
 * Bug pegawai multi-unit: laporan mengelompokkan PK berdasarkan
 * `user.unitId` (unit asal), sehingga PK seorang guru yang mengajar di unit
 * lain — lewat `UserRoleAssignment.unitId` — masuk laporan unit asalnya,
 * bukan unit yang RKA/Renstra-nya ia implementasikan. `UserRoleAssignment`
 * bersifat per-peran dan kedaluwarsa, jadi tidak cocok sebagai sumber atribusi
 * sebuah PK.
 *
 * Sumber yang dipakai adalah `strategicPlan.unitId` bila PK mengacu pada
 * sebuah dokumen rencana (RKA/Renstra) — karena di situlah PK berakar dalam
 * kaskade — dan baru jatuh ke `user.unitId` bila PK TIDAK mengacu rencana
 * sama sekali. Ini perbaikan tanpa perubahan schema (opsi b). Opsi a (kolom
 * `unitId` persisten di `PerformanceAgreement`) adalah perbaikan yang tahan
 * lama dan disarankan sebagai follow-up, digabung dengan FLAG 5 (uniqueness
 * RKA tahunan) karena keduanya menyentuh schema yang sama.
 */
function resolvePkUnit(pk: PkUnitView): string | null {
  // Jika PK mengacu sebuah dokumen rencana, dokumen itu yang menentukan unit
  // (termasuk null = dokumen yayasan / Kantor Pusat). Jangan jatuh ke
  // `user.unitId`: PK yang berinduk RKA Yayasan (strategicPlan.unitId ===
  // null) adalah PK tingkat yayasan, bukan PK pegawai unit. `user.unitId`
  // hanya dipakai bila PK berjalan tanpa acuan rencana.
  if (pk.strategicPlan) return pk.strategicPlan.unitId ?? null;
  return pk.user?.unitId ?? null;
}

const APPROVED = PlanStatus.APPROVED;

/** Aggregated PK dashboards for unit and foundation leadership. */
export class PKAnalyticsService {
  async getUnitPerformanceDashboard(unitId?: string) {
    const units = unitId
      ? await prisma.unit.findMany({ where: { id: unitId } })
      : await prisma.unit.findMany();

    // Ambil SEMUA PK (dengan relasi pembawa unit) sekali, lalu kelompokkan di
    // JS menurut unit hasil resolve. Query per-unit (N+1) yang menyaring
    // `user.unitId` tidak dapat menangkap PK yang mengacu RKA/Renstra unit lain
    // — justru inti bug pegawai multi-unit.
    const pkWhere = unitId
      ? { OR: [{ user: { unitId } }, { strategicPlan: { unitId } }] }
      : undefined;
    const allPks = (await prisma.performanceAgreement.findMany({
      where: pkWhere,
      select: {
        id: true,
        status: true,
        overallScore: true,
        totalScore: true,
        behaviorScore: true,
        user: { select: { unitId: true } },
        strategicPlan: { select: { unitId: true } },
      },
    })) as PkWithUnit[];

    // Evaluasi dikelompokkan dengan cara yang sama, supaya hitungan selaras
    // dengan pengelompokan PK-nya.
    const evalWhere = unitId
      ? { pk: { OR: [{ user: { unitId } }, { strategicPlan: { unitId } }] } }
      : undefined;
    const evals = await prisma.pKEvaluation.findMany({
      where: evalWhere,
      select: {
        status: true,
        pkId: true,
        pk: {
          select: {
            user: { select: { unitId: true } },
            strategicPlan: { select: { unitId: true } },
          },
        },
      },
    });

    // Foundation = unit hasil resolve null (unitId null di user DAN strategicPlan).
    const pksByUnit = new Map<string | null, PkWithUnit[]>();
    const evalsByUnit = new Map<string | null, { total: number; approved: number }>();

    for (const pk of allPks) {
      const u = resolvePkUnit(pk);
      // Untuk tampilan satu unit, buang baris yang hanya cocok lewat user.unitId
      // asal tetapi sebenarnya milik unit lain (multi-unit).
      if (unitId && u !== unitId) continue;
      const arr = pksByUnit.get(u);
      if (arr) arr.push(pk);
      else pksByUnit.set(u, [pk]);
    }
    for (const ev of evals) {
      const u = resolvePkUnit(ev.pk ?? {});
      if (unitId && u !== unitId) continue;
      const entry = evalsByUnit.get(u) ?? { total: 0, approved: 0 };
      entry.total += 1;
      if (ev.status === APPROVED) entry.approved += 1;
      evalsByUnit.set(u, entry);
    }

    const unitMetrics = units.map((unit) => {
      const unitPks = pksByUnit.get(unit.id) ?? [];
      const approvedPks = unitPks.filter((p) => p.status === APPROVED);
      const ev = evalsByUnit.get(unit.id) ?? { total: 0, approved: 0 };
      const avg = (list: PkWithUnit[], key: 'overallScore' | 'totalScore' | 'behaviorScore') =>
        list.length > 0 ? list.reduce((sum, p) => sum + p[key], 0) / list.length : 0;

      return {
        id: unit.id,
        name: unit.name,
        avgScore: avg(approvedPks, 'overallScore'),
        avgPerformanceScore: avg(approvedPks, 'totalScore'),
        avgBehaviorScore: avg(approvedPks, 'behaviorScore'),
        pkCount: approvedPks.length,
        totalPksCount: unitPks.length,
        evCount: ev.total,
        approvedEvCount: ev.approved,
      };
    });

    const foundationPks = pksByUnit.get(null) ?? [];
    const foundationEv = evalsByUnit.get(null) ?? { total: 0, approved: 0 };

    const totalAgreements =
      foundationPks.length + unitMetrics.reduce((sum, u) => sum + u.totalPksCount, 0);
    const approvedAgreements =
      foundationPks.filter((p) => p.status === APPROVED).length +
      unitMetrics.reduce((sum, u) => sum + u.pkCount, 0);
    const totalEvaluations =
      foundationEv.total + unitMetrics.reduce((sum, u) => sum + u.evCount, 0);

    // Headline rata-rata hanya boleh berasal dari PK yang BENAR-BENAR sudah
    // dinilai (punya evaluasi APPROVED) — konsisten dengan syarat eligibility
    // ranking (`approvedEvCount > 0`). Sebelumnya `approvedPksAll` memuat SEMUA
    // PK berstatus APPROVED, termasuk yang belum pernah dinilai: skor nol dari
    // PK "disetujui tapi belum dinilai" ikut menekan rata-rata.
    const evaluatedPkIds = new Set(
      evals.filter((ev) => ev.status === APPROVED).map((ev) => ev.pkId)
    );
    const approvedPksAll = allPks.filter(
      (p) =>
        p.status === APPROVED &&
        evaluatedPkIds.has(p.id) &&
        (!unitId || resolvePkUnit(p) === unitId)
    );

    const avgPerformanceScore =
      approvedPksAll.length > 0
        ? approvedPksAll.reduce((sum, pk) => sum + pk.totalScore, 0) / approvedPksAll.length
        : 0;

    const avgBehaviorScore =
      approvedPksAll.length > 0
        ? approvedPksAll.reduce((sum, pk) => sum + pk.behaviorScore, 0) / approvedPksAll.length
        : 0;

    // Hanya unit dengan EVALUASI APPROVED yang boleh diperingkat.
    //
    // Sebelumnya syaratnya "punya PK disetujui" (`pkCount > 0`), sehingga unit
    // yang PK-nya sudah disetujui tetapi belum pernah dinilai tetap masuk
    // peringkat dengan skor nol — muncul di puncak "kinerja terburuk" padahal
    // hanya belum ada data. Itu angka yang berbohong kepada pembacanya.
    //
    // Syarat eligibility kini menggunakan approvedEvCount (evaluasi APPROVED),
    // bukan evCount total. Unit yang baru punya evaluasi DRAFT (belum
    // disetujui) tidak boleh diperingkat — agregat skornya belum sah.
    const ranked = unitMetrics.filter((u) => u.approvedEvCount > 0);
    const sorted = [...ranked].sort((a, b) => b.avgScore - a.avgScore);

    return {
      totalAgreements,
      approvedAgreements,
      totalEvaluations,
      avgPerformanceScore,
      avgBehaviorScore,
      bestPerformingUnits: sorted.slice(0, 5),
      worstPerformingUnits: [...sorted].reverse().slice(0, 5),
      // Unit yang belum punya evaluasi disetujui tetap dilaporkan, tetapi
      // terpisah — "belum ada data" adalah temuan tersendiri, bukan nilai nol.
      unitsWithoutApprovedPk: unitMetrics
        .filter((u) => u.approvedEvCount === 0)
        .map((u) => ({ id: u.id, name: u.name })),
      allUnits: unitMetrics,
    };
  }

  async getUnitDrilldown(unitId: string) {
    const unit = await prisma.unit.findUnique({ where: { id: unitId } });

    // PK yang mengacu RKA/Renstra unit lain (pegawai multi-unit) tetap milik
    // unit yang rencananya diimplementasikan, bukan unit asal si pegawai.
    const agreements = await prisma.performanceAgreement.findMany({
      where: {
        OR: [{ user: { unitId } }, { strategicPlan: { unitId } }],
        status: APPROVED,
      },
      include: {
        strategicPlan: { select: { id: true, unitId: true } },
        user: { select: { id: true, name: true, unitId: true } },
        supervisor: { select: { id: true, name: true } },
        indicators: { select: { id: true } },
      },
    });

    const scoped = agreements.filter((a) => resolvePkUnit(a) === unitId);

    // RKA yang ditampilkan harus yang benar-benar di-referensi oleh PK unit
    // ini (ter-secope periode/agreement), dan statusnya sah (APPROVED) — bukan
    // sekadar RKA terbaru menurut createdAt, yang bisa berasal dari periode
    // berbeda atau masih DRAFT/PROPOSED sehingga progress-nya belum sah.
    const referencedPlanIds = [
      ...new Set(
        scoped
          .map((a) => a.strategicPlan?.id ?? null)
          .filter((id): id is string => !!id)
      ),
    ];
    let strategicPlan: { id: string; title: string; progress: number } | null = null;
    if (referencedPlanIds.length > 0) {
      strategicPlan = await prisma.strategicPlan.findFirst({
        where: { id: { in: referencedPlanIds }, type: 'RKA', status: APPROVED },
        select: { id: true, title: true, progress: true },
        orderBy: { startDate: 'desc' },
      });
    }
    // Tak ada PK yang menunjuk RKA — jatuh ke RKA terbaru unit yang sah.
    if (!strategicPlan) {
      strategicPlan = await prisma.strategicPlan.findFirst({
        where: { unitId, type: 'RKA', status: APPROVED },
        select: { id: true, title: true, progress: true },
        orderBy: { startDate: 'desc' },
      });
    }

    return {
      unit: unit ? { id: unit.id, name: unit.name } : null,
      strategicPlan: strategicPlan
        ? { id: strategicPlan.id, title: strategicPlan.title, progress: strategicPlan.progress }
        : null,
      agreements: scoped.map((a) => ({
        id: a.id,
        userId: a.userId,
        supervisorId: a.supervisorId,
        periodStart:
          a.periodStart instanceof Date ? a.periodStart.toISOString() : String(a.periodStart ?? ''),
        periodEnd:
          a.periodEnd instanceof Date ? a.periodEnd.toISOString() : String(a.periodEnd ?? ''),
        status: a.status,
        totalScore: a.totalScore,
        behaviorScore: a.behaviorScore,
        overallScore: a.overallScore,
        user: { id: a.user.id, name: a.user.name },
        supervisor: a.supervisor,
        indicators: a.indicators,
      })),
    };
  }

  async getConsolidatedReport(period: { month?: number; year: number; unitId?: string }) {
    const units = period.unitId
      ? await prisma.unit.findMany({ where: { id: period.unitId } })
      : await prisma.unit.findMany();

    const rangeStart = new Date(period.year, (period.month || 1) - 1, 1);
    const rangeEnd = new Date(period.year, period.month || 12, 0, 23, 59, 59, 999);

    // PK & evaluasi periodik dibawa dalam satu genggaman dengan relasi pembawa
    // unit, lalu dikelompokkan menurut unit hasil resolve — bukan `user.unitId`
    // — supaya pegawai multi-unit masuk laporan unit yang RKA/Renstra-nya ia
    // implementasikan.
    const pkWhere: any = {
      periodStart: { lte: rangeEnd },
      periodEnd: { gte: rangeStart },
    };
    if (period.unitId) {
      pkWhere.OR = [
        { user: { unitId: period.unitId } },
        { strategicPlan: { unitId: period.unitId } },
      ];
    }
    const allPks = (await prisma.performanceAgreement.findMany({
      where: pkWhere,
      select: {
        status: true,
        user: { select: { unitId: true } },
        strategicPlan: { select: { unitId: true } },
      },
    })) as PkWithUnit[];

    const evalBase: any = { year: period.year, status: APPROVED };
    if (period.month) evalBase.month = period.month;
    const evalWhere: any = { ...evalBase };
    if (period.unitId) {
      evalWhere.pk = {
        OR: [{ user: { unitId: period.unitId } }, { strategicPlan: { unitId: period.unitId } }],
      };
    }
    const evals = await prisma.pKEvaluation.findMany({
      where: evalWhere,
      select: {
        overallScore: true,
        performanceScore: true,
        behaviorScore: true,
        pk: {
          select: {
            user: { select: { unitId: true } },
            strategicPlan: { select: { unitId: true } },
          },
        },
      },
    });

    const pksByUnit = new Map<string | null, { status: PlanStatus }[]>();
    const evalsByUnit = new Map<
      string | null,
      { overall: number; perf: number; behav: number; count: number }
    >();

    for (const pk of allPks) {
      const u = resolvePkUnit(pk);
      if (period.unitId && u !== period.unitId) continue;
      const arr = pksByUnit.get(u);
      if (arr) arr.push(pk);
      else pksByUnit.set(u, [pk]);
    }
    for (const ev of evals) {
      const u = resolvePkUnit(ev.pk ?? {});
      if (period.unitId && u !== period.unitId) continue;
      const entry = evalsByUnit.get(u) ?? { overall: 0, perf: 0, behav: 0, count: 0 };
      entry.overall += ev.overallScore;
      entry.perf += ev.performanceScore;
      entry.behav += ev.behaviorScore;
      entry.count += 1;
      evalsByUnit.set(u, entry);
    }

    const unitReports = units.map((unit) => {
      const unitPks = pksByUnit.get(unit.id) ?? [];
      const ev = evalsByUnit.get(unit.id) ?? { overall: 0, perf: 0, behav: 0, count: 0 };
      const totalAgreements = unitPks.length;
      const approvedAgreements = unitPks.filter((p) => p.status === APPROVED).length;

      return {
        id: unit.id,
        name: unit.name,
        totalAgreements,
        approvedAgreements,
        avgOverallScore: ev.count > 0 ? ev.overall / ev.count : 0,
        avgPerformanceScore: ev.count > 0 ? ev.perf / ev.count : 0,
        avgBehaviorScore: ev.count > 0 ? ev.behav / ev.count : 0,
      };
    });

    // If global report (no unitId filter), include Foundation agreements (unitId = null)
    if (!period.unitId) {
      const foundationPks = pksByUnit.get(null) ?? [];
      const ev = evalsByUnit.get(null) ?? { overall: 0, perf: 0, behav: 0, count: 0 };
      const totalAgreements = foundationPks.length;
      const approvedAgreements = foundationPks.filter((p) => p.status === APPROVED).length;
      const avgScore = ev.count > 0 ? ev.overall / ev.count : 0;
      const avgPerf = ev.count > 0 ? ev.perf / ev.count : 0;
      const avgBehav = ev.count > 0 ? ev.behav / ev.count : 0;

      if (totalAgreements > 0 || ev.count > 0) {
        unitReports.unshift({
          id: 'yayasan',
          name: 'Yayasan (Kantor Pusat)',
          totalAgreements,
          approvedAgreements,
          avgOverallScore: avgScore,
          avgPerformanceScore: avgPerf,
          avgBehaviorScore: avgBehav,
        });
      }
    }

    return { units: unitReports };
  }
}

export const pkAnalyticsService = new PKAnalyticsService();
