import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// The Indonesian administrative-region models are accessed via a loose cast to
// keep parity with the original handlers (the generated delegates vary by
// client version); the shapes below are stable.
const db = prisma as any;

export interface RegionListFilters {
  provinceId?: string;
  regencyId?: string;
  districtId?: string;
  search?: string;
}

function nameFilter(search?: string) {
  return search ? { name: { contains: search, mode: 'insensitive' as const } } : {};
}

// ==================== PROVINCES ====================

export function listProvinces() {
  return db.province.findMany({ orderBy: { name: 'asc' } });
}

export function getProvinceById(id: string) {
  return db.province.findUnique({
    where: { id },
    include: { regencies: { select: { id: true, name: true, code: true } } },
  });
}

export function createProvince(data: { code: string; name: string }) {
  return db.province.create({ data });
}

// ==================== REGENCIES ====================

export function listRegencies(filters: RegionListFilters) {
  const whereClause: Prisma.RegencyWhereInput = { ...nameFilter(filters.search) };
  if (filters.provinceId) whereClause.provinceId = filters.provinceId;
  return db.regency.findMany({
    where: whereClause,
    include: { province: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
}

export function getRegencyById(id: string) {
  return db.regency.findUnique({
    where: { id },
    include: {
      province: { select: { id: true, name: true } },
      districts: { select: { id: true, name: true, code: true } },
    },
  });
}

export function createRegency(data: { code: string; name: string; provinceId: string }) {
  return db.regency.create({ data });
}

// ==================== DISTRICTS ====================

export function listDistricts(filters: RegionListFilters) {
  const whereClause: Prisma.DistrictWhereInput = { ...nameFilter(filters.search) };
  if (filters.regencyId) whereClause.regencyId = filters.regencyId;
  return db.district.findMany({
    where: whereClause,
    include: { regency: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
}

export function getDistrictById(id: string) {
  return db.district.findUnique({
    where: { id },
    include: {
      regency: { select: { id: true, name: true } },
      villages: { select: { id: true, name: true, code: true } },
    },
  });
}

export function createDistrict(data: { code: string; name: string; regencyId: string }) {
  return db.district.create({ data });
}

// ==================== VILLAGES ====================

export async function listVillages(filters: RegionListFilters & { page: number; limit: number }) {
  const whereClause: Prisma.VillageWhereInput = { ...nameFilter(filters.search) };
  if (filters.districtId) whereClause.districtId = filters.districtId;

  const { page, limit } = filters;
  const [villages, total] = await Promise.all([
    db.village.findMany({
      where: whereClause,
      include: { district: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.village.count({ where: whereClause }),
  ]);

  return {
    villages,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export function getVillageById(id: string) {
  return db.village.findUnique({
    where: { id },
    include: {
      district: { include: { regency: { include: { province: true } } } },
    },
  });
}

export function createVillage(data: {
  code: string;
  name: string;
  districtId: string;
  postalCode?: string;
}) {
  return db.village.create({ data });
}
