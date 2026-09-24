import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * CI harus membangun skema lewat MIGRASI, bukan `prisma db push`.
 *
 * `db push` menyelaraskan basis data dengan `schema.prisma`, dan `schema.prisma`
 * tidak dapat menyatakan indeks unik parsial. Invariant "paling banyak satu
 * e-seal aktif" ditegakkan oleh
 * `foundation_eseals_single_active_key … WHERE revoked_at IS NULL`, yang HANYA
 * ada di SQL migrasi. Saat CI memakai `db push`, indeks itu tidak pernah
 * dibuat, sehingga suite DB-backed menguji skema yang tidak pernah dipakai
 * produksi — dan regresi konkurensi seal justru LOLOS CI.
 *
 * Itu bukan hipotesis: `integration.db.test.ts` ("dua penerbitan seal paralel
 * menghasilkan tepat satu seal aktif") gagal pada basis data hasil `db push`
 * dan lulus pada basis data hasil `migrate deploy`. Uji ini mengunci
 * penyediaan basis data di workflow agar tidak diam-diam kembali ke `db push`.
 *
 * Dibaca dari berkas karena yang diuji memang konfigurasi workflow — tidak ada
 * perilaku runtime yang dapat membuktikannya. Sisi perilakunya (indeks benar
 * benar menolak seal aktif kedua) diuji langsung terhadap PostgreSQL di
 * `integration.db.test.ts`.
 */
const WORKFLOWS_DIR = path.resolve(__dirname, '../../../../../../.github/workflows');
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

function workflowFiles(): { name: string; text: string }[] {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((name) => ({ name, text: fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8') }));
}

/**
 * Isi workflow tanpa baris komentar YAML.
 *
 * Komentar yang MENYEBUT `db:push` (mis. menjelaskan mengapa migrasi dipakai)
 * bukan pelanggaran; yang berbahaya adalah langkah yang benar-benar
 * menjalankannya. Menyaring komentar menjaga uji ini menguji perilaku, bukan
 * dokumentasi.
 */
function executableLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('penyediaan basis data CI memakai migrasi', () => {
  it('tidak ada workflow yang menjalankan `db:push`', () => {
    const offenders = workflowFiles()
      .filter((w) => /\bdb:push\b/.test(executableLines(w.text)))
      .map((w) => w.name);
    // `db:push` membuang indeks unik parsial milik migrasi tanpa peringatan.
    expect(offenders).toEqual([]);
  });

  it('workflow yang menjalankan suite API memakai `db:deploy`', () => {
    const ci = workflowFiles().find((w) => w.name === 'ci.yml');
    expect(ci, 'ci.yml tidak ditemukan').toBeDefined();
    // Suite API (termasuk integration.db.test.ts) berjalan di ci.yml; ia harus
    // menyiapkan basis data dengan migrasi, sama seperti produksi.
    expect(ci!.text).toMatch(/pnpm --filter api db:deploy/);
  });

  it('workflow e2e menyiapkan basis data dengan migrasi sebelum seed', () => {
    const e2e = workflowFiles().find((w) => w.name === 'e2e-tests.yml');
    expect(e2e, 'e2e-tests.yml tidak ditemukan').toBeDefined();
    const text = e2e!.text;
    const deployIdx = text.indexOf('db:deploy');
    const seedIdx = text.indexOf('db:seed');
    expect(deployIdx).toBeGreaterThan(-1);
    expect(seedIdx).toBeGreaterThan(-1);
    // Migrasi harus mendahului seed; seed di atas skema kosong akan gagal.
    expect(deployIdx).toBeLessThan(seedIdx);
  });
});

/**
 * Flag C — provisioning LOKAL juga harus memakai migrasi.
 *
 * Guard di atas hanya menjaga workflow CI. Tetapi `scripts/dev-up.sh` dan
 * `.claude/skills/stack/SKILL.md` — jalur yang benar-benar dipakai developer
 * untuk menyalakan stack lokal dan menjalankan e2e — masih mengarahkan
 * `db:push`. Akibatnya basis data lokal tidak pernah mendapat indeks unik
 * parsial `foundation_eseals_single_active_key`, sehingga perilaku lokal
 * berbeda dari CI/produksi: regresi konkurensi e-seal lolos di laptop dan gagal
 * di produksi. Dokumentasi (AGENTS.md, prisma/AGENTS.md, README) ikut dijaga
 * supaya tidak menuntun orang kembali ke `db:push`.
 *
 * Yang diuji memang kontrak konfigurasi/provisioning, jadi dibaca dari berkas;
 * sisi perilakunya (indeks benar-benar menolak seal kedua) diuji terhadap
 * PostgreSQL nyata di `integration.db.test.ts`.
 */
/**
 * Hanya baris yang benar-benar DIEKSEKUSI, dengan komentar dibuang.
 *
 * Baris yang seluruhnya komentar dan komentar di ujung baris (`cmd  # …`)
 * sering menyebut `db:push` justru untuk menjelaskan mengapa migrasi dipakai;
 * itu bukan instruksi. Yang dicari adalah perintah yang benar-benar dijalankan.
 */
function commandLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+#.*$/, ''))
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('penyediaan basis data lokal memakai migrasi (Flag C)', () => {
  function read(rel: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  }

  it('scripts/dev-up.sh menjalankan `db:deploy`, bukan `db:push`', () => {
    // The migration logic lives in `scripts/db-provision.sh` (delegated by
    // dev-up.sh so the failure path is testable); both files must stay on
    // migrations.
    const provision = commandLines(read('scripts/db-provision.sh'));
    expect(provision).toMatch(/\bdb:deploy\b/);
    expect(provision).not.toMatch(/\bdb:push\b/);

    const devup = commandLines(read('scripts/dev-up.sh'));
    expect(devup).toMatch(/db-provision\.sh/);
    expect(devup).not.toMatch(/\bdb:push\b/);
    // Migrations must run on EVERY startup, not be gated behind an empty DB.
    expect(provision).not.toMatch(/USERS[\s\S]{0,80}db:deploy/);
  });

  it('skill stack tidak lagi menginstruksikan `db:push`', () => {
    const text = read('.claude/skills/stack/SKILL.md');
    // Skill memuat blok bash yang dieksekusi sesama agen; `db:push` di dalamnya
    // sama berbahayanya dengan `db:push` di workflow.
    const codeBlocks = text
      .split('```')
      .filter((_, i) => i % 2 === 1)
      .join('\n');
    expect(commandLines(codeBlocks)).toMatch(/\bdb:deploy\b/);
    expect(commandLines(codeBlocks)).not.toMatch(/\bdb:push\b/);
  });

  it('dokumentasi developer tidak menyuruh `db:push` sebagai cara menyiapkan skema', () => {
    for (const rel of ['AGENTS.md', 'apps/api/prisma/AGENTS.md', 'README.md']) {
      const text = commandLines(read(rel));
      expect(text, `${rel} masih menyuruh db:push`).not.toMatch(/\bdb:push\b/);
    }
  });

  /**
   * Audit E — Makefile adalah jalur operasional (`make deploy`,
   * `make quick-start`, `make db-reset`) yang sebelumnya menjalankan
   * `prisma db push`. `db push` membuang indeks unik parsial, sehingga basis
   * data hasil `make deploy` TIDAK punya invariant "paling banyak satu e-seal
   * aktif" — perilaku berbeda dari CI/produksi. Target `db-migrate` menggantinya
   * dengan `prisma migrate deploy`. `docs/DEPLOYMENT.md` yang menyebut
   * `Makefile deploy` memakai `db push` ikut dijaga.
   */
  it('Makefile tidak menjalankan `prisma db push`; memakai `migrate deploy`', () => {
    const text = commandLines(read('Makefile'));
    expect(text).toMatch(/\bmigrate deploy\b/);
    // Target `db-push` (dan pemanggil `$(MAKE) db-push`) tidak boleh kembali.
    expect(text).not.toMatch(/db-push/);
    expect(text).not.toMatch(/prisma\s+db\s+push/);
  });

  /**
   * Audit G — jalur executable, bukan dokumentasi.
   *
   * `apps/api/package.json` masih menyediakan script `db:push`, dan `turbo.json`
   * masih meng-cache task bernama sama. Keduanya adalah pintu yang mengundang
   * orang menjalankan `db push` dan diam-diam membuang indeks unik parsial.
   * Script itu dihapus; guard di bawah memaku ketiadaannya sebagai PERILAKU
   * (script tidak dapat dipanggil), bukan sekadar komentar.
   */
  it('apps/api/package.json tidak menyediakan script db:push', () => {
    const pkg = JSON.parse(read('apps/api/package.json')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['db:push']).toBeUndefined();
    expect(pkg.scripts?.['db:deploy']).toMatch(/migrate deploy/);
  });

  it('turbo.json tidak mendefinisikan task db:push', () => {
    const turbo = JSON.parse(read('turbo.json')) as { tasks?: Record<string, unknown> };
    expect(turbo.tasks?.['db:push']).toBeUndefined();
  });

  /**
   * Audit A — jalur deployment produksi harus benar-benar dapat menjalankan
   * migrasi.
   *
   * Dua jalur yang SAH: Compose memakai service `migrate` (stage `migrate` di
   * image yang sama), sedangkan runtime image dapat menjalankan migrasi sendiri
   * lewat `MIGRATE_ON_START=true` — CLI Prisma TETAP ADA di runner (yang dibuang
   * hanya pglite + typescript), dan `docker-entrypoint.sh` memanggilnya. Yang
   * DILARANG adalah `docker exec cipansor-api npx prisma migrate deploy`:
   * `npx` di runner tidak menjangkau biner lokal seperti pemanggilan langsung.
   * Makefile harus memakai service `migrate` dan TIDAK boleh kembali ke
   * `exec … npx`. Sisi perilakunya diuji terhadap image nyata oleh
   * `deployment-migration.db.test.ts`, yang membangun stage `migrate` dan
   * menjalankannya terhadap PostgreSQL kosong nyata.
   */
  it('Makefile menjalankan migrasi lewat service `migrate`, bukan npx di container api', () => {
    const text = commandLines(read('Makefile'));
    expect(text).toMatch(/compose run[\s\S]{0,120}\bmigrate\b/);
    expect(text).not.toMatch(/docker exec cipansor-api[\s\S]{0,120}prisma migrate/);
  });

  /**
   * Audit A (konsistensi) — dokumentasi jalur migrasi TIDAK boleh saling
   * bertentangan. Sebelumnya stage `migrate` dan `docs/DEPLOYMENT.md`
   * mengklaim runtime image "menghapus cluster Prisma CLI" dan `npx` di sana
   * "canceled", padahal `docker-entrypoint.sh` justru menjalankan CLI itu saat
   * `MIGRATE_ON_START=true`. Kasus nyata ditentukan kode: CLI bertahan (hanya
   * pglite/typescript yang dibuang) dan entrypoint memakainya.
   */
  it('docs/compose tidak mengklaim ulang bahwa runner menghapus Prisma CLI', () => {
    for (const rel of ['apps/api/Dockerfile', 'docker-compose.yml', 'docs/DEPLOYMENT.md']) {
      const text = read(rel);
      expect(text, `${rel} mengklaim CLI dihapus`).not.toMatch(
        /npx canceled|menghapus cluster Prisma CLI|deliberately deletes the Prisma CLI/
      );
    }
  });

  it('entrypoint menjalankan migrasi dari runner saat MIGRATE_ON_START=true', () => {
    const entry = read('apps/api/docker-entrypoint.sh');
    expect(entry).toMatch(/MIGRATE_ON_START/);
    expect(entry).toMatch(/prisma migrate deploy/);
  });

  it('docker-compose mendefinisikan service migrate yang dijalankan sebelum api', () => {
    const compose = read('docker-compose.yml');
    expect(compose).toMatch(/\n\s+migrate:/);
    // API menunggu migrasi selesai sukses.
    expect(compose).toMatch(/migrate:\s*\n\s*condition:\s*service_completed_successfully/);
  });

  it('Dockerfile menyediakan stage `migrate` untuk release job', () => {
    const dockerfile = read('apps/api/Dockerfile');
    expect(dockerfile).toMatch(/FROM deps AS migrate/);
    expect(dockerfile).toMatch(/prisma.*migrate.*deploy/);
  });

  it('DEPLOYMENT.md tidak lagi mengklaim Makefile deploy memakai db push', () => {
    const text = commandLines(read('docs/DEPLOYMENT.md'));
    expect(text).not.toMatch(/Makefile[\s\S]{0,80}prisma db push/);
  });

  /**
   * Audit A (docs) — the runbook must not teach the path that silently applies
   * nothing. `docker compose exec api npx prisma migrate deploy` resolves to
   * nothing in the runtime image (the Prisma CLI is stripped), so documenting it
   * would send an operator through a no-op deploy. Migrations go through the
   * `migrate` service.
   */
  it('DEPLOYMENT.md mengarahkan migrasi ke service `migrate`, bukan exec di container api', () => {
    const text = read('docs/DEPLOYMENT.md');
    expect(text).toMatch(/compose run[\s\S]{0,160}\bmigrate\b/);
    // Only the executable examples (fenced blocks) matter; prose may quote the
    // broken form to explain why it does not work.
    const fenced = text
      .split('\n')
      .filter((line, i, all) => {
        const fencesBefore = all.slice(0, i).filter((l) => l.trim().startsWith('```')).length;
        return fencesBefore % 2 === 1;
      })
      .join('\n');
    expect(fenced).not.toMatch(/compose exec api[\s\S]{0,80}prisma migrate/);
  });
});
