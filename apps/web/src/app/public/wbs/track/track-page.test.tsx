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

/**
 * A reply must post against the credentials the *displayed* report was loaded
 * with, not the current inputs.
 *
 * Finding 3 (this session). The reporter can edit the ticket/token while a
 * lookup is pending. The old code kept installing the older lookup's response
 * and used the live input state when sending a reply, so a slow lookup for A
 * could resolve after the input was changed to B and then `handleSendComment`
 * would post to ticket B with A's token — a message for the wrong report.
 */
describe("PublicWbsTrackPage — lookup result is bound to the credentials that fetched it", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it("ignores a superseded lookup so the screen never shows a report that mismatches the inputs", async () => {
    const user = userEvent.setup();

    const lookupA = deferred<typeof report>();
    const lookupB = deferred<typeof report>();
    trackMutate
      .mockReturnValueOnce(lookupA.promise)
      .mockReturnValueOnce(lookupB.promise);

    const reportB = {
      ...report,
      ticketCode: "WBS-202601-BBBBBB",
      trackingToken: "token-b",
      subject: "Laporan B",
    };

    render(<PublicWbsTrackPage />);

    // Start lookup A and leave it pending.
    await user.type(
      screen.getByLabelText(/Kode Tiket WBS/i),
      report.ticketCode,
    );
    await user.type(
      screen.getByLabelText(/Token Akses Rahasia/i),
      report.trackingToken,
    );
    await user.click(screen.getByRole("button", { name: /Lacak|Cari|Cek/i }));
    expect(trackMutate).toHaveBeenCalledTimes(1);

    // Edit the inputs to a second ticket and look it up; B resolves first.
    await user.clear(screen.getByLabelText(/Kode Tiket WBS/i));
    await user.type(
      screen.getByLabelText(/Kode Tiket WBS/i),
      reportB.ticketCode,
    );
    await user.clear(screen.getByLabelText(/Token Akses Rahasia/i));
    await user.type(
      screen.getByLabelText(/Token Akses Rahasia/i),
      reportB.trackingToken,
    );
    await user.click(screen.getByRole("button", { name: /Lacak|Cari|Cek/i }));
    expect(trackMutate).toHaveBeenCalledTimes(2);

    lookupB.resolve(reportB);
    expect(await screen.findByText(reportB.subject)).toBeDefined();

    // The stale A response lands *afterwards*. It no longer matches the inputs,
    // so installing it would put a report on screen the inputs cannot fetch —
    // and, before the fix, the reply form would then post to the *live* inputs
    // (B) rather than to the report actually displayed (A). It must be ignored:
    // the screen still shows B.
    lookupA.resolve(report);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(reportB.subject)).toBeDefined();
    expect(screen.queryByText(report.subject)).toBeNull();
  });

  it("does not post a reply when the displayed report has no bound credentials", async () => {
    // A superseded lookup leaves `reportCredentials` null (its result was
    // discarded), so even though the inputs are filled there is no resolved
    // report to reply to and the reply control stays hidden.
    const user = userEvent.setup();

    const lookupA = deferred<typeof report>();
    trackMutate.mockReturnValueOnce(lookupA.promise);

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

    // Edit the ticket before A resolves; A then resolves against stale inputs.
    await user.type(screen.getByLabelText(/Kode Tiket WBS/i), "X");
    lookupA.resolve(report);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByPlaceholderText(/Ketik pesan Anda/i)).toBeNull();
    expect(commentMutate).not.toHaveBeenCalled();
  });

  it("does not post a reply when the displayed report was cleared by an input edit", async () => {
    const user = userEvent.setup();
    trackMutate.mockResolvedValueOnce(report);

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
    await screen.findByText(report.ticketCode, { exact: false });

    // Editing the ticket clears the loaded report and its bound credentials.
    await user.type(screen.getByLabelText(/Kode Tiket WBS/i), "X");

    expect(screen.queryByPlaceholderText(/Ketik pesan Anda/i)).toBeNull();
    expect(commentMutate).not.toHaveBeenCalled();
  });
});
