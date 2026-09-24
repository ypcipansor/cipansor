import { prisma } from '@/lib/prisma';
import { ShariaCompliance, Prisma, UserRole } from '@prisma/client';
import { Errors } from '@/middleware/error';
import { pengawasanService } from '../pengawasan/pengawasan.service';

export class SyariahService {
  async getCompliances(unitId: string | undefined, query: { category?: string; status?: string }) {
    return prisma.shariaCompliance.findMany({
      where: {
        ...(unitId ? { unitId } : {}),
        ...(query.category && { category: query.category as any }),
        ...(query.status && { status: query.status as any }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getComplianceById(id: string) {
    return prisma.shariaCompliance.findUnique({ where: { id } });
  }

  async createCompliance(data: any) {
    const { unitId, ...rest } = data;
    const compliance = await prisma.shariaCompliance.create({
      data: {
        ...rest,
        unit: { connect: { id: unitId } },
      },
      include: { unit: true },
    });

    // Auto-escalate if score is low
    if (compliance.score !== null && compliance.score < 70) {
      await this.handleLowCompliance(compliance);
    }

    return compliance;
  }

  async updateCompliance(id: string, data: any, reviewedById?: string) {
    const compliance = await prisma.shariaCompliance.update({
      where: { id },
      data: {
        ...data,
        ...(reviewedById && { reviewedBy: { connect: { id: reviewedById } } }),
      },
    });

    if (compliance.score !== null && compliance.score < 70) {
      await this.handleLowCompliance(compliance);
    }

    return compliance;
  }

  async deleteCompliance(id: string) {
    return prisma.shariaCompliance.delete({ where: { id } });
  }

  async createShariaAudit(data: any) {
    return prisma.$transaction(async (tx) => {
      const audit = await tx.shariaAudit.create({
        data: {
          compliance: { connect: { id: data.complianceId } },
          auditor: { connect: { id: data.auditorId } },
          auditDate: new Date(data.auditDate),
          findings: data.findings,
          score: data.score,
          recommendation: data.recommendations,
        },
        include: {
          compliance: true,
        },
      });

      // Update compliance item status based on score
      let status: 'COMPLIANT' | 'PARTIALLY' | 'NON_COMPLIANT' = 'COMPLIANT';
      if (data.score < 50) status = 'NON_COMPLIANT';
      else if (data.score < 80) status = 'PARTIALLY';

      const updatedCompliance = await tx.shariaCompliance.update({
        where: { id: data.complianceId },
        data: {
          score: data.score,
          status,
        },
      });

      // Integration: Trigger Internal Audit finding if score is below 70
      if (data.score < 70) {
        const internalAudit = await tx.internalAudit.findFirst({
          where: {
            unitId: audit.compliance.unitId,
            status: 'PLANNED',
            auditType: 'SYARIAH',
          },
        });

        if (internalAudit) {
          await pengawasanService.createFinding({
            auditId: internalAudit.id,
            findingNumber: `SYR-${Date.now()}`,
            title: `Ketidakpatuhan Syariah: ${updatedCompliance.title}`,
            description: `Audit menemukan skor ${data.score} pada komponen ${updatedCompliance.title}. Temuan: ${data.findings}`,
            severity: data.score < 50 ? 'CRITICAL' : 'MAJOR',
            category: 'SYARIAH',
          });
        }
      }

      return audit;
    });
  }

  private async handleLowCompliance(compliance: ShariaCompliance) {
    try {
      // Find or create an internal audit for this unit
      let audit = await prisma.internalAudit.findFirst({
        where: {
          unitId: compliance.unitId,
          status: 'PLANNED',
          auditType: 'SYARIAH',
        },
      });

      if (!audit) {
        audit = await prisma.internalAudit.create({
          data: {
            unitId: compliance.unitId,
            title: 'Audit Kepatuhan Syariah Otomatis',
            description: 'Audit dipicu oleh skor kepatuhan rendah.',
            auditType: 'SYARIAH',
            status: 'PLANNED',
            plannedDate: new Date(),
            leadAuditorId: (compliance as any).reviewedById || 'system',
          },
        });
      }

      await prisma.auditFinding.create({
        data: {
          auditId: audit.id,
          findingNumber: `SYR-${compliance.category}-${Date.now()}`,
          title: `Kepatuhan Rendah: ${compliance.title}`,
          description: `Skor kepatuhan ${compliance.score} berada di bawah ambang batas minimum (70).`,
          severity: 'MAJOR',
          category: 'SHARIA_COMPLIANCE',
        },
      });
    } catch (err) {
      console.error('[Syariah] Failed to handle low compliance escalation:', err);
    }
  }

  async getComplianceSummary(unitId: string | undefined) {
    const compliances = await prisma.shariaCompliance.findMany({
      where: unitId ? { unitId } : {},
    });

    const scoredItems = compliances.filter((c) => c.score !== null);
    const totalScore = scoredItems.reduce((sum, c) => sum + (c.score || 0), 0);
    const avgScore = scoredItems.length > 0 ? totalScore / scoredItems.length : 0;

    const categories = ['MUAMALAH', 'IBADAH', 'AKHLAK', 'TARBIYAH'];
    const byCategory: Record<string, any> = {};

    categories.forEach((cat) => {
      const items = compliances.filter((c) => c.category === cat);
      const scored = items.filter((c) => c.score !== null);
      const catSum = scored.reduce((sum, c) => sum + (c.score || 0), 0);
      byCategory[cat] = {
        total: items.length,
        averageScore: scored.length > 0 ? Math.round((catSum / scored.length) * 100) / 100 : 0,
      };
    });

    const summary = {
      unitId,
      total: compliances.length,
      compliant: compliances.filter((c) => c.status === 'COMPLIANT').length,
      partial: compliances.filter((c) => c.status === 'PARTIALLY').length,
      nonCompliant: compliances.filter((c) => c.status === 'NON_COMPLIANT').length,
      underReview: compliances.filter((c) => c.status === 'UNDER_REVIEW').length,
      averageScore: Math.round(avgScore * 100) / 100,
      byCategory,
      // Keep legacy fields for compatibility
      totalItems: compliances.length,
      compliantItems: compliances.filter((c) => c.status === 'COMPLIANT').length,
      nonCompliantItems: compliances.filter((c) => c.status === 'NON_COMPLIANT').length,
    };

    // Integration: Auto-trigger audit if average score is critical.
    // Only for a concrete unit — the cross-unit (global) view is read-only.
    if (unitId && summary.averageScore > 0 && summary.averageScore < 60) {
      await this.triggerEmergencyAudit(unitId, summary.averageScore);
    }

    return summary;
  }

  private async triggerEmergencyAudit(unitId: string, score: number) {
    try {
      const title = 'Audit Syariah Darurat (Skor Unit Rendah)';
      const existing = await prisma.internalAudit.findFirst({
        where: { unitId, title, status: 'PLANNED' },
      });

      if (!existing) {
        // InternalAudit requires a lead auditor. For this system-triggered
        // emergency audit, assign a unit admin (falling back to a super admin).
        const leadAuditor = await prisma.user.findFirst({
          where: {
            isActive: true,
            OR: [{ unitId, role: UserRole.UNIT_ADMIN }, { role: UserRole.SUPER_ADMIN }],
          },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });

        if (leadAuditor) {
          await prisma.internalAudit.create({
            data: {
              unitId,
              title,
              description: `Audit darurat dipicu oleh skor rata-rata unit yang sangat rendah (${score}).`,
              auditType: 'SYARIAH',
              status: 'PLANNED',
              plannedDate: new Date(),
              leadAuditorId: leadAuditor.id,
            },
          });
        }
      }
    } catch (err) {
      console.error('[Syariah] Failed to trigger emergency audit:', err);
    }
  }
}

export const syariahService = new SyariahService();
