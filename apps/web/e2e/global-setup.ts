import * as fs from "fs";
import * as path from "path";
import {
  apiLogin,
  buildStorageState,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";

/**
 * Playwright Global Setup for Cipansor E2E Tests
 *
 * 1. Verify backend and frontend are reachable.
 * 2. Pre-authenticate the seed roles via the API (completing the admin 2FA gate
 *    with a fixed-secret TOTP) and write Playwright storageState files, so specs
 *    can `test.use({ storageState: ".auth/superAdmin.json" })`. This replaces the
 *    old UI login, which couldn't authenticate admins and waited on the wrong URL.
 */

const baseURL = process.env.BASE_URL || "http://localhost:3000";
const apiURL = process.env.API_URL || "http://localhost:3001/api";
// The health endpoint is mounted at the server root (/health), not under /api.
const healthURL = `${apiURL.replace(/\/api\/?$/, "")}/health`;

// Roles to pre-authenticate → storageState file name (under apps/web/.auth).
const ROLE_FILES: Record<keyof typeof SEED_USERS, string> = {
  superAdmin: "superAdmin",
  adminSdit: "adminSdit",
  teacher: "teacher",
  parent: "parent",
  student: "student",
  ketuaPengurus: "ketuaPengurus",
  pengawas: "pengawas",
  pembina: "pembina",
};

async function globalSetup() {
  console.log("🚀 Starting E2E Test Global Setup...");
  console.log(`📍 Base URL: ${baseURL}`);
  console.log(`📍 API URL: ${apiURL}`);

  const authDir = path.join(__dirname, "../.auth");
  fs.mkdirSync(authDir, { recursive: true });

  // 1. Backend health.
  let backendAvailable = false;
  try {
    const response = await fetch(healthURL);
    backendAvailable = response.ok;
    console.log(
      backendAvailable
        ? "✅ Backend API is healthy"
        : `⚠️ Backend API health check failed: ${response.status}`,
    );
  } catch (error) {
    console.warn("⚠️ Backend API is not accessible:", error);
  }

  // 2. Frontend reachable.
  try {
    const response = await fetch(baseURL);
    if (response.ok || response.status === 404) {
      console.log("✅ Frontend is accessible");
    } else {
      console.warn(`⚠️ Frontend check failed: ${response.status}`);
    }
  } catch (error) {
    console.warn("⚠️ Frontend is not accessible:", error);
  }

  // 3. Pre-authenticate roles via the API and persist storageState, plus a raw
  //    session cache (sessions.json) that loginAs/apiLogin in every worker
  //    reads — so the whole run performs each login (and admin 2FA) at most
  //    once instead of per-worker, which trips the strict 2FA rate limiter.
  //    Sessions from a previous run are reused when their token still works
  //    (verified against /auth/me), so iterative local runs usually perform
  //    ZERO 2FA logins and never approach the limiter.
  const sessionsFile = path.join(authDir, "sessions.json");
  let previous: Record<string, AuthSession> = {};
  try {
    previous = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
  } catch {
    /* no previous sessions */
  }
  fs.rmSync(sessionsFile, { force: true }); // workers only ever see verified sessions

  const sessionStillValid = async (session: AuthSession): Promise<boolean> => {
    try {
      const res = await fetch(`${apiURL}/auth/me`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  if (backendAvailable) {
    console.log("🔐 Pre-authenticating roles via API...");
    const sessions: Record<string, AuthSession> = {};
    for (const [role, file] of Object.entries(ROLE_FILES)) {
      try {
        const user = SEED_USERS[role as keyof typeof SEED_USERS];
        const reusable = previous[user.email];
        const session =
          reusable && (await sessionStillValid(reusable))
            ? reusable
            : await apiLogin(user);
        sessions[user.email] = session;
        fs.writeFileSync(
          path.join(authDir, `${file}.json`),
          JSON.stringify(buildStorageState(session), null, 2),
        );
        console.log(`✅ Saved storageState for ${role}${session === reusable ? " (reused)" : ""}`);
      } catch (error) {
        console.warn(`⚠️ Failed to pre-authenticate ${role}:`, error);
      }
    }
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
  } else {
    console.log("⚠️ Skipping pre-authentication (backend unavailable).");
  }

  console.log("✅ Global Setup Complete\n");
}

export default globalSetup;
