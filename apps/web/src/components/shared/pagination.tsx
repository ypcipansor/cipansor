"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  /**
   * Stacked on a phone, side by side from `sm:` up.
   *
   * The two halves together need roughly 440px — the summary text and the page
   * size selector on one side, five controls and "Page n of m" on the other —
   * and a phone gives 390. Laid out in a single row they did not wrap or clip:
   * they pushed sideways into the app shell's scrollable `<main>`, leaving the
   * next/last buttons off-screen while the page itself looked perfectly normal.
   * A pager whose "next" button is not on screen is a table that ends at row 10.
   *
   * `flex-wrap` on the inner groups rather than a fixed second breakpoint, so
   * this also survives the long form ("Showing 91 to 100 of 1.204 results") and
   * a 320px screen, neither of which a hand-picked breakpoint would have
   * covered.
   */
  return (
    <div className="flex flex-col items-center justify-between gap-3 px-2 py-4 sm:flex-row sm:gap-4">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span>
          Showing {startItem} to {endItem} of {total} results
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Halaman pertama"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Halaman sebelumnya"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex items-center gap-1 text-sm">
          Page <strong>{page}</strong> of <strong>{totalPages}</strong>
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Halaman berikutnya"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Halaman terakhir"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
