import { describe, it, expect } from 'vitest';
import {
  createBoardSuspensionSchema,
  updateAuditSchema,
  draftPeriodicReportSchema,
  forwardWbsReportSchema,
} from '../pengawasan.validation';
import {
  createPublicWbsSchema,
  addPublicWbsCommentSchema,
  addWbsHandlerCommentSchema,
  trackPublicWbsSchema,
  WBS_MAX,
} from '@cipansor/shared';
import { PLH_ROLE_CODES } from '@cipansor/shared';

/**
 * Edge contracts for the pengawasan module. The board-suspension payload is the
 * one that matters most: its `plhRoleCode` used to be a free string, which let
 * a caller name any role — including SUPER_ADMIN — for the stand-in officer.
 */
describe('pengawasan validation contracts', () => {
  const baseSuspension = {
    userId: '11111111-1111-4111-8111-111111111111',
    skNumber: 'SK/001',
    auditReason: 'Alasan audit yang cukup panjang.',
  };

  it('accepts each legitimate Pengurus Plh role', () => {
    for (const code of PLH_ROLE_CODES) {
      const parsed = createBoardSuspensionSchema.safeParse({
        ...baseSuspension,
        plhUserId: '22222222-2222-4222-8222-222222222222',
        plhRoleCode: code,
      });
      expect(parsed.success, `${code} should be accepted`).toBe(true);
    }
  });

  it.each(['SUPER_ADMIN', 'YAYASAN_PEMBINA', 'YAYASAN_PENGAWAS', 'SDIT_ADMIN'])(
    'rejects the non-Pengurus Plh role %s at the edge',
    (code) => {
      const parsed = createBoardSuspensionSchema.safeParse({
        ...baseSuspension,
        plhUserId: '22222222-2222-4222-8222-222222222222',
        plhRoleCode: code,
      });
      expect(parsed.success).toBe(false);
    }
  );

  it('allows omitting the Plh role entirely', () => {
    expect(createBoardSuspensionSchema.safeParse(baseSuspension).success).toBe(true);
  });

  it('treats an empty-string Plh as "not provided" rather than an invalid UUID', () => {
    // The web form initialises the field to `""` and submits it verbatim. A
    // bare `z.string().uuid()` rejects that — it is neither a UUID nor absent —
    // so the suspension form refused to submit without a Plh, even though one
    // is optional.
    const parsed = createBoardSuspensionSchema.safeParse({
      ...baseSuspension,
      plhUserId: '',
      plhRoleCode: '',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.plhUserId).toBeUndefined();
    expect(parsed.success && parsed.data.plhRoleCode).toBeUndefined();
  });

  it('still rejects a malformed Plh user id', () => {
    expect(
      createBoardSuspensionSchema.safeParse({ ...baseSuspension, plhUserId: 'not-a-uuid' }).success
    ).toBe(false);
  });

  it('rejects a user-only Plh delegation', () => {
    // Half a delegation looks like one in the stored metadata but grants no
    // role — the service ignores a roleless pair, so the suspension would
    // record a replacement officer who holds nothing.
    const parsed = createBoardSuspensionSchema.safeParse({
      ...baseSuspension,
      plhUserId: '22222222-2222-4222-8222-222222222222',
    });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues.some((i) => i.path[0] === 'plhRoleCode')).toBe(
      true
    );
  });

  it('rejects a role-only Plh delegation', () => {
    const parsed = createBoardSuspensionSchema.safeParse({
      ...baseSuspension,
      plhRoleCode: 'YAYASAN_KETUA',
    });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues.some((i) => i.path[0] === 'plhUserId')).toBe(
      true
    );
  });

  it('accepts a complete Plh delegation', () => {
    const parsed = createBoardSuspensionSchema.safeParse({
      ...baseSuspension,
      plhUserId: '22222222-2222-4222-8222-222222222222',
      plhRoleCode: 'YAYASAN_KETUA',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.plhUserId).toBe('22222222-2222-4222-8222-222222222222');
    expect(parsed.success && parsed.data.plhRoleCode).toBe('YAYASAN_KETUA');
  });

  it('rejects a misspelled WBS forward role at the edge', () => {
    // A free string here let a typo such as `primaryHandlerRole` through and the
    // report landed in a queue no role's scope query matches.
    expect(
      forwardWbsReportSchema.safeParse({
        toRole: 'primaryHandlerRole',
        reason: 'alasan yang cukup panjang',
      }).success
    ).toBe(false);
    expect(
      forwardWbsReportSchema.safeParse({
        toRole: 'YAYASAN_KETUA',
        reason: 'alasan yang cukup panjang',
      }).success
    ).toBe(true);
  });

  it('rejects a null plannedDate on audit update — the column is NOT NULL', () => {
    const parsed = updateAuditSchema.safeParse({ plannedDate: null });
    expect(parsed.success).toBe(false);
  });

  it('accepts a valid plannedDate and an omitted one', () => {
    expect(updateAuditSchema.safeParse({ plannedDate: '2026-05-01' }).success).toBe(true);
    expect(updateAuditSchema.safeParse({}).success).toBe(true);
  });

  it('requires the mandatory periodic-report fields', () => {
    expect(draftPeriodicReportSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(
      draftPeriodicReportSchema.safeParse({
        title: 'Laporan',
        period: '2026-Q1',
        executiveSummary: 'Ringkasan eksekutif.',
      }).success
    ).toBe(true);
  });

  it('rejects a future suspension startDate — the SK is effective on issuance', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      createBoardSuspensionSchema.safeParse({ ...baseSuspension, startDate: future }).success
    ).toBe(false);

    // A date in the past/today is fine: it records when the SK took effect.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      createBoardSuspensionSchema.safeParse({ ...baseSuspension, startDate: past }).success
    ).toBe(true);
    expect(createBoardSuspensionSchema.safeParse(baseSuspension).success).toBe(true);
  });
});

/**
 * The SK Pembekuan `documentUrl` was an unrestricted string and is rendered as
 * a link in the suspension register; it gets the same HTTPS-only treatment as
 * WBS attachments.
 */
describe('board suspension documentUrl validation', () => {
  const base = {
    userId: '11111111-1111-4111-8111-111111111111',
    skNumber: 'SK/001',
    auditReason: 'Alasan audit yang cukup panjang.',
  };

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'http://evil.example/sk.pdf',
    'https://user:pass@evil.example/sk.pdf',
    'https://',
    'https:///nohost',
    'https:\\/evil.example/sk.pdf',
    'https://evil.example/sk.pdf\nx',
  ])('rejects the unsafe documentUrl %j', (documentUrl) => {
    expect(
      createBoardSuspensionSchema.safeParse({ ...base, documentUrl }).success,
      `${documentUrl} should be rejected`
    ).toBe(false);
  });

  it('accepts a valid HTTPS documentUrl and an omitted/blank one', () => {
    expect(
      createBoardSuspensionSchema.safeParse({
        ...base,
        documentUrl: 'https://storage.cipansor.or.id/sk/sk-001.pdf',
      }).success
    ).toBe(true);
    expect(createBoardSuspensionSchema.safeParse(base).success).toBe(true);
    // The form's untouched input submits "".
    expect(createBoardSuspensionSchema.safeParse({ ...base, documentUrl: '' }).success).toBe(true);
  });
});

/**
 * Attachment links come from an *anonymous* visitor and are rendered as links
 * inside a handler's authenticated session. Every scheme that a browser would
 * execute or resolve is refused at the edge; only an https URL with a real
 * host survives.
 */
describe('WBS attachment URL validation', () => {
  const comment = (attachments: unknown) =>
    addPublicWbsCommentSchema.safeParse({
      ticketCode: 'WBS-202601-ABCDEF',
      trackingToken: 'a-tracking-token',
      message: 'Pesan',
      attachments,
    });
  const handler = (attachments: unknown) =>
    addWbsHandlerCommentSchema.safeParse({ message: 'Pesan', attachments });
  const report = (attachments: unknown) =>
    createPublicWbsSchema.safeParse({
      category: 'KEUANGAN_ASET',
      targetLevel: 'PENGURUS_YAYASAN',
      subject: 'Judul laporan',
      description: 'Deskripsi laporan yang cukup panjang.',
      attachments,
    });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'http://evil.example/payload',
    'ftp://evil.example/x',
    '//evil.example/x',
    '/relative/path.png',
    'https://user:pass@evil.example/x',
    'https://',
    'https:///nohost',
    'https://exa mple.com/x',
    'https://evil.example\\@good.example',
    'not a url at all',
    '',
  ])('rejects %s on the public comment', (value) => {
    expect(comment([value]).success).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'http://evil.example/payload',
    'https://user:pass@evil.example/x',
  ])('rejects %s on the handler comment too', (value) => {
    expect(handler([value]).success).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/plain,x', 'https://user:pass@h.example/x'])(
    'rejects %s on the new public report',
    (value) => {
      expect(report([value]).success).toBe(false);
    }
  );

  it('accepts a plain https link on all three surfaces', () => {
    const url = 'https://storage.cipansor.or.id/evidence/bukti-1.pdf';
    expect(comment([url]).success).toBe(true);
    expect(handler([url]).success).toBe(true);
    expect(report([url]).success).toBe(true);
    // A host-only URL with no path is legitimate (a signed bucket root).
    expect(comment(['https://storage.cipansor.or.id']).success).toBe(true);
    expect(comment(['https://storage.cipansor.or.id:8443/a']).success).toBe(true);
  });

  it('caps the list at ten entries', () => {
    const url = 'https://storage.cipansor.or.id/e.pdf';
    expect(comment(Array.from({ length: 10 }, () => url)).success).toBe(true);
    expect(comment(Array.from({ length: 11 }, () => url)).success).toBe(false);
  });
});

/**
 * The public surface is unauthenticated, so every string is a payload until it
 * is bounded. The transport cap (`express.json({ limit })`) is not a domain
 * cap: a single 9 MB field passes it. These boundaries pin the shared contract
 * so a body of `limit+1` is rejected at the edge with a stable 400 rather than
 * reaching a column, a handler list or the audit trail.
 */
describe('public WBS field maxima', () => {
  const base = {
    category: 'KEUANGAN_ASET' as const,
    targetLevel: 'PENGURUS_YAYASAN' as const,
    subject: 'Judul laporan',
    description: 'Deskripsi laporan yang cukup panjang.',
  };

  function parseReport(overrides: Record<string, unknown>) {
    return createPublicWbsSchema.safeParse({ ...base, ...overrides });
  }

  it.each([
    ['subject', WBS_MAX.subject],
    ['description', WBS_MAX.description],
    ['targetName', WBS_MAX.targetName],
    ['location', WBS_MAX.location],
    ['reporterName', WBS_MAX.reporterName],
    ['reporterContact', WBS_MAX.reporterContact],
  ] as const)('accepts %s exactly at the limit and rejects limit+1', (field, limit) => {
    expect(parseReport({ [field]: 'a'.repeat(limit) }).success, `${field} at limit`).toBe(true);
    expect(parseReport({ [field]: 'a'.repeat(limit + 1) }).success, `${field} over limit`).toBe(
      false
    );
  });

  it('bounds the public comment message', () => {
    const at = addPublicWbsCommentSchema.safeParse({
      ticketCode: 'WBS-202601-ABCDEF',
      trackingToken: 'a-tracking-token',
      message: 'a'.repeat(WBS_MAX.message),
    });
    expect(at.success).toBe(true);
    const over = addPublicWbsCommentSchema.safeParse({
      ticketCode: 'WBS-202601-ABCDEF',
      trackingToken: 'a-tracking-token',
      message: 'a'.repeat(WBS_MAX.message + 1),
    });
    expect(over.success).toBe(false);
  });

  it('bounds the tracking ticket code and token on both track and comment', () => {
    for (const schema of [trackPublicWbsSchema, addPublicWbsCommentSchema]) {
      const longTicket = schema.safeParse({
        ticketCode: 'WBS-' + 'a'.repeat(WBS_MAX.ticketCode),
        trackingToken: 'a-tracking-token',
        message: 'Pesan',
      });
      expect(longTicket.success).toBe(false);

      const longToken = schema.safeParse({
        ticketCode: 'WBS-202601-ABCDEF',
        trackingToken: 'a'.repeat(WBS_MAX.trackingToken + 1),
        message: 'Pesan',
      });
      expect(longToken.success).toBe(false);
    }
  });

  it('bounds an attachment URL', () => {
    const prefix = 'https://storage.cipansor.or.id/';
    const atLimit = prefix + 'a'.repeat(WBS_MAX.attachmentUrl - prefix.length);
    // Exactly at 2048 characters.
    expect(atLimit.length).toBe(WBS_MAX.attachmentUrl);
    const ok = addPublicWbsCommentSchema.safeParse({
      ticketCode: 'WBS-202601-ABCDEF',
      trackingToken: 'a-tracking-token',
      message: 'Pesan',
      attachments: [atLimit],
    });
    expect(ok.success).toBe(true);

    const over = addPublicWbsCommentSchema.safeParse({
      ticketCode: 'WBS-202601-ABCDEF',
      trackingToken: 'a-tracking-token',
      message: 'Pesan',
      attachments: [atLimit + 'a'],
    });
    expect(over.success).toBe(false);
  });
});
