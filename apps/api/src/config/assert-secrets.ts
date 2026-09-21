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
  // config/index.ts's own dev-only fallback for the Yayasan e-seal KEK. It is a
  // fixed string published in this repository, so it passes the length check
  // and contains none of the placeholder markers — only an exact match catches
  // it. It must never seal production data.
  'dev-foundation-eseal-passphrase-not-for-production',
];

export interface SecretIssue {
  variable: string;
  reason: string;
}

export interface SecretCheckInput {
  env?: string;
  jwtSecret?: string;
  studentCardHmacSecret?: string;
  /**
   * Passphrase server-side e-seal Yayasan (`FOUNDATION_ESEAL_PASSPHRASE`).
   *
   * Diperiksa di sini, bukan hanya lewat getter `config.foundation`, karena
   * getter itu hanya berjalan ketika modul keputusan MEMBACA-nya. Selama
   * ketiadaan nilai itu baru ketahuan saat e-seal pertama dipakai, aplikasi
   * produksi dapat boot dan melayani lalu gagal pada permintaan pertama yang
   * membutuhkan seal. Gerbang ini jalan SEBELUM port dibuka.
   */
  foundationEsealPassphrase?: string;
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
  // E-seal passphrase: the KEK that seals the Yayasan signing key. The dev
  // fallback in config/index.ts is a fixed, public string, so a production
  // boot without an explicit value would seal the foundation seal under a key
  // everyone can read.
  inspect('FOUNDATION_ESEAL_PASSPHRASE', input.foundationEsealPassphrase, issues);
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
    foundationEsealPassphrase:
      input.foundationEsealPassphrase ?? process.env.FOUNDATION_ESEAL_PASSPHRASE,
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
