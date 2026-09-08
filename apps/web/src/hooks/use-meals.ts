import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// Types
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type MealDayType = "WEEKDAY" | "WEEKEND" | "ALL";

export const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
export const MEAL_DAY_TYPES: MealDayType[] = ["WEEKDAY", "WEEKEND", "ALL"];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: "Sarapan",
  LUNCH: "Makan Siang",
  DINNER: "Makan Malam",
  SNACK: "Snack/Camilan",
};

export const MEAL_DAY_TYPE_LABELS: Record<MealDayType, string> = {
  WEEKDAY: "Hari Kerja",
  WEEKEND: "Akhir Pekan",
  ALL: "Semua Hari",
};

export interface MealMenu {
  id: string;
  name: string;
  description?: string;
  mealType: MealType;
  dayType: MealDayType;
  date: string;
  mainDish: string;
  sideDish?: string;
  vegetable?: string;
  soup?: string;
  dessert?: string;
  drink?: string;
  calories?: number;
  nutritionInfo?: string;
  unitId: string;
  unit?: {
    id: string;
    name: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MealAttendance {
  id: string;
  studentId: string;
  student?: {
    id: string;
    nisn: string;
    name: string;
  };
  mealType: MealType;
  date: string;
  isPresent: boolean;
  notes?: string;
  unitId: string;
  createdAt: string;
}

export interface MealStats {
  totalMenus: number;
  todayMenus: {
    breakfast?: MealMenu;
    lunch?: MealMenu;
    dinner?: MealMenu;
    snack?: MealMenu;
  };
  attendanceStats: {
    breakfast: { total: number; present: number };
    lunch: { total: number; present: number };
    dinner: { total: number; present: number };
  };
}

// Menu Queries
export function useMealMenus(params?: {
  unitId?: string;
  mealType?: MealType;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: ["meal-menus", params],
    queryFn: async () => {
      const response = await api.get("/meals/menus", { params });
      return response.data.data as MealMenu[];
    },
  });
}

export function useMealMenu(id: string) {
  return useQuery({
    queryKey: ["meal-menu", id],
    queryFn: async () => {
      const response = await api.get(`/meals/menus/${id}`);
      return response.data.data as MealMenu;
    },
    enabled: !!id,
  });
}

export function useTodayMenus(unitId?: string) {
  return useQuery({
    queryKey: ["today-menus", unitId],
    queryFn: async () => {
      const response = await api.get("/meals/menus/today", {
        params: { unitId },
      });
      return response.data.data as {
        breakfast?: MealMenu;
        lunch?: MealMenu;
        dinner?: MealMenu;
        snack?: MealMenu;
      };
    },
  });
}

export function useWeeklyMenus(params?: {
  unitId?: string;
  weekStart?: string;
}) {
  return useQuery({
    queryKey: ["weekly-menus", params],
    queryFn: async () => {
      const response = await api.get("/meals/menus/weekly", { params });
      return response.data.data as MealMenu[];
    },
  });
}

export function useCreateMealMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<MealMenu>) => {
      const response = await api.post("/meals/menus", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-menus"] });
      queryClient.invalidateQueries({ queryKey: ["today-menus"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
    },
  });
}

export function useUpdateMealMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<MealMenu>;
    }) => {
      const response = await api.put(`/meals/menus/${id}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-menus"] });
      queryClient.invalidateQueries({ queryKey: ["today-menus"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
    },
  });
}

export function useDeleteMealMenu() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/meals/menus/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-menus"] });
      queryClient.invalidateQueries({ queryKey: ["today-menus"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-menus"] });
    },
  });
}

// Attendance Queries
export function useMealAttendance(params?: {
  unitId?: string;
  classId?: string;
  mealType?: MealType;
  date?: string;
}) {
  return useQuery({
    queryKey: ["meal-attendance", params],
    queryFn: async () => {
      const response = await api.get("/meals/attendance", { params });
      return response.data.data as MealAttendance[];
    },
  });
}

export function useRecordMealAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      studentIds: string[];
      mealType: MealType;
      date: string;
      isPresent: boolean;
      unitId: string;
      notes?: string;
    }) => {
      const response = await api.post("/meals/attendance", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["meal-stats"] });
    },
  });
}

// Stats
export function useMealStats(params?: { unitId?: string; date?: string }) {
  return useQuery({
    queryKey: ["meal-stats", params],
    queryFn: async () => {
      const response = await api.get("/meals/stats", { params });
      return response.data.data as MealStats;
    },
  });
}
