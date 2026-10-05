/**
 * The staging/test provider answers from the REAL public corpus.
 *
 * These tests are the reason it is safe to run on a public host: they pin that
 * every sentence it returns is copied out of the context the service assembled,
 * that it refuses when the question has no footing there, and that it never
 * pretends to be a model. The corpus itself is not stubbed — the entries are
 * the real ones from `@cipansor/shared`, so a change that makes the bot invent
 * a fact has to break these.
 */
import { describe, it, expect } from 'vitest';
import { EchoProvider } from '../providers/echo';
import { buildMessages } from '../prompt';
import { knowledgeBase } from '../knowledge-base';

const provider = new EchoProvider();

/** The system prompt the service would assemble for this question. */
function systemFor(
  question: string,
  liveFacts: Parameters<typeof buildMessages>[0]['liveFacts'] = []
) {
  const messages = buildMessages({ question, entries: knowledgeBase, liveFacts });
  return messages.find((m) => m.role === 'system')!.content;
}

async function answer(
  question: string,
  liveFacts: Parameters<typeof buildMessages>[0]['liveFacts'] = []
) {
  const result = await provider.complete({
    messages: [
      { role: 'system', content: systemFor(question, liveFacts) },
      { role: 'user', content: question },
    ],
    maxTokens: 700,
    temperature: 0.2,
  });
  return result.text;
}

describe('EchoProvider', () => {
  it('quotes a real corpus entry rather than inventing one', async () => {
    const text = await answer('apa visi pesantren');

    // The words are the corpus's own. If the entry is reworded, this fails —
    // which is the point: the staging answer must never drift from the source.
    expect(text).toContain('Mencetak Generasi');
  });

  it('attributes the entry it answered from', async () => {
    const text = await answer('apa visi pesantren');

    expect(text).toMatch(/SUMBER: \S+/);
    expect(text).toContain('SUMBER: profil-umum');
  });

  it('says plainly that it is a test copy', async () => {
    const text = await answer('apa visi pesantren');

    expect(text).toMatch(/lingkungan uji/i);
  });

  it('refuses when the question has no footing in the corpus', async () => {
    const text = await answer('berapa harga tiket pesawat ke bulan');

    expect(text).toMatch(/belum memiliki informasi/i);
    expect(text).not.toMatch(/SUMBER:/);
  });

  it('refuses when the context carries no information at all', async () => {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: '=== INFORMASI RESMI ===\n[TIDAK ADA INFORMASI RELEVAN]' },
        { role: 'user', content: 'apa visi pesantren' },
      ],
      maxTokens: 700,
      temperature: 0.2,
    });

    expect(result.text).toMatch(/belum memiliki informasi/i);
  });

  it('answers from a live admission fact, not only the static corpus', async () => {
    const text = await answer('berapa biaya pendaftaran', [
      {
        id: 'spmb-gelombang-aktif',
        title: 'Info SPMB terkini',
        text: 'Biaya pendaftaran Rp 200.000.',
      },
    ]);

    expect(text).toContain('Rp 200.000');
    expect(text).toContain('SUMBER: spmb-gelombang-aktif');
  });

  it('never returns more than it was given', async () => {
    // The strongest guarantee: the answer is a substring of the context it was
    // handed. A provider that cannot do this is one that can fabricate.
    const system = systemFor('apa visi pesantren');
    const context = system.split('=== INFORMASI RESMI ===')[1];
    const text = await answer('apa visi pesantren');
    const body = text
      .split('\n\n')
      .filter((part) => !part.startsWith('_(') && !part.startsWith('SUMBER:'))
      .join('\n\n')
      .trim();

    expect(context).toContain(body);
  });
});
