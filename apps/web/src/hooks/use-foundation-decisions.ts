"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateFoundationDecisionInput,
  CastFoundationVoteInput,
  UpsertFoundationRuleInput,
  FoundationDecisionSummaryDTO,
  FoundationDecisionDetailDTO,
  FoundationDecisionVerificationDTO,
  FoundationDecisionStatus,
  FoundationOrganType,
  VoteSummary,
} from "@cipansor/shared";
import api from "@/lib/api";

export interface FoundationDecisionPage {
  items: FoundationDecisionSummaryDTO[];
  total: number;
  page: number;
  limit: number;
}

export interface FoundationVoteOutcome {
  outcome: "APPROVED" | "REJECTED" | "OPEN";
  status: string;
}

export interface CastVoteResult {
  voteId: string;
  choice: string;
  voteSummary: VoteSummary;
  outcome: FoundationVoteOutcome;
}

/** Peta label manusiawi untuk enum kecil agar UI tak menyebar ternary. */
export const FOUNDATION_ORGAN_LABEL: Record<FoundationOrganType, string> = {
  PEMBINA: "Dewan Pembina",
  PENGURUS: "Pengurus Yayasan",
  PENGAWAS: "Dewan Pengawas",
  GABUNGAN: "Rapat Gabungan",
};

export const FOUNDATION_STATUS_LABEL: Record<FoundationDecisionStatus, string> =
  {
    DRAFT: "Draf",
    VOTING: "Menunggu Suara",
    APPROVED: "Disahkan",
    REJECTED: "Ditolak",
  };

export const FOUNDATION_KIND_LABEL: Record<string, string> = {
  CIRCULAR: "Sirkuler",
  MEETING: "Rapat",
};

/**
 * Nilai sentinel "tanpa filter" pada Select.
 *
 * SelectItem tidak boleh bernilai string kosong (Radix memakainya untuk
 * placeholder), sehingga "semua" butuh sentinel tersendiri. Sentinel ini
 * diterjemahkan menjadi `undefined` di sini — sekali, di satu tempat — karena
 * mengirim literal "all" ke API akan ditolak skema enum `organType`/`status`,
 * dan pengguna tidak akan pernah bisa mengosongkan filter.
 */
export const FOUNDATION_FILTER_ALL = "all";

/** Ubah nilai filter Select menjadi parameter API (undefined = tanpa filter). */
export function normalizeFoundationFilter(value: string | undefined): string | undefined {
  if (!value || value === FOUNDATION_FILTER_ALL) return undefined;
  return value;
}

async function getPage(params: {
  page?: number;
  limit?: number;
  organType?: string;
  status?: string;
}): Promise<FoundationDecisionPage> {
  const res = await api.get("/foundation/decisions", { params });
  return {
    items: res.data?.data ?? [],
    total: res.data?.pagination?.total ?? 0,
    page: res.data?.pagination?.page ?? 1,
    limit: res.data?.pagination?.limit ?? 10,
  };
}

export function useFoundationDecisions(params: {
  page?: number;
  limit?: number;
  organType?: string;
  status?: string;
}) {
  const organType = normalizeFoundationFilter(params.organType);
  const status = normalizeFoundationFilter(params.status);
  return useQuery({
    queryKey: ["foundation-decisions", { ...params, organType, status }],
    queryFn: () => getPage({ ...params, organType, status }),
  });
}

export function useFoundationDecision(id: string) {
  return useQuery({
    queryKey: ["foundation-decision", id],
    queryFn: async (): Promise<FoundationDecisionDetailDTO> =>
      (await api.get(`/foundation/decisions/${id}`)).data.data,
    enabled: !!id,
  });
}

export function useCreateFoundationDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFoundationDecisionInput) =>
      api.post("/foundation/decisions", input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["foundation-decisions"] }),
  });
}

export function useCastFoundationVote(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CastFoundationVoteInput): Promise<CastVoteResult> =>
      api
        .post(`/foundation/decisions/${decisionId}/vote`, input)
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["foundation-decision", decisionId] });
      qc.invalidateQueries({ queryKey: ["foundation-decisions"] });
    },
  });
}

export function useFinalizeFoundationDecision(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/foundation/decisions/${decisionId}/finalize`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["foundation-decision", decisionId] });
      qc.invalidateQueries({ queryKey: ["foundation-decisions"] });
    },
  });
}

/** Unduh risalah PDF final (blob) dari arsip `FoundationDecisionDocument`. */
export function useDownloadFoundationDecisionDocument() {
  return useMutation({
    mutationFn: async (decisionId: string) => {
      const response = await api.get(
        `/foundation/decisions/${decisionId}/document`,
        {
          responseType: "blob",
        },
      );
      return response.data as Blob;
    },
  });
}

export function useVerifyFoundationDecision(token: string) {
  return useQuery({
    queryKey: ["foundation-decision-verify", token],
    queryFn: async (): Promise<FoundationDecisionVerificationDTO> =>
      (await api.get("/foundation/verify", { params: { token } })).data.data,
    enabled: !!token,
    retry: false,
  });
}

export interface FoundationRuleDTO {
  id?: string;
  organType: FoundationOrganType;
  decisionKind: string;
  quorumPresentMode: string;
  quorumPresentValue: number;
  quorumDecisionMode: string;
  quorumDecisionValue: number;
  decisionBasis: string;
}

export function useFoundationRules() {
  return useQuery({
    queryKey: ["foundation-rules"],
    queryFn: async (): Promise<FoundationRuleDTO[]> =>
      (await api.get("/foundation/rules")).data.data,
  });
}

export function useUpsertFoundationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertFoundationRuleInput) =>
      api.put("/foundation/rules", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["foundation-rules"] }),
  });
}
