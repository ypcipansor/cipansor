import { test, expect } from "@playwright/test";

/**
 * Regression coverage for the E-Simaan setoran recorder.
 *
 * The portal's security headers once denied the microphone (`Permissions-Policy:
 * microphone=()`) and refused `blob:` media (`media-src 'self'`), so recording
 * failed and the just-recorded preview stayed silent — with only a generic
 * "Tidak dapat mengakses mikrofon" toast to show for it. The unit tests in
 * `src/lib/security-headers.test.ts` read the policy *text*; they cannot open a
 * microphone or play a recording, so they never caught it. This spec drives the
 * real flow (golden rule #7).
 *
 * The policy only reaches the browser from the production build — `next dev`
 * (Turbopack) does not apply middleware here — so this is a real assertion in
 * CI, where the e2e server runs `pnpm start`, and a no-op locally under
 * `pnpm dev`. That matches how every other CSP-sensitive test in this suite
 * behaves.
 */
test.use({
  storageState: ".auth/superAdmin.json",
  permissions: ["microphone"],
  // Chromium has no capture device in the CI sandbox; the fake device keeps
  // getUserMedia succeeding without weakening what is being asserted (the
  // document policy, not the hardware).
  //
  // `test.use` replaces the project's `launchOptions` wholesale, so the
  // constrained-sandbox executable override from `playwright.config.ts` is
  // repeated here — otherwise this spec alone would try to download a browser.
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    ...(process.env.PW_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  },
});

test("setoran recorder captures audio and plays it back", async ({
  page,
  browserName,
}) => {
  // The fake capture device is a Chromium launch flag; Firefox and WebKit have
  // no equivalent here, so on those engines getUserMedia rejects for want of a
  // device and the test would assert the sandbox, not the policy.
  test.skip(browserName !== "chromium", "fake media device is Chromium-only");
  test.setTimeout(90_000);

  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to (load|create)/i.test(msg.text())) {
      cspViolations.push(msg.text());
    }
  });

  await page.goto("/tahfidz/e-simaan", { waitUntil: "domcontentloaded" });

  // The AudioRecorder is the last card on the page.
  const recorder = page.locator('[data-slot="card"]').last();
  await expect(recorder.getByText(/Rekam Setoran/i)).toBeVisible();

  // A Permissions-Policy that denies the microphone reports "denied" here, and
  // getUserMedia then rejects — the recorder would never leave the idle state.
  const micState = await page.evaluate(async () => {
    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      return status.state;
    } catch {
      return "unknown";
    }
  });
  expect(micState).toBe("granted");

  await recorder.locator("button:has(svg.lucide-mic)").click();
  await expect(page.getByText(/Sedang Merekam/i)).toBeVisible();
  await page.waitForTimeout(1200);

  await recorder.locator("button:has(svg.lucide-square)").click();
  const audio = page.locator("audio");
  // The element is deliberately `hidden`; it exists only to play the preview.
  await expect(audio).toBeAttached();
  expect((await audio.getAttribute("src")) ?? "").toMatch(/^blob:/);

  // Without `media-src 'self' blob: …` the element cannot load the blob and
  // reports a media error instead of playing.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (document.querySelector("audio") as HTMLAudioElement | null)?.error
              ?.code ?? 0,
        ),
      { timeout: 5_000 },
    )
    .toBe(0);

  const played = await page.evaluate(async () => {
    const el = document.querySelector("audio") as HTMLAudioElement | null;
    if (!el) return "no-audio";
    try {
      await el.play();
      await new Promise((r) => setTimeout(r, 400));
      return el.currentTime > 0 ? "playing" : "stalled";
    } catch (e) {
      return "rejected:" + (e as Error).name;
    }
  });
  expect(played).toBe("playing");

  expect(cspViolations).toEqual([]);
});
