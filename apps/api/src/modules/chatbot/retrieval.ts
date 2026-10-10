/**
 * Lexical retrieval (BM25) over the public knowledge base.
 *
 * WHY NOT EMBEDDINGS. The public corpus is a few dozen short, factual entries
 * about one institution, and questions arrive using the same vocabulary the
 * entries use ("biaya", "alamat", "tahfidz", "SMP IT"). BM25 handles that well,
 * costs nothing, needs no API key, and — decisive for a system whose answers
 * must be checkable — is deterministic, so a retrieval regression shows up in a
 * unit test instead of as a vague drop in answer quality.
 *
 * Embeddings buy paraphrase matching, which starts to matter at a corpus size
 * and question variety we do not have yet. `Retriever` is an interface so a
 * vector implementation can slot in behind it WHEN THE EVAL SET SHOWS lexical
 * retrieval is the bottleneck — measure, then swap. See
 * docs/planning/chatbot-design.md §1 and §6.
 */

import { knowledgeBase, type KnowledgeEntry } from './knowledge-base';

export interface RetrievedChunk {
  entry: KnowledgeEntry;
  score: number;
}

export interface Retriever {
  search(query: string, limit?: number): RetrievedChunk[];
}

/**
 * Indonesian function words. They appear in nearly every entry, so leaving them
 * in makes BM25 rank on sentence shape rather than subject matter.
 */
const STOPWORDS = new Set([
  'ada',
  'adalah',
  'agar',
  'akan',
  'anda',
  'apa',
  'apakah',
  'atau',
  'bagaimana',
  'bagi',
  'bahwa',
  'banyak',
  'berapa',
  'bisa',
  'buat',
  'dan',
  'dapat',
  'dari',
  'dengan',
  'di',
  'dia',
  'dll',
  'dong',
  'gimana',
  'ini',
  'itu',
  'jadi',
  'juga',
  'kalau',
  'kami',
  'kamu',
  'ke',
  'kepada',
  'kita',
  'lagi',
  'mau',
  'mengapa',
  'mereka',
  'nya',
  'oleh',
  'pada',
  'para',
  'pun',
  'saja',
  'saya',
  'sebagai',
  'secara',
  'sehingga',
  'serta',
  'sini',
  'situ',
  'siapa',
  'suatu',
  'tapi',
  'tentang',
  'terhadap',
  'tidak',
  'untuk',
  'yaitu',
  'yang',
  // Colloquial particles and vocatives. They carry no meaning but are very
  // common in typed Indonesian, and leaving them in splits "biaya pendaftaran
  // berapa ya" from "berapa biaya pendaftaran" — two spellings of one question.
  // That matters for the answer cache as much as it does for ranking.
  'ya',
  'yah',
  'sih',
  'deh',
  'nih',
  'kah',
  'kok',
  'loh',
  'lho',
  'aja',
  'mah',
  'toh',
  'pak',
  'bu',
  'min',
]);

/**
 * Conservative Indonesian affix stripping.
 *
 * Indonesian is agglutinative: "daftar" → "pendaftaran", "mendaftar",
 * "didaftarkan". Without this, a visitor asking "cara pendaftaran" never
 * matches an entry that says "mendaftar", which is the single most likely
 * question this bot will receive.
 *
 * This is deliberately not a full stemmer (Nazief-Adriani and friends need a
 * root dictionary). It strips only unambiguous affixes and refuses to reduce a
 * word below four characters, because over-stemming silently destroys precision
 * — "makan" → "mak" would collide with unrelated terms.
 */
const SUFFIXES = ['kannya', 'annya', 'inya', 'nya', 'kan', 'an', 'i'];
const PREFIXES = [
  'menge',
  'meny',
  'meng',
  'mem',
  'men',
  'ber',
  'per',
  'pen',
  'pem',
  'peng',
  'di',
  'ke',
  'se',
  'ter',
];

const MIN_STEM = 4;

export function stem(word: string): string {
  let w = word;
  for (const suffix of SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= MIN_STEM) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  for (const prefix of PREFIXES) {
    if (w.startsWith(prefix) && w.length - prefix.length >= MIN_STEM) {
      w = w.slice(prefix.length);
      break;
    }
  }
  return w;
}

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Keep the apostrophe inside a word so "qur'an" survives as one token,
      // then normalise it away so "quran" and "qur'an" agree. This must run
      // BEFORE the split: `\p{L}` does not match an apostrophe, so without it
      // the split would break "qur'an" into "qur" and "an".
      .replace(/['’]/g, '')
      // Drop Arabic diacritics (harakat). They are combining marks, not
      // letters, so the split below would break "أسجّل" at the shadda — and
      // Arabic is routinely written with or without vocalisation, so the two
      // spellings must agree on one token. Same idea as the apostrophe above.
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      // Split on anything that is not a Unicode letter or digit. This keeps
      // Arabic (`كم رسوم التسجيل؟` → كم، رسوم، التسجيل) while leaving the
      // Indonesian behaviour byte-for-byte the same, because Indonesian is
      // written in the Latin range that `\p{L}` already covered.
      //
      // The old `[^a-z0-9]` discarded every Arabic character, so an Arabic
      // question produced an empty token list — and `cacheKeyFor` returns null
      // for that, meaning repeated Arabic FAQs (the widget's own suggestions,
      // among them) never hit the answer cache and called the paid provider
      // every time.
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
      .map(stem)
  );
}

const K1 = 1.5;
const B = 0.75;

/**
 * Drop hits scoring far below the best one.
 *
 * BM25 returns anything sharing a term, so "berapa biaya pendaftaran" also
 * matched the entrepreneurship and hadith programme entries on a single weak
 * stem. Those are not merely wasted context — the widget SHOWS its sources, so
 * a visitor asking about fees was offered "Menghafal Hadits" as a citation,
 * which reads as either a broken bot or an evasive one.
 *
 * Relative rather than absolute, because BM25 scores are not comparable across
 * queries: a rare term scores high, a common one low, and any fixed cutoff
 * would silently discard everything for one phrasing and nothing for another.
 */
const MIN_RELATIVE_SCORE = 0.35;

/**
 * Damerau-Levenshtein distance (optimal string alignment), bounded.
 *
 * Counts an adjacent transposition as ONE edit, not two. That matters here more
 * than it looks: swapped letters are the most common typing error there is
 * ("tahfdiz" for "tahfidz"), and plain Levenshtein scores them the same as two
 * unrelated substitutions — which the credibility rule below then rejects.
 *
 * Returns `max + 1` as soon as every cell in a row exceeds `max`, so comparing
 * against an obviously unrelated word stops early instead of filling the matrix.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How far a term may be corrected, by length.
 *
 * Short words are left alone: at four characters an edit distance of one
 * already reaches a different word ("baru" → "buku"), and a wrong correction is
 * worse than no correction because it silently answers a question nobody asked.
 */
function maxEditsFor(term: string): number {
  if (term.length >= 7) return 2;
  if (term.length >= 5) return 1;
  return 0;
}

/** True when `sub` can be produced by deleting characters from `term`. */
function isSubsequence(sub: string, term: string): boolean {
  let i = 0;
  for (const char of term) {
    if (char === sub[i]) i++;
    if (i === sub.length) return true;
  }
  return i === sub.length;
}

/**
 * Whether a candidate correction is credible at the distance found.
 *
 * Distance 1 is accepted outright — one wrong, extra or missing letter is the
 * ordinary typo.
 *
 * Distance 2 is accepted ONLY for pure deletions: the candidate must be the
 * term with two letters removed. That is the dominant error when Indonesian is
 * typed fast on a phone (dropped vowels — "pndaftaran" for "pendaftaran"), and
 * it is strict enough to reject the over-reach this rule was added for:
 * "kuantum" was being corrected to "cantum", also distance 2, but that needs a
 * SUBSTITUTION (k→c) and so is not a dropped-letter typo. Correcting nonsense
 * onto a real word is not merely wasteful — it replaces an honest refusal with
 * a confident answer to a question nobody asked.
 */
function isCredibleCorrection(term: string, candidate: string, distance: number): boolean {
  if (distance <= 1) return true;
  return term.length - candidate.length === 2 && isSubsequence(candidate, term);
}

/**
 * Closest credible member of `vocabulary`, or the term unchanged.
 *
 * Shared so that everything deciding "is this question about X" tolerates the
 * same typos. It was written for the BM25 index, and `live-facts.ts` needs it
 * for the identical reason: "brp biyaya pndaftaran nya" retrieved the right
 * page after fuzzy matching landed, but the admission LOOKUP still did not
 * fire — its trigger list was matched exactly — so the answer came back correct
 * and without the fee, which is the one number the visitor asked for.
 */
export function closestTerm(term: string, vocabulary: Iterable<string>): string {
  const maxEdits = maxEditsFor(term);
  if (maxEdits === 0) return term;

  let best = term;
  let bestDistance = maxEdits + 1;
  for (const candidate of vocabulary) {
    if (candidate === term) return term;
    const distance = editDistance(term, candidate, maxEdits);
    if (distance > maxEdits || !isCredibleCorrection(term, candidate, distance)) continue;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxEdits ? best : term;
}

export class Bm25Retriever implements Retriever {
  private readonly docs: { entry: KnowledgeEntry; tf: Map<string, number>; length: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(entries: KnowledgeEntry[] = knowledgeBase) {
    this.docs = entries.map((entry) => {
      // The title carries the most signal per word, so it is indexed twice.
      // This is a weight, not a trick: an entry titled "SMP IT Cipansor" should
      // beat one that merely mentions it in passing.
      // Aliases are indexed exactly like body text, and never rendered into the
      // prompt — `prompt.ts` shows `entry.text` alone. They widen what a
      // question can match without changing what the model is allowed to say.
      const tokens = [
        ...tokenize(entry.title),
        ...tokenize(entry.title),
        ...tokenize(entry.text),
        ...(entry.aliases ?? []).flatMap(tokenize),
      ];
      const tf = new Map<string, number>();
      for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
      for (const token of new Set(tokens)) this.df.set(token, (this.df.get(token) ?? 0) + 1);
      return { entry, tf, length: tokens.length };
    });
    this.avgLength =
      this.docs.length === 0
        ? 0
        : this.docs.reduce((sum, d) => sum + d.length, 0) / this.docs.length;
  }

  /**
   * Map an unknown query term onto the closest term the corpus actually uses.
   *
   * Real traffic is typed on phones: "brp biyaya pndaftaran nya" is a question
   * this bot must answer, and before this it retrieved nothing at all and was
   * refused — the worst outcome, because the visitor concludes the pesantren
   * has no answer rather than that they mistyped.
   *
   * Fuzzy matching here is far safer than fuzzy matching in the answer cache
   * (see `cache.ts`): a wrong correction retrieves the wrong entry, and the
   * model — bound to answer only from context — then answers a different
   * question or declines. A wrong cache key would hand one visitor another
   * visitor's answer with no such backstop.
   *
   * Corrections are drawn only from the corpus vocabulary, so a term can never
   * be "corrected" onto a word this pesantren does not use.
   */
  private correct(term: string): string {
    if (this.df.has(term)) return term;

    const maxEdits = maxEditsFor(term);
    if (maxEdits === 0) return term;

    let best = term;
    let bestDistance = maxEdits + 1;
    let bestDf = 0;
    for (const [candidate, df] of this.df) {
      const distance = editDistance(term, candidate, maxEdits);
      if (distance > maxEdits || !isCredibleCorrection(term, candidate, distance)) continue;
      // Ties break towards the more common term: with nothing else to go on,
      // the word the corpus uses more often is the likelier intent.
      if (distance < bestDistance || (distance === bestDistance && df > bestDf)) {
        best = candidate;
        bestDistance = distance;
        bestDf = df;
      }
    }
    return bestDistance <= maxEdits ? best : term;
  }

  search(query: string, limit = 4): RetrievedChunk[] {
    const terms = tokenize(query).map((term) => this.correct(term));
    if (terms.length === 0) return [];

    const n = this.docs.length;
    const scored = this.docs.map((doc) => {
      let score = 0;
      for (const term of terms) {
        const f = doc.tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const norm = f + K1 * (1 - B + (B * doc.length) / (this.avgLength || 1));
        score += idf * ((f * (K1 + 1)) / norm);
      }
      return { entry: doc.entry, score };
    });

    const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    if (ranked.length === 0) return [];

    const cutoff = ranked[0].score * MIN_RELATIVE_SCORE;
    return ranked.filter((s) => s.score >= cutoff).slice(0, limit);
  }
}

export const defaultRetriever = new Bm25Retriever();
