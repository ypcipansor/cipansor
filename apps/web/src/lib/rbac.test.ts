import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  canAccessRoute,
  deriveLegacyRole,
  getDashboardForRole,
  getEffectiveRole,
  isLegacyRole,
  roleRouteAccess,
  type LegacyRole,
} from "./rbac";
import {
  getNavigationForRoleCode,
  type NavGroup,
} from "@/config/navigation";
import { DEMO_ACCOUNTS } from "@cipansor/shared";

/** All 81 RoleCodes, taken from the demo-account catalogue (one per role). */
const ALL_ROLE_CODES = DEMO_ACCOUNTS.map((a) => a.roleCode);

describe("rbac — legacy bucket derivation", () => {
  it("identifies the six legacy buckets", () => {
    for (const role of [
      "SUPER_ADMIN",
      "UNIT_ADMIN",
      "TEACHER",
      "STAFF",
      "STUDENT",
      "PARENT",
    ] as const) {
      expect(isLegacyRole(role)).toBe(true);
    }
    expect(isLegacyRole("SDIT_GURU")).toBe(false);
    expect(isLegacyRole(undefined)).toBe(false);
    expect(isLegacyRole(null)).toBe(false);
  });

  it("mirrors the backend deriveLegacyRole mapping", () => {
    // Admins + governance → UNIT_ADMIN
    expect(deriveLegacyRole("SDIT_ADMIN")).toBe("UNIT_ADMIN");
    expect(deriveLegacyRole("YAYASAN_BENDAHARA")).toBe("UNIT_ADMIN");
    expect(deriveLegacyRole("YAYASAN_KETUA")).toBe("UNIT_ADMIN");
    // Teachers + kepala sekolah + pesantren → TEACHER
    expect(deriveLegacyRole("SMPIT_GURU")).toBe("TEACHER");
    expect(deriveLegacyRole("TKQ_KEPALA_SEKOLAH")).toBe("TEACHER");
    expect(deriveLegacyRole("MUHAFIDZ")).toBe("TEACHER");
    // Tata usaha → STAFF
    expect(deriveLegacyRole("SMAQ_TATA_USAHA")).toBe("STAFF");
    // Students / parents
    expect(deriveLegacyRole("SDIT_SISWA")).toBe("STUDENT");
    expect(deriveLegacyRole("SMPIT_ORANG_TUA")).toBe("PARENT");
    // Identity for real legacy strings
    expect(deriveLegacyRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    // Unknown → undefined
    expect(deriveLegacyRole("SOME_FUTURE_ROLE")).toBeUndefined();
  });

  it("maps the expanded hierarchy (rebuilt #319) like the backend", () => {
    // Granular school roles
    expect(deriveLegacyRole("SDIT_WAKASEK")).toBe("TEACHER");
    expect(deriveLegacyRole("SMPIT_WALI_KELAS")).toBe("TEACHER");
    expect(deriveLegacyRole("SMAQ_GURU_BK")).toBe("TEACHER");
    expect(deriveLegacyRole("TKQ_BENDAHARA")).toBe("STAFF");
    // Pesantren leadership + gender-segregated pembina
    expect(deriveLegacyRole("PESANTREN_PENGASUH")).toBe("TEACHER");
    expect(deriveLegacyRole("USTADZ")).toBe("TEACHER");
    expect(deriveLegacyRole("MUSYRIFAH")).toBe("TEACHER");
    expect(deriveLegacyRole("MUHAFIDZAH")).toBe("TEACHER");
    expect(deriveLegacyRole("PESANTREN_TATA_USAHA")).toBe("STAFF");
    // Perguruan Tinggi
    expect(deriveLegacyRole("PT_REKTOR")).toBe("TEACHER");
    expect(deriveLegacyRole("PT_MAHASISWA")).toBe("STUDENT");
    expect(deriveLegacyRole("PT_TATA_USAHA")).toBe("STAFF");
    // Business units → STAFF, never an admin bucket
    expect(deriveLegacyRole("BUSINESS_MANAGER")).toBe("STAFF");
    expect(deriveLegacyRole("BUSINESS_STAFF")).toBe("STAFF");
    // Cross-unit support staff (library/UKS/security/labs)
    expect(deriveLegacyRole("PUSTAKAWAN")).toBe("STAFF");
    expect(deriveLegacyRole("PERAWAT")).toBe("STAFF");
    expect(deriveLegacyRole("KEAMANAN")).toBe("STAFF");
    expect(deriveLegacyRole("LABORAN")).toBe("STAFF");
    // Komite/alumni deliberately unmapped (RoleCode-native authorization)
    expect(deriveLegacyRole("SDIT_KOMITE")).toBeUndefined();
    expect(deriveLegacyRole("SMPIT_ALUMNI")).toBeUndefined();
  });
});

describe("rbac — getEffectiveRole", () => {
  it("prefers the legacy user.role bucket (backward compatible)", () => {
    expect(getEffectiveRole({ role: "SUPER_ADMIN" })).toBe("SUPER_ADMIN");
    expect(getEffectiveRole({ role: "PARENT" })).toBe("PARENT");
  });

  it("derives from the primary RoleCode assignment when role is absent", () => {
    const user = {
      userRoles: [
        { isPrimary: false, role: { code: "SDIT_SISWA" } },
        { isPrimary: true, role: { code: "SDIT_ORANG_TUA" } },
      ],
    };
    expect(getEffectiveRole(user)).toBe("PARENT");
  });

  it("falls back to the first assignment when none is primary", () => {
    const user = {
      userRoles: [{ role: { code: "SMPIT_GURU" } }],
    };
    expect(getEffectiveRole(user)).toBe("TEACHER");
  });

  it("derives from a RoleCode sitting in user.role", () => {
    expect(getEffectiveRole({ role: "YAYASAN_KETUA" })).toBe("UNIT_ADMIN");
  });

  it("returns undefined for empty/unknown input", () => {
    expect(getEffectiveRole(null)).toBeUndefined();
    expect(getEffectiveRole(undefined)).toBeUndefined();
    expect(getEffectiveRole({})).toBeUndefined();
    expect(getEffectiveRole({ role: "MYSTERY" })).toBeUndefined();
  });
});

describe("rbac — getDashboardForRole", () => {
  const cases: Array<[LegacyRole, string]> = [
    ["SUPER_ADMIN", "/dashboard"],
    ["UNIT_ADMIN", "/dashboard"],
    ["TEACHER", "/teacher"],
    ["STAFF", "/staff"],
    ["STUDENT", "/student"],
    ["PARENT", "/parent"],
  ];
  it.each(cases)("routes %s → %s", (role, dashboard) => {
    expect(getDashboardForRole(role)).toBe(dashboard);
  });
  it("defaults to /dashboard when role is undefined", () => {
    expect(getDashboardForRole(undefined)).toBe("/dashboard");
  });
});

describe("rbac — canAccessRoute", () => {
  it("super admin reaches every route", () => {
    expect(canAccessRoute("SUPER_ADMIN", "/anything/deep")).toBe(true);
    expect(canAccessRoute("SUPER_ADMIN", "/settings/roles")).toBe(true);
  });

  it("parent is confined to /parent", () => {
    expect(canAccessRoute("PARENT", "/parent")).toBe(true);
    expect(canAccessRoute("PARENT", "/parent/finance")).toBe(true);
    expect(canAccessRoute("PARENT", "/dashboard")).toBe(false);
    expect(canAccessRoute("PARENT", "/students")).toBe(false);
  });

  it("teacher can reach teaching routes but not foundation administration", () => {
    expect(canAccessRoute("TEACHER", "/teacher")).toBe(true);
    expect(canAccessRoute("TEACHER", "/tahfidz/murojaah")).toBe(true);
    // /settings is per-user preferences (appearance/language/notifications),
    // linked from the header menu for every signed-in user — not admin config.
    expect(canAccessRoute("TEACHER", "/settings")).toBe(true);
    expect(canAccessRoute("TEACHER", "/finance")).toBe(false);
    expect(canAccessRoute("TEACHER", "/units")).toBe(false);
    expect(canAccessRoute("TEACHER", "/procurement")).toBe(false);
  });

  it("unit admin can reach talenta (API authorizes UNIT_ADMIN on /talenta routes)", () => {
    expect(canAccessRoute("UNIT_ADMIN", "/talenta")).toBe(true);
    expect(canAccessRoute("UNIT_ADMIN", "/talenta/succession")).toBe(true);
  });

  it("staff can reach finance but not the teacher dashboard", () => {
    expect(canAccessRoute("STAFF", "/finance")).toBe(true);
    expect(canAccessRoute("STAFF", "/teacher")).toBe(false);
  });

  it("student is confined to student routes", () => {
    expect(canAccessRoute("STUDENT", "/student")).toBe(true);
    expect(canAccessRoute("STUDENT", "/schedule")).toBe(true);
    expect(canAccessRoute("STUDENT", "/finance")).toBe(false);
  });

  it("denies when role is undefined", () => {
    expect(canAccessRoute(undefined, "/dashboard")).toBe(false);
  });

  it("every non-super role has a non-empty allow list", () => {
    (
      Object.keys(roleRouteAccess) as LegacyRole[]
    ).forEach((role) => {
      expect(roleRouteAccess[role].length).toBeGreaterThan(0);
    });
  });
});

describe("rbac — navigation and route access stay in sync", () => {
  // These two files are one contract seen from both ends: navigation.ts decides
  // what a role is shown, rbac.ts decides what it may open. When they drift the
  // sidebar renders links that bounce the user to /unauthorized — which is
  // exactly what happened before this suite existed (188 of 292 links dead).
  const navToBucket: Array<[NavGroup[], LegacyRole]> = [
    [getNavigationForRoleCode("SUPER_ADMIN"), "SUPER_ADMIN"],
    [getNavigationForRoleCode("YAYASAN_KETUA"), "UNIT_ADMIN"],
    [getNavigationForRoleCode("SMPIT_GURU"), "TEACHER"],
    [getNavigationForRoleCode("SMPIT_KEPALA_SEKOLAH"), "TEACHER"],
    [getNavigationForRoleCode("PESANTREN_PENGASUH"), "TEACHER"],
    [getNavigationForRoleCode("MUSYRIF"), "TEACHER"],
    [getNavigationForRoleCode("PT_REKTOR"), "TEACHER"],
    [getNavigationForRoleCode("PT_DOSEN"), "TEACHER"],
    [getNavigationForRoleCode("SMPIT_TATA_USAHA"), "STAFF"],
    [getNavigationForRoleCode("SDIT_KOMITE"), "STAFF"],
    [getNavigationForRoleCode("SMPIT_SISWA"), "STUDENT"],
    [getNavigationForRoleCode("PT_MAHASISWA"), "STUDENT"],
    [getNavigationForRoleCode("SMPIT_ALUMNI"), "STUDENT"],
    [getNavigationForRoleCode("SMPIT_ORANG_TUA"), "PARENT"],
  ];

  it.each(navToBucket)(
    "every rendered sidebar link is reachable by its bucket",
    (nav, bucket) => {
      const unreachable = nav
        .flatMap((group) => group.items.map((item) => item.href))
        .filter((href) => !canAccessRoute(bucket, href));
      expect(unreachable).toEqual([]);
    },
  );

  it("gives every one of the 81 RoleCodes a real menu, not the stub", () => {
    // The fallback nav is Dashboard + Notifications + Settings. Any RoleCode
    // landing on it has simply been forgotten.
    const stubSize = 3;
    const forgotten = ALL_ROLE_CODES.filter((code) => {
      const nav = getNavigationForRoleCode(code);
      const items = nav.flatMap((g) => g.items);
      return items.length <= stubSize;
    });
    expect(forgotten).toEqual([]);
  });
});

describe("navigation — every menu link points at a page that exists", () => {
  // /foundation/board shipped in the Yayasan sidebar with no page behind it.
  // Because Next prefetches sidebar links, that 404 fired on *every* page load
  // for those roles. Walk the app directory so a missing page fails here first.
  const APP_DIR = path.join(process.cwd(), "src", "app");

  function routeExists(href: string): boolean {
    const segments = href.split("/").filter(Boolean);
    let dir = APP_DIR;
    for (const segment of segments) {
      const literal = path.join(dir, segment);
      if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) {
        dir = literal;
        continue;
      }
      // fall back to a dynamic segment ([id], [slug], ...)
      const dynamic = fs
        .readdirSync(dir, { withFileTypes: true })
        .find((e) => e.isDirectory() && e.name.startsWith("["));
      if (!dynamic) return false;
      dir = path.join(dir, dynamic.name);
    }
    return fs.existsSync(path.join(dir, "page.tsx"));
  }

  const ROLE_SAMPLE = [
    "SUPER_ADMIN",
    "YAYASAN_KETUA",
    "SMPIT_GURU",
    "SMPIT_KEPALA_SEKOLAH",
    "PESANTREN_PENGASUH",
    "MUSYRIF",
    "PT_REKTOR",
    "PT_DOSEN",
    "PT_MAHASISWA",
    "SMPIT_TATA_USAHA",
    "SDIT_KOMITE",
    "SMPIT_SISWA",
    "SMPIT_ALUMNI",
    "SMPIT_ORANG_TUA",
  ];

  it.each(ROLE_SAMPLE)("%s has no dead menu links", (roleCode) => {
    const dead = getNavigationForRoleCode(roleCode)
      .flatMap((group) => group.items.map((item) => item.href))
      .filter((href) => !routeExists(href));
    expect(dead).toEqual([]);
  });

  it.each(ROLE_SAMPLE)("%s lists no route twice", (roleCode) => {
    const hrefs = getNavigationForRoleCode(roleCode).flatMap((group) =>
      group.items.map((item) => item.href),
    );
    const duplicated = [...new Set(hrefs)].filter(
      (href) => hrefs.filter((h) => h === href).length > 1,
    );
    expect(duplicated).toEqual([]);
  });
});

describe("navigation — every menu link is one its own role may open", () => {
  // The guard above enforces menu -> page: the link resolves to a file. It
  // says nothing about menu -> permission, and middleware.ts gates on
  // canAccessRoute. A link can therefore exist, render, and bounce the user
  // straight back to their dashboard — which is the exact complaint
  // ("missing permission / route not found") this whole contract exists to
  // prevent, arriving through the other door.
  //
  // This bites: before /tk, /payroll, /perencanaan, /grc-dashboard,
  // /pengawasan, /syariah, /tata-laksana, /organisasi, /unit-usaha, /project
  // and /cbt/exams were added to UNIT_ADMIN, the four unit-admin RoleCodes
  // each had 18 dead links here — the whole TK/PAUD module among them, shown
  // to TKQ_ADMIN, the role that runs the TK unit.
  //
  // Note this iterates ALL RoleCodes, not a sample. The sampled guards above
  // never covered a unit admin, so the admin navigation was only ever
  // exercised as SUPER_ADMIN, whose allowlist is ["*"] and cannot fail.
  it.each(ALL_ROLE_CODES)("%s can open every link in its own menu", (roleCode) => {
    const legacy = deriveLegacyRole(roleCode);
    if (!legacy) return; // komite/alumni reach the app via user.role, not a bucket

    const unopenable = [
      ...new Set(
        getNavigationForRoleCode(roleCode)
          .flatMap((group) => group.items.map((item) => item.href))
          .filter((href) => !canAccessRoute(legacy, href)),
      ),
    ];

    expect(unopenable).toEqual([]);
  });
});

describe("navigation — every app page is reachable from some menu", () => {
  // The contract above only enforces menu -> page (no dead links). Nothing
  // enforced the reverse, so 34 top-level pages — the entire TK/PAUD module,
  // the payroll screens, Perencanaan (RPJP/Renstra/RKA), the GRC dashboard,
  // the accounting reports — shipped with no menu entry for ANY of the 81
  // roles and were reachable only by typing the URL. This closes that
  // direction: a new page must either appear in a menu or say why it doesn't.
  const APP_DIR = path.join(process.cwd(), "src", "app");

  /** Pages that intentionally have no sidebar entry, with the reason. */
  const NO_MENU_BY_DESIGN: Record<string, string> = {
    "/profile": "opened from the header profile menu, not the sidebar",
    "/ppdb": "legacy duplicate of /admissions, pending the SPMB route rename",
    "/ppdb/registrations":
      "legacy duplicate of /admissions, pending the SPMB route rename",
    "/hr/talenta/succession":
      "standalone copy of the Succession Planning tab already on /hr/talenta; " +
      "kept only for links already sent out, and a deletion candidate",
  };

  /** Reached from a list page's action button, never from a menu. */
  const ACTION_PAGE = /\/(new|create|edit|generate|bulk|check-in)$/;

  /**
   * True when some *other* page links straight at this route, via `href="/x"`
   * or `router.push("/x")`.
   *
   * Without this the test equates "reachable" with "close to a menu entry" — a
   * menu href, or the child of one. That misses a page whose hub links to it
   * from two levels down, which is how /tahfidz/murojaah/schedule came up as
   * orphaned once its hub grew a button pointing at it.
   */
  const linkedFrom = (route: string): boolean =>
    appPages().some(({ route: from, file }) => {
      if (from === route) return false; // a page linking to itself proves nothing
      const target = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `(?:href=|router\\.(?:push|replace)\\()\\s*\\{?["'\`]${target}["'\`]`,
      ).test(fs.readFileSync(file, "utf8"));
    });

  function appPages(): Array<{ route: string; file: string }> {
    const found: Array<{ route: string; file: string }> = [];
    const walk = (dir: string, segments: string[]) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(dir, entry.name);
        // Route groups — (auth), (dashboard) — do not appear in the URL.
        const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
        const next = isGroup ? segments : [...segments, entry.name];
        const page = path.join(child, "page.tsx");
        if (fs.existsSync(page)) found.push({ route: `/${next.join("/")}`, file: page });
        walk(child, next);
      }
    };
    walk(APP_DIR, []);
    return found;
  }

  const menuHrefs = new Set(
    ALL_ROLE_CODES.flatMap((roleCode) =>
      getNavigationForRoleCode(roleCode).flatMap((group) =>
        group.items.map((item) => item.href),
      ),
    ),
  );

  it("no authenticated page is orphaned from every role's menu", () => {
    const orphans = appPages()
      .filter(({ route }) => !route.includes("[")) // dynamic detail page
      .filter(({ route }) => !ACTION_PAGE.test(route))
      .filter(({ route }) => !(route in NO_MENU_BY_DESIGN))
      .filter(({ route }) => !menuHrefs.has(route))
      // a sub-page is reachable as a tab/section of the hub above it
      .filter(({ route }) => !menuHrefs.has(route.slice(0, route.lastIndexOf("/")) || "/"))
      // only pages that render the authenticated shell are menu candidates
      .filter(({ file }) => fs.readFileSync(file, "utf8").includes("MainLayout"))
      // ...or a page links straight to it, menu or no menu
      .filter(({ route }) => !linkedFrom(route))
      .map(({ route }) => route);

    expect(orphans).toEqual([]);
  });
});

describe("navigation — every page renders the app shell", () => {
  // `MainLayout` supplies the sidebar, the header (profile menu + logout) and
  // `ProtectedRoute`. 50 pages a user could actually reach rendered none of it:
  // they opened as a bare div with no way back out except the browser's back
  // button. Seven were linked straight from a menu; the rest were sub-pages of
  // a hub that is. Pages self-wrap, EXCEPT under a route segment whose
  // layout.tsx supplies the shell for its whole subtree — check that first, or
  // all 14 /parent/* pages look broken when they are fine.
  const APP_DIR = path.join(process.cwd(), "src", "app");
  const MIDDLEWARE = path.join(process.cwd(), "middleware.ts");

  /**
   * Public marketing pages, read out of middleware.ts so the two cannot drift.
   * These must NOT be wrapped: MainLayout implies ProtectedRoute, so wrapping
   * one bounces an anonymous visitor to the staff login — the exact regression
   * that got the Google Ad Grants application rejected once already.
   */
  const publicPrefixes: string[] = (() => {
    const src = fs.readFileSync(MIDDLEWARE, "utf8");
    const block = src.match(/const publicPrefixes\s*=\s*\[([\s\S]*?)\n\];/);
    if (!block) throw new Error("publicPrefixes not found in middleware.ts");
    return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  })();

  // `/public/*` never reaches the list above: middleware's own matcher excludes
  // it, so it is public without being named in publicPrefixes. Reading only
  // publicPrefixes therefore under-counts what may be seen without a session.
  const isPublic = (route: string) =>
    route === "/public" ||
    route.startsWith("/public/") ||
    publicPrefixes.some((p) => route === p || route.startsWith(`${p}/`));

  /** Route segments whose layout.tsx renders MainLayout for the whole subtree. */
  const shellLayouts: string[] = (() => {
    const found: string[] = [];
    const walk = (dir: string, segments: string[]) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(dir, entry.name);
        const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
        const next = isGroup ? segments : [...segments, entry.name];
        const layout = path.join(child, "layout.tsx");
        if (
          fs.existsSync(layout) &&
          fs.readFileSync(layout, "utf8").includes("MainLayout")
        ) {
          found.push(`/${next.join("/")}`);
        }
        walk(child, next);
      }
    };
    walk(APP_DIR, []);
    return found;
  })();

  const hasLayoutShell = (route: string) =>
    shellLayouts.some((l) => route === l || route.startsWith(`${l}/`));

  /**
   * A redirect-only stub renders nothing, so there is no shell to put around
   * it — /finance/billing just forwards its old bookmarks to /finance.
   *
   * Both forms count. /psb does the same job with `router.replace()` in an
   * effect rather than the server `redirect()`, and matching only the latter
   * made a stub look like a page that had lost its shell.
   */
  const isRedirectStub = (src: string) =>
    /from\s+"next\/navigation"/.test(src) &&
    (/\bredirect\(/.test(src) || /\brouter\.(replace|push)\(/.test(src)) &&
    src.length < 2000;

  /**
   * Pages that correctly render no shell, each with the reason. Anything not
   * listed here must wrap itself — including `[id]` routes and grandchildren,
   * which the first version of this test skipped.
   */
  const NO_SHELL_BY_DESIGN: Record<string, string> = {
    "/login": "the page you reach when you have no session to build a shell for",
    "/reset-password":
      "reached from an emailed link with no session — same reason as /login",
    "/unauthorized": "an error page; its own link back is the way out",
    "/assessment/raport-merdeka/[studentId]/[academicYearId]/[semester]":
      "print view — sidebar and header must not reach the paper",
    "/assessment/report-cards/[id]/print-merdeka": "print view",
    "/assessment/skhun/[studentId]/[academicYearId]": "print view",
    "/assessment/transcript/[studentId]": "print view",
    "/assessment/unified-raport/[studentId]": "print view",
    "/rapor-pesantren/[id]": "print view",
    "/rapor-pesantren/print/[id]": "print view",
    "/rapor-pesantren/unified/[id]": "print view",
  };

  it("no page renders without the sidebar/header shell", () => {
    // The predecessor of this test passed while 63 pages were broken. It
    // skipped every route with a `[param]` segment — most detail pages, the
    // ones you reach by clicking a table row — and only looked at pages whose
    // route or immediate parent was a menu href, so a grandchild like
    // /library/books/new fell straight through. Both exclusions are gone: the
    // only way to say a page needs no shell is to name it above.
    const shellless: string[] = [];
    const walk = (dir: string, segments: string[]) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(dir, entry.name);
        const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
        const next = isGroup ? segments : [...segments, entry.name];
        const page = path.join(child, "page.tsx");
        if (fs.existsSync(page)) {
          const route = `/${next.join("/")}`;
          const src = fs.readFileSync(page, "utf8");
          if (
            !isPublic(route) &&
            !hasLayoutShell(route) &&
            !isRedirectStub(src) &&
            !(route in NO_SHELL_BY_DESIGN) &&
            !src.includes("MainLayout")
          ) {
            shellless.push(route);
          }
        }
        walk(child, next);
      }
    };
    walk(APP_DIR, []);
    expect(shellless).toEqual([]);
  });

  it("every NO_SHELL_BY_DESIGN entry still points at a real page", () => {
    const missing = Object.keys(NO_SHELL_BY_DESIGN).filter(
      (route) => !fs.existsSync(path.join(APP_DIR, route, "page.tsx")),
    );
    expect(missing).toEqual([]);
  });
});

describe("a11y — exactly one <main> landmark, and the skip link reaches it", () => {
  // The root layout used to render <main id="main-content">{children}</main>,
  // which wrapped the sidebar as well. MainLayout renders its own
  // <main id="main-content"> inside that, so two elements shared one id;
  // document.getElementById returned the outer one, and "Loncat ke konten
  // utama" landed above the navigation and skipped nothing. Measured live in
  // production: 2 <main>, 2 skip links with different labels.
  //
  // A landmark can now arrive three ways, and all three have to be counted or
  // this test lies: the page renders <main> itself, it renders a component
  // that does, or an ancestor layout.tsx does either.
  const SRC_DIR = path.join(process.cwd(), "src");
  const APP_DIR = path.join(SRC_DIR, "app");
  const ROOT_LAYOUT = path.join(APP_DIR, "layout.tsx");

  const uncomment = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const read = (f: string) => uncomment(fs.readFileSync(f, "utf8"));

  // Counting "<main>" is not enough: the landing page rendered one *without*
  // the id, so removing the root layout's left document.getElementById
  // returning null and the skip link doing nothing at all. The landmark and
  // the skip target have to be the same element, so count the id.
  const landmarksIn = (file: string): number =>
    fs.existsSync(file)
      ? (read(file).match(/<main\b[^>]*\bid="main-content"/g) || []).length
      : 0;

  /** Resolve a relative or @/-aliased import to a file under src/. */
  const resolveImport = (from: string, spec: string): string | null => {
    const base = spec.startsWith("@/")
      ? path.join(SRC_DIR, spec.slice(2))
      : spec.startsWith(".")
        ? path.resolve(path.dirname(from), spec)
        : null;
    if (!base) return null;
    for (const cand of [
      `${base}.tsx`,
      `${base}.ts`,
      path.join(base, "index.tsx"),
      path.join(base, "index.ts"),
    ]) {
      if (fs.existsSync(cand)) return cand;
    }
    return null;
  };

  /** Landmarks a file contributes, following its local imports. */
  const landmarkCount = (file: string, seen = new Set<string>()): number => {
    if (!fs.existsSync(file) || seen.has(file)) return 0;
    seen.add(file);
    const src = read(file);
    let total = landmarksIn(file);
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
      const dep = resolveImport(file, m[1]);
      if (dep) total += landmarkCount(dep, seen);
    }
    return total;
  };

  // Pages that redirect on mount render nothing to land on.
  const isRedirectStub = (src: string) =>
    /from\s+"next\/navigation"/.test(src) &&
    (/\bredirect\(/.test(src) || /\brouter\.(replace|push)\(/.test(src)) &&
    src.length < 2000;

  function pageFiles(dir: string): string[] {
    // The page.tsx in `dir` itself counts. Only walking subdirectories misses
    // src/app/page.tsx — the landing page, which is exactly the one that
    // shipped with a <main> carrying no id and a skip link pointing nowhere.
    const here = path.join(dir, "page.tsx");
    return [
      ...(fs.existsSync(here) ? [here] : []),
      ...fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (!e.isDirectory()) return [];
        return pageFiles(path.join(dir, e.name));
      }),
    ];
  }

  it("the root layout does not render a <main>", () => {
    // Putting it back would reintroduce the duplicate id on every shell page.
    expect(uncomment(fs.readFileSync(ROOT_LAYOUT, "utf8"))).not.toMatch(
      /<main[\s>]/,
    );
  });

  it("every page renders exactly one <main id=\"main-content\">", () => {
    // Zero means the skip link has no target and silently does nothing.
    // Two means nested or duplicated landmarks and a duplicate id, so
    // getElementById picks whichever comes first in the document.
    const wrong = pageFiles(APP_DIR)
      .filter((page) => !isRedirectStub(fs.readFileSync(page, "utf8")))
      .map((page) => {
        let count = landmarkCount(page);
        let dir = path.dirname(page);
        for (;;) {
          const layout = path.join(dir, "layout.tsx");
          if (layout !== ROOT_LAYOUT) count += landmarkCount(layout);
          if (dir === APP_DIR) break;
          dir = path.dirname(dir);
        }
        return { page: path.relative(APP_DIR, page), count };
      })
      .filter(({ count }) => count !== 1);
    expect(wrong).toEqual([]);
  });

  it("every <main> carries id=\"main-content\"", () => {
    // The count above only sees landmarks that have the id, so a bare <main>
    // nested inside an id'd one would slip past it — which is what
    // spmb-form.tsx and donation-portal.tsx were doing. A <main> without the
    // id is either an invalid second landmark or a skip target that isn't one.
    const walkTsx = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const child = path.join(dir, e.name);
        if (e.isDirectory()) return walkTsx(child);
        return /\.tsx$/.test(e.name) ? [child] : [];
      });
    const bare = walkTsx(SRC_DIR)
      .flatMap((f) =>
        (read(f).match(/<main\b[^>]*>/g) || [])
          .filter((tag) => !/\bid="main-content"/.test(tag))
          .map(() => path.relative(SRC_DIR, f)),
      )
      .filter((f) => !f.startsWith("lib/"));
    expect(bare).toEqual([]);
  });

  it("nobody hand-rolls a second skip link", () => {
    // Two links to #main-content with different labels ("Loncat ke konten
    // utama" from the root layout's <SkipLink />, "Langsung ke konten"
    // hand-written in MainLayout) is one more than a keyboard user should
    // have to tab past. SkipLink itself builds its href from a template
    // literal, so a literal "#main-content" href means a second one.
    const srcDir = path.join(process.cwd(), "src");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const child = path.join(dir, e.name);
        if (e.isDirectory()) return walk(child);
        return /\.tsx$/.test(e.name) ? [child] : [];
      });
    const handRolled = walk(srcDir)
      .filter((f) =>
        /href=\{?["'`]#main-content/.test(uncomment(fs.readFileSync(f, "utf8"))),
      )
      .map((f) => path.relative(srcDir, f));
    expect(handRolled).toEqual([]);
  });

  it("SkipLink still aims at the landmark the pages render", () => {
    // The guard above only proves there is one skip link. This proves it
    // points somewhere: its default target and the id MainLayout renders.
    const skip = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "shared", "accessibility.tsx"),
      "utf8",
    );
    expect(skip).toMatch(/targetId\s*=\s*"main-content"/);
    const shell = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "layout", "main-layout.tsx"),
      "utf8",
    );
    expect(shell).toMatch(/<main\b[\s\S]{0,120}?id="main-content"/);
  });
});

describe("a11y — the app shell leaves the <h1> to the page", () => {
  // The header used to render the unit name as an <h1>. Every shell page
  // therefore had two: the site's, first in the DOM, and the page's own from
  // PageHeader. That reads as "this page is titled Sistem Informasi Cipansor"
  // to a screen reader, and it broke `page.locator("h1")` in e2e the moment
  // #406 gave 63 more pages the shell (two matches = strict mode violation).
  // Site identity belongs to the banner landmark, not to a heading.
  const LAYOUT_DIR = path.join(process.cwd(), "src", "components", "layout");

  function tsxFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const child = path.join(dir, e.name);
      if (e.isDirectory()) return tsxFiles(child);
      return e.name.endsWith(".tsx") ? [child] : [];
    });
  }

  // Comments explaining why a file has no <h1> would otherwise trip the check.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("no app-shell component renders an <h1>", () => {
    const offenders = tsxFiles(LAYOUT_DIR)
      .filter((file) =>
        /<h1[\s>]/.test(stripComments(fs.readFileSync(file, "utf8"))),
      )
      .map((file) => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it("PageHeader is still the thing that renders the <h1>", () => {
    // Guards the other direction: demoting the header's heading only helps if
    // the page still has one, otherwise the pages have no <h1> at all.
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "shared", "page-header.tsx"),
      "utf8",
    );
    expect(src).toMatch(/<h1[\s>]/);
  });
});

describe("e2e selectors — no loose text= selector can collide with the sidebar", () => {
  // `page.locator("text=UA")` is Playwright's *unquoted* text engine: a
  // case-insensitive SUBSTRING match, not an exact one. It also matched
  // "Konsolidasi Keuangan", "Aduan & Aspirasi", "Pesan Orang Tua" — and the
  // sidebar precedes the content in the DOM, so `.first()` returned a menu
  // button. The assertion only passed while /hr/talenta rendered without the
  // app shell; giving that page its shell (#368) broke the test on every
  // browser. The bug is in the selector, not the layout, so guard the selector.
  const E2E_DIR = path.join(process.cwd(), "e2e");

  const navTitles = ALL_ROLE_CODES.flatMap((rc) =>
    getNavigationForRoleCode(rc).flatMap((g) => [
      g.title,
      ...g.items.map((i) => i.title),
    ]),
  ).map((t) => t.toLowerCase());

  function specFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const child = path.join(dir, e.name);
      if (e.isDirectory()) return specFiles(child);
      return e.name.endsWith(".spec.ts") ? [child] : [];
    });
  }

  it("no unquoted text= selector is a substring of any sidebar label", () => {
    const collisions: string[] = [];
    for (const file of specFiles(E2E_DIR)) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/locator\(\s*"text=([^"]+)"/g)) {
        const needle = m[1].toLowerCase().trim();
        // Quoted forms (text="UA") are exact matches and cannot collide.
        if (needle.startsWith("'") || needle.startsWith('"')) continue;
        const hits = navTitles.filter((t) => t.includes(needle));
        if (hits.length) {
          collisions.push(
            `${path.relative(process.cwd(), file)}: text=${m[1]} also matches sidebar ${[...new Set(hits)].join(", ")}`,
          );
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});

/**
 * Correspondence reaches every internal role, and no external one.
 *
 * Naskah dinas is not one office's tool: a guru raises a permit, tata usaha
 * registers what arrives, a kepala sekolah parafs, the ketua yayasan signs.
 * Anyone on the staff side has some part in it, so the menu entry belongs in
 * every internal role's navigation — while santri, orang tua, komite and alumni
 * have no business inside the yayasan's internal correspondence at all.
 *
 * Asserted per RoleCode against the real navigation the app builds, so this
 * stays true when a role is added or its tree is rearranged — not against the
 * literal arrays, which is where a drift would hide.
 */
describe("e-office menu coverage", () => {
  const INTERNAL = [
    "SUPER_ADMIN",
    "YAYASAN_KETUA",
    "YAYASAN_SEKRETARIS",
    "YAYASAN_BENDAHARA",
    "YAYASAN_PEMBINA",
    "YAYASAN_PENGAWAS",
    "SMPIT_ADMIN",
    "SMPIT_KEPALA_SEKOLAH",
    "SMPIT_WAKASEK",
    "SMPIT_GURU",
    "SMPIT_WALI_KELAS",
    "SMPIT_TATA_USAHA",
    "SMPIT_BENDAHARA",
    "TKQ_GURU",
    "TKQ_TATA_USAHA",
    "PESANTREN_DIREKTUR",
    "PESANTREN_PENGASUH",
    "PESANTREN_TATA_USAHA",
    "USTADZ",
    "MUSYRIF",
    "PT_REKTOR",
    "PT_DEKAN",
    "PT_DOSEN",
    "PT_TATA_USAHA",
    "PUSTAKAWAN",
    "PERAWAT",
  ];

  /** No part in the yayasan's internal correspondence. */
  const EXTERNAL = [
    "SMPIT_SISWA",
    "SMAQ_SISWA",
    "PT_MAHASISWA",
    "SMPIT_ORANG_TUA",
    "TKQ_ORANG_TUA",
    "SMPIT_KOMITE",
    "SMPIT_ALUMNI",
    "PT_ALUMNI",
  ];

  function hasEOffice(roleCode: string): boolean {
    return getNavigationForRoleCode(roleCode).some((group) =>
      group.items.some((item) => item.href === "/e-office"),
    );
  }

  it.each(INTERNAL)("%s sees E-Office in the sidebar", (roleCode) => {
    expect(hasEOffice(roleCode)).toBe(true);
  });

  it.each(EXTERNAL)("%s does not", (roleCode) => {
    expect(hasEOffice(roleCode)).toBe(false);
  });

  /**
   * A menu entry that the route guard then refuses is worse than no entry: the
   * user clicks their own sidebar and lands on /unauthorized.
   */
  it.each(INTERNAL)("%s is also allowed through to /e-office", (roleCode) => {
    const legacy = roleCode === "SUPER_ADMIN" ? "SUPER_ADMIN" : deriveLegacyRole(roleCode);
    expect(legacy, `${roleCode} has no legacy role mapping`).toBeTruthy();
    expect(canAccessRoute(legacy as never, "/e-office")).toBe(true);
  });
});
