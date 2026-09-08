/**
 * Riwayat tanya-jawab asisten publik: apa yang ditanyakan orang, dan apa yang
 * dijawab asisten.
 *
 * SEBELUM modul ini, isi percakapan sengaja tidak disimpan sama sekali —
 * `chatbot.controller.ts` mencatat bahwa sebuah pertanyaan datang, tetapi tidak
 * pernah teksnya, karena pengunjung mengetikkan hal pribadi ke kotak obrolan.
 * Keberatan itu tidak hilang; ia dijawab. Tiga pagar yang membuat penyimpanan
 * ini bertanggung jawab, dan ketiganya diputuskan bersama pemilik sistem:
 *
 *   1. Hanya SUPER_ADMIN yang dapat membacanya (lihat `chatbot.routes.ts`).
 *   2. Isinya dihapus otomatis setelah 90 hari (`jobs/chatbot-transcript-purge`).
 *   3. Tidak ada IP, tidak ada sidik jari peramban, tidak ada apa pun yang
 *      menautkan percakapan ke seseorang. Cukup untuk memperbaiki jawaban yang
 *      keliru; tidak cukup untuk melacak orang.
 *
 * Yang dicatat di sini BERBEDA dari `usage.service.ts`, dan perbedaannya
 * disengaja: pembukuan mencatat apa yang DIBAYAR, riwayat mencatat apa yang
 * DIKATAKAN. Jawaban dari cache tidak menelan biaya sepeser pun, tetapi
 * pengunjung tetap membacanya — jadi ia masuk ke riwayat dan tidak masuk ke
 * pembukuan.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { ChatSource } from '@cipansor/shared';

/** Berapa lama satu percakapan disimpan sebelum dihapus otomatis. */
export const TRANSCRIPT_RETENTION_DAYS = 90;

export interface RecordTurnInput {
  /** Pengenal percakapan dari peramban. Tanpa ini, giliran tidak dicatat. */
  clientId?: string;
  question: string;
  answer: string;
  sources: ChatSource[];
  refused: boolean;
  fromCache: boolean;
  model?: string;
  now?: Date;
}

/**
 * Catat satu giliran — pertanyaan pengunjung dan jawaban asisten — sebagai dua
 * baris pesan pada percakapan yang sama.
 *
 * TIDAK PERNAH MELEMPAR. Pengunjung sudah menerima jawabannya sebelum fungsi
 * ini dipanggil; riwayat yang gagal ditulis tidak boleh mengubah jawaban itu
 * menjadi galat 500. Sama seperti `recordUsage`.
 */
export async function recordTurn(input: RecordTurnInput): Promise<void> {
  const { clientId, question, answer, sources, refused, fromCache, model } = input;
  if (!clientId) return;

  const now = input.now ?? new Date();

  try {
    const conversation = await upsertConversation(clientId, now);

    await prisma.chatbotMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: 'user',
          content: question,
          createdAt: now,
        },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: answer,
          // `sources` sudah berbentuk data biasa; disimpan apa adanya supaya
          // pertanyaan "dari mana angka itu?" masih terjawab berbulan-bulan
          // kemudian, ketika korpusnya sudah berubah.
          sources: sources as unknown as Prisma.InputJsonValue,
          refused,
          fromCache,
          model: model ?? null,
          // Satu milidetik sesudah pertanyaannya, supaya urutan dua baris yang
          // ditulis dalam saat yang sama tidak pernah ambigu.
          createdAt: new Date(now.getTime() + 1),
        },
      ],
    });

    await prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: { messageCount: { increment: 2 }, lastMessageAt: now },
    });
  } catch (error) {
    logger.warn('Chatbot transcript write failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Ambil (atau buat) percakapan untuk `clientId`.
 *
 * Dua giliran yang tiba nyaris bersamaan dapat sama-sama mendapati barisnya
 * belum ada dan sama-sama mencoba membuatnya; yang kalah menerima P2002 pada
 * indeks unik `client_id`. Itu bukan galat — barisnya justru sudah ada — jadi
 * ia dibaca ulang alih-alih dilempar.
 */
async function upsertConversation(clientId: string, now: Date) {
  try {
    return await prisma.chatbotConversation.upsert({
      where: { clientId },
      create: { clientId, startedAt: now, lastMessageAt: now },
      update: {},
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.chatbotConversation.findUniqueOrThrow({
        where: { clientId },
        select: { id: true },
      });
    }
    throw error;
  }
}

export interface ListConversationsOptions {
  page?: number;
  pageSize?: number;
  /** Hanya percakapan yang memuat setidaknya satu penolakan. */
  onlyRefused?: boolean;
  /** Cari pada isi pesan. */
  search?: string;
}

/**
 * Halaman daftar percakapan, terbaru lebih dulu.
 *
 * Setiap baris membawa cuplikan pertanyaan pertama, karena daftar tanpa itu
 * hanya berisi tanggal dan angka — dan tidak ada yang bisa memutuskan
 * percakapan mana yang perlu dibuka.
 */
export async function listConversations(options: ListConversationsOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));

  const where: Prisma.ChatbotConversationWhereInput = {};
  if (options.onlyRefused) {
    where.messages = { some: { refused: true } };
  }
  if (options.search?.trim()) {
    where.messages = {
      ...(where.messages ?? {}),
      some: {
        ...(options.onlyRefused ? { refused: true } : {}),
        content: { contains: options.search.trim(), mode: 'insensitive' },
      },
    };
  }

  const [total, rows] = await Promise.all([
    prisma.chatbotConversation.count({ where }),
    prisma.chatbotConversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        startedAt: true,
        lastMessageAt: true,
        messageCount: true,
        messages: {
          where: { role: 'user' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { content: true },
        },
        _count: { select: { messages: { where: { refused: true } } } },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    conversations: rows.map((row) => ({
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      lastMessageAt: row.lastMessageAt.toISOString(),
      messageCount: row.messageCount,
      refusedCount: row._count.messages,
      firstQuestion: row.messages[0]?.content ?? '',
    })),
  };
}

/** Satu percakapan lengkap dengan seluruh gilirannya, urut waktu. */
export async function getConversation(id: string) {
  const row = await prisma.chatbotConversation.findUnique({
    where: { id },
    select: {
      id: true,
      startedAt: true,
      lastMessageAt: true,
      messageCount: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          sources: true,
          refused: true,
          fromCache: true,
          model: true,
          createdAt: true,
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
    messageCount: row.messageCount,
    messages: row.messages.map((message) => ({
      id: message.id,
      role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: message.content,
      sources: (message.sources as unknown as ChatSource[] | null) ?? [],
      refused: message.refused,
      fromCache: message.fromCache,
      model: message.model ?? undefined,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

/**
 * Hapus percakapan yang giliran terakhirnya lebih tua dari `cutoff`.
 *
 * Pesannya ikut terhapus lewat `onDelete: Cascade`, jadi tidak ada baris yatim
 * yang tertinggal memegang teks yang seharusnya sudah hilang — kegagalan yang
 * tidak akan terlihat oleh siapa pun sampai ada yang memeriksa tabelnya.
 */
export async function purgeConversationsBefore(cutoff: Date): Promise<{
  conversations: number;
  messages: number;
}> {
  const doomed = await prisma.chatbotConversation.findMany({
    where: { lastMessageAt: { lt: cutoff } },
    select: { id: true, messageCount: true },
  });

  if (doomed.length === 0) return { conversations: 0, messages: 0 };

  const { count } = await prisma.chatbotConversation.deleteMany({
    where: { id: { in: doomed.map((row) => row.id) } },
  });

  return {
    conversations: count,
    messages: doomed.reduce((sum, row) => sum + row.messageCount, 0),
  };
}

/** Batas waktu retensi terhadap `now`. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
