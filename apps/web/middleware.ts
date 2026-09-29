/**
 * Next.js Middleware
 * Handles authentication, route protection, and role-based routing
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  canAccessRoute,
  getDashboardForRole,
  type LegacyRole,
} from "@/lib/rbac";
import { hostSplitActionFor, isPortalHost } from "@/lib/host-split";

// Public routes that don't require authentication.
// "/unauthorized" is the access-denied page ProtectedRoute redirects to; it
// must stay reachable for any user (otherwise RBAC would bounce them off it).
//
// "/reset-password" is here for the same reason a login form is: the person
// arriving on it cannot sign in — they are holding a link e-mailed to them.
// Leaving it out is what made every "set your password" e-mail land on
// "/login?redirect=/reset-password" with the token discarded; the page existed
// nowhere and the redirect hid that fact.
//
// THERE IS DELIBERATELY NO SELF-SERVICE "lupa password" PAGE. A reset is
// started by an admin who has identified the person, not by anyone who can type
// an e-mail address into a public form. That keeps the mail-sending trigger
// behind the session wall and off the open internet.
//
// Portal-only: not in PUBLIC_PATH_PREFIXES, so the apex answers 404 for it,
// which is right for an account action.
const publicRoutes = ["/login", "/", "/unauthorized", "/reset-password"];

/**
 * Public marketing pages, reachable with no session at all.
 *
 * These are the pages Google indexes and the Ad Grants review visits. Anything
 * added under these prefixes must stay readable to an anonymous visitor —
 * bouncing a prospective parent to the staff login screen is what got the Ad
 * Grants application rejected the first time.
 *
 * (`/public/*` is already exempt because the matcher below excludes it.)
 */
const publicPrefixes = [
  "/profil",
  "/program-unggulan",
  "/unit",
  "/berita",
  "/galeri",
  "/wakaf-infaq",
  "/kontak",
  /**
   * The path a letter's printed QR used to open.
   *
   * The page itself is gone: a token attests that *some* letter was signed,
   * never that the document in your hand is that letter, so a forger could keep
   * the genuine QR and edit the body while the page still answered that the
   * letter was valid. Verification now means uploading the PDF itself at
   * /public/verify-letter, and next.config.ts 308s this path there.
   *
   * The prefix stays public because the redirect must reach people who have no
   * account here — a dinas office, a wali santri — and the letters carrying the
   * old URL are already on paper.
   */
  "/verifikasi",
  /**
   * Where a printed student ID card's QR points. Kept in step with
   * `PUBLIC_PATH_PREFIXES` in lib/host-split.ts (the two lists must describe
   * the same set; a sync test enforces it). It is a `/public/*` page so the
   * matcher below exempts it from middleware anyway, but listing it here makes
   * the read-without-a-session intent explicit and keeps the two canonical
   * lists in agreement (Flag 11).
   */
  "/public/verify-card",
];

/**
 * Where to reach the API from the Next server, for the principal lookup.
 *
 * Production runs the web and API behind one nginx, so the API is reachable at
 * its container address (`API_INTERNAL_URL`, e.g. http://api:3001). In `pnpm
 * dev` the two are separate origins and `NEXT_PUBLIC_API_URL` names the API;
 * CI sets the same. `||` (not `??`) so an empty NEXT_PUBLIC_API_URL — the
 * production setting, meaning same-origin — falls through to the dev default.
 */
function principalUrl(): string {
  const base =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001";
  return `${base.replace(/\/+$/, "")}/api/auth/principal`;
}

/**
 * Ask the API who the caller is, forwarding the session cookie.
 *
 * The session now lives in an HttpOnly cookie the middleware cannot read, so
 * the answer comes from the API rather than a client-written cookie. Only the
 * caller's own cookie is forwarded, and the response is the slim
 * `{ id, role, roleCode }` the RBAC helpers need. A 401 is "not signed in", the
 * same normal answer a missing cookie used to be.
 */
async function fetchPrincipal(
  request: NextRequest,
): Promise<{ role: LegacyRole; roleCode: string } | null> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  try {
    const res = await fetch(principalUrl(), {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { role?: string; roleCode?: string };
    };
    const role = body.data?.role;
    if (!role) return null;
    return { role: role as LegacyRole, roleCode: body.data?.roleCode ?? role };
  } catch {
    // The API is unreachable: treat as anonymous rather than crash the edge.
    // Protected routes then bounce to /login, which the API will also refuse —
    // a loud failure, not a silent bypass.
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Host split, before anything else.
  //
  // The public site and the application are served from separate hosts (see
  // lib/host-split.ts). This MUST run ahead of the auth checks below: those
  // send an anonymous visitor to `/login`, and `/login` is in `publicRoutes`,
  // so reaching them at all would put the login form back on the apex — the one
  // thing the split exists to prevent.
  //
  // Returns null for any host that is not one of the two production names, so
  // `pnpm dev` on localhost is untouched.
  const action = hostSplitActionFor(request.headers.get("host"), pathname);

  if (action?.kind === "notFound") {
    // An application path asked for on the public host. The apex has no
    // application on it, so it says so — rewrite, not redirect, so the address
    // the visitor typed stays in the bar and they can see what was wrong with
    // it. There is one way in to the system and it is portal.cipansor.or.id.
    return NextResponse.rewrite(new URL("/404", request.url), { status: 404 });
  }

  if (action?.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.host = action.host;
    url.port = "";
    url.protocol = "https:";
    // 308, not 307: this is a permanent move, and unlike 301 it is guaranteed
    // not to rewrite a POST into a GET on the way.
    return NextResponse.redirect(url, 308);
  }

  // Check if the route is public
  const isPublicRoute =
    publicRoutes.some(
      (route) => pathname === route || pathname.startsWith("/login"),
    ) ||
    // Match on segment boundaries so "/unit" never also grants "/units".
    publicPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  // Authentication, only where it decides the outcome.
  //
  // `fetchPrincipal` costs an API round-trip, so it is skipped when the result
  // cannot change the response: public routes and `/` never consult it, and a
  // request to `/login` only needs to know whether to bounce to a dashboard.
  let isAuthenticated = false;
  let role: LegacyRole | undefined;
  let roleCode: string | undefined;

  if (!isPublicRoute || pathname === "/login" || pathname === "/") {
    const principal = await fetchPrincipal(request);
    if (principal) {
      isAuthenticated = true;
      role = principal.role;
      roleCode = principal.roleCode;
    }
  }

  // Redirect unauthenticated users to login
  if (!isPublicRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users from login to their role-specific dashboard
  if (pathname === "/login" && isAuthenticated) {
    const dashboard = getDashboardForRole(role, roleCode);
    return NextResponse.redirect(new URL(dashboard, request.url));
  }

  // Redirect from root to appropriate page
  if (pathname === "/") {
    if (isAuthenticated) {
      const dashboard = getDashboardForRole(role, roleCode);
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
    // On the portal the root is the front door of the application, not a
    // marketing page — the landing page lives on the public host, and the host
    // split above already sent every marketing path there. Rendering it here
    // would give the pesantren's front page a second address that answers on a
    // noindex host, and leave someone who typed the portal's name looking at a
    // brochure instead of the sign-in form they came for.
    if (isPortalHost(request.headers.get("host"))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // Allow unauthenticated users to see landing page
    return NextResponse.next();
  }

  // Role-based access control for authenticated users
  if (isAuthenticated && role && !isPublicRoute) {
    if (!canAccessRoute(role, pathname, roleCode)) {
      // Redirect to their proper dashboard if trying to access unauthorized route
      const dashboard = getDashboardForRole(role, roleCode);
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)",
  ],
};
