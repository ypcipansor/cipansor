// k6 load smoke for Cipansor STAGING. Never production.
//
// A small, courteous read-only load against the staging portal. It signs in as
// seeded non-2FA demo accounts (resolved from the checkout, never hardcoded),
// then loops GETs on three endpoints every role may read: the caller's own
// profile, the dashboard metrics and the announcement list. No write, no
// e-mail, no WhatsApp — staging's outbound is off and its Turnstile is off.
//
// Configuration (environment):
//   BASE_URL         required, must be the staging host or localhost
//   ACCOUNTS_FILE    required, JSON from lib/resolve-accounts.mjs
//   VUS              optional, default 3
//   DURATION         optional, default 30s
//   SLEEP_SECONDS    optional, default 2 (keeps under the 100 req/min limiter)
//
// Output: handleSummary writes summary.json (p50/p95/p99 + error rate) and a
// human-readable text summary. lib/compare.mjs reads summary.json.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/+$/, "");
if (!BASE_URL) throw new Error("BASE_URL is required");

// Safety: refuse any target that is not staging or a local stack. The apex
// cipansor.or.id is a live public site; pointing load at it is never correct.
const STAGING_HOST = "staging.cipansor.or.id";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const host = BASE_URL.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
const isLocal = LOCAL_HOSTS.includes(host);
if (host !== STAGING_HOST && !isLocal) {
  throw new Error(
    `Refusing to run: BASE_URL host "${host}" is not ${STAGING_HOST} or localhost. ` +
      `Load must never be pointed at production.`
  );
}

const ACCOUNTS_FILE = __ENV.ACCOUNTS_FILE;
if (!ACCOUNTS_FILE) throw new Error("ACCOUNTS_FILE is required");
const RESOLVED = JSON.parse(open(ACCOUNTS_FILE));
if (!RESOLVED.accounts || RESOLVED.accounts.length === 0) {
  throw new Error(`no accounts in ${ACCOUNTS_FILE}`);
}
const ACCOUNTS = RESOLVED.accounts;
const PASSWORD = RESOLVED.password;

const VUS = Number(__ENV.VUS || 3);
const DURATION = __ENV.DURATION || "30s";
const SLEEP_SECONDS = Number(__ENV.SLEEP_SECONDS || 2);

// Endpoints every signed-in role may read. Measured 2026-10-07 on staging:
// 200 for teacher, ustadz, wali santri and santri alike.
const ENDPOINTS = [
  { name: "me", path: "/api/auth/me" },
  { name: "dashboard", path: "/api/dashboard/metrics" },
  { name: "announcements", path: "/api/announcements?limit=10" },
];

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  // p(50)/p(95)/p(99) are not in k6's default trend stats; ask for them so the
  // summary carries what compare.mjs reads.
  summaryTrendStats: ["avg", "min", "med", "p(50)", "p(95)", "p(99)", "max"],
  // Deliberately no threshold that aborts the run: compare.mjs decides, against
  // the recorded baseline, so a noisy shared staging never fails a build on
  // its own.
  thresholds: {},
};

// Per-endpoint error rate, so compare.mjs sees failures by endpoint, not only
// in aggregate.
const endpointErrors = {};
const endpointDuration = {};
for (const e of ENDPOINTS) {
  endpointErrors[e.name] = new Rate(`errors_${e.name}`);
  endpointDuration[e.name] = new Trend(`duration_${e.name}`, true);
}

function cookieHeaderFrom(res) {
  const parts = [];
  for (const [name, values] of Object.entries(res.cookies || {})) {
    for (const v of values) parts.push(`${name}=${v.value}`);
  }
  return parts.join("; ");
}

// k6 keeps one cookie jar for the whole run. The session cookie from the
// previous login would ride along on this POST /auth/login, and the server
// would then demand a CSRF header (see apps/api/src/middleware/csrf.ts).
// `cookieJar().clear(url)` is not enough in k6 0.49 — it leaves cookies whose
// Path does not match (`cipansor_rt` lives on /api/auth). Deleting every cookie
// by name, for each path a login sets one, is what actually empties the jar.
function clearJar(jar, baseUrl) {
  for (const url of [`${baseUrl}/`, `${baseUrl}/api/auth`, `${baseUrl}/api/auth/login`]) {
    for (const name of Object.keys(jar.cookiesForURL(url))) jar.delete(url, name);
  }
}

export function setup() {
  const sessions = [];
  const jar = http.cookieJar();
  for (const account of ACCOUNTS) {
    clearJar(jar, BASE_URL);
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: account.email, password: PASSWORD }),
      { headers: { "Content-Type": "application/json" }, tags: { endpoint: "login" } }
    );
    if (res.status !== 200) {
      throw new Error(
        `login failed for ${account.email}: HTTP ${res.status} — ${String(res.body).slice(0, 200)}`
      );
    }
    let body = {};
    try {
      body = res.json();
    } catch (_e) {
      /* non-JSON body is fine as long as the cookie is present */
    }
    if (body && body.requiresTwoFactorSetup) {
      throw new Error(
        `${account.email} requires 2FA setup; resolver should have excluded it`
      );
    }
    const cookieHeader = cookieHeaderFrom(res);
    if (!cookieHeader.includes("cipansor_at")) {
      throw new Error(`login for ${account.email} returned no session cookie`);
    }
    sessions.push({ email: account.email, cookieHeader });
  }
  return { sessions };
}

export default function (data) {
  const session = data.sessions[(__VU - 1) % data.sessions.length];
  const headers = { Cookie: session.cookieHeader };

  for (const endpoint of ENDPOINTS) {
    const res = http.get(`${BASE_URL}${endpoint.path}`, {
      headers,
      tags: { endpoint: endpoint.name },
    });
    const ok = check(res, {
      [`${endpoint.name} 200`]: (r) => r.status === 200,
    });
    endpointErrors[endpoint.name].add(ok ? 0 : 1);
    endpointDuration[endpoint.name].add(res.timings.duration);
    sleep(SLEEP_SECONDS);
  }
}

function percentile(values, p) {
  const v = values[`p(${p})`];
  return v === undefined ? null : v;
}

export function handleSummary(data) {
  const overall = data.metrics.http_req_duration.values;
  const failed = data.metrics.http_req_failed.values;
  const requestCount = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;

  const endpoints = {};
  for (const e of ENDPOINTS) {
    const dur = data.metrics[`duration_${e.name}`];
    const err = data.metrics[`errors_${e.name}`];
    endpoints[e.name] = {
      p50: dur ? percentile(dur.values, 50) : null,
      p95: dur ? percentile(dur.values, 95) : null,
      p99: dur ? percentile(dur.values, 99) : null,
      errorRate: err ? err.values.rate : null,
      count: dur ? dur.values.count : 0,
    };
  }

  const summary = {
    recordedAt: new Date().toISOString(),
    target: BASE_URL,
    profile: { vus: VUS, duration: DURATION },
    metrics: {
      p50: percentile(overall, 50),
      p95: percentile(overall, 95),
      p99: percentile(overall, 99),
      errorRate: failed.rate,
      requests: requestCount,
    },
    endpoints,
  };

  const lines = [
    `Load smoke @ ${BASE_URL}`,
    `requests: ${requestCount}  error rate: ${(failed.rate * 100).toFixed(2)}%`,
    `overall  p50=${summary.metrics.p50}ms  p95=${summary.metrics.p95}ms  p99=${summary.metrics.p99}ms`,
    "",
    "endpoint                    p50      p95      p99      errors",
  ];
  for (const [name, m] of Object.entries(endpoints)) {
    lines.push(
      `${name.padEnd(24)} ${String(m.p50).padEnd(8)} ${String(m.p95).padEnd(8)} ` +
        `${String(m.p99).padEnd(8)} ${m.errorRate === null ? "-" : (m.errorRate * 100).toFixed(2) + "%"}`
    );
  }

  return {
    "tests/load/summary.json": JSON.stringify(summary, null, 2),
    stdout: lines.join("\n") + "\n",
  };
}
