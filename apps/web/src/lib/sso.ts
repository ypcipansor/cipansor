/**
 * Browser-side SSO helpers for Google Workspace and Microsoft 365.
 *
 * Both flows used to be hand-built: the page composed the provider's authorize
 * URL, stored `state`/`nonce` in sessionStorage and parsed `#id_token` back out
 * of the address bar. That is the part of OIDC most easily got wrong, so the
 * providers' own SDKs own it now — Google Identity Services for Google, MSAL
 * for Microsoft.
 *
 * Neither SDK validates the ID token for our *backend*; the token is only proof
 * of who signed in once `verifyGoogleIdToken`/`verifyMicrosoftIdToken` has
 * checked its signature and claims. The SDKs cover the redirect handshake
 * (CSRF/state), not ID-token replay, which remains the server's job.
 *
 * ## The `nonce` check that was removed, and why that is safe
 *
 * The hand-built flow kept `nonce` in sessionStorage and compared it against
 * the `nonce` claim in the `#id_token` fragment. That check existed for one
 * reason: the token arrived through the address bar, so an attacker who could
 * navigate the victim's browser to
 * `/login#id_token=<token stolen elsewhere>` could plant a session the victim
 * never started. The nonce bound that fragment to a flow the page had begun.
 *
 * Both SDKs return the token to our callback directly — it never touches
 * `window.location`. The injection vector the check defended against is gone,
 * so removing the check removes no protection. (MSAL additionally generates and
 * validates its own nonce inside `loginPopup`; GIS's credential callback is
 * likewise fed by its own completed flow, not by page input.)
 *
 * This is *not* the same claim as "the SDKs validate the token for the server".
 * They do not. `verify*IdToken` still owns signature, `iss`, `aud`, `exp` and
 * `email_verified`, and a token replayed to `POST /auth/sso/login` from
 * anywhere is still accepted — as it must be, because an ID token is a bearer
 * credential and the endpoint has no per-browser session to bind it to. Adding
 * a client-generated nonce to the request would not change that: the attacker
 * replaying a stolen token would replay its nonce too.
 */
export interface GoogleCredentialResult {
  idToken: string;
}

/** Minimal shape of the Google Identity Services global we rely on. */
interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
        use_fedcm_for_prompt?: boolean;
      }) => void;
      prompt: () => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let gisScriptPromise: Promise<void> | null = null;

/** Load the Google Identity Services script once, on demand. */
export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Google Identity Services requires a browser"),
    );
  }
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Gagal memuat Google Identity Services")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error("Gagal memuat Google Identity Services"));
    };
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

/**
 * Run the Google sign-in prompt and resolve with the ID token Google returns.
 *
 * The credential callback fires once per completed sign-in; the promise is
 * settled on the first one, so a later prompt cannot resolve an old request.
 */
export async function loginWithGoogle(
  clientId: string,
): Promise<GoogleCredentialResult> {
  await loadGoogleIdentityServices();

  return new Promise<GoogleCredentialResult>((resolve, reject) => {
    const gis = window.google;
    if (!gis?.accounts?.id) {
      reject(new Error("Google Identity Services tidak tersedia"));
      return;
    }

    let settled = false;
    gis.accounts.id.initialize({
      client_id: clientId,
      use_fedcm_for_prompt: false,
      callback: (response) => {
        if (settled) return;
        settled = true;
        if (!response.credential) {
          reject(new Error("Google tidak mengembalikan id_token"));
          return;
        }
        resolve({ idToken: response.credential });
      },
    });

    gis.accounts.id.prompt();
  });
}

/**
 * Authority MSAL should use for a client id.
 *
 * Microsoft client ids are scoped to exactly one tenant, and the authority is
 * derived from the *application object id* (the first segment of the client
 * id). The backend's `MICROSOFT_TENANT_ID` is used only when the client id is
 * not in the expected `<appId>.<tenantId>` SSO format (e.g. a GUID); otherwise
 * it is informational. Hardcoding `common` from the config alone would defeat
 * single-tenant enforcement, because MSAL falls back to `/common/`.
 */
export function microsoftAuthority(clientId: string): string {
  const [appId] = clientId.split(".");
  return `https://login.microsoftonline.com/${appId}`;
}

/**
 * Run the Microsoft sign-in popup and resolve with the ID token.
 *
 * MSAL is created lazily around the configured client id rather than mounted
 * with `MsalProvider`: the client id is only known once `GET /auth/sso/config`
 * resolves, and a provider built before that would have to be thrown away and
 * rebuilt. The SDK is the official `@azure/msal-browser` package — never a CDN
 * script, which would change who controls the code that handles the token.
 */
export async function loginWithMicrosoft(params: {
  clientId: string;
  tenantId?: string | null;
}): Promise<GoogleCredentialResult> {
  const { PublicClientApplication } = await import("@azure/msal-browser");

  // Prefer the backend-enforced tenant when it names one; otherwise derive the
  // authority from the app id in the client id.
  const tenant =
    params.tenantId &&
    params.tenantId !== "common" &&
    params.tenantId !== "organizations"
      ? params.tenantId
      : microsoftAuthority(params.clientId).split("/").pop();

  const pca = new PublicClientApplication({
    auth: {
      clientId: params.clientId,
      authority: `https://login.microsoftonline.com/${tenant}`,
      redirectUri: window.location.origin + "/login",
    },
    cache: { cacheLocation: "sessionStorage" },
  });

  await pca.initialize();

  const result = await pca.loginPopup({
    scopes: ["openid", "profile", "email"],
  });

  if (!result.idToken) {
    throw new Error("Microsoft tidak mengembalikan id_token");
  }
  return { idToken: result.idToken };
}
