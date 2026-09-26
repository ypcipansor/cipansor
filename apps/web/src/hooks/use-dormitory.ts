import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DORMITORY_MANAGER_ROLE_CODES,
  type AssignMusyrifInput,
  type CreateDormitoryInput,
  type CreateRoomInput,
  type MusyrifAssignment,
  type MusyrifCandidate,
  type MusyrifDuty,
  type UpdateDormitoryInput,
  type UpdateRoomInput,
} from "@cipansor/shared";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";
import { getActiveRoleCode } from "@/lib/rbac";
import { useAuthStore } from "@/stores/auth";

/**
 * Whether the signed-in role may add, edit or delete asrama and kamar and
 * place santri — the list the API's routes check. Others read the pages
 * without the buttons, rather than pressing one and getting a 403.
 */
export function useCanManageDormitories(): boolean {
  const user = useAuthStore((s) => s.user);
  return DORMITORY_MANAGER_ROLE_CODES.includes(getActiveRoleCode(user) ?? "");
}

// Dormitory (Asrama) entity
export interface Dormitory {
  id: string;
  name: string;
  code: string;
  type: DormitoryType;
  capacity: number;
  /** Santri placed in its active kamar now. */
  currentOccupancy: number;
  /** Unit pengelola; null when the yayasan runs the asrama across units. */
  unitId: string | null;
  unit?: {
    id: string;
    name: string;
  };
  address?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DormitoryType = "MALE" | "FEMALE";

export const DORMITORY_TYPES: { value: DormitoryType; label: string }[] = [
  { value: "MALE", label: "Putra" },
  { value: "FEMALE", label: "Putri" },
];

// Room entity
export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  currentOccupancy?: number;
  dormitoryId: string;
  dormitory?: Dormitory;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Room assignment
export interface RoomAssignment {
  id: string;
  roomId: string;
  room?: Room;
  studentId: string;
  student?: {
    id: string;
    name: string;
    nis: string;
    gender: string;
  };
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DormitoryParams {
  page?: number;
  limit?: number;
  unitId?: string;
  type?: DormitoryType;
}

/**
 * The API sends an asrama's `gender` and `deletedAt`; the pages read `type`
 * and `isActive`. Until 2026-09-26 nothing mapped them, so every asrama read
 * "Putri" and "Tidak Aktif" — Asrama Putra Al-Hikmah included.
 */
type ApiDormitory = Omit<
  Dormitory,
  "type" | "isActive" | "currentOccupancy"
> & {
  gender?: DormitoryType;
  deletedAt?: string | null;
  occupancy?: number;
};
const toDormitory = ({
  gender,
  deletedAt,
  occupancy,
  ...d
}: ApiDormitory): Dormitory => ({
  ...d,
  type: gender ?? "MALE",
  isActive: !deletedAt,
  currentOccupancy: occupancy ?? 0,
});

export function useDormitories(params: DormitoryParams = {}) {
  return useQuery({
    queryKey: ["dormitories", params],
    queryFn: async () => {
      // The API filters on `gender`; `type` was sent and ignored, so the
      // Putra/Putri filter on the asrama list changed nothing.
      const { type, ...rest } = params;
      const response = await api.get<PaginatedResponse<ApiDormitory>>(
        "/dormitories",
        { params: { ...rest, gender: type } },
      );
      return { ...response.data, data: response.data.data.map(toDormitory) };
    },
  });
}

export function useDormitory(id: string) {
  return useQuery({
    queryKey: ["dormitories", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ApiDormitory>>(
        `/dormitories/${id}`,
      );
      return toDormitory(response.data.data);
    },
    enabled: !!id,
  });
}

export function useRoomSocialAnalytics(id: string) {
  return useQuery({
    queryKey: ["room-social-analytics", id],
    queryFn: async () => {
      const response = await api.get(
        `/dormitories/rooms/${id}/social-analytics`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateDormitory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDormitoryInput) => {
      const response = await api.post<ApiResponse<ApiDormitory>>(
        "/dormitories",
        data,
      );
      return toDormitory(response.data.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

export function useUpdateDormitory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateDormitoryInput;
    }) => {
      // The API answers PUT; until 2026-09-26 this sent PATCH and every edit
      // came back "not found".
      const response = await api.put<ApiResponse<ApiDormitory>>(
        `/dormitories/${id}`,
        data,
      );
      return toDormitory(response.data.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

export function useDeleteDormitory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/dormitories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

/**
 * The kamar of one asrama, with how many santri live in each. Until
 * 2026-09-26 this called `GET /dormitories/{id}/rooms`, which the API never
 * served: the asrama page's room list was always empty.
 */
export function useDormitoryRooms(dormitoryId: string) {
  return useQuery({
    queryKey: ["dormitories", dormitoryId, "rooms"],
    queryFn: async (): Promise<Room[]> => {
      const response = await api.get<{
        data: (Room & { _count?: { assignments: number } })[];
      }>("/dormitories/rooms/list", { params: { dormitoryId, limit: 100 } });
      return response.data.data.map(({ _count, ...room }) => ({
        ...room,
        currentOccupancy: _count?.assignments ?? 0,
      }));
    },
    enabled: !!dormitoryId,
  });
}

// Kamar are `Room` rows under /dormitories/rooms. Until 2026-09-26 these
// three wrote the facilities module's rooms (`/facilities/rooms`): "Tambah
// Kamar" on an asrama created no kamar, and deleting one deleted nothing.
// Every write invalidates ["dormitories"], which holds the asrama, its kamar
// list and its occupancy.

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRoomInput) => {
      const response = await api.post<ApiResponse<Room>>(
        "/dormitories/rooms",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRoomInput }) => {
      const response = await api.put<ApiResponse<Room>>(
        `/dormitories/rooms/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/dormitories/rooms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

// Shape returned by GET /dormitories/assignments/list — assignments carry
// assignedAt/endedAt and the student's name nested under `user`.
interface ApiRoomAssignment {
  id: string;
  roomId: string;
  room?: Room;
  studentId: string;
  student?: {
    id: string;
    nis: string;
    gender: string;
    user?: { id: string; name: string; email?: string };
  };
  assignedAt: string;
  endedAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toRoomAssignment(a: ApiRoomAssignment): RoomAssignment {
  return {
    id: a.id,
    roomId: a.roomId,
    room: a.room,
    studentId: a.studentId,
    student: a.student
      ? {
          id: a.student.id,
          name: a.student.user?.name ?? "",
          nis: a.student.nis,
          gender: a.student.gender,
        }
      : undefined,
    startDate: a.assignedAt,
    endDate: a.endedAt ?? undefined,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// Room Assignment hooks
export function useRoomAssignments(roomId: string) {
  return useQuery({
    queryKey: ["rooms", roomId, "assignments"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ApiRoomAssignment[]>>(
        "/dormitories/assignments/list",
        { params: { roomId, isActive: true, limit: 100 } },
      );
      return (response.data.data ?? []).map(toRoomAssignment);
    },
    enabled: !!roomId,
  });
}

export function useStudentRoomAssignment(studentId: string) {
  return useQuery({
    queryKey: ["students", studentId, "room-assignment"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<ApiRoomAssignment[]>>(
        "/dormitories/assignments/list",
        { params: { studentId, isActive: true, limit: 1 } },
      );
      const assignment = response.data.data?.[0];
      return assignment ? toRoomAssignment(assignment) : null;
    },
    enabled: !!studentId,
  });
}

export interface AssignRoomData {
  roomId: string;
  studentId: string;
}

export function useAssignRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AssignRoomData) => {
      const response = await api.post<ApiResponse<ApiRoomAssignment>>(
        "/dormitories/assignments",
        { studentId: data.studentId, roomId: data.roomId },
      );
      return toRoomAssignment(response.data.data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["rooms", variables.roomId, "assignments"],
      });
      queryClient.invalidateQueries({
        queryKey: ["students", variables.studentId, "room-assignment"],
      });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

export function useUnassignRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.delete(`/dormitories/assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
    },
  });
}

// ============================================
// Musyrif assignments — who looks after the asrama or one of its kamar.
// The contract is @cipansor/shared `schemas/musyrif-assignments.ts`.
// ============================================

export const MUSYRIF_DUTY_LABELS: Record<MusyrifDuty, string> = {
  PEMBINA: "Pembina (wali kamar)",
  KOORDINATOR: "Koordinator asrama",
  PENGAWAS: "Pengawas",
};

const musyrifKey = (dormitoryId: string) =>
  ["dormitories", dormitoryId, "musyrif"] as const;

export function useDormitoryMusyrif(dormitoryId: string) {
  return useQuery({
    queryKey: musyrifKey(dormitoryId),
    queryFn: async () =>
      (
        await api.get<ApiResponse<MusyrifAssignment[]>>(
          `/dormitories/${dormitoryId}/musyrif`,
        )
      ).data.data,
    enabled: !!dormitoryId,
  });
}

/** People who may be assigned, by name. Assigners only (the API refuses the rest). */
export function useMusyrifCandidates(
  dormitoryId: string,
  q: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...musyrifKey(dormitoryId), "candidates", q],
    queryFn: async () =>
      (
        await api.get<ApiResponse<MusyrifCandidate[]>>(
          `/dormitories/${dormitoryId}/musyrif/candidates`,
          { params: q ? { q } : undefined },
        )
      ).data.data,
    enabled: enabled && !!dormitoryId,
  });
}

export function useAssignMusyrif(dormitoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AssignMusyrifInput) =>
      (
        await api.post<ApiResponse<MusyrifAssignment>>(
          `/dormitories/${dormitoryId}/musyrif`,
          data,
        )
      ).data.data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: musyrifKey(dormitoryId) }),
  });
}

export function useEndMusyrifAssignment(dormitoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      await api.post(`/dormitories/${dormitoryId}/musyrif/${assignmentId}/end`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: musyrifKey(dormitoryId) }),
  });
}
