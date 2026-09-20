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

/**
 * The GIS moment notification handed to the `prompt` callback. GIS fires it
 * when a prompt will never yield a credential (dismissed, skipped, or
 * suppressed by browser policy), which is the only signal we get in those
 * cases — the credential callback then never runs.
 */
export interface GooglePromptMomentNotification {
  isDismissedMoment?: () => boolean;
  isSkippedMoment?: () => boolean;
  isNotDisplayedMoment?: () => boolean;
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
      prompt: (momentListener?: (notification: GooglePromptMomentNotification) => void) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type?: string;
          theme?: string;
          size?: string;
          text?: string;
          shape?: string;
          locale?: string;
        },
      ) => void;
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
 *
 * A prompt is not a guaranteed callback: the user can dismiss it, the browser
 * can suppress it, or it may simply never be shown. Left to the credential
 * callback alone the promise would hang forever and the button would look
 * stuck, so the GIS moment notification (dismissed / skipped / not displayed)
 * rejects as well. A hard timeout backstops the cases GIS reports nothing at
 * all.
 *
 * **Known limitation — one-tap suppression.** `prompt()` (One Tap) is the only
 * GIS entry point that can complete a sign-in *without* a user gesture, and
 * browsers are free to suppress it: Safari/Firefox ITP treats it as a
 * third-party frame and blocks it outright, and an enterprise policy
 * (`ThirdPartyCookiesBlocked`, Chrome's `BlockThirdPartyCookies`) does the
 * same. When that happens `isNotDisplayedMoment()` reports it and this promise
 * rejects with "Pilih akun Google dibatalkan", leaving the button usable for a
 * retry — it does NOT silently hang, which was the earlier failure mode. The
 * alternative (`disableAutoSelect` + an explicit `renderButton`) needs a
 * browser check we cannot run in CI against a real IdP policy, so the timeout
 * and moment-notification fallbacks here are the mitigation. The button is not
 * the only way in: password login and Microsoft SSO are unaffected.
 */
export async function loginWithGoogle(
  clientId: string,
  timeoutMs = 120_000,
): Promise<GoogleCredentialResult> {
  await loadGoogleIdentityServices();

  return new Promise<GoogleCredentialResult>((resolve, reject) => {
    const gis = window.google;
    if (!gis?.accounts?.id) {
      reject(new Error("Google Identity Services tidak tersedia"));
      return;
    }

    // Held in an object so `settle` can clear the timer that is assigned
    // after it (a bare `let` cannot be read before its assignment safely).
    const state: { settled: boolean; timer?: ReturnType<typeof setTimeout> } = {
      settled: false,
    };

    const settle = (fn: () => void) => {
      if (state.settled) return;
      state.settled = true;
      if (state.timer) clearTimeout(state.timer);
      fn();
    };

    gis.accounts.id.initialize({
      client_id: clientId,
      use_fedcm_for_prompt: false,
      callback: (response) => {
        settle(() => {
          if (!response.credential) {
            reject(new Error("Google tidak mengembalikan id_token"));
            return;
          }
          resolve({ idToken: response.credential });
        });
      },
    });

    // Settle on "no credential is coming", so the caller can re-enable the
    // button and show a message instead of waiting on a dead promise.
    const momentListener = (notification: {
      isDismissedMoment?: () => boolean;
      isSkippedMoment?: () => boolean;
      isNotDisplayedMoment?: () => boolean;
    }) => {
      const dismissed = notification.isDismissedMoment?.() ?? false;
      const skipped = notification.isSkippedMoment?.() ?? false;
      const notDisplayed = notification.isNotDisplayedMoment?.() ?? false;
      // A suppressed One Tap (Safari/Firefox ITP, an enterprise cookie policy)
      // is not the user dismissing anything, and retrying the same path cannot
      // help. Give the reason and point at the fallback button that does work,
      // rather than a bare "dibatalkan".
      if (notDisplayed) {
        settle(() =>
          reject(
            new Error(
              "Pilih akun Google tidak dapat ditampilkan di peramban ini. " +
                "Gunakan tombol Google pada halaman, atau masuk dengan kata sandi / Microsoft 365.",
            ),
          ),
        );
        return;
      }
      if (dismissed || skipped) {
        settle(() => reject(new Error("Pilih akun Google dibatalkan")));
      }
    };

    state.timer = setTimeout(() => {
      settle(() =>
        reject(new Error("Waktu masuk Google habis. Silakan coba lagi.")),
      );
    }, timeoutMs);

    gis.accounts.id.prompt(momentListener);
  });
}

/**
 * Render the explicit Google sign-in button as a fallback for browsers that
 * suppress One Tap.
 *
 * `prompt()` is the only GIS entry point that can complete a sign-in without a
 * user gesture, and precisely for that reason browsers are free to block it —
 * Safari/Firefox ITP treats the One Tap iframe as third-party, and enterprise
 * cookie policies do the same. `renderButton` is an ordinary same-origin
 * button, so it is not subject to the same suppression.
 *
 * The login page keeps the One Tap `prompt()` as the primary flow (it is
 * smoother, and was the behaviour before this change) and calls this only when
 * that flow reports `isNotDisplayedMoment()` — i.e. once the browser has told
 * us the prompt cannot be shown.
 *
 * Resolves with the ID token from the first credential the rendered button
 * yields.
 */
export async function loginWithGoogleButton(
  clientId: string,
  container: HTMLElement,
  timeoutMs = 120_000,
): Promise<GoogleCredentialResult> {
  await loadGoogleIdentityServices();

  return new Promise<GoogleCredentialResult>((resolve, reject) => {
    const gis = window.google;
    if (!gis?.accounts?.id) {
      reject(new Error("Google Identity Services tidak tersedia"));
      return;
    }

    const state: { settled: boolean; timer?: ReturnType<typeof setTimeout> } = {
      settled: false,
    };
    const settle = (fn: () => void) => {
      if (state.settled) return;
      state.settled = true;
      if (state.timer) clearTimeout(state.timer);
      container.replaceChildren();
      fn();
    };

    gis.accounts.id.initialize({
      client_id: clientId,
      use_fedcm_for_prompt: false,
      callback: (response) => {
        settle(() => {
          if (!response.credential) {
            reject(new Error("Google tidak mengembalikan id_token"));
            return;
          }
          resolve({ idToken: response.credential });
        });
      },
    });

    container.replaceChildren();
    gis.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
    });

    state.timer = setTimeout(() => {
      settle(() =>
        reject(new Error("Waktu masuk Google habis. Silakan coba lagi.")),
      );
    }, timeoutMs);
  });
}

/**
 * Authority MSAL should use for a client id.
 *
 * Microsoft client ids minted by the `<appId>.<tenantId>` SSO flow are scoped
 * to exactly one tenant, and the authority is derived from the *application
 * object id* (the first segment of the client id). This is the fallback for a
 * `clientId` that carries no usable tenant id; when the backend names one,
 * {@link loginWithMicrosoft} uses it instead.
 */
export function microsoftAuthority(clientId: string): string {
  const [appId] = clientId.split(".");
  return `https://login.microsoftonline.com/${appId}`;
}

/**
 * The leading segment of the MSAL authority URL: the tenant (GUID, domain, or
 * the multi-tenant sentinels `common`/`organizations`/`consumers`).
 */
export function microsoftAuthorityTenant(authority: string): string {
  return authority.split("/").pop() ?? "common";
}

/**
 * The tenant MSAL should target for a sign-in.
 *
 * `MICROSOFT_TENANT_ID` is authoritative whenever it names a directory:
 *
 *  - a GUID or a domain is that single tenant, honored as-is;
 *  - `common`/`organizations`/`consumers` are Microsoft's multi-tenant
 *    sentinels and must be passed through verbatim. The previous code folded
 *    them into the "no tenant configured" branch, so MSAL received the appId
 *    (the first segment of the client id) as its authority — a directory that
 *    does not exist — and every multi-tenant sign-in failed.
 *
 * With no `MICROSOFT_TENANT_ID` at all the app id from the `<appId>.<tenantId>`
 * client-id format is the right authority, matching
 * {@link microsoftAuthority}.
 */
export function microsoftTenantId(
  clientId: string,
  tenantId?: string | null,
): string {
  if (tenantId) return tenantId;
  return microsoftAuthorityTenant(microsoftAuthority(clientId));
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

  // `MICROSOFT_TENANT_ID` wins whenever it names a tenant; the multi-tenant
  // sentinels (`common`/`organizations`/`consumers`) are honored verbatim so
  // they do not collapse into the app-id fallback. With no tenant configured
  // the app id from the `<appId>.<tenantId>` client id is the authority.
  const tenant = microsoftTenantId(params.clientId, params.tenantId);

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
