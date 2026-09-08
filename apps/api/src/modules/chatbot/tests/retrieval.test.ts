import { describe, it, expect } from 'vitest';
import { Bm25Retriever, defaultRetriever, stem, tokenize } from '../retrieval';
import { knowledgeById } from '../knowledge-base';

describe('tokenize', () => {
  it('drops Indonesian stopwords so ranking is about subject matter', () => {
    // Without this, "Apa yang ada di ..." scores on function words that appear
    // in nearly every entry.
    expect(tokenize('Apa saja yang ada di sini')).toEqual([]);
  });

  it('normalises the apostrophe so "Qur\'an" and "Quran" are the same token', () => {
    expect(tokenize("Qur'an")).toEqual(tokenize('Quran'));
  });

  it('is case-insensitive and splits on punctuation', () => {
    expect(tokenize('SMP IT, Cipansor!')).toEqual(tokenize('smp it cipansor'));
  });
});

describe('stem', () => {
  it('reduces the affixed forms a visitor actually types to one root', () => {
    // The single most likely question this bot receives is some form of
    // "how do I register", and Indonesian offers many spellings of it.
    const root = stem('daftar');
    expect(stem('pendaftaran')).toBe(root);
    expect(stem('mendaftar')).toBe(root);
  });

  it('refuses to stem below four characters', () => {
    // Over-stemming destroys precision silently: "makan" must not become "mak".
    expect(stem('makan')).toBe('makan');
    expect(stem('kami')).toBe('kami');
  });
});

describe('Bm25Retriever', () => {
  it('returns nothing for a query with no indexable terms', () => {
    expect(defaultRetriever.search('yang di dan')).toEqual([]);
  });

  it('ranks the entry whose title matches above one that merely mentions it', () => {
    const results = defaultRetriever.search('SMP IT Cipansor');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.id).toBe('unit-smpit');
  });

  it('finds the donation account entry from a natural question', () => {
    const results = defaultRetriever.search('ke mana saya transfer donasi wakaf');
    expect(results.map((r) => r.entry.id)).toContain('donasi-rekening');
  });

  it('finds registration guidance from an affixed query', () => {
    // Proves the stemmer is wired into retrieval, not just unit-tested alone.
    const results = defaultRetriever.search('bagaimana cara pendaftaran santri baru');
    expect(results.map((r) => r.entry.id)).toContain('spmb-cara-daftar');
  });

  it('honours the result limit', () => {
    expect(defaultRetriever.search('Cipansor', 2).length).toBeLessThanOrEqual(2);
  });

  it('drops weak hits that merely share one stem with the query', () => {
    // The widget displays its sources, so a fee question that cites
    // "Menghafal Hadits" reads as a broken or evasive bot. Observed against the
    // live database before the relative cutoff existed.
    const ids = defaultRetriever.search('berapa biaya pendaftaran').map((r) => r.entry.id);
    expect(ids).not.toContain('program-hadits');
    expect(ids).not.toContain('program-entrepreneurship');
  });

  it('still returns the entries that genuinely match', () => {
    // The cutoff must not be so aggressive that it strands real answers.
    const ids = defaultRetriever.search('donasi wakaf rekening').map((r) => r.entry.id);
    expect(ids).toContain('donasi-rekening');
  });

  describe('misspelling tolerance', () => {
    it('answers the heavily misspelled fee question that used to be refused', () => {
      // Observed in the eval as `salah-ketik`. Before fuzzy correction this
      // retrieved nothing and the service refused — the worst outcome, because
      // the visitor concludes the pesantren has no answer rather than that they
      // mistyped.
      const ids = defaultRetriever.search('brp biyaya pndaftaran nya').map((r) => r.entry.id);
      expect(ids).toContain('spmb-cara-daftar');
    });

    it('corrects a single transposed letter', () => {
      expect(defaultRetriever.search('tahfdiz').length).toBeGreaterThan(0);
    });

    it('leaves short words alone rather than risk a wrong correction', () => {
      // At four characters an edit of one already reaches a different word, and
      // answering a question nobody asked is worse than not answering.
      const ids = defaultRetriever.search('baru').map((r) => r.entry.id);
      const buku = defaultRetriever.search('buku').map((r) => r.entry.id);
      expect(ids).not.toEqual(buku);
    });

    it('does not invent a match for a word the corpus has no neighbour for', () => {
      expect(defaultRetriever.search('helikopter kuantum')).toEqual([]);
    });
  });

  describe('aliases', () => {
    it('finds the contact entry from "di mana", not just from "alamat"', () => {
      // The entry says "Alamat"; the visitor says "di mana" and "luar kota".
      // Before aliases this retrieved units and programmes, and the model
      // honestly reported having no address — which is the worst kind of bug,
      // because it looks like the pesantren simply has no answer.
      const ids = defaultRetriever
        .search('Saya dari luar kota. Pesantrennya di mana?')
        .map((r) => r.entry.id);
      expect(ids).toContain('kontak');
    });

    it('answers an English donation question', () => {
      const ids = defaultRetriever.search('How can I donate to the pesantren?').map((r) => r.entry.id);
      expect(ids).toContain('donasi-rekening');
    });

    it('answers an English registration question', () => {
      const ids = defaultRetriever.search('How do I register my child?').map((r) => r.entry.id);
      expect(ids).toContain('spmb-cara-daftar');
    });

    it('never leaks alias words into what the model is shown', () => {
      // Aliases are a retrieval device. If they reached the prompt the model
      // could quote them back as if they were published facts.
      const entry = knowledgeById.get('kontak')!;
      expect(entry.text).not.toContain('reach us');
      expect(entry.text).not.toContain('dimana');
    });
  });

  it('handles an empty corpus without dividing by zero', () => {
    expect(new Bm25Retriever([]).search('apa pun')).toEqual([]);
  });
});

describe('pertanyaan meta tentang asisten itu sendiri', () => {
  // Dilaporkan pengguna 2026-09-04 dengan tangkapan layar: "ada informasi apa
  // saja" dijawab dengan penolakan. Sebabnya ada di uji pertama berkas ini —
  // `ada`, `apa` dan `saja` semuanya kata henti, sehingga yang tersisa hanya
  // "informasi", dan sebelum entri daftar isi ada, tidak satu pun entri
  // membahasnya. Nol potongan, penolakan, tanpa pernah menyentuh model.
  it('"ada informasi apa saja" menemukan daftar isi', () => {
    const hits = defaultRetriever.search('ada informasi apa saja');

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.id).toBe('bantuan-ikhtisar');
  });

  it('menemukan hal yang sama untuk cara bertanya yang lain', () => {
    for (const question of [
      'bisa bantu apa saja',
      'topik apa yang bisa ditanyakan',
      'what can you help with',
    ]) {
      const hits = defaultRetriever.search(question);
      expect(hits.length, `tidak ada hasil untuk: ${question}`).toBeGreaterThan(0);
    }
  });

  it('daftar isi tidak merebut pertanyaan yang punya jawaban sendiri', () => {
    // Entri ini memuat kata "informasi" beberapa kali, jadi risikonya nyata:
    // sebuah daftar isi yang muncul di mana-mana akan mengalahkan jawaban yang
    // sebenarnya dicari orang.
    for (const [question, expected] of [
      ['di mana alamat pesantren', 'kontak'],
      ['bagaimana cara mendaftar', 'spmb-cara-daftar'],
      ['rekening donasi', 'donasi-rekening'],
    ] as const) {
      const hits = defaultRetriever.search(question);
      expect(hits[0].entry.id, `salah arah untuk: ${question}`).toBe(expected);
    }
  });
});
