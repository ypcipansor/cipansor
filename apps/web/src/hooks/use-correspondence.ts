import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  CreateLetterInput,
  DispatchLetterInput,
  LetterCcInput,
  LetterDirection,
  LetterStatus,
  LetterDetail,
  CreateDispositionInput,
  PublicLetterVerificationResult,
  CorrespondenceParticipant,
  ListParticipantsQueryInput,
} from "@cipansor/shared";

export function useCorrespondenceParticipants(params?: ListParticipantsQueryInput) {
  return useQuery({
    queryKey: ["correspondenceParticipants", params],
    queryFn: async () => {
      const response = await api.get<{
        success: boolean;
        data: CorrespondenceParticipant[];
      }>("/correspondence/participants", { params });
      return response.data;
    },
  });
}

export function useVerifyPdfLetter() {
  return useMutation({
    mutationFn: async ({
      file,
      turnstileToken,
    }: {
      file: File;
      /**
       * Null ketika gerbang Turnstile dimatikan di build ini (site key kosong).
       * Field-nya tidak dikirim sama sekali dalam keadaan itu, sehingga
       * peladen melihat permintaan tanpa token — yang memang jawabannya benar,
       * karena sisi peladen pun mematikan gerbangnya lewat secret key kosong.
       */
      turnstileToken: string | null;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (turnstileToken) formData.append("turnstileToken", turnstileToken);
      const response = await api.post<{
        success: boolean;
        data: PublicLetterVerificationResult;
      }>("/esign/verify-pdf", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data.data;
    },
  });
}

interface GetLettersParams {
  unitId: string;
  page?: number;
  limit?: number;
  direction?: LetterDirection;
  status?: LetterStatus;
  search?: string;
  scope?: "ALL" | "PERSONAL";
}

export function useCorrespondence(unitId?: string) {
  const queryClient = useQueryClient();

  // Get Letters List
  //
  // Deliberately NOT gated on `unitId`. Foundation-level accounts — the
  // sekretaris and ketua yayasan, who are the middle of every routing chain —
  // have no unit, so `enabled: !!unitId` meant their e-office page fetched
  // nothing and rendered empty. The server decides scope now: omitting unitId
  // asks for "everything I am entitled to", which for a unit-scoped user is
  // still only their own unit.
  const useLetters = (params: Omit<GetLettersParams, "unitId">) => {
    return useQuery({
      queryKey: ["letters", unitId ?? "all", params],
      queryFn: async () => {
        const response = await api.get("/correspondence/letters", {
          params: unitId ? { ...params, unitId } : params,
        });
        return response.data;
      },
    });
  };

  // Get Single Letter
  const useLetter = (id: string) => {
    return useQuery({
      queryKey: ["letter", id],
      queryFn: async () => {
        const response = await api.get<{
          success: boolean;
          data: LetterDetail;
        }>(`/correspondence/letters/${id}`);
        return response.data.data;
      },
      enabled: !!id,
      staleTime: 0,
    });
  };

  // Create Letter
  const createLetter = useMutation({
    mutationFn: async (data: CreateLetterInput) => {
      const response = await api.post("/correspondence/letters", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letters"] });
    },
  });

  // Submit DRAFT for Review
  const submitForReview = useMutation({
    mutationFn: async ({ id, note, reviewerIds }: { id: string; note?: string; reviewerIds?: string[] }) => {
      const response = await api.post(`/correspondence/letters/${id}/submit`, {
        note,
        reviewerIds,
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["letter", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["letters"] });
    },
  });

  // Review/Approve Letter
  const reviewLetter = useMutation({
    mutationFn: async ({
      id,
      action,
      notes,
      nextReviewerId,
      isFinalSigner,
    }: {
      id: string;
      action: "APPROVE" | "REJECT";
      notes?: string;
      nextReviewerId?: string;
      isFinalSigner?: boolean;
    }) => {
      const response = await api.post(`/correspondence/letters/${id}/review`, {
        action,
        notes,
        nextReviewerId,
        isFinalSigner,
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["letter", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["letters"] });
    },
  });

  // Create Disposition
  const createDisposition = useMutation({
    mutationFn: async (data: CreateDispositionInput) => {
      const response = await api.post("/correspondence/dispositions", data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["letter", variables.letterId],
      });
    },
  });

  // Update Disposition Status
  const updateDispositionStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: "IN_PROGRESS" | "COMPLETED";
      notes?: string;
    }) => {
      const response = await api.patch(
        `/correspondence/dispositions/${id}/status`,
        { status, notes },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["letters"] });
      queryClient.invalidateQueries({ queryKey: ["letter"] });
    },
  });

  /**
   * Send a returned draft back up the ladder.
   *
   * `POST /correspondence/letters/:id/resubmit` has existed since the workflow
   * was tightened, and nothing on the frontend has ever called it. A letter a
   * reviewer sent back for revision therefore reached REVISION_NEEDED and
   * stopped there: the author could edit it and had no way to resubmit, and no
   * button anywhere in the app said otherwise. The one flow the workflow rules
   * were written to make possible was the one flow the UI could not perform.
   */
  const resubmitLetter = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const response = await api.post(`/correspondence/letters/${id}/resubmit`, { note });
      return response.data;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["letters"] });
      queryClient.invalidateQueries({ queryKey: ["letter", v.id] });
    },
  });

  /**
   * Catat bahwa naskah keluar ini benar-benar dikirim.
   *
   * Langkah yang tidak pernah ada tombolnya: sebuah surat yang sudah
   * ditandatangani langsung melompat ke arsip, dan saat naskahnya diserahkan
   * kepada kurir — satu-satunya saat yang dicatat buku agenda surat keluar —
   * tidak dapat dituliskan di mana pun.
   */
  const dispatchLetter = useMutation({
    mutationFn: async ({ id, ...body }: DispatchLetterInput & { id: string }) => {
      const response = await api.post(
        `/correspondence/letters/${id}/dispatch`,
        body,
      );
      return response.data;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["letters"] });
      queryClient.invalidateQueries({ queryKey: ["letter", v.id] });
    },
  });

  /**
   * Ganti daftar tembusan sebuah naskah yang belum ditandatangani.
   *
   * Mengirim daftar utuhnya, bukan satu baris: urutan adalah bagian dari isi
   * daftar itu, dan menambah/menghapus per baris tidak dapat memindahkannya.
   */
  const updateLetterCc = useMutation({
    mutationFn: async ({
      id,
      ccRecipients,
    }: {
      id: string;
      ccRecipients: LetterCcInput[];
    }) => {
      const response = await api.put(
        `/correspondence/letters/${id}/tembusan`,
        { ccRecipients },
      );
      return response.data;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["letter", v.id] });
    },
  });

  // Get Stats — same reasoning as useLetters: no unit is a valid scope, not a
  // reason to skip the request.
  const useStats = () => {
    return useQuery({
      queryKey: ["letters", "stats", unitId ?? "all"],
      queryFn: async () => {
        const response = await api.get("/correspondence/stats", {
          params: unitId ? { unitId } : undefined,
        });
        return response.data.data;
      },
    });
  };

  return {
    useLetters,
    useLetter,
    createLetter,
    submitForReview,
    reviewLetter,
    createDisposition,
    updateDispositionStatus,
    resubmitLetter,
    dispatchLetter,
    updateLetterCc,
    useStats,
  };
}
