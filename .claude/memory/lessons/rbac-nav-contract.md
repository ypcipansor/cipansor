# rbac-nav-contract

> `navigation.ts` (what a role is shown) and `rbac.ts` (what it may open) are one contract seen from both ends. How they drifted, the three directions the tests now check, and the ways those tests go blind.

`apps/web/src/config/navigation.ts` decides what a role is **shown**;
`apps/web/src/lib/rbac.ts` (`roleRouteAccess`, used by `apps/web/middleware.ts`)
decides what it may **open**. On 2026-07-21 **188 of 292 sidebar links were
dead** — the app drew menus that bounced their own users to the dashboard.
**If you add a nav item, add its prefix to `roleRouteAccess`.**

## Traps found the hard way

- `canAccessRoute` matched raw string prefixes, so `/student` granted
  `/students` — the whole roster to every student. Match on segment
  boundaries: `p === route || p.startsWith(route + "/")`.
- `getNavigationForRoleCode` silently falls back to a 3-item stub. A quarter
  of the RoleCodes hit it — a forgotten role looks like a working one.
- Komite and alumni are **deliberately absent** from `ROLE_CODE_TO_LEGACY`
  (the backend authorizes them RoleCode-natively). A test asserts the omission.
- The login page hard-coded `router.push("/dashboard")` and only looked right
  because middleware bounced roles that could not reach it. Resolve the landing
  route with `getDashboardForRole(role, roleCode)`.
- Next **prefetches sidebar links**, so one dead nav href 404s on every page
  load for that role.
- **Route access comes from the active primary assignment, not the
  `users.role` column** (2026-09-11). The column always holds a legacy value;
  yayasan accounts had `STAFF` there while their assignment was `YAYASAN_*`, so
  the API served them and the web bounced them. The assignment wins now; the
  column is only a fallback.

## The three directions, all in `apps/web/src/lib/rbac.test.ts`

1. **menu → page** — every menu link resolves to a real `page.tsx`, reachable
   by its bucket, not duplicated.
2. **page → menu** (#366) — a page rendering `MainLayout` must be in some
   role's menu, be a sub-page of one that is, be an action page
   (`new|create|edit|generate|bulk|check-in`), or sit in `NO_MENU_BY_DESIGN`
   with a written reason. Before it, 34 top-level pages — the whole TK/PAUD
   module among them — were reachable by URL only.
3. **menu → permission** (#383) — iterating **every** RoleCode, not a
   hand-picked sample: each role may open each link in its own menu. The four
   unit-admin roles had 18 links each that bounced them; the hand-picked
   samples had simply included no unit admin.

A fourth guard fails a reachable page that renders without the shell, reading
`publicPrefixes` straight out of `middleware.ts` so the two cannot drift.

## How the guards go blind

- **Nested menus.** Every guard flattened `groups.flatMap(g => g.items…)` —
  one level. Once `NavItem.children` held real submenus, every nested link
  escaped all three directions at once. One recursive walker now feeds all six
  check sites:
  ```ts
  const walk = (items: NavGroup["items"]): string[] =>
    items.flatMap(i => [i.href, ...walk(i.children ?? [])]);
  ```
  Adding a new container shape to `navigation.ts` means updating **every**
  place that flattens the menu.
- **A parent whose children are all filtered out stays, as a plain link**
  (`filterNavItemsByRoleCode` keeps the parent and drops empty `children`). A
  filter that removed such parents took *Settings* and *Users & Roles* away
  from the unit admins, and page → menu could not see it because the Super
  Admin still saw both.
- **Verify a guard bites** — run it against the pre-fix config and watch it
  fail. A filter that is too permissive passes vacuously.

**Adding the shell can break loose e2e selectors.** Playwright's unquoted
`text=UA` is a case-insensitive substring match, and once a page gains its
sidebar, `.first()` returns a nav label ("Konsolidasi Keuangan"). Scope to
`getByRole("main")` with `{ exact: true }`; a test now checks every unquoted
`text=` in `e2e/` against every role's sidebar labels.

See [api-integration-traps](./api-integration-traps.md); the menu shape itself
is [a decision](../decisions/menu-ia-tiga-tingkat.md).
