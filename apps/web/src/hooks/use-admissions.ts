import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  RegistrantDTO,
  RegistrantDocumentDTO,
  OnboardRegistrantPayload,
  TrackedRegistrantDTO,
  RegistrationStatus,
} from "@cipansor/shared";
export type { RegistrationStatus };

// =====================================
// Backward-compat types & constants
// (formerly exported from use-psb.ts)
// =====================================

export type Gender = "MALE" | "FEMALE";

export const REGISTRATION_STATUSES: RegistrationStatus[] = [
  "REGISTERED",
  "DOCUMENT_CHECK",
  "TEST_SCHEDULED",
  "TEST_COMPLETED",
  "ACCEPTED",
  "REJECTED",
  "ENROLLED",
  "CANCELLED",
];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  REGISTERED: "Terdaftar",
  DOCUMENT_CHECK: "Verifikasi Dokumen",
  TEST_SCHEDULED: "Tes Dijadwalkan",
  TEST_COMPLETED: "Tes Selesai",
  ACCEPTED: "Diterima",
  REJECTED: "Ditolak",
  ENROLLED: "Terdaftar Ulang",
  CANCELLED: "Dibatalkan",
  // Legacy
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  DOCUMENT_REVIEW: "Review Dokumen",
  INTERVIEW_SCHEDULED: "Wawancara Dijadwalkan",
  INTERVIEW_COMPLETED: "Wawancara Selesai",
};

export const REGISTRATION_STATUS_COLORS: Record<RegistrationStatus, string> = {
  REGISTERED: "bg-blue-100 text-blue-800",
  DOCUMENT_CHECK: "bg-yellow-100 text-yellow-800",
  TEST_SCHEDULED: "bg-purple-100 text-purple-800",
  TEST_COMPLETED: "bg-indigo-100 text-indigo-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  ENROLLED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  // Legacy
  DRAFT: "bg-gray-100 text-gray-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  DOCUMENT_REVIEW: "bg-yellow-100 text-yellow-800",
  INTERVIEW_SCHEDULED: "bg-cyan-100 text-cyan-800",
  INTERVIEW_COMPLETED: "bg-teal-100 text-teal-800",
};

// --- Admission Periods ---
export function useAdmissionPeriods(params?: any) {
  return useQuery({
    queryKey: ["admission-periods", params],
    queryFn: async () => {
      const response = await api.get("/admissions/periods", { params });
      return response.data;
    },
  });
}

export function useActiveAdmissionWaves(params?: any) {
  return useQuery({
    queryKey: ["active-admission-waves", params],
    queryFn: async () => {
      const response = await api.get("/admissions/waves", {
        params: { status: "OPEN", ...params },
      });
      return response.data;
    },
  });
}

export function useUpdateRegistrantScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      testScore,
      interviewScore,
      tahfidzScore,
      notes,
    }: {
      id: string;
      testScore?: number;
      interviewScore?: number;
      tahfidzScore?: number;
      notes?: string;
    }) => {
      const response = await api.patch(`/admissions/registrants/${id}/score`, {
        testScore,
        interviewScore,
        tahfidzScore,
        notes,
      });
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
    },
  });
}

export function useVerifyRegistrantDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      isVerified,
      notes,
    }: {
      id: string;
      isVerified: boolean;
      notes?: string;
    }) => {
      const response = await api.patch(`/admissions/documents/${id}/verify`, {
        isVerified,
        notes,
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrant"] });
    },
  });
}

export function useAdmissionPeriod(id: string) {
  return useQuery({
    queryKey: ["admission-period", id],
    queryFn: async () => {
      const response = await api.get(`/admissions/periods/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

/**
 * Public PPDB tracker (GET /admissions/public/track). Requires both the
 * registration number and birth date; the backend rejects partial matches.
 */
export function useTrackRegistrant(registrationNo: string, birthDate: string) {
  return useQuery({
    queryKey: ["track-registrant", registrationNo, birthDate],
    queryFn: async () => {
      const response = await api.get<{ data: TrackedRegistrantDTO }>(
        "/admissions/public/track",
        { params: { registrationNo, birthDate } },
      );
      return response.data.data;
    },
    enabled: !!registrationNo && !!birthDate,
    retry: false,
  });
}

// --- Admission Waves ---
export function useAdmissionWaves(params?: any) {
  return useQuery({
    queryKey: ["admission-waves", params],
    queryFn: async () => {
      const response = await api.get("/admissions/waves", { params });
      return response.data;
    },
  });
}

export function useAdmissionWave(id: string) {
  return useQuery({
    queryKey: ["admission-wave", id],
    queryFn: async () => {
      const response = await api.get(`/admissions/waves/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

// --- Registrants ---
export function useRegistrants(params?: any) {
  return useQuery({
    queryKey: ["admission-registrants", params],
    queryFn: async () => {
      const response = await api.get("/admissions/registrants", { params });
      return response.data;
    },
  });
}

export function useRegistrant(id: string) {
  return useQuery<RegistrantDTO>({
    queryKey: ["admission-registrant", id],
    queryFn: async () => {
      const response = await api.get(`/admissions/registrants/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useOnboardRegistrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OnboardRegistrantPayload) => {
      // The onboarding orchestrator is mounted under the waves sub-router at
      // POST /admissions/waves/onboard-registrant (see ppdb-wave.routes.ts).
      // The handler reads `registrantId` from the request body.
      const response = await api.post(
        `/admissions/waves/onboard-registrant`,
        payload,
      );
      return response.data;
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
      // The detail query feeds the onboarding button's enabled/disabled state
      // (via status/enrolledAt). Without invalidating it, the button stays
      // visible after a successful onboarding and a second click fails with a
      // "already enrolled" conflict.
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", payload.registrantId] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

/**
 * Record daftar ulang payment. Enrolment is gated on this, so it has to
 * invalidate the registrant detail — the onboarding button reads the same
 * field and would otherwise stay disabled after a successful payment.
 */
export function useRecordRegistrationFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      note,
      amount,
    }: {
      id: string;
      note?: string;
      amount?: number;
    }) => {
      const response = await api.patch(
        `/admissions/registrants/${id}/registration-fee`,
        { note, amount },
      );
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
    },
  });
}

export function useUpdateRegistrantStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes }: any) => {
      const response = await api.patch(`/admissions/registrants/${id}/status`, { status, notes });
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
    },
  });
}

// Backward compatibility aliases
export { useAdmissionPeriods as useRegistrationPeriods };
export { useRegistrants as useRegistrations };
export { useRegistrant as useRegistration };

// =====================================
// Backward-compat hooks
// (formerly exported from use-psb.ts)
// =====================================

export function useActivePeriod() {
  return useQuery({
    queryKey: ["active-admission-period"],
    queryFn: async () => {
      // Use the unauthenticated public endpoint so this hook works on the
      // public PPDB page (`/public/spmb`) where no user is logged in. The
      // authenticated `/admissions/periods` list is behind `authenticate`
      // + `authorize(SUPER_ADMIN, UNIT_ADMIN)` and would return 401/403 for
      // anonymous visitors, breaking the registration form.
      const response = await api.get("/admissions/public/active-period");
      return response.data?.data ?? null;
    },
  });
}

export function useCreateRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: FormData | Record<string, unknown>) => {
      // The backend `POST /admissions/registrants` route validates with
      // `createRegistrantSchema.parse(req.body)` and has no multipart
      // middleware (multer) installed. Sending a real `FormData` would land
      // as an empty `req.body` and fail Zod validation. To keep
      // backward-compatible callers working, accept both shapes and always
      // serialise to a plain JSON object on the wire. File entries (from
      // legacy callers that appended browser `File`s) are dropped here:
      // document upload is a separate flow under
      // `/admissions/registrants/:id/documents`, not part of registrant
      // creation.
      let payload: Record<string, any>;
      if (typeof FormData !== "undefined" && data instanceof FormData) {
        const obj: Record<string, any> = {};
        data.forEach((value, key) => {
          if (typeof value === "string") {
            obj[key] = value;
          }
        });
        payload = obj;
      } else {
        payload = data;
      }
      // Use the unauthenticated public endpoint. The authenticated
      // `/admissions/registrants` POST is behind `authorize(SUPER_ADMIN,
      // UNIT_ADMIN, STAFF)` and would reject anonymous visitors submitting
      // the public PPDB form. The public variant validates with the same
      // `createRegistrantSchema` but returns only non-sensitive fields.
      const response = await api.post("/admissions/public/registrants", payload);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
    },
  });
}

export function useUpdateRegistrationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: RegistrationStatus;
      notes?: string;
    }) => {
      const response = await api.patch(`/admissions/registrants/${id}/status`, {
        status,
        notes,
      });
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
    },
  });
}

export function useAcceptRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const response = await api.patch(`/admissions/registrants/${id}/status`, {
        status: "ACCEPTED",
        notes,
      });
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
    },
  });
}

export function useRejectRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.patch(`/admissions/registrants/${id}/status`, {
        status: "REJECTED",
        notes: reason,
      });
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrants"] });
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
    },
  });
}

export function useScheduleTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      testDate,
      notes,
    }: {
      id: string;
      testDate: string;
      notes?: string;
    }) => {
      // The unified backend doesn't yet expose a dedicated schedule-test
      // endpoint; advance status and record notes/scheduled date in the
      // registrant's notes so existing UIs keep working.
      const response = await api.patch(`/admissions/registrants/${id}/status`, {
        status: "TEST_SCHEDULED",
        notes: notes
          ? `Tes dijadwalkan pada ${testDate}. ${notes}`
          : `Tes dijadwalkan pada ${testDate}.`,
      });
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
    },
  });
}

export function useRecordTestResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      score,
      notes,
    }: {
      id: string;
      score: number;
      notes?: string;
    }) => {
      const response = await api.patch(`/admissions/registrants/${id}/score`, {
        testScore: score,
        notes,
      });
      return response.data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admission-registrant", id] });
    },
  });
}

export function usePriorityLeads() {
  return useQuery({
    queryKey: ["priority-leads"],
    queryFn: async () => {
      const response = await api.get("/admissions/leads/priority");
      return response.data;
    },
  });
}
