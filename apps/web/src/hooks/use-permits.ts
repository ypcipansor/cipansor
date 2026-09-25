import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PERMIT_DECIDER_ROLE_CODES,
  PERMIT_STAFF_ROLE_CODES,
  type CreatePermitInput,
  type ListPermitsQuery,
  type PageResponse,
  type Permit,
  type PermitStatus,
  type PermitSummary,
  type PermitType,
  type UpdatePermitInput,
} from "@cipansor/shared";
import api, { ApiResponse } from "@/lib/api";
import { getActiveRoleCode } from "@/lib/rbac";
import { useAuthStore } from "@/stores/auth";

// The contract (types, schemas, who may do what) is @cipansor/shared's
// schemas/permits.ts, which the API validates with. Only labels live here.
export type { Permit, PermitStatus, PermitSummary, PermitType };

export const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
  PULANG: "Pulang",
  KELUAR: "Keluar sementara",
  SAKIT: "Sakit",
  KELUARGA: "Keperluan keluarga",
  OTHER: "Lainnya",
};

export const PERMIT_TYPES = (
  Object.keys(PERMIT_TYPE_LABELS) as PermitType[]
).map((value) => ({ value, label: PERMIT_TYPE_LABELS[value] }));

/**
 * Where a permit stands, as the people using it say it. The stored status
 * does not distinguish an approved permit still on the shelf from a learner
 * who is out through the gate, or one who is late back.
 */
export type PermitPhase =
  | "PENDING"
  | "APPROVED"
  | "OUTSIDE"
  | "OVERDUE"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export function permitPhase(
  permit: Pick<Permit, "status" | "departedAt" | "returnedAt" | "endDate">,
  now: Date = new Date(),
): PermitPhase {
  if (permit.status === "APPROVED" && permit.departedAt && !permit.returnedAt) {
    return new Date(permit.endDate) < now ? "OVERDUE" : "OUTSIDE";
  }
  return permit.status;
}

export const PERMIT_PHASES: Record<
  PermitPhase,
  { label: string; className: string }
> = {
  PENDING: { label: "Menunggu", className: "bg-yellow-100 text-yellow-800" },
  APPROVED: { label: "Disetujui", className: "bg-green-100 text-green-800" },
  OUTSIDE: {
    label: "Sedang di luar",
    className: "bg-orange-100 text-orange-800",
  },
  OVERDUE: { label: "Terlambat kembali", className: "bg-red-100 text-red-800" },
  COMPLETED: { label: "Sudah kembali", className: "bg-blue-100 text-blue-800" },
  REJECTED: { label: "Ditolak", className: "bg-red-100 text-red-800" },
  CANCELLED: { label: "Dibatalkan", className: "bg-gray-100 text-gray-800" },
};

/** The status filter offered in lists: the stored statuses. */
export const PERMIT_STATUS_FILTERS: { value: PermitStatus; label: string }[] = [
  { value: "PENDING", label: "Menunggu" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "COMPLETED", label: "Selesai" },
  { value: "REJECTED", label: "Ditolak" },
  { value: "CANCELLED", label: "Dibatalkan" },
];

/**
 * What the signed-in role may do — the same lists the API's route guards
 * read, so a button is shown exactly when its request is allowed.
 */
export function usePermitAbilities() {
  const user = useAuthStore((s) => s.user);
  const code = getActiveRoleCode(user) ?? "";
  return {
    /** Read every permit in scope, file for a learner, record the gate. */
    isStaff: PERMIT_STAFF_ROLE_CODES.includes(code),
    /** Approve or reject. */
    canDecide: PERMIT_DECIDER_ROLE_CODES.includes(code),
  };
}

const KEY = ["permits"] as const;

export function usePermits(params: ListPermitsQuery = {}, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "list", params],
    queryFn: async () =>
      (await api.get<PageResponse<Permit>>("/permits", { params })).data,
    enabled,
  });
}

export function usePermit(id: string) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: async () =>
      (await api.get<ApiResponse<Permit>>(`/permits/${id}`)).data.data,
    enabled: !!id,
  });
}

/** Counts for dashboards; staff roles only (the API refuses the rest). */
export function usePermitSummary(enabled = true) {
  return useQuery({
    queryKey: [...KEY, "summary"],
    queryFn: async () =>
      (await api.get<ApiResponse<PermitSummary>>("/permits/summary")).data.data,
    enabled,
  });
}

/** The gate: look a permit up by the code on the learner's slip. */
export function usePermitByCode(code: string) {
  return useQuery({
    queryKey: [...KEY, "code", code],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Permit>>(
          `/permits/code/${encodeURIComponent(code)}`,
          { skipErrorToast: true },
        )
      ).data.data,
    enabled: !!code,
    retry: false,
  });
}

function usePermitMutation<V>(
  request: (variables: V) => Promise<{ data: ApiResponse<Permit> }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: V) => (await request(variables)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      // The staff dashboard counts and lists pending permits too.
      queryClient.invalidateQueries({ queryKey: ["staff-dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["staff-pending-tasks"] });
    },
  });
}

export const useCreatePermit = () =>
  usePermitMutation((data: CreatePermitInput) =>
    api.post<ApiResponse<Permit>>("/permits", data),
  );

export const useUpdatePermit = () =>
  usePermitMutation(({ id, data }: { id: string; data: UpdatePermitInput }) =>
    api.patch<ApiResponse<Permit>>(`/permits/${id}`, data),
  );

export const useApprovePermit = () =>
  usePermitMutation((id: string) =>
    api.post<ApiResponse<Permit>>(`/permits/${id}/approve`),
  );

export const useRejectPermit = () =>
  usePermitMutation(
    ({ id, rejectionNote }: { id: string; rejectionNote: string }) =>
      api.post<ApiResponse<Permit>>(`/permits/${id}/reject`, { rejectionNote }),
  );

export const useCancelPermit = () =>
  usePermitMutation((id: string) =>
    api.post<ApiResponse<Permit>>(`/permits/${id}/cancel`),
  );

export const useDepartPermit = () =>
  usePermitMutation((id: string) =>
    api.post<ApiResponse<Permit>>(`/permits/${id}/depart`),
  );

export const useReturnPermit = () =>
  usePermitMutation((id: string) =>
    api.post<ApiResponse<Permit>>(`/permits/${id}/return`, {}),
  );

/**
 * A `datetime-local` value (`2026-09-26T13:00`, the browser's local time) as
 * the ISO instant the API expects.
 */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** An ISO instant as a `datetime-local` value in the browser's local time. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
