import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { PaginatedResponse, ApiResponse, User } from "@/lib/api";

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  unitId?: string;
  isActive?: boolean;
}

export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  role:
    "SUPER_ADMIN" | "UNIT_ADMIN" | "TEACHER" | "STUDENT" | "STAFF" | "PARENT";
  unitId?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  role?: string;
  unitId?: string;
  isActive?: boolean;
}

export function useUsers(params: UserListParams = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<User>>("/users", {
        params,
      });
      return response.data;
    },
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ["users", id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<User>>(`/users/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUserData) => {
      const response = await api.post<ApiResponse<User>>("/users", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserData }) => {
      const response = await api.put<ApiResponse<User>>(`/users/${id}`, data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users", variables.id] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
