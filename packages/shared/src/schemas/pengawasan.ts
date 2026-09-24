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
  // A URL longer than this is not a stored document; it is a payload/DoS
  // attempt against the JSON column, the handler UI and the audit trail. The
  // scheme/host checks above already reject the dangerous shapes; the cap keeps
  // a *valid-looking* https URL from being unbounded.
  .max(2048, "Lampiran terlalu panjang")
  .superRefine((val, ctx) => {
    const issue = attachmentUrlIssue(val);
    if (issue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
    }
  });

const attachmentsSchema = z.array(attachmentUrlSchema).max(10).optional();

/**
 * The SK Pembekuan document link.
 *
 * `documentUrl` was an unrestricted `z.string()`: a Pengawas could store
 * `javascript:…`, a `data:text/html` payload, a `file://` path, or a
 * credential-bearing URL, and it is rendered as a link for whoever opens the
 * suspension register. It gets the same HTTPS-only validation as WBS
 * attachments — scheme, userinfo, host, port, control characters, backslash —
 * because the threat is identical. Optional and blank-tolerant: the form's
 * empty `<Input>` sends `""` for a suspension issued without a scanned SK.
 */
const documentUrlSchema = z.preprocess(
  (val) => (val === "" || val === null ? undefined : val),
  attachmentUrlSchema.optional(),
);

// ---------------------------------------------------------------------------
// Public WBS
// ---------------------------------------------------------------------------

/**
 * Domain maxima for the public (unauthenticated) WBS surface.
 *
 * The `express.json({ limit: '10mb' })` cap in `apps/api/src/app.ts` is a
 * transport limit, not a domain limit: a 9 MB body of a single field passes it
 * and then lands in a `String`/`Text` column, on an audit screen and in the
 * handler's list. These are the field-level bounds the DB, the UI and the audit
 * trail actually assume. `ticketCode` / `trackingToken` are matched to what the
 * server issues: `WBS-YYYYMM-XXXXXXXX` (a fixed shape, well under the cap) and a
 * 64-hex-character token; the caps are deliberately generous so a future format
 * change is not silently rejected, while an oversized probe still fails at the
 * edge with a stable 400.
 */
export const WBS_MAX = {
  targetName: 200,
  subject: 200,
  description: 10_000,
  location: 300,
  reporterName: 150,
  reporterContact: 200,
  message: 10_000,
  ticketCode: 64,
  trackingToken: 200,
  attachmentUrl: 2048,
  /**
   * Authenticated handler free text. The public surface already had domain
   * maxima; the handler endpoints did not, so an authenticated caller could
   * store an arbitrarily large `resolution` / note / forward reason into a
   * `Text` column that the audit screen and every list render. Same reasoning
   * as the public caps above — the transport limit is not a domain limit.
   */
  resolution: 10_000,
  handlerNote: 10_000,
  forwardReason: 2_000,
} as const;

/**
 * Domain maxima for the authenticated governance surface (board suspension and
 * the periodic oversight report).
 *
 * Same reasoning as {@link WBS_MAX}: `express.json({ limit: '10mb' })` bounds
 * the *transport*, not the *domain*. Every field below is rendered on a
 * register, in a letter body, or in an audit trail, so an unbounded string is a
 * stored payload that is re-read and re-rendered for every viewer. A minimum
 * alone ("at least 10 characters") says nothing about the maximum, which is why
 * a 9 MB `auditReason` was a legal request.
 */
export const GOVERNANCE_MAX = {
  skNumber: 100,
  auditReason: 2_000,
  liftReason: 2_000,
  reportTitle: 300,
  reportPeriod: 100,
  executiveSummary: 10_000,
  findingsSummary: 10_000,
  recommendations: 10_000,
} as const;

export const createPublicWbsSchema = z.object({
  unitId: z.string().uuid().optional().nullable(),
  category: z.enum(WBS_CATEGORIES),
  targetLevel: z.enum(WBS_TARGET_LEVELS),
  targetName: z.string().max(WBS_MAX.targetName).optional(),
  subject: z.string().min(3).max(WBS_MAX.subject),
  description: z.string().min(10).max(WBS_MAX.description),
  location: z.string().max(WBS_MAX.location).optional(),
  incidentDate: optionalDateSchema,
  isAnonymous: z.boolean().optional(),
  reporterName: z.string().max(WBS_MAX.reporterName).optional(),
  reporterContact: z.string().max(WBS_MAX.reporterContact).optional(),
  attachments: attachmentsSchema,
  turnstileToken: z.string().optional(),
});

export type CreatePublicWbsInput = z.infer<typeof createPublicWbsSchema>;

export const trackPublicWbsSchema = z.object({
  ticketCode: z.string().min(3).max(WBS_MAX.ticketCode),
  trackingToken: z.string().min(5).max(WBS_MAX.trackingToken),
  turnstileToken: z.string().optional(),
});

export type TrackPublicWbsInput = z.infer<typeof trackPublicWbsSchema>;

export const addPublicWbsCommentSchema = z.object({
  ticketCode: z.string().min(3).max(WBS_MAX.ticketCode),
  trackingToken: z.string().min(5).max(WBS_MAX.trackingToken),
  message: z.string().min(1).max(WBS_MAX.message),
  attachments: attachmentsSchema,
  turnstileToken: z.string().optional(),
});

export type AddPublicWbsCommentInput = z.infer<
  typeof addPublicWbsCommentSchema
>;

// ---------------------------------------------------------------------------
// Authenticated WBS handlers
// ---------------------------------------------------------------------------

/**
 * The statuses a case may be closed *into* through this endpoint.
 *
 * A terminal status ends the case, and a closed case is immutable — the
 * resolution can never be written afterwards. So the resolution has to arrive
 * *with* the closure, which is why the schema requires it below rather than
 * accepting an empty close and leaving the outcome unrecorded forever.
 */
const TERMINAL_WBS_STATUSES: readonly string[] = [
  "SELESAI",
  "TIDAK_DAPAT_DITINDAKLANJUTI",
];

export const updateWbsStatusSchema = z
  .object({
    status: z.enum(WBS_STATUSES),
    resolution: z.string().max(WBS_MAX.resolution).optional(),
    handlerNote: z.string().max(WBS_MAX.handlerNote).optional(),
  })
  // A terminal status is a one-way door: `updateReportStatus` refuses every
  // later write (including terminal → terminal), so a close submitted without a
  // resolution leaves a closed case whose outcome can never be recorded. The
  // requirement is enforced here at the edge AND in the service, because
  // internal callers reach the service directly.
  .superRefine((data, ctx) => {
    if (!TERMINAL_WBS_STATUSES.includes(data.status)) return;
    if (!data.resolution || data.resolution.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolution"],
        message:
          "Penyelesaian (resolution) wajib diisi ketika laporan ditutup sebagai SELESAI atau TIDAK_DAPAT_DITINDAKLANJUTI.",
      });
    }
  });

export type UpdateWbsStatusInput = z.infer<typeof updateWbsStatusSchema>;

export const forwardWbsReportSchema = z.object({
  toRole: z.enum(WBS_FORWARD_ROLE_CODES),
  toUserId: z.string().uuid().optional(),
  reason: z.string().min(5).max(WBS_MAX.forwardReason),
});

export type ForwardWbsReportInput = z.infer<typeof forwardWbsReportSchema>;

export const addWbsHandlerCommentSchema = z.object({
  message: z.string().min(1).max(WBS_MAX.message),
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
    skNumber: z.string().min(3).max(GOVERNANCE_MAX.skNumber),
    auditReason: z.string().min(10).max(GOVERNANCE_MAX.auditReason),
    documentUrl: documentUrlSchema,
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
  // Each rule below is independent and runs on every parse. The previous shape
  // nested the date rule inside the "Plh pair is complete or empty" branch and
  // `return`ed there, so a half-filled Plh skipped the date checks entirely
  // (and a bad date was reported only when the Plh happened to be valid). All
  // issues are now collected in one pass, so a request with several problems
  // reports all of them at once.
  .superRefine((data, ctx) => {
    // A suspension is effective the moment the SK is issued: the account is
    // switched off and the Plh is granted in the same transaction. A future
    // `startDate` cannot therefore schedule anything — it would only sit in the
    // row as metadata that looks like a delayed effect while the effect has
    // already happened. `projectedEndDate` is an estimate that likewise does not
    // expire the suspension; a Pembina lifts it explicitly. Given the decision
    // that suspension is immediate, a future start date must be refused at the
    // edge rather than stored as a promise the code does not keep.
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

    // An end that precedes the start describes a window that can never exist.
    // `projectedEndDate` is the field the operator edits, so the issue is
    // reported there; equality is allowed (a same-day is still valid).
    //
    // The start is the *effective* start, which is `now` when the operator omits
    // `startDate`: the service applies a suspension on issuance, so an omitted
    // start means "effective now", not "nothing to compare against". Validating
    // only when both fields were supplied let a `projectedEndDate` in the past
    // (or before the effective start) through — an estimate describing a window
    // already over, which reads as "ended" on the register while the row is in
    // fact ACTIVE.
    const effectiveStart = data.startDate
      ? Date.parse(data.startDate)
      : Date.now();
    if (data.projectedEndDate) {
      const end = Date.parse(data.projectedEndDate);
      if (!isNaN(effectiveStart) && !isNaN(end) && end < effectiveStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectedEndDate"],
          message:
            "Tanggal perkiraan berakhir tidak boleh lebih awal dari tanggal mulai pembekuan.",
        });
      }
    }

    // `plhUserId` and `plhRoleCode` describe one thing — a Plh/Plt delegation —
    // so supplying half of it is never meaningful. The form could previously
    // send a user with no role (a delegation the service silently ignores) or a
    // role with no user (a role nothing carries), and both stored suspension
    // metadata that looks like a delegation without being one. They are
    // all-or-nothing; an empty form sends neither and normalises to an absent
    // pair.
    const hasUser = !!data.plhUserId;
    const hasRole = !!data.plhRoleCode;
    if (hasUser !== hasRole) {
      const missing = hasUser ? "plhRoleCode" : "plhUserId";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [missing],
        message:
          "Data Plh/Plt harus lengkap: isi pengguna dan peran delegasinya, atau kosongkan keduanya.",
      });
    }
  });

export type CreateBoardSuspensionInput = z.infer<
  typeof createBoardSuspensionSchema
>;

export const liftBoardSuspensionSchema = z.object({
  liftReason: z.string().min(5).max(GOVERNANCE_MAX.liftReason),
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
  title: z.string().min(3).max(GOVERNANCE_MAX.reportTitle),
  period: z.string().min(2).max(GOVERNANCE_MAX.reportPeriod),
  executiveSummary: z.string().min(10).max(GOVERNANCE_MAX.executiveSummary),
  findingsSummary: z.string().max(GOVERNANCE_MAX.findingsSummary).optional(),
  recommendations: z.string().max(GOVERNANCE_MAX.recommendations).optional(),
});

export type DraftPeriodicReportInput = z.infer<
  typeof draftPeriodicReportSchema
>;
