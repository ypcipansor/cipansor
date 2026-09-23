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
import {
  ROUTING_COOKIE,
  resolveRoutingCookieSecret,
  verifyRoutingCookie,
  type RoutingCookiePayload,
} from "@cipansor/shared";

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
   * Every anonymous page served under the `/public/` URL segment.
   *
   * These were previously public only by accident: the matcher below excluded
   * the `public` segment, so middleware never ran for them and they bypassed
   * both the session wall and the host split. That broke the canonical host for
   * `/public/wbs` (served on both hosts) and left the rest unclassified by
   * `hostSplitActionFor`, which reads `PUBLIC_PATH_PREFIXES` in
   * lib/host-split.ts — a page not on that list is answered 404 on the apex.
   * The matcher now sends page URLs here, so the classification is explicit:
   * `/public/spmb`, `/public/spmb/track`, `/public/verify-card`,
   * `/public/verify-letter`, `/public/verify-sanad`, `/public/wbs` and
   * `/public/wbs/track` are all read-without-a-session and all belong to the
   * public host. Kept in step with `PUBLIC_PATH_PREFIXES` (sync test enforced).
   */
  "/public",
];

/**
 * The routing-cookie signing key, resolved once per middleware instance.
 *
 * Next inlines `process.env.X` references for the Edge/runtime boundary, so the
 * three names are read literally. Falling back to `JWT_SECRET` keeps the key in
 * one place; if neither is configured the resolver throws, and `getAuthState`
 * catches that and fails closed rather than routing on an unsigned cookie.
 */
function routingCookieSecret(): string {
  return resolveRoutingCookieSecret({
    ROUTING_COOKIE_SECRET: process.env.ROUTING_COOKIE_SECRET,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  });
}

/**
 * Resolve auth state from cookies.
 *
 * The session is server-issued: the API sets `HttpOnly` cookies and the
 * `cipansor_routing` hint the middleware routes on. **`HttpOnly` does not make
 * the routing hint trustworthy** — the browser sends back whatever value a
 * same-site request could set, so the hint is only accepted when its MAC
 * verifies (`verifyRoutingCookie`). A missing, forged, malformed or expired
 * cookie yields no route authority, and the legacy token cookies attest only
 * that *a* session exists, never a role: protected routes then fail closed.
 */
async function getAuthState(request: NextRequest): Promise<{
  isAuthenticated: boolean;
  role?: LegacyRole;
  roleCode?: string;
}> {
  // Preferred and authoritative for routing: the server-signed routing cookie.
  // A value that does not carry a valid MAC is treated exactly like no cookie.
  let routing: RoutingCookiePayload | null = null;
  try {
    routing = await verifyRoutingCookie(
      request.cookies.get(ROUTING_COOKIE)?.value,
      routingCookieSecret(),
    );
  } catch {
    routing = null;
  }
  if (routing) {
    return {
      isAuthenticated: true,
      role: routing.role as LegacyRole,
      roleCode: routing.roleCode,
    };
  }

  // Transitional: a session opened before the migration, holding the old
  // client-readable access cookie, or a native Bearer header. Presence attests
  // a session but supplies no role, so protected routes fail closed until the
  // next login sets the routing cookie.
  const token =
    request.cookies.get("accessToken")?.value ||
    request.cookies.get("access_token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (token) {
    return { isAuthenticated: true };
  }

  return { isAuthenticated: false };
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

  // Get authentication state
  const { isAuthenticated, role, roleCode } = await getAuthState(request);

  // Redirect unauthenticated users to login
  if (!isPublicRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users from login to their role-specific dashboard.
  // Only when the role is actually known: sending an authenticated-but-roleless
  // visitor to a dashboard would just bounce them to /unauthorized, and the
  // login page is the one place they can re-establish a resolvable session.
  if (pathname === "/login" && isAuthenticated && role) {
    const dashboard = getDashboardForRole(role, roleCode);
    return NextResponse.redirect(new URL(dashboard, request.url));
  }

  // Redirect from root to appropriate page
  if (pathname === "/") {
    if (isAuthenticated) {
      if (!role) {
        // Same fail-closed rule as below: with no resolvable role we cannot
        // pick a landing page, so send them to the login form rather than guess.
        return NextResponse.redirect(new URL("/login", request.url));
      }
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

  // Role-based access control for authenticated users.
  //
  // An authenticated session whose role cannot be resolved is NOT allowed
  // through. The old `role &&` guard skipped the check entirely in that case,
  // so any holder of an `accessToken` (whose `auth-storage` cookie was missing
  // or trimmed) could open every protected route. "Authenticated but role
  // unknown" is exactly the state we can say least about, so it fails closed:
  // we cannot pick a dashboard to land them on, and guessing is how the hole
  // opened the first time. Public routes still pass.
  if (isAuthenticated && !role && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

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
     * - any path with a file extension (static assets in `public/`, etc.)
     *
     * The page URL segment `/public/...` is deliberately NOT excluded. It used
     * to be — the old matcher ended in `|public)` — which meant middleware never
     * ran for `/public/wbs`, and `hostSplitActionFor` could not redirect it from
     * the portal to the canonical public host. The whistleblowing page answered
     * on both hosts: the portal served an anonymous page the split says belongs
     * to the apex, and the login wall the split exists to enforce was bypassed
     * on that one prefix.
     *
     * "public" the URL segment and `public/` the static-asset directory are
     * different things that happen to share a name. The `.*\\..*` clause already
     * excludes every real static file (they all carry an extension), so nothing
     * under the static directory is matched; only the extensionless page route
     * `/public/wbs` (and its subroutes) now reaches middleware, where the host
     * split and the session wall (as a public route) both apply.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
