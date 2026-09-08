import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatbotEscalationStatus, type ChatbotEscalation } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatbotEscalation: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/modules/notifications/email-transport', () => ({ deliverEmail: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { deliverEmail } from '@/modules/notifications/email-transport';
import {
  ESCALATION_RETENTION_DAYS,
  MAX_DELIVERY_ATTEMPTS,
  attemptDelivery,
  createEscalation,
  deliverPending,
  purgeEscalationsBefore,
  referenceOf,
  renderEscalationEmail,
  retentionCutoff,
} from '../escalation.service';

const db = prisma as unknown as {
  chatbotEscalation: Record<string, ReturnType<typeof vi.fn>>;
};
const mail = vi.mocked(deliverEmail);

function row(overrides: Partial<ChatbotEscalation> = {}): ChatbotEscalation {
  return {
    id: '3f2b1a90-1111-2222-3333-444455556666',
    conversationId: null,
    name: 'Ibu Aminah',
    email: 'aminah@example.test',
    phone: '0812-3456-7890',
    whatsapp: null,
    question: 'Apakah ada beasiswa untuk anak yatim?',
    consentAt: new Date('2026-09-05T02:00:00Z'),
    status: ChatbotEscalationStatus.PENDING,
    attempts: 0,
    lastError: null,
    sentAt: null,
    createdAt: new Date('2026-09-05T02:00:00Z'),
    updatedAt: new Date('2026-09-05T02:00:00Z'),
    ...overrides,
  } as ChatbotEscalation;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.chatbotEscalation.create.mockResolvedValue(row());
  db.chatbotEscalation.update.mockResolvedValue(row());
  mail.mockResolvedValue({ kind: 'gmail_api', delivered: true, messageId: 'm1' });
});

describe('createEscalation', () => {
  it('mencatat KAPAN persetujuannya diberikan, bukan sekadar bahwa ia ada', async () => {
    // UU PDP menuntut bukti kapan persetujuan diberikan. Sebuah boolean
    // `consent: true` tidak dapat menjawab pertanyaan itu enam bulan kemudian.
    const now = new Date('2026-09-05T03:04:05Z');
    await createEscalation({
      name: 'Ibu Aminah',
      email: 'aminah@example.test',
      question: 'Apakah ada beasiswa?',
      now,
    });

    expect(db.chatbotEscalation.create.mock.calls[0][0].data.consentAt).toBe(now);
  });

  it('menyimpan kolom kosong sebagai null, bukan string kosong', async () => {
    // Dua bentuk untuk satu arti adalah cara sebuah tampilan mulai mencetak
    // baris kosong bertuliskan "Telepon: ".
    await createEscalation({
      name: 'Ibu Aminah',
      email: 'aminah@example.test',
      phone: '   ',
      whatsapp: '',
      question: 'Apakah ada beasiswa?',
    });

    const data = db.chatbotEscalation.create.mock.calls[0][0].data;
    expect(data.phone).toBeNull();
    expect(data.whatsapp).toBeNull();
  });

  it('mengembalikan nomor rujukan yang bisa disebut lewat telepon', async () => {
    const result = await createEscalation({
      name: 'Ibu Aminah',
      email: 'aminah@example.test',
      question: 'Apakah ada beasiswa?',
    });

    expect(result.reference).toBe('3F2B1A90');
    expect(result.reference).toBe(referenceOf(result.id));
  });
});

describe('renderEscalationEmail', () => {
  it('menyebut nomor rujukan di subjeknya, dan potongan pertanyaannya', async () => {
    const { subject } = renderEscalationEmail(row());
    expect(subject).toContain('3F2B1A90');
    expect(subject).toContain('beasiswa');
  });

  it('MENG-ESCAPE isi yang ditulis penanya', () => {
    // Formulir ini terbuka untuk umum dan penerimanya membaca hasilnya di
    // Gmail. Sebuah pertanyaan yang memuat markup bukan skenario teoretis.
    const { html } = renderEscalationEmail(
      row({ question: '<script>alert(1)</script>', name: 'Budi & "Ani"' })
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Budi &amp; &quot;Ani&quot;');
  });

  it('melewati kolom yang tidak diisi, tidak mencetaknya kosong', () => {
    const { html } = renderEscalationEmail(row({ whatsapp: null }));
    expect(html).not.toContain('WhatsApp');
    expect(html).toContain('Telepon');
  });
});

describe('attemptDelivery', () => {
  it('menyetel Balas ke alamat PENANYA, bukan ke kotak masuk tujuannya', async () => {
    // Inti seluruh fitur ini. Tanpa `replyTo`, petugas yang menekan Balas
    // mengirim surat kepada kotak masuknya sendiri, dan orang yang bertanya
    // tidak pernah mendapat jawaban.
    await attemptDelivery(row());

    expect(mail.mock.calls[0][0].replyTo).toBe('aminah@example.test');
  });

  it('menandai SENT dan mencatat waktunya', async () => {
    await attemptDelivery(row());

    expect(db.chatbotEscalation.update.mock.calls[0][0].data).toMatchObject({
      status: ChatbotEscalationStatus.SENT,
      lastError: null,
    });
  });

  it('TIDAK menandai SENT ketika transportnya hanya menulis log', async () => {
    // `delivered: false` berarti surelnya tidak dikonfigurasi — tidak ada yang
    // dikirim ke mana pun. Menandainya SENT akan berbohong kepada satu-satunya
    // orang yang bisa memperbaikinya.
    mail.mockResolvedValue({ kind: 'log', delivered: false, messageId: 'm1' });

    const sent = await attemptDelivery(row());

    expect(sent).toBe(false);
    expect(db.chatbotEscalation.update.mock.calls[0][0].data.status).toBe(
      ChatbotEscalationStatus.PENDING
    );
  });

  it('tetap PENDING selama masih ada percobaan tersisa', async () => {
    mail.mockRejectedValue(new Error('SMTP 421'));

    await attemptDelivery(row({ attempts: 1 }));

    expect(db.chatbotEscalation.update.mock.calls[0][0].data).toMatchObject({
      attempts: 2,
      status: ChatbotEscalationStatus.PENDING,
      lastError: 'SMTP 421',
    });
  });

  it('menyerah menjadi FAILED di batas percobaan, bukan mengulang selamanya', async () => {
    mail.mockRejectedValue(new Error('SMTP 421'));

    await attemptDelivery(row({ attempts: MAX_DELIVERY_ATTEMPTS - 1 }));

    expect(db.chatbotEscalation.update.mock.calls[0][0].data.status).toBe(
      ChatbotEscalationStatus.FAILED
    );
  });

  it('tidak pernah melempar, bahkan ketika basis datanya ikut gagal', async () => {
    // Pemanggilnya ada dua: permukaan HTTP yang SUDAH menjawab penanya, dan
    // penjadwal yang sedang mengerjakan antrian. Untuk keduanya, sebuah
    // lemparan hanya merusak sesuatu yang lain.
    mail.mockRejectedValue(new Error('SMTP 421'));
    db.chatbotEscalation.update.mockRejectedValue(new Error('DB down'));

    await expect(attemptDelivery(row())).resolves.toBe(false);
  });
});

describe('deliverPending', () => {
  it('hanya mengambil yang masih menunggu, yang terlama lebih dulu', async () => {
    db.chatbotEscalation.findMany.mockResolvedValue([]);

    await deliverPending();

    expect(db.chatbotEscalation.findMany.mock.calls[0][0]).toMatchObject({
      where: { status: ChatbotEscalationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('meneruskan antrian meski satu baris gagal', async () => {
    // Satu alamat surel yang cacat tidak boleh menahan pertanyaan orang lain
    // di belakangnya.
    db.chatbotEscalation.findMany.mockResolvedValue([
      row({ id: 'a1111111-0000-0000-0000-000000000000' }),
      row({ id: 'b2222222-0000-0000-0000-000000000000' }),
    ]);
    mail.mockRejectedValueOnce(new Error('alamat tidak sah'));

    const result = await deliverPending();

    expect(result).toEqual({ attempted: 2, sent: 1 });
  });
});

describe('retensi', () => {
  it('menyapu tepat 90 hari ke belakang', () => {
    expect(ESCALATION_RETENTION_DAYS).toBe(90);
    expect(retentionCutoff(new Date('2026-09-05T02:00:00Z')).toISOString()).toBe(
      '2026-06-07T02:00:00.000Z'
    );
  });

  it('menghapus yang GAGAL terkirim juga', async () => {
    // Menyimpan data pribadi selamanya karena suratnya gagal terkirim bukan
    // alasan yang sah untuk menahan data orang.
    db.chatbotEscalation.deleteMany.mockResolvedValue({ count: 3 });

    const deleted = await purgeEscalationsBefore(new Date('2026-06-07T02:00:00Z'));

    expect(deleted).toBe(3);
    expect(db.chatbotEscalation.deleteMany.mock.calls[0][0].where).toEqual({
      createdAt: { lt: new Date('2026-06-07T02:00:00Z') },
    });
  });
});
