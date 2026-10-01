/**
 * Resolve every dynamic App Router pattern to a concrete URL using seeded data,
 * so `screenshot-all.ts` can capture pages that no index link points at
 * (detail/edit/assign/print screens reachable only by typing the URL).
 *
 * Run before the sweep and write the resolved list to scripts/dynamic-routes.json:
 *   ../api/node_modules/.bin/tsx scripts/resolve-dynamic-routes.ts
 *
 * Strategy: for each pattern, fetch the list endpoint that owns the first
 * `[param]` (the pattern with the trailing action segment removed), take a
 * seeded id from it, and for a second `[param]` look for a nested id on the
 * parent detail endpoint. HINTS covers the cases where the URL shape and the
 * API shape genuinely differ.
 */

import fs from "fs";
import path from "path";
import { DEMO_ACCOUNTS } from "@cipansor/shared";

const API_URL = process.env.API_URL || "http://localhost:3001/api";
const APP_DIR = path.join(__dirname, "../src/app");

interface Hint {
  /** Endpoint that returns the id for this pattern's first param. */
  list?: string;
  /** Function to pull an id out of a list response. */
  pick?: (rows: any[]) => string | undefined;
  /** Fixed values for params the API can't hand us (enum-shaped path segments). */
  fixed?: Record<string, string>;
  /**
   * Values appended as a query string (`?k=v`). `"activeAcademicYear"` is
   * substituted with the currently active academic year's id.
   */
  query?: Record<string, string>;
  /**
   * Query params applied to the **list** fetch itself, not just the final URL.
   * `"activeAcademicYear"` is substituted; `"unitWithRow"` is replaced with the
   * first of the seeded units whose list call actually returns a row (the audit
   * and risk modules are unit-scoped and the seed only populates one unit).
   */
  listQuery?: Record<string, string>;
  /**
   * Escape hatch for patterns whose id can only be found by walking a non-list
   * endpoint (e.g. a CBT attempt id that only the exam-monitoring payload
   * exposes). Return the full URL, or `null` to leave the pattern unresolved.
   */
  custom?: (bearer: string) => Promise<string | null>;
  /** Nested params: resolved from the parent detail response. */
  nested?: Record<
    string,
    { path: string; pick: (row: any) => string | undefined }
  >;
}

const HINTS: Record<string, Hint> = {
  // URL prefix and API prefix differ for these — point the resolver at the
  // endpoint the corresponding web hook actually calls.
  "/e-office/letter/[id]": { list: "/correspondence/letters" },
  // The page calls `/hr/employees/:id`, which looks up by **User** id, while the
  // list endpoint hands back Staff ids. Pick the userId off the staff row.
  "/hr/employees/[id]": {
    list: "/hr/staff",
    pick: (rows) => rows.find((r) => r?.userId)?.userId,
  },
  "/hr/employees/[id]/edit": {
    list: "/hr/staff",
    pick: (rows) => rows.find((r) => r?.userId)?.userId,
  },
  "/litbang/[id]": { list: "/litbang/projects" },
  "/organisasi/posisi/[id]": { list: "/organisasi/positions" },
  // URL says `board`, API says `board-members`.
  "/foundation/board/[id]": { list: "/foundation/board-members" },
  "/foundation/board/[id]/edit": { list: "/foundation/board-members" },
  "/project/[id]": { list: "/projects" },
  "/student/exams/[id]/take": { list: "/assessment/exams" },
  "/parent/ibadah/[id]": {
    // The path segment is a *student* id, and the page is only ever visited by a
    // parent, so the id must be one of *that parent's* children — an admin-side
    // list can return any student, and the parent module 403s on the rest. Log
    // in as the demo parent and take its first child.
    custom: async () => {
      const acc = DEMO_ACCOUNTS.find((a) => a.roleCode === "TKQ_ORANG_TUA")!;
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: acc.email, password: acc.password }),
      });
      const login: any = await res.json();
      const bearer = login?.data?.accessToken;
      if (!bearer) return null;
      const kids = toRows(unwrap(await getJson("/parent/children", bearer)));
      const studentId = kids[0]?.id;
      return studentId ? `/parent/ibadah/${studentId}` : null;
    },
  },
  // The edit screen bounces a non-PENDING permit back to its detail page (only
  // pending permits are editable), so the generic "first row" pick landed on a
  // resolved permit and the capture recorded a bogus bounce. Pick a PENDING one.
  "/permits/[id]/edit": {
    list: "/permits?limit=50",
    pick: (rows) => rows.find((r) => r?.status === "PENDING")?.id,
  },
  "/parent/report-cards/[id]": { list: "/assessment/report-cards" },
  // Two params: take the dormitory id from the list, then a room id nested on
  // that dormitory's detail payload.
  "/dormitories/[id]/rooms/[roomId]/assign": {
    list: "/dormitories",
    nested: {
      roomId: {
        path: "/dormitories/{id}",
        pick: (row) => row?.rooms?.[0]?.id,
      },
    },
  },
  // Student-scoped analytics/report screens — the student list is the id source.
  "/assessment/raport-merdeka/[studentId]/[academicYearId]/[semester]": {
    list: "/students",
    fixed: { semester: "1" },
  },
  "/assessment/skhun/[studentId]/[academicYearId]": { list: "/students" },
  "/assessment/transcript/[studentId]": { list: "/students" },
  // The page reads `academicYearId`/`semester` from the query string, so the URL
  // needs them appended; the path alone renders the "parameter tidak lengkap" guard.
  "/assessment/unified-raport/[studentId]": {
    list: "/students",
    query: { academicYearId: "activeAcademicYear", semester: "1" },
  },
  "/tk/assessment/student/[studentId]": { list: "/students" },
  "/homeroom/students/[id]": { list: "/students" },
  // The wallet detail page keys off the *student* id, and the generic fallback
  // would hand it the wallet's own id (and a student with no wallet row at all),
  // so take `studentId` from a wallet that actually exists.
  "/wallet/[studentId]": {
    list: "/wallet",
    pick: (rows) => rows.find((r) => r?.studentId)?.studentId,
  },
  // Assessment detail screens: the API calls them `exams`, the web route calls
  // the same entity `assessment`, so the prefix-derived `/assessment` list 404s.
  "/assessment/[id]": { list: "/assessment/exams" },
  "/assessment/[id]/edit": { list: "/assessment/exams" },
  "/assessment/[id]/grades": { list: "/assessment/exams" },
  // The API names the exam list `/assessment/exams`; the web TK wrapper reads
  // `/paud-assessment/assessments`.
  "/tk/assessment/[id]": { list: "/paud-assessment/assessments" },
  "/tk/assessment/[id]/edit": { list: "/paud-assessment/assessments" },
  "/tk/daily-reports/[id]": { list: "/daily-report" },
  "/tk/daily-reports/[id]/edit": { list: "/daily-report" },
  "/tk/reports/[id]": { list: "/daily-report" },
  "/tk/reports/[id]/edit": { list: "/daily-report" },
  // CBT grading reads an *attempt*, which has no list endpoint of its own.
  // `/cbt/exams/:id/monitoring` is the only endpoint that exposes attempt ids
  // (`data.attempts[].id`), so grading on one of those renders instead of the
  // "tidak ditemukan" guard a bogus exam id produced.
  "/cbt/attempts/[id]/grading": {
    list: "/cbt/exams",
    // An attempt id has no list endpoint; only `/cbt/exams/:id/monitoring`
    // exposes `data.attempts[].id`, so walk an exam's monitoring payload.
    custom: async (bearer) => {
      for (const exam of await fetchRows("/cbt/exams", bearer)) {
        const payload = await getJson(
          `/cbt/exams/${exam.id}/monitoring`,
          bearer,
        );
        const attempts = unwrap(payload)?.attempts;
        if (Array.isArray(attempts) && attempts[0]?.id) {
          return `/cbt/attempts/${attempts[0].id}/grading`;
        }
      }
      return null;
    },
  },
  // The five unit pages are a closed static set (`educationUnits` in
  // `@cipansor/shared`), not rows in the `units` table — the DB has no `slug`
  // column, so a unit id here renders the public 404 page.
  "/unit/[slug]": { list: "/units", pick: () => "sdit" },
  // The verification route is public and resolves a certificate by its
  // `certificateNumber` (the code the signed PDF/QR carries). Point it at a real
  // number so the page renders a genuine "valid" result, not its own guard state.
  "/certificates/verify/[code]": {
    list: "/certificates",
    pick: (rows) => rows.find((r) => r?.certificateNumber)?.certificateNumber,
  },
  // Notifications templates: `/notifications/templates` is the real list, but
  // it is empty in the seed, so no id exists to resolve — the sweep skips it.
  "/notifications/templates/[id]/edit": { list: "/notifications/templates" },
  // Reference-data detail screens whose URL segment differs from the API path.
  // The `/certificates/[id]` screen reads the certificates module (the Taihfidz
  // certificate table), not `/sanad` (the sanad-chain table) — pointing it at
  // sanad handed it an id the detail endpoint 404s on.
  "/certificates/[id]": { list: "/certificates" },
  "/health/[id]": { list: "/health/records" },
  "/health/[id]/edit": { list: "/health/records" },
  // The web calls the payroll *slip* screen `/hr/payroll/[id]`, but the page
  // renders a period: it reads `/payroll/periods/:id`, not `/payroll/slips/:id`.
  "/hr/payroll/[id]": { list: "/payroll/periods" },
  "/hr/payroll/periods/[id]": { list: "/payroll/periods" },
  "/inventory/[id]": { list: "/inventory" },
  "/inventory/[id]/edit": { list: "/inventory" },
  "/inventory/audits/[id]": {
    list: "/inventory/audits",
    query: { unitId: "unitId", academicYearId: "activeAcademicYear" },
  },
  // The kinerja screens read the performance-agreement module; the evaluation
  // list is nested under it, so both hint at their real list paths.
  "/kinerja/evaluasi/[id]": { list: "/performance-agreements/evaluations" },
  "/kinerja/pk/[id]": { list: "/performance-agreements" },
  "/kitab-progress/[id]": { list: "/kitab-progress/kitab" },
  "/marketing/leads/[id]": { list: "/marketing/leads/recent" },
  "/notifications/[id]": { list: "/notifications" },
  "/practicum/[id]": { list: "/practicum/lesson-plans" },
  "/quality/[id]": { list: "/quality/standards" },
  "/quality/audits/[id]": {
    list: "/quality/audits",
    listQuery: { unitId: "unitWithRow", academicYearId: "activeAcademicYear" },
    query: { unitId: "unitWithRow", academicYearId: "activeAcademicYear" },
  },
  "/quality/complaints/[id]": { list: "/complaints" },
  "/research/submissions/[id]": { list: "/research/submissions" },
  "/research/themes/[id]": { list: "/research/themes" },
  "/risk-management/[id]": {
    list: "/risk",
    listQuery: { unitId: "unitWithRow" },
    query: { unitId: "unitWithRow" },
  },
  "/settings/roles/[id]": { list: "/roles" },
  "/spmb/registrations/[id]": { list: "/admissions/registrants" },
  "/student-org/members/[id]": { list: "/student-org" },
  "/talenta/[id]": { list: "/talenta/profiles" },
  "/unit-usaha/[id]": { list: "/business-units" },
  // The `/curriculum/curriculums` screen reads the curriculum API module
  // (`/curriculum/curriculums`), which now exists; the old `/curriculum/subjects`
  // hint handed the detail page a subject id, so it rendered the 404 guard.
  "/curriculum/curriculums/[id]": { list: "/curriculum/curriculums" },
  "/curriculum/curriculums/[id]/add-subject": {
    list: "/curriculum/curriculums",
  },
  "/curriculum/curriculums/[id]/edit": { list: "/curriculum/curriculums" },
  "/curriculum/merdeka/p5/[id]": { list: "/kurikulum-merdeka/p5-projects" },
  "/finance/bills/[id]": { list: "/finance/invoices" },
  // Reference-data detail screens whose entity lives in a `categories` route.
  // `/rewards/categories` returns bare category strings, not rows with `id`.
  "/rewards/types/[id]/edit": {
    list: "/rewards/categories",
    pick: (rows) => (typeof rows[0] === "string" ? rows[0] : rows[0]?.id),
  },
  // `/violations/categories` returns bare category strings, not rows with `id`.
  "/violations/types/[id]/edit": {
    list: "/violations/categories",
    pick: (rows) => (typeof rows[0] === "string" ? rows[0] : rows[0]?.id),
  },
  // The tahfidz simaan screen reads the standalone `/simaan` module, not the
  // `/tahfidz/simaan` path its URL implies.
  "/tahfidz/simaan/[id]": { list: "/simaan" },
  "/tahfidz/simaan/[id]/edit": { list: "/simaan" },
  // News articles are a closed static set in `content.ts` (`getArticle`), not
  // marketing CMS rows — a campaign id renders the 404 page.
  "/berita/[slug]": {
    list: "/marketing/campaigns",
    pick: () => "osn-kecamatan-kadipaten-2026",
  },
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

function routeFromFile(file: string): string {
  const rel = path.relative(APP_DIR, file).replace(/\/?page\.tsx$/, "");
  const cleaned = rel.replace(/\(([^)]*)\)/g, "").replace(/\/+/g, "/");
  const route = "/" + cleaned.replace(/^\/|\/$/g, "");
  return route === "/" ? "/" : route;
}

async function getJson(apiPath: string, bearer: string) {
  const res = await fetch(`${API_URL}${apiPath}`, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Pull an id from the widest selection of envelope shapes we can. */
function firstId(payload: any): string | undefined {
  const rows = payload?.data?.data ?? payload?.data ?? payload?.items ?? [];
  const list = Array.isArray(rows) ? rows : [];
  return list[0]?.id ?? list[0]?._id;
}

// A trailing `[id]`/`[xId]` param the hint didn't name is usually the id of a
// seeded reference row, and the param name says which collection it belongs to.
const PARAM_ENDPOINTS: Record<string, string> = {
  academicYearId: "/academic-years",
  unitId: "/units",
  classId: "/classes",
  studentId: "/students",
  userId: "/users",
  employeeId: "/hr/staff",
  examId: "/assessment/exams",
};

function unwrap(payload: any): any {
  return payload?.data?.data ?? payload?.data ?? payload;
}

/** Rows from an envelope, tolerating the `{data:[…]}` and bare-array shapes. */
function toRows(payload: any): any[] {
  const list = unwrap(payload);
  if (Array.isArray(list)) return list;
  if (Array.isArray(list?.data)) return list.data;
  return [];
}

/** Fetch a list endpoint and return its rows (empty on any non-OK response). */
async function fetchRows(path: string, bearer: string): Promise<any[]> {
  return toRows(unwrap(await getJson(path, bearer)));
}

/** Substitute the resolver's dynamic query values and apply them to a URL. */
function withListQuery(
  url: string,
  query: Record<string, string> | undefined,
  unitId?: string,
): string {
  if (!query) return url;
  const [pathname, existing] = url.split("?");
  const params = new URLSearchParams(existing ?? "");
  for (const [k, v] of Object.entries(query)) {
    const value =
      v === "activeAcademicYear"
        ? activeAcademicYearId
        : v === "unitWithRow"
          ? (unitId ?? "")
          : v === "unitId"
            ? (unitId ?? firstUnitId)
            : v;
    if (value) params.set(k, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Set once at startup from `/academic-years`; substituted into `query` hints. */
let activeAcademicYearId = "";
/** Set once at startup from `/units`; substituted into `query` hints. */
let firstUnitId = "";
/** All seeded unit ids, tried in order for unit-scoped list queries. */
let unitIds: string[] = [];

async function resolveOne(
  pattern: string,
  bearer: string,
): Promise<string | null> {
  const hint = HINTS[pattern] ?? {};
  const segments = pattern.split("/").filter(Boolean);
  const out: string[] = [];

  // index of the first dynamic segment
  const firstDyn = segments.findIndex((s) => s.startsWith("["));
  if (firstDyn === -1) return pattern;

  const staticPrefix = "/" + segments.slice(0, firstDyn).join("/");

  // Try candidate list endpoints: progressively drop trailing segments from the
  // prefix until one of them returns rows. e.g. /dormitories/[id]/rooms/[roomId]
  // -> /dormitories, /hr/employees/[id] -> /hr/employees.
  let rows: any[] = [];
  const prefixSegs = segments.slice(0, firstDyn);
  const listPaths: string[] = [];
  if (hint.list) listPaths.push(hint.list);
  else
    for (let cut = prefixSegs.length; cut >= 1; cut--) {
      listPaths.push("/" + prefixSegs.slice(0, cut).join("/"));
    }
  const listQuery = hint.listQuery;
  if (hint.custom) {
    const url = await hint.custom(bearer);
    return url;
  }
  // Some modules are unit-scoped and the seed populates exactly one unit; trying
  // only `units[0]` resolves to a unit with zero rows, so `<entity>/[id]` is
  // left unresolved. Walk the units instead until the list actually answers.
  const unitCandidates = Object.values(listQuery ?? {}).includes("unitWithRow")
    ? unitIds
    : [undefined];
  outer: for (const unitId of unitCandidates) {
    for (const candidate of listPaths) {
      const payload = await getJson(
        withListQuery(candidate, listQuery, unitId),
        bearer,
      );
      const arr = toRows(unwrap(payload));
      if (arr.length > 0) {
        rows = arr;
        resolvedUnitId = unitId;
        break outer;
      }
    }
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.startsWith("[")) {
      out.push(seg);
      continue;
    }
    const param = seg.replace(/[\[\]]/g, "");
    if (hint.fixed?.[param]) {
      out.push(hint.fixed[param]);
      continue;
    }
    if (i === firstDyn) {
      const picked = hint.pick ? hint.pick(rows) : rows[0]?.id;
      if (!picked) return null;
      out.push(picked);
      continue;
    }
    // Nested param: fetch the parent detail path and dig a nested id out.
    const nested = hint.nested?.[param];
    if (nested) {
      const parentUrl = nested.path.replace(/\{[^}]+\}/g, (m) => {
        const key = m.slice(1, -1);
        const idx = segments.findIndex((s) => s.includes(key));
        return idx >= 0 ? out[idx] : "";
      });
      const payload = await getJson(parentUrl, bearer);
      const id = payload ? nested.pick(unwrap(payload)) : undefined;
      if (!id) return null;
      out.push(id);
      continue;
    }
    // A later param whose name maps to a known collection (academicYearId,
    // studentId, ...) — pull its id from that collection.
    const endpoint = PARAM_ENDPOINTS[param];
    if (endpoint) {
      // `academicYearId` feeds report screens that join through the student's
      // *enrollment*, and the list endpoint returns the inactive year first
      // (2027/2028, zero enrollments) — picking `arr[0]` guaranteed a 404. Use
      // the active year, which is where every seeded enrollment actually lives.
      if (param === "academicYearId" && activeAcademicYearId) {
        out.push(activeAcademicYearId);
        continue;
      }
      const payload = await getJson(endpoint, bearer);
      const list = unwrap(payload);
      const arr = Array.isArray(list)
        ? list
        : Array.isArray(list?.data)
          ? list.data
          : [];
      const id = arr[0]?.id;
      if (!id) return null;
      out.push(id);
      continue;
    }
    return null;
  }

  const base = out.length ? "/" + out.join("/") : null;
  if (!base) return null;
  return hint.query
    ? base + "?" + buildQuery(hint.query, resolvedUnitId)
    : base;
}

/** The unit id a unit-scoped list actually answered for; used in the final URL. */
let resolvedUnitId: string | undefined;

function buildQuery(query: Record<string, string>, unitId?: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    const value =
      v === "activeAcademicYear"
        ? activeAcademicYearId
        : v === "unitWithRow"
          ? (unitId ?? firstUnitId)
          : v === "unitId"
            ? firstUnitId
            : v;
    if (value) params.set(k, value);
  }
  return params.toString();
}

async function run() {
  const acc = DEMO_ACCOUNTS.find((a) => a.roleCode === "SUPER_ADMIN")!;
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: acc.email, password: acc.password }),
  });
  const login: any = await res.json();
  const bearer = login?.data?.accessToken;
  if (!bearer) throw new Error("login failed: " + JSON.stringify(login));

  const years = unwrap(await getJson("/academic-years", bearer));
  const activeYear = (Array.isArray(years) ? years : []).find(
    (y: any) => y.isActive,
  );
  activeAcademicYearId = activeYear?.id ?? "";

  const units = unwrap(await getJson("/units", bearer));
  const unitList = Array.isArray(units)
    ? units
    : Array.isArray(units?.data)
      ? units.data
      : [];
  firstUnitId = unitList[0]?.id ?? "";
  unitIds = unitList.map((u: any) => u?.id).filter(Boolean);

  const all = walk(APP_DIR).map(routeFromFile);
  const patterns = all.filter((r) => r.includes("[")).sort();

  const resolved: Record<string, string> = {};
  const unresolved: string[] = [];
  for (const pattern of patterns) {
    const url = await resolveOne(pattern, bearer).catch(() => null);
    if (url) resolved[pattern] = url;
    else unresolved.push(pattern);
  }

  const fresh = resolved;
  const outFile = path.join(__dirname, "dynamic-routes.json");
  fs.writeFileSync(outFile, JSON.stringify(fresh, null, 2));
  console.log(
    `${Object.keys(fresh).length}/${patterns.length} patterns resolved -> ${outFile}`,
  );
  if (unresolved.length) {
    console.log("\nUnresolved:");
    for (const u of unresolved) console.log("  " + u);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
