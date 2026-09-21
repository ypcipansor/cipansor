import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FoundationDecisionVerificationDTO } from "@cipansor/shared";

/**
 * Halaman verifikasi publik tidak boleh mengeklaim keabsahan dari `found` saja.
 *
 * `found` berarti "ada rekaman yang cocok". Sebuah rekaman tetap dapat gagal
 * diperiksa — byte-nya tidak cocok dengan digest yang ditandatangani, atau
 * e-seal-nya tidak dapat diverifikasi — dan versi sebelumnya tetap menampilkan
 * judul "Keputusan Sah" untuk rekaman seperti itu. Judul sekarang bergantung
 * pada `isValid`, yang hanya true bila SEMUA pemeriksaan yang mungkin lulus;
 * `null` (tidak diperiksa) bukan lulus. Berkas ini memaku kontrak itu, karena
 * kesalahan arah sebaliknya adalah kalimat jaminan palsu yang dibaca orang luar.
 */

const tokenState = {
  data: null as FoundationDecisionVerificationDTO | null,
  isLoading: false,
  error: null as unknown,
};

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=tok-1"),
}));

vi.mock("@/hooks/use-foundation-decisions", () => ({
  useVerifyFoundationDecision: () => tokenState,
  useVerifyFoundationDecisionPdf: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  FOUNDATION_ORGAN_LABEL: { PEMBINA: "Dewan Pembina" },
  FOUNDATION_STATUS_LABEL: { APPROVED: "Disahkan" },
  FOUNDATION_KIND_LABEL: { CIRCULAR: "Sirkuler" },
}));

vi.mock("@/components/security/turnstile-widget", () => ({
  useTurnstile: () => ({
    token: null,
    required: false,
    blocked: false,
    ready: true,
    refresh: vi.fn(),
    widgetProps: {},
  }),
  TurnstileWidget: () => null,
}));

import PublicVerifyDecisionPage from "./page";

function dto(
  over: Partial<FoundationDecisionVerificationDTO> = {},
): FoundationDecisionVerificationDTO {
  return {
    found: true,
    isValid: true,
    decisionId: "d1",
    publication: "PUBLIC",
    subject: "Pengesahan Rencana Kerja",
    organType: "PEMBINA",
    kind: "CIRCULAR",
    status: "APPROVED",
    decidedAt: "2026-01-02T00:00:00.000Z",
    digest: "a".repeat(64),
    archiveDigest: "a".repeat(64),
    digestOk: true,
    sealVerified: true,
    reason: null,
    voteCount: 3,
    approveCount: 3,
    rejectCount: 0,
    abstainCount: 0,
    ...over,
  };
}

beforeEach(() => {
  tokenState.data = null;
  tokenState.isLoading = false;
  tokenState.error = null;
});

describe("halaman verifikasi keputusan publik", () => {
  it("menampilkan judul 'sah' HANYA ketika isValid true", () => {
    tokenState.data = dto({ isValid: true });
    render(<PublicVerifyDecisionPage />);
    expect(screen.getByText(/Dokumen Sah & Terverifikasi/)).toBeTruthy();
  });

  it("TIDAK mengeklaim sah ketika digestOk false walau found true", () => {
    // Rekaman ditemukan, tetapi byte yang diperiksa berbeda dari digest yang
    // ditandatangani. Dulu halaman ini tetap menulis "Keputusan Sah".
    tokenState.data = dto({ isValid: false, digestOk: false });
    render(<PublicVerifyDecisionPage />);
    expect(screen.queryByText(/Dokumen Sah/)).toBeNull();
    expect(
      screen.getByText(/Rekaman Tercatat — Keabsahan Tidak Terbukti/),
    ).toBeTruthy();
  });

  it("TIDAK mengeklaim sah ketika e-seal tidak terverifikasi", () => {
    tokenState.data = dto({ isValid: false, sealVerified: false });
    render(<PublicVerifyDecisionPage />);
    expect(screen.queryByText(/Dokumen Sah/)).toBeNull();
  });

  it("'tidak diperiksa' (null) bukan 'aman': sealVerified null tidak sah", () => {
    // isValid tidak boleh lulus dari null — "tidak diperiksa" bukan bukti.
    tokenState.data = dto({
      isValid: false,
      sealVerified: null,
      digestOk: null,
    });
    render(<PublicVerifyDecisionPage />);
    expect(screen.queryByText(/Dokumen Sah/)).toBeNull();
    expect(
      screen.getByText(/Tidak ada byte yang dapat dibandingkan/),
    ).toBeTruthy();
  });

  it("menampilkan 'tidak ditemukan' ketika found false", () => {
    tokenState.data = dto({ found: false, isValid: false, subject: null });
    render(<PublicVerifyDecisionPage />);
    expect(screen.getByText(/tidak ditemukan atau belum final/i)).toBeTruthy();
  });

  /**
   * Regresi SECURITY CRITICAL — verifikasi anonim membocorkan metadata.
   *
   * Server menyensor `subject`/organ/tanggal/rekap suara untuk keputusan
   * PRIVATE. Klien tidak boleh mengarang isinya: ia harus menyatakan bahwa
   * rinciannya tidak dipublikasikan, dan TIDAK menampilkan "Disahkan" atau
   * angka nol yang menyesatkan — keabsahan dokumen tetap terbaca.
   */
  it("menyembunyikan metadata yang disensor dan menyatakan alasannya", () => {
    tokenState.data = dto({
      publication: "PRIVATE",
      subject: null,
      organType: null,
      kind: null,
      status: null,
      decidedAt: null,
      voteCount: 0,
      approveCount: 0,
      rejectCount: 0,
      abstainCount: 0,
    });
    render(<PublicVerifyDecisionPage />);

    expect(screen.queryByText(/Pengesahan Rencana Kerja/)).toBeNull();
    expect(screen.queryByText("Disahkan")).toBeNull();
    expect(screen.queryByText("Setuju")).toBeNull();
    // Keabsahan TETAP dinyatakan — itu satu-satunya hal yang boleh dibaca anonim.
    expect(screen.getByText(/Dokumen Sah & Terverifikasi/)).toBeTruthy();
    expect(screen.getByText(/tidak dipublikasikan/)).toBeTruthy();
  });
});
