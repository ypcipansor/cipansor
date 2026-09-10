import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { toast } from "sonner";

// Types
export interface MusyrifStudent {
  id: string;
  name: string;
  nisn: string;
  photo: string | null;
  class: string;
  room: string;
  gender: string;
  dormitoryId?: string;
  healthStatus?: "HEALTHY" | "SICK" | "RECOVERING";
  lastIbadahCheck?: string;
  todayViolations?: number;
}

export interface MusyrifStats {
  totalStudents: number;
  presentToday: number;
  sickToday: number;
  permissionToday: number;
  absentToday: number;
  violationsToday: number;
  ibadahCompletedToday: number;
  nightPatrolStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
}

export interface NightPatrolLog {
  id: string;
  room: string;
  status: "OK" | "ISSUE" | "EMPTY";
  notes?: string;
  checkedAt: string;
  studentCount: number;
  issues?: string[];
}

export interface HealthAlert {
  id: string;
  studentId: string;
  studentName: string;
  room: string;
  condition: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reportedAt: string;
  status: "ACTIVE" | "RESOLVED";
}

export interface QuickViolation {
  studentId: string;
  type: string;
  description?: string;
  severity: "RINGAN" | "SEDANG" | "BERAT";
}

// Fetch musyrif assigned students
export function useMusyrifStudents() {
  return useQuery({
    queryKey: ["musyrif", "students"],
    queryFn: async (): Promise<MusyrifStudent[]> => {
      try {
        const res = await api.get("/dormitories/my-students");
        return res.data.data || [];
      } catch (error) {
        return [];
      }
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Fetch musyrif daily stats
export function useMusyrifStats() {
  return useQuery({
    queryKey: ["musyrif", "stats"],
    queryFn: async (): Promise<MusyrifStats> => {
      try {
        // Fetch multiple endpoints in parallel
        const [studentsRes, attendanceRes, violationsRes, ibadahRes] =
          await Promise.allSettled([
            api.get("/dormitories/my-students"),
            api.get("/dormitories/attendance/today"),
            api.get("/violations", { params: { today: true } }),
            api.get("/ibadah", { params: { today: true } }),
          ]);

        const students =
          studentsRes.status === "fulfilled"
            ? studentsRes.value.data.data || []
            : [];
        const attendance =
          attendanceRes.status === "fulfilled"
            ? attendanceRes.value.data.data
            : null;
        const violations =
          violationsRes.status === "fulfilled"
            ? violationsRes.value.data
            : null;
        const ibadah =
          ibadahRes.status === "fulfilled" ? ibadahRes.value.data : null;

        return {
          totalStudents: students.length,
          presentToday: attendance?.present || 0,
          sickToday: attendance?.sick || 0,
          permissionToday: attendance?.permission || 0,
          absentToday: attendance?.absent || 0,
          violationsToday: violations?.data?.length || violations?.total || 0,
          ibadahCompletedToday: ibadah?.data?.length || ibadah?.total || 0,
          nightPatrolStatus: attendance?.nightPatrolStatus || "NOT_STARTED",
        };
      } catch (error) {
        return {
          totalStudents: 0,
          presentToday: 0,
          sickToday: 0,
          permissionToday: 0,
          absentToday: 0,
          violationsToday: 0,
          ibadahCompletedToday: 0,
          nightPatrolStatus: "NOT_STARTED",
        };
      }
    },
    staleTime: 1 * 60 * 1000, // 1 minute - more frequent for real-time feel
    refetchInterval: 2 * 60 * 1000,
  });
}

// Fetch health alerts
export function useHealthAlerts() {
  return useQuery({
    queryKey: ["musyrif", "health-alerts"],
    queryFn: async (): Promise<HealthAlert[]> => {
      try {
        const res = await api.get("/health/alerts", {
          params: { status: "ACTIVE" },
        });
        return res.data.data || [];
      } catch (error) {
        // Return empty if endpoint doesn't exist yet
        return [];
      }
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Fetch night patrol logs
export function useNightPatrolLogs() {
  return useQuery({
    queryKey: ["musyrif", "night-patrol"],
    queryFn: async (): Promise<NightPatrolLog[]> => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const res = await api.get("/dormitories/patrol-logs", {
          params: { date: today },
        });
        return res.data.data || [];
      } catch (error) {
        return [];
      }
    },
    staleTime: 1 * 60 * 1000,
  });
}

// Create quick violation
export function useQuickViolation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: QuickViolation) => {
      const res = await api.post("/violations", {
        studentId: data.studentId,
        violationType: data.type,
        description: data.description,
        severity: data.severity,
        date: new Date().toISOString(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Pelanggaran berhasil dicatat");
      queryClient.invalidateQueries({ queryKey: ["musyrif", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["violations"] });
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || "Gagal mencatat pelanggaran",
      );
    },
  });
}

// Create quick ibadah entry
export function useQuickIbadah() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentId: string;
      type: string;
      status: "COMPLETED" | "MISSED";
    }) => {
      const res = await api.post("/ibadah", {
        studentId: data.studentId,
        ibadahType: data.type,
        status: data.status,
        date: new Date().toISOString(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Ibadah berhasil dicatat");
      queryClient.invalidateQueries({ queryKey: ["musyrif", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["ibadah"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal mencatat ibadah");
    },
  });
}

// Create patrol log
export function useCreatePatrolLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      room: string;
      status: "OK" | "ISSUE" | "EMPTY";
      notes?: string;
      studentCount: number;
    }) => {
      const res = await api.post("/dormitories/patrol-logs", {
        ...data,
        checkedAt: new Date().toISOString(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Patrol log berhasil disimpan");
      queryClient.invalidateQueries({ queryKey: ["musyrif", "night-patrol"] });
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || "Gagal menyimpan patrol log",
      );
    },
  });
}

// Report health issue
export function useReportHealthIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentId: string;
      condition: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
      notes?: string;
    }) => {
      const res = await api.post("/health/reports", {
        ...data,
        reportedAt: new Date().toISOString(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Laporan kesehatan berhasil dikirim");
      queryClient.invalidateQueries({ queryKey: ["musyrif", "health-alerts"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Gagal mengirim laporan");
    },
  });
}

// Combined dashboard hook
export function useMusyrifDashboard() {
  const students = useMusyrifStudents();
  const stats = useMusyrifStats();
  const healthAlerts = useHealthAlerts();
  const patrolLogs = useNightPatrolLogs();

  return {
    students: students.data,
    stats: stats.data,
    healthAlerts: healthAlerts.data,
    patrolLogs: patrolLogs.data,
    isLoading: students.isLoading || stats.isLoading,
    isError: students.isError && stats.isError,
    refetch: () => {
      students.refetch();
      stats.refetch();
      healthAlerts.refetch();
      patrolLogs.refetch();
    },
  };
}

// Common violation types for quick selection
export const VIOLATION_TYPES = [
  { value: "TERLAMBAT", label: "Terlambat", severity: "RINGAN" as const },
  { value: "BOLOS_SHOLAT", label: "Bolos Sholat", severity: "SEDANG" as const },
  {
    value: "KELUAR_TANPA_IZIN",
    label: "Keluar Tanpa Izin",
    severity: "SEDANG" as const,
  },
  { value: "GADGET", label: "Membawa Gadget", severity: "SEDANG" as const },
  { value: "BERKELAHI", label: "Berkelahi", severity: "BERAT" as const },
  { value: "MEROKOK", label: "Merokok", severity: "BERAT" as const },
  { value: "BULLYING", label: "Bullying", severity: "BERAT" as const },
  { value: "LAINNYA", label: "Lainnya", severity: "RINGAN" as const },
];

// Ibadah types for quick entry
export const IBADAH_TYPES = [
  { value: "SUBUH", label: "Sholat Subuh" },
  { value: "DZUHUR", label: "Sholat Dzuhur" },
  { value: "ASHAR", label: "Sholat Ashar" },
  { value: "MAGHRIB", label: "Sholat Maghrib" },
  { value: "ISYA", label: "Sholat Isya" },
  { value: "TAHAJUD", label: "Tahajud" },
  { value: "DHUHA", label: "Sholat Dhuha" },
  { value: "TILAWAH", label: "Tilawah" },
  { value: "DZIKIR", label: "Dzikir Pagi/Sore" },
];

// Patrol status helper
export function getPatrolStatusColor(status: string): string {
  switch (status) {
    case "OK":
      return "bg-green-100 text-green-700";
    case "ISSUE":
      return "bg-red-100 text-red-700";
    case "EMPTY":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

// Severity color helper
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case "RINGAN":
    case "LOW":
      return "bg-yellow-100 text-yellow-700";
    case "SEDANG":
    case "MEDIUM":
      return "bg-orange-100 text-orange-700";
    case "BERAT":
    case "HIGH":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
