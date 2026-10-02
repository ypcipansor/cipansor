import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { BoardMember } from "@cipansor/shared";
import { BoardOrgans } from "./board-organs";
import { boardMemberPayload } from "./board-member-form";

/**
 * The Organ Yayasan tab lists who holds office in each of the three organs.
 * It used to be one list titled "Pengurus Yayasan" sorted by the position's
 * spelling, with the seed's invented "Sejak Jan 2020" under real names.
 */
const member = (over: Partial<BoardMember>): BoardMember => ({
  id: over.name ?? "m",
  foundationId: "y",
  name: "Nama",
  position: "Pembina",
  phone: null,
  email: null,
  photoUrl: null,
  startDate: null,
  endDate: null,
  isActive: true,
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  ...over,
});

const organ = (slug: string) => screen.getByTestId(`board-organ-${slug}`);

describe("BoardOrgans", () => {
  it("files each member under their organ, a Ketua Pembina among the Pembina", () => {
    render(
      <BoardOrgans
        onDelete={vi.fn()}
        members={[
          member({ name: "K.H. Aang Suandi, Lc.", position: "Ketua Pembina" }),
          member({
            name: "H. Ramram Mansur Ramdani, S.Pd.I., M.Ag",
            position: "Ketua",
          }),
          member({ name: "Drs. Asep Tamim, M.Si.", position: "Pengawas" }),
        ]}
      />,
    );

    expect(
      within(organ("pembina")).getByText("K.H. Aang Suandi, Lc."),
    ).toBeInTheDocument();
    expect(
      within(organ("pembina")).getByText("Ketua Pembina"),
    ).toBeInTheDocument();
    expect(
      within(organ("pengurus")).getByText(
        "H. Ramram Mansur Ramdani, S.Pd.I., M.Ag",
      ),
    ).toBeInTheDocument();
    expect(
      within(organ("pengawas")).getByText("Drs. Asep Tamim, M.Si."),
    ).toBeInTheDocument();
    // Under "Pengawas", "Pengawas" again would only repeat the heading.
    expect(within(organ("pengawas")).getAllByText("Pengawas")).toHaveLength(1);
  });

  it("lists the Ketua first, then the Sekretaris and the Bendahara; equals as recorded", () => {
    render(
      <BoardOrgans
        onDelete={vi.fn()}
        members={[
          member({ name: "Bendahara A", position: "Bendahara" }),
          member({ name: "Sekretaris A", position: "Sekretaris" }),
          member({ name: "Ketua A", position: "Ketua" }),
          member({
            name: "Pembina Kedua",
            createdAt: "2026-10-02T00:00:00.002Z",
          }),
          member({
            name: "Pembina Pertama",
            createdAt: "2026-10-02T00:00:00.001Z",
          }),
        ]}
      />,
    );

    const names = (slug: string) =>
      within(organ(slug))
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent);
    expect(names("pengurus")).toEqual([
      "Ketua A",
      "Sekretaris A",
      "Bendahara A",
    ]);
    expect(names("pembina")).toEqual(["Pembina Pertama", "Pembina Kedua"]);
  });

  it("shows a start date only where one was entered", () => {
    render(
      <BoardOrgans
        onDelete={vi.fn()}
        members={[
          member({ name: "Aminudin", position: "Pengawas" }),
          member({
            name: "H. Tantan Permana",
            position: "Pengawas",
            startDate: "2022-05-01T00:00:00.000Z",
          }),
        ]}
      />,
    );

    const cards = within(organ("pengawas")).getAllByTestId("board-member");
    expect(cards[0]).not.toHaveTextContent("Sejak");
    expect(cards[1]).toHaveTextContent("Sejak 1 Mei 2022");
  });

  it("gives a member without a portrait the initials of their name, not their titles", () => {
    render(
      <BoardOrgans
        onDelete={vi.fn()}
        members={[member({ name: "K.H. Drs. Tetep Abdullatip, M.Ag." })]}
      />,
    );

    expect(within(organ("pembina")).getByText("TA")).toBeInTheDocument();
  });

  it("says so when an organ has nobody recorded", () => {
    render(<BoardOrgans onDelete={vi.fn()} members={[]} />);

    expect(organ("pengawas")).toHaveTextContent("Belum ada yang dicatat.");
  });
});

describe("boardMemberPayload", () => {
  it("sends an empty field as null — an unknown date stays unknown", () => {
    expect(
      boardMemberPayload({
        name: "Aminudin",
        position: "Pengawas",
        phone: "",
        email: "",
        startDate: "",
        endDate: "",
        isActive: true,
      }),
    ).toEqual({
      name: "Aminudin",
      position: "Pengawas",
      phone: null,
      email: null,
      startDate: null,
      endDate: null,
      isActive: true,
    });
  });
});
