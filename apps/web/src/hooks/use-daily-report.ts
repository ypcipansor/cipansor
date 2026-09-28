import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, uploadApi } from "@/lib/api";
import type {
  CreateDailyReportInput,
  UpdateDailyReportInput,
  BulkCreateDailyReportsInput,
  BulkCreateDailyReportsResult,
  ConfirmDailyReportInput,
  StudentDailySummaryQuery,
  ClassDailySummaryQuery,
  DailyReport,
  DailyMood,
} from "@cipansor/shared";

// The request contract is @cipansor/shared's (schemas/daily-report.ts): dates
// are calendar days "yyyy-MM-dd", and the API takes the unit and the academic
// year from the pupil and the day.
export type {
  DailyReport,
  DailyMood,
  CreateDailyReportInput,
  UpdateDailyReportInput,
  BulkCreateDailyReportsInput,
};

interface DailyReportListResponse {
  data: DailyReport[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

interface DailyReportResponse {
  data: DailyReport;
}

interface StudentDailySummaryResponse {
  data: {
    student: {
      id: string;
      nisn: string;
      user: { name: string };
    };
    period: {
      month: number;
      year: number;
      startDate: string;
      endDate: string;
    };
    statistics: {
      totalReports: number;
      confirmedByParent: number;
      moodDistribution: Record<string, number>;
      mealStats: {
        meal: Record<string, number>;
        snack: Record<string, number>;
      };
      averageNapDuration: number | null;
    };
    reports: DailyReport[];
  };
}

/** Dates are calendar days, "yyyy-MM-dd". */
interface DailyReportListQuery {
  page?: number;
  limit?: number;
  studentId?: string;
  unitId?: string;
  classId?: string;
  academicYearId?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  mood?: DailyMood;
  search?: string;
}

// API Functions
const dailyReportKeys = {
  all: ["daily-reports"] as const,
  lists: () => [...dailyReportKeys.all, "list"] as const,
  list: (filters: DailyReportListQuery) =>
    [...dailyReportKeys.lists(), filters] as const,
  details: () => [...dailyReportKeys.all, "detail"] as const,
  detail: (id: string) => [...dailyReportKeys.details(), id] as const,
  summaries: () => [...dailyReportKeys.all, "summary"] as const,
  studentSummary: (filters: StudentDailySummaryQuery) =>
    [...dailyReportKeys.summaries(), "student", filters] as const,
  classSummary: (filters: ClassDailySummaryQuery) =>
    [...dailyReportKeys.summaries(), "class", filters] as const,
};

// Hooks

export function useDailyReportList(query: DailyReportListQuery) {
  return useQuery({
    queryKey: dailyReportKeys.list(query),
    queryFn: async () => {
      // A filter left empty ("" before a child or a class is picked) is no
      // filter; sent as-is it is an invalid id and the API refuses the list.
      const params = Object.fromEntries(
        Object.entries(query).filter(([, value]) => value !== ""),
      );
      const { data } = await api.get<DailyReportListResponse>("/daily-report", {
        params,
      });
      return data;
    },
  });
}

/**
 * Stores picked photos through POST /upload and answers with what a report
 * keeps: the URL the API gave each file, and its caption.
 */
export function useUploadDailyReportPhotos() {
  return useMutation({
    mutationFn: async (
      photos: { file?: File; caption?: string }[],
    ): Promise<NonNullable<CreateDailyReportInput["photos"]>> =>
      Promise.all(
        photos
          .filter((photo): photo is { file: File; caption?: string } =>
            Boolean(photo.file),
          )
          .map(async (photo) => {
            const { data } = await uploadApi.uploadFile(photo.file);
            return {
              url: data.data.url,
              caption: photo.caption?.trim() || undefined,
            };
          }),
      ),
  });
}

// Alias for backward compatibility if needed, though best to update call sites
export const useDailyReports = useDailyReportList;

export function useDailyReport(id: string) {
  return useQuery({
    queryKey: dailyReportKeys.detail(id),
    queryFn: async () => {
      const { data } = await api.get<DailyReportResponse>(
        `/daily-report/${id}`,
      );
      return data.data;
    },
    enabled: !!id,
  });
}

// Helper to get photos from a report (since they are embedded)
export function useDailyReportPhotos(reportId: string) {
  const { data: report, ...rest } = useDailyReport(reportId);
  return {
    data: report?.photos || [],
    ...rest,
  };
}

export function useStudentDailySummary(query: StudentDailySummaryQuery) {
  return useQuery({
    queryKey: dailyReportKeys.studentSummary(query),
    queryFn: async () => {
      const { data } = await api.get<StudentDailySummaryResponse>(
        "/daily-report/summary/student",
        { params: query },
      );
      return data.data;
    },
    enabled: !!query.studentId,
  });
}

export function useClassDailySummary(query: ClassDailySummaryQuery) {
  return useQuery({
    queryKey: dailyReportKeys.classSummary(query),
    queryFn: async () => {
      const { data } = await api.get("/daily-report/summary/class", {
        params: query,
      });
      return data.data;
    },
    enabled: !!query.unitId || !!query.classId,
  });
}

export function useCreateDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDailyReportInput) => {
      const { data } = await api.post<DailyReportResponse>(
        "/daily-report",
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.summaries() });
    },
  });
}

export function useBulkCreateDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: BulkCreateDailyReportsInput,
    ): Promise<BulkCreateDailyReportsResult> => {
      const { data } = await api.post("/daily-report/bulk", input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.summaries() });
    },
  });
}

// Alias for compatibility
export const useBulkCreateDailyReports = useBulkCreateDailyReport;

/**
 * What to tell the teacher after a class's day is saved: how many reports
 * were made, and how many pupils were left as they were (a report already
 * existed that day, or the pupil is not theirs).
 */
export function describeBulkResult(result: BulkCreateDailyReportsResult): {
  created: string;
  skipped?: string;
} {
  return {
    created: `${result.created} laporan harian dibuat`,
    skipped:
      result.failed > 0
        ? `${result.failed} siswa dilewati: laporan tanggal itu sudah ada atau siswa tidak ditemukan`
        : undefined,
  };
}

export function useUpdateDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateDailyReportInput;
    }) => {
      const { data: res } = await api.put<DailyReportResponse>(
        `/daily-report/${id}`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.summaries() });
    },
  });
}

export function useDeleteDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/daily-report/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.summaries() });
    },
  });
}

export function useAddParentNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: ConfirmDailyReportInput;
    }) => {
      const { data: res } = await api.post(`/daily-report/${id}/confirm`, data);
      return res.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dailyReportKeys.summaries() });
    },
  });
}
