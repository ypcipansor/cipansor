import { apiLogin, apiRequest, SEED_USERS, type AuthSession } from "./auth-api";

/**
 * A real signing authority: enrol a key through the actual API chain.
 *
 * The verification spec used to mock `POST /esign/verify-pdf`, which proved
 * only that the page renders a JSON payload — not that the signed PDF and the
 * verification response agree, which is the whole claim of a signature. This
 * helper drives the real chain instead: identity → KTP upload → key request →
 * Super Admin approval → passphrase activation. Every step goes through the
 * same endpoints the UI calls, so the resulting key is one a person could
 * really have.
 *
 * The Super Admin's own account is the signer: it is seeded, it has the fixed
 * TOTP secret, and it is the only role that may approve the request it also
 * makes. Enrolment is idempotent — a key that already exists is reused — so the
 * spec can run repeatedly against a warm database without a fresh seed.
 */

const KTP_PNG = Buffer.from(
  // A 1×1 transparent PNG. The identity gate only checks the MIME type and
  // stores the bytes; it never decodes the image.
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A valid Indonesian NIK whose embedded birth date matches `BIRTH_DATE`. */
const NIK = "3273010101900001";
const BIRTH_DATE = "1990-01-01";
export const SIGNER_PASSPHRASE = "passphrase-e2e-yang-panjang";

export interface SignerFixture {
  session: AuthSession;
  userId: string;
}

/**
 * Confirm that an already-issued key is sealed with `SIGNER_PASSPHRASE`.
 *
 * The probe uses the key-rotation endpoint because it is the only one that
 * checks the passphrase without signing a letter: a correct `currentPassphrase`
 * succeeds (and re-seals the key with the same passphrase, so nothing changes),
 * while a wrong one fails. It needs the account password because that endpoint
 * checks the account password *before* the passphrase — with a deliberately
 * wrong password the probe could never reach the passphrase check and would
 * misreport every key as foreign.
 *
 * This exists so a warm database enrolled outside this fixture fails with a
 * sentence that names the cause and the fix, instead of the signing step
 * failing with a "passphrase wrong" that reads like a product bug.
 */
async function assertSignerPassphrase(
  session: AuthSession,
  accountPassword: string,
): Promise<void> {
  const res = await fetch(
    `${process.env.API_URL || "http://localhost:3001/api"}/esign/me/passphrase`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        currentPassphrase: SIGNER_PASSPHRASE,
        accountPassword,
        newPassphrase: SIGNER_PASSPHRASE,
      }),
    },
  );
  if (res.ok) return;

  const text = await res.text();
  throw new Error(
    `The signing key already on this account is not usable with ` +
      `SIGNER_PASSPHRASE, so this spec's signing step would fail. Re-seed the ` +
      `database (ALLOW_DESTRUCTIVE_SEED=1 E2E_FIXED_2FA=1 pnpm --filter api db:seed) ` +
      `to reset the e-sign state. Response: ${res.status} ${text.slice(0, 200)}`,
  );
}

/**
 * Enrol `session`'s user as a signer and return the activated session.
 *
 * If the account already holds an active key, the passphrase is assumed to be
 * the one this helper set and the existing enrolment is reused — after a probe
 * confirms it, so a key sealed with some other passphrase fails loudly here
 * rather than at the signing step.
 */
export async function ensureSigner(
  session: AuthSession,
  accountPassword: string,
): Promise<SignerFixture> {
  const userId = String(session.user.id);

  const status = await apiRequest<{
    data: {
      hasKey: boolean;
      state: string | null;
      approvedAwaitingActivation: boolean;
      pendingRequest: { id: string } | null;
    };
  }>(session, "GET", "/esign/me");

  if (status.data.hasKey) {
    if (status.data.state === "PENDING_APPROVAL") {
      throw new Error(
        `Signer key for ${userId} is PENDING_APPROVAL — an earlier run left it ` +
          "mid-enrolment. Re-seed the database to reset the e-sign state.",
      );
    }
    // A key may already exist from an earlier run — but only if this fixture
    // sealed it. The spec always signs with `SIGNER_PASSPHRASE`, so a key whose
    // passphrase came from anywhere else (a warm database enrolled by hand)
    // would fail at signing with a confusing "passphrase wrong" that looks like
    // a product bug rather than a fixture assumption. Probe the known
    // passphrase on the real signing endpoint and say plainly what is wrong.
    await assertSignerPassphrase(session, accountPassword);
    return { session, userId };
  }

  // Identity first: the service refuses a key request until the record is
  // complete *and* a KTP file is on it.
  await apiRequest(session, "PUT", "/esign/me/identity", {
    legalName: "Super Admin E2E",
    nik: NIK,
    birthPlace: "Ciamis",
    birthDate: BIRTH_DATE,
  });

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(KTP_PNG)], { type: "image/png" }),
    "ktp.png",
  );
  const ktpRes = await fetch(
    `${process.env.API_URL || "http://localhost:3001/api"}/esign/me/identity/ktp`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: form,
    },
  );
  if (!ktpRes.ok) {
    throw new Error(
      `KTP upload failed: ${ktpRes.status} ${(await ktpRes.text()).slice(0, 200)}`,
    );
  }

  let approvedAwaitingActivation = status.data.approvedAwaitingActivation;
  if (!approvedAwaitingActivation) {
    if (!status.data.pendingRequest) {
      await apiRequest(session, "POST", "/esign/me/request", {
        reason: "Enrolment for the signing-authority e2e flow.",
      });
    }

    // The same Super Admin account approves its own request. `identityVerification`
    // is required because the identity has never been verified, and it is the
    // act that records the KTP was opened and matched.
    //
    // `apiRequest` resolves the whole `{ success, data }` envelope, not the
    // array inside it — reading `requests.find` here failed on CI the moment a
    // fresh database reached this branch.
    const requests = await apiRequest<{
      data: Array<{ id: string; status: string; user: { id: string } }>;
    }>(session, "GET", "/esign/requests?status=PENDING");
    const pending = requests.data.find(
      (r) => r.user?.id === userId && r.status === "PENDING",
    );
    if (!pending) {
      throw new Error(
        "No pending signing-key request found for the signer — cannot approve.",
      );
    }

    await apiRequest(session, "POST", `/esign/requests/${pending.id}/decide`, {
      approve: true,
      grantedDays: 365,
      identityVerification: { note: "KTP diperiksa: data cocok (e2e)." },
    });
    approvedAwaitingActivation = true;
  }

  await apiRequest(session, "POST", "/esign/me/activate", {
    passphrase: SIGNER_PASSPHRASE,
  });

  const after = await apiRequest<{ data: { hasKey: boolean; state: string } }>(
    session,
    "GET",
    "/esign/me",
  );
  if (!after.data.hasKey || after.data.state !== "ACTIVE") {
    throw new Error(
      `Signer enrolment did not reach ACTIVE: ${JSON.stringify(after.data)}`,
    );
  }

  return { session, userId };
}

/** Enrol the seeded Super Admin as a signer. */
export async function ensureSuperAdminSigner(): Promise<SignerFixture> {
  const session = await apiLogin(SEED_USERS.superAdmin);
  return ensureSigner(session, SEED_USERS.superAdmin.password);
}
