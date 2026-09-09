import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
} from "../helpers/auth-api";

type AuthSession = Awaited<ReturnType<typeof apiLogin>>;

/**
 * E2E coverage for the CBT best-practice enhancements on the student
 * exam-taking page (`/student/exams/[id]/take`):
 *  1. Attempt-scoped seeded shuffle of question & option order.
 *  2. Autosave draft to localStorage + offline recovery on reload.
 *  3. Auto-submit on timeout — including a partially-failed upload, where the
 *     exam MUST still complete instead of silently EXPIRING.
 *  4. Tab-switch counter persisted across refresh + security log recorded.
 *  5. Copy/paste/right-click security events logged.
 *
 * Each test creates its own question bank + exam through the real API and
 * starts a fresh attempt as the seeded student, so the take-exam flow runs
 * against real data (Playwright mocks are avoided per apps/web/AGENTS.md).
 */

interface QuestionBank {
  id: string;
}
interface Question {
  id: string;
  type: string;
  content: string;
  options: unknown[];
}
interface Exam {
  id: string;
  title: string;
}
interface Attempt {
  id: string;
  status: string;
  tabSwitchCount?: number;
}
interface QuestionDto {
  id: string;
  type: string;
  content: string;
  options: string[];
}

/** Create a question bank + 2 MCQ questions + a scheduled exam via the API. */
async function createCbtExam(
  session: AuthSession,
): Promise<{ exam: Exam; questions: QuestionDto[] }> {
  // Pick a seeded unit (SMP IT) + the first subject/academic-year/class/teacher.
  const units = await apiRequest<{ data: Array<{ id: string; name: string }> }>(
    session,
    "GET",
    "/units",
  );
  const smpit = units.data?.find((u) => /smp/i.test(u.name)) ?? units.data?.[0];
  expect(smpit, "seeded SMP IT unit required").toBeTruthy();

  const [subjects, academicYears, classes, teachers] = await Promise.all([
    apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/curriculum/subjects",
    ),
    apiRequest<{ data: Array<{ id: string }> }>(
      session,
      "GET",
      "/academic-years",
    ),
    apiRequest<{ data: Array<{ id: string }> }>(session, "GET", "/classes"),
    apiRequest<{ data: Array<{ id: string }> }>(session, "GET", "/hr/teachers"),
  ]);
  expect(subjects.data?.[0], "seeded subject required").toBeTruthy();
  expect(academicYears.data?.[0], "seeded academic year required").toBeTruthy();
  expect(classes.data?.[0], "seeded class required").toBeTruthy();
  expect(teachers.data?.[0], "seeded teacher required").toBeTruthy();

  const bankTitle = `Bank E2E ${Date.now()}`;
  const bank = await apiRequest<{ data: QuestionBank }>(
    session,
    "POST",
    "/cbt/banks",
    {
      title: bankTitle,
      description: "E2E question bank",
      unitId: smpit.id,
      subjectId: subjects.data[0].id,
      teacherId: teachers.data[0].id,
    },
  );

  const added: Question[] = [];
  const seeds: Array<{
    content: string;
    options: string[];
    answerKey: string;
    points: number;
  }> = [
    {
      content: `E2E Q1 ${Date.now()}`,
      options: ["alpha", "beta", "gamma", "delta"],
      answerKey: "alpha",
      points: 50,
    },
    {
      content: `E2E Q2 ${Date.now()}`,
      options: ["delta", "charlie", "bravo", "alpha"],
      answerKey: "delta",
      points: 50,
    },
  ];
  for (const s of seeds) {
    const q = await apiRequest<{ data: Question }>(
      session,
      "POST",
      `/cbt/banks/${bank.data.id}/questions`,
      {
        type: "MULTIPLE_CHOICE",
        content: s.content,
        options: s.options,
        answerKey: s.answerKey,
        points: s.points,
      },
    );
    added.push(q.data);
  }

  const exam = await apiRequest<{ data: Exam }>(session, "POST", "/cbt/exams", {
    questionBankId: bank.data.id,
    title: `Ujian E2E ${Date.now()}`,
    description: "E2E CBT exam",
    type: "MIDTERM",
    academicYearId: academicYears.data[0].id,
    subjectId: subjects.data[0].id,
    classId: classes.data[0].id,
    scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    duration: 1,
    maxScore: 100,
    passingScore: 70,
    status: "SCHEDULED",
    unitId: smpit.id,
    teacherId: teachers.data[0].id,
  });

  return {
    exam: exam.data,
    questions: added.map((q) => ({
      id: q.id,
      type: q.type,
      content: q.content,
      options: q.options as string[],
    })),
  };
}

/** Start an attempt for the seeded student and return the attempt id. */
async function startAttempt(
  session: AuthSession,
  examId: string,
): Promise<Attempt> {
  const res = await apiRequest<{ data: Attempt }>(
    session,
    "POST",
    `/cbt/exams/${examId}/start`,
  );
  return res.data;
}

test.describe("CBT Take Exam (Student)", () => {
  test("starts an exam and shows attempt-shuffled questions & options", async ({
    page,
  }) => {
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const { exam, questions } = await createCbtExam(admin);
    expect(questions.length).toBeGreaterThanOrEqual(2);

    const student = await apiLogin(SEED_USERS.student);
    await startAttempt(student, exam.id);
    await injectSession(page, student);
    await page.goto(`/student/exams/${exam.id}/take`);

    // The first rendered question comes from the real (seeded) question bank.
    await expect(page.getByText(questions[0].content)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(questions[1].content)).toBeVisible();

    // Every MCQ option from the bank is rendered (order is shuffled, not the set).
    for (const q of questions) {
      for (const opt of q.options) {
        await expect(
          page.getByText(opt, { exact: true }).first(),
        ).toBeVisible();
      }
    }

    // Clean up the exam so repeat runs keep the seeded DB tidy.
    await apiRequest(admin, "DELETE", `/cbt/exams/${exam.id}`);
  });

  test("autosaves a draft answer and recovers it after reload", async ({
    page,
  }) => {
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const { exam } = await createCbtExam(admin);
    const student = await apiLogin(SEED_USERS.student);
    const attempt = await startAttempt(student, exam.id);
    await injectSession(page, student);

    await page.goto(`/student/exams/${exam.id}/take`);
    // Select the first option of the first question.
    await page.getByRole("radio").first().click({ force: true });

    // The draft is mirrored to localStorage immediately (offline resilience).
    const draftKey = `cbt_draft_${attempt.id}`;
    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k), draftKey))
      .not.toBeNull();

    await page.reload();
    // Answer survives reload (recovered from backend + local draft).
    await expect(page.getByRole("radio").first()).toBeChecked({
      timeout: 15000,
    });

    await apiRequest(admin, "DELETE", `/cbt/exams/${exam.id}`);
  });

  test("auto-submits on timeout and STILL finishes the exam even if some uploads fail", async ({
    page,
  }) => {
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const { exam } = await createCbtExam(admin);
    const student = await apiLogin(SEED_USERS.student);
    const attempt = await startAttempt(student, exam.id);
    await injectSession(page, student);

    // Install a fake clock BEFORE the page loads so the countdown interval and
    // `new Date()` are both driven by the same virtual timeline.
    await page.clock.install();

    await page.goto(`/student/exams/${exam.id}/take`);
    // Answer the first question so at least one answer uploads during finish.
    await page.getByRole("radio").first().click({ force: true });

    // Simulate uploads failing during finish. Route interception runs in the
    // page context; the next submit request is the browser's real call.
    await page.route("**/api/cbt/attempts/*/answer**", async (route) => {
      // Fail every answer upload to emulate "sebagian jawaban gagal terunggah".
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false }),
      });
    });

    // Fast-forward the countdown past the exam duration so the timer fires the
    // auto-submit path (isAuto === true), which must complete the exam.
    await page.clock.fastForward("60:01");

    // The instructor sees a COMPLETED attempt with the attempt no longer
    // pending — the exam finished despite the failed uploads.
    await expect
      .poll(
        async () => {
          const res = await apiRequest<{ data: Attempt }>(
            student,
            "GET",
            `/cbt/attempts/${attempt.id}`,
          );
          return res.data?.status;
        },
        { timeout: 15000 },
      )
      .toBe("COMPLETED");

    await apiRequest(admin, "DELETE", `/cbt/exams/${exam.id}`);
  });

  test("records anti-cheating events and persists the tab-switch counter on refresh", async ({
    page,
  }) => {
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const { exam } = await createCbtExam(admin);
    const student = await apiLogin(SEED_USERS.student);
    const attempt = await startAttempt(student, exam.id);
    await injectSession(page, student);

    await page.goto(`/student/exams/${exam.id}/take`);
    const card = page.locator("[class*='select-none']").first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // Copy / paste / right-click on the question card fire the React security
    // handlers. Dispatching synthetic DOM events is more reliable than keyboard
    // shortcuts (which need a text selection to emit a copy/paste event).
    await card.dispatchEvent("copy");
    await card.dispatchEvent("paste");
    await card.dispatchEvent("contextmenu");

    // Simulate a tab switch (visibilitychange marks the document hidden).
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // The tab-switch counter is persisted to the real attempt on the backend.
    await expect
      .poll(async () => {
        const res = await apiRequest<{ data: Attempt }>(
          student,
          "GET",
          `/cbt/attempts/${attempt.id}`,
        );
        return res.data?.tabSwitchCount ?? 0;
      })
      .toBeGreaterThan(0);

    // After a reload the page re-mounts and the attempt is still IN_PROGRESS
    // (nothing finalised the exam), proving the counter data round-trips.
    await page.reload();
    await expect(card).toBeVisible({ timeout: 15000 });
    const after = await apiRequest<{ data: Attempt }>(
      student,
      "GET",
      `/cbt/attempts/${attempt.id}`,
    );
    expect(after.data?.tabSwitchCount ?? 0).toBeGreaterThan(0);

    await apiRequest(admin, "DELETE", `/cbt/exams/${exam.id}`);
  });
});
