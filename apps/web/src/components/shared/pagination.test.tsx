import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination } from "./pagination";

/**
 * The pager is icon-only, so every control must carry an accessible name — an
 * e2e spec targets the next button by name, and without one the control was
 * invisible to both assistive tech and the spec (which then silently skipped,
 * hiding that the pager could never advance).
 */
describe("Pagination", () => {
  const base = {
    page: 2,
    totalPages: 5,
    pageSize: 10,
    total: 45,
  };

  it("exposes accessible names on every control", () => {
    render(<Pagination {...base} onPageChange={() => {}} />);

    expect(
      screen.getByRole("button", { name: "Halaman pertama" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Halaman sebelumnya" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Halaman berikutnya" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Halaman terakhir" }),
    ).toBeTruthy();
  });

  it("advances to the next page", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...base} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Halaman berikutnya" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("disables next on the last page but keeps previous enabled", () => {
    render(<Pagination {...base} page={5} onPageChange={() => {}} />);

    expect(
      (
        screen.getByRole("button", {
          name: "Halaman berikutnya",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Halaman sebelumnya",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
