/**
 * GET /api/environment — what the web needs to know about the copy of the
 * system it runs against. Staging and production run the same images, so this
 * cannot be decided when the web is built.
 */
export interface EnvironmentInfo {
  /** Every document from this copy is a test copy (`DOCUMENT_TEST_COPY`). */
  testCopy: boolean;
}

/**
 * The stamp every document of a test copy carries — the PDFs the API renders
 * and every page printed from the web. Staging's demo accounts carry the names
 * of the yayasan's real office holders, and its letterhead is the real one.
 */
export const TEST_COPY_STAMP = "SALINAN UJI — BUKAN DOKUMEN SAH";

/** One line under the stamp, saying where the document came from. */
export const TEST_COPY_NOTE =
  "Dibuat di lingkungan uji dengan data demo; tidak berlaku sebagai dokumen Yayasan Pesantren Cipansor.";
