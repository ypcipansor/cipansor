# WBS evidence attachments: link now, managed upload later

Status: decided (2026-09-23). The present behaviour is option (a); option (b) is
a tracked, non-blocking follow-up.

## Context

A public, unauthenticated visitor filing a WBS report can attach evidence. The
current implementation accepts up to 10 **HTTPS URLs** per report
(`attachmentsSchema` in `packages/shared/src/schemas/pengawasan.ts`) and renders
them as links for the handler. There is no server-side upload, no storage bucket
owned by the yayasan.

## Decision: keep the HTTPS link (option a)

The alternative — a managed upload with private storage, scope-limited access,
size/type limits and EXIF stripping — is the better long-term design, but it is
a body of work (storage provider, signed URLs, retention, malware scan, quota)
that does not belong on this governance PR. Until it exists, the link form is
retained deliberately, with these constraints and disclosures:

- **Scheme and authority are enforced at the edge.** `attachmentUrlSchema`
  requires `https://`, rejects URLs carrying credentials (`user:pass@`),
  rejects control characters and backslashes (which browsers normalise into a
  host-stealing path), and caps length at 2048. `javascript:`,
  `data:text/html`, `file://` and open-redirect shapes are refused before
  persistence. See the long rationale in the schema file.
- **The link is never fetched server-side**, so SSRF is out of scope by
  construction.
- **No storage-host allowlist.** The product has several legitimate buckets and
  a wrong allowlist silently drops valid evidence — the failure mode is lost
  reports, not a blocked attack. A controlled endpoint that mints the object
  reference is the correct fix and is what the follow-up implements.
- **Retention and access.** The yayasan cannot revoke a link to a file it does
  not host, and access lives with whatever the reporter chose to share. The
  public form therefore displays an inline notice telling the reporter that the
  link is not revocable, to keep it accessible only to handlers, and never to
  include a password. Reporting an incident must not be blocked on storage
  infrastructure we do not have yet.

## Follow-up (not blocking PR #508)

Implement option (b): a dedicated multipart upload endpoint for WBS evidence
that writes to private object storage, returns an opaque object reference
instead of a URL, enforces size and MIME allowlists, strips EXIF, and serves the
object only through an authenticated route whose handler is inside the report's
scope (`buildScopeWhere`). At that point `attachments` stores object references,
the URL validator is retired for this field, and the reporter notice changes to
describe managed retention. This should be filed as its own issue against the
WBS module; it requires infrastructure the repository does not currently ship.
