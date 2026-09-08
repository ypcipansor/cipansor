import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { ApiResponse } from '@/utils/response';
import { logger } from '@/lib/logger';
import type {
  ChatbotConversationListResponse,
  ChatbotEscalationResponse,
  ChatbotPersonaResponse,
  ChatbotUsageResponse,
} from '@cipansor/shared';
import * as chatbotService from './chatbot.service';
import * as personaService from './persona.service';
import * as transcriptService from './transcript.service';
import * as escalationService from './escalation.service';
import { estimateCost, monthToDateUsage } from './usage.service';
import { config } from '@/config';
import { prisma } from '@/lib/prisma';
import type { EscalateBody, PublicChatBody, UpdatePersonaBody } from './chatbot.schema';

/**
 * Ask the public assistant.
 * POST /api/chatbot/public/ask
 *
 * Unauthenticated by design: it serves visitors who have not logged in and can
 * reach nothing but public information. Rate limiting, not authentication, is
 * what protects it — see `chatbot.routes.ts`.
 */
export const ask = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as PublicChatBody;

  try {
    const { cached, ...result } = await chatbotService.ask({
      question: body.message,
      history: body.history,
    });

    // Log that a question was asked and whether it could be answered, never the
    // question text: visitors type personal details into chat boxes ("anak saya
    // bernama…"), and an application log is the wrong place for them to end up.
    // The transcript below is a different thing with different rules — it is
    // read only by a super admin, and it deletes itself after 90 days.
    logger.info('Chatbot answered', {
      refused: result.refused,
      sources: result.sources.length,
      conversationId: body.conversationId,
      cached: cached === true,
    });

    // Jawabannya dikirim LEBIH DULU, riwayatnya ditulis sesudahnya.
    //
    // Urutan sebaliknya membuat jawaban yang sudah siap bergantung pada
    // keberhasilan penulisan riwayat: `recordTurn` memang menelan galatnya
    // sendiri, tetapi menaruhnya sebelum `res.json` menjadikan jaminan itu
    // menanggung beban di tempat yang tidak perlu — satu perubahan di modul
    // lain, dan pengunjung menerima galat 500 atas pertanyaan yang sudah
    // terjawab dengan benar. Sesudah `res.json`, tidak ada kegagalan di bawah
    // ini yang dapat menyentuhnya.
    //
    // Dicatat DI SINI, bukan di dalam service, karena hanya permukaan HTTP yang
    // melayani pengunjung sungguhan — memanggilnya dari `ask()` akan ikut
    // mencatat setiap jalannya harness evaluasi ke dalam riwayat.
    res.json(ApiResponse.success(result));

    try {
      await transcriptService.recordTurn({
        clientId: body.conversationId,
        question: body.message,
        answer: result.answer,
        sources: result.sources,
        refused: result.refused,
        fromCache: cached === true,
        model: result.model,
      });
    } catch (error) {
      logger.warn('Chatbot transcript record failed after answering', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  } catch (error) {
    if (error instanceof chatbotService.ChatbotBusyError) {
      // 503 juga, tetapi dengan `Retry-After` — dan kalimat yang berbeda.
      // "Sedang tidak tersedia" pada asisten yang sebenarnya hidup dan hanya
      // ramai adalah kabar yang keliru: ia menyuruh penanya menyerah, padahal
      // mencoba lagi sepuluh detik lagi hampir pasti berhasil.
      res
        .set('Retry-After', String(error.retryAfterSeconds))
        .status(503)
        .json(
          // Urutannya pesan-dulu-baru-kode (`ApiResponse.error(message, code)`).
          // Ketiga pemanggilan di berkas ini pernah tertukar, sehingga `code`
          // berisi kalimat bahasa Indonesia dan `message` berisi konstanta —
          // yang membalik gunanya: kode itulah yang dibaca mesin.
          ApiResponse.error(
            'Asisten sedang ramai. Mohon coba lagi sebentar lagi 🙏',
            'CHATBOT_BUSY'
          )
        );
      return;
    }
    if (error instanceof chatbotService.ChatbotUnavailableError) {
      // 503, not 500: the assistant being switched off or its provider being
      // down is an expected state, and the widget renders a calm message with
      // the phone number rather than an error.
      res
        .status(503)
        .json(
          ApiResponse.error(
            'Asisten sedang tidak tersedia. Silakan hubungi kami melalui telepon atau WhatsApp.',
            'CHATBOT_UNAVAILABLE'
          )
        );
      return;
    }
    throw error;
  }
});

/**
 * Teruskan pertanyaan ke tim Cipansor.
 * POST /api/chatbot/public/escalate
 *
 * Dipanggil hanya setelah penanya menyatakan berkenan dan membenarkan
 * ringkasannya — dua persetujuan, keduanya di widget. Endpoint ini tidak
 * memaksakan alurnya (klien mana pun bisa memanggilnya langsung); yang ia
 * paksakan adalah `consent: true` dan tantangan Turnstile.
 */
export const escalate = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as EscalateBody;

  // Umpan lalat. Dijawab seolah berhasil, LENGKAP dengan nomor rujukan palsu:
  // memberi tahu sebuah skrip bahwa ia tertangkap hanya membantu penulisnya
  // memperbaiki skripnya. Tidak ada baris yang ditulis, tidak ada surat yang
  // dikirim.
  if (body.website) {
    logger.warn('Chatbot escalation honeypot tripped', {
      conversationId: body.conversationId,
    });
    res.json(
      ApiResponse.success<ChatbotEscalationResponse>({
        accepted: true,
        reference: 'AAAAAAAA',
      })
    );
    return;
  }

  const { reference, id } = await escalationService.createEscalation({
    name: body.name,
    email: body.email,
    phone: body.phone || undefined,
    whatsapp: body.whatsapp || undefined,
    question: body.question,
    conversationId: body.conversationId,
  });

  // Tidak mencatat nama, surel, nomor, atau pertanyaannya — semuanya data
  // pribadi, dan log aplikasi adalah tempat yang salah untuk mereka berakhir.
  // Nomor rujukannya cukup untuk menemukan barisnya bila perlu.
  logger.info('Chatbot escalation accepted', { reference });

  // Jawabannya dikirim LEBIH DULU, suratnya dicoba sesudahnya — pola yang sama
  // dengan riwayat percakapan di atas, dan alasannya lebih kuat di sini:
  // pengiriman surel bergantung pada layanan pihak ketiga, dan barisnya sudah
  // tersimpan. Kegagalan pengiriman tidak boleh berarti pertanyaan yang hilang,
  // dan penjadwal akan mencobanya lagi.
  res.json(ApiResponse.success<ChatbotEscalationResponse>({ accepted: true, reference }));

  try {
    const row = await prisma.chatbotEscalation.findUnique({ where: { id } });
    if (row) await escalationService.attemptDelivery(row);
  } catch (error) {
    logger.warn('Chatbot escalation first delivery attempt failed to start', {
      reference,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Whether the assistant is available.
 * GET /api/chatbot/public/status
 *
 * The widget calls this before rendering so a disabled or unconfigured
 * assistant simply does not appear, instead of appearing and then failing on
 * the visitor's first question.
 */
export const status = asyncHandler(async (_req: Request, res: Response) => {
  res.json(ApiResponse.success({ available: chatbotService.resolveProvider() !== null }));
});

/**
 * Read the assistant's editable persona (super admin).
 * GET /api/chatbot/admin/persona
 *
 * Returns the persona in force, the code default (so the UI can preview it and
 * offer a reset), and whether a custom value is saved.
 */
export const getPersona = asyncHandler(async (_req: Request, res: Response) => {
  const state = await personaService.getPublicPersonaState();
  res.json(ApiResponse.success(state satisfies ChatbotPersonaResponse));
});

/**
 * Save a custom persona (super admin).
 * PUT /api/chatbot/admin/persona
 *
 * Only the additive style text is accepted; it can never revoke a safety rule
 * (see prompt.ts). Saving re-keys the answer cache, so the next visitor is
 * answered in the new voice with no stale cached copy in the old one.
 */
export const updatePersona = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdatePersonaBody;
  const state = await personaService.setPublicPersona(body.persona, req.user?.id);
  // The persona text itself is house style, not a secret, but logging its
  // length rather than its body keeps the log terse and the audit useful.
  logger.info('Chatbot persona updated', { by: req.user?.id, length: body.persona.length });
  res.json(ApiResponse.success(state satisfies ChatbotPersonaResponse));
});

/**
 * Drop the custom persona and fall back to the default (super admin).
 * DELETE /api/chatbot/admin/persona
 */
export const resetPersona = asyncHandler(async (req: Request, res: Response) => {
  const state = await personaService.resetPublicPersona();
  logger.info('Chatbot persona reset to default', { by: req.user?.id });
  res.json(ApiResponse.success(state satisfies ChatbotPersonaResponse));
});

/**
 * Daftar percakapan (super admin).
 * GET /api/chatbot/admin/conversations
 *
 * Isinya kalimat yang benar-benar diketik pengunjung, jadi rutenya dikunci ke
 * SUPER_ADMIN di `chatbot.routes.ts` dan barisnya menghapus diri setelah 90
 * hari. `retentionDays` ikut dikirim supaya halamannya menyatakan aturan itu
 * kepada pembacanya alih-alih menyembunyikannya di kode.
 */
export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | undefined>;

  const result = await transcriptService.listConversations({
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    onlyRefused: query.onlyRefused === 'true',
    search: query.search,
  });

  res.json(
    ApiResponse.success({
      ...result,
      retentionDays: transcriptService.TRANSCRIPT_RETENTION_DAYS,
    } satisfies ChatbotConversationListResponse)
  );
});

/**
 * Satu percakapan lengkap (super admin).
 * GET /api/chatbot/admin/conversations/:id
 */
export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await transcriptService.getConversation(req.params.id);

  if (!conversation) {
    res.status(404).json(ApiResponse.error('Percakapan tidak ditemukan', 'NOT_FOUND'));
    return;
  }

  // Dicatat karena membaca kalimat orang lain adalah tindakan yang layak
  // meninggalkan jejak, bahkan ketika yang melakukannya berwenang penuh.
  logger.info('Chatbot transcript read', { by: req.user?.id, conversationId: conversation.id });

  res.json(ApiResponse.success(conversation));
});

/**
 * Pemakaian dan taksiran biaya bulan berjalan (super admin).
 * GET /api/chatbot/admin/usage
 *
 * Sampai sekarang angka-angka ini hanya keluar lewat surat peringatan bulanan,
 * yang berarti tidak ada cara melihatnya sebelum ambang pertama terlewati —
 * "berapa yang sudah terpakai" tidak dapat dijawab siapa pun sampai jawabannya
 * sudah terlambat.
 *
 * Bendera `priced`, `cacheUnreported` dan `incomplete` ikut dikirim, bukan
 * disaring di sini: layarnya yang harus menyampaikan arah kemelesetan, dan
 * mengirim angka tanpa benderanya akan mengubah taksiran menjadi pernyataan.
 */
export const getUsage = asyncHandler(async (_req: Request, res: Response) => {
  const usage = await monthToDateUsage();
  const cost = estimateCost(usage);
  const { monthlyBudget, alertTo } = config.chatbot.spend;

  const percentOfBudget =
    cost.priced && monthlyBudget > 0 ? (cost.amount / monthlyBudget) * 100 : null;

  res.json(
    ApiResponse.success({
      monthKey: usage.monthKey,
      requests: usage.requests,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedPromptTokens: usage.cachedPromptTokens,
      unmeteredRequests: usage.unmeteredRequests,
      byModel: usage.byModel,
      cost: {
        amount: cost.amount,
        currency: cost.currency,
        priced: cost.priced,
        cacheUnreported: cost.cacheUnreported,
        incomplete: cost.incomplete,
      },
      monthlyBudget,
      percentOfBudget,
      // Alamat tujuan peringatan jatuh ke alamat balasan surat resmi bila tidak
      // diatur — sama seperti yang dilakukan pekerjaannya, supaya layar dan
      // surat tidak pernah menyebut tujuan yang berbeda.
      alertTo: alertTo || config.mail.replyTo,
    } satisfies ChatbotUsageResponse)
  );
});
