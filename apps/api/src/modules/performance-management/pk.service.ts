import { prisma } from '@/lib/prisma';
import {
  PlanStatus,
  CascadingCategory,
  PerformanceAgreement,
  IndicatorAggregation,
  RoleCode,
} from '@prisma/client';
import { Errors } from '@/middleware/error';
import { seesAllUnits, FOUNDATION_SCOPE_ROLES } from '@/utils/resolve-unit-id';
import { STAFF_ROLE_CODES } from './staff-roles';

/**
 * Perjanjian Kinerja (PK) — performance agreements with cascading
 * indicators (Master Plan / Renstra → supervisor PK → subordinate PK).
 *
 * Workflow: DRAFT → PROPOSED (owner, weights must total 100)
 *           PROPOSED → APPROVED (supervisor/admin)
 *           PROPOSED → DRAFT with revision notes (supervisor/admin reject)
 */

/**
 * Tebakan awal sifat indikator dari satuannya — hanya sebagai bawaan.
 *
 * Penyusun PK tetap dapat menyatakannya sendiri; ini sekadar menghindarkan
 * kekeliruan yang paling sering: menjumlahkan persentase bulanan sehingga
 * capaian setahun terbaca 168 persen terhadap target 85 persen.
 */
const SATUAN_RATA_RATA = new Set([
  'persen',
  '%',
  'persentase',
  'rasio',
  'indeks',
  'nilai',
  'skor',
]);

export function aggregationForUnit(unit: string): IndicatorAggregation {
  return SATUAN_RATA_RATA.has(unit.trim().toLowerCase())
    ? IndicatorAggregation.RATA_RATA
    : IndicatorAggregation.KUMULATIF;
}

/**
 * Kedudukan organ yayasan yang tidak menyusun Perjanjian Kinerja individu.
 *
 * Bukan pilihan gaya, melainkan bacaan UU 16/2001 jo. UU 28/2004 dan definisi
 * PK itu sendiri (PermenPANRB 53/2014: "penugasan dari pimpinan instansi yang
 * lebih tinggi kepada pimpinan instansi di bawahnya"). Keputusan yayasan
 * 2026-09-06.
 */
const PENGURUS_KOLEKTIF =
  'Pengurus bertanggung jawab secara kolektif kolegial — ketua, sekretaris, dan ' +
  'bendahara bukan atasan-bawahan. Kontrak kinerjanya SUDAH ada dan hanya satu: ' +
  'RKA Yayasan yang disahkan Pembina. Menerbitkan PK lagi berisi sasaran yang ' +
  'sama hanya menggandakan dokumen yang sama. PK unit di bawahnya menginduk ' +
  'langsung pada RKA Yayasan itu. (Pengurus yang fulltime dan digaji lewat ' +
  'pengecualian Pasal 5 UU 28/2004 adalah perkara lain, dan belum dimodelkan.)';

const ORGAN_TANPA_PK: Partial<Record<string, string>> = {
  [RoleCode.YAYASAN_KETUA]: PENGURUS_KOLEKTIF,
  [RoleCode.YAYASAN_PEMBINA]:
    'Pembina adalah organ yang MENGESAHKAN program kerja dan RKA tahunan — ia ' +
    'menerima pertanggungjawaban, bukan memberikannya, dan tidak ada pihak di ' +
    'atasnya untuk menugaskan. Akuntabilitasnya berupa penilaian mandiri organ, ' +
    'bukan Perjanjian Kinerja.',
  [RoleCode.YAYASAN_PENGAWAS]:
    'Pengawas mengawasi Pengurus. Menilainya lewat PK berarti pihak yang diawasi ' +
    'menilai pengawasnya, dan itu meruntuhkan independensi yang justru dijaga UU ' +
    'lewat larangan rangkap jabatan. Akuntabilitasnya berupa laporan pengawasan ' +
    'kepada rapat Pembina.',
  [RoleCode.YAYASAN_SEKRETARIS]: PENGURUS_KOLEKTIF,
  [RoleCode.YAYASAN_BENDAHARA]: PENGURUS_KOLEKTIF,
  [RoleCode.YAYASAN_ANGGOTA]: PENGURUS_KOLEKTIF,
};

export class PerformanceAgreementService {
  /** Throws unless the caller owns the PK, supervises it, or is an admin. */
  assertAccess(
    pk: Pick<PerformanceAgreement, 'userId' | 'supervisorId'>,
    callerId: string,
    isAdmin: boolean,
    opts: { ownerOnly?: boolean; supervisorOnly?: boolean } = {}
  ) {
    if (isAdmin) return;
    if (opts.supervisorOnly) {
      // Dibedakan dengan sengaja. Kalau supervisorId null, `!==` di bawah akan
      // menolak SEMUA orang termasuk pemiliknya, penilaian perilaku tidak
      // pernah bisa diisi, dan skor akhir mentok di 60 tanpa satu pun pesan
      // yang menjelaskan mengapa. Itu jalan buntu, bukan penolakan akses.
      if (!pk.supervisorId) {
        throw Errors.badRequest(
          'Perjanjian Kinerja ini belum punya atasan penilai, sehingga penilaian perilaku tidak dapat diisi. Tetapkan atasan penilai lebih dahulu.'
        );
      }
      if (pk.supervisorId !== callerId) {
        throw Errors.forbidden('Only the assigned supervisor may perform this action');
      }
      return;
    }
    if (opts.ownerOnly) {
      if (pk.userId !== callerId) {
        throw Errors.forbidden('Only the PK owner may perform this action');
      }
      return;
    }
    if (pk.userId !== callerId && pk.supervisorId !== callerId) {
      throw Errors.forbidden();
    }
  }

  /**
   * Admin bukan berarti semua unit.
   *
   * `isAdminRoleCode()` menjawab "boleh bertindak atas PK milik orang lain",
   * dan itu benar. Tetapi ia tidak berkata apa pun tentang UNIT — sehingga
   * tanpa pemeriksaan ini seorang SDIT_ADMIN dapat membaca, menyunting,
   * menyetujui, dan menolak PK milik SMP IT. Hanya `deletePK` yang dulu
   * menjaganya, jadi satu rute aman sementara tujuh lainnya terbuka.
   *
   * Yang dilepaskan hanyalah peran yang memang bekerja lintas unit — pengurus
   * yayasan, pengasuh dan direktur pesantren, super admin — lewat predikat
   * yang sudah dipakai di tempat lain, `seesAllUnits`.
   */
  async assertUnitScope(
    target: { pkId?: string; evaluationId?: string; indicatorId?: string },
    caller: { roleCode?: string | null; unitId?: string | null }
  ): Promise<void> {
    if (seesAllUnits({ roleCode: caller.roleCode })) return;

    if (target.indicatorId) {
      const indicator = await prisma.pKIndicator.findUnique({
        where: { id: target.indicatorId },
        select: { pkId: true },
      });
      if (!indicator) return;
      return this.assertUnitScope({ pkId: indicator.pkId }, caller);
    }

    // Unit yang dimiliki sebuah PK ditentukan dari RENCANA yang diimplementasikannya
    // (strategicPlan.unitId), bukan dari unit ASAL pegawai (user.unitId). Sebuah PK
    // yang menginduk pada RKA/Renstra unit lain adalah milik unit pemilik rencana
    // itu — admin unit pemilik rencana boleh, admin unit asal pegawai tidak. Ini
    // sama dengan `resolvePkUnit` di analytics.service.ts; jangan sampai keduanya
    // menyimpang.
    let ownerUnitId: string | null | undefined;
    if (target.pkId) {
      const pk = await prisma.performanceAgreement.findUnique({
        where: { id: target.pkId },
        select: {
          strategicPlan: { select: { unitId: true } },
          user: { select: { unitId: true } },
        },
      });
      ownerUnitId = pk?.strategicPlan?.unitId ?? pk?.user?.unitId;
    } else if (target.evaluationId) {
      const evaluation = await prisma.pKEvaluation.findUnique({
        where: { id: target.evaluationId },
        select: {
          pk: {
            select: {
              strategicPlan: { select: { unitId: true } },
              user: { select: { unitId: true } },
            },
          },
        },
      });
      ownerUnitId = evaluation?.pk?.strategicPlan?.unitId ?? evaluation?.pk?.user?.unitId;
    }

    // Baris tidak ada: biarkan lapisan di bawahnya yang menjawab 404, supaya
    // pemeriksaan ini tidak berubah menjadi alat penebak id.
    if (ownerUnitId === undefined) return;

    if (!caller.unitId || ownerUnitId !== caller.unitId) {
      throw Errors.forbidden('Perjanjian Kinerja ini milik unit lain');
    }
  }

  async createPK(data: {
    userId: string;
    supervisorId?: string;
    supervisorPkId?: string;
    strategicPlanId?: string;
    periodStart: string;
    periodEnd: string;
    notes?: string;
  }) {
    // Ditolak di titik PALING AWAL — sebelum satu indikator pun disusun —
    // supaya orangnya tidak mengisi seluruh formulir untuk dokumen yang memang
    // tidak seharusnya ada.
    const alasan = await this.alasanOrganTanpaPK(data.userId);
    if (alasan) throw Errors.badRequest(alasan);

    let supervisorPkId = data.supervisorPkId;

    if (data.supervisorId) {
      // Atasan yang berupa organ yayasan (Ketua Pengurus dan seterusnya)
      // MEMANG tidak punya PK, dan itu bukan kekurangan yang harus ditambal
      // dengan menerbitkan satu. Kontrak kinerja mereka adalah RKA Yayasan.
      // Jadi PK di bawahnya berjangkar pada DOKUMEN RKA-nya, bukan pada PK
      // cerminan — supaya sasaran yang sama tidak hidup di dua tempat dan
      // berselisih.
      if (await this.isOrganTanpaPK(data.supervisorId)) {
        if (!data.strategicPlanId) {
          throw Errors.badRequest(
            'PK yang atasan penilainya organ yayasan harus menyebut dokumen RKA/Renstra ' +
              'yang menjadi induknya — di situlah kontrak kinerja yayasan berada.'
          );
        }
        const rencana = await prisma.strategicPlan.findUnique({
          where: { id: data.strategicPlanId },
          select: { id: true, status: true },
        });
        if (!rencana) throw Errors.notFound('Dokumen rencana');
        if (rencana.status === PlanStatus.DRAFT) {
          throw Errors.badRequest(
            'Dokumen rencana induknya masih berstatus Draft — sahkan lebih dahulu ' +
              'sebelum PK diturunkan darinya.'
          );
        }

        // RKA unit itu OPSIONAL. Tetapi begitu sebuah unit punya RKA-nya
        // sendiri, PK kepala unit itu harus menginduk padanya — bukan
        // melompat ke RKA Yayasan. Kalau melompat, RKA unitnya jadi yatim:
        // disusun, disahkan, lalu tidak ada satu pun PK yang menurunkannya,
        // dan capaiannya tidak pernah terhubung ke siapa pun.
        const rkaUnit = await this.rkaUnitBerlaku(data.userId, data.periodStart, data.periodEnd);
        if (rkaUnit && rkaUnit.id !== rencana.id) {
          throw Errors.badRequest(
            `Unit ini sudah punya RKA sendiri untuk periode tersebut ("${rkaUnit.title}"). ` +
              'PK-nya harus menginduk pada RKA unit itu, bukan langsung pada RKA Yayasan.'
          );
        }

        supervisorPkId = undefined;
      } else {
        // Cascading rule: a PK that names a supervisor links to that
        // supervisor's APPROVED PK covering the same period.
        const supervisorPk = await prisma.performanceAgreement.findFirst({
          where: {
            userId: data.supervisorId,
            status: PlanStatus.APPROVED,
            periodStart: { lte: new Date(data.periodStart) },
            periodEnd: { gte: new Date(data.periodEnd) },
          },
        });

        if (!supervisorPk) {
          throw Errors.badRequest(
            'Supervisor must have an approved PK covering the same period before subordinate PKs can be created'
          );
        }
        supervisorPkId = supervisorPk.id;
      }
    }

    return prisma.performanceAgreement.create({
      data: {
        user: { connect: { id: data.userId } },
        supervisor: data.supervisorId ? { connect: { id: data.supervisorId } } : undefined,
        supervisorPk: supervisorPkId ? { connect: { id: supervisorPkId } } : undefined,
        strategicPlan: data.strategicPlanId
          ? { connect: { id: data.strategicPlanId } }
          : undefined,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        notes: data.notes,
      },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
      },
    });
  }

  /**
   * Atasan penilai yang DISARANKAN untuk seorang pegawai.
   *
   * Sengaja diturunkan dari peran, bukan dari bagan organisasi: `OrgUnit` /
   * `OrgPosition` ada di skema tetapi baru terisi dua baris tanpa induk, jadi
   * default yang dihitung darinya akan kosong untuk hampir semua orang — sebuah
   * kendali yang tidak melakukan apa-apa. Peran, sebaliknya, terisi lengkap.
   *
   * Ini SARAN, bukan kunci: kolomnya tetap bisa diubah, karena plt., pelaksana
   * harian, dan pelaporan lintas unit tidak pernah muat dalam satu rumus.
   */
  private suggestSupervisorRole(roleCodes: string[]): string | null {
    // Kepala unit menginduk pada Ketua Pengurus.
    const kepalaUnit = [
      RoleCode.TKQ_KEPALA_SEKOLAH,
      RoleCode.SDIT_KEPALA_SEKOLAH,
      RoleCode.SMPIT_KEPALA_SEKOLAH,
      RoleCode.SMAQ_KEPALA_SEKOLAH,
      RoleCode.PESANTREN_PENGASUH,
      RoleCode.PESANTREN_DIREKTUR,
      RoleCode.PT_REKTOR,
    ] as string[];
    if (roleCodes.some((c) => kepalaUnit.includes(c))) return RoleCode.YAYASAN_KETUA;

    // Selebihnya menginduk pada kepala unitnya masing-masing.
    const perUnit: Record<string, string> = {
      TKQ: RoleCode.TKQ_KEPALA_SEKOLAH,
      SDIT: RoleCode.SDIT_KEPALA_SEKOLAH,
      SMPIT: RoleCode.SMPIT_KEPALA_SEKOLAH,
      SMAQ: RoleCode.SMAQ_KEPALA_SEKOLAH,
    };
    for (const code of roleCodes) {
      const prefix = code.split('_')[0];
      if (perUnit[prefix]) return perUnit[prefix];
    }
    return null;
  }

  async getSupervisors(
    caller?: { roleCode?: string | null; role?: string | null; unitId?: string | null },
    callerId?: string
  ) {
    const now = new Date();
    const canSeeAll = caller ? seesAllUnits(caller) : true;

    // Unit boundary: a caller pinned to a unit sees that unit's staff — dan,
    // di sampingnya, kandidat ber-scope yayasan/global. Assignment organ
    // yayasan (mis. Ketua Pengurus) tidak punya unitId, sehingga filter
    // `unitId = caller.unitId` saja membuat atasan yang WAJIB untuk rantai PK
    // kepala unit tidak pernah muncul di daftar. `seesAllUnits`-friendly roles
    // (FOUNDATION_SCOPE_ROLES) tetap disertakan tanpa membocorkan seluruh
    // direktori: peran tersebut memang bekerja lintas unit. Pemanggil yang
    // ber-scope global (`canSeeAll`) tidak dibatasi unit sama sekali.
    const foundationRoleCodes = [...FOUNDATION_SCOPE_ROLES];

    const rows = await prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: {
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
            role: {
              code: {
                in: [...STAFF_ROLE_CODES],
              },
            },
            ...(canSeeAll
              ? {}
              : {
                  AND: [
                    {
                      OR: [
                        ...(caller?.unitId ? [{ unitId: caller.unitId }] : []),
                        { role: { code: { in: foundationRoleCodes } } },
                      ],
                    },
                  ],
                }),
          },
        },
      },
      select: {
        id: true,
        name: true,
        unit: { select: { id: true, name: true } },
        userRoles: {
          where: { isActive: true },
          select: { role: { select: { code: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const wantedRole = callerId
      ? this.suggestSupervisorRole(await this.activeRoleCodes(callerId))
      : null;

    return rows.map(({ userRoles, ...u }) => ({
      ...u,
      roleCodes: (userRoles ?? []).map((r) => r.role.code),
      // Ditandai, bukan dipaksakan — frontend memilihnya lebih dulu dan
      // pengguna tetap bebas menggantinya.
      suggested:
        wantedRole !== null && (userRoles ?? []).some((r) => r.role.code === wantedRole),
    }));
  }

  async getPKs(userId: string, query: { status?: string }) {
    const status =
      query.status && Object.values(PlanStatus).includes(query.status as PlanStatus)
        ? (query.status as PlanStatus)
        : undefined;

    return prisma.performanceAgreement.findMany({
      where: {
        OR: [{ userId }, { supervisorId: userId }],
        status,
      },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
        indicators: true,
        evaluations: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPKById(id: string) {
    return prisma.performanceAgreement.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        strategicPlan: { select: { id: true, title: true } },
        indicators: {
          include: {
            refIndicator: { select: { id: true, title: true } },
            refStrategicIndicator: { select: { id: true, name: true } },
          },
        },
        evaluations: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    });
  }

  async deletePK(
    id: string,
    caller:
      | string
      | { id: string; isAdmin?: boolean; roleCode?: string | null; unitId?: string | null },
    isAdminLegacy?: boolean
  ) {
    const callerObj =
      typeof caller === 'string'
        ? { id: caller, isAdmin: !!isAdminLegacy, roleCode: undefined, unitId: null }
        : caller;

    return prisma.$transaction(async (tx) => {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM "performance_agreements" WHERE id = ${id} FOR UPDATE`;
      }

      const pk = await tx.performanceAgreement.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, unitId: true } },
          strategicPlan: { select: { unitId: true } },
        },
      });
      if (!pk) throw Errors.notFound('PK');

      if (pk.status === PlanStatus.APPROVED || pk.status === PlanStatus.PROPOSED) {
        throw Errors.conflict('Only DRAFT performance agreements can be deleted');
      }

      // Unit yang memiliki PK ditentukan dari RENCANA yang diimplementasikannya
      // (strategicPlan.unitId), bukan dari unit asal pegawai (user.unitId) —
      // konsisten dengan assertUnitScope. Admin unit pemilik rencana boleh
      // menghapus; admin unit asal pegawai (jika berbeda) tidak.
      const ownerUnitId = pk.strategicPlan?.unitId ?? pk.user?.unitId;

      const isOwner = pk.userId === callerObj.id;
      const isSuperAdmin = callerObj.roleCode === 'SUPER_ADMIN';
      const isSameUnitAdmin =
        !!callerObj.isAdmin &&
        callerObj.unitId !== null &&
        callerObj.unitId !== undefined &&
        ownerUnitId === callerObj.unitId;

      if (!isOwner && !isSuperAdmin && !isSameUnitAdmin) {
        throw Errors.forbidden('You do not have permission to delete this performance agreement');
      }

      return tx.performanceAgreement.delete({ where: { id } });
    });
  }

  async updatePK(
    id: string,
    caller: { id: string; isAdmin: boolean; roleCode?: string; unitId?: string | null },
    data: { notes?: string; supervisorId?: string; strategicPlanId?: string }
  ) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, caller.id, caller.isAdmin, { ownerOnly: true });
    if (pk.status === PlanStatus.APPROVED) {
      throw Errors.badRequest('An approved PK can no longer be edited');
    }

    // Bug regresi #1 — perpindahan strategicPlanId lintas unit.
    //
    // assertUnitScope (dipanggil controller terhadap PK SAAT INI) menurunkan
    // unit pemilik PK dari strategicPlan.unitId, BUKAN dari user.unitId pegawai.
    // Jika pemindahan rencana dibiarkan tanpa validasi, PK bisa diinduk-kan ke
    // rencana milik unit lain: PK itu menyusup ke laporan unit lain sekaligus
    // hilang dari laporan unit pemilik aslinya. Validasi rencana TUJUAN dengan
    // aturan scope yang sama seperti assertUnitScope.
    if (data.strategicPlanId !== undefined) {
      await this.assertPlanUnitInScope(data.strategicPlanId, caller);
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: {
        notes: data.notes,
        supervisorId: data.supervisorId,
        strategicPlanId: data.strategicPlanId,
      },
      include: {
        user: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Pastikan sebuah rencana strategis berada dalam scope unit pemanggil.
   *
   * Aturan ini identik dengan `assertUnitScope`: unit yang boleh menyentuh
   * sebuah rencana (dan PK yang menginduk padanya) ditentukan oleh
   * `strategicPlan.unitId`, dan peran lintas unit (yayasan, pengasuh, direktur,
   * super admin) dilepaskan lewat `seesAllUnits`. Tidak ada admin unit lain —
   * bahkan admin unit asal pegawai — yang boleh memindahkan PK ke rencana milik
   * unit lain.
   */
  private async assertPlanUnitInScope(
    planId: string,
    caller: { roleCode?: string; unitId?: string | null }
  ): Promise<void> {
    if (seesAllUnits(caller)) return;
    const plan = await prisma.strategicPlan.findUnique({
      where: { id: planId },
      select: { unitId: true },
    });
    if (!plan) return; // baris tidak ada → lapisan db yang menjawab 404
    if (!caller.unitId || plan.unitId !== caller.unitId) {
      throw Errors.forbidden(
        'Perjanjian Kinerja tidak dapat dipindahkan ke rencana milik unit lain'
      );
    }
  }

  /** Kode peran aktif milik seorang pengguna (belum kedaluwarsa). */
  private async activeRoleCodes(userId: string): Promise<string[]> {
    const now = new Date();
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { role: { select: { code: true } } },
    });
    return assignments.map((a) => a.role.code);
  }

  /**
   * Akar rantai PK.
   *
   * TIDAK ADA organ yayasan di sini — dan itu disengaja. Kalau Ketua Pengurus
   * diberi PK tingkat lembaga, isinya persis sasaran RKA Yayasan yang sudah
   * disahkan Pembina: dua dokumen untuk satu kenyataan, yang cepat atau lambat
   * akan berselisih. Karena itu PK kepala sekolah menggantung langsung pada
   * **dokumen RKA**, bukan pada PK milik atasannya — lihat `createPK`.
   *
   * Tersisa super admin, murni sebagai jalan operasional.
   */
  private async isChainRoot(userId: string): Promise<boolean> {
    const codes = await this.activeRoleCodes(userId);
    return codes.some((c) => c === RoleCode.SUPER_ADMIN);
  }

  /**
   * RKA milik unit pengguna yang berlaku pada periode PK, bila ada.
   *
   * Mengembalikan null ketika unitnya memang tidak menyusun RKA sendiri —
   * itu keadaan yang sah, bukan kekurangan. RKA unit hanya perlu disusun bila
   * strukturnya besar atau ada kewajiban pelaporannya.
   */
  private async rkaUnitBerlaku(userId: string, periodStart: string, periodEnd: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { unitId: true },
    });
    if (!user?.unitId) return null;
    return prisma.strategicPlan.findFirst({
      where: {
        unitId: user.unitId,
        type: 'RKA',
        status: { notIn: [PlanStatus.DRAFT, PlanStatus.CANCELLED] },
        startDate: { lte: new Date(periodEnd) },
        endDate: { gte: new Date(periodStart) },
      },
      select: { id: true, title: true },
    });
  }

  /** True bila pengguna ini adalah organ yayasan yang memang tanpa PK. */
  private async isOrganTanpaPK(userId: string): Promise<boolean> {
    return (await this.alasanOrganTanpaPK(userId)) !== null;
  }

  /**
   * Alasan sebuah kedudukan organ yayasan TIDAK menyusun PK individu, atau
   * null bila ia memang menyusunnya.
   *
   * Yang ditolak adalah PK atas **kedudukan sebagai organ**. Orang yang juga
   * memegang jabatan kepegawaian (mis. seorang pengawas yayasan yang sekaligus
   * guru) tetap menyusun PK atas jabatan itu — karena itu penolakan hanya
   * berlaku bila SELURUH peran aktifnya adalah kedudukan organ.
   */
  private async alasanOrganTanpaPK(userId: string): Promise<string | null> {
    const codes = await this.activeRoleCodes(userId);
    if (codes.length === 0) return null;
    if (codes.some((c) => !(c in ORGAN_TANPA_PK))) return null;
    return ORGAN_TANPA_PK[codes[0] as keyof typeof ORGAN_TANPA_PK] ?? null;
  }

  async proposePK(id: string, callerId: string, isAdmin: boolean) {
    const pk = await prisma.performanceAgreement.findUnique({
      where: { id },
      include: { indicators: true },
    });

    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin, { ownerOnly: true });
    if (pk.status !== PlanStatus.DRAFT) {
      throw Errors.badRequest('Only a DRAFT PK can be proposed');
    }
    if (pk.indicators.length === 0) {
      throw Errors.badRequest('PK must have at least one indicator');
    }
    // Perjanjian Kinerja adalah kesepakatan antara pegawai dan atasannya.
    // Tanpa atasan penilai tidak ada yang bisa menyetujui maupun menilai
    // perilakunya, jadi PK-nya akan mati di tengah jalan. Ditolak di sini,
    // saat masih bisa diperbaiki, bukan nanti saat evaluasi.
    //
    // KECUALI puncak rantai. Organ yayasan tidak punya atasan DI DALAM sistem
    // ini, dan PK bawahan menuntut PK atasan yang SUDAH disetujui — jadi
    // menuntut atasan dari semua orang tanpa kecuali mengunci seluruh modul:
    // akarnya tak pernah bisa diajukan, sehingga tak satu pun PK di bawahnya
    // pernah bisa dibuat. PK puncak diajukan tanpa atasan dan disahkan admin.
    if (!pk.supervisorId && !(await this.isChainRoot(pk.userId))) {
      throw Errors.badRequest('Tetapkan atasan penilai sebelum mengajukan Perjanjian Kinerja');
    }

    const totalWeight = pk.indicators.reduce((sum, ind) => sum + ind.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw Errors.badRequest('Total weight of indicators must be 100%');
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: { status: PlanStatus.PROPOSED },
    });
  }

  async approvePK(id: string, callerId: string, isAdmin: boolean) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin, { supervisorOnly: true });
    if (pk.status !== PlanStatus.PROPOSED) {
      throw Errors.badRequest('Only a PROPOSED PK can be approved');
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: {
        status: PlanStatus.APPROVED,
        approvedAt: new Date(),
      },
    });
  }

  async rejectPK(id: string, callerId: string, isAdmin: boolean, revisionNotes: string) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin, { supervisorOnly: true });
    if (pk.status !== PlanStatus.PROPOSED) {
      throw Errors.badRequest('Only a PROPOSED PK can be sent back for revision');
    }

    return prisma.performanceAgreement.update({
      where: { id },
      data: { status: PlanStatus.DRAFT, revisionNotes },
    });
  }

  // ==================== INDICATORS ====================

  private async loadEditablePK(pkId: string, callerId: string, isAdmin: boolean) {
    const pk = await prisma.performanceAgreement.findUnique({ where: { id: pkId } });
    if (!pk) throw Errors.notFound('PK');
    this.assertAccess(pk, callerId, isAdmin);
    if (pk.status === PlanStatus.APPROVED) {
      throw Errors.badRequest('Indicators of an approved PK can no longer be changed');
    }
    return pk;
  }

  async createIndicator(
    callerId: string,
    isAdmin: boolean,
    data: {
      pkId: string;
      title: string;
      target: number;
      unit: string;
      weight: number;
      category: CascadingCategory;
      refIndicatorId?: string;
      refStrategicIndicatorId?: string;
      notes?: string;
      aggregation?: IndicatorAggregation;
    }
  ) {
    await this.loadEditablePK(data.pkId, callerId, isAdmin);

    // Cascading indicators must reference something above them.
    if (
      (data.category === CascadingCategory.DIRECT ||
        data.category === CascadingCategory.INDIRECT) &&
      !data.refIndicatorId &&
      !data.refStrategicIndicatorId
    ) {
      throw Errors.badRequest(
        'Direct/Indirect indicators must reference a superior PK indicator or a strategic plan indicator'
      );
    }

    return prisma.pKIndicator.create({
      data: {
        pkId: data.pkId,
        title: data.title,
        target: data.target,
        unit: data.unit,
        weight: data.weight,
        category: data.category,
        refIndicatorId: data.refIndicatorId,
        refStrategicIndicatorId: data.refStrategicIndicatorId,
        notes: data.notes,
        aggregation: data.aggregation ?? aggregationForUnit(data.unit),
      },
    });
  }

  async updateIndicator(
    id: string,
    callerId: string,
    isAdmin: boolean,
    data: Record<string, unknown>
  ) {
    const indicator = await prisma.pKIndicator.findUnique({ where: { id } });
    if (!indicator) throw Errors.notFound('Indicator');
    await this.loadEditablePK(indicator.pkId, callerId, isAdmin);

    return prisma.pKIndicator.update({ where: { id }, data });
  }

  async deleteIndicator(id: string, callerId: string, isAdmin: boolean) {
    const indicator = await prisma.pKIndicator.findUnique({ where: { id } });
    if (!indicator) throw Errors.notFound('Indicator');
    await this.loadEditablePK(indicator.pkId, callerId, isAdmin);

    return prisma.pKIndicator.delete({ where: { id } });
  }
}

export const pkService = new PerformanceAgreementService();
