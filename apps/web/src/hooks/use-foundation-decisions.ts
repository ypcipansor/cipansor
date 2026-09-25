"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateFoundationDecisionInput,
  CastFoundationVoteInput,
  UpsertFoundationRuleInput,
  FoundationDecisionDetailDTO,
  FoundationDecisionVerificationDTO,
  FoundationDecisionStatus,
  FoundationOrganType,
  FoundationDecisionPageDTO,
  CastFoundationVoteResultDTO,
  FoundationDecisionRuleDTO,
  FoundationCreateOptionsDTO,
} from "@cipansor/shared";
import api from "@/lib/api";

export type FoundationDecisionPage = FoundationDecisionPageDTO;
export type FoundationRuleDTO = FoundationDecisionRuleDTO;

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
    CANCELLED: "Rapat Dibatalkan",
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
export function normalizeFoundationFilter(
  value: string | undefined,
): string | undefined {
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

/**
 * Organ + jenis keputusan yang boleh dibuat aktor, dihitung PELADEN.
 *
 * Form create dulu menawarkan semua organ dengan default statis `PEMBINA`,
 * sehingga Pengawas dapat mengisi form organ Pembina yang submission-nya pasti
 * 403. Kebijakan "siapa boleh membuat organ apa" hanya ada di peladen, jadi UI
 * meminta daftarnya alih-alih menyalinnya.
 */
export function useFoundationCreateOptions(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["foundation-create-options"],
    queryFn: async (): Promise<FoundationCreateOptionsDTO> =>
      (await api.get("/foundation/decisions/create-options")).data.data,
    staleTime: 5 * 60 * 1000,
    // `enabled` dipakai halaman create untuk menahan permintaan sampai peran
    // terbukti boleh membuat keputusan. Tanpa itu, peran read-only yang
    // mengetik URL langsung mengirim permintaan yang peladen pasti 403.
    enabled: opts.enabled ?? true,
  });
}

export function useCastFoundationVote(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: CastFoundationVoteInput,
    ): Promise<CastFoundationVoteResultDTO> =>
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

/**
 * Batalkan rapat yang kuorum hadirnya tak pernah tercapai.
 *
 * Pasangan dari `useFinalizeFoundationDecision`: rapat yang kuorumnya tidak
 * tercapai tidak dapat difinalisasi, jadi tanpa hook ini satu-satunya jalan
 * keluar adalah menandainya REJECTED — menyatakan materi ditolak padahal rapat
 * tidak memutus apa pun.
 */
export function useCancelFoundationDecision(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/foundation/decisions/${decisionId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["foundation-decision", decisionId] });
      qc.invalidateQueries({ queryKey: ["foundation-decisions"] });
    },
  });
}

/**
 * Ubah klasifikasi publikasi metadata (SUPER_ADMIN).
 *
 * Bawaannya PRIVATE: endpoint verifikasi anonim menyensor subject, organ,
 * tanggal, dan rekap suara sampai keputusan sengaja diterbitkan. Hook ini
 * adalah satu-satunya jalan menerbitkannya.
 */
export function useSetFoundationPublication(decisionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (publication: "PRIVATE" | "PUBLIC") =>
      api.post(`/foundation/decisions/${decisionId}/publication`, {
        publication,
      }),
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

/**
 * Verifikasi lewat unggahan PDF.
 *
 * Mutasi, bukan query: berkasnya besar dan tidak boleh disimpan di cache query
 * (berisi dokumen tata kelola). Server membandingkan hash byte unggahan dengan
 * digest yang ditandatangani e-seal — inilah bukti yang mengikat keabsahan pada
 * berkas yang benar-benar dipegang pemindai, bukan pada catatan server.
 *
 * `turnstileToken` boleh null ketika gerbangnya dimatikan pada build ini (site
 * key kosong); field-nya tidak dikirim sama sekali dalam keadaan itu, karena
 * peladen pun mematikan gerbangnya lewat secret key kosong.
 */
export function useVerifyFoundationDecisionPdf() {
  return useMutation({
    mutationFn: async ({
      file,
      turnstileToken,
    }: {
      file: File;
      turnstileToken: string | null;
    }): Promise<FoundationDecisionVerificationDTO> => {
      const form = new FormData();
      form.append("file", file);
      if (turnstileToken) form.append("turnstileToken", turnstileToken);
      const res = await api.post("/foundation/verify-pdf", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data;
    },
  });
}

export function useFoundationRules(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["foundation-rules"],
    queryFn: async (): Promise<FoundationRuleDTO[]> =>
      (await api.get("/foundation/rules")).data.data,
    // `enabled` dipakai halaman untuk menahan permintaan sampai peran terbukti
    // SUPER_ADMIN. Tanpa itu, pengguna yayasan non-admin yang mengetik URL
    // langsung tetap mengirim permintaan yang pasti 403.
    enabled: opts.enabled ?? true,
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
