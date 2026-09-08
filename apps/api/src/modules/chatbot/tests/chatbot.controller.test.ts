import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../chatbot.service', () => ({
  ask: vi.fn(),
  resolveProvider: vi.fn(),
  ChatbotUnavailableError: class extends Error {},
  ChatbotBusyError: class extends Error {
    constructor(readonly retryAfterSeconds: number) {
      super('busy');
    }
  },
}));
vi.mock('../transcript.service', () => ({
  recordTurn: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  TRANSCRIPT_RETENTION_DAYS: 90,
}));
vi.mock('../persona.service', () => ({}));
vi.mock('../escalation.service', () => ({
  createEscalation: vi.fn(),
  attemptDelivery: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { chatbotEscalation: { findUnique: vi.fn() } },
}));
vi.mock('../usage.service', () => ({
  monthToDateUsage: vi.fn(),
  estimateCost: vi.fn(),
}));

import { config } from '@/config';
import * as chatbotService from '../chatbot.service';
import { estimateCost, monthToDateUsage } from '../usage.service';
import * as transcriptService from '../transcript.service';
import { ask, escalate, getUsage } from '../chatbot.controller';
import * as escalationService from '../escalation.service';
import { prisma } from '@/lib/prisma';

const askService = vi.mocked(chatbotService.ask);
const recordTurn = vi.mocked(transcriptService.recordTurn);

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    set(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & {
    body: { data?: Record<string, unknown>; error?: { code?: string; message?: string } };
    headers: Record<string, string>;
  };
}

function fakeReq(body: Record<string, unknown>) {
  return { body } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  recordTurn.mockResolvedValue(undefined);
});

describe('POST /chatbot/public/ask', () => {
  it('tidak pernah mengirimkan penanda cache ke peramban', async () => {
    // `cached` adalah pembukuan internal. Ia membocorkan cara kerja dalam
    // kepada siapa pun di internet tanpa memberi pengunjung apa pun, dan ia
    // ada di objek yang sama dengan jawabannya — jadi satu-satunya hal yang
    // memisahkannya adalah pelucutan di controller ini.
    askService.mockResolvedValue({
      answer: 'Rp 350.000',
      sources: [],
      refused: false,
      model: 'DeepSeek-V4-Flash',
      cached: true,
    });

    const res = fakeRes();
    await ask(fakeReq({ message: 'berapa biayanya', conversationId: 'c-1' }), res, vi.fn());

    expect(res.body.data).toEqual({
      answer: 'Rp 350.000',
      sources: [],
      refused: false,
      model: 'DeepSeek-V4-Flash',
    });
    expect(res.body.data).not.toHaveProperty('cached');
  });

  it('mencatat giliran itu ke riwayat, lengkap dengan asal jawabannya', async () => {
    askService.mockResolvedValue({
      answer: 'Rp 350.000',
      sources: [{ id: 'spmb', title: 'SPMB', kind: 'live' }],
      refused: false,
      model: 'DeepSeek-V4-Flash',
      cached: true,
    });

    await ask(
      fakeReq({ message: 'berapa biayanya', conversationId: 'c-1' }),
      fakeRes(),
      vi.fn()
    );

    expect(recordTurn).toHaveBeenCalledWith({
      clientId: 'c-1',
      question: 'berapa biayanya',
      answer: 'Rp 350.000',
      sources: [{ id: 'spmb', title: 'SPMB', kind: 'live' }],
      refused: false,
      fromCache: true,
      model: 'DeepSeek-V4-Flash',
    });
  });

  it('menandai jawaban yang benar-benar dari model sebagai bukan dari cache', async () => {
    askService.mockResolvedValue({
      answer: 'Rp 350.000',
      sources: [],
      refused: false,
      model: 'DeepSeek-V4-Flash',
    });

    await ask(fakeReq({ message: 'x', conversationId: 'c-1' }), fakeRes(), vi.fn());

    expect(recordTurn.mock.calls[0][0].fromCache).toBe(false);
  });

  it('tetap menjawab pengunjung ketika riwayatnya gagal ditulis', async () => {
    // Jawabannya dikirim sebelum riwayatnya ditulis, jadi kegagalan di bawah
    // itu tidak dapat menyentuhnya. Uji ini memerah bila urutannya pernah
    // dibalik — dan urutan terbalik itu berarti pertanyaan yang sudah terjawab
    // dengan benar berbalas galat 500.
    askService.mockResolvedValue({ answer: 'ok', sources: [], refused: false });
    recordTurn.mockRejectedValue(new Error('db down'));

    const res = fakeRes();
    const next = vi.fn();
    await ask(fakeReq({ message: 'x', conversationId: 'c-1' }), res, next);

    expect(res.body).toEqual({
      success: true,
      data: { answer: 'ok', sources: [], refused: false },
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('GET /chatbot/admin/usage', () => {
  const originalSpend = { ...config.chatbot.spend };

  function stubUsage(over: Record<string, unknown> = {}) {
    vi.mocked(monthToDateUsage).mockResolvedValue({
      monthKey: '2026-09',
      monthStart: new Date('2026-09-01T00:00:00Z'),
      requests: 120,
      promptTokens: 2_000_000,
      completionTokens: 500_000,
      cachedPromptTokens: 0,
      unmeteredRequests: 0,
      byModel: [],
      ...over,
    } as never);
  }

  beforeEach(() => {
    Object.assign(config.chatbot.spend, { monthlyBudget: 10, alertTo: 'ops@example.test' });
    stubUsage();
    vi.mocked(estimateCost).mockReturnValue({
      amount: 2.5,
      currency: 'USD',
      priced: true,
      cacheUnreported: true,
      incomplete: false,
    });
  });

  afterEach(() => {
    Object.assign(config.chatbot.spend, originalSpend);
  });

  it('melaporkan persen anggaran dari biaya dan anggaran yang berlaku', async () => {
    const res = fakeRes();
    await getUsage({} as unknown as Request, res, vi.fn());

    expect(res.body.data).toMatchObject({
      monthKey: '2026-09',
      requests: 120,
      monthlyBudget: 10,
      percentOfBudget: 25,
      alertTo: 'ops@example.test',
    });
  });

  it('meneruskan bendera arah kemelesetan apa adanya, tidak menyaringnya', async () => {
    // Mengirim angka tanpa benderanya mengubah taksiran menjadi pernyataan —
    // bentuk kekeliruan yang paling merugikan di sistem ini.
    const res = fakeRes();
    await getUsage({} as unknown as Request, res, vi.fn());

    expect(res.body.data?.cost).toEqual({
      amount: 2.5,
      currency: 'USD',
      priced: true,
      cacheUnreported: true,
      incomplete: false,
    });
  });

  it('TIDAK melaporkan persen apa pun ketika harganya belum diisi', async () => {
    // Nol persen akan terbaca sebagai "belum ada yang terpakai", padahal yang
    // benar adalah "belum bisa dihitung". Null memaksa layarnya diam.
    vi.mocked(estimateCost).mockReturnValue({
      amount: 0,
      currency: 'USD',
      priced: false,
      cacheUnreported: false,
      incomplete: false,
    });

    const res = fakeRes();
    await getUsage({} as unknown as Request, res, vi.fn());

    expect(res.body.data?.percentOfBudget).toBeNull();
  });

  it('tidak melaporkan persen ketika anggarannya belum diatur', async () => {
    Object.assign(config.chatbot.spend, { monthlyBudget: 0 });

    const res = fakeRes();
    await getUsage({} as unknown as Request, res, vi.fn());

    expect(res.body.data?.percentOfBudget).toBeNull();
  });

  it('jatuh ke alamat balasan surat resmi bila tujuan peringatan kosong', async () => {
    Object.assign(config.chatbot.spend, { alertTo: '' });

    const res = fakeRes();
    await getUsage({} as unknown as Request, res, vi.fn());

    expect(res.body.data?.alertTo).toBe(config.mail.replyTo);
  });
});

describe('ask ketika asisten sedang ramai', () => {
  it('menjawab 503 dengan Retry-After, dan kalimat yang berbeda dari "mati"', async () => {
    // Perbedaannya penting bagi penanya. "Sedang tidak tersedia" menyuruh ia
    // menyerah; pada asisten yang sebenarnya hidup dan hanya ramai, mencoba
    // lagi sepuluh detik lagi hampir pasti berhasil. Header `Retry-After`
    // menyampaikan itu kepada klien mana pun, bukan hanya kepada widget kami.
    const BusyError = chatbotService.ChatbotBusyError as unknown as new (s: number) => Error;
    askService.mockRejectedValueOnce(new BusyError(10));

    const res = fakeRes();
    await ask(fakeReq({ message: 'halo' }), res, vi.fn());

    expect(res.statusCode).toBe(503);
    expect(res.headers['Retry-After']).toBe('10');
    expect(res.body.error?.code).toBe('CHATBOT_BUSY');
    // Kode dibaca mesin, pesan dibaca orang. Ketiga pemanggilan
    // `ApiResponse.error` di controller ini pernah tertukar urutannya sehingga
    // keduanya bertukar tempat; baris di bawah memerah bila itu terulang.
    expect(res.body.error?.message).toMatch(/sedang ramai/);
  });

  it('tidak menuliskan apa pun ke riwayat percakapan', async () => {
    // Tidak ada pertanyaan yang terjawab, jadi tidak ada giliran untuk dicatat.
    // Menuliskannya akan mengotori halaman Riwayat dengan baris kosong yang
    // terbaca seolah asisten gagal menjawab, padahal ia tidak pernah ditanya.
    const BusyError = chatbotService.ChatbotBusyError as unknown as new (s: number) => Error;
    askService.mockRejectedValueOnce(new BusyError(10));

    await ask(fakeReq({ message: 'halo' }), fakeRes(), vi.fn());

    expect(recordTurn).not.toHaveBeenCalled();
  });
});

describe('escalate', () => {
  const createEscalation = vi.mocked(escalationService.createEscalation);
  const attemptDelivery = vi.mocked(escalationService.attemptDelivery);
  const db = prisma as unknown as {
    chatbotEscalation: { findUnique: ReturnType<typeof vi.fn> };
  };

  const body = {
    name: 'Ibu Aminah',
    email: 'aminah@example.test',
    question: 'Apakah ada beasiswa untuk anak yatim?',
    consent: true as const,
  };

  beforeEach(() => {
    createEscalation.mockResolvedValue({ id: 'id-1', reference: 'ABCD1234' });
    db.chatbotEscalation.findUnique.mockResolvedValue(null);
  });

  it('menjawab dengan nomor rujukan, dan mencoba mengirim SESUDAHNYA', async () => {
    // Urutan sebaliknya membuat pertanyaan yang sudah tersimpan bergantung pada
    // penyedia surel pihak ketiga: satu gangguan di sana, dan penanya menerima
    // galat atas pertanyaan yang sebenarnya sudah aman tercatat.
    const res = fakeRes();
    await escalate(fakeReq(body), res, vi.fn());

    expect(res.body.data).toMatchObject({ accepted: true, reference: 'ABCD1234' });
    expect(createEscalation).toHaveBeenCalled();
  });

  it('tidak pernah menggagalkan permintaan ketika pengirimannya gagal', async () => {
    db.chatbotEscalation.findUnique.mockRejectedValue(new Error('DB down'));

    const res = fakeRes();
    await escalate(fakeReq(body), res, vi.fn());

    expect(res.body.data).toMatchObject({ accepted: true });
  });

  it('menelan umpan lalat tanpa menulis satu baris pun', async () => {
    // Dijawab seolah berhasil, lengkap dengan nomor rujukan palsu: memberi tahu
    // sebuah skrip bahwa ia tertangkap hanya membantu penulisnya memperbaiki.
    const res = fakeRes();
    await escalate(fakeReq({ ...body, website: 'http://spam.test' }), res, vi.fn());

    expect(res.body.data).toMatchObject({ accepted: true });
    expect(createEscalation).not.toHaveBeenCalled();
    expect(attemptDelivery).not.toHaveBeenCalled();
  });
});
