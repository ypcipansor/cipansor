import { TEST_COPY_NOTE, TEST_COPY_STAMP } from "@cipansor/shared";
import { escapeHtml } from "@/lib/string";

/**
 * The test-copy stamp as markup for a page printed in a window of its own,
 * which the app's TestCopyWatermark never reaches. Fixed elements repeat on
 * every printed page; the note sits at the foot, clear of the document's own
 * title. Nothing outside a test copy.
 */
export function testCopyPrintMarkup(testCopy: boolean | undefined): string {
  if (!testCopy) return "";
  return (
    '<div data-test-copy-stamp aria-hidden="true" style="position:fixed;inset:0;pointer-events:none;z-index:9999">' +
    // At the foot: these documents start their own title at the top edge.
    `<p style="position:absolute;left:0;right:0;bottom:2mm;margin:0;text-align:center;font:8pt Arial,sans-serif;color:#b91c1c">${TEST_COPY_NOTE}</p>` +
    `<p style="position:absolute;left:50%;top:50%;margin:0;transform:translate(-50%,-50%) rotate(-45deg);white-space:nowrap;font:bold 34pt Arial,sans-serif;color:rgba(185,28,28,0.25)">${TEST_COPY_STAMP}</p>` +
    "</div>"
  );
}

export interface PrintDocumentOptions {
  /** The window's title, as plain text: escaped here. */
  title: string;
  /** The page's own `<link>` and `<style>` for the head. */
  head: string;
  /** The document, rendered by React and so already escaped. */
  body: string;
  bodyClass?: string;
  /** From `useEnvironment()`: a test copy stamps what it prints. */
  testCopy: boolean | undefined;
}

/**
 * Prints a document from a window of its own: certificates, kartu santri,
 * transcripts, surat keterangan. The one place that writes such a window, so
 * every one of them is stamped on a test copy and none puts unescaped data in
 * it — the window is same-origin and runs with the app's session.
 *
 * Returns false when the browser blocked the window.
 */
export function printDocument({
  title,
  head,
  body,
  bodyClass,
  testCopy,
}: PrintDocumentOptions): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const cls = bodyClass ? ` class="${escapeHtml(bodyClass)}"` : "";
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>${head}</head>` +
      `<body${cls}>${testCopyPrintMarkup(testCopy)}${body}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
  return true;
}
