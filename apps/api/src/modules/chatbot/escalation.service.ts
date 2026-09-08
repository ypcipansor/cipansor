/**
 * Meneruskan pertanyaan yang tidak bisa dijawab asisten ke tim Cipansor.
 *
 * BENTUKNYA ADALAH ANTRIAN TAHAN LAMA, dan di sinilah ia memang tepat. Obrolan
 * itu sendiri tidak boleh diantrikan — penanya menunggu di layar dan permintaan
 * HTTP-nya mati dalam semenit (lihat `throttle.ts`). Surat ini berbeda: tidak
 * ada yang menunggui ia terkirim. Jadi barisnya ditulis lebih dulu, jawabannya
 * dikembalikan seketika, dan pengirimannya dicoba sesudah itu — lalu diulang
 * penjadwal bila penyedia surel sedang mati.
 *
 * Yang membuat urutan itu penting: bila surat dikirim di dalam permintaan
 * penanya dan gagal, satu-satunya catatannya adalah galat di log, dan
 * pertanyaannya hilang. Baris dulu, surat kemudian, berarti kegagalan
 * pengiriman tidak pernah berarti kehilangan pertanyaan.
 */

import { ChatbotEscalationStatus, type ChatbotEscalation } from '@prisma/client';
import { siteConfig } from '@cipansor/shared';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { config } from '@/config';
import { deliverEmail } from '@/modules/notifications/email-transport';

/** Sama dengan riwayat percakapan: isinya kalimat dan data pribadi orang. */
export const ESCALATION_RETENTION_DAYS = 90;

/**
 * Berapa kali pengiriman dicoba sebelum sebuah baris ditandai FAILED.
 *
 * Lima, dijalankan penjadwal setiap 30 menit, memberi jendela sekitar dua jam
 * — cukup untuk melewati gangguan penyedia surel yang lazim, dan berhenti jauh
 * sebelum ia menjadi pengulangan tanpa akhir yang tidak ada yang perhatikan.
 */
export const MAX_DELIVERY_ATTEMPTS = 5;

export interface CreateEscalationInput {
  name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  question: string;
  conversationId?: string;
  now?: Date;
}

/**
 * Nomor rujukan yang bisa disebut lewat telepon.
 *
 * Delapan karakter pertama dari uuid-nya, huruf besar. Bukan pengaman apa pun —
 * ia hanya perlu cukup untuk menemukan satu baris ketika seseorang menelepon
 * dan berkata "saya sudah mengirim pertanyaan tadi".
 */
export function referenceOf(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export async function createEscalation(
  input: CreateEscalationInput
): Promise<{ id: string; reference: string }> {
  const now = input.now ?? new Date();

  const row = await prisma.chatbotEscalation.create({
    data: {
      name: input.name,
      email: input.email,
      // Kolom kosong disimpan sebagai null, bukan string kosong: keduanya
      // berarti "tidak diberikan", dan dua bentuk untuk satu arti adalah cara
      // sebuah tampilan mulai mencetak baris kosong bertuliskan "Telepon: ".
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      question: input.question,
      conversationId: input.conversationId || null,
      consentAt: now,
    },
  });

  return { id: row.id, reference: referenceOf(row.id) };
}

/** Baris ringkas untuk badan surat; kosongnya dilewati, tidak dicetak kosong. */
function detailLines(row: ChatbotEscalation): Array<[string, string]> {
  const lines: Array<[string, string]> = [['Nama', row.name], ['Email', row.email]];
  if (row.phone) lines.push(['Telepon', row.phone]);
  if (row.whatsapp) lines.push(['WhatsApp', row.whatsapp]);
  lines.push(['Nomor rujukan', referenceOf(row.id)]);
  return lines;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Badan suratnya.
 *
 * Setiap kalimat di sini ditulis penanya, jadi semuanya di-escape. Sebuah
 * pertanyaan yang memuat `<script>` bukan skenario teoretis pada formulir yang
 * terbuka untuk umum, dan penerimanya membaca surat ini di Gmail.
 */
export function renderEscalationEmail(row: ChatbotEscalation): { subject: string; html: string } {
  const rows = detailLines(row)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#5A6A61;white-space:nowrap">${label}</td>` +
        `<td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
    )
    .join('');

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#131C18">
  <p>Halo Cipansor,</p>
  <p>Ada pertanyaan yang tidak mampu saya jawab sebagai asisten AI Cipansor. Penanyanya sudah menyatakan berkenan pertanyaan ini diteruskan kepada tim. Berikut rinciannya:</p>
  <table style="border-collapse:collapse;margin:16px 0">${rows}</table>
  <p style="margin-bottom:6px"><strong>Pertanyaan:</strong></p>
  <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #1C6B4B;background:#F5F7F3;white-space:pre-wrap">${escapeHtml(row.question)}</blockquote>
  <p style="margin-top:20px;color:#5A6A61;font-size:13px">Balas surat ini untuk menjawab langsung kepada penanyanya — alamat balasannya sudah disetel ke ${escapeHtml(row.email)}. Dikirim otomatis oleh asisten AI ${siteConfig.name}.</p>
</div>`;

  // Subjek memuat nomor rujukan supaya utas balasan mudah dicari kembali, dan
  // potongan pertanyaannya supaya kotak masuk bisa dipindai tanpa membuka.
  const preview = row.question.replace(/\s+/g, ' ').slice(0, 60);
  return {
    subject: `[Asisten AI · ${referenceOf(row.id)}] ${preview}${row.question.length > 60 ? '…' : ''}`,
    html,
  };
}

/**
 * Mencoba mengirim satu baris, dan MENCATAT hasilnya apa pun yang terjadi.
 *
 * Tidak pernah melempar. Pemanggilnya ada dua — permukaan HTTP yang sudah
 * menjawab penanya, dan penjadwal yang sedang mengerjakan banyak baris — dan
 * untuk keduanya sebuah lemparan hanya merusak sesuatu yang lain.
 */
export async function attemptDelivery(row: ChatbotEscalation): Promise<boolean> {
  const { subject, html } = renderEscalationEmail(row);

  try {
    const result = await deliverEmail({
      // Kosong berarti "pakai kotak masuk balasan kita" — satu sumber
      // kebenaran, bukan dua alamat yang harus sepakat selamanya.
      to: config.chatbot.escalation.to || config.mail.replyTo,
      subject,
      html,
      // INILAH intinya. Suratnya dikirim dari noreply@ ke halo@, tetapi Balas
      // harus jatuh ke penanyanya. Tanpa ini petugas yang menekan Balas
      // mengirim surat kepada kotak masuknya sendiri, dan orang yang bertanya
      // tidak pernah mendapat jawaban.
      replyTo: row.email,
    });

    // `delivered: false` berarti transport `log` — terkonfigurasi mati, bukan
    // gagal. Menandainya SENT akan berbohong; menandainya FAILED akan membuat
    // penjadwal mengulang selamanya sesuatu yang memang tidak dikirim ke mana
    // pun. Jadi ia tetap PENDING dan attempts-nya naik, sehingga ia berhenti
    // sendiri di batas percobaan dan terlihat sebagai baris yang tertahan.
    if (!result.delivered) {
      await recordFailure(row, 'Email transport is log-only (not configured)');
      return false;
    }

    await prisma.chatbotEscalation.update({
      where: { id: row.id },
      data: {
        status: ChatbotEscalationStatus.SENT,
        sentAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    logger.info('Chatbot escalation delivered', { reference: referenceOf(row.id) });
    return true;
  } catch (error) {
    await recordFailure(row, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function recordFailure(row: ChatbotEscalation, message: string): Promise<void> {
  const attempts = row.attempts + 1;
  const exhausted = attempts >= MAX_DELIVERY_ATTEMPTS;

  try {
    await prisma.chatbotEscalation.update({
      where: { id: row.id },
      data: {
        attempts,
        lastError: message.slice(0, 500),
        status: exhausted ? ChatbotEscalationStatus.FAILED : ChatbotEscalationStatus.PENDING,
      },
    });
  } catch (error) {
    // Basis data yang tidak bisa ditulis tidak boleh menjadi lemparan yang
    // menjatuhkan penjadwal di tengah antrian.
    logger.error('Chatbot escalation failure could not be recorded', {
      reference: referenceOf(row.id),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  logger[exhausted ? 'error' : 'warn']('Chatbot escalation delivery failed', {
    reference: referenceOf(row.id),
    attempts,
    exhausted,
    message,
  });
}

/**
 * Semua yang masih menunggu, dikirim satu per satu.
 *
 * Berurutan, bukan `Promise.all`: ini pekerjaan latar yang bersaing dengan
 * permintaan pengunjung untuk penyedia surel yang sama, dan tidak ada yang
 * menunggui ia cepat.
 */
export async function deliverPending(limit = 25): Promise<{ attempted: number; sent: number }> {
  const rows = await prisma.chatbotEscalation.findMany({
    where: { status: ChatbotEscalationStatus.PENDING },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  for (const row of rows) {
    if (await attemptDelivery(row)) sent += 1;
  }
  return { attempted: rows.length, sent };
}

export function retentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - ESCALATION_RETENTION_DAYS);
  return cutoff;
}

/**
 * Menghapus penerusan yang sudah lewat masa simpannya.
 *
 * Baris FAILED ikut terhapus, dan itu disengaja: menyimpan data pribadi
 * selamanya karena suratnya gagal terkirim adalah alasan yang tidak sah untuk
 * menahan data orang. Dua jam pengulangan sudah lewat berbulan-bulan
 * sebelumnya, dan yang gagal sudah masuk log.
 */
export async function purgeEscalationsBefore(cutoff: Date): Promise<number> {
  const { count } = await prisma.chatbotEscalation.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
