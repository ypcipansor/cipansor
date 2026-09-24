/**
 * Executive Dashboard Hooks
 * Real-time data fetching for yayasan-level executive dashboard
 * Aggregates data across all educational units
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { STUDENT_STATUS } from "@cipansor/shared";

// Types
export interface UnitStats {
  unitId: string;
  unitName: string;
  realm: string;
  totalStudents: number;
  activeStudents: number;
  totalTeachers: number;
  attendanceRate: number;
  todayPresent: number;
  todayAbsent: number;
}

export interface EnrollmentTrend {
  month: string;
  year: number;
  TK: number;
  SDIT: number;
  SMPIT: number;
  SMAQ: number;
  Pesantren: number;
  total: number;
}

export interface AttendanceByUnit {
  unit: string;
  unitId: string;
  rate: number;
  present: number;
  absent: number;
  sick: number;
  excused: number;
  total: number;
  color: string;
}

export interface FinanceSummary {
  totalBilled: number;
  totalPaid: number;
  totalUnpaid: number;
  collectionRate: number;
  monthlyRevenue: {
    month: string;
    amount: number;
  }[];
  byUnit: {
    unitId: string;
    unitName: string;
    billed: number;
    paid: number;
    rate: number;
  }[];
}

export interface TahfidzSummary {
  totalHafidz: number;
  totalKhatam: number;
  averageJuz: number;
  topStudents: {
    id: string;
    name: string;
    unitName: string;
    totalJuz: number;
    totalAyah: number;
  }[];
  progressByUnit: {
    unitId: string;
    unitName: string;
    averageJuz: number;
    totalStudents: number;
  }[];
}

export interface ExecutiveAlert {
  id: string;
  type: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  unitId?: string;
  unitName?: string;
  category: string;
  timestamp: string;
  isRead: boolean;
}

export interface ExecutiveStats {
  totalStudents: number;
  activeStudents: number;
  totalTeachers: number;
  totalStaff: number;
  totalUnits: number;
  totalClasses: number;
  overallAttendanceRate: number;
  studentsGrowth: number;
  academicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
}

// Unit color mapping
const UNIT_COLORS: Record<string, string> = {
  TK_QURAN: "#22c55e",
  SD_IT: "#3b82f6",
  SMP_IT: "#f59e0b",
  SMA_QURAN: "#8b5cf6",
  PESANTREN: "#ec4899",
};

const getUnitColor = (realm: string): string => {
  return UNIT_COLORS[realm] || "#6b7280";
};

const getUnitShortName = (realm: string): string => {
  const names: Record<string, string> = {
    TK_QURAN: "TK",
    SD_IT: "SDIT",
    SMP_IT: "SMPIT",
    SMA_QURAN: "SMAQ",
    PESANTREN: "Pesantren",
  };
  return names[realm] || realm;
};

/**
 * Hook for fetching overall executive stats
 */
export function useExecutiveStats() {
  return useQuery({
    queryKey: ["executive", "stats"],
    queryFn: async (): Promise<ExecutiveStats> => {
      // Get overall stats without unit filter (yayasan level)
      const response = await apiClient.get("/dashboard/stats");
      return response.data.data;
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // 5 minutes
  });
}

/**
 * Hook for fetching stats per unit for comparison
 */
export function useUnitComparison() {
  // First get all units
  const unitsQuery = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const response = await apiClient.get("/units");
      return response.data.data || response.data;
    },
    staleTime: 300000, // 5 minutes
  });

  const units = unitsQuery.data || [];

  // Fetch stats for each unit
  const unitStatsQueries = useQueries({
    queries: units.map((unit: any) => ({
      queryKey: ["dashboard", "quick-stats", unit.id],
      queryFn: async () => {
        const response = await apiClient.get("/dashboard/quick-stats", {
          params: { unitId: unit.id },
        });
        return {
          unitId: unit.id,
          unitName: unit.name,
          // `/units` returns `type`, not `realm`; reading only `realm` left the
          // realm undefined and collapsed every per-unit label to `undefined`.
          realm: unit.realm ?? unit.type,
          ...response.data.data,
        };
      },
      enabled: !!unit.id,
      staleTime: 60000,
    })),
  });

  const unitStats: UnitStats[] = unitStatsQueries
    .filter((q) => q.data)
    .map((q) => q.data as UnitStats);

  const isLoading =
    unitsQuery.isLoading || unitStatsQueries.some((q) => q.isLoading);

  return {
    data: unitStats,
    units: units,
    isLoading,
    refetch: () => {
      unitsQuery.refetch();
      unitStatsQueries.forEach((q) => q.refetch());
    },
  };
}

/**
 * Hook for fetching attendance comparison across units
 */
export function useAttendanceByUnit() {
  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const response = await apiClient.get("/units");
      return response.data.data || response.data;
    },
  });

  const attendanceQueries = useQueries({
    queries: (units || []).map((unit: any) => ({
      queryKey: ["dashboard", "attendance", unit.id, "today"],
      queryFn: async () => {
        const today = new Date().toISOString().split("T")[0];
        const response = await apiClient.get("/dashboard/attendance", {
          params: {
            unitId: unit.id,
            startDate: today,
            endDate: today,
          },
        });
        const stats = response.data.data?.[0] || {
          present: 0,
          absent: 0,
          sick: 0,
          excused: 0,
        };
        const total = stats.present + stats.absent + stats.sick + stats.excused;
        const realm = unit.realm ?? unit.type;
        return {
          unit: getUnitShortName(realm),
          unitId: unit.id,
          rate: total > 0 ? Math.round((stats.present / total) * 100) : 0,
          present: stats.present,
          absent: stats.absent,
          sick: stats.sick,
          excused: stats.excused,
          total,
          color: getUnitColor(realm),
        };
      },
      enabled: !!unit.id,
      staleTime: 60000,
    })),
  });

  const data: AttendanceByUnit[] = attendanceQueries
    .filter((q) => q.data)
    .map((q) => q.data as AttendanceByUnit);

  return {
    data,
    isLoading: unitsLoading || attendanceQueries.some((q) => q.isLoading),
    refetch: () => attendanceQueries.forEach((q) => q.refetch()),
  };
}

/**
 * Hook for fetching enrollment trends over months
 */
export function useEnrollmentTrends(months: number = 6) {
  return useQuery({
    queryKey: ["executive", "enrollment-trends", months],
    queryFn: async (): Promise<EnrollmentTrend[]> => {
      // Get units first
      const unitsResponse = await apiClient.get("/units");
      const units = unitsResponse.data.data || unitsResponse.data;

      // Get students by unit with creation date for trend analysis
      const trends: EnrollmentTrend[] = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = date.toLocaleString("id-ID", { month: "short" });

        const trend: EnrollmentTrend = {
          month: monthName,
          year: date.getFullYear(),
          TK: 0,
          SDIT: 0,
          SMPIT: 0,
          SMAQ: 0,
          Pesantren: 0,
          total: 0,
        };

        // For each unit, get cumulative student count up to that month
        for (const unit of units) {
          const shortName = getUnitShortName(
            unit.realm,
          ) as keyof EnrollmentTrend;
          try {
            const response = await apiClient.get("/students", {
              params: {
                unitId: unit.id,
                status: STUDENT_STATUS.ACTIVE,
                limit: 1, // We just need the count
              },
            });
            // Use meta.total for count
            const count =
              response.data.meta?.pagination?.total ||
              response.data.meta?.total ||
              0;
            if (shortName in trend && typeof trend[shortName] === "number") {
              (trend as any)[shortName] = count;
            }
          } catch (e) {
            // Keep 0 for this unit
          }
        }

        trend.total =
          trend.TK + trend.SDIT + trend.SMPIT + trend.SMAQ + trend.Pesantren;
        trends.push(trend);
      }

      return trends;
    },
    staleTime: 300000, // 5 minutes (enrollment doesn't change frequently)
  });
}

/**
 * Hook for fetching finance summary across all units
 */
export function useFinanceSummary() {
  return useQuery({
    queryKey: ["executive", "finance-summary"],
    queryFn: async (): Promise<FinanceSummary> => {
      // Get overall finance stats
      const response = await apiClient.get("/dashboard/finance");
      const data = response.data.data;

      const totalBilled = data.totalBilled || 0;
      const totalPaid = data.totalPaid || 0;
      const totalUnpaid = data.totalUnpaid || 0;

      return {
        totalBilled,
        totalPaid,
        totalUnpaid,
        collectionRate:
          totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0,
        monthlyRevenue: data.monthlyRevenue || [],
        byUnit: data.byUnit || [],
      };
    },
    staleTime: 300000,
  });
}

/**
 * Hook for fetching tahfidz summary for executive view
 */
export function useTahfidzSummary() {
  return useQuery({
    queryKey: ["executive", "tahfidz-summary"],
    queryFn: async (): Promise<TahfidzSummary> => {
      const response = await apiClient.get("/dashboard/tahfidz");
      const data = response.data.data;

      return {
        totalHafidz: data.totalStudentsWithRecords || 0,
        totalKhatam: data.totalKhatam || 0,
        averageJuz: data.averageJuz || 0,
        topStudents: (data.topStudents || []).map((s: any) => ({
          id: s.id || s.studentId,
          name: s.name || s.studentName,
          unitName: s.unitName || "Unknown",
          totalJuz: s.totalJuz || s.juzCount || 0,
          totalAyah: s.totalAyah || s.totalAyat || 0,
        })),
        progressByUnit: data.progressByUnit || [],
      };
    },
    staleTime: 300000,
  });
}

/**
 * Hook for fetching executive alerts
 */
export function useExecutiveAlerts() {
  return useQuery({
    queryKey: ["executive", "alerts"],
    queryFn: async (): Promise<ExecutiveAlert[]> => {
      try {
        const response = await apiClient.get("/dashboard/metrics");
        const alerts = response.data.data?.alerts || [];
        return alerts.map((alert: any, index: number) => ({
          // `Date.now()` alone is not unique: alerts mapped in the same tick all
          // collapsed onto one React key and React warned about duplicates.
          id: alert.id || `alert-${index}`,
          type: alert.severity || alert.type || "INFO",
          message: alert.message,
          unitId: alert.unitId,
          unitName: alert.unitName,
          category: alert.metricType || alert.category || "system",
          timestamp: alert.timestamp || new Date().toISOString(),
          isRead: alert.isRead || false,
        }));
      } catch {
        return [];
      }
    },
    staleTime: 30000, // 30 seconds for alerts
    refetchInterval: 60000, // 1 minute
  });
}

/**
 * Combined hook for executive dashboard
 */
export function useExecutiveDashboard() {
  const stats = useExecutiveStats();
  const unitComparison = useUnitComparison();
  const attendanceByUnit = useAttendanceByUnit();
  const enrollmentTrends = useEnrollmentTrends(6);
  const financeSummary = useFinanceSummary();
  const tahfidzSummary = useTahfidzSummary();
  const alerts = useExecutiveAlerts();

  const isLoading =
    stats.isLoading ||
    unitComparison.isLoading ||
    attendanceByUnit.isLoading ||
    enrollmentTrends.isLoading;

  const refetchAll = () => {
    stats.refetch();
    unitComparison.refetch();
    attendanceByUnit.refetch();
    enrollmentTrends.refetch();
    financeSummary.refetch();
    tahfidzSummary.refetch();
    alerts.refetch();
  };

  return {
    stats: stats.data,
    unitComparison: unitComparison.data,
    units: unitComparison.units,
    attendanceByUnit: attendanceByUnit.data,
    enrollmentTrends: enrollmentTrends.data,
    financeSummary: financeSummary.data,
    tahfidzSummary: tahfidzSummary.data,
    alerts: alerts.data,
    isLoading,
    refetchAll,
  };
}

// Export helper functions
export { getUnitColor, getUnitShortName };
