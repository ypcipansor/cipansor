import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * `action` Turnstile adalah satu fakta yang ditulis di dua tempat.
 *
 * Peramban memasangnya saat menerbitkan tantangan (`<TurnstileWidget
 * action="login">`), peladen menuntutnya saat menukarkan token
 * (`requireTurnstile('login')`), dan Cloudflare yang mencocokkan keduanya.
 * Tidak ada tipe yang menghubungkan mereka: mengganti salah satu sendirian
 * lolos `tsc`, lolos seluruh uji satuan, lalu menolak **setiap** pengunjung di
 * permukaan itu — dengan pesan yang tidak menyebut sebabnya.
 *
 * Berkas ini yang menghubungkannya. Ia membaca kedua sisi dari sumbernya,
 * bukan dari daftar yang ditulis ulang di sini — sebuah daftar ketiga hanya
 * akan menjadi tempat ketiga yang bisa melenceng.
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const API_MODULES = path.join(ROOT, 'apps', 'api', 'src', 'modules');
const WEB_SRC = path.join(ROOT, 'apps', 'web', 'src');

function walk(dir: string, match: (f: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, match));
    else if (match(entry.name)) found.push(full);
  }
  return found;
}

/** Tindakan yang dituntut peladen, dibaca dari berkas rute. */
function serverActions(): string[] {
  const actions: string[] = [];
  for (const file of walk(API_MODULES, (f) => f.endsWith('.routes.ts'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/requireTurnstile\(\s*'([^']+)'\s*\)/g)) {
      actions.push(m[1]);
    }
  }
  return actions.sort();
}

/** Tindakan yang diterbitkan peramban, dibaca dari komponen yang memasang widget. */
function clientActions(): string[] {
  const actions: string[] = [];
  for (const file of walk(WEB_SRC, (f) => f.endsWith('.tsx'))) {
    const src = fs.readFileSync(file, 'utf8');
    let at = src.indexOf('<TurnstileWidget');
    while (at > -1) {
      // Batasi pencarian pada satu elemen JSX, bukan seluruh berkas.
      const end = src.indexOf('/>', at);
      const element = src.slice(at, end === -1 ? at + 400 : end);
      const m = element.match(/action="([^"]+)"/);
      if (m) actions.push(m[1]);
      at = src.indexOf('<TurnstileWidget', at + 1);
    }
  }
  return actions.sort();
}

describe('kontrak action Turnstile antara peramban dan peladen', () => {
  it('membaca kedua sisi — kalau salah satunya kosong, ujinya yang rusak', () => {
    expect(serverActions().length, 'tidak ada requireTurnstile(...) terbaca').toBeGreaterThan(0);
    expect(clientActions().length, 'tidak ada <TurnstileWidget action> terbaca').toBeGreaterThan(0);
  });

  it('setiap tindakan yang dituntut peladen benar-benar diterbitkan peramban', () => {
    const client = new Set(clientActions());
    for (const action of serverActions()) {
      expect(
        client.has(action),
        `requireTurnstile('${action}') tidak punya <TurnstileWidget action="${action}"> di mana pun — permukaan itu akan menolak semua pengunjung`
      ).toBe(true);
    }
  });

  it('setiap tindakan yang diterbitkan peramban benar-benar dijaga peladen', () => {
    const server = new Set(serverActions());
    for (const action of clientActions()) {
      expect(
        server.has(action),
        `<TurnstileWidget action="${action}"> tidak dipasangkan requireTurnstile('${action}') — tantangannya diselesaikan lalu dibuang`
      ).toBe(true);
    }
  });

  it('setiap rute yang dijaga menyebutkan tindakannya', () => {
    // `requireTurnstile` tanpa argumen tidak lagi dapat dikompilasi, tapi
    // sebuah pemanggilan dengan variabel (bukan literal) akan lolos `tsc` dan
    // luput dari regex di atas — jadi hitungannya dipaku di sini.
    const files = walk(API_MODULES, (f) => f.endsWith('.routes.ts'));
    const mounts = files.reduce(
      (n, f) => n + (fs.readFileSync(f, 'utf8').match(/requireTurnstile\(/g)?.length ?? 0),
      0
    );
    expect(serverActions().length).toBe(mounts);
  });
});
