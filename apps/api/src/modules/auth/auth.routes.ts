import { Router } from 'express';
import { authenticate, authenticate2FA, isAdmin } from '@/middleware/auth';
import { requireTurnstile } from '@/middleware/turnstile';
import { validate } from '@/middleware/error';
import * as controller from './auth.controller';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  changePasswordSchema,
  sendPasswordResetSchema,
  resetPasswordSchema,
} from './auth.schema';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for 2FA actions. The cap is env-configurable (defaults to a
// strict 10/15min) so e2e/dev runs can raise it without weakening production.
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.TWO_FACTOR_RATE_LIMIT_MAX) || 10,
  message: 'Too many 2FA attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with email and password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// requireTurnstile mendahului validate() dengan sengaja — lihat catatan urutan
// di middleware/turnstile.ts. Halaman masuk adalah satu-satunya pintu ke
// seluruh portal, dan `authLimiter` di app.ts membatasi per-IP: sebuah botnet
// yang tersebar di ribuan IP tidak pernah menyentuh batas itu.
router.post('/login', requireTurnstile('login'), validate(loginSchema), controller.login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Get new access token using refresh token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh token from login
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', validate(refreshTokenSchema), controller.refreshToken);

/**
 * Redeeming a reset link is unauthenticated by necessity — someone who cannot
 * sign in is exactly who arrives holding one.
 *
 * Rate limited hard and separately from login: this accepts a token, so without
 * a cap it is an offline guessing oracle with an online interface.
 *
 * NOTE WHAT IS NOT HERE. There is no public `/forgot-password`. Sending a reset
 * link is an admin action (`/send-password-reset`, below the authenticate wall),
 * so nothing unauthenticated can make this system send mail, and there is no
 * open form to probe for which addresses have accounts.
 */
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX) || 5,
  message: 'Terlalu banyak permintaan reset password. Silakan coba lagi nanti.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Set a new password using a reset token
 *     description: >
 *       Redeems a single-use token e-mailed to the account holder. The token is
 *       stored only as a SHA-256 hash and is cleared on use.
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Token invalid or expired
 */
router.post(
  '/reset-password',
  passwordResetLimiter,
  // Menukarkan tautan reset berarti menetapkan kata sandi. Tautannya memang
  // sudah membawa token dari kotak masuk pemiliknya, tetapi endpoint ini
  // terbuka bagi siapa pun dan formnya diisi manusia — jadi ongkos gerbangnya
  // nol dan ia menutup penyapuan token.
  requireTurnstile('reset-password'),
  validate(resetPasswordSchema),
  controller.resetPassword,
);

// ==========================================
// 2FA Routes (Accepts Temp Tokens for Setup/Login)
// ==========================================

/**
 * @swagger
 * /api/auth/2fa/generate:
 *   post:
 *     summary: Generate 2FA Secret
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA secret generated
 */
router.post('/2fa/generate', authenticate2FA, controller.generateTwoFactorSecret);

/**
 * @swagger
 * /api/auth/2fa/enable:
 *   post:
 *     summary: Enable 2FA
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, secret]
 *             properties:
 *               token:
 *                 type: string
 *               secret:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 */
router.post('/2fa/enable', authenticate2FA, twoFactorLimiter, controller.enableTwoFactor);

/**
 * @swagger
 * /api/auth/2fa/login:
 *   post:
 *     summary: Verify 2FA Login
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA verified, returns tokens
 */
router.post('/2fa/login', authenticate2FA, twoFactorLimiter, controller.verifyTwoFactorLogin);

// Protected routes (Requires Full Access Token)
router.use(authenticate);

/**
 * @swagger
 * /api/auth/send-password-reset:
 *   post:
 *     summary: E-mail a password reset link to a user (admin only)
 *     description: >
 *       The only way a reset starts. A user who has forgotten their password
 *       contacts an admin, who identifies them and triggers this.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Link sent
 *       404:
 *         description: No such user
 */
router.post(
  '/send-password-reset',
  isAdmin,
  validate(sendPasswordResetSchema),
  controller.sendPasswordReset,
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Get authenticated user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', controller.getCurrentUser);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout
 *     description: Invalidate current user's tokens
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/logout', controller.logout);

/**
 * @swagger
 * /api/auth/password:
 *   put:
 *     summary: Change password
 *     description: Change current user's password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         description: Current password incorrect
 */
router.put('/password', validate(changePasswordSchema), controller.changePassword);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user (Admin only)
 *     description: Create new user account - requires admin privileges
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               roleCode:
 *                 type: string
 *                 description: A valid RoleCode from the roles table (e.g. SUPER_ADMIN, SDIT_GURU). Either roleCode or role is required.
 *               role:
 *                 type: string
 *                 description: "DEPRECATED: Legacy role field (e.g. TEACHER, STAFF). Use roleCode instead. Accepted for backward compatibility."
 *               unitId:
 *                 type: string
 *                 format: uuid
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/register', isAdmin, validate(registerSchema), controller.register);

// ==========================================
// 2FA Routes (Management - Full Access)
// ==========================================

/**
 * @swagger
 * /api/auth/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *               userId:
 *                 type: string
 *                 description: Optional user ID if admin is disabling for another user
 *     responses:
 *       200:
 *         description: 2FA disabled successfully
 */
router.post('/2fa/disable', twoFactorLimiter, controller.disableTwoFactor);

/**
 * @swagger
 * /api/auth/2fa/status:
 *   get:
 *     summary: Get 2FA Status
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status
 */
router.get('/2fa/status', controller.getTwoFactorStatus);

export default router;
