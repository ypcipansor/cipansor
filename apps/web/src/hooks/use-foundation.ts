import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  FoundationExecutiveSummary,
  FoundationFinancialOverview,
} from "@cipansor/shared";
import api from "@/lib/api";

// Types
export interface Foundation {
  id: string;
  name: string;
  legalName: string;
  registrationNumber: string;
  taxId?: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  website?: string;
  foundedDate: string;
  chairman: string;
  secretary: string;
  treasurer: string;
  logo?: string;
  description?: string;
  vision?: string;
  mission?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FoundationDocument {
  id: string;
  foundationId: string;
  name: string;
  type: DocumentType;
  description?: string;
  documentNumber?: string;
  fileUrl: string;
  issuedDate?: string;
  expiryDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentType =
  | "AKTA_PENDIRIAN"
  | "SK_KEMENKUMHAM"
  | "NPWP"
  | "IZIN_OPERASIONAL"
  | "AKREDITASI"
  | "SERTIFIKAT_TANAH"
  | "IMB"
  | "OTHER";

export const DOCUMENT_TYPES: DocumentType[] = [
  "AKTA_PENDIRIAN",
  "SK_KEMENKUMHAM",
  "NPWP",
  "IZIN_OPERASIONAL",
  "AKREDITASI",
  "SERTIFIKAT_TANAH",
  "IMB",
  "OTHER",
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  AKTA_PENDIRIAN: "Akta Pendirian",
  SK_KEMENKUMHAM: "SK Kemenkumham",
  NPWP: "NPWP",
  IZIN_OPERASIONAL: "Izin Operasional",
  AKREDITASI: "Akreditasi",
  SERTIFIKAT_TANAH: "Sertifikat Tanah",
  IMB: "IMB",
  OTHER: "Lainnya",
};

export interface FoundationBoardMember {
  id: string;
  foundationId: string;
  name: string;
  position: string;
  phone?: string;
  email?: string;
  address?: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  bio?: string;
  photo?: string;
  createdAt: string;
  updatedAt: string;
}

// Foundation queries
export function useFoundation() {
  return useQuery({
    queryKey: ["foundation"],
    queryFn: async () => {
      const response = await api.get("/foundation");
      return response.data.data as Foundation;
    },
  });
}

export function useUpdateFoundation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Foundation>) => {
      const response = await api.put("/foundation", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foundation"] });
    },
  });
}

// Financial Summary Types and Hooks
export interface FoundationFinancialSummary {
  currentMonth: {
    revenue: number;
    expense: number;
    net: number;
  };
  lastMonth: {
    revenue: number;
    expense: number;
    net: number;
  };
  byUnit: {
    unitId: string;
    unitName: string;
    revenue: number;
    expense: number;
  }[];
  units?: {
    unitId: string;
    unitName: string;
    revenue: number;
    expense: number;
    netIncome: number;
  }[];
  expenseComposition?: {
    name: string;
    value: number;
  }[];
}

export function useFoundationFinancialSummary(foundationId?: string) {
  return useQuery({
    queryKey: ["foundation", "financial-summary", foundationId],
    queryFn: async () => {
      const response = await api.get("/foundation/stats/financial");
      return response.data.data as FoundationFinancialSummary;
    },
    enabled: !!foundationId,
  });
}

export function useFoundationExecutiveSummary() {
  return useQuery({
    queryKey: ["foundation", "executive-summary"],
    queryFn: async () => {
      const response = await api.get("/foundation/stats/executive");
      return response.data.data as FoundationExecutiveSummary;
    },
  });
}

export function useFoundationFinancialOverview() {
  return useQuery({
    queryKey: ["foundation", "financial-overview"],
    queryFn: async () => {
      const response = await api.get("/foundation/stats/financial");
      return response.data.data as FoundationFinancialOverview;
    },
  });
}

// Document queries
export function useFoundationDocuments() {
  return useQuery({
    queryKey: ["foundation-documents"],
    queryFn: async () => {
      const response = await api.get("/foundation/documents");
      return response.data.data as FoundationDocument[];
    },
  });
}

export function useFoundationDocument(id: string) {
  return useQuery({
    queryKey: ["foundation-document", id],
    queryFn: async () => {
      const response = await api.get(`/foundation/documents/${id}`);
      return response.data.data as FoundationDocument;
    },
    enabled: !!id,
  });
}

export function useCreateFoundationDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: FormData) => {
      const response = await api.post("/foundation/documents", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foundation-documents"] });
    },
  });
}

export function useUpdateFoundationDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const response = await api.put(`/foundation/documents/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foundation-documents"] });
    },
  });
}

export function useDeleteFoundationDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/foundation/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foundation-documents"] });
    },
  });
}

// Board member queries
export function useFoundationBoardMembers(params?: { isActive?: boolean }) {
  return useQuery({
    queryKey: ["foundation-board-members", params],
    queryFn: async () => {
      const response = await api.get("/foundation/board-members", { params });
      return response.data.data as FoundationBoardMember[];
    },
  });
}

export function useFoundationBoardMember(id: string) {
  return useQuery({
    queryKey: ["foundation-board-member", id],
    queryFn: async () => {
      const response = await api.get(`/foundation/board-members/${id}`);
      return response.data.data as FoundationBoardMember;
    },
    enabled: !!id,
  });
}

export function useCreateFoundationBoardMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<FoundationBoardMember>) => {
      const response = await api.post("/foundation/board-members", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foundation-board-members"] });
    },
  });
}

export function useUpdateFoundationBoardMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<FoundationBoardMember>;
    }) => {
      const response = await api.put(`/foundation/board-members/${id}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foundation-board-members"] });
    },
  });
}

export function useDeleteFoundationBoardMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/foundation/board-members/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["foundation-board-members"] });
    },
  });
}
