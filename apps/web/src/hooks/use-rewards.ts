import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { PaginatedResponse } from "@/lib/api";

// Types
export type RewardCategory =
  | "ACADEMIC"
  | "RELIGIOUS"
  | "EXTRACURRICULAR"
  | "SOCIAL"
  | "OTHER";

export interface RewardType {
  id: string;
  name: string;
  description?: string;
  category: RewardCategory;
  points: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Reward {
  id: string;
  studentId: string;
  rewardTypeId: string;
  date: string;
  description?: string;
  givenById: string;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    name: string;
    nisn: string;
    class?: { name: string };
    unit?: { name: string };
    totalRewardPoints?: number;
  };
  rewardType?: RewardType;
  givenBy?: { name: string };
}

// Constants
export const REWARD_CATEGORIES: {
  value: RewardCategory;
  label: string;
  color: string;
}[] = [
  { value: "ACADEMIC", label: "Akademik", color: "bg-blue-100 text-blue-800" },
  {
    value: "RELIGIOUS",
    label: "Keagamaan",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "EXTRACURRICULAR",
    label: "Ekstrakurikuler",
    color: "bg-purple-100 text-purple-800",
  },
  { value: "SOCIAL", label: "Sosial", color: "bg-orange-100 text-orange-800" },
  { value: "OTHER", label: "Lainnya", color: "bg-gray-100 text-gray-800" },
];

// Reward Types Hooks
export function useRewardTypes(params?: {
  category?: RewardCategory;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: ["reward-types", params],
    queryFn: async () => {
      const response = await api.get<{ data: RewardType[] }>(
        "/rewards/categories",
        { params },
      );
      return response.data.data;
    },
  });
}

export function useRewardType(id: string) {
  return useQuery({
    queryKey: ["reward-types", id],
    queryFn: async () => {
      const response = await api.get<RewardType>(`/rewards/categories/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateRewardType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      category: RewardCategory;
      points: number;
      isActive?: boolean;
    }) => {
      const response = await api.post<RewardType>("/rewards/categories", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reward-types"] });
    },
  });
}

export function useUpdateRewardType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        category?: RewardCategory;
        points?: number;
        isActive?: boolean;
      };
    }) => {
      const response = await api.put<RewardType>(`/rewards/categories/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reward-types"] });
    },
  });
}

export function useDeleteRewardType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/rewards/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reward-types"] });
    },
  });
}

// Rewards Hooks
export function useRewards(params?: {
  page?: number;
  limit?: number;
  studentId?: string;
  rewardTypeId?: string;
  category?: RewardCategory;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ["rewards", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Reward>>("/rewards", {
        params,
      });
      return response.data;
    },
  });
}

export function useReward(id: string) {
  return useQuery({
    queryKey: ["rewards", id],
    queryFn: async () => {
      const response = await api.get<Reward>(`/rewards/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useStudentRewards(studentId: string) {
  return useQuery({
    queryKey: ["rewards", "student", studentId],
    queryFn: async () => {
      const response = await api.get<Reward[]>(`/rewards/student/${studentId}`);
      return response.data;
    },
    enabled: !!studentId,
  });
}

export function useCreateReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentId: string;
      rewardTypeId: string;
      date: string;
      description?: string;
    }) => {
      const response = await api.post<Reward>("/rewards", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
    },
  });
}

export function useUpdateReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        rewardTypeId?: string;
        date?: string;
        description?: string;
      };
    }) => {
      const response = await api.put<Reward>(`/rewards/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
    },
  });
}

export function useDeleteReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/rewards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
    },
  });
}

// Reward Summary Hooks
export function useRewardSummary(params?: {
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ["rewards", "summary", params],
    queryFn: async () => {
      const response = await api.get<{
        totalRewards: number;
        byCategory: { category: RewardCategory; count: number }[];
        topRewardTypes: { rewardTypeId: string; name: string; count: number }[];
        topStudents: {
          studentId: string;
          name: string;
          count: number;
          points: number;
        }[];
      }>("/rewards/summary", { params });
      return response.data;
    },
  });
}

export function useStudentRewardPoints(studentId: string) {
  return useQuery({
    queryKey: ["rewards", "points", studentId],
    queryFn: async () => {
      const response = await api.get<{
        totalPoints: number;
        rewards: Reward[];
      }>(`/rewards/student/${studentId}/points`);
      return response.data;
    },
    enabled: !!studentId,
  });
}
