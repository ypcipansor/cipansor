/**
 * A notification a person writes by hand reaches only people in their reach.
 *
 * A notification lands in the recipient's bell and, since Web Push, on their
 * lock screen. Roles pinned to a unit (guru, staf, admin unit) address people
 * of that unit; roles that see every unit (Super Admin, the yayasan's organs)
 * address anyone. Checked against the real API and database: the rule lives in
 * a Prisma `where`, which a mocked client would accept whatever it said.
 *
 * Creates two throwaway accounts and removes them at the end (their
 * notifications go with them). Writes, so it skips itself against a
 * production API.
 */
import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  SEED_USERS,
  type AuthSession,
} from "./helpers/auth-api";
import { isProductionApi } from "./helpers/api-env";

test.describe.configure({ mode: "serial" });

const STAMP = Date.now().toString(36);
const PASSWORD = "angin gunung di pagi hari";

let superAdmin: AuthSession;
let teacher: AuthSession;
let otherUnit: string;
let ownUnit: string;
const created: string[] = [];

const statusOf = (call: Promise<unknown>) =>
  call.then(
    () => 201,
    (error: Error) => Number(/→ (\d{3})/.exec(error.message)?.[1] ?? 0),
  );

const note = (userId: string) => ({
  userId,
  title: `Uji cakupan penerima ${STAMP}`,
  message: "Pemeriksaan otomatis; boleh diabaikan.",
});

test.beforeAll(async () => {
  test.skip(
    await isProductionApi(),
    "API_URL menunjuk API produksi; uji ini membuat dan menghapus akun",
  );
  superAdmin = await apiLogin(SEED_USERS.superAdmin);
  // Guru SD IT in the seed.
  teacher = await apiLogin(SEED_USERS.teacher);

  const units = await apiRequest<{ data: Array<{ id: string; type: string }> }>(
    superAdmin,
    "GET",
    "/units?limit=50",
  );
  const unitOf = (type: string) => units.data.find((u) => u.type === type)!.id;
  const create = async (unitType: string, tag: string) => {
    const res = await apiRequest<{ data: { id: string } }>(
      superAdmin,
      "POST",
      "/users",
      {
        name: `Uji Penerima ${tag}`,
        email: `penerima.${tag}.${STAMP}@example.test`,
        password: PASSWORD,
        role: "PARENT",
        unitId: unitOf(unitType),
      },
    );
    created.push(res.data.id);
    return res.data.id;
  };
  otherUnit = await create("SMP_IT", "smp");
  ownUnit = await create("SD_IT", "sd");
});

test.afterAll(async () => {
  for (const id of created)
    await apiRequest(superAdmin, "DELETE", `/users/${id}`).catch(
      () => undefined,
    );
});

test("a guru notifies people of their own unit, and no one else", async () => {
  expect(
    await statusOf(
      apiRequest(teacher, "POST", "/notifications", note(otherUnit)),
    ),
  ).toBe(403);
  expect(
    await statusOf(
      apiRequest(teacher, "POST", "/notifications", note(ownUnit)),
    ),
  ).toBe(201);
});

test("a bulk send with one outsider is refused whole", async () => {
  const { title, message } = note(ownUnit);
  expect(
    await statusOf(
      apiRequest(teacher, "POST", "/notifications/bulk", {
        userIds: [ownUnit, otherUnit],
        title,
        message,
      }),
    ),
  ).toBe(403);
});

test("Super Admin reaches every unit, and the sender is recorded", async () => {
  const res = await apiRequest<{
    data: { id: string; data: { sentBy?: string } };
  }>(superAdmin, "POST", "/notifications", note(otherUnit));
  expect(res.data.data.sentBy).toBe(superAdmin.user.id);
});
