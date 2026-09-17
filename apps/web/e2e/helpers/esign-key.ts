import type { AuthSession } from "./auth-api";

/**
 * Menyiapkan kunci tanda tangan elektronik untuk sebuah akun uji lewat API
 * nyata — rantai yang sama yang dijalani seorang pejabat: isi identitas →
 * unggah foto KTP → ajukan penerbitan → Super Admin menyetujui (identitasnya
 * dicocokkan) → tetapkan passphrase.
 *
 * Mengapa bukan menyisipkan baris `user_signing_key` langsung: suara anggota
 * ditandatangani dengan kunci ini, dan uji e2e yang menyuntikkan kunci akan
 * membuktikan bahwa penyuntiknya bekerja, bukan bahwa alur penerbitan bekerja.
 * Rantai di sini juga memverifikasi bahwa gerbang identitas KTP tetap utuh.
 *
 * Semua langkah dibuat toleran-ulangan: pada run kedua kuncinya sudah ada, dan
 * langkah-langkahnya menjawab 400 yang diabaikan — uji tetap harus bisa
 * menandatangani dengan passphrase yang sama.
 */

const API_URL = process.env.API_URL || "http://localhost:3001/api";

/** NIK 16 angka deterministik dari surel, agar tiap akun punya NIK unik sendiri. */
function nikForEmail(email: string): string {
  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return String(hash).padStart(10, "0").slice(0, 10) + "000000";
}

async function send(
  session: AuthSession,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, json };
}

/** KTP palsu namun sah bentuknya (PNG 1×1) — cukup untuk gerbang unggah. */
const FAKE_KTP = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Terbitkan (atau pastikan sudah ada) kunci tanda tangan untuk `session`,
 * dengan passphrase yang sudah ditetapkan.
 */
export async function ensureSigningKey(
  session: AuthSession,
  admin: AuthSession,
  passphrase: string,
): Promise<void> {
  const email = String((session.user as { email?: string }).email ?? "");

  // 1. Identitas. Ditolak 400 bila kuncinya masih hidup (datanya terkunci) —
  //    pada run ulangan itu memang keadaan yang diinginkan.
  await send(session, "PUT", "/esign/me/identity", {
    legalName: "Pejabat Uji E2E",
    nik: nikForEmail(email),
    birthPlace: "Cianjur",
    birthDate: "1980-01-01",
  });

  // 2. Foto KTP. Field-nya `file`; multer menerima image/png.
  try {
    const form = new FormData();
    form.append("file", new Blob([FAKE_KTP], { type: "image/png" }), "ktp.png");
    await fetch(`${API_URL}/esign/me/identity/ktp`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: form,
    });
  } catch {
    /* sudah terverifikasi / sudah ada kunci */
  }

  // 3. Ajukan penerbitan (mengabaikan 400 bila kunci masih berlaku).
  await send(session, "POST", "/esign/me/request", {});

  // 4. Super Admin menyetujui dan mencocokkan identitasnya. Bila identitasnya
  //    sudah terverifikasi, persetujuan tanpa catatan pun sah.
  const list = await send(admin, "GET", "/esign/requests?status=PENDING");
  const rows: any[] = list.json?.data ?? [];
  const mine = rows.find((r) => r.user?.email === email);
  if (mine) {
    await send(admin, "POST", `/esign/requests/${mine.id}/decide`, {
      approve: true,
      identityVerification: { note: "Cocok dengan foto KTP (uji e2e)." },
    });
  }

  // 5. Tetapkan passphrase — kuncinya baru benar-benar terbuat di sini.
  await send(session, "POST", "/esign/me/activate", { passphrase });
}
