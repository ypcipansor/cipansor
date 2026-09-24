import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, tahfidzApi } from "@/lib/api";
import {
  TahfidzRecord,
  TahfidzActivityType,
  PaginatedResponse,
  TahfidzDashboardStats,
  CreateTahfidzInput,
  UpdateTahfidzInput,
} from "@cipansor/shared";

// Re-export shared types for component usage
export type { TahfidzRecord, CreateTahfidzInput, UpdateTahfidzInput };
// Map frontend legacy type name to shared type
export type TahfidzType = TahfidzActivityType;

export type TahfidzGrade =
  "MUMTAZ" | "JAYYID_JIDDAN" | "JAYYID" | "MAQBUL" | "RASIB";

export const TAHFIDZ_TYPES: { value: TahfidzType; label: string }[] = [
  { value: "ZIYADAH", label: "Setoran Baru (Ziyadah)" },
  { value: "MUROJAAH", label: "Murajaah (Pengulangan)" },
  { value: "TASMI", label: "Tasmi (Tes)" },
  { value: "ASSESSMENT", label: "Ujian" },
];

export const TAHFIDZ_GRADES: {
  value: TahfidzGrade;
  label: string;
  color: string;
}[] = [
  {
    value: "MUMTAZ",
    label: "Mumtaz (Sangat Baik)",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "JAYYID_JIDDAN",
    label: "Jayyid Jiddan (Baik Sekali)",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: "JAYYID",
    label: "Jayyid (Baik)",
    color: "bg-cyan-100 text-cyan-800",
  },
  {
    value: "MAQBUL",
    label: "Maqbul (Cukup)",
    color: "bg-yellow-100 text-yellow-800",
  },
  { value: "RASIB", label: "Rasib (Kurang)", color: "bg-red-100 text-red-800" },
];

export const SURAH_LIST = [
  "Al-Fatihah",
  "Al-Baqarah",
  "Ali Imran",
  "An-Nisa",
  "Al-Maidah",
  "Al-Anam",
  "Al-Araf",
  "Al-Anfal",
  "At-Taubah",
  "Yunus",
  "Hud",
  "Yusuf",
  "Ar-Ra'd",
  "Ibrahim",
  "Al-Hijr",
  "An-Nahl",
  "Al-Isra",
  "Al-Kahf",
  "Maryam",
  "Taha",
  "Al-Anbiya",
  "Al-Hajj",
  "Al-Mu'minun",
  "An-Nur",
  "Al-Furqan",
  "Asy-Syu'ara",
  "An-Naml",
  "Al-Qasas",
  "Al-Ankabut",
  "Ar-Rum",
  "Luqman",
  "As-Sajdah",
  "Al-Ahzab",
  "Saba",
  "Fatir",
  "Yasin",
  "As-Saffat",
  "Sad",
  "Az-Zumar",
  "Ghafir",
  "Fussilat",
  "Asy-Syura",
  "Az-Zukhruf",
  "Ad-Dukhan",
  "Al-Jasiyah",
  "Al-Ahqaf",
  "Muhammad",
  "Al-Fath",
  "Al-Hujurat",
  "Qaf",
  "Az-Zariyat",
  "At-Tur",
  "An-Najm",
  "Al-Qamar",
  "Ar-Rahman",
  "Al-Waqi'ah",
  "Al-Hadid",
  "Al-Mujadilah",
  "Al-Hasyr",
  "Al-Mumtahanah",
  "As-Saff",
  "Al-Jumu'ah",
  "Al-Munafiqun",
  "At-Tagabun",
  "At-Talaq",
  "At-Tahrim",
  "Al-Mulk",
  "Al-Qalam",
  "Al-Haqqah",
  "Al-Ma'arij",
  "Nuh",
  "Al-Jinn",
  "Al-Muzzammil",
  "Al-Muddassir",
  "Al-Qiyamah",
  "Al-Insan",
  "Al-Mursalat",
  "An-Naba",
  "An-Nazi'at",
  "Abasa",
  "At-Takwir",
  "Al-Infitar",
  "Al-Mutaffifin",
  "Al-Insyiqaq",
  "Al-Buruj",
  "At-Tariq",
  "Al-A'la",
  "Al-Gasyiyah",
  "Al-Fajr",
  "Al-Balad",
  "Asy-Syams",
  "Al-Lail",
  "Ad-Duha",
  "Al-Insyirah",
  "At-Tin",
  "Al-Alaq",
  "Al-Qadr",
  "Al-Bayyinah",
  "Az-Zalzalah",
  "Al-Adiyat",
  "Al-Qari'ah",
  "At-Takasur",
  "Al-Asr",
  "Al-Humazah",
  "Al-Fil",
  "Quraisy",
  "Al-Ma'un",
  "Al-Kausar",
  "Al-Kafirun",
  "An-Nasr",
  "Al-Lahab",
  "Al-Ikhlas",
  "Al-Falaq",
  "An-Nas",
];

export interface TahfidzParams {
  page?: number;
  limit?: number;
  studentId?: string;
  teacherId?: string;
  type?: TahfidzType;
  startDate?: string;
  endDate?: string;
  surah?: string;
}

export function useTahfidzRecords(params: TahfidzParams = {}) {
  return useQuery({
    queryKey: ["tahfidz", params],
    queryFn: async () => {
      // Use the typed API client
      const response = await tahfidzApi.getRecords(params);
      return response.data;
    },
  });
}

export function useTahfidzRecord(id: string) {
  return useQuery({
    queryKey: ["tahfidz", id],
    queryFn: async () => {
      const response = await tahfidzApi.getRecordById(id);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useStudentTahfidzProgress(studentId: string) {
  return useQuery({
    queryKey: ["tahfidz", "progress", studentId],
    queryFn: async () => {
      const response = await tahfidzApi.getStudentSummary(studentId);
      return response.data.data;
    },
    enabled: !!studentId,
  });
}

// Use shared input types instead of local definition
export function useCreateTahfidz() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTahfidzInput) => {
      const response = await tahfidzApi.createRecord(data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tahfidz"] });
    },
  });
}

export function useUpdateTahfidz() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateTahfidzInput;
    }) => {
      const response = await tahfidzApi.updateRecord(id, data);
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tahfidz"] });
      queryClient.invalidateQueries({ queryKey: ["tahfidz", variables.id] });
    },
  });
}

export function useDeleteTahfidz() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await tahfidzApi.deleteRecord(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tahfidz"] });
    },
  });
}

export type { TahfidzDashboardStats };

export interface TahfidzDashboardParams {
  unitId?: string;
  year?: number;
  month?: number;
}

export function useTahfidzDashboard(params: TahfidzDashboardParams = {}) {
  return useQuery({
    queryKey: ["tahfidz", "dashboard", params],
    queryFn: async () => {
      const response = await tahfidzApi.getDashboard(params);
      return response.data.data;
    },
  });
}
