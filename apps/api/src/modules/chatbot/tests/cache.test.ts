import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheKeyFor, isCacheable, readCached, writeCached } from '../cache';
import { redis } from '@/lib/redis';
import { config } from '@/config';
import type { LiveFact } from '../live-facts';

vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockRedis = vi.mocked(redis);

const fee350: LiveFact[] = [
  { id: 'spmb-gelombang-aktif', title: 'SPMB', text: 'Biaya pendaftaran: Rp 350.000.' },
];
const fee500: LiveFact[] = [
  { id: 'spmb-gelombang-aktif', title: 'SPMB', text: 'Biaya pendaftaran: Rp 500.000.' },
];

beforeEach(() => vi.clearAllMocks());

describe('cacheKeyFor', () => {
  it('collapses phrasings of the same question onto one key', () => {
    // These are one question. Sharing a key is what turns a 30-second wait into
    // a millisecond one for the visitor who asks second.
    const a = cacheKeyFor('Berapa biaya pendaftaran?', []);
    const b = cacheKeyFor('biaya pendaftaran berapa ya', []);
    expect(a).toBe(b);
  });

  it('ignores colloquial particles, which real visitors type constantly', () => {
    expect(cacheKeyFor('biaya pendaftaran berapa sih pak', [])).toBe(
      cacheKeyFor('berapa biaya pendaftaran', [])
    );
  });

  it('does NOT collapse a misspelling — a documented miss, not a merge', () => {
    // Pinning the known limit rather than pretending it away. Fuzzy matching
    // would fix this but risks merging two different questions onto one key,
    // which serves the wrong answer. A miss only costs one model call; a wrong
    // merge costs a visitor the truth. If this ever becomes a hit-rate problem,
    // this test is the place the decision gets revisited.
    expect(cacheKeyFor('brp biyaya pndaftaran nya', [])).not.toBe(
      cacheKeyFor('berapa biaya pendaftaran', [])
    );
  });

  it('separates genuinely different questions', () => {
    expect(cacheKeyFor('di mana alamat pesantren', [])).not.toBe(
      cacheKeyFor('berapa biaya pendaftaran', [])
    );
  });

  it('CHANGES when the live admission facts change', () => {
    // The trap this whole design exists for: caching an answer that quotes the
    // fee is how a bot ends up telling a family last season's price. A changed
    // fee must produce a different key, so the stale entry is simply never
    // looked up again — no flush, no TTL race.
    expect(cacheKeyFor('berapa biaya pendaftaran', fee350)).not.toBe(
      cacheKeyFor('berapa biaya pendaftaran', fee500)
    );
  });

  it('is stable while the live facts are unchanged', () => {
    expect(cacheKeyFor('berapa biaya pendaftaran', fee350)).toBe(
      cacheKeyFor('berapa biaya pendaftaran', fee350)
    );
  });

  it('distinguishes an answer with live facts from one without', () => {
    expect(cacheKeyFor('berapa biaya pendaftaran', fee350)).not.toBe(
      cacheKeyFor('berapa biaya pendaftaran', [])
    );
  });

  it('CHANGES when the public content changes', () => {
    // The other half of the staleness guarantee. Edit a phone number, a
    // programme description or any public-page text and the corpus hash moves,
    // so every cached answer built from the old text is orphaned on deploy —
    // no flush step, nothing for anyone to remember. Without this, a corrected
    // phone number would keep being read out of Redis for up to a day.
    expect(cacheKeyFor('di mana alamat pesantren', [], '', 'corpus-lama')).not.toBe(
      cacheKeyFor('di mana alamat pesantren', [], '', 'corpus-baru')
    );
  });

  it('CHANGES when the persona changes', () => {
    // The persona shapes every answer, and a super admin can edit it from the
    // admin UI at any moment. A changed persona must move the key so the cache
    // re-fills in the new voice rather than serving a stale answer in the old —
    // the same staleness guarantee the corpus hash gives for public content.
    expect(cacheKeyFor('di mana alamat pesantren', [], 'persona lama')).not.toBe(
      cacheKeyFor('di mana alamat pesantren', [], 'persona baru')
    );
  });

  it('is stable while the persona is unchanged', () => {
    expect(cacheKeyFor('di mana alamat pesantren', [], 'persona X')).toBe(
      cacheKeyFor('di mana alamat pesantren', [], 'persona X')
    );
  });

  it('returns null for a question with nothing to key on', () => {
    // Stopwords only. Such a question retrieves nothing and refuses anyway.
    expect(cacheKeyFor('yang di dan', [])).toBeNull();
  });
});

describe('isCacheable', () => {
  it('refuses to cache once a conversation has history', () => {
    // With history the answer depends on turns the key knows nothing about, so
    // a hit would serve one visitor's reply to another's conversation.
    expect(isCacheable(0)).toBe(true);
    expect(isCacheable(1)).toBe(false);
  });

  it('is disabled entirely when the TTL is zero', () => {
    const original = config.chatbot.cacheTtlSeconds;
    Object.assign(config.chatbot, { cacheTtlSeconds: 0 });
    expect(isCacheable(0)).toBe(false);
    Object.assign(config.chatbot, { cacheTtlSeconds: original });
  });
});

describe('readCached', () => {
  it('returns the stored response', async () => {
    const stored = { answer: 'halo', sources: [], refused: false };
    mockRedis.get.mockResolvedValue(JSON.stringify(stored));
    expect(await readCached('k')).toEqual(stored);
  });

  it('returns null on a miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await readCached('k')).toBeNull();
  });

  it('falls through when Redis is down instead of failing the request', async () => {
    // A cache that is down must never be a chatbot that is down.
    mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await readCached('k')).toBeNull();
  });

  it('falls through when the stored value is not valid JSON', async () => {
    mockRedis.get.mockResolvedValue('{not json');
    expect(await readCached('k')).toBeNull();
  });
});

describe('writeCached', () => {
  it('stores with the configured expiry', async () => {
    mockRedis.set.mockResolvedValue('OK');
    await writeCached('k', { answer: 'a', sources: [], refused: false });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'k',
      expect.stringContaining('"answer":"a"'),
      'EX',
      config.chatbot.cacheTtlSeconds
    );
  });

  it('swallows a write failure', async () => {
    mockRedis.set.mockRejectedValue(new Error('down'));
    await expect(
      writeCached('k', { answer: 'a', sources: [], refused: false })
    ).resolves.toBeUndefined();
  });
});
