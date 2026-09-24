import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse } from "@/lib/api";

/**
 * The single source of truth for unit types on the web side; mirrors the
 * Prisma `UnitType` enum.
 *
 * This list used to stop at SMA_QURAN and was copy-pasted into five places
 * (here, both unit forms, and three times in the API's Zod schema). The
 * database already had UNIT_USAHA and OTHER, so such a unit rendered its type
 * as the raw string — no label matched — and neither form could create or even
 * re-save one, because the value the row already held was not in the form's
 * own enum.
 *
 * Everything below is derived from this array, so adding a type is one edit.
 */
export const UNIT_TYPES = [
  { value: "PESANTREN", label: "Pesantren" },
  { value: "TK_QURAN", label: "TK Qur'an" },
  { value: "SD_IT", label: "SD Islam Terpadu" },
  { value: "SMP_IT", label: "SMP Islam Terpadu" },
  { value: "SMA_QURAN", label: "SMA Qur'an" },
  { value: "UNIT_USAHA", label: "Unit Usaha" },
  { value: "OTHER", label: "Lainnya" },
] as const;

export type UnitType = (typeof UNIT_TYPES)[number]["value"];

/** Tuple form for `z.enum()`, which needs at least one literal. */
export const UNIT_TYPE_VALUES = UNIT_TYPES.map((t) => t.value) as unknown as [
  UnitType,
  ...UnitType[],
];

export interface Unit {
  id: string;
  name: string;
  type: UnitType;
  address?: string;
  phone?: string;
  email?: string;
  headName?: string;
  createdAt: string;
  updatedAt: string;
}

interface UseUnitsParams {
  page?: number;
  limit?: number;
}

export function useUnits(params?: UseUnitsParams) {
  return useQuery({
    queryKey: ["units", params],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Unit[]>>("/units", { params });
      return response.data.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Units for the unauthenticated SPMB form.
 *
 * `useUnits` hits `GET /units`, which requires a session — on the public
 * registration page that 401s and the "unit tujuan" dropdown renders empty.
 * This reads the deliberately trimmed public projection (id, name, type).
 */
export function usePublicUnits() {
  return useQuery({
    queryKey: ["units", "public"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Unit[]>>(
        "/admissions/public/units",
      );
      return response.data.data;
    },
    staleTime: 60 * 60 * 1000,
  });
}

// Hook to get current user's unit based on stored unitId
export function useCurrentUnit() {
  const unitId =
    typeof window !== "undefined" ? localStorage.getItem("unitId") : null;

  return useQuery({
    queryKey: ["units", unitId],
    queryFn: async () => {
      if (!unitId) return null;
      const response = await api.get<ApiResponse<Unit>>(`/units/${unitId}`);
      return response.data.data;
    },
    enabled: !!unitId,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useUnit(id: string) {
  return useQuery({
    queryKey: ["units", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Unit>>(`/units/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export interface CreateUnitData {
  name: string;
  type: UnitType;
  address?: string;
  phone?: string;
  email?: string;
  headName?: string;
}

export function useCreateUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUnitData) => {
      const response = await api.post<ApiResponse<Unit>>("/units", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
  });
}

export function useUpdateUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateUnitData>;
    }) => {
      const response = await api.patch<ApiResponse<Unit>>(`/units/${id}`, data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["units", variables.id] });
    },
  });
}

export function useDeleteUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/units/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
  });
}
