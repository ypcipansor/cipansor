import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ResearchTheme, ResearchSubmission } from "@cipansor/shared";

export function useResearchThemes(params?: {
  unitId?: string;
  academicYearId?: string;
}) {
  return useQuery({
    queryKey: ["research-themes", params],
    queryFn: async () => {
      const { data } = await api.get("/research/themes", { params });
      return data.data as (ResearchTheme & {
        _count: { submissions: number };
      })[];
    },
  });
}

export function useResearchSubmission(id: string) {
  return useQuery({
    queryKey: ["research-submission", id],
    queryFn: async () => {
      const { data } = await api.get(`/research/submissions/${id}`);
      return data.data as ResearchSubmission & {
        student: { user: { name: string } };
        theme: ResearchTheme;
        references: any[];
      };
    },
    enabled: !!id,
  });
}

export function useCreateResearchSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      themeId: string;
      title: string;
      abstract?: string;
      content?: string;
    }) => {
      const { data } = await api.post("/research/submissions", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research-submissions"] });
    },
  });
}

export function useAddReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      submissionId: string;
      bookTitle: string;
      author?: string;
      volume?: string;
      page?: string;
      contentQuote?: string;
    }) => {
      const { data } = await api.post("/research/references", payload);
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["research-submission", variables.submissionId],
      });
    },
  });
}
