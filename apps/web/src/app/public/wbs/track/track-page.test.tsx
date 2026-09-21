import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The tracked report and the two mutations are driven by mocks so the test can
 * assert *which* calls the page makes — specifically that sending a reply does
 * not re-run the tracking lookup with a spent Turnstile token.
 */
const trackMutate = vi.fn();
const commentMutate = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-pengawasan", () => ({
  usePublicTrackWbs: () => ({ mutateAsync: trackMutate, isPending: false }),
  usePublicAddWbsComment: () => ({
    mutateAsync: commentMutate,
    isPending: false,
  }),
}));

// Turnstile is a third-party script; the hook is stood in for so the test can
// observe `refresh()` without a network round trip. `required: true` keeps the
// send path realistic.
const commentRefresh = vi.fn();
const trackRefresh = vi.fn();
vi.mock("@/components/security/turnstile-widget", () => ({
  TurnstileWidget: () => null,
  useTurnstile: () => ({
    token: "turnstile-token",
    required: true,
    ready: true,
    blocked: false,
    refresh: commentRefresh,
    widgetProps: {},
  }),
}));

import PublicWbsTrackPage from "./page";

const report = {
  ticketCode: "WBS-202601-ABCDEF",
  trackingToken: "a-tracking-token",
  category: "KEUANGAN_ASET",
  targetLevel: "PENGURUS_YAYASAN",
  subject: "Dugaan penyalahgunaan",
  description: "Deskripsi",
  status: "DIAJUKAN",
  primaryHandlerRole: "YAYASAN_PENGAWAS",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  comments: [],
};

describe("PublicWbsTrackPage — reply without a stale Turnstile refetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the new reply immediately and does not re-run the tracking lookup", async () => {
    const user = userEvent.setup();

    trackMutate.mockResolvedValueOnce(report);
    commentMutate.mockResolvedValueOnce({
      id: "c-new",
      senderType: "REPORTER",
      senderName: "Pelapor Anonim",
      message: "Pesan baru saya",
      createdAt: new Date().toISOString(),
    });

    render(<PublicWbsTrackPage />);

    await user.type(
      screen.getByLabelText(/Kode Tiket WBS/i),
      report.ticketCode,
    );
    await user.type(
      screen.getByLabelText(/Token Akses Rahasia/i),
      report.trackingToken,
    );
    await user.click(screen.getByRole("button", { name: /Lacak|Cari|Cek/i }));

    await waitFor(() => expect(trackMutate).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(report.ticketCode, { exact: false }),
    ).toBeDefined();

    // Send the reply.
    await user.type(
      screen.getByPlaceholderText(/Ketik pesan Anda/i),
      "Pesan baru saya",
    );
    await user.click(screen.getByRole("button", { name: /Kirim Pesan/i }));

    // The reply is folded in from the mutation response, so it is visible
    // without a second (token-less) tracking round trip.
    expect(await screen.findByText("Pesan baru saya")).toBeDefined();
    expect(commentMutate).toHaveBeenCalledTimes(1);
    expect(trackMutate).toHaveBeenCalledTimes(1);
  });

  it("surfaces a comment failure instead of silently refreshing", async () => {
    const user = userEvent.setup();

    trackMutate.mockResolvedValueOnce(report);
    commentMutate.mockRejectedValueOnce({
      response: { data: { message: "Token Turnstile tidak valid." } },
    });

    render(<PublicWbsTrackPage />);

    await user.type(
      screen.getByLabelText(/Kode Tiket WBS/i),
      report.ticketCode,
    );
    await user.type(
      screen.getByLabelText(/Token Akses Rahasia/i),
      report.trackingToken,
    );
    await user.click(screen.getByRole("button", { name: /Lacak|Cari|Cek/i }));
    await waitFor(() => expect(trackMutate).toHaveBeenCalledTimes(1));

    await user.type(
      screen.getByPlaceholderText(/Ketik pesan Anda/i),
      "Pesan gagal",
    );
    await user.click(screen.getByRole("button", { name: /Kirim Pesan/i }));

    expect(
      await screen.findByText("Token Turnstile tidak valid."),
    ).toBeDefined();
  });
});
