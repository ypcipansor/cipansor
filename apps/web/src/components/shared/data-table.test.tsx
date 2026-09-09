import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ColumnDef, DataTable } from "./data-table";

interface TestRow {
  id: number;
  className: string;
}

const columns: ColumnDef<TestRow>[] = [
  {
    accessorKey: "className",
    header: "Kelas",
  },
];

const unsortedData: TestRow[] = [
  { id: 1, className: "Kelas 10" },
  { id: 2, className: "Kelas 2" },
  { id: 3, className: "Kelas 1" },
  { id: 4, className: "Kelas 9" },
];

function bodyRowTexts() {
  const body = screen.getAllByRole("rowgroup")[1];
  return within(body)
    .getAllByRole("row")
    .map((row) => row.textContent?.trim());
}

describe("DataTable natural sorting", () => {
  it("sorts mixed alphanumeric text naturally on ascending toggle", () => {
    render(<DataTable columns={columns} data={unsortedData} />);

    fireEvent.click(screen.getByRole("button", { name: /Kelas/i }));

    expect(bodyRowTexts()).toEqual([
      "Kelas 1",
      "Kelas 2",
      "Kelas 9",
      "Kelas 10",
    ]);
  });

  it("reverses the natural order when toggling to descending", () => {
    render(<DataTable columns={columns} data={unsortedData} />);

    const header = screen.getByRole("button", { name: /Kelas/i });
    fireEvent.click(header); // asc
    fireEvent.click(header); // desc

    expect(bodyRowTexts()).toEqual([
      "Kelas 10",
      "Kelas 9",
      "Kelas 2",
      "Kelas 1",
    ]);
  });
});
