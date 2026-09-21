import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export class LingkunganService {
  // ==================== PROGRAMS ====================

  async createProgram(data: {
    title: string;
    description?: string;
    category: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    picId?: string;
    unitId: string;
  }) {
    return prisma.environmentProgram.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        budget: data.budget ? new Prisma.Decimal(data.budget) : undefined,
        pic: data.picId ? { connect: { id: data.picId } } : undefined,
        unit: { connect: { id: data.unitId } },
      },
      include: {
        unit: { select: { id: true, name: true } },
        pic: { select: { id: true, name: true } },
      },
    });
  }

  async getPrograms(unitId: string, query: { status?: string; category?: string }) {
    const where: Prisma.EnvironmentProgramWhereInput = { unitId };
    if (query.status) where.status = query.status as any;
    if (query.category) where.category = query.category;

    return prisma.environmentProgram.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        pic: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProgramById(id: string) {
    return prisma.environmentProgram.findUnique({
      where: { id },
      include: {
        unit: { select: { id: true, name: true } },
        pic: { select: { id: true, name: true } },
      },
    });
  }

  async updateProgram(id: string, data: any) {
    const { picId, ...rest } = data;
    const updateData: any = { ...rest };
    if (picId) updateData.pic = { connect: { id: picId } };
    else if (picId === null) updateData.pic = { disconnect: true };
    if (rest.startDate) updateData.startDate = new Date(rest.startDate);
    if (rest.endDate) updateData.endDate = new Date(rest.endDate);
    if (rest.budget !== undefined) updateData.budget = new Prisma.Decimal(rest.budget);

    return prisma.environmentProgram.update({
      where: { id },
      data: updateData,
      include: {
        unit: { select: { id: true, name: true } },
        pic: { select: { id: true, name: true } },
      },
    });
  }

  async deleteProgram(id: string) {
    return prisma.environmentProgram.delete({ where: { id } });
  }

  // ==================== WASTE MANAGEMENT ====================

  async createWasteRecord(data: {
    category: 'ORGANIC' | 'INORGANIC' | 'B3' | 'PAPER' | 'ELECTRONIC' | 'OTHER';
    weight: number;
    method: string;
    recordDate: string;
    notes?: string;
    unitId: string;
    recordedById: string;
  }) {
    return prisma.wasteManagement.create({
      data: {
        category: data.category,
        weight: data.weight,
        method: data.method,
        recordDate: new Date(data.recordDate),
        notes: data.notes,
        unit: { connect: { id: data.unitId } },
        recordedBy: { connect: { id: data.recordedById } },
      },
      include: {
        recordedBy: { select: { id: true, name: true } },
      },
    });
  }

  async getWasteRecords(unitId: string, limit = 50) {
    return prisma.wasteManagement.findMany({
      where: { unitId },
      include: {
        recordedBy: { select: { id: true, name: true } },
      },
      orderBy: { recordDate: 'desc' },
      take: limit,
    });
  }

  async getWasteSummary(unitId: string) {
    const records = await prisma.wasteManagement.findMany({
      where: { unitId },
      select: { category: true, weight: true, method: true },
    });

    const byCategory: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let totalWeight = 0;

    for (const r of records) {
      byCategory[r.category] = (byCategory[r.category] || 0) + r.weight;
      byMethod[r.method] = (byMethod[r.method] || 0) + r.weight;
      totalWeight += r.weight;
    }

    // Integration: Carbon Footprint Estimation (kg CO2e)
    const emissionFactors: Record<string, number> = {
      ORGANIC: 0.2,
      INORGANIC: 0.1,
      B3: 0.5,
      PAPER: 0.05,
      ELECTRONIC: 0.8,
      OTHER: 0.3,
    };

    let estimatedCarbonSavings = 0;
    for (const category in byCategory) {
      const factor = emissionFactors[category] || 0.3;
      estimatedCarbonSavings += byCategory[category] * factor;
    }

    return {
      totalWeight,
      totalRecords: records.length,
      byCategory,
      byMethod,
      estimatedCarbonSavings: Math.round(estimatedCarbonSavings * 100) / 100,
    };
  }

  // ==================== GREEN CAMPUS INDICATORS ====================

  async createIndicator(data: {
    name: string;
    category: string;
    targetValue: number;
    currentValue?: number;
    carbonEmissions?: number;
    unit: string;
    period: string;
    recordDate: string;
    notes?: string;
    unitId: string;
  }) {
    return prisma.greenCampusIndicator.create({
      data: {
        name: data.name,
        category: data.category,
        targetValue: data.targetValue,
        currentValue: data.currentValue || 0,
        carbonEmissions: data.carbonEmissions,
        unit: data.unit,
        period: data.period,
        recordDate: new Date(data.recordDate),
        notes: data.notes,
        unitRel: { connect: { id: data.unitId } },
      },
    });
  }

  async getIndicators(unitId: string) {
    return prisma.greenCampusIndicator.findMany({
      where: { unitId },
      orderBy: [{ category: 'asc' }, { recordDate: 'desc' }],
    });
  }

  async updateIndicator(id: string, data: Prisma.GreenCampusIndicatorUpdateInput) {
    return prisma.greenCampusIndicator.update({ where: { id }, data });
  }

  async deleteIndicator(id: string) {
    return prisma.greenCampusIndicator.delete({ where: { id } });
  }
}

export const lingkunganService = new LingkunganService();
