import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DispositionTimeline } from "./disposition-timeline";

/**
 * The fixtures here are the API's own shape, not the DTO's.
 *
 * That distinction is the whole point of this file. The shared DTO used to
 * declare flat `senderName` / `recipientName` strings; the API has only ever
 * sent `sender: { name }`. TypeScript checked the component against the DTO,
 * the DTO described a response nobody sends, and the mismatch surfaced only in
 * the browser — as `undefined[0]`, which blanked the whole letter page for
 * every letter that had ever been disposed.
 *
 * A type cannot catch that. Rendering the shape the server actually returns
 * can, so these fixtures are copied from
 * `correspondence.service.ts`'s `dispositions` include.
 */

const AS_THE_API_SENDS_IT = {
  id: "d1",
  senderId: "ketua",
  sender: { name: "H. Cecep Nurjaman" },
  recipientId: "sekretaris",
  recipient: { name: "Dadan Hamdani" },
  instruction: "Mohon ditindaklanjuti dan disiapkan jawabannya.",
  status: "PENDING",
  deadline: "2099-09-10T00:00:00.000Z",
  notes: null,
  completedAt: null,
  createdAt: "2026-08-27T02:00:00.000Z",
};

describe("DispositionTimeline", () => {
  it("renders the shape the API actually returns", () => {
    render(<DispositionTimeline dispositions={[AS_THE_API_SENDS_IT]} />);
    expect(screen.getByText("H. Cecep Nurjaman")).toBeInTheDocument();
    expect(screen.getByText("Dadan Hamdani")).toBeInTheDocument();
  });

  /**
   * `sender` is an optional include. A payload that omits it must render a
   * disposition without a name, not throw and take the page with it.
   */
  it("survives a disposition whose sender never arrived", () => {
    const { container } = render(
      <DispositionTimeline
        dispositions={[{ ...AS_THE_API_SENDS_IT, sender: null, recipient: null }]}
      />
    );
    expect(container.textContent).toContain("Tidak diketahui");
    expect(container.textContent).toContain(AS_THE_API_SENDS_IT.instruction);
  });

  /**
   * Without a status, a disposition that was completed looked exactly like one
   * still waiting on somebody.
   */
  it("distinguishes an outstanding disposition from a finished one", () => {
    const { unmount } = render(
      <DispositionTimeline dispositions={[AS_THE_API_SENDS_IT]} />
    );
    expect(screen.getByText(/Menunggu ditindaklanjuti/)).toBeInTheDocument();
    unmount();

    render(
      <DispositionTimeline
        dispositions={[
          {
            ...AS_THE_API_SENDS_IT,
            status: "COMPLETED",
            completedAt: "2026-08-29T04:00:00.000Z",
            notes: "Sudah dijawab dengan surat 440/…",
          },
        ]}
      />
    );
    expect(screen.getByText(/Selesai/)).toBeInTheDocument();
    expect(screen.getByText(/Sudah dijawab dengan surat/)).toBeInTheDocument();
  });

  /** A deadline that has passed on an open disposition must read as late. */
  it("marks an overdue deadline, but not on a completed disposition", () => {
    const past = "2020-01-01T00:00:00.000Z";
    const { unmount, container } = render(
      <DispositionTimeline dispositions={[{ ...AS_THE_API_SENDS_IT, deadline: past }]} />
    );
    expect(container.textContent).toContain("Lewat batas waktu");
    unmount();

    const done = render(
      <DispositionTimeline
        dispositions={[{ ...AS_THE_API_SENDS_IT, deadline: past, status: "COMPLETED" }]}
      />
    );
    expect(done.container.textContent).not.toContain("Lewat batas waktu");
  });

  it("still says so when there is nothing to show", () => {
    render(<DispositionTimeline dispositions={[]} />);
    expect(screen.getByText(/Belum ada riwayat disposisi/)).toBeInTheDocument();
  });
});
