import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { RoleCode } from '@prisma/client';
import { validate } from '@/middleware/error';
import { authenticate, authorize } from '@/middleware/auth';
import { requireTurnstile } from '@/middleware/turnstile';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import * as controller from './chatbot.controller';
import { escalateSchema, publicChatSchema, updatePersonaSchema } from './chatbot.schema';

/**
 * Dedicated limiter, much stricter than `defaultLimiter`.
 *
 * Every request here costs money upstream and is reachable by anyone on the
 * internet with no credential — the textbook shape of a cost-amplification
 * target. 10/minute per IP is generous for a human asking questions and
 * useless for anyone trying to run up a bill.
 */
const chatbotLimiter = rateLimit({
  windowMs: config.chatbot.rateLimit.windowMs,
  max: config.chatbot.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Terlalu banyak pertanyaan. Mohon tunggu sebentar sebelum bertanya lagi.',
    },
  },
  handler: (req, res, _next, options) => {
    logger.warn('Chatbot rate limit exceeded', { ip: req.ip });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Jauh lebih ketat daripada `chatbotLimiter`, dan yang dilindunginya berbeda.
 *
 * Obrolan menghabiskan uang; penerusan menghabiskan PERHATIAN — setiap
 * permintaan yang lolos menjadi satu surat di kotak masuk yang dibaca manusia.
 * Kotak masuk yang tenggelam oleh kiriman skrip berhenti dibaca sama sekali,
 * dan pertanyaan sungguhan ikut tenggelam bersamanya. Tiga per jam per IP
 * longgar untuk satu keluarga yang bertanya, dan tidak berguna bagi pengirim
 * massal.
 */
const escalationLimiter = rateLimit({
  windowMs: config.chatbot.escalation.rateLimit.windowMs,
  max: config.chatbot.escalation.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message:
        'Sudah beberapa pertanyaan diteruskan dari perangkat ini. Mohon tunggu sebentar, atau hubungi kami langsung lewat telepon.',
    },
  },
  handler: (req, res, _next, options) => {
    logger.warn('Chatbot escalation rate limit exceeded', { ip: req.ip });
    res.status(options.statusCode).json(options.message);
  },
});

const router = Router();

// No `authenticate`: this is the PUBLIC assistant. Anything requiring a user
// belongs to the Phase 2 authenticated agent, which must reach private data by
// calling existing authorised endpoints as that user with their active role —
// never by widening what this router can see.
router.get('/public/status', controller.status);
// Turnstile di depan limiter yang sudah ada, bukan menggantikannya. Batas
// 10/menit per IP membatasi ongkos satu penyerang; Turnstile membatasi jumlah
// penyerang yang sepadan untuk mencoba. Endpoint ini membelanjakan uang pada
// setiap panggilan, jadi keduanya dipakai bersama.
router.post(
  '/public/ask',
  chatbotLimiter,
  requireTurnstile('chatbot-ask'),
  validate(publicChatSchema),
  controller.ask
);

// Penerusan pertanyaan ke tim. Turnstile dipakai di sini dengan alasan yang
// berbeda dari `/ask`: bukan untuk melindungi tagihan, melainkan untuk
// melindungi kotak masuk yang dibaca manusia. Umpan lalatnya ada di skema, dan
// dijawab seolah berhasil — lihat controller.
router.post(
  '/public/escalate',
  escalationLimiter,
  requireTurnstile('chatbot-escalate'),
  validate(escalateSchema),
  controller.escalate
);

// Admin surface: configure the assistant's persona. Authenticated and locked to
// SUPER_ADMIN — the persona is additive style only (it can never revoke a
// safety rule, see prompt.ts), but who may edit the public voice of the
// pesantren is still a privilege, not a public one.
router.get('/admin/persona', authenticate, authorize(RoleCode.SUPER_ADMIN), controller.getPersona);
router.put(
  '/admin/persona',
  authenticate,
  authorize(RoleCode.SUPER_ADMIN),
  validate(updatePersonaSchema),
  controller.updatePersona
);
router.delete(
  '/admin/persona',
  authenticate,
  authorize(RoleCode.SUPER_ADMIN),
  controller.resetPersona
);

// Pemakaian dan taksiran biaya. Sama seperti persona: bukan rahasia, tetapi
// siapa yang boleh melihat belanja yayasan tetap sebuah kewenangan.
router.get(
  '/admin/usage',
  authenticate,
  authorize(RoleCode.SUPER_ADMIN),
  controller.getUsage
);

// Riwayat tanya-jawab. Dikunci ke SUPER_ADMIN dengan alasan yang lebih keras
// daripada persona: yang tersimpan di sini adalah kalimat yang benar-benar
// diketik pengunjung, kadang berisi nama anak dan keadaan keluarganya. Satu
// peran, satu pembaca — dan barisnya menghapus diri setelah 90 hari.
router.get(
  '/admin/conversations',
  authenticate,
  authorize(RoleCode.SUPER_ADMIN),
  controller.listConversations
);
router.get(
  '/admin/conversations/:id',
  authenticate,
  authorize(RoleCode.SUPER_ADMIN),
  controller.getConversation
);

export default router;
