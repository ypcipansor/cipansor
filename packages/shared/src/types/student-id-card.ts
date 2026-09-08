/**
 * Shared contracts for student ID card (Kartu Pelajar/Santri) operations.
 *
 * Kept in `@cipansor/shared` so the API response shape and the web client's
 * request/response types can never diverge (golden rule #8).
 */

/** Response body of `POST /students/id-cards/bulk-regenerate`. */
export interface RegenerateCardsResult {
  totalRegenerated: number;
  regeneratedAt: string;
  cards: Array<{
    cardData: {
      student: { name: string; nis: string };
      qrCode: { data: string };
    };
  }>;
}

/** Request body of `POST /students/id-cards/bulk-regenerate`. */
export interface RegenerateCardsInput {
  unitId?: string;
  classId?: string;
}
