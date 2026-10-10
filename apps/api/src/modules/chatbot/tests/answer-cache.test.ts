/**
 * The public answer cache, exercised through the real modules.
 *
 * The service suite mocks `../cache`, so it proves the service calls the cache
 * but never that a key is produced or a value stored. A review of this feature
 * pointed out the gap directly: the Arabic cache key existed only in the
 * cache's own unit tests, and no test drove the whole path from a question to a
 * stored answer. These do — `tokenize`, `cacheKeyFor`, `readCached`,
 * `writeCached` and `looksLikeRefusal` are all the real code.
 *
 * Only the process edges are faked: Redis (no server in a unit run), the
 * database behind the persona, and the logger. The provider is a plain object
 * implementing `LlmProvider`, which is what the interface is for.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/redis', () => {
  const store = new Map<string, string>();
  return {
    redis: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      __store: store,
    },
  };
});
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../persona.service', () => ({ resolvePublicPersona: vi.fn(async () => 'persona-uji') }));
vi.mock('../live-facts', () => ({ collectLiveFacts: vi.fn(async () => []) }));

import { ask } from '../chatbot.service';
import { cacheKeyFor, readCached, writeCached } from '../cache';
import { redis } from '@/lib/redis';
import type { LlmProvider } from '../providers/types';

const store = (redis as unknown as { __store: Map<string, string> }).__store;

/** A provider that always returns the same body — the model is not the subject. */
function fixedProvider(text: string): LlmProvider {
  return {
    name: 'fixed',
    complete: async () => ({ text, model: 'fixed-model' }),
  };
}

const ARABIC_FEE_QUESTION = 'كم رسوم التسجيل؟';
const ARABIC_FEE_ANSWER = 'وفق المعلومات الرسمية، لا توجد رسوم للتسجيل.\nSUMBER: -';

beforeEach(() => {
  store.clear();
  vi.mocked(redis.get).mockClear();
  vi.mocked(redis.set).mockClear();
});

describe('public answer cache, end to end through the real modules', () => {
  it('produces a non-null key for an Arabic question', () => {
    // `tokenize` used to split on [^a-z0-9], discarding every Arabic character,
    // so this returned null and Arabic traffic never shared a cache entry.
    expect(cacheKeyFor(ARABIC_FEE_QUESTION, [])).not.toBeNull();
  });

  it('serves a repeated Arabic question from the cache without a second model call', async () => {
    const provider = fixedProvider(ARABIC_FEE_ANSWER);

    const first = await ask({ question: ARABIC_FEE_QUESTION, provider });
    expect(first.cached).toBeFalsy();
    expect(vi.mocked(redis.set)).toHaveBeenCalledTimes(1);

    const second = await ask({ question: ARABIC_FEE_QUESTION, provider });
    expect(second.cached).toBe(true);
    expect(second.answer).toBe(first.answer);
    // The whole point: the second visitor costs nothing.
    expect(vi.mocked(redis.set)).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache an Arabic fee answer as a refusal', async () => {
    // The regression a review found: the information noun can precede a
    // negation about something else. This sentence ANSWERS the fee, so it must
    // stay un-refused and be cached.
    const result = await ask({
      question: ARABIC_FEE_QUESTION,
      provider: fixedProvider(ARABIC_FEE_ANSWER),
    });

    expect(result.refused).toBe(false);
    expect(vi.mocked(redis.set)).toHaveBeenCalledTimes(1);
  });

  it('does not cache an Arabic refusal, and marks it refused', async () => {
    const result = await ask({
      question: 'هل توجد منحة للأيتام؟',
      provider: fixedProvider('عذرًا، ليس لديّ معلومات عن هذا.\nSUMBER: -'),
    });

    expect(result.refused).toBe(true);
    expect(vi.mocked(redis.set)).not.toHaveBeenCalled();
  });

  it('reads back exactly what it wrote', async () => {
    // A direct check of the round trip, independent of the service: the cache
    // stores the response object as JSON and returns it unchanged.
    const key = cacheKeyFor(ARABIC_FEE_QUESTION, []);
    expect(key).not.toBeNull();

    const value = { answer: ARABIC_FEE_ANSWER, sources: [], refused: false };
    await writeCached(key as string, value);

    await expect(readCached(key as string)).resolves.toEqual(value);
  });
});
