/**
 * Provider for testing the assistant on a non-production copy (staging).
 *
 * The problem it solves: the real provider costs money and needs a secret, so
 * staging has neither — and until this existed the public assistant therefore
 * could not be exercised anywhere before a release. The widget hid itself, and
 * the only place the feature was ever seen working was production, in front of
 * the families it serves. That is the wrong environment to discover a broken
 * answer in.
 *
 * WHAT IT IS: a deterministic double that answers from the SAME real public
 * data the live assistant uses — the knowledge base derived from the public
 * site constants, plus the live admission facts read from the database. It
 * fabricates nothing: every sentence it returns is copied verbatim out of the
 * context the service assembled, and it refuses when the question has no
 * lexical footing in that context. So staging demonstrates the real corpus, the
 * real retrieval, the real SPMB fees and dates, and the real UI flow — with no
 * API key and no spend.
 *
 * WHAT IT IS NOT: a model. It does no reasoning, cannot paraphrase, and cannot
 * answer a question whose words do not appear in the corpus. `resolveProvider()`
 * refuses it in production for exactly that reason — a stub answering real
 * visitors looks like a working service while being unable to handle anything
 * that is not a near-verbatim match, which is a quieter failure than an outage
 * and a worse one.
 *
 * It is distinct from `StubProvider`, which exists for unit tests: that one
 * echoes the whole context block back, which is the strictest possible check of
 * groundedness but reads as a wall of text to a human walking through staging.
 * This one picks the entry the question is about and quotes it, so the
 * conversation on staging looks like a conversation.
 */

import { CONTEXT_HEADING, NO_CONTEXT_MARKER } from '../prompt';
import { tokenize } from '../retrieval';
import type { LlmCompletionRequest, LlmCompletionResult, LlmProvider } from './types';

const REFUSAL = 'Maaf, saya belum memiliki informasi untuk menjawab pertanyaan itu.';

/**
 * Said plainly at the top of every answer, so nobody on staging mistakes this
 * for the live assistant. Not decoration: staging is public and noindex, and a
 * visitor who wandered in should be told what they are reading.
 *
 * Deliberately not a line starting with "SUMBER" — `splitCitedSources` strips
 * any line that does, case-insensitively, and would eat this one.
 */
const TEST_MARKER = '_(Contoh jawaban — lingkungan uji; dijawab dari data publik Cipansor.)_';

/** Longest excerpt quoted from one entry, in characters. */
const EXCERPT_LIMIT = 480;

interface ContextEntry {
  id: string;
  title: string;
  text: string;
}

/**
 * Recover the entries the service put in the system prompt.
 *
 * The context block is assembled by `prompt.ts` as `[id] title\ntext` parts
 * joined by blank lines, so this is the inverse of `renderContext`. If the
 * heading is absent or the block is the no-context marker, there is nothing to
 * answer from.
 */
function parseContext(system: string): ContextEntry[] {
  const block = system.split(CONTEXT_HEADING)[1];
  if (!block) return [];

  const entries: ContextEntry[] = [];
  // Split only before the next `[id]` marker, so an entry whose own text
  // contains a blank line is not torn in two.
  for (const raw of block.split(/\n{2,}(?=\[)/)) {
    const match = /^\[([^\]]+)\]\s*([^\n]*)\n?([\s\S]*)$/.exec(raw.trim());
    if (!match) continue;
    entries.push({ id: match[1].trim(), title: match[2].trim(), text: match[3].trim() });
  }
  return entries;
}

/** The question the visitor actually typed — the last user turn. */
function lastQuestion(request: LlmCompletionRequest): string {
  for (let i = request.messages.length - 1; i >= 0; i--) {
    if (request.messages[i].role === 'user') return request.messages[i].content;
  }
  return '';
}

/**
 * The entry the question is most about, by shared stems.
 *
 * Same lexical footing the retriever uses, kept deliberately simple: the point
 * is to demonstrate the corpus, not to be clever. A zero score means the
 * question shares no stem with any entry, which is treated as "no basis to
 * answer" rather than a guess.
 */
function bestEntry(question: string, entries: ContextEntry[]): ContextEntry | null {
  const asked = new Set(tokenize(question));
  if (asked.size === 0) return null;

  let best: ContextEntry | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const words = new Set(tokenize(`${entry.title} ${entry.text}`));
    let score = 0;
    for (const token of asked) if (words.has(token)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

/**
 * A verbatim slice of an entry, cut at a sentence boundary where possible.
 *
 * Never paraphrased and never extended: what the visitor reads on staging is
 * what the corpus actually says.
 */
function excerpt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= EXCERPT_LIMIT) return trimmed;

  const slice = trimmed.slice(0, EXCERPT_LIMIT);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '));
  return (lastStop > 120 ? slice.slice(0, lastStop + 1) : slice).trim();
}

export class EchoProvider implements LlmProvider {
  readonly name = 'echo';

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const system = request.messages.find((m) => m.role === 'system')?.content ?? '';

    if (system.includes(NO_CONTEXT_MARKER)) {
      return { text: REFUSAL, model: 'echo' };
    }

    const entries = parseContext(system);
    const entry = bestEntry(lastQuestion(request), entries);
    if (!entry) {
      return { text: REFUSAL, model: 'echo' };
    }

    return {
      text: `${TEST_MARKER}\n\n${excerpt(entry.text)}\n\nSUMBER: ${entry.id}`,
      model: 'echo',
    };
  }
}
