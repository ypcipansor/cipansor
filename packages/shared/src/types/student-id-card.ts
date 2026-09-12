/**
 * Shared contracts for student ID card (Kartu Pelajar/Santri) operations.
 *
 * Kept in `@cipansor/shared` so the API response shape and the web client's
 * request/response types can never diverge (golden rule #8).
 */

/** Card configuration used by `StudentIdCardService.generateIdCard`. */
export interface StudentIdCardConfig {
  templateType: "STANDARD" | "PESANTREN" | "TAHFIDZ" | "MINIMAL";
  orientation: "PORTRAIT" | "LANDSCAPE";
  showPhoto: boolean;
  showQrCode: boolean;
  showParentName: boolean;
  showBloodType: boolean;
  showAddress: boolean;
  showTahfidzProgress: boolean;
  validityPeriod: number;
  customFields?: string[];
}

/**
 * A fully generated student ID card — the `data` payload of
 * `GET /students/:studentId/id-card` (and of each entry of the bulk
 * regenerate result).
 *
 * `qrCode.data` is the signed `cipansor://…` string that the verifier
 * consumes; `qrCode.verificationUrl` is the public https URL to embed in the
 * printed QR so a phone camera can open the verification page directly.
 */
export interface StudentIdCardDetail {
  config: StudentIdCardConfig;
  cardData: {
    institution: {
      foundationName: string;
      unitName: string;
      unitType: string;
      address?: string | null;
      phone?: string | null;
      logoUrl?: string | null;
    };
    student: {
      id: string;
      nis: string;
      nisn?: string | null;
      name: string;
      photoUrl?: string | null;
      gender?: string;
      birthPlace?: string;
      birthDate?: string | Date;
      address?: string | null;
    };
    enrollment?: {
      className: string;
      classLevel: string;
      academicYear: string;
    } | null;
    parent?: {
      name: string;
      phone?: string | null;
    } | null;
    tahfidz?: {
      currentJuz: number;
      lastSurah: string;
      totalAyah: number;
    } | null;
    validity: {
      issuedDate: string;
      validUntil: string;
      cardNumber: string;
    };
    /**
     * `true` when a real `StudentCardState` row backs this card and its QR will
     * verify; `false` for a read-only preview of a student who has no issued
     * card yet. When `issued` is `false`, `qrCode` is `null` so the preview
     * never ships a QR that looks scannable but fails verification (a transient
     * `cid` was never persisted, so the verifier would reject it). Printing is
     * gated until the card is actually issued.
     */
    issued: boolean;
    qrCode: {
      data: string;
      verificationUrl: string;
    } | null;
  };
}

/**
 * Response body of `POST /students/id-cards/bulk-regenerate`.
 *
 * `failures` is present when a batch could not be committed (e.g. a concurrent
 * regeneration hit the one-active-card invariant); it carries the students that
 * did NOT get a card, so the caller can tell exactly which printed cards are no
 * longer valid instead of silently losing them.
 */
export interface RegenerateCardsResult {
  totalRegenerated: number;
  regeneratedAt: string;
  cards: StudentIdCardDetail[];
  failures?: Array<{ studentId: string; message: string }>;
}

/** Request body of `POST /students/id-cards/bulk-regenerate`. */
export interface RegenerateCardsInput {
  unitId?: string;
  classId?: string;
}
