import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Padding VERTIKAL tidak boleh dipasang pada `<ScrollArea>` itu sendiri.
 *
 * **Kenapa, dan ini hasil pengukuran, bukan selera.** Radix memposisikan bilah
 * gulirnya `position: absolute` di dalam elemen Root. Tinggi `h-full` sebuah
 * elemen absolut dihitung terhadap kotak PADDING blok penampungnya, sedangkan
 * viewport yang benar-benar bergulir mengisi kotak KONTEN. Begitu Root diberi
 * `py-4`, keduanya berselisih 32px selamanya: treknya mulai 16px di atas isi
 * pertama dan berakhir 16px di bawah isi terakhir, jadi ibu jarinya tidak
 * pernah sejajar dengan yang digulirnya.
 *
 * Diukur di chromium pada enam tinggi jendela (540, 620, 700, 768, 900, 1080):
 * selisih trek-viewport tepat 32px di setiap tinggi — proporsinya justru makin
 * buruk pada kotak pendek, dan ada dua `ScrollArea` setinggi 200–300px di
 * repo ini.
 *
 * Obatnya sepele: pindahkan paddingnya ke sebuah div di DALAM ScrollArea.
 * Padding HORIZONTAL (`px`, `pl`, `pr`) tidak dilarang — ia tidak menyentuh
 * geometri trek vertikal, dan `pr-4` justru idiom yang benar untuk menjauhkan
 * teks dari bilahnya.
 */

const SRC = path.join(__dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__render__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** Ambil setiap tag pembuka `<ScrollArea ...>` beserta isinya. */
function scrollAreaTags(source: string): string[] {
  const tags: string[] = [];
  const pattern = /<ScrollArea\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    // Cari `>` penutup tag pembuka, lewati yang ada di dalam kurung kurawal.
    let i = match.index;
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
      i += 1;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

const VERTICAL_PADDING = /(?:^|[\s"'`])(p|py|pt|pb)-[\w[\].%-]+/;

function offenders(): string[] {
  const bad: string[] = [];
  for (const file of tsxFiles(SRC)) {
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes("<ScrollArea")) continue;
    for (const tag of scrollAreaTags(source)) {
      const hit = tag.match(VERTICAL_PADDING);
      if (hit) bad.push(`${path.relative(SRC, file)} — ${hit[0].trim()}`);
    }
  }
  return bad;
}

describe("ScrollArea tidak memakai padding vertikal di Root-nya", () => {
  it("menemukan pemakaian ScrollArea sama sekali (penjaga atas penjaganya)", () => {
    // Kalau pemindainya rusak, ia mengembalikan nol tag dan harapan di bawah
    // lolos tanpa memeriksa apa pun. Hijau karena tidak melihat apa-apa adalah
    // kegagalan yang paling mudah tidak disadari.
    const total = tsxFiles(SRC)
      .map((f) => scrollAreaTags(fs.readFileSync(f, "utf8")).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(15);
  });

  it("membedakan padding vertikal dari horizontal", () => {
    // Aturannya menyempit dengan sengaja; uji ini yang menjaga penyempitannya.
    expect('<ScrollArea className="h-40 py-4">').toMatch(VERTICAL_PADDING);
    expect('<ScrollArea className="h-40 p-4">').toMatch(VERTICAL_PADDING);
    expect('<ScrollArea className="h-40 pt-2">').toMatch(VERTICAL_PADDING);
    expect('<ScrollArea className="h-40 pr-4">').not.toMatch(VERTICAL_PADDING);
    expect('<ScrollArea className="h-40 px-3">').not.toMatch(VERTICAL_PADDING);
  });

  it("tidak ada satu pun ScrollArea dengan padding vertikal", () => {
    const bad = offenders();
    expect(
      bad,
      "Padding vertikal pada <ScrollArea> membuat trek bilah gulir 2× padding " +
        "lebih tinggi daripada area yang digulir, sehingga ibu jarinya tidak " +
        "pernah sejajar dengan isinya. Pindahkan ke div di dalamnya:\n" +
        bad.map((b) => `  - ${b}`).join("\n"),
    ).toEqual([]);
  });
});

/**
 * Menu sidebar tidak boleh kembali memakai `ScrollArea`.
 *
 * Diukur di build produksi Next, bukan disimpulkan: MutationObserver pada
 * atribut `style` ibu jari Radix mencatat TEPAT SATU penulisan posisi per sesi
 * gulir, selalu pada peristiwa gulir pertama. Tiga sesi berturut-turut membawa
 * isinya 0→1200, 1200→2400, 2400→3600, sementara ibu jarinya berhenti di 44px,
 * 222px, dan 399px dari trek 609px — tertinggal satu putaran roda, lalu
 * meloncat menyusul di awal putaran berikutnya. Gelung rAF pelacaknya tidak
 * pernah berjalan.
 *
 * Komponen yang sama di luar Next melacak sempurna (drift 0,3px pada uji roda
 * yang sama), jadi ini bukan alasan untuk membuang `ScrollArea` di tempat lain
 * — hanya di menu sepanjang ~4800px ini, tempat kegagalannya menjadi parah dan
 * bilah gulir bawaan peramban lebih baik dalam segala hal yang penting di sini.
 */
describe("menu sidebar memakai gulir bawaan peramban", () => {
  const SIDEBAR = path.join(SRC, "components", "layout", "sidebar.tsx");

  it("tidak mengimpor atau memakai ScrollArea", () => {
    const source = fs.readFileSync(SIDEBAR, "utf8");
    const kode = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(kode).not.toContain("<ScrollArea");
    expect(kode).not.toMatch(/import\s*\{[^}]*ScrollArea[^}]*\}/);
  });

  it("wadah menunya benar-benar bisa bergulir", () => {
    // `overflow-y-auto` tanpa `min-h-0` tidak menggulir apa pun: anak flex
    // menolak menyusut di bawah tinggi isinya, jadi wadahnya tumbuh setinggi
    // menu dan tidak ada yang tersisa untuk digulir.
    const source = fs.readFileSync(SIDEBAR, "utf8");
    const wadah = source
      .split("\n")
      .find((line) => line.includes("overflow-y-auto"));

    expect(wadah, "wadah bergulir menu tidak ditemukan").toBeTruthy();
    expect(wadah).toContain("min-h-0");
    expect(wadah).toContain("flex-1");
  });
});
