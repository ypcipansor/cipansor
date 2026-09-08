import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatbotUsageDaily: { findMany: vi.fn() },
    auditLog: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock('@/modules/notifications/email-transport', () => ({
  deliverEmail: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { config } from '@/config';
import { deliverEmail } from '@/modules/notifications/email-transport';
import {
  runChatbotSpendCheck,
  CHATBOT_SPEND_AUDIT_ACTION,
  CHATBOT_SPEND_AUDIT_ENTITY,
} from './chatbot-spend.job';

const db = prisma as unknown as {
  chatbotUsageDaily: { findMany: ReturnType<typeof vi.fn> };
  auditLog: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};
const mail = vi.mocked(deliverEmail);

const NOW = new Date('2026-09-20T03:00:00Z');
const originalChatbot = { ...config.chatbot };
const originalSpend = { ...config.chatbot.spend };

/**
 * Pemakaian yang cukup untuk menghasilkan biaya yang dapat dihitung tangan.
 *
 * Dengan harga masukan 1,00 dan keluaran 2,00 per satu juta token, satu juta
 * token masukan berarti tepat 1,00 — sehingga setiap ambang di bawah ini dapat
 * diperiksa tanpa perlu memercayai perkalian yang sedang diuji.
 */
function usage(promptTokensMillions: number, over: Record<string, unknown> = {}) {
  return [
    {
      id: 'r1',
      date: new Date('2026-09-19T00:00:00.000Z'),
      model: 'DeepSeek-V4-Flash',
      requests: 500,
      promptTokens: promptTokensMillions * 1_000_000,
      completionTokens: 0,
      cachedPromptTokens: 0,
      unmeteredRequests: 0,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  db.chatbotUsageDaily.findMany.mockResolvedValue([]);
  db.auditLog.findFirst.mockResolvedValue(null);
  db.auditLog.create.mockResolvedValue({});
  mail.mockResolvedValue({ kind: 'gmail_api', delivered: true, messageId: 'm1' });

  Object.assign(config.chatbot, { provider: 'openai-compatible' });
  Object.assign(config.chatbot.spend, {
    inputPricePerMillionTokens: 1,
    outputPricePerMillionTokens: 2,
    cachedInputPricePerMillionTokens: 0,
    currency: 'USD',
    monthlyBudget: 10,
    alertTo: 'ops@example.test',
  });
});

afterEach(() => {
  Object.assign(config.chatbot, originalChatbot);
  Object.assign(config.chatbot.spend, originalSpend);
});

describe('runChatbotSpendCheck', () => {
  it('tidak berbuat apa-apa ketika asistennya memang dimatikan', async () => {
    Object.assign(config.chatbot, { provider: 'disabled' });

    const result = await runChatbotSpendCheck(NOW);

    expect(result.skipped).toBe('chatbot-disabled');
    expect(db.chatbotUsageDaily.findMany).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it('diam pada bulan tanpa satu pun panggilan', async () => {
    const result = await runChatbotSpendCheck(NOW);

    expect(result.skipped).toBe('no-usage');
    expect(mail).not.toHaveBeenCalled();
  });

  it('diam selama masih di bawah ambang terendah', async () => {
    // 4,9 dari anggaran 10 = 49%.
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(4.9));

    const result = await runChatbotSpendCheck(NOW);

    expect(result.skipped).toBe('below-thresholds');
    expect(result.percentOfBudget).toBeCloseTo(49, 6);
    expect(mail).not.toHaveBeenCalled();
  });

  it('mengirim satu surat ketika ambang 80% terlewati', async () => {
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5));

    const result = await runChatbotSpendCheck(NOW);

    expect(result.sent).toBe('budget-80');
    expect(mail).toHaveBeenCalledTimes(1);
    const sent = mail.mock.calls[0][0];
    expect(sent.to).toBe('ops@example.test');
    expect(sent.subject).toContain('85%');
    expect(sent.html).toContain('USD 8.50');
  });

  it('mengirim SATU surat, bukan tiga, ketika sebulan melompat melewati semua ambang', async () => {
    // 12 dari 10 = 120%: 50, 80 dan 100 semuanya terlewati sekaligus. Kabar yang
    // dibutuhkan hanya yang tertinggi; dua lainnya bukan berita tersendiri.
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(12));

    const result = await runChatbotSpendCheck(NOW);

    expect(result.sent).toBe('budget-100');
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][0].subject).toContain('melampaui anggaran');
  });

  it('tidak mengulang tingkat yang sudah pernah dikabarkan bulan ini', async () => {
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5));
    db.auditLog.findFirst.mockResolvedValue({ id: 'sudah' });

    const result = await runChatbotSpendCheck(NOW);

    expect(result.skipped).toBe('already-notified');
    expect(db.auditLog.findFirst.mock.calls[0][0].where).toMatchObject({
      action: CHATBOT_SPEND_AUDIT_ACTION,
      entity: CHATBOT_SPEND_AUDIT_ENTITY,
      entityId: '2026-09:budget-80',
    });
    expect(mail).not.toHaveBeenCalled();
  });

  it('menandai bulan itu hanya SESUDAH suratnya benar-benar terkirim', async () => {
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5));

    await runChatbotSpendCheck(NOW);

    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: CHATBOT_SPEND_AUDIT_ACTION,
      entityId: '2026-09:budget-80',
    });
  });

  it('tidak menandai apa pun ketika pengirimannya gagal, sehingga besok dicoba lagi', async () => {
    // Urutan terbalik akan menelan peringatan ini untuk selamanya: bulannya
    // sudah tertandai dan tidak akan pernah dicoba ulang. Berisik itu terlihat;
    // senyap tidak.
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5));
    mail.mockRejectedValue(new Error('gmail 500'));

    const result = await runChatbotSpendCheck(NOW);

    expect(result.skipped).toBe('send-failed');
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('memperlakukan transport log-only sebagai belum terkirim', async () => {
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5));
    mail.mockResolvedValue({ kind: 'log', delivered: false, messageId: 'm1' });

    const result = await runChatbotSpendCheck(NOW);

    expect(result.skipped).toBe('send-failed');
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('tetap berbunyi ketika harganya belum diisi, alih-alih diam', async () => {
    // Bentuk kegagalan yang sudah dua kali terjadi di modul ini adalah sesuatu
    // yang ada di kode dan tidak berlaku di produksi. "Belum berharga" karena
    // itu tidak boleh berarti "tidak berbunyi".
    Object.assign(config.chatbot.spend, {
      inputPricePerMillionTokens: 0,
      outputPricePerMillionTokens: 0,
      cachedInputPricePerMillionTokens: 0,
    });
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(3));

    const result = await runChatbotSpendCheck(NOW);

    expect(result.sent).toBe('unpriced');
    expect(result.cost?.priced).toBe(false);
    expect(mail.mock.calls[0][0].html).toContain('CHATBOT_PRICE_INPUT_PER_MTOK');
  });

  it('memberi kabar yang sama ketika harganya ada tetapi anggarannya belum', async () => {
    Object.assign(config.chatbot.spend, { monthlyBudget: 0 });
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(3));

    const result = await runChatbotSpendCheck(NOW);

    expect(result.sent).toBe('unpriced');
    expect(result.percentOfBudget).toBeNull();
  });

  it('menyebut ke arah mana taksirannya meleset ketika ada panggilan tak terukur', async () => {
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5, { unmeteredRequests: 12 }));

    await runChatbotSpendCheck(NOW);

    // Angka yang terdengar pasti padahal tidak adalah jenis kekeliruan yang
    // paling merugikan di sistem ini — lihat memori "Figures that lie". Arahnya
    // pun harus disebut: yang tak terukur membuatnya kurang, cache yang tak
    // dilaporkan membuatnya lebih, dan keduanya bisa berlaku sekaligus.
    expect(mail.mock.calls[0][0].html).toContain('kurang dari yang sebenarnya');
  });

  it('menyebut taksirannya batas atas ketika token cache tidak dilaporkan', async () => {
    Object.assign(config.chatbot.spend, { cachedInputPricePerMillionTokens: 0.1 });
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5));

    await runChatbotSpendCheck(NOW);

    expect(mail.mock.calls[0][0].html).toContain('lebih dari yang sebenarnya');
  });

  it('jatuh ke alamat balasan surat resmi bila tujuan peringatan tidak diatur', async () => {
    Object.assign(config.chatbot.spend, { alertTo: '' });
    db.chatbotUsageDaily.findMany.mockResolvedValue(usage(8.5));

    await runChatbotSpendCheck(NOW);

    expect(mail.mock.calls[0][0].to).toBe(config.mail.replyTo);
  });
});
