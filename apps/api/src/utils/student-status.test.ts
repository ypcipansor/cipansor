import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  STUDENT_STATUS_VALUES,
  CLASS_ENROLLMENT_STATUS_VALUES,
  isStudentStatus,
  isClassEnrollmentStatus,
} from '@cipansor/shared';
import { listStudentsQuerySchema, updateStudentSchema } from '@cipansor/shared';

/**
 * Apa yang dijaga berkas ini, dan mengapa bentuknya begini.
 *
 * Cacatnya: `students.status` dan `class_enrollments.status` bertipe TEXT bebas
 * berisi huruf kecil, sementara 45 tempat di API menyaring atau MENULIS 'ACTIVE'
 * huruf besar. Postgres peka huruf, jadi semuanya nol — tanpa galat, tanpa
 * peringatan, tanpa satu baris log. Tidak ada uji yang bisa merah, karena tidak
 * ada yang gagal; yang terjadi hanya angka yang salah. Jadi penjaganya harus
 * membaca SUMBER.
 *
 * Dan itu menuntut kehati-hatian, karena pemindai yang salah lebih buruk
 * daripada tidak ada pemindai. Dua kali terbukti saat menulis perbaikan ini:
 *
 *   1. "ada `prisma.student` dalam 400 karakter sebelumnya" salah melabeli 20
 *      tempat — `enrollments` adalah nama relasi pada TUJUH model dengan ENAM
 *      tipe (Student/Class → ClassEnrollment, Halaqoh → TakhosusEnrollment,
 *      Extracurricular → ExtracurricularEnrollment, dan tiga lainnya). Dua di
 *      antaranya ber-enum Prisma, sehingga huruf besar di sana BENAR. Satu
 *      perubahan salah sempat lolos dan harus dibatalkan.
 *   2. Versi pertama uji ini memakai jendela 900 karakter sesudah pemanggilan
 *      dan langsung memerah palsu: `prisma.student.findMany({…})` diikuti
 *      `prisma.takhosusEnrollment.findMany({ status: 'ACTIVE' })` 300 karakter
 *      kemudian, yang memang benar.
 *
 * Karena itu tidak ada jendela di sini. Argumen pemanggilan diambil dengan
 * **kurung berimbang** (melompati string dan komentar), lalu hanya `status:`
 * yang berada pada tingkat LANGSUNG di bawah `where:`/`data:`/`create:`/`update:`
 * milik pemanggilan itu yang dinilai — objek relasi bersarang di dalamnya
 * sengaja dilewati, karena modelnya tidak tertulis di situ.
 *
 * Bentuk yang dinilai, semuanya tidak ambigu:
 *   - `prisma.student.<op>(…)` / `tx.student.<op>(…)`
 *   - `prisma.classEnrollment.<op>(…)` / `tx.classEnrollment.<op>(…)`
 *   - `Prisma.StudentWhereInput` / `Prisma.ClassEnrollmentWhereInput`
 *   - `status` di dalam `enrollments: { where: {…} }` yang bersarang di bawah
 *     kunci `student:` — `Student.enrollments` SELALU `ClassEnrollment`.
 *
 * `enrollments:` tanpa induk `student:` sengaja TIDAK diperiksa. Itu bukan
 * kelalaian: memeriksanya tanpa menyelesaikan nama relasi akan memerahkan kode
 * yang benar, dan uji yang memerah palsu akan dimatikan orang.
 */

const API_SRC = join(__dirname, '..');
const EJAAN_SALAH = ['ACTIVE', 'INACTIVE', 'GRADUATED', 'DROPPED_OUT', 'COMPLETED', 'graduated'];

function berkasTs(dir: string): string[] {
  const out: string[] = [];
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) out.push(...berkasTs(p));
    else if (nama.endsWith('.ts') && !nama.includes('.test.')) out.push(p);
  }
  return out;
}

/**
 * Akhir dari blok yang dibuka di `mulai` (indeks karakter pembuka), dengan
 * string dan komentar dilompati. Mengembalikan indeks SESUDAH penutupnya, atau
 * -1 bila tidak berimbang.
 */
function akhirBlok(s: string, mulai: number): number {
  const buka = s[mulai];
  const tutup = buka === '(' ? ')' : buka === '{' ? '}' : buka === '[' ? ']' : '';
  if (!tutup) return -1;
  let depth = 0;
  for (let i = mulai; i < s.length; i++) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') {
      i = s.indexOf('\n', i);
      if (i < 0) return -1;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      i = s.indexOf('*/', i);
      if (i < 0) return -1;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < s.length; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === c) break;
      }
      continue;
    }
    if (c === buka) depth++;
    else if (c === tutup) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** `status: 'X'` yang berada pada tingkat LANGSUNG di dalam objek `obj`. */
function statusTingkatLangsung(obj: string): Array<{ nilai: string; offset: number }> {
  const hasil: Array<{ nilai: string; offset: number }> = [];
  let depth = 0;
  for (let i = 0; i < obj.length; i++) {
    const c = obj[i];
    if (c === '/' && obj[i + 1] === '/') {
      i = obj.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '/' && obj[i + 1] === '*') {
      i = obj.indexOf('*/', i);
      if (i < 0) break;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (i++; i < obj.length; i++) {
        if (obj[i] === '\\') i++;
        else if (obj[i] === q) break;
      }
      continue;
    }
    if (c === '{' || c === '[') {
      depth++;
      continue;
    }
    if (c === '}' || c === ']') {
      depth--;
      continue;
    }
    if (depth === 1 && obj.startsWith('status:', i)) {
      const m = /^status:\s*['"]([A-Za-z_]+)['"]/.exec(obj.slice(i));
      if (m) hasil.push({ nilai: m[1], offset: i });
    }
  }
  return hasil;
}

interface Temuan {
  model: string;
  nilai: string;
  offset: number;
}

function pindai(isi: string): Temuan[] {
  const temuan: Temuan[] = [];

  const nilaiDariArgumen = (model: string, argMulai: number) => {
    const argAkhir = akhirBlok(isi, argMulai);
    if (argAkhir < 0) return;
    const arg = isi.slice(argMulai, argAkhir);
    // hanya objek where/data/create/update MILIK pemanggilan ini
    const kunci = /\b(where|data|create|update)\s*:\s*\{/g;
    for (let k = kunci.exec(arg); k; k = kunci.exec(arg)) {
      const objMulai = argMulai + k.index + k[0].length - 1;
      const objAkhir = akhirBlok(isi, objMulai);
      if (objAkhir < 0) continue;
      for (const s of statusTingkatLangsung(isi.slice(objMulai, objAkhir))) {
        temuan.push({ model, nilai: s.nilai, offset: objMulai + s.offset });
      }
    }
  };

  const langsung =
    /(?:prisma|tx)\.(student|classEnrollment)\.(?:count|findMany|findFirst|findUnique|update|updateMany|upsert|create|createMany|aggregate|groupBy|delete|deleteMany)\s*\(/g;
  for (let m = langsung.exec(isi); m; m = langsung.exec(isi)) {
    nilaiDariArgumen(m[1], m.index + m[0].length - 1);
  }

  // `const x: Prisma.StudentWhereInput = { … }`
  const bertipe = /Prisma\.(Student|ClassEnrollment)WhereInput\s*=\s*\{/g;
  for (let m = bertipe.exec(isi); m; m = bertipe.exec(isi)) {
    const model = m[1][0].toLowerCase() + m[1].slice(1);
    const objMulai = m.index + m[0].length - 1;
    const objAkhir = akhirBlok(isi, objMulai);
    if (objAkhir < 0) continue;
    for (const s of statusTingkatLangsung(isi.slice(objMulai, objAkhir))) {
      temuan.push({ model, nilai: s.nilai, offset: objMulai + s.offset });
    }
  }

  // `student: { … enrollments: { where: { … } } }` → Student.enrollments = ClassEnrollment
  const induk = /\bstudent:\s*\{/g;
  for (let m = induk.exec(isi); m; m = induk.exec(isi)) {
    const sMulai = m.index + m[0].length - 1;
    const sAkhir = akhirBlok(isi, sMulai);
    if (sAkhir < 0) continue;
    const blokStudent = isi.slice(sMulai, sAkhir);
    const rel = /\benrollments:\s*\{\s*(?:some:\s*\{)?/g;
    for (let r = rel.exec(blokStudent); r; r = rel.exec(blokStudent)) {
      const relMulai = sMulai + r.index + r[0].indexOf('{');
      const relAkhir = akhirBlok(isi, relMulai);
      if (relAkhir < 0) continue;
      const relBlok = isi.slice(relMulai, relAkhir);
      const w = /\bwhere\s*:\s*\{/.exec(relBlok);
      const objMulai = w ? relMulai + w.index + w[0].length - 1 : relMulai;
      const objAkhir = akhirBlok(isi, objMulai);
      if (objAkhir < 0) continue;
      for (const s of statusTingkatLangsung(isi.slice(objMulai, objAkhir))) {
        temuan.push({ model: 'classEnrollment', nilai: s.nilai, offset: objMulai + s.offset });
      }
    }
  }

  return temuan;
}

describe('kosakata status santri dan pendaftaran kelas', () => {
  describe('sumber tunggalnya', () => {
    it('seluruh nilainya huruf kecil — kolomnya TEXT dan Postgres peka huruf', () => {
      for (const v of [...STUDENT_STATUS_VALUES, ...CLASS_ENROLLMENT_STATUS_VALUES]) {
        expect(v).toBe(v.toLowerCase());
      }
    });

    it('kedua kosakata BEDA, jadi tidak boleh dipertukarkan', () => {
      expect(STUDENT_STATUS_VALUES).toContain('alumni');
      expect(CLASS_ENROLLMENT_STATUS_VALUES).not.toContain('alumni');
      expect(CLASS_ENROLLMENT_STATUS_VALUES).toContain('completed');
      expect(STUDENT_STATUS_VALUES).not.toContain('completed');
    });

    it('penjaga tipenya menolak ejaan huruf besar', () => {
      expect(isStudentStatus('active')).toBe(true);
      expect(isStudentStatus('ACTIVE')).toBe(false);
      expect(isStudentStatus('GRADUATED')).toBe(false);
      expect(isClassEnrollmentStatus('completed')).toBe(true);
      expect(isClassEnrollmentStatus('COMPLETED')).toBe(false);
      expect(isClassEnrollmentStatus('alumni')).toBe(false);
    });
  });

  describe('kontrak API — diuji dengan memakainya, bukan dengan membaca teksnya', () => {
    it('filter daftar menerima ejaan yang ADA di kolomnya', () => {
      expect(listStudentsQuerySchema.parse({ status: 'active' }).status).toBe('active');
      expect(listStudentsQuerySchema.parse({ status: 'alumni' }).status).toBe('alumni');
    });

    it('filter daftar MENOLAK kosakata lama yang tidak pernah ada di kolomnya', () => {
      // Sampai 2026-09-13 kontraknya justru kebalikannya: hanya empat nilai
      // huruf besar ini yang lolos, dan tidak satu pun pernah ada di kolomnya.
      for (const lama of ['ACTIVE', 'INACTIVE', 'GRADUATED', 'DROPPED_OUT']) {
        expect(listStudentsQuerySchema.safeParse({ status: lama }).success).toBe(false);
      }
    });

    it('updateStudentSchema membuang status — mengubahnya harus lewat alumni.service', () => {
      const hasil = updateStudentSchema.parse({ status: 'alumni' } as never);
      expect('status' in hasil).toBe(false);
    });
  });

  describe('migrasi mengikat kosakata yang sama', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20260913000000_student_and_enrollment_status_check/migration.sql'
      ),
      'utf-8'
    );

    it('CHECK students_status_check memuat tepat nilai STUDENT_STATUS', () => {
      expect(sql).toMatch(/CONSTRAINT "students_status_check"/);
      expect(sql).toContain(
        `CHECK ("status" IN (${STUDENT_STATUS_VALUES.map((v) => `'${v}'`).join(', ')}))`
      );
    });

    it('CHECK class_enrollments_status_check memuat tepat nilai CLASS_ENROLLMENT_STATUS', () => {
      expect(sql).toMatch(/CONSTRAINT "class_enrollments_status_check"/);
      expect(sql).toContain(
        `CHECK ("status" IN (${CLASS_ENROLLMENT_STATUS_VALUES.map((v) => `'${v}'`).join(', ')}))`
      );
    });

    it('idempoten — aman dijalankan berulang', () => {
      expect((sql.match(/IF NOT EXISTS/g) ?? []).length).toBe(2);
    });
  });

  describe('pemindai sumber', () => {
    const berkas = berkasTs(API_SRC);

    it('menemukan sumber untuk dipindai (penjaga atas penjaga)', () => {
      expect(berkas.length).toBeGreaterThan(100);
    });

    it('pemindainya benar-benar melihat status tingkat-langsung, dan melewati yang bersarang', () => {
      const contoh = `
        const a = prisma.student.findMany({ where: { unitId, status: 'ACTIVE' } });
        const b = prisma.student.findMany({ where: { takhosusEnrollments: { some: { status: 'ACTIVE' } } } });
        const c = prisma.takhosusEnrollment.findMany({ where: { status: 'ACTIVE' } });
      `;
      const t = pindai(contoh);
      expect(t).toHaveLength(1);
      expect(t[0]).toMatchObject({ model: 'student', nilai: 'ACTIVE' });
    });

    it('nol ejaan salah pada kueri yang modelnya tertulis', () => {
      const pelanggaran: string[] = [];
      for (const f of berkas) {
        const isi = readFileSync(f, 'utf-8');
        for (const t of pindai(isi)) {
          if (!EJAAN_SALAH.includes(t.nilai)) continue;
          if (t.model === 'classEnrollment' && t.nilai === 'completed') continue;
          const baris = isi.slice(0, t.offset).split('\n').length;
          pelanggaran.push(
            `${f.replace(API_SRC, 'apps/api/src')}:${baris} — ${t.model}.status = '${t.nilai}'`
          );
        }
      }
      expect(pelanggaran).toEqual([]);
    });
  });
});

/**
 * Kosong-kan komentar (baris, blok, dan komentar JSX berkurung kurawal) dengan spasi, sambil
 * mempertahankan string — `http://` di dalam string bukan komentar — dan
 * mempertahankan offset sehingga nomor baris tetap benar.
 */
function tanpaKomentar(s: string): string {
  const out = s.split('');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < s.length; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === c) break;
      }
      continue;
    }
    if (c === '/' && s[i + 1] === '/') {
      const akhir = s.indexOf('\n', i);
      const j = akhir < 0 ? s.length : akhir;
      for (let k = i; k < j; k++) out[k] = ' ';
      i = j;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const akhir = s.indexOf('*/', i + 2);
      const j = akhir < 0 ? s.length : akhir + 2;
      for (let k = i; k < j; k++) if (out[k] !== '\n') out[k] = ' ';
      i = j - 1;
    }
  }
  return out.join('');
}

describe('frontend memakai kosakata yang sama', () => {
  /**
   * Penjaga ini ada karena E2E PR ini sendiri memerah. Frontend punya
   * TUJUH salinan kosakata status santri — `hooks/use-students.ts`,
   * `services/students.service.ts`, `hooks/use-homeroom.ts`, `lib/constants.ts`,
   * dropdown di `students/page.tsx`, skema form `students/[id]/edit/page.tsx`,
   * dan 14 pemanggilan `useStudents({ status: "ACTIVE" })` yang disuruh oleh
   * tipe tiruan itu. Uji API tidak pernah melihat satu pun: faktanya ditulis di
   * `apps/web` tanpa satu tipe yang menghubungkannya ke `apps/api`.
   */
  const WEB_SRC = join(__dirname, '../../../web/src');
  const berkasWeb = (function kumpul(dir: string): string[] {
    const out: string[] = [];
    for (const nama of readdirSync(dir)) {
      const p = join(dir, nama);
      if (statSync(p).isDirectory()) out.push(...kumpul(p));
      else if (/\.(ts|tsx)$/.test(nama) && !/\.test\./.test(nama)) out.push(p);
    }
    return out;
  })(WEB_SRC);

  it('menemukan sumber web untuk dipindai (penjaga atas penjaga)', () => {
    expect(berkasWeb.length).toBeGreaterThan(200);
  });

  it('tidak ada "GRADUATED" / "DROPPED_OUT" di kode web — nilai itu tak dimiliki kosakata mana pun', () => {
    // "INACTIVE" sengaja tidak dilarang: guru, ekstrakurikuler, HR, dan alumni
    // punya status itu dengan sah.
    const temuan: string[] = [];
    for (const f of berkasWeb) {
      const kode = tanpaKomentar(readFileSync(f, 'utf-8'));
      const re = /["'`](GRADUATED|DROPPED_OUT)["'`]/g;
      for (let m = re.exec(kode); m; m = re.exec(kode)) {
        const baris = kode.slice(0, m.index).split('\n').length;
        temuan.push(`${f.replace(WEB_SRC, 'apps/web/src')}:${baris} — ${m[1]}`);
      }
    }
    expect(temuan).toEqual([]);
  });

  it('setiap permintaan daftar santri — useStudents({ status }) maupun get("/students", { params }) — memakai huruf kecil atau konstanta', () => {
    // Bentuk kedua ditambahkan setelah `use-executive-dashboard.ts` lolos dari
    // versi pertama penjaga ini: ia memanggil `apiClient.get("/students")`
    // langsung, tanpa hook, dan setelah API menolak ejaan lain grafiknya
    // diam-diam jadi nol.
    const temuan: string[] = [];
    for (const f of berkasWeb) {
      const kode = tanpaKomentar(readFileSync(f, 'utf-8'));
      const pemanggil = /\buseStudents\s*\(|\.get(?:<[^()\n]*?>)?\s*\(\s*["'`]\/students["'`]/g;
      for (let m = pemanggil.exec(kode); m; m = pemanggil.exec(kode)) {
        const buka = m.index + m[0].indexOf('(');
        const tutup = akhirBlok(kode, buka);
        if (tutup < 0) continue;
        const arg = kode.slice(buka, tutup);
        const s = /\bstatus:\s*["'`]([A-Za-z_]+)["'`]/.exec(arg);
        if (s && s[1] !== s[1].toLowerCase()) {
          const baris = kode.slice(0, buka + s.index).split('\n').length;
          temuan.push(`${f.replace(WEB_SRC, 'apps/web/src')}:${baris} — status: '${s[1]}'`);
        }
      }
    }
    expect(temuan).toEqual([]);
  });

  it('pemindai komentarnya tidak memakan string yang memuat //', () => {
    const contoh = `const u = "http://x"; // "GRADUATED"\n/* "DROPPED_OUT" */ const v = 'GRADUATED';`;
    const k = tanpaKomentar(contoh);
    expect(k).toContain('"http://x"');
    expect(k.match(/GRADUATED/g)).toHaveLength(1);
    expect(k).not.toContain('DROPPED_OUT');
  });
});
