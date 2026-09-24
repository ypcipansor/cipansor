import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  PracticumLessonPlan,
  CreatePracticumLessonPlan,
} from "@cipansor/shared";

export function useLessonPlans(params?: {
  studentId?: string;
  academicYearId?: string;
}) {
  return useQuery({
    queryKey: ["lesson-plans", params],
    queryFn: async () => {
      const { data } = await api.get("/practicum/lesson-plans", { params });
      return data.data as PracticumLessonPlan[];
    },
  });
}

export function useLessonPlan(id: string) {
  return useQuery({
    queryKey: ["lesson-plan", id],
    queryFn: async () => {
      const { data } = await api.get(`/practicum/lesson-plans/${id}`);
      return data.data as PracticumLessonPlan & {
        student: { user: { name: string } };
        evaluations: any[];
        schedules: any[];
      };
    },
    enabled: !!id,
  });
}

export function useCreateLessonPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePracticumLessonPlan) => {
      const { data } = await api.post("/practicum/lesson-plans", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-plans"] });
    },
  });
}

export function useReviewLessonPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      status: string;
      reviewNotes?: string;
    }) => {
      const { data } = await api.post(
        `/practicum/lesson-plans/${id}/review`,
        payload,
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["lesson-plans"] });
      queryClient.invalidateQueries({
        queryKey: ["lesson-plan", variables.id],
      });
    },
  });
}
