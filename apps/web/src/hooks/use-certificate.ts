import { useEffect, useMemo, useState } from "react";
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
    nis: string;
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  // Use rejection sampling to avoid modulo bias when generating 0..9999
  const maxUnbiasedValue = 60000; // largest multiple of 10000 less than 65536
  let value: number;
  do {
    value = globalThis.crypto.getRandomValues(new Uint16Array(1))[0];
  } while (value >= maxUnbiasedValue);

  const random = (value % 10000).toString().padStart(4, "0");
  const typeCode = type.substring(0, 3).toUpperCase();
  return `${unitCode}/${typeCode}/${year}${month}/${random}`;
}

/** The `YYYYMM` bucket `generateCertificateNumber` embeds in a number. */
function currentMonthBucket(now: Date = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Milliseconds from `now` until the next calendar month begins.
 *
 * Computed by constructing the 1st of the following month rather than adding a
 * fixed 30 days, so months of different lengths (and DST shifts) still land on
 * the real boundary.
 */
function msUntilNextMonth(now: Date = new Date()): number {
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return nextMonth.getTime() - now.getTime();
}

// `setTimeout` treats a delay above the signed 32-bit maximum as an overflow and
// fires after ~1ms instead, so a timer aimed at the next month from the 1st of
// a 31-day month (2.68e9 ms) would fire at once, find the bucket unchanged, and
// never re-arm — the rollover would be silently lost. Clamping keeps the timer
// honest: it fires a little early, then re-arms for the remainder.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * A certificate number that is stable for a given identity and calendar month.
 *
 * `generateCertificateNumber` is random, so calling it in a component body gave
 * a new number on every render — an unrelated state update redrew the printed
 * certificate with a different number. `useMemo` ties the value to its real
 * inputs: it changes only when `type`, `unitCode` or the current month changes,
 * not on a re-render.
 *
 * The month is part of the identity because the number embeds a `YYYYMM`
 * segment: a page left open across midnight on the last day of a month would
 * otherwise keep issuing a number stamped with the old month. One self-arming
 * timeout fires at the next month boundary to advance the bucket; it is cleared
 * on unmount and re-armed when the identity changes, so there is never more
 * than one pending timer and none leaks. The timer is scheduled from an effect,
 * so no browser API is touched during render (SSR-safe).
 *
 * The value is a display convenience, not an authoritative identifier; the
 * backend issues the recorded certificate number.
 */
export function useCertificateNumber(
  type: CertificateType,
  unitCode: string = "CPN",
): string {
  const [monthBucket, setMonthBucket] = useState(() => currentMonthBucket());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        const next = currentMonthBucket();
        // Same bucket after an early (clamped) wake-up: keep the value, but
        // re-arm so the real boundary is still reached.
        setMonthBucket((prev) => (prev === next ? prev : next));
        arm();
      }, Math.min(msUntilNextMonth(), MAX_TIMEOUT_MS));
    };
    arm();
    return () => clearTimeout(timer);
    // `monthBucket` is deliberately absent: the chain re-arms itself, so adding
    // it would tear down and rebuild the timer on every rollover for no gain.
  }, [type, unitCode]);

  return useMemo(
    () => generateCertificateNumber(type, unitCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monthBucket is
    // the re-key signal: it is not read here, but advancing it must mint a
    // number carrying the new month.
    [type, unitCode, monthBucket],
  );
}
