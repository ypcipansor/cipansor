/**
 * Refuse to start in production with a secret anyone can look up.
 *
 * cipansor.or.id ran with JWT_SECRET set to
 * "your-super-secret-key-change-this-in-production-min-32-chars" — the exact
 * placeholder on line 20 of .env.example, in a public repository. The signing
 * key for every session was published on GitHub.
 *
 * That is not a weak password; it is a total bypass. Anyone could mint a token
 * claiming `roleCode: 'SUPER_ADMIN'`, sign it with the published key, and be
 * admitted as a full administrator. No password, and 2FA never enters into it,
 * because 2FA is verified during login and a forged token never logs in.
 *
 * Nothing complained, because config/index.ts supplies its own fallback:
 *
 *     secret: process.env.JWT_SECRET || 'change-this-secret-in-production'
 *
 * A fallback is exactly the wrong shape for a signing key. It turns "the
 * operator forgot" — which should be loud and immediate — into a service that
 * starts cleanly, serves traffic, and is wide open. So the check is a refusal
 * to boot rather than a warning: a warning in a log nobody reads is how this
 * survived deployment in the first place.
 *
 * Only enforced when NODE_ENV=production, so local development and tests keep
 * working with whatever is in .env.
 */

/**
 * Values that must never sign a production token. Substring matching, because
 * the failure mode is copying .env.example and editing around the placeholder
 * rather than replacing it.
 */
const PLACEHOLDER_MARKERS = [
  'change-this',
  'change-me',
  'changeme',
  'your-super-secret',
  'your-secret',
  'replace-this',
  'example',
  'placeholder',
  'insecure',
  'localdev',
];

/** A signing key shorter than this is brute-forceable regardless of content. */
const MIN_SECRET_LENGTH = 32;

/**
 * Known default/leaked values that pass every generic check.
 *
 * The former SystemSecret subsystem's fallback key was a sequential byte
 * pattern (00 01 02 … 1f) exposed as a hardcoded default in this public
 * repository. It is 64 hex characters and looks deliberate, so the length and
 * placeholder checks below both accept it — yet signing tokens or printed
 * cards with it hands the verifier to anyone who can read the source. Any
 * signer (JWT, card HMAC, …) must reject it. Values here are exact matches;
 * anything added must be a value already public in this repository, not a
 * guess about a future default.
 */
const LEAKED_OR_DEFAULT_VALUES = [
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
];

export interface SecretIssue {
  variable: string;
  reason: string;
}

export interface SecretCheckInput {
  env?: string;
  jwtSecret?: string;
  studentCardHmacSecret?: string;
}

function inspect(variable: string, value: string | undefined, issues: SecretIssue[]): void {
  if (!value || value.trim() === '') {
    issues.push({ variable, reason: 'is not set' });
    return;
  }

  if (value.length < MIN_SECRET_LENGTH) {
    issues.push({
      variable,
      reason:
        `is too short — must be at least ${MIN_SECRET_LENGTH} characters ` +
        `(got ${value.length})`,
    });
    return;
  }

  const lowered = value.toLowerCase();

  if (LEAKED_OR_DEFAULT_VALUES.includes(lowered)) {
    issues.push({
      variable,
      reason:
        'is still a leaked/default value from this public repository — that ' +
        'key is public',
    });
    return;
  }

  const marker = PLACEHOLDER_MARKERS.find((m) => lowered.includes(m));
  if (marker) {
    issues.push({
      variable,
      reason:
        `is still an example value (contains "${marker}") — that value is in ` +
        '.env.example, in a public repository',
    });
  }
}

/** Everything wrong with the secrets, or an empty list. */
export function findSecretIssues(input: SecretCheckInput): SecretIssue[] {
  const issues: SecretIssue[] = [];
  inspect('JWT_SECRET', input.jwtSecret, issues);
  // Required, not optional, in production. A card signer that falls back to
  // the session key means every printed card dies on the next JWT rotation;
  // a card signer that falls back to a hardcoded value means anyone can mint
  // a verifiable card. Refuse to boot in either case.
  inspect('STUDENT_CARD_HMAC_SECRET', input.studentCardHmacSecret, issues);
  return issues;
}

/**
 * Throws in production when a secret is missing, short, or still the example
 * value. Returns silently everywhere else.
 */
export function assertProductionSecrets(input: SecretCheckInput = {}): void {
  const env = input.env ?? process.env.NODE_ENV;
  if (env !== 'production') return;

  const issues = findSecretIssues({
    env,
    jwtSecret: input.jwtSecret ?? process.env.JWT_SECRET,
    studentCardHmacSecret:
      input.studentCardHmacSecret ?? process.env.STUDENT_CARD_HMAC_SECRET,
  });

  if (issues.length === 0) return;

  const detail = issues.map((i) => `  - ${i.variable}: ${i.reason}`).join('\n');

  throw new Error(
    'Refusing to start the API in production with insecure secrets:\n' +
      `${detail}\n\n` +
      'Generate new values, e.g.:  openssl rand -hex 48\n' +
      'Rotating JWT_SECRET only ends live sessions — no stored data becomes ' +
      'unreadable.'
  );
}

/**
 * A production `MICROSOFT_TENANT_ID` of `common` is a hole, not a default.
 *
 * `common` accepts a token minted in *any* Entra directory whose mailbox
 * matches a local account, which is a wide net for a single-tenant deployment.
 * The account still has to exist locally, so it is not an outright bypass — but
 * it means an attacker who controls *any* Entra tenant can mint a token for a
 * mailbox they claim, and the only thing between that and a staff account is
 * the local e-mail match. For a yayasan that runs one directory there is no
 * reason to accept a token from someone else's, and a warning at boot is
 * something a deploy log absorbs silently.
 *
 * It therefore refuses to start in production. A deployment that genuinely
 * needs multi-tenant sign-in (several partner directories, say) must say so
 * explicitly with `MICROSOFT_ALLOW_MULTI_TENANT=true`, which turns the failure
 * back into a warning — a written, auditable decision rather than a default.
 */
export const MICROSOFT_ALLOW_MULTI_TENANT_ENV = 'MICROSOFT_ALLOW_MULTI_TENANT';

/** The tenant values that accept tokens from more than one directory. */
const MULTI_TENANT_VALUES = new Set(['common', 'organizations', 'consumers']);

function isMultiTenant(tenantId: string | undefined): boolean {
  return MULTI_TENANT_VALUES.has((tenantId ?? 'common').toLowerCase());
}

/** True when the deployment has explicitly opted into multi-tenant sign-in. */
export function microsoftMultiTenantAllowed(
  flag: string | undefined = process.env[MICROSOFT_ALLOW_MULTI_TENANT_ENV]
): boolean {
  return (flag ?? '').trim().toLowerCase() === 'true';
}

/**
 * Refuse to boot in production with multi-tenant Microsoft sign-in that no one
 * explicitly asked for.
 *
 * Only enforced when Microsoft SSO is actually configured (`MICROSOFT_CLIENT_ID`
 * set): a deployment that never uses Microsoft login has no tenant to tighten,
 * and blocking its startup over an unused default would be a self-inflicted
 * outage.
 */
export function assertProductionMicrosoftTenant(input: {
  env?: string;
  tenantId?: string;
  clientId?: string;
  allowMultiTenant?: boolean;
} = {}): void {
  const env = input.env ?? process.env.NODE_ENV;
  if (env !== 'production') return;

  const clientId = input.clientId ?? process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) return;

  const tenantId = input.tenantId ?? process.env.MICROSOFT_TENANT_ID;
  if (!isMultiTenant(tenantId)) return;

  const allowMultiTenant =
    input.allowMultiTenant ?? microsoftMultiTenantAllowed();
  if (allowMultiTenant) return;

  throw new Error(
    'Refusing to start the API in production with MICROSOFT_TENANT_ID=' +
      `"${tenantId ?? 'common'}" (multi-tenant): Microsoft SSO would accept a ` +
      'token minted in ANY Entra tenant, not only the yayasan\'s. Set it to ' +
      'the directory GUID or verified domain (Entra portal → Overview → ' +
      `Tenant ID), or set ${MICROSOFT_ALLOW_MULTI_TENANT_ENV}=true to accept ` +
      'multi-tenant sign-in deliberately.'
  );
}

/**
 * The non-fatal half, kept for the explicit opt-out path: a deployment that set
 * {@link MICROSOFT_ALLOW_MULTI_TENANT_ENV} still gets told what it chose.
 */
export function warnOnLooseMicrosoftTenant(
  env: string | undefined = process.env.NODE_ENV,
  tenantId: string | undefined = process.env.MICROSOFT_TENANT_ID
): string | null {
  if (env !== 'production') return null;
  if (!isMultiTenant(tenantId)) return null;

  return (
    'MICROSOFT_TENANT_ID is "' +
    (tenantId ?? 'common') +
    '" in production: Microsoft SSO will accept ' +
    "a token minted in ANY Entra tenant, not only the yayasan's. Set it to " +
    'the directory GUID or verified domain (Entra portal → Overview → ' +
    'Tenant ID) to restrict sign-in to this organisation.'
  );
}
