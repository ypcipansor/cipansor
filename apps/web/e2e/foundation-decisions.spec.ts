import { test, expect, type Page } from "@playwright/test";
import {
  apiLogin,
  apiRequest,
  injectSession,
  SEED_USERS,
  type SeedRole,
} from "./helpers/auth-api";
import { ensureSigningKey } from "./helpers/esign-key";

/**
 * Keputusan & Risalah Organ Yayasan (mufakat/voting + e-seal), dijalankan
 * terhadap API + DB yang benar-benar di-seed.
 *
 * Empat rute baru diuji di sini — daftar, buat, detail + voting lewat modal
 * passphrase, dan verifikasi publik — beserta RBAC-nya. Tiga hal yang sulit
 * dilihat lewat review dan hanya terbukti lewat alur nyata:
 *
 *  1. **Kuorum terkunci.** Snapshot anggota diambil saat create; bukti
 *     terbaiknya adalah sirkuler yang anggotanya menyetujui sehingga status
 *     berpindah ke APPROVED, PDF final terbit, dan e-seal terverifikasi.
 *  2. **Suara ditandatangani.** Vote menuntut kunci tanda tangan hidup +
 *     passphrase; pemilih di luar snapshot ditolak walau perannya anggota
 *     organ lain, dan Super Admin pun bukan anggota organ yang memutus.
 *  3. **Verifikasi publik.** Halaman `/public/verify-decision` harus terbaca
 *     oleh pemindai QR TANPA sesi — dulu halaman ini berada di balik tembok
 *     login sehingga tautan di PDF tidak berguna bagi orang luar.
 *
 * Sirkuler PENGAWAS dipakai karena (a) default kuorumnya MUTLAK sehingga
 * penyetujuan seluruh anggota menuntaskan keputusan, dan (b) seed hanya punya
 * satu anggota Pengawas aktif — jadi satu suara menuntaskan sirkuler dan
 * memaksa jalur PDF + e-seal berjalan, tanpa bergantung pada berapa banyak
 * Pembina yang kebetulan ada di seed.
 */

test.describe.configure({ mode: "serial" });

type Envelope<T> = { success: boolean; data: T };
type DecisionRow = { id: string; subject: string; status: string };
type VerifyResult = {
  found: boolean;
  isValid: boolean;
  status: string | null;
  digest: string | null;
  archiveDigest: string | null;
  digestOk: boolean | null;
  sealVerified: boolean | null;
  reason: string | null;
};

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/** Passphrase kunci tanda tangan untuk akun uji organ. */
const PASSPHRASE = "KeputusanE2E123!";

const subject = `Pemberhentian Sementara Pengurus Uji E2E ${Date.now()}`;
let decisionId = "";
let verificationToken = "";

async function signIn(page: Page, role: SeedRole) {
  await injectSession(page, await apiLogin(SEED_USERS[role]));
}

test.beforeAll(async () => {
  // Kunci tanda tangan pemilih harus hidup lebih dulu; tanpa itu vote ditolak
  // `assertCanSign` dan sirkuler tak pernah tuntas.
  const admin = await apiLogin(SEED_USERS.superAdmin);
  const pengawas = await apiLogin(SEED_USERS.pengawas);
  await ensureSigningKey(pengawas, admin, PASSPHRASE);
});

test.describe("daftar keputusan", () => {
  test("Super Admin membuka daftar dan melihat aksi buat", async ({ page }) => {
    await signIn(page, "superAdmin");
    await page.goto("/foundation/decisions");

    await expect(
      page.getByRole("heading", { name: "Keputusan & Risalah Organ" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("link", { name: /Buat Keputusan/ }),
    ).toBeVisible();
  });

  test("filter 'Semua organ' dikosongkan tanpa mengirim nilai enum invalid (#13)", async ({
    page,
  }) => {
    await signIn(page, "superAdmin");
    await page.goto("/foundation/decisions");
    await expect(
      page.getByRole("heading", { name: "Keputusan & Risalah Organ" }),
    ).toBeVisible({ timeout: 20000 });

    // Regresi: SelectItem value="all" pernah diteruskan apa adanya ke API dan
    // ditolak skema enum, sehingga daftar kosong tanpa penjelasan.
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/foundation/decisions")) requests.push(r.url());
    });

    const organFilter = page.getByRole("combobox").first();
    await organFilter.click();
    await page.getByRole("option", { name: "Dewan Pengawas" }).click();
    await expect
      .poll(() => requests.some((u) => /organType=PENGAWAS/.test(u)))
      .toBe(true);

    // Filter dikembalikan ke "Semua organ": pilihannya benar-benar kosong lagi
    // (bukan nilai enum invalid), dan tak satu pun permintaan memuat "all".
    await organFilter.click();
    await page.getByRole("option", { name: "Semua organ" }).click();
    await expect(organFilter).toHaveText(/Semua organ/);
    expect(requests.some((u) => /organType=all/.test(u))).toBe(false);
  });

  test("guru tidak melihat menu keputusan yayasan", async ({ page }) => {
    await signIn(page, "teacher");
    await page.goto("/teacher");
    // Menu adalah kontrak yang dilihat pengguna: peran di luar yayasan tidak
    // diberi pintu masuk ke keputusan organ, dan API-nya pun menolak.
    const nav = page.getByRole("navigation");
    await expect(nav.first()).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("link", { name: /Keputusan & Notulen|Keputusan & Risalah/ }),
    ).toHaveCount(0);
  });

  test("peran read-only tidak melihat aksi tulis (#6)", async ({ page }) => {
    // YAYASAN_BENDAHARA & YAYASAN_ANGGOTA hanya READ di routes
    // (`WRITE` mengecualikan keduanya), jadi tombol "Buat Keputusan" pasti
    // berakhir 403 saat diklik. UI tidak boleh menawarkannya.
    await signIn(page, "bendahara");
    await page.goto("/foundation/decisions");

    await expect(
      page.getByRole("heading", { name: "Keputusan & Risalah Organ" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("link", { name: /Buat Keputusan/ }),
    ).toHaveCount(0);
    // Daftarnya sendiri tetap terbaca — yang hilang hanya aksinya. Isinya
    // bergantung pada data seed, jadi yang dipaku adalah halaman daftarnya
    // benar-benar merender (heading + kontrol filter).
    await expect(
      page.getByRole("combobox").first(),
    ).toBeVisible();
  });

  test("peran read-only ditolak API saat mencoba menulis (#6)", async () => {
    const bendahara = await apiLogin(SEED_USERS.bendahara);
    const res = await fetch(`${API_URL}/foundation/decisions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bendahara.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organType: "PENGAWAS",
        kind: "CIRCULAR",
        subject: "Uji bendahara read-only",
        body: "Isi uji yang cukup panjang untuk lolos validasi skema.",
        decisionType: "pemberhentian-pengurus",
      }),
    });
    expect(res.status).toBe(403);
  });

  test("Super Admin mengelola aturan kuorum (#7)", async ({ page }) => {
    // Endpoint GET/PUT /foundation/rules sudah ada tetapi tak punya halaman;
    // hook-nya menganggur. Halaman ini menutup celah itu.
    await signIn(page, "superAdmin");
    await page.goto("/foundation/decisions/rules");

    await expect(
      page.getByRole("heading", { name: "Aturan Kuorum Organ" }),
    ).toBeVisible({ timeout: 20000 });

    // Pilih pasangan organ × cara, lalu simpan. Trigger Select tidak terikat
    // <label> (tak ada id), jadi dipilih lewat urutan: organ, cara, kuorum
    // hadir, kuorum sah.
    const combos = page.getByRole("combobox");
    await combos.nth(1).click();
    await page.getByRole("option", { name: /Rapat/ }).click();

    await combos.nth(3).click();
    await page.getByRole("option", { name: /Dua pertiga/ }).click();
    await page.locator('input[type="number"]').nth(1).fill("0.67");
    await page.getByRole("button", { name: "Simpan Aturan" }).click();

    await expect(page.getByText("Aturan tersimpan.")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("cell", { name: /TWO_THIRDS/ })).toBeVisible();
  });

  test("menu Aturan Kuorum hanya untuk Super Admin (#7)", async ({ page }) => {
    await signIn(page, "pengawas");
    await page.goto("/foundation/decisions");
    await expect(
      page.getByRole("heading", { name: "Keputusan & Risalah Organ" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("link", { name: /Aturan Kuorum/ }),
    ).toHaveCount(0);
  });

  test("API menolak guru pada daftar dan pembuatan keputusan", async () => {
    const teacher = await apiLogin(SEED_USERS.teacher);
    const list = await fetch(`${API_URL}/foundation/decisions`, {
      headers: { authorization: `Bearer ${teacher.accessToken}` },
    });
    expect(list.status).toBe(403);
    const create = await fetch(`${API_URL}/foundation/decisions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${teacher.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organType: "PENGAWAS",
        kind: "CIRCULAR",
        subject: "Uji guru",
        body: "Isi uji yang cukup panjang untuk lolos validasi skema.",
        decisionType: "pemberhentian-pengurus",
      }),
    });
    expect(create.status).toBe(403);
  });
});

test.describe("membuat keputusan", () => {
  test("organ yang tidak berwenang atas jenis keputusan ditolak (#5)", async () => {
    const ketua = await apiLogin(SEED_USERS.ketuaPengurus);
    // `pengesahan-anggaran` adalah kewenangan Pembina. Ketua Pengurus tetap
    // anggota organ Pengurus, tetapi organnya tidak berwenang atas jenis ini.
    const res = await fetch(`${API_URL}/foundation/decisions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ketua.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organType: "PENGURUS",
        kind: "CIRCULAR",
        subject: "Uji kewenangan yang ditolak",
        body: "Isi uji yang cukup panjang untuk lolos validasi skema.",
        decisionType: "pengesahan-anggaran",
      }),
    });
    expect(res.status).toBe(403);
  });

  test("Super Admin membuka sirkuler Pengawas lewat form", async ({ page }) => {
    await signIn(page, "superAdmin");
    await page.goto("/foundation/decisions/new");

    await expect(
      page.getByRole("heading", { name: "Buat Keputusan Baru" }),
    ).toBeVisible({ timeout: 20000 });

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "Dewan Pengawas" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: /Sirkuler/ }).click();

    await page
      .getByPlaceholder("mis. pengesahan-rencana-kerja")
      .fill("pemberhentian-sementara-pengurus");
    await page
      .getByPlaceholder("mis. Pengesahan Rencana Kerja Yayasan 2026")
      .fill(subject);
    await page
      .getByPlaceholder("Uraian keputusan yang akan menjadi risalah PDF…")
      .fill(
        "Memberhentikan sementara seorang pengurus karena dugaan pelanggaran anggaran dasar, sampai pemeriksaan selesai.",
      );

    await page.getByRole("button", { name: "Buka Voting" }).click();

    await expect(page).toHaveURL(/foundation\/decisions\/[0-9a-f-]{36}/, {
      timeout: 20000,
    });
    decisionId = page.url().split("/").pop() as string;
    expect(decisionId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: subject }),
    ).toBeVisible();
  });

  test("sirkuler baru berstatus VOTING dan menampilkan ringkasan kuorum", async () => {
    expect(decisionId).toBeTruthy();
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const detail = await apiRequest<
      Envelope<{
        status: string;
        memberCount: number;
        voteSummary: { active: number };
        canVote: boolean;
      }>
    >(admin, "GET", `/foundation/decisions/${decisionId}`);
    expect(detail.data.status).toBe("VOTING");
    expect(detail.data.memberCount).toBe(1);
    expect(detail.data.voteSummary.active).toBe(1);
  });
});

test.describe("voting dengan modal passphrase", () => {
  test("pemilih di luar SNAPSHOT ditolak walau rolenya anggota organ lain (#4)", async () => {
    expect(decisionId).toBeTruthy();
    // Pembina bukan anggota snapshot Pengawas → 403, bukan 200.
    const pembina = await apiLogin(SEED_USERS.pembina);
    const res = await fetch(
      `${API_URL}/foundation/decisions/${decisionId}/vote`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${pembina.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ choice: "APPROVE", passphrase: PASSPHRASE }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Super Admin pun bukan anggota organ, sehingga tidak boleh bersuara (#4)", async () => {
    expect(decisionId).toBeTruthy();
    // Super Admin mengelola sistem dan boleh MEMBUAT, tetapi bukan anggota
    // organ yang memutus — jadi suaranya ditolak.
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const res = await fetch(
      `${API_URL}/foundation/decisions/${decisionId}/vote`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${admin.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ choice: "APPROVE", passphrase: PASSPHRASE }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("anggota snapshot menandatangani suara lewat modal → APPROVED + e-seal (#2, #3)", async ({
    page,
  }) => {
    expect(decisionId).toBeTruthy();
    await signIn(page, "pengawas");
    await page.goto(`/foundation/decisions/${decisionId}`);

    await expect(
      page.getByRole("heading", { level: 1, name: subject }),
    ).toBeVisible({ timeout: 20000 });

    const openDialog = page.getByRole("button", {
      name: /Tandatangani & Suara/,
    });
    await expect(openDialog).toBeVisible();
    await openDialog.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Passphrase pribadi Anda").fill(PASSPHRASE);
    await dialog.getByRole("button", { name: /Tandatangani/ }).click();

    // Kuorum MUTLAK Pengawas tercapai (1/1) → APPROVED dan PDF di-e-seal.
    await expect(page.getByText("Disahkan", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText(/Di-e-seal & disimpan/)).toBeVisible();
    await expect(page.getByText(/SHA-256:/)).toBeVisible();

    // Ambil token verifikasi untuk uji publik di bawah.
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const list = await apiRequest<Envelope<DecisionRow[]>>(
      admin,
      "GET",
      "/foundation/decisions?limit=50",
    );
    expect(list.data.find((d) => d.id === decisionId)?.status).toBe("APPROVED");

    const detail = await apiRequest<
      Envelope<{ verificationToken: string | null; votes: unknown[] }>
    >(admin, "GET", `/foundation/decisions/${decisionId}`);
    verificationToken = detail.data.verificationToken ?? "";
    expect(verificationToken).toBeTruthy();
  });

  test("suara ganda ditolak", async () => {
    expect(decisionId).toBeTruthy();
    const pengawas = await apiLogin(SEED_USERS.pengawas);
    const res = await fetch(
      `${API_URL}/foundation/decisions/${decisionId}/vote`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${pengawas.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ choice: "APPROVE", passphrase: PASSPHRASE }),
      },
    );
    expect(res.status).toBe(400);
  });
});

test.describe("verifikasi publik", () => {
  test("pemindai anonim melihat hasil tanpa login (#8)", async ({ page }) => {
    expect(verificationToken).toBeTruthy();
    // Tanpa injectSession: halaman ini untuk orang luar (dinas, wali santri).
    await page.goto(`/public/verify-decision?token=${verificationToken}`);

    await expect(page).not.toHaveURL(/login/, { timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "Verifikasi Keputusan Yayasan" }),
    ).toBeVisible();
    await expect(page.getByText(subject)).toBeVisible({ timeout: 20000 });
    // Arsip memeriksa dirinya sendiri, dan e-seal diverifikasi ulang (#12).
    await expect(page.getByText(/E-seal Yayasan terverifikasi/)).toBeVisible();
    // Jalur token tidak memeriksa byte yang dipegang pemindai, jadi salinan
    // yang benar di sini adalah "arsip server" — kalimat "berkas yang Anda
    // unggah cocok byte-per-byte" hanya keluar lewat jalur unggahan.
    await expect(
      page.getByText(/Arsip server cocok dengan digest yang ditandatangani/),
    ).toBeVisible();
  });

  test("token tak dikenal menjawab 'tidak ditemukan', bukan galat (#14)", async ({
    page,
  }) => {
    await page.goto("/public/verify-decision?token=tidak-ada-token-seperti-ini");
    await expect(page.getByText(/tidak ditemukan/i).first()).toBeVisible({
      timeout: 20000,
    });
  });

  test("verifikasi mengembalikan digest arsip yang cocok dan e-seal sah (#12)", async () => {
    expect(verificationToken).toBeTruthy();
    const res = await fetch(
      `${API_URL}/foundation/verify?token=${verificationToken}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope<VerifyResult>;
    expect(body.data.found).toBe(true);
    expect(body.data.status).toBe("APPROVED");
    expect(body.data.digest).toBeTruthy();
    expect(body.data.archiveDigest).toBe(body.data.digest);
    expect(body.data.digestOk).toBe(true);
    expect(body.data.sealVerified).toBe(true);
    // `isValid` adalah satu-satunya putusan yang dibaca klien.
    expect(body.data.isValid).toBe(true);
  });

  /**
   * Regresi BUG KRITIS: PDF palsu yang mempertahankan token asli.
   *
   * Dipisah ke jalur unggahan di bawah: jalur token tidak pernah melihat byte
   * yang dipegang pemindai, jadi hasil palsu hanya dapat dicegah dengan
   * membandingkan hash berkas unggahan.
   */
  test("unggahan PDF asli dinyatakan SAH lewat /foundation/verify-pdf", async () => {
    expect(verificationToken).toBeTruthy();
    // Ambil byte PDF asli dari endpoint unduhan (sesi staf), lalu unggah ulang
    // sebagai pemindai anonim — inilah alur yang membuktikan keabsahan.
    const admin = await apiLogin(SEED_USERS.superAdmin);
    const pdfRes = await fetch(
      `${API_URL}/foundation/decisions/${decisionId}/document`,
      { headers: { authorization: `Bearer ${admin.accessToken}` } },
    );
    expect(pdfRes.status).toBe(200);
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

    const form = new FormData();
    form.append(
      "file",
      new Blob([pdfBytes], { type: "application/pdf" }),
      "risalah.pdf",
    );
    const verifyRes = await fetch(`${API_URL}/foundation/verify-pdf`, {
      method: "POST",
      body: form,
    });
    expect(verifyRes.status).toBe(200);
    const body = (await verifyRes.json()) as Envelope<VerifyResult>;
    expect(body.data.found).toBe(true);
    expect(body.data.digestOk).toBe(true);
    expect(body.data.sealVerified).toBe(true);
    expect(body.data.isValid).toBe(true);
  });

  /**
   * Regresi BUG KRITIS: PDF palsu yang mempertahankan token asli.
   *
   * Berkas yang isinya diubah harus DITOLAK oleh jalur unggahan, meskipun
   * tokennya sah — inilah yang tidak dilakukan jalur token.
   */
  test("unggahan PDF yang isinya diubah ditolak (token asli tak menolong)", async () => {
    const forged = Buffer.from(
      "%PDF-1.7 dokumen karangan yang menyisipkan token asli " +
        verificationToken +
        " agar lolos\n%%EOF",
    );
    const form = new FormData();
    form.append(
      "file",
      new Blob([forged], { type: "application/pdf" }),
      "palsu.pdf",
    );
    const res = await fetch(`${API_URL}/foundation/verify-pdf`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Envelope<VerifyResult>;
    expect(body.data.found).toBe(false);
    expect(body.data.isValid).toBe(false);
  });

  test("halaman publik menyediakan unggahan berkas, bukan hanya token", async ({
    page,
  }) => {
    await page.goto("/public/verify-decision");
    await expect(
      page.getByRole("heading", { name: "Verifikasi Keputusan Yayasan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByLabel("Berkas PDF")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verifikasi Berkas" }),
    ).toBeVisible();
  });
});

test.describe("unduh risalah", () => {
  test("PDF final dapat diunduh sebagai berkas (bukan tautan palsu)", async ({
    page,
  }) => {
    expect(decisionId).toBeTruthy();
    await signIn(page, "superAdmin");
    await page.goto(`/foundation/decisions/${decisionId}`);

    const download = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByRole("button", { name: /Unduh Risalah/ }).click(),
    ]).then(([d]) => d);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});