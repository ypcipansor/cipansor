import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatbotConversation: {
      upsert: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    chatbotMessage: { createMany: vi.fn() },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import {
  TRANSCRIPT_RETENTION_DAYS,
  getConversation,
  listConversations,
  purgeConversationsBefore,
  recordTurn,
  retentionCutoff,
} from '../transcript.service';

const db = prisma as unknown as {
  chatbotConversation: Record<string, ReturnType<typeof vi.fn>>;
  chatbotMessage: Record<string, ReturnType<typeof vi.fn>>;
};

const NOW = new Date('2026-09-04T03:00:00Z');

function turn(over: Record<string, unknown> = {}) {
  return {
    clientId: 'c-1',
    question: 'Berapa biaya pendaftaran?',
    answer: 'Rp 350.000',
    sources: [{ id: 'spmb', title: 'SPMB', kind: 'live' as const }],
    refused: false,
    fromCache: false,
    model: 'DeepSeek-V4-Flash',
    now: NOW,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.chatbotConversation.upsert.mockResolvedValue({ id: 'conv-1' });
  db.chatbotConversation.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1' });
  db.chatbotConversation.update.mockResolvedValue({});
  db.chatbotMessage.createMany.mockResolvedValue({ count: 2 });
});

describe('recordTurn', () => {
  it('tidak mencatat apa pun tanpa pengenal percakapan', async () => {
    // Sampai widget mengirim `conversationId`, tidak ada yang boleh tersimpan.
    // Mencatat dengan pengenal karangan akan membuat setiap giliran menjadi
    // percakapan satu-baris — riwayat yang tidak bisa dibaca sebagai percakapan.
    await recordTurn(turn({ clientId: undefined }));

    expect(db.chatbotConversation.upsert).not.toHaveBeenCalled();
    expect(db.chatbotMessage.createMany).not.toHaveBeenCalled();
  });

  it('menulis pertanyaan dan jawaban sebagai dua giliran pada percakapan yang sama', async () => {
    await recordTurn(turn());

    const rows = db.chatbotMessage.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      conversationId: 'conv-1',
      role: 'user',
      content: 'Berapa biaya pendaftaran?',
    });
    expect(rows[1]).toMatchObject({
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Rp 350.000',
      refused: false,
      fromCache: false,
      model: 'DeepSeek-V4-Flash',
    });
  });

  it('menaruh jawaban SESUDAH pertanyaannya, walau ditulis pada saat yang sama', async () => {
    // Keduanya ditulis dengan satu `createMany`. Kalau stempel waktunya sama
    // persis, urutan `orderBy: createdAt` menjadi tidak tentu dan percakapan
    // dapat tampil dengan jawaban mendahului pertanyaannya.
    await recordTurn(turn());

    const rows = db.chatbotMessage.createMany.mock.calls[0][0].data;
    expect(rows[1].createdAt.getTime()).toBeGreaterThan(rows[0].createdAt.getTime());
  });

  it('menambah dua pada penghitung dan menggeser waktu giliran terakhir', async () => {
    await recordTurn(turn());

    expect(db.chatbotConversation.update.mock.calls[0][0].data).toEqual({
      messageCount: { increment: 2 },
      lastMessageAt: NOW,
    });
  });

  it('memakai percakapan yang sudah ada ketika dua giliran berebut membuatnya', async () => {
    db.chatbotConversation.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7',
      })
    );

    await recordTurn(turn());

    expect(db.chatbotConversation.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { clientId: 'c-1' },
      select: { id: true },
    });
    expect(db.chatbotMessage.createMany).toHaveBeenCalledTimes(1);
  });

  it('tidak melempar ketika basis datanya sedang tidak bisa ditulis', async () => {
    // Pengunjung sudah menerima jawabannya. Riwayat yang gagal ditulis tidak
    // boleh mengubah jawaban itu menjadi galat 500 — aturan yang sama dengan
    // `recordUsage`, dan alasannya sama.
    db.chatbotConversation.upsert.mockRejectedValueOnce(new Error('connection refused'));

    await expect(recordTurn(turn())).resolves.toBeUndefined();
    expect(db.chatbotMessage.createMany).not.toHaveBeenCalled();
  });

  it('menyimpan penolakan dan jawaban dari cache sebagaimana adanya', async () => {
    await recordTurn(turn({ refused: true, fromCache: true, model: undefined }));

    expect(db.chatbotMessage.createMany.mock.calls[0][0].data[1]).toMatchObject({
      refused: true,
      fromCache: true,
      model: null,
    });
  });
});

describe('listConversations', () => {
  beforeEach(() => {
    db.chatbotConversation.count.mockResolvedValue(3);
    db.chatbotConversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        startedAt: new Date('2026-09-04T01:00:00Z'),
        lastMessageAt: new Date('2026-09-04T01:05:00Z'),
        messageCount: 4,
        messages: [{ content: 'Berapa biayanya?' }],
        _count: { messages: 1 },
      },
    ]);
  });

  it('memetakan baris menjadi ringkasan yang bisa dibaca di daftar', async () => {
    const result = await listConversations({ page: 1, pageSize: 20 });

    expect(result.total).toBe(3);
    expect(result.conversations[0]).toEqual({
      id: 'conv-1',
      startedAt: '2026-09-04T01:00:00.000Z',
      lastMessageAt: '2026-09-04T01:05:00.000Z',
      messageCount: 4,
      refusedCount: 1,
      firstQuestion: 'Berapa biayanya?',
    });
  });

  it('membatasi ukuran halaman, berapa pun yang diminta pemanggil', async () => {
    // `pageSize` datang dari query string, jadi ia dapat berisi apa saja.
    // Tanpa batas ini satu permintaan dapat menarik seluruh tabel.
    await listConversations({ pageSize: 5000 });

    expect(db.chatbotConversation.findMany.mock.calls[0][0].take).toBe(100);
  });

  it('menyaring hanya percakapan yang memuat penolakan', async () => {
    await listConversations({ onlyRefused: true });

    expect(db.chatbotConversation.findMany.mock.calls[0][0].where).toEqual({
      messages: { some: { refused: true } },
    });
  });

  it('mencari pada isi pesan tanpa membedakan huruf besar-kecil', async () => {
    await listConversations({ search: '  Beasiswa ' });

    expect(db.chatbotConversation.findMany.mock.calls[0][0].where).toMatchObject({
      messages: { some: { content: { contains: 'Beasiswa', mode: 'insensitive' } } },
    });
  });
});

describe('getConversation', () => {
  it('mengembalikan null untuk percakapan yang tidak ada', async () => {
    db.chatbotConversation.findUnique.mockResolvedValue(null);
    expect(await getConversation('hilang')).toBeNull();
  });

  it('menormalkan peran yang tidak dikenal menjadi giliran pengunjung', async () => {
    // Kolomnya String, bukan enum, jadi nilai di luar dua yang dikenal mungkin
    // saja ada. Menganggapnya "assistant" akan menampilkan kalimat pengunjung
    // seolah-olah sistem yang mengatakannya.
    db.chatbotConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      startedAt: new Date('2026-09-04T01:00:00Z'),
      lastMessageAt: new Date('2026-09-04T01:05:00Z'),
      messageCount: 1,
      messages: [
        {
          id: 'm1',
          role: 'sesuatu-yang-lain',
          content: 'halo',
          sources: null,
          refused: false,
          fromCache: false,
          model: null,
          createdAt: new Date('2026-09-04T01:00:00Z'),
        },
      ],
    });

    const result = await getConversation('conv-1');
    expect(result?.messages[0].role).toBe('user');
    expect(result?.messages[0].sources).toEqual([]);
  });
});

describe('purgeConversationsBefore', () => {
  it('tidak menghapus apa pun ketika tidak ada yang kedaluwarsa', async () => {
    db.chatbotConversation.findMany.mockResolvedValue([]);

    expect(await purgeConversationsBefore(NOW)).toEqual({ conversations: 0, messages: 0 });
    expect(db.chatbotConversation.deleteMany).not.toHaveBeenCalled();
  });

  it('menghapus yang lewat batas dan melaporkan jumlah pesannya', async () => {
    db.chatbotConversation.findMany.mockResolvedValue([
      { id: 'a', messageCount: 4 },
      { id: 'b', messageCount: 2 },
    ]);
    db.chatbotConversation.deleteMany.mockResolvedValue({ count: 2 });

    const result = await purgeConversationsBefore(NOW);

    expect(db.chatbotConversation.findMany.mock.calls[0][0].where).toEqual({
      lastMessageAt: { lt: NOW },
    });
    expect(result).toEqual({ conversations: 2, messages: 6 });
  });
});

describe('retentionCutoff', () => {
  it('mundur tepat sebanyak masa simpan yang dijanjikan', () => {
    // Angkanya dijanjikan kepada pengunjung di halaman riwayat. Kalau konstanta
    // dan hitungannya berpisah, yang tertulis di layar berhenti benar.
    const cutoff = retentionCutoff(new Date('2026-09-04T00:00:00Z'));
    const days = (Date.UTC(2026, 8, 4) - cutoff.getTime()) / (24 * 60 * 60 * 1000);

    expect(days).toBe(TRANSCRIPT_RETENTION_DAYS);
    expect(cutoff.toISOString()).toBe('2026-06-06T00:00:00.000Z');
  });
});
