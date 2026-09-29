/**
 * Session cookie names, shared by the API that issues them and the web edge
 * that reads one of them.
 *
 * The session itself lives in `HttpOnly` cookies the page's JavaScript cannot
 * read. One of them, `PRINCIPAL_COOKIE`, is different: it holds no credential,
 * only the primary role the Next middleware needs to route a request before the
 * app renders. Having the name here keeps the API (which writes it) and the web
 * middleware (which reads it) from drifting — a name typed on one side and
 * imagined on the other is how the routing silently stops working.
 *
 * The value shape is `PrincipalClaims`. It is deliberately NOT signed: the API,
 * not the middleware, is the enforcement point (a page let through with a stale
 * or forged value still gets 401 on its first API call). The middleware reads it
 * only to choose the right dashboard and to gate menus, the same job the
 * client-written `auth-storage` cookie did before this migration.
 */
export const ACCESS_COOKIE = "cipansor_at";
export const REFRESH_COOKIE = "cipansor_rt";
export const CSRF_COOKIE = "cipansor_csrf";
export const PRINCIPAL_COOKIE = "cipansor_principal";

/** What the routing cookie carries — only what `middleware.ts` reads. */
export interface PrincipalClaims {
  id: string;
  /** The legacy bucket the rbac maps are keyed on (e.g. "UNIT_ADMIN"). */
  role: string;
  /** The granular RoleCode (e.g. "SDIT_ADMIN"), for role-specific pages. */
  roleCode: string;
}
