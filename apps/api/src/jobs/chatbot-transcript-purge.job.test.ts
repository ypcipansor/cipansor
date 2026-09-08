import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { create: vi.fn() } },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/modules/chatbot/transcript.service', async () => {
  const actual = await vi.importActual<typeof import('@/modules/chatbot/transcript.service')>(
    '@/modules/chatbot/transcript.service'
  );
  return { ...actual, purgeConversationsBefore: vi.fn() };
});
vi.mock('@/modules/chatbot/escalation.service', async () => {
  const actual = await vi.importActual<typeof import('@/modules/chatbot/escalation.service')>(
    '@/modules/chatbot/escalation.service'
  );
  return { ...actual, purgeEscalationsBefore: vi.fn() };
});

import { prisma } from '@/lib/prisma';
import { purgeConversationsBefore } from '@/modules/chatbot/transcript.service';
import { purgeEscalationsBefore } from '@/modules/chatbot/escalation.service';
import {
  TRANSCRIPT_PURGE_AUDIT_ACTION,
  TRANSCRIPT_PURGE_AUDIT_ENTITY,
  runChatbotTranscriptPurge,
} from './chatbot-transcript-purge.job';

const db = prisma as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } };
const purge = vi.mocked(purgeConversationsBefore);
const purgeEscalations = vi.mocked(purgeEscalationsBefore);

const NOW = new Date('2026-09-04T20:15:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  db.auditLog.create.mockResolvedValue({});
  purge.mockResolvedValue({ conversations: 0, messages: 0 });
  purgeEscalations.mockResolvedValue(0);
});

describe('runChatbotTranscriptPurge', () => {
  it('menyapu tepat 90 hari ke belakang', async () => {
    const result = await runChatbotTranscriptPurge(NOW);

    expect(purge.mock.calls[0][0].toISOString()).toBe('2026-06-06T20:15:00.000Z');
    expect(result.retentionDays).toBe(90);
  });

  it('menulis baris audit MESKIPUN tidak ada yang dihapus', async () => {
    // Ini butir yang menanggung beban seluruh pekerjaan ini. Tabel kosong
    // karena tidak ada yang kedaluwarsa dan tabel kosong karena penyapunya mati
    // tiga bulan lalu terlihat persis sama. Hanya baris "0 dihapus" yang
    // membedakannya — dan retensi 90 hari adalah separuh alasan mengapa
    // menyimpan kalimat pengunjung dapat dipertanggungjawabkan sama sekali.
    await runChatbotTranscriptPurge(NOW);

    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: TRANSCRIPT_PURGE_AUDIT_ACTION,
      entity: TRANSCRIPT_PURGE_AUDIT_ENTITY,
      newValues: {
        conversations: 0,
        messages: 0,
        escalations: 0,
        retentionDays: 90,
        cutoff: '2026-06-06T20:15:00.000Z',
      },
    });
  });

  it('melaporkan berapa yang benar-benar terhapus', async () => {
    purge.mockResolvedValue({ conversations: 7, messages: 31 });

    const result = await runChatbotTranscriptPurge(NOW);

    expect(result).toMatchObject({ conversations: 7, messages: 31 });
    expect(db.auditLog.create.mock.calls[0][0].data.newValues).toMatchObject({
      conversations: 7,
      messages: 31,
    });
  });

  it('tidak melaporkan penyapuan yang berhasil sebagai gagal ketika catatannya tidak tertulis', async () => {
    purge.mockResolvedValue({ conversations: 2, messages: 8 });
    db.auditLog.create.mockRejectedValue(new Error('audit table locked'));

    await expect(runChatbotTranscriptPurge(NOW)).resolves.toMatchObject({ conversations: 2 });
  });

  it('MELEMPAR ketika penyapuannya sendiri gagal', async () => {
    // Berlawanan dengan `recordTurn`, yang menelan galatnya. Di sana kegagalan
    // hanya berarti satu baris riwayat hilang; di sini kegagalan berarti data
    // pribadi tetap tersimpan melewati batas yang dijanjikan, dan itu harus
    // berisik supaya penjadwalnya mencatatnya sebagai galat.
    purge.mockRejectedValue(new Error('connection refused'));

    await expect(runChatbotTranscriptPurge(NOW)).rejects.toThrow('connection refused');
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('penerusan pertanyaan ikut disapu pekerjaan yang sama', () => {
  it('menyapu penerusan pada batas 90 hari yang sama', async () => {
    // Satu janji, satu penyapu. Memberi penerusan pekerjaannya sendiri hanya
    // akan menciptakan penyapu kedua yang bisa mati diam-diam sendirian —
    // persis kegagalan yang baris audit di atas ada untuk mencegahnya.
    await runChatbotTranscriptPurge(NOW);

    expect(purgeEscalations).toHaveBeenCalledTimes(1);
    expect(purgeEscalations.mock.calls[0][0].toISOString()).toBe('2026-06-06T20:15:00.000Z');
  });

  it('melaporkan jumlah penerusan yang terhapus ke baris auditnya', async () => {
    purgeEscalations.mockResolvedValue(4);

    const result = await runChatbotTranscriptPurge(NOW);

    expect(result.escalations).toBe(4);
    expect(db.auditLog.create.mock.calls[0][0].data.newValues).toMatchObject({
      escalations: 4,
    });
  });
});
