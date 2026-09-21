import { z } from "zod";
import {
  PLH_ROLE_CODES,
  WBS_CATEGORIES,
  WBS_FORWARD_ROLE_CODES,
  WBS_STATUSES,
  WBS_TARGET_LEVELS,
} from "../types/pengawasan";

/**
 * WBS & board-suspension request contracts.
 *
 * These payloads were declared twice — once in the API's
 * `pengawasan.validation.ts` and again (as loose `z.string()` / `any`) in the
 * web form — so the two could describe different shapes for the same endpoint.
 * The repository rule is that a contract lives once, in `@cipansor/shared`, and
 * both apps import it: the API validates with it at the edge, the web builds
 * its form from the same type.
 */

const dateStringSchema = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Format tanggal tidak valid",
});

const optionalDateSchema = dateStringSchema.optional().nullable();

/**
 * An optional UUID that also accepts `""` from an untouched form field.
 *
 * The web form initialises these to `""` (the empty `<Input>`), and React Hook
 * Form submits that verbatim. `z.string().uuid()` rejects `""` — it is neither
 * a UUID nor absent — so the suspension form refused to submit unless a Plh was
 * named, even though a Plh/Plt is optional. Normalising `""` to `undefined`
 * here means the form can submit blank and the API still receives the same
 * "not provided" it always did.
 */
const optionalUuidSchema = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? undefined : val),
  z.string().uuid().optional().nullable(),
);

/**
 * Attachment entries: an HTTPS URL only.
 *
 * `attachments` accepted any string from an anonymous visitor. Stored verbatim
 * and later rendered as a link, that is a stored-XSS and open-redirect vector:
 * `javascript:alert(1)` executes in the handler's session, `data:text/html,…`
 * renders attacker HTML on the portal origin, and `file://` or a credential-
 * bearing URL leaks or confuses. The URL is also never fetched server-side, so
 * SSRF is out of scope by construction — but a link the *handler* clicks must
 * still be a real HTTPS destination.
 *
 * Parsed by hand rather than with the `URL` constructor: this package compiles
 * with `lib: ["ES2022"]` and must not pull in DOM or Node globals, so `URL` is
 * not in scope. The checks below cover the whole scheme/authority surface that
 * matters — scheme, credentials, host, port, and control characters — and are
 * deliberately stricter than the browser's lenient normalization.
 *
 * An allowlist of storage hosts is deliberately NOT applied: the product has
 * more than one legitimate bucket (E-Office letters, complaint evidence, the
 * legacy uploads directory) and a wrong allowlist silently drops valid
 * evidence — the failure mode is lost reports, not a blocked attack. Restricting
 * to a controlled upload endpoint that mints the object reference is the better
 * design and is tracked separately; until then the protocol/userinfo/host checks
 * are the enforceable minimum.
 */
const ATTACHMENT_URL_MAX = 2048;
const HOSTNAME_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

function attachmentUrlIssue(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return "Lampiran harus berupa URL yang valid";
  if (value.length > ATTACHMENT_URL_MAX)
    return "Tautan lampiran terlalu panjang";
  // No whitespace or control characters anywhere: they are how a truncated or
  // header-injected value gets smuggled past a naive check.
  if (/[\u0000-\u001f\u007f\s]/.test(value))
    return "Lampiran harus berupa URL yang valid";
  // A backslash is normalized to a forward slash by browsers, which is how
  // `https:\/evil.example` would otherwise be accepted as a host-less string.
  if (value.includes("\\")) return "Lampiran harus berupa URL yang valid";

  const scheme = /^https:\/\//i.exec(value);
  if (!scheme) return "Lampiran harus menggunakan tautan HTTPS";

  const rest = value.slice(scheme[0].length);
  const authority = rest.split(/[/?#]/, 1)[0];
  if (authority.length === 0)
    return "Lampiran harus memiliki alamat host yang sah";

  // `user:pass@host` is a cleartext credential in a report handlers read and
  // audit dumps print; refused outright.
  if (authority.includes("@"))
    return "Lampiran tidak boleh memuat kredensial pada URL";

  const [hostPart, port, ...extra] = authority.split(":");
  if (extra.length > 0) return "Lampiran harus berupa URL yang valid";
  if (port !== undefined && !/^\d{1,5}$/.test(port)) {
    return "Lampiran harus berupa URL yang valid";
  }
  if (!HOSTNAME_RE.test(hostPart))
    return "Lampiran harus memiliki alamat host yang sah";
  return null;
}

const attachmentUrlSchema = z
  .string()
  .trim()
  .superRefine((val, ctx) => {
    const issue = attachmentUrlIssue(val);
    if (issue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
    }
  });

const attachmentsSchema = z.array(attachmentUrlSchema).max(10).optional();

// ---------------------------------------------------------------------------
// Public WBS
// ---------------------------------------------------------------------------

export const createPublicWbsSchema = z.object({
  unitId: z.string().uuid().optional().nullable(),
  category: z.enum(WBS_CATEGORIES),
  targetLevel: z.enum(WBS_TARGET_LEVELS),
  targetName: z.string().optional(),
  subject: z.string().min(3),
  description: z.string().min(10),
  location: z.string().optional(),
  incidentDate: optionalDateSchema,
  isAnonymous: z.boolean().optional(),
  reporterName: z.string().optional(),
  reporterContact: z.string().optional(),
  attachments: attachmentsSchema,
  turnstileToken: z.string().optional(),
});

export type CreatePublicWbsInput = z.infer<typeof createPublicWbsSchema>;

export const trackPublicWbsSchema = z.object({
  ticketCode: z.string().min(3),
  trackingToken: z.string().min(5),
  turnstileToken: z.string().optional(),
});

export type TrackPublicWbsInput = z.infer<typeof trackPublicWbsSchema>;

export const addPublicWbsCommentSchema = z.object({
  ticketCode: z.string().min(3),
  trackingToken: z.string().min(5),
  message: z.string().min(1),
  attachments: attachmentsSchema,
  turnstileToken: z.string().optional(),
});

export type AddPublicWbsCommentInput = z.infer<
  typeof addPublicWbsCommentSchema
>;

// ---------------------------------------------------------------------------
// Authenticated WBS handlers
// ---------------------------------------------------------------------------

export const updateWbsStatusSchema = z.object({
  status: z.enum(WBS_STATUSES),
  resolution: z.string().optional(),
  handlerNote: z.string().optional(),
});

export type UpdateWbsStatusInput = z.infer<typeof updateWbsStatusSchema>;

export const forwardWbsReportSchema = z.object({
  toRole: z.enum(WBS_FORWARD_ROLE_CODES),
  toUserId: z.string().uuid().optional(),
  reason: z.string().min(5),
});

export type ForwardWbsReportInput = z.infer<typeof forwardWbsReportSchema>;

export const addWbsHandlerCommentSchema = z.object({
  message: z.string().min(1),
  attachments: attachmentsSchema,
});

export type AddWbsHandlerCommentInput = z.infer<
  typeof addWbsHandlerCommentSchema
>;

// ---------------------------------------------------------------------------
// Board member suspension
// ---------------------------------------------------------------------------

export const createBoardSuspensionSchema = z
  .object({
    userId: z.string().uuid(),
    skNumber: z.string().min(3),
    auditReason: z.string().min(10),
    documentUrl: z.string().optional(),
    startDate: optionalDateSchema,
    projectedEndDate: optionalDateSchema,
    plhUserId: optionalUuidSchema,
    // A Plh/Plt may only hold a Pengurus role. This is enforced again in the
    // service, but rejecting Super Admin / Pembina / unit roles here fails the
    // request at the edge rather than partway through a suspension.
    //
    // `""` is normalised away for the same reason as `plhUserId`: the form's
    // Select emits it when the user clears the Plh, and an empty string is not
    // a legal role.
    plhRoleCode: z.preprocess(
      (val) => (val === "" ? undefined : val),
      z.enum(PLH_ROLE_CODES).optional().nullable(),
    ),
  })
  // `plhUserId` and `plhRoleCode` describe one thing — a Plh/Plt delegation —
  // so supplying half of it is never meaningful. The form could previously send
  // a user with no role (a delegation the service silently ignores) or a role
  // with no user (a role nothing carries), and both stored suspension metadata
  // that looks like a delegation without being one. They are now all-or-nothing;
  // an empty form sends neither and normalises to an absent pair.
  .superRefine((data, ctx) => {
    const hasUser = !!data.plhUserId;
    const hasRole = !!data.plhRoleCode;
    if (hasUser === hasRole) {
      // A suspension is effective the moment the SK is issued: the account is
      // switched off and the Plh is granted in the same transaction. A future
      // `startDate` cannot therefore schedule anything — it would only sit in
      // the row as metadata that looks like a delayed effect while the effect
      // has already happened. `projectedEndDate` is an estimate that likewise
      // does not expire the suspension; a Pembina lifts it explicitly. Given
      // the decision that suspension is immediate, a future date must be
      // refused at the edge rather than stored as a promise the code does not
      // keep.
      if (data.startDate) {
        const start = Date.parse(data.startDate);
        if (start > Date.now()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["startDate"],
            message:
              "Pembekuan berlaku sejak SK ditetapkan, sehingga tanggal mulai tidak boleh di masa depan.",
          });
        }
      }
      return;
    }

    const missing = hasUser ? "plhRoleCode" : "plhUserId";
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [missing],
      message:
        "Data Plh/Plt harus lengkap: isi pengguna dan peran delegasinya, atau kosongkan keduanya.",
    });
  });

export type CreateBoardSuspensionInput = z.infer<
  typeof createBoardSuspensionSchema
>;

export const liftBoardSuspensionSchema = z.object({
  liftReason: z.string().min(5),
});

// ---------------------------------------------------------------------------
// Periodic oversight report
// ---------------------------------------------------------------------------

/**
 * Payload for filing a periodic oversight report into E-Office.
 *
 * Named for what it does — *draft* — not "submit". The endpoint creates a
 * `DRAFT` outgoing letter plus a `CREATED` flow event; it does not run the
 * E-Office review/submission workflow (no reviewer, no `SUBMITTED` event, no
 * letter number). Calling it "submit" and telling the user the report was
 * "diajukan/dikirim ke Pembina" described a step the code never took.
 */
export const draftPeriodicReportSchema = z.object({
  title: z.string().min(3),
  period: z.string().min(2),
  executiveSummary: z.string().min(10),
  findingsSummary: z.string().optional(),
  recommendations: z.string().optional(),
});

export type DraftPeriodicReportInput = z.infer<
  typeof draftPeriodicReportSchema
>;
