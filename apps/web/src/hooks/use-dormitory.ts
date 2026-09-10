import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";

export interface Dormitory {
  id: string;
  name: string;
  code: string;
  type: DormitoryType;
  capacity: number;
  currentOccupancy?: number;
  unitId: string | null;
  unit?: {
    id: string;
    name: string;
  };
  supervisorId?: string;
  supervisor?: {
    id: string;
    name: string;
  };
  description?: string;
  facilities?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DormitoryType = "MALE" | "FEMALE";

export const DORMITORY_TYPES: { value: DormitoryType; label: string }[] = [
  { value: "MALE", label: "Putra" },
  { value: "FEMALE", label: "Putri" },
];

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

export interface RoomAssignment {
  id: string;
  roomId: string;
  room?: Room;
  studentId: string;
  student?: {
    id: string;
    name: string;
    nisn?: string;
    nik?: string;
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
  isActive?: boolean;
}

export function useDormitories(params: DormitoryParams = {}) {
  return useQuery({
    queryKey: ["dormitories", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Dormitory>>(
        "/dormitories",
        { params },
      );
      return response.data;
    },
  });
}

export function useDormitory(id: string) {
  return useQuery({
    queryKey: ["dormitories", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Dormitory>>(
        `/dormitories/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useRoomSocialAnalytics(id: string) {
  return useQuery({
    queryKey: ["room-social-analytics", id],
    queryFn: async () => {
      const response = await api.get(`/dormitories/rooms/${id}/social-analytics`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export interface CreateDormitoryData {
  name: string;
  code: string;
  type: DormitoryType;
  capacity: number;
  unitId?: string | null;
  supervisorId?: string;
  description?: string;
  facilities?: string;
  isActive?: boolean;
}

export function useCreateDormitory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDormitoryData) => {
      const response = await api.post<ApiResponse<Dormitory>>(
        "/dormitories",
        data,
      );
      return response.data.data;
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
      data: Partial<CreateDormitoryData>;
    }) => {
      const response = await api.patch<ApiResponse<Dormitory>>(
        `/dormitories/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dormitories"] });
      queryClient.invalidateQueries({
        queryKey: ["dormitories", variables.id],
      });
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

export interface RoomParams {
  page?: number;
  limit?: number;
  dormitoryId?: string;
  floor?: number;
  isActive?: boolean;
}

export function useRooms(params: RoomParams = {}) {
  return useQuery({
    queryKey: ["rooms", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Room>>("/facilities/rooms", {
        params,
      });
      return response.data;
    },
  });
}

export function useRoom(id: string) {
  return useQuery({
    queryKey: ["rooms", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Room>>(`/facilities/rooms/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useDormitoryRooms(dormitoryId: string) {
  return useQuery({
    queryKey: ["dormitories", dormitoryId, "rooms"],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Room[]>>(
        `/dormitories/${dormitoryId}/rooms`,
      );
      return response.data.data;
    },
    enabled: !!dormitoryId,
  });
}

export interface CreateRoomData {
  name: string;
  floor: number;
  capacity: number;
  dormitoryId: string;
  isActive?: boolean;
}

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRoomData) => {
      const response = await api.post<ApiResponse<Room>>("/facilities/rooms", data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({
        queryKey: ["dormitories", variables.dormitoryId, "rooms"],
      });
    },
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateRoomData>;
    }) => {
      const response = await api.patch<ApiResponse<Room>>(`/facilities/rooms/${id}`, data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["rooms", variables.id] });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/facilities/rooms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

interface ApiRoomAssignment {
  id: string;
  roomId: string;
  room?: Room;
  studentId: string;
  student?: {
    id: string;
    nisn?: string;
    nik?: string;
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
          nisn: a.student.nisn,
          nik: a.student.nik,
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
  startDate: string;
  endDate?: string;
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
