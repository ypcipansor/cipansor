"use client";

import { TEST_COPY_NOTE, TEST_COPY_STAMP } from "@cipansor/shared";
import { useEnvironment } from "@/hooks/use-environment";

/**
 * On a test copy of the system (staging), a small label on screen and, on
 * every printed page, the stamp the API's PDFs carry. Staging's demo accounts
 * bear the names of the yayasan's real office holders and its letterhead is
 * the real one, so nothing printed from it may pass for a document of the
 * yayasan: kartu santri, rapor, sertifikat, anything a browser prints.
 *
 * Renders nothing in production, or while the answer is not in.
 *
 * `print:visible` on each part: some pages print with
 * `body * { visibility: hidden }` and show only their document (the payment
 * receipt among them); a class outranks that rule, so the stamp stays.
 */
export function TestCopyWatermark() {
  const { data } = useEnvironment();
  if (!data?.testCopy) return null;

  return (
    <>
      <div
        role="note"
        data-testid="test-copy-label"
        className="pointer-events-none fixed bottom-3 left-3 z-[60] rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white shadow print:hidden"
      >
        Lingkungan uji · data demo
      </div>
      <div
        aria-hidden="true"
        data-testid="test-copy-print-stamp"
        className="pointer-events-none fixed inset-0 z-[60] hidden print:visible print:block"
      >
        <p className="absolute inset-x-0 top-1 text-center text-[8pt] text-red-700 print:visible">
          {TEST_COPY_NOTE}
        </p>
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 whitespace-nowrap text-[34pt] font-bold text-red-700/25 print:visible">
          {TEST_COPY_STAMP}
        </p>
      </div>
    </>
  );
}
