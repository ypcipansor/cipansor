import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface RiskListFilters {
  unitId?: string;
  category?: string;
  riskLevel?: string;
  strategicPlanId?: string;
}

export const useRisks = (filters?: RiskListFilters) => {
  return useQuery({
    queryKey: ["risks", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.unitId) params.append("unitId", filters.unitId);
      if (filters?.category) params.append("category", filters.category);
      if (filters?.riskLevel) params.append("riskLevel", filters.riskLevel);
      if (filters?.strategicPlanId)
        params.append("strategicPlanId", filters.strategicPlanId);

      const res = await api.get(`/risk?${params}`);
      return res.data.data;
    },
  });
};

export const useRisk = (id: string) => {
  return useQuery({
    queryKey: ["risk", id],
    queryFn: async () => {
      const res = await api.get(`/risk/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
};

export const useCreateRisk = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/risk", data);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Risk created successfully");
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      // Ensure that any linked strategic plan data on the UI is refetched
      queryClient.invalidateQueries({ queryKey: ["perencanaan"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create risk");
    },
  });
};

export const useUpdateRisk = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) => {
      const res = await api.put(`/risk/${id}`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Risk updated successfully");
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      queryClient.invalidateQueries({ queryKey: ["risk", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["perencanaan"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update risk");
    },
  });
};

export const useDeleteRisk = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/risk/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Risk deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["risks"] });
      queryClient.invalidateQueries({ queryKey: ["perencanaan"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete risk");
    },
  });
};

export const useCreateMitigation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/risk/mitigation", data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Mitigation plan added successfully");
      queryClient.invalidateQueries({ queryKey: ["risk", variables.riskId] });
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || "Failed to add mitigation plan",
      );
    },
  });
};

export const useDeleteMitigation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, riskId }: { id: string; riskId: string }) => {
      const res = await api.delete(`/risk/mitigation/${id}`);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Mitigation plan deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["risk", variables.riskId] });
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || "Failed to delete mitigation plan",
      );
    },
  });
};
