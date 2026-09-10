import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { ApiResponse, PaginatedResponse } from "@/lib/api";

// Types
export type CertificateType =
  | "IJAZAH"
  | "STTB"
  | "TAHFIDZ"
  | "SANAD"
  | "ACHIEVEMENT"
  | "GRADUATION"
  | "PARTICIPATION"
  | "COURSE_COMPLETION"
  | "APPRECIATION"
  | "OTHER";

export interface DigitalCertificate {
  id: string;
  studentId: string;
  student?: {
    id: string;
    name: string;
    nisn: string;
    photoUrl?: string;
    user?: { name: string };
    class?: { id: string; name: string };
    unit?: { id: string; name: string; type?: string };
  };
  certificateType: CertificateType;
  title: string;
  description?: string;
  certificateNumber: string;
  qrCode: string;
  verificationUrl: string;
  grade?: string;
  rank?: number;
  issueDate: string;
  signatoryName: string;
  signatoryTitle: string;
  signatureUrl?: string;
  pdfUrl?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  downloadCount: number;
  createdById: string;
  createdBy?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface CertificateTemplate {
  type: CertificateType;
  label: string;
  labelEn: string;
  description: string;
  icon: string;
  color: string;
  fields: {
    key: string;
    label: string;
    type: "text" | "date" | "number" | "select";
    required?: boolean;
    options?: string[];
  }[];
}

export const CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  {
    type: "GRADUATION",
    label: "Ijazah / Surat Kelulusan",
    labelEn: "Graduation Certificate",
    description:
      "Sertifikat kelulusan untuk santri yang telah menyelesaikan pendidikan",
    icon: "GraduationCap",
    color: "bg-blue-100 text-blue-800",
    fields: [
      {
        key: "graduationYear",
        label: "Tahun Kelulusan",
        type: "number",
        required: true,
      },
      { key: "finalGrade", label: "Nilai Akhir", type: "text" },
      { key: "rank", label: "Peringkat", type: "number" },
      { key: "program", label: "Program Studi", type: "text" },
    ],
  },
  {
    type: "TAHFIDZ",
    label: "Syahadah Tahfidz",
    labelEn: "Quran Memorization Certificate",
    description: "Sertifikat pencapaian hafalan Al-Quran",
    icon: "BookOpen",
    color: "bg-emerald-100 text-emerald-800",
    fields: [
      { key: "juzCount", label: "Jumlah Juz", type: "number", required: true },
      {
        key: "completedJuz",
        label: "Juz yang Dikhatamkan",
        type: "text",
        required: true,
      },
      {
        key: "grade",
        label: "Predikat",
        type: "select",
        options: ["Mumtaz", "Jayyid Jiddan", "Jayyid", "Maqbul"],
        required: true,
      },
      {
        key: "teacherName",
        label: "Nama Musyrif/ah",
        type: "text",
        required: true,
      },
    ],
  },
  {
    type: "ACHIEVEMENT",
    label: "Piagam Penghargaan",
    labelEn: "Achievement Certificate",
    description:
      "Penghargaan untuk prestasi akademik, ekstrakurikuler, atau lainnya",
    icon: "Trophy",
    color: "bg-amber-100 text-amber-800",
    fields: [
      {
        key: "achievementType",
        label: "Jenis Prestasi",
        type: "select",
        options: [
          "Akademik",
          "Ekstrakurikuler",
          "Lomba",
          "Kepribadian",
          "Lainnya",
        ],
        required: true,
      },
      { key: "achievement", label: "Prestasi", type: "text", required: true },
      {
        key: "level",
        label: "Tingkat",
        type: "select",
        options: [
          "Kelas",
          "Sekolah",
          "Kecamatan",
          "Kabupaten/Kota",
          "Provinsi",
          "Nasional",
          "Internasional",
        ],
      },
      { key: "rank", label: "Peringkat/Juara", type: "text" },
    ],
  },
  {
    type: "COURSE_COMPLETION",
    label: "Sertifikat Kursus",
    labelEn: "Course Completion Certificate",
    description: "Sertifikat penyelesaian kursus atau pelatihan",
    icon: "Award",
    color: "bg-purple-100 text-purple-800",
    fields: [
      {
        key: "courseName",
        label: "Nama Kursus/Pelatihan",
        type: "text",
        required: true,
      },
      { key: "duration", label: "Durasi", type: "text", required: true },
      { key: "instructor", label: "Instruktur/Pemateri", type: "text" },
      { key: "score", label: "Nilai", type: "text" },
    ],
  },
  {
    type: "APPRECIATION",
    label: "Surat Penghargaan",
    labelEn: "Letter of Appreciation",
    description: "Surat penghargaan untuk kontribusi atau partisipasi",
    icon: "Heart",
    color: "bg-pink-100 text-pink-800",
    fields: [
      {
        key: "reason",
        label: "Alasan Penghargaan",
        type: "text",
        required: true,
      },
      { key: "event", label: "Kegiatan", type: "text" },
      { key: "role", label: "Peran/Kontribusi", type: "text" },
    ],
  },
];

export interface CertificateFilters {
  studentId?: string;
  certificateType?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  isPublic?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateCertificateData {
  studentId: string;
  certificateType: string;
  title: string;
  description?: string;
  grade?: string;
  rank?: number;
  issueDate: string;
  signatoryName: string;
  signatoryTitle: string;
  signatureUrl?: string;
  isPublic?: boolean;
}

// Query Keys
export const certificateKeys = {
  all: ["certificates"] as const,
  lists: () => [...certificateKeys.all, "list"] as const,
  list: (filters?: CertificateFilters) =>
    [...certificateKeys.lists(), filters] as const,
  details: () => [...certificateKeys.all, "detail"] as const,
  detail: (id: string) => [...certificateKeys.details(), id] as const,
  byStudent: (studentId: string) =>
    [...certificateKeys.all, "student", studentId] as const,
  verification: (code: string) =>
    [...certificateKeys.all, "verify", code] as const,
};

// Hooks
export function useCertificates(filters?: CertificateFilters) {
  return useQuery({
    queryKey: certificateKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== "") {
            params.append(key, String(value));
          }
        });
      }
      const response = await api.get<PaginatedResponse<DigitalCertificate>>(
        `/certificates?${params.toString()}`,
      );
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCertificate(id: string) {
  return useQuery({
    queryKey: certificateKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<ApiResponse<DigitalCertificate>>(
        `/certificates/${id}`,
      );
      return response.data.data;
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useStudentCertificates(studentId: string) {
  return useQuery({
    queryKey: certificateKeys.byStudent(studentId),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<DigitalCertificate>>(
        `/certificates/student/${studentId}`,
      );
      return response.data;
    },
    enabled: !!studentId,
  });
}

export function useVerifyCertificate(code: string) {
  return useQuery({
    queryKey: certificateKeys.verification(code),
    queryFn: async () => {
      const response = await api.get<
        ApiResponse<{
          valid: boolean;
          certificate?: DigitalCertificate;
          message?: string;
        }>
      >(`/certificates/verify/${code}`);
      return response.data.data;
    },
    enabled: !!code,
  });
}

export function useCreateCertificate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCertificateData) => {
      const response = await api.post<ApiResponse<DigitalCertificate>>(
        "/certificates",
        data,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificateKeys.lists() });
    },
  });
}

export function useUpdateCertificate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateCertificateData>;
    }) => {
      const response = await api.put<ApiResponse<DigitalCertificate>>(
        `/certificates/${id}`,
        data,
      );
      return response.data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: certificateKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: certificateKeys.lists() });
    },
  });
}

export function useDeleteCertificate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/certificates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: certificateKeys.lists() });
    },
  });
}

export function useGenerateCertificatePDF() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<{ pdfUrl: string }>(
        `/certificates/${id}/generate-pdf`,
      );
      return response.data;
    },
  });
}

export function useDownloadCertificate() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.get(`/certificates/${id}/download`, {
        responseType: "blob",
      });
      return response.data;
    },
  });
}

// Generate certificate number
export function generateCertificateNumber(
  type: CertificateType,
  unitCode: string = "CPN",
): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  const typeCode = type.substring(0, 3).toUpperCase();
  return `${unitCode}/${typeCode}/${year}${month}/${random}`;
}
