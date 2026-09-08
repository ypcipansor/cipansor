import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";

export interface Permit {
  id: string;
  studentId: string;
  student?: {
    id: string;
    name: string;
    nisn: string;
    gender?: "MALE" | "FEMALE";
    class?: {
      id: string;
      name: string;
    };
    unit?: {
      id: string;
      name: string;
    };
  };
  permitType: PermitType;
  reason: string;
  startDate: string;
  endDate: string;
  status: PermitStatus;
  approvedBy?: string;
  approver?: {
    id: string;
    name: string;
  };
  approvedAt?: string;
  rejectionReason?: string;
  parentPhone?: string;
  destination?: string;
  createdAt: string;
  updatedAt: string;
}

export type PermitType = "SICK" | "FAMILY" | "EMERGENCY" | "EVENT" | "OTHER";

export const PERMIT_TYPES: { value: PermitType; label: string }[] = [
  { value: "SICK", label: "Sakit" },
  { value: "FAMILY", label: "Keperluan Keluarga" },
  { value: "EMERGENCY", label: "Darurat" },
  { value: "EVENT", label: "Acara" },
  { value: "OTHER", label: "Lainnya" },
];

export type PermitStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "RETURNED";

export const PERMIT_STATUSES: {
  value: PermitStatus;
  label: string;
  color: string;
}[] = [
  {
    value: "PENDING",
    label: "Menunggu",
    color: "bg-yellow-100 text-yellow-800",
  },
  {
    value: "APPROVED",
    label: "Disetujui",
    color: "bg-green-100 text-green-800",
  },
  { value: "REJECTED", label: "Ditolak", color: "bg-red-100 text-red-800" },
  {
    value: "CANCELLED",
    label: "Dibatalkan",
    color: "bg-gray-100 text-gray-800",
  },
  {
    value: "RETURNED",
    label: "Sudah Kembali",
    color: "bg-blue-100 text-blue-800",
  },
];

export interface PermitParams {
  page?: number;
  limit?: number;
  studentId?: string;
  permitType?: PermitType;
  status?: PermitStatus;
  startDate?: string;
  endDate?: string;
}

export function usePermits(params: PermitParams = {}) {
  return useQuery({
    queryKey: ["permits", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Permit>>("/permits", {
        params,
      });
      return response.data;
    },
  });
}

export function usePermit(id: string) {
  return useQuery({
    queryKey: ["permits", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Permit>>(`/permits/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useStudentPermits(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "permits"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Permit[]>>(
        `/students/${studentId}/permits`,
      );
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

export interface CreatePermitData {
  studentId: string;
  permitType: PermitType;
  reason: string;
  startDate: string;
  endDate: string;
  parentPhone?: string;
  destination?: string;
}

export function useCreatePermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePermitData) => {
      const response = await api.post<ApiResponse<Permit>>("/permits", data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
      queryClient.invalidateQueries({
        queryKey: ["students", variables.studentId, "permits"],
      });
    },
  });
}

export interface UpdatePermitData {
  permitType?: PermitType;
  reason?: string;
  startDate?: string;
  endDate?: string;
  parentPhone?: string;
  destination?: string;
}

export function useUpdatePermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdatePermitData;
    }) => {
      const response = await api.put<ApiResponse<Permit>>(
        `/permits/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
      queryClient.invalidateQueries({ queryKey: ["permits", variables.id] });
    },
  });
}

export function useApprovePermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<ApiResponse<Permit>>(
        `/permits/${id}/approve`,
      );
      return response.data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
      queryClient.invalidateQueries({ queryKey: ["permits", id] });
    },
  });
}

export function useRejectPermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.post<ApiResponse<Permit>>(
        `/permits/${id}/reject`,
        { reason },
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
      queryClient.invalidateQueries({ queryKey: ["permits", variables.id] });
    },
  });
}

export function useMarkReturned() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<ApiResponse<Permit>>(
        `/permits/${id}/returned`,
      );
      return response.data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
      queryClient.invalidateQueries({ queryKey: ["permits", id] });
    },
  });
}

export function useDeletePermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/permits/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permits"] });
    },
  });
}
