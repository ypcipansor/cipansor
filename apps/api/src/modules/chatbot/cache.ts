/**
 * Answer cache for the public assistant.
 *
 * The motivating measurement: the model itself is fast — a whole answer streams
 * out in 1–2 seconds — but time-to-first-token on the Foundry deployment ranged
 * from 1.1s to 32.8s across identical requests, because each one queues for
 * shared capacity. No amount of prompt tuning touches that. What does touch it
 * is not making the call at all.
 *
 * "Berapa biaya pendaftaran?" will be asked hundreds of times with the same
 * answer. Served from here it costs nothing and returns in milliseconds.
 *
 * THE CORRECTNESS TRAP, and how the key handles it. Admission facts are read
 * live precisely because they change on their own schedule — caching an answer
 * that quotes the fee is exactly how a bot ends up telling a family last
 * season's price. So the key includes:
 *
 *   - a fingerprint of the LIVE FACTS used. When the period, fee, status or
 *     remaining-days text changes, the key changes and the old entry is simply
 *     never looked up again. Days-remaining shifts daily, so admission answers
 *     naturally re-cache each day — which is right, since the answer says
 *     "sekitar 44 hari lagi".
 *   - a hash of the KNOWLEDGE BASE. A deploy that edits public content
 *     invalidates every affected entry without anyone remembering to flush.
 *   - a fingerprint of the PERSONA. The persona shapes every answer, and a
 *     super admin can edit it from the admin UI at any time. Folding it into
 *     the key means a persona change re-keys the whole cache — the next visitor
 *     gets an answer in the new voice, never a stale one in the old, and again
 *     nobody has to remember to flush.
 *
 * Nothing here is a security boundary: the public assistant holds no per-user
 * data, so there is no cross-user leakage to design against. That changes the
 * day the authenticated agent arrives — its cache, if it ever has one, must be
 * partitioned per (user, activeRole). See docs/planning/chatbot-design.md §3.
 */

import { createHash } from 'crypto';
import type { PublicChatResponse } from '@cipansor/shared';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { config } from '@/config';
import { knowledgeBase } from './knowledge-base';
import { tokenize } from './retrieval';
import type { LiveFact } from './live-facts';

const KEY_PREFIX = 'chatbot:answer:v1';

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

/**
 * Computed once at load. The corpus is built from constants, so it cannot
 * change while the process runs — only a deploy changes it, and a deploy gets a
 * new hash.
 */
const CORPUS_HASH = shortHash(JSON.stringify(knowledgeBase));

/**
 * Normalise the question so near-identical phrasings share one entry.
 *
 * Runs through the same tokenizer and Indonesian stemmer as retrieval, then
 * sorts and de-duplicates. That collapses "Berapa biaya pendaftaran?" and
 * "biaya pendaftaran berapa ya" onto one key, and word order stops mattering.
 *
 * KNOWN LIMIT: misspellings do NOT collapse. "brp biyaya pndaftaran" stems to
 * different tokens and therefore misses. Fixing that needs fuzzy matching,
 * which is a real feature with real false-positive risk — two different
 * questions merged onto one key would serve the wrong answer, which is far
 * worse than a cache miss. A miss only costs one model call. Revisit if the
 * hit rate in production turns out to be poor; the eval set has a
 * deliberately misspelled case (`salah-ketik`) to keep the issue visible.
 *
 * Deliberately lossy: two questions with the same content words get the same
 * answer. That is the point, and it is safe here because every answer is
 * grounded in the same public corpus regardless of who asks.
 */
export function cacheKeyFor(
  question: string,
  liveFacts: LiveFact[],
  /**
   * The additive persona in force for this answer. Hashed into the key so an
   * edit from the admin UI re-keys the cache (see the header). Defaults to the
   * empty string, which fingerprints as `default` — production always passes
   * the resolved persona; the default only keeps persona-agnostic tests terse.
   */
  persona: string = '',
  /**
   * Injectable so a test can prove the key really depends on the corpus. The
   * production caller never passes it — the default is the hash of the corpus
   * this process was built with.
   */
  corpusHash: string = CORPUS_HASH
): string | null {
  const tokens = [...new Set(tokenize(question))].sort();
  // Nothing to key on. Such a question retrieves nothing and refuses anyway.
  if (tokens.length === 0) return null;

  const liveFingerprint =
    liveFacts.length === 0 ? 'none' : shortHash(liveFacts.map((f) => f.text).join('|'));
  const personaFingerprint = persona ? shortHash(persona) : 'default';

  return `${KEY_PREFIX}:${corpusHash}:${personaFingerprint}:${liveFingerprint}:${shortHash(tokens.join(' '))}`;
}

/**
 * Cacheable only when the conversation has no history.
 *
 * With history, the answer depends on turns this key knows nothing about, so a
 * hit would serve a reply to a different conversation. The first question of a
 * session is where the repeated FAQ traffic is anyway.
 */
export function isCacheable(historyLength: number): boolean {
  return config.chatbot.cacheTtlSeconds > 0 && historyLength === 0;
}

export async function readCached(key: string): Promise<PublicChatResponse | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as PublicChatResponse;
  } catch (error) {
    // A cache that is down must never be a chatbot that is down.
    logger.warn('Chatbot cache read failed; answering live', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function writeCached(key: string, response: PublicChatResponse): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(response), 'EX', config.chatbot.cacheTtlSeconds);
  } catch (error) {
    logger.warn('Chatbot cache write failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
