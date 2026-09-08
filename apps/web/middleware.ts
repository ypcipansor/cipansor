/**
 * Next.js Middleware
 * Handles authentication, route protection, and role-based routing
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  canAccessRoute,
  getDashboardForRole,
  getPrimaryRoleCode,
  getEffectiveRole,
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
];

// Helper function to get auth state from cookie
function getAuthState(request: NextRequest): {
  isAuthenticated: boolean;
  role?: LegacyRole;
  roleCode?: string;
} {
  // Check for auth storage in cookies (set by zustand persist)
  const authStorage = request.cookies.get("auth-storage")?.value;

  if (authStorage) {
    try {
      const parsed = JSON.parse(authStorage);
      if (parsed.state?.isAuthenticated === true && parsed.state?.user) {
        // Prefer the legacy `user.role` bucket (still emitted by the backend);
        // fall back to deriving it from `userRoles[].role.code` (RoleCode).
        const role = getEffectiveRole(parsed.state.user);
        if (role) {
          return {
            isAuthenticated: true,
            role,
            roleCode: getPrimaryRoleCode(parsed.state.user),
          };
        }
      }
    } catch {
      // Parse error - not authenticated
    }
  }

  // Fallback: check for accessToken
  const token =
    request.cookies.get("accessToken")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (token) {
    return { isAuthenticated: true };
  }

  return { isAuthenticated: false };
}

export function middleware(request: NextRequest) {
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

  // Get authentication state
  const { isAuthenticated, role, roleCode } = getAuthState(request);

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
    if (!canAccessRoute(role, pathname)) {
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
