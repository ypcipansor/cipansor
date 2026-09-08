/**
 * Portfolio React Query Hooks
 *
 * Hooks untuk manajemen portofolio digital siswa
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// =====================================
// TYPES
// =====================================

export interface Portfolio {
  id: string;
  studentId: string;
  title: string;
  type:
    | "ACADEMIC"
    | "P5_PROJECT"
    | "EXTRACURRICULAR"
    | "ACHIEVEMENT"
    | "ARTWORK"
    | "TAHFIDZ"
    | "OTHER";
  category?: string;
  description?: string;
  reflection?: string;
  academicYearId?: string;
  subjectId?: string;
  classId?: string;
  isPublic: boolean;
  isShowcase: boolean;
  score?: number;
  feedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    nisn: string;
    user: { name: string; email?: string };
    unit?: { id: string; name: string };
  };
  academicYear?: { id: string; name: string };
  reviewer?: { id: string; name: string };
  files?: PortfolioFile[];
  comments?: PortfolioComment[];
  _count?: { files: number; comments: number };
}

export interface PortfolioFile {
  id: string;
  portfolioId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize?: number;
  isCover: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface PortfolioComment {
  id: string;
  portfolioId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string };
}

export interface PortfolioType {
  value: string;
  label: string;
  icon: string;
}

export interface PortfolioCategories {
  ACADEMIC: string[];
  P5_PROJECT: string[];
  EXTRACURRICULAR: string[];
  ACHIEVEMENT: string[];
  ARTWORK: string[];
  TAHFIDZ: string[];
  OTHER: string[];
}

export interface PortfolioStatistics {
  total: number;
  byType: Record<string, number>;
  showcaseCount: number;
  reviewedCount: number;
  averageScore: number;
}

export interface StudentShowcase {
  student: {
    id: string;
    nisn: string;
    user: { name: string };
    unit: { name: string };
    photoUrl?: string;
  };
  portfolios: Portfolio[];
  achievements: any[];
  tahfidz: {
    totalRecords: number;
    totalAyah: number;
  };
}

// =====================================
// QUERY KEYS
// =====================================

export const portfolioKeys = {
  all: ["portfolio"] as const,
  types: () => [...portfolioKeys.all, "types"] as const,
  list: (params: any) => [...portfolioKeys.all, "list", params] as const,
  detail: (id: string) => [...portfolioKeys.all, "detail", id] as const,
  statistics: (params: any) =>
    [...portfolioKeys.all, "statistics", params] as const,
  showcase: (studentId: string) =>
    [...portfolioKeys.all, "showcase", studentId] as const,
};

// =====================================
// HOOKS - TYPES
// =====================================

export function usePortfolioTypes() {
  return useQuery({
    queryKey: portfolioKeys.types(),
    queryFn: async () => {
      const { data } = await api.get<{
        data: { types: PortfolioType[]; categories: PortfolioCategories };
      }>("/portfolio/types");
      return data.data;
    },
    staleTime: Infinity, // Static data
  });
}

// =====================================
// HOOKS - PORTFOLIO CRUD
// =====================================

export function usePortfolios(params?: {
  studentId?: string;
  unitId?: string;
  type?: string;
  category?: string;
  academicYearId?: string;
  isPublic?: boolean;
  isShowcase?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: portfolioKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Portfolio[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>("/portfolio", { params });
      return data;
    },
  });
}

export function usePortfolio(id: string) {
  return useQuery({
    queryKey: portfolioKeys.detail(id),
    queryFn: async () => {
      const { data } = await api.get<{ data: Portfolio }>(`/portfolio/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreatePortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      studentId: string;
      title: string;
      type: string;
      category?: string;
      description?: string;
      reflection?: string;
      academicYearId?: string;
      subjectId?: string;
      classId?: string;
      isPublic?: boolean;
      isShowcase?: boolean;
    }) => {
      const { data } = await api.post<{ data: Portfolio }>(
        "/portfolio",
        payload,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    },
  });
}

export function useUpdatePortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      title?: string;
      type?: string;
      category?: string;
      description?: string;
      reflection?: string;
      isPublic?: boolean;
      isShowcase?: boolean;
    }) => {
      const { data } = await api.put<{ data: Portfolio }>(
        `/portfolio/${id}`,
        payload,
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(variables.id),
      });
    },
  });
}

export function useDeletePortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/portfolio/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    },
  });
}

// =====================================
// HOOKS - FILES
// =====================================

export function useAddPortfolioFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      portfolioId,
      ...payload
    }: {
      portfolioId: string;
      fileName: string;
      fileUrl: string;
      fileType: string;
      fileSize?: number;
      isCover?: boolean;
    }) => {
      const { data } = await api.post<{ data: PortfolioFile }>(
        `/portfolio/${portfolioId}/files`,
        payload,
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(variables.portfolioId),
      });
    },
  });
}

export function useUpdatePortfolioFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fileId,
      portfolioId,
      ...payload
    }: {
      fileId: string;
      portfolioId: string;
      isCover?: boolean;
      sortOrder?: number;
    }) => {
      const { data } = await api.patch<{ data: PortfolioFile }>(
        `/portfolio/files/${fileId}`,
        payload,
      );
      return { ...data.data, portfolioId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(data.portfolioId),
      });
    },
  });
}

export function useDeletePortfolioFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fileId,
      portfolioId,
    }: {
      fileId: string;
      portfolioId: string;
    }) => {
      await api.delete(`/portfolio/files/${fileId}`);
      return portfolioId;
    },
    onSuccess: (portfolioId) => {
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(portfolioId),
      });
    },
  });
}

// =====================================
// HOOKS - COMMENTS
// =====================================

export function useAddPortfolioComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      portfolioId,
      content,
    }: {
      portfolioId: string;
      content: string;
    }) => {
      const { data } = await api.post<{ data: PortfolioComment }>(
        `/portfolio/${portfolioId}/comments`,
        { content },
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(variables.portfolioId),
      });
    },
  });
}

export function useUpdatePortfolioComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      portfolioId,
      content,
    }: {
      commentId: string;
      portfolioId: string;
      content: string;
    }) => {
      const { data } = await api.patch<{ data: PortfolioComment }>(
        `/portfolio/comments/${commentId}`,
        { content },
      );
      return { ...data.data, portfolioId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(data.portfolioId),
      });
    },
  });
}

export function useDeletePortfolioComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      portfolioId,
    }: {
      commentId: string;
      portfolioId: string;
    }) => {
      await api.delete(`/portfolio/comments/${commentId}`);
      return portfolioId;
    },
    onSuccess: (portfolioId) => {
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(portfolioId),
      });
    },
  });
}

// =====================================
// HOOKS - REVIEW
// =====================================

export function useReviewPortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      score,
      feedback,
    }: {
      id: string;
      score?: number;
      feedback?: string;
    }) => {
      const { data } = await api.post<{ data: Portfolio }>(
        `/portfolio/${id}/review`,
        {
          score,
          feedback,
        },
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: portfolioKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    },
  });
}

// =====================================
// HOOKS - STATISTICS & SHOWCASE
// =====================================

export function usePortfolioStatistics(params?: {
  studentId?: string;
  unitId?: string;
  academicYearId?: string;
}) {
  return useQuery({
    queryKey: portfolioKeys.statistics(params),
    queryFn: async () => {
      const { data } = await api.get<{ data: PortfolioStatistics }>(
        "/portfolio/statistics/summary",
        {
          params,
        },
      );
      return data.data;
    },
  });
}

export function useStudentShowcase(studentId: string) {
  return useQuery({
    queryKey: portfolioKeys.showcase(studentId),
    queryFn: async () => {
      const { data } = await api.get<{ data: StudentShowcase }>(
        `/portfolio/showcase/${studentId}`,
      );
      return data.data;
    },
    enabled: !!studentId,
  });
}
