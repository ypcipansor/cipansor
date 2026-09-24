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

  it("clears the previous report when a later lookup fails", async () => {
    // Reviewer finding 3. A successful lookup for ticket A, then a failed
    // lookup for ticket B must not leave A's detail on screen — it would
    // describe a report that is not the one being tracked, and the reply form
    // would post against A's stale ticket/token.
    const user = userEvent.setup();

    trackMutate.mockResolvedValueOnce(report).mockRejectedValueOnce({
      response: { data: { message: "Kode tiket atau token tidak valid." } },
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
    expect(
      await screen.findByText(report.ticketCode, { exact: false }),
    ).toBeDefined();

    // Change the ticket and fail the second lookup.
    await user.clear(screen.getByLabelText(/Kode Tiket WBS/i));
    await user.type(
      screen.getByLabelText(/Kode Tiket WBS/i),
      "WBS-202601-XXXXXX",
    );
    await user.click(screen.getByRole("button", { name: /Lacak|Cari|Cek/i }));

    expect(
      await screen.findByText("Kode tiket atau token tidak valid."),
    ).toBeDefined();
    // The first ticket's detail and its reply form are gone.
    expect(screen.queryByText(report.ticketCode, { exact: false })).toBeNull();
    expect(screen.queryByPlaceholderText(/Ketik pesan Anda/i)).toBeNull();
  });
});

/**
 * A terminal case must not offer a reply control. The API refuses a public
 * reply once the case is `SELESAI` / `TIDAK_DAPAT_DITINDAKLANJUTI`, so the page
 * has to agree with it: an input the server will reject is worse than none. The
 * predicate is the shared `isClosedWbsStatus`, matching the API's decision.
 */
describe("PublicWbsTrackPage — reply control respects a closed case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadWithStatus(status: string) {
    const user = userEvent.setup();
    trackMutate.mockResolvedValueOnce({ ...report, status });

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
    // The detail card only renders after the report is loaded.
    await screen.findByText(report.ticketCode, { exact: false });
    return user;
  }

  it.each(["SELESAI", "TIDAK_DAPAT_DITINDAKLANJUTI"])(
    "hides the reply form and shows a closed notice while the case is %s",
    async (status) => {
      await loadWithStatus(status);

      expect(screen.queryByPlaceholderText(/Ketik pesan Anda/i)).toBeNull();
      expect(screen.queryByRole("button", { name: /Kirim Pesan/i })).toBeNull();
      expect(screen.getByText(/telah ditutup/i)).toBeDefined();
    },
  );

  it("still renders the reply form while the case is open", async () => {
    await loadWithStatus("DALAM_PENYELIDIKAN");

    expect(screen.getByPlaceholderText(/Ketik pesan Anda/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Kirim Pesan/i })).toBeDefined();
    expect(screen.queryByText(/telah ditutup/i)).toBeNull();
  });
});
