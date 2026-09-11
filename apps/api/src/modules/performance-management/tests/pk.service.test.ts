import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    performanceAgreement: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pKEvaluation: {
      findUnique: vi.fn(),
    },
    userRoleAssignment: {
      findMany: vi.fn(),
    },
    strategicPlan: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    pKIndicator: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { pkService } from '../pk.service';

const mocked = prisma as unknown as {
  user: Record<string, ReturnType<typeof vi.fn>>;
  userRoleAssignment: Record<string, ReturnType<typeof vi.fn>>;
  strategicPlan: Record<string, ReturnType<typeof vi.fn>>;
  performanceAgreement: Record<string, ReturnType<typeof vi.fn>>;
  pKEvaluation: Record<string, ReturnType<typeof vi.fn>>;
  pKIndicator: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

describe('PerformanceAgreementService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getSupervisors unit scoping', () => {
    it('filters userRoles to caller unit OR foundation roles for unit-pinned callers', async () => {
      mocked.user.findMany.mockResolvedValue([]);
      await pkService.getSupervisors({ roleCode: 'SDIT_GURU', unitId: 'unit-sdit' });

      expect(mocked.user.findMany).toHaveBeenCalledTimes(1);
      const queryWhere = mocked.user.findMany.mock.calls[0][0].where;
      // Top-level User.unitId is NOT filtered; unit filtering happens inside
      // userRoles.some.AND[0].OR (unit caller OR foundation-scope role).
      expect(queryWhere.unitId).toBeUndefined();
      const some = queryWhere.userRoles.some;
      expect(some.unitId).toBeUndefined();
      const scopeOr = some.AND[0].OR;
      // Branch 1: caller's own unit.
      expect(scopeOr[0]).toEqual({ unitId: 'unit-sdit' });
      // Branch 2: foundation-scope roles (unitless org assignments included).
      expect(scopeOr[1].role.code.in).toContain('YAYASAN_KETUA');
      expect(scopeOr[1].role.code.in).toContain('SUPER_ADMIN');
    });

    it('unassigned non-global callers still see foundation-scope supervisors', async () => {
      mocked.user.findMany.mockResolvedValue([]);
      await pkService.getSupervisors({ roleCode: 'SDIT_GURU', unitId: undefined });

      expect(mocked.user.findMany).toHaveBeenCalledTimes(1);
      const queryWhere = mocked.user.findMany.mock.calls[0][0].where;
      expect(queryWhere.unitId).toBeUndefined();
      const some = queryWhere.userRoles.some;
      expect(some.unitId).toBeUndefined();
      const scopeOr = some.AND[0].OR;
      // No caller unit to pin to; only the foundation-scope branch remains.
      expect(scopeOr).toHaveLength(1);
      expect(scopeOr[0].role.code.in).toContain('SUPER_ADMIN');
    });

    it('allows cross-unit / foundation roles to query supervisors across all role unit assignments', async () => {
      mocked.user.findMany.mockResolvedValue([]);
      await pkService.getSupervisors({ roleCode: 'YAYASAN_KETUA', unitId: 'unit-sdit' });

      expect(mocked.user.findMany).toHaveBeenCalledTimes(1);
      const queryWhere = mocked.user.findMany.mock.calls[0][0].where;
      expect(queryWhere.unitId).toBeUndefined();
      // Global caller: no unit boundary at all.
      expect(queryWhere.userRoles.some.unitId).toBeUndefined();
      expect(queryWhere.userRoles.some.AND).toBeUndefined();
    });

    // Bug regresi #3 — atasan yayasan hilang dari daftar. Assignment organ
    // yayasan (mis. YAYASAN_KETUA) tidak punya unitId, sehingga pemanggil
    // ber-unit tidak pernah melihatnya. Hasil dari findMany yang memuat user
    // ber-role YAYASAN_KETUA (assignment tanpa unit) harus sampai ke hasil
    // getSupervisors.
    it('memuat user ber-role yayasan (assignment tanpa unit) sebagai calon atasan', async () => {
      mocked.user.findMany.mockResolvedValue([
        {
          id: 'user-ketua',
          name: 'Ketua Pengurus',
          unit: null,
          userRoles: [{ role: { code: 'YAYASAN_KETUA' } }],
        },
      ]);

      mocked.userRoleAssignment.findMany.mockResolvedValue([
        { role: { code: 'SDIT_KEPALA_SEKOLAH' } },
      ]);

      const result = await pkService.getSupervisors(
        { roleCode: 'SDIT_KEPALA_SEKOLAH', unitId: 'unit-sdit' },
        'caller-kepala'
      );

      expect(result.map((s) => s.id)).toContain('user-ketua');
      expect(result.find((s) => s.id === 'user-ketua')).toMatchObject({
        name: 'Ketua Pengurus',
        roleCodes: ['YAYASAN_KETUA'],
      });
      // Pemanggil kepala unit diindukkan pada Ketua Pengurus → ditandai disarankan.
      expect(result.find((s) => s.id === 'user-ketua')?.suggested).toBe(true);
    });
  });

  describe('deletePK', () => {
    let mockQueryRaw: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockQueryRaw = vi.fn().mockResolvedValue([]);
      mocked.$transaction.mockImplementation(async (cb: any) =>
        cb({
          ...prisma,
          $queryRaw: mockQueryRaw,
        })
      );
    });

    it('successfully deletes a DRAFT PK by its owner after acquiring row lock', async () => {
      const callOrder: string[] = [];
      mockQueryRaw.mockImplementation(async () => {
        callOrder.push('$queryRaw');
        return [];
      });
      mocked.performanceAgreement.findUnique.mockImplementation(async () => {
        callOrder.push('findUnique');
        return {
          id: 'pk-1',
          userId: 'u-owner',
          status: 'DRAFT',
        };
      });
      mocked.performanceAgreement.delete.mockResolvedValue({ id: 'pk-1' });

      await pkService.deletePK('pk-1', 'u-owner', false);

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      const sqlStrings = mockQueryRaw.mock.calls[0][0];
      expect(sqlStrings.join('')).toContain('SELECT id FROM "performance_agreements" WHERE id =');
      expect(sqlStrings.join('')).toContain('FOR UPDATE');
      expect(callOrder).toEqual(['$queryRaw', 'findUnique']);
      expect(mocked.performanceAgreement.delete).toHaveBeenCalledWith({ where: { id: 'pk-1' } });
    });

    it('rejects deletion if PK is not found', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue(null);

      await expect(pkService.deletePK('pk-nonexistent', 'u-owner', false)).rejects.toThrow(
        /not found/i
      );
      expect(mocked.performanceAgreement.delete).not.toHaveBeenCalled();
    });

    it('rejects deletion if caller is neither owner nor admin', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-owner',
        status: 'DRAFT',
      });

      await expect(pkService.deletePK('pk-1', 'u-stranger', false)).rejects.toThrow();
      expect(mocked.performanceAgreement.delete).not.toHaveBeenCalled();
    });

    it('rejects deletion with 409 Conflict when PK is already APPROVED', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-owner',
        status: 'APPROVED',
        user: { id: 'u-owner', unitId: 'unit-sdit' },
      });

      await expect(pkService.deletePK('pk-1', { id: 'u-owner' })).rejects.toThrow(/draft/i);
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mocked.performanceAgreement.delete).not.toHaveBeenCalled();
    });

    it('rejects deletion with 409 Conflict when PK is PROPOSED', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-owner',
        status: 'PROPOSED',
        user: { id: 'u-owner', unitId: 'unit-sdit' },
      });

      await expect(pkService.deletePK('pk-1', { id: 'u-owner' })).rejects.toThrow(/draft/i);
      expect(mocked.performanceAgreement.delete).not.toHaveBeenCalled();
    });

    it('blocks unit admin from deleting PK belonging to an employee in another unit (403 Forbidden)', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-smpit-employee',
        status: 'DRAFT',
        user: { id: 'u-smpit-employee', unitId: 'unit-smpit' },
      });

      await expect(
        pkService.deletePK('pk-1', {
          id: 'admin-sdit',
          isAdmin: true,
          roleCode: 'SDIT_ADMIN',
          unitId: 'unit-sdit',
        })
      ).rejects.toThrow(/permission|forbidden/i);
      expect(mocked.performanceAgreement.delete).not.toHaveBeenCalled();
    });

    it('allows unit admin to delete DRAFT PK belonging to an employee in the same unit', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
        user: { id: 'u-sdit-employee', unitId: 'unit-sdit' },
      });
      mocked.performanceAgreement.delete.mockResolvedValueOnce({ id: 'pk-1' });

      await pkService.deletePK('pk-1', {
        id: 'admin-sdit',
        isAdmin: true,
        roleCode: 'SDIT_ADMIN',
        unitId: 'unit-sdit',
      });

      expect(mocked.performanceAgreement.delete).toHaveBeenCalledWith({ where: { id: 'pk-1' } });
    });

    it('allows SUPER_ADMIN to delete DRAFT PK from any unit', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-smpit-employee',
        status: 'DRAFT',
        user: { id: 'u-smpit-employee', unitId: 'unit-smpit' },
      });
      mocked.performanceAgreement.delete.mockResolvedValueOnce({ id: 'pk-1' });

      await pkService.deletePK('pk-1', {
        id: 'superadmin',
        isAdmin: true,
        roleCode: 'SUPER_ADMIN',
        unitId: null,
      });

      expect(mocked.performanceAgreement.delete).toHaveBeenCalledWith({ where: { id: 'pk-1' } });
    });
    it("blocks admin of employee-origin unit from deleting a PK owned by another unit's plan (Bug regresi #2)", async () => {
      // Pegawai asal unit-sdit, tetapi PK mengimplementasikan rencana milik
      // unit-smpit (strategicPlan.unitId). Kepemilikan PK mengikuti pemilik
      // rencana, jadi admin unit-sdit (asal pegawai) TIDAK boleh menghapus.
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
        user: { id: 'u-sdit-employee', unitId: 'unit-sdit' },
        strategicPlan: { unitId: 'unit-smpit' },
      });

      await expect(
        pkService.deletePK('pk-1', {
          id: 'admin-sdit',
          isAdmin: true,
          roleCode: 'SDIT_ADMIN',
          unitId: 'unit-sdit',
        })
      ).rejects.toThrow(/permission|forbidden/i);
      expect(mocked.performanceAgreement.delete).not.toHaveBeenCalled();
    });

    it('allows admin of the plan-owning unit to delete a PK whose plan belongs to their unit (Bug regresi #2)', async () => {
      // Pegawai asal unit-sdit, tetapi rencana (dan karenanya PK) milik unit-smpit.
      // Admin unit-smpit (pemilik rencana) BOLEH menghapus.
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
        user: { id: 'u-sdit-employee', unitId: 'unit-sdit' },
        strategicPlan: { unitId: 'unit-smpit' },
      });
      mocked.performanceAgreement.delete.mockResolvedValueOnce({ id: 'pk-1' });

      await pkService.deletePK('pk-1', {
        id: 'admin-smpit',
        isAdmin: true,
        roleCode: 'SMPIT_ADMIN',
        unitId: 'unit-smpit',
      });

      expect(mocked.performanceAgreement.delete).toHaveBeenCalledWith({ where: { id: 'pk-1' } });
    });

    it('rejects deletion when PK becomes APPROVED after acquiring row lock (concurrent approval race)', async () => {
      // In deletePK, $queryRaw FOR UPDATE locks the row first, then findUnique reads the latest status under lock.
      // If a concurrent approval completes before or during lock acquisition, findUnique reads status: APPROVED.
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-owner',
        status: 'APPROVED',
        user: { id: 'u-owner', unitId: 'unit-sdit' },
      });

      await expect(pkService.deletePK('pk-1', 'u-owner', false)).rejects.toThrow(/draft/i);

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      const sqlStrings = mockQueryRaw.mock.calls[0][0];
      expect(sqlStrings.join('')).toContain('SELECT id FROM "performance_agreements" WHERE id =');
      expect(sqlStrings.join('')).toContain('FOR UPDATE');
      expect(mocked.performanceAgreement.delete).not.toHaveBeenCalled();
    });
  });

  describe('updatePK — strategicPlanId cross-unit scope (Bug regresi #1)', () => {
    it('menolak pemilik unit A memindahkan PK ke rencana milik unit B', async () => {
      // PK saat ini milik unit-sdit. Pemiliknya (bukan admin) mencoba memindah
      // ke rencana milik unit-smpit → harus ditolak, jangan sampai PK menyusup
      // ke laporan unit lain.
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
      });
      mocked.strategicPlan.findUnique.mockResolvedValueOnce({
        id: 'plan-smpit',
        unitId: 'unit-smpit',
      });

      await expect(
        pkService.updatePK(
          'pk-1',
          { id: 'u-sdit-employee', isAdmin: false, roleCode: 'SDIT_GURU', unitId: 'unit-sdit' },
          { notes: 'pindah', strategicPlanId: 'plan-smpit' }
        )
      ).rejects.toThrow(/unit lain/i);
      expect(mocked.performanceAgreement.update).not.toHaveBeenCalled();
    });

    it('mengizinkan admin unit pemilik rencana tujuan memindahkan PK ke rencana unitnya', async () => {
      // Admin unit-smpit (pemilik rencana tujuan) boleh memindahkan rencana
      // karena rencana tujuan berada dalam scope unitnya.
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
      });
      mocked.strategicPlan.findUnique.mockResolvedValueOnce({
        id: 'plan-smpit',
        unitId: 'unit-smpit',
      });
      mocked.performanceAgreement.update.mockResolvedValueOnce({ id: 'pk-1' });

      await pkService.updatePK(
        'pk-1',
        { id: 'admin-smpit', isAdmin: true, roleCode: 'SMPIT_ADMIN', unitId: 'unit-smpit' },
        { notes: 'pindah', strategicPlanId: 'plan-smpit' }
      );

      expect(mocked.performanceAgreement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pk-1' },
          data: expect.objectContaining({ strategicPlanId: 'plan-smpit' }),
        })
      );
    });

    it('pemindahan ke rencana dalam unit yang sama tetap lolos', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
      });
      mocked.strategicPlan.findUnique.mockResolvedValueOnce({
        id: 'plan-sdit-2',
        unitId: 'unit-sdit',
      });
      mocked.performanceAgreement.update.mockResolvedValueOnce({ id: 'pk-1' });

      await pkService.updatePK(
        'pk-1',
        { id: 'u-sdit-employee', isAdmin: false, roleCode: 'SDIT_GURU', unitId: 'unit-sdit' },
        { notes: 'ganti rencana sesama unit', strategicPlanId: 'plan-sdit-2' }
      );

      expect(mocked.performanceAgreement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ strategicPlanId: 'plan-sdit-2' }),
        })
      );
    });

    it('memindahkan ke rencana unit lain tetap ditolak untuk admin unit ASAL pegawai', async () => {
      // Pegawai asal unit-sdit, tetapi PK mengimplementasikan rencana unit-smpit
      // (strategicPlan.unitId). Admin unit-sdit (asal pegawai) memindah ke rencana
      // unit-smaq → rencana tujuan di luar unitnya, tetap ditolak.
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
      });
      mocked.strategicPlan.findUnique.mockResolvedValueOnce({
        id: 'plan-smaq',
        unitId: 'unit-smaq',
      });

      await expect(
        pkService.updatePK(
          'pk-1',
          { id: 'admin-sdit', isAdmin: true, roleCode: 'SDIT_ADMIN', unitId: 'unit-sdit' },
          { strategicPlanId: 'plan-smaq' }
        )
      ).rejects.toThrow(/unit lain/i);
      expect(mocked.performanceAgreement.update).not.toHaveBeenCalled();
    });

    it('peran lintas unit (SUPER_ADMIN) boleh memindahkan ke rencana unit mana pun', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValueOnce({
        id: 'pk-1',
        userId: 'u-sdit-employee',
        status: 'DRAFT',
      });
      mocked.performanceAgreement.update.mockResolvedValueOnce({ id: 'pk-1' });

      await pkService.updatePK(
        'pk-1',
        { id: 'superadmin', isAdmin: true, roleCode: 'SUPER_ADMIN', unitId: null },
        { strategicPlanId: 'plan-smpit' }
      );

      // seesAllUnits → tidak pernah menelusuri strategicPlan tujuan.
      expect(mocked.strategicPlan.findUnique).not.toHaveBeenCalled();
      expect(mocked.performanceAgreement.update).toHaveBeenCalled();
    });
  });

  describe('createPK cascading rule', () => {
    it('rejects a subordinate PK when the supervisor has no approved PK for the period', async () => {
      // Keduanya jabatan kepegawaian biasa, bukan organ yayasan — jalur
      // kaskade normal (`createPK` menanyakan peran pemilik lalu atasannya).
      mocked.userRoleAssignment.findMany.mockResolvedValue([{ role: { code: 'SMPIT_GURU' } }]);
      mocked.performanceAgreement.findFirst.mockResolvedValue(null);

      await expect(
        pkService.createPK({
          userId: 'u-staff',
          supervisorId: 'u-boss',
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-12-31T00:00:00.000Z',
        })
      ).rejects.toThrow(/approved PK/i);
      expect(mocked.performanceAgreement.create).not.toHaveBeenCalled();
    });

    it('links the subordinate PK to the supervisor PK when one exists', async () => {
      mocked.userRoleAssignment.findMany.mockResolvedValue([{ role: { code: 'SMPIT_GURU' } }]);
      mocked.performanceAgreement.findFirst.mockResolvedValue({ id: 'pk-boss' });
      mocked.performanceAgreement.create.mockResolvedValue({ id: 'pk-new' });

      await pkService.createPK({
        userId: 'u-staff',
        supervisorId: 'u-boss',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-12-31T00:00:00.000Z',
      });

      const args = mocked.performanceAgreement.create.mock.calls[0][0];
      expect(args.data.supervisorPk).toEqual({ connect: { id: 'pk-boss' } });
    });
  });

  describe('assertUnitScope', () => {
    // Lubang yang ditutup: assertAccess mulai dengan `if (isAdmin) return;`,
    // dan isAdmin benar untuk TKQ/SDIT/SMPIT/SMAQ_ADMIN. Tanpa penjaga ini
    // seorang SDIT_ADMIN bisa membaca, menyunting, menyetujui, dan menolak PK
    // milik SMP IT. Dulu hanya deletePK yang memeriksa unit — satu rute aman,
    // tujuh lainnya terbuka.
    it('menolak admin unit yang menyentuh PK milik unit lain', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        user: { unitId: 'unit-smpit' },
      });

      await expect(
        pkService.assertUnitScope(
          { pkId: 'pk-smpit' },
          {
            roleCode: 'SDIT_ADMIN',
            unitId: 'unit-sdit',
          }
        )
      ).rejects.toThrow(/unit lain/i);
    });

    it('mengizinkan admin unit pada PK di unitnya sendiri', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        user: { unitId: 'unit-sdit' },
      });

      await expect(
        pkService.assertUnitScope(
          { pkId: 'pk-sdit' },
          {
            roleCode: 'SDIT_ADMIN',
            unitId: 'unit-sdit',
          }
        )
      ).resolves.toBeUndefined();
    });

    it('melepaskan peran yang memang lintas unit tanpa menyentuh basis data', async () => {
      // Pengurus yayasan, pengasuh dan direktur pesantren, super admin.
      // Kalau ini salah, mereka justru terkunci dari unit yang mereka asuh.
      for (const roleCode of [
        'SUPER_ADMIN',
        'YAYASAN_KETUA',
        'PESANTREN_PENGASUH',
        'PESANTREN_DIREKTUR',
      ]) {
        await expect(
          pkService.assertUnitScope({ pkId: 'pk-mana-pun' }, { roleCode, unitId: null })
        ).resolves.toBeUndefined();
      }
      expect(mocked.performanceAgreement.findUnique).not.toHaveBeenCalled();
    });

    it('menolak pemanggil tanpa unit sama sekali', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        user: { unitId: 'unit-sdit' },
      });

      await expect(
        pkService.assertUnitScope({ pkId: 'pk-sdit' }, { roleCode: 'SDIT_GURU', unitId: null })
      ).rejects.toThrow(/unit lain/i);
    });

    it('menelusuri evaluasi sampai ke unit pemilik PK-nya', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        pk: { user: { unitId: 'unit-smpit' } },
      });

      await expect(
        pkService.assertUnitScope(
          { evaluationId: 'ev-1' },
          {
            roleCode: 'SDIT_ADMIN',
            unitId: 'unit-sdit',
          }
        )
      ).rejects.toThrow(/unit lain/i);
    });

    // Bug regresi #1 — cakupan unit PK ditentukan dari RENCANA (strategicPlan.unitId)
    // yang diimplementasikan, bukan dari unit asal pegawai. PK yang menginduk pada
    // RKA/Renstra unit lain adalah milik admin unit pemilik rencana, bukan admin
    // unit asal pegawai.
    it('mengizinkan admin unit TUJUAN (pemilik rencana) menyentuh PK lintas unit', async () => {
      // Pegawai PK berasal dari unit-smpit tetapi rencananya milik unit-sdit
      // (strategicPlan.unitId = unit-sdit). Admin unit tujuan BOLEH.
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        strategicPlan: { unitId: 'unit-sdit' },
        user: { unitId: 'unit-smpit' },
      });

      await expect(
        pkService.assertUnitScope(
          { pkId: 'pk-lintas' },
          {
            roleCode: 'SDIT_ADMIN',
            unitId: 'unit-sdit',
          }
        )
      ).resolves.toBeUndefined();
    });

    it('menolak admin unit ASAL (unit pegawai) menyentuh PK yang rencananya unit lain', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        strategicPlan: { unitId: 'unit-sdit' },
        user: { unitId: 'unit-smpit' },
      });

      await expect(
        pkService.assertUnitScope(
          { pkId: 'pk-lintas' },
          {
            roleCode: 'SMPIT_ADMIN',
            unitId: 'unit-smpit',
          }
        )
      ).rejects.toThrow(/unit lain/i);
    });

    it('fallback ke unit pegawai bila PK tidak mengacu rencana apa pun', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        strategicPlan: null,
        user: { unitId: 'unit-sdit' },
      });

      await expect(
        pkService.assertUnitScope(
          { pkId: 'pk-tanpa-rencana' },
          {
            roleCode: 'SDIT_ADMIN',
            unitId: 'unit-sdit',
          }
        )
      ).resolves.toBeUndefined();

      await expect(
        pkService.assertUnitScope(
          { pkId: 'pk-tanpa-rencana' },
          {
            roleCode: 'SMPIT_ADMIN',
            unitId: 'unit-smpit',
          }
        )
      ).rejects.toThrow(/unit lain/i);
    });

    it('evaluasi lintas unit juga di-scope oleh strategicPlan.unitId', async () => {
      mocked.pKEvaluation.findUnique.mockResolvedValue({
        pk: {
          strategicPlan: { unitId: 'unit-sdit' },
          user: { unitId: 'unit-smpit' },
        },
      });

      // Admin unit pemilik rencana boleh.
      await expect(
        pkService.assertUnitScope(
          { evaluationId: 'ev-lintas' },
          {
            roleCode: 'SDIT_ADMIN',
            unitId: 'unit-sdit',
          }
        )
      ).resolves.toBeUndefined();

      // Admin unit asal pegawai ditolak meski pegawai berasal dari unitnya.
      await expect(
        pkService.assertUnitScope(
          { evaluationId: 'ev-lintas' },
          {
            roleCode: 'SMPIT_ADMIN',
            unitId: 'unit-smpit',
          }
        )
      ).rejects.toThrow(/unit lain/i);
    });
  });

  describe('proposePK', () => {
    it('requires indicator weights to total 100', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: 'u-2',
        status: 'DRAFT',
        indicators: [{ weight: 60 }, { weight: 20 }],
      });

      await expect(pkService.proposePK('pk-1', 'u-1', false)).rejects.toThrow(/100/);
    });

    it('rejects a non-owner proposing someone else’s PK', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: 'u-2',
        status: 'DRAFT',
        indicators: [{ weight: 100 }],
      });

      await expect(pkService.proposePK('pk-1', 'u-intruder', false)).rejects.toThrow();
      // Even the supervisor cannot propose on the owner's behalf.
      await expect(pkService.proposePK('pk-1', 'u-2', false)).rejects.toThrow();
    });

    it('proposes a valid DRAFT PK', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: 'u-2',
        status: 'DRAFT',
        indicators: [{ weight: 70 }, { weight: 30 }],
      });
      mocked.performanceAgreement.update.mockResolvedValue({ id: 'pk-1', status: 'PROPOSED' });

      const result = await pkService.proposePK('pk-1', 'u-1', false);
      expect(result.status).toBe('PROPOSED');
    });

    it('menolak pengajuan PK yang belum punya atasan penilai', async () => {
      // Bukan formalitas. Tanpa atasan penilai, penilaian perilaku (SAFTI)
      // tidak pernah bisa diisi oleh siapa pun — assertAccess menuntut
      // supervisorId — sehingga behaviorScore tetap 0 dan skor akhir mentok
      // di 60 selamanya, tanpa satu pun pesan yang menjelaskan sebabnya.
      // Ditolak di sini, saat masih bisa diperbaiki.
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: null,
        status: 'DRAFT',
        indicators: [{ weight: 100 }],
      });

      mocked.userRoleAssignment.findMany.mockResolvedValue([{ role: { code: 'SMPIT_GURU' } }]);

      await expect(pkService.proposePK('pk-1', 'u-1', false)).rejects.toThrow(/atasan penilai/i);
      expect(mocked.performanceAgreement.update).not.toHaveBeenCalled();
    });

    it('mengizinkan PK PUNCAK RANTAI diajukan tanpa atasan penilai', async () => {
      // Tanpa pengecualian ini seluruh modul terkunci, dan tidak ada satu pun
      // uji yang menangkapnya karena semuanya memalsukan Prisma dan tidak
      // pernah menyusuri rantainya: PK bawahan menuntut PK atasan yang SUDAH
      // disetujui, sedangkan approvePK menuntut status PROPOSED. Kalau akar
      // rantai tidak pernah bisa diajukan, ia tidak pernah bisa disetujui,
      // sehingga TIDAK SATU PUN PK di bawahnya pernah bisa dibuat.
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-root',
        userId: 'u-ketua',
        supervisorId: null,
        status: 'DRAFT',
        indicators: [{ weight: 100 }],
      });
      mocked.userRoleAssignment.findMany.mockResolvedValue([{ role: { code: 'SUPER_ADMIN' } }]);
      mocked.performanceAgreement.update.mockResolvedValue({
        id: 'pk-root',
        status: 'PROPOSED',
      });

      const result = await pkService.proposePK('pk-root', 'u-ketua', false);
      expect(result.status).toBe('PROPOSED');
    });
  });

  describe('organ yayasan tidak menyusun PK individu', () => {
    const dto = {
      userId: 'u-organ',
      periodStart: '2027-01-01T00:00:00.000Z',
      periodEnd: '2027-12-31T00:00:00.000Z',
    };

    it.each([
      ['YAYASAN_PEMBINA', /mengesahkan|penilaian mandiri/i],
      ['YAYASAN_PENGAWAS', /independensi|laporan pengawasan/i],
      ['YAYASAN_KETUA', /kolektif kolegial|RKA Yayasan/i],
      ['YAYASAN_BENDAHARA', /kolektif kolegial|RKA Yayasan/i],
      ['YAYASAN_SEKRETARIS', /kolektif kolegial|RKA Yayasan/i],
    ])('menolak PK untuk %s dengan alasan yang menyebut sebabnya', async (code, pesan) => {
      mocked.userRoleAssignment.findMany.mockResolvedValue([{ role: { code } }]);

      await expect(pkService.createPK(dto)).rejects.toThrow(pesan);
      expect(mocked.performanceAgreement.create).not.toHaveBeenCalled();
    });

    it('TIDAK menolak orang yang juga memegang jabatan kepegawaian', async () => {
      // Seorang pengawas yayasan yang sekaligus guru tetap menyusun PK atas
      // jabatan gurunya. Yang ditolak adalah PK atas kedudukan organnya.
      mocked.userRoleAssignment.findMany.mockResolvedValue([
        { role: { code: 'YAYASAN_PENGAWAS' } },
        { role: { code: 'SMPIT_GURU' } },
      ]);
      mocked.performanceAgreement.create.mockResolvedValue({ id: 'pk-1' });

      await pkService.createPK(dto);
      expect(mocked.performanceAgreement.create).toHaveBeenCalled();
    });
  });

  describe('PK yang atasannya organ yayasan berjangkar pada dokumen RKA', () => {
    const dto = {
      userId: 'u-kepsek',
      supervisorId: 'u-ketua',
      periodStart: '2027-01-01T00:00:00.000Z',
      periodEnd: '2027-12-31T00:00:00.000Z',
    };

    const asRoles = (self: string[], supervisor: string[]) => {
      mocked.userRoleAssignment.findMany
        .mockResolvedValueOnce(self.map((code) => ({ role: { code } })))
        .mockResolvedValueOnce(supervisor.map((code) => ({ role: { code } })));
    };

    it('tidak menuntut PK atasan — menuntut dokumen rencananya', async () => {
      // Inilah yang mencegah duplikasi: Ketua Pengurus TIDAK diberi PK cermin
      // berisi sasaran RKA, jadi PK kepsek menggantung pada RKA-nya langsung.
      asRoles(['SMPIT_KEPALA_SEKOLAH'], ['YAYASAN_KETUA']);

      await expect(pkService.createPK(dto)).rejects.toThrow(/dokumen RKA\/Renstra/i);
      expect(mocked.performanceAgreement.findFirst).not.toHaveBeenCalled();
    });

    it('menolak dokumen rencana yang masih Draft', async () => {
      asRoles(['SMPIT_KEPALA_SEKOLAH'], ['YAYASAN_KETUA']);
      mocked.strategicPlan.findUnique.mockResolvedValue({ id: 'rka-1', status: 'DRAFT' });

      await expect(pkService.createPK({ ...dto, strategicPlanId: 'rka-1' })).rejects.toThrow(
        /Draft/i
      );
    });

    it('menerima RKA yang sudah disahkan, tanpa supervisorPk', async () => {
      asRoles(['SMPIT_KEPALA_SEKOLAH'], ['YAYASAN_KETUA']);
      mocked.strategicPlan.findUnique.mockResolvedValue({ id: 'rka-1', status: 'APPROVED' });
      mocked.user.findUnique.mockResolvedValue({ unitId: 'unit-smp' });
      mocked.strategicPlan.findFirst.mockResolvedValue(null); // unit belum punya RKA sendiri
      mocked.performanceAgreement.create.mockResolvedValue({ id: 'pk-kepsek' });

      await pkService.createPK({ ...dto, strategicPlanId: 'rka-1' });

      expect(mocked.performanceAgreement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ supervisorPk: undefined }),
        })
      );
    });

    it('menolak lompat ke RKA Yayasan bila unitnya sudah punya RKA sendiri', async () => {
      // RKA unit itu opsional — tetapi begitu ada, ia tidak boleh yatim.
      asRoles(['SDIT_KEPALA_SEKOLAH'], ['YAYASAN_KETUA']);
      mocked.strategicPlan.findUnique.mockResolvedValue({ id: 'rka-yayasan', status: 'APPROVED' });
      mocked.user.findUnique.mockResolvedValue({ unitId: 'unit-sd' });
      mocked.strategicPlan.findFirst.mockResolvedValue({
        id: 'rka-sd',
        title: 'RKA SD IT Cipansor 2027',
      });

      await expect(pkService.createPK({ ...dto, strategicPlanId: 'rka-yayasan' })).rejects.toThrow(
        /RKA SD IT Cipansor 2027/
      );
      expect(mocked.performanceAgreement.create).not.toHaveBeenCalled();
    });

    it('atasan BUKAN organ tetap wajib punya PK yang sudah disetujui', async () => {
      asRoles(['SMPIT_GURU'], ['SMPIT_KEPALA_SEKOLAH']);
      mocked.performanceAgreement.findFirst.mockResolvedValue(null);

      await expect(
        pkService.createPK({ ...dto, userId: 'u-guru', supervisorId: 'u-kepsek' })
      ).rejects.toThrow(/approved PK/i);
    });
  });

  describe('approvePK', () => {
    it('only the assigned supervisor may approve', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: 'u-boss',
        status: 'PROPOSED',
      });

      await expect(pkService.approvePK('pk-1', 'u-1', false)).rejects.toThrow();
      await expect(pkService.approvePK('pk-1', 'u-random', false)).rejects.toThrow();
      expect(mocked.performanceAgreement.update).not.toHaveBeenCalled();
    });

    it('rejects approval of a PK that is not PROPOSED', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: 'u-boss',
        status: 'DRAFT',
      });

      await expect(pkService.approvePK('pk-1', 'u-boss', false)).rejects.toThrow(/PROPOSED/);
    });

    it('supervisor approves a PROPOSED PK', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: 'u-boss',
        status: 'PROPOSED',
      });
      mocked.performanceAgreement.update.mockResolvedValue({ id: 'pk-1', status: 'APPROVED' });

      const result = await pkService.approvePK('pk-1', 'u-boss', false);
      expect(result.status).toBe('APPROVED');
      const updateArgs = mocked.performanceAgreement.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe('APPROVED');
      expect(updateArgs.data.approvedAt).toBeInstanceOf(Date);
    });
  });

  describe('indicators', () => {
    it('blocks indicator changes on an APPROVED PK', async () => {
      mocked.pKIndicator.findUnique.mockResolvedValue({ id: 'ind-1', pkId: 'pk-1' });
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: null,
        status: 'APPROVED',
      });

      await expect(
        pkService.updateIndicator('ind-1', 'u-1', false, { weight: 50 })
      ).rejects.toThrow(/approved/i);
      expect(mocked.pKIndicator.update).not.toHaveBeenCalled();
    });

    it('requires cascading indicators to reference a superior indicator', async () => {
      mocked.performanceAgreement.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'u-1',
        supervisorId: null,
        status: 'DRAFT',
      });

      await expect(
        pkService.createIndicator('u-1', false, {
          pkId: 'pk-1',
          title: 'Turunan kinerja atasan',
          target: 10,
          unit: 'dokumen',
          weight: 40,
          category: 'DIRECT' as never,
        })
      ).rejects.toThrow(/reference/i);
    });
  });
});
