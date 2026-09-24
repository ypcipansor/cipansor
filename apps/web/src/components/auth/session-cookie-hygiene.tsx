"use client";

import { useEffect } from "react";
import { clearBearerTokenCookie } from "@/lib/session-cookie";

/**
 * Clear a legacy exposed bearer-token cookie at bootstrap, on every page.
 *
 * The auth store does this in `onRehydrateStorage`, but that only runs on pages
 * that import the store — a public visitor arriving with an old cookie (an
 * earlier build mirrored `accessToken` into `document.cookie`) could browse the
 * marketing site without ever triggering it. This mounts in the root layout, so
 * the credential is removed wherever the visitor lands.
 *
 * A cookie outlives the page that set it: stopping the write site is not enough,
 * the credential has to be actively removed. See `lib/session-cookie.ts` for the
 * residual risk (tokens still in `localStorage`) that this does not close.
 */
export function SessionCookieHygiene() {
  useEffect(() => {
    clearBearerTokenCookie();
  }, []);

  return null;
}
