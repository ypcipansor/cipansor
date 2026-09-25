/**
 * Print what a role sees: its dashboard and its sidebar menu, read from the
 * same code the app renders (`getNavigationForRoleCode`, `getDashboardForRole`).
 * Never copy a menu into a document — run this instead; a copied menu is wrong
 * by the next PR.
 *
 *   ../api/node_modules/.bin/tsx scripts/role-menus.ts                 # every demo account
 *   ../api/node_modules/.bin/tsx scripts/role-menus.ts SMPIT_TATA_USAHA
 *   ../api/node_modules/.bin/tsx scripts/role-menus.ts --families      # role codes grouped by the menu they share
 *
 * A menu item whose route the role's middleware would refuse is marked
 * `⛔ bounces` — a menu-vs-RBAC mismatch (see `.claude/memory/lessons/rbac-nav-contract.md`).
 */
import { DEMO_ACCOUNTS } from "@cipansor/shared";
import {
  getNavigationForRoleCode,
  type NavGroup,
  type NavItem,
} from "../src/config/navigation";
import {
  canAccessRoute,
  deriveLegacyRole,
  getDashboardForRole,
  type LegacyRole,
} from "../src/lib/rbac";

/**
 * The bucket middleware routes by. A RoleCode with no entry in
 * ROLE_CODE_TO_LEGACY (komite, alumni) falls back to the user's legacy
 * `role` column, which the seed fills as STAFF / STUDENT (`demoLegacyRoleFor`
 * in `apps/api/prisma/seed.ts`) — mirror that, or every item reads as refused.
 */
function bucketOf(roleCode: string): LegacyRole {
  return (
    deriveLegacyRole(roleCode) ??
    (roleCode.endsWith("_ALUMNI") ? "STUDENT" : "STAFF")
  );
}

function bounces(roleCode: string, href: string): boolean {
  return !canAccessRoute(
    bucketOf(roleCode),
    href.split("?")[0],
    roleCode,
  );
}

function printItems(roleCode: string, items: NavItem[], depth: number): void {
  for (const item of items) {
    const flag =
      item.href && bounces(roleCode, item.href) ? "  ⛔ bounces" : "";
    const href = item.href ? ` — \`${item.href}\`` : "";
    console.log(`${"  ".repeat(depth)}- ${item.title}${href}${flag}`);
    if (item.children?.length) printItems(roleCode, item.children, depth + 1);
  }
}

function printRole(roleCode: string, label?: string): void {
  const nav: NavGroup[] = getNavigationForRoleCode(roleCode);
  console.log(`\n## ${roleCode}${label ? ` — ${label}` : ""}\n`);
  console.log(
    `Dashboard: \`${getDashboardForRole(bucketOf(roleCode), roleCode)}\` · bucket: ${bucketOf(roleCode)}\n`,
  );
  for (const group of nav) {
    console.log(`**${group.title}**`);
    printItems(roleCode, group.items, 0);
  }
}

/** A stable fingerprint of a menu, so role codes that share one can be grouped. */
function fingerprint(roleCode: string): string {
  const walk = (items: NavItem[]): string[] =>
    items.flatMap((i) => [i.href ?? i.title, ...walk(i.children ?? [])]);
  return getNavigationForRoleCode(roleCode)
    .flatMap((g) => [g.title, ...walk(g.items)])
    .join("|");
}

const arg = process.argv[2];
if (arg === "--families") {
  const families = new Map<string, string[]>();
  for (const roleCode of new Set(DEMO_ACCOUNTS.map((a) => a.roleCode))) {
    const key = fingerprint(roleCode);
    families.set(key, [...(families.get(key) ?? []), roleCode]);
  }
  for (const codes of families.values()) {
    const first = getNavigationForRoleCode(codes[0]);
    const items = first.reduce((n, g) => n + g.items.length, 0);
    console.log(
      `- ${codes.join(", ")} — ${first.length} groups, ${items} top-level items`,
    );
  }
} else if (arg) {
  printRole(arg);
} else {
  for (const account of DEMO_ACCOUNTS)
    printRole(account.roleCode, account.group);
}
