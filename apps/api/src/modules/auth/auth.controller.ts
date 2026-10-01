import { Request, Response } from 'express';
import { asyncHandler, Errors } from '@/middleware/error';
import { decodeToken } from '@/lib/jwt';
import type { PrincipalClaims } from '@cipansor/shared';
import { authService } from './auth.service';
import {
  LoginInput,
  RegisterInput,
  RefreshTokenInput,
  ChangePasswordInput,
  SendPasswordResetInput,
  ResetPasswordInput,
} from './auth.schema';
import {
  clearAuthCookies,
  csrfTokenForRefresh,
  mayReturnTokens,
  randomCsrfToken,
  refreshTokenFromCookie,
  setSessionCookies,
  setTempCookie,
} from './auth.cookies';
import { eventBus } from '@/lib/event-bus';
import { logger } from '@/lib/logger';

/**
 * The routing claims for the cookie the Next middleware reads, taken from a
 * token this process just minted (so decoding, not verifying, is correct here).
 */
function principalClaimsFromToken(accessToken: string): PrincipalClaims {
  const payload = decodeToken(accessToken);
  const roleCode = payload?.roleCode ?? '';
  return {
    id: payload?.sub ?? '',
    role: payload?.role ?? roleCode,
    roleCode,
  };
}

/**
 * Login
 * POST /api/auth/login
 *
 * The tokens are issued as HttpOnly cookies, not in the JSON body, so page
 * JavaScript can never read them. The response still carries the user (for
 * 2FA flow state) but deliberately omits `accessToken`/`refreshToken`. A
 * bearer-only client that needs the raw token in hand (the mobile app) logs in
 * with `X-Client: bearer` — see `docs/MOBILE_API.md`.
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const input: LoginInput = req.body;
  const bearer = mayReturnTokens(req);
  const result = await authService.login(input);

  if (!('accessToken' in result)) {
    const requiresTwoFactor = 'requiresTwoFactor' in result && result.requiresTwoFactor;
    setTempCookie(res, result.tempToken, requiresTwoFactor ? 5 * 60 * 1000 : 10 * 60 * 1000);
    return res.json({
      success: true,
      data: requiresTwoFactor
        ? { requiresTwoFactor: true, ...(bearer ? { tempToken: result.tempToken } : {}) }
        : { requiresTwoFactorSetup: true, ...(bearer ? { tempToken: result.tempToken } : {}) },
    });
  }

  const { user, accessToken, refreshToken } = result;
  setSessionCookies(
    res,
    accessToken,
    refreshToken,
    randomCsrfToken(),
    principalClaimsFromToken(accessToken)
  );

  res.json({
    success: true,
    data: bearer ? { user, accessToken, refreshToken } : { user },
  });
});

/**
 * Register new user (admin only)
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const input: RegisterInput = req.body;
  const creatorRoleCode = req.user!.roleCode;

  const user = await authService.register(input, creatorRoleCode);

  res.status(201).json({
    success: true,
    data: user,
  });
});

/**
 * Refresh tokens
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  // The refresh token rides an HttpOnly cookie on the browser path; a
  // bearer-only client may still POST it in the body.
  const bearer = mayReturnTokens(req);
  const fromBody = (req.body as RefreshTokenInput | undefined)?.refreshToken;
  const token = refreshTokenFromCookie(req) || fromBody;
  if (!token) {
    // Nothing to end, and nothing cleared: a sign-in in the same browser may
    // be setting the cookies while this answer is on its way.
    throw Errors.unauthorized('Token penyegaran sesi wajib diisi.');
  }

  // A refresh the server refuses ends the browser's session here, cookies and
  // all. The routing cookie would otherwise outlive it: the Next middleware
  // keeps sending `/login` back to the dashboard while it exists, the
  // dashboard's first call fails to refresh again, and the browser loops
  // between the two with no way to sign in until the cookie expires.
  let tokens: Awaited<ReturnType<typeof authService.refreshToken>>;
  try {
    tokens = await authService.refreshToken(token);
  } catch (error) {
    clearAuthCookies(res);
    throw error;
  }
  // The CSRF token is NOT rotated here: a request holding the previous value
  // must keep working across a background refresh (see csrfTokenForRefresh).
  setSessionCookies(
    res,
    tokens.accessToken,
    tokens.refreshToken,
    csrfTokenForRefresh(req),
    principalClaimsFromToken(tokens.accessToken)
  );

  res.json({
    success: true,
    data: bearer
      ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
      : { refreshed: true },
  });
});

/**
 * Logout
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  // `?? {}` is load-bearing. The web client calls POST /auth/logout with no
  // body, and Express 5 leaves req.body undefined for a bodyless request
  // instead of defaulting it to {} the way Express 4 did. Destructuring it
  // threw a TypeError, so every single logout answered 500 — and, far worse,
  // threw *before* authService.logout() ran, which meant no refresh token was
  // ever revoked. Sessions stayed resumable for the full 30-day refresh
  // lifetime after the user had logged out. The store swallows the error
  // client-side, so the only visible symptom was an "Internal server error"
  // toast on the login page.
  const { refreshToken } = req.body ?? {};

  // Prefer the cookie's refresh token so a browser logout revokes the session
  // that is actually signed in, even though the body carries none.
  const token = refreshTokenFromCookie(req) || refreshToken;

  // Undefined here is meaningful, not a fallback: authService.logout() revokes
  // every refresh token for the user when no specific token is named.
  await authService.logout(userId, token);

  clearAuthCookies(res);

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

/**
 * Get current user
 * GET /api/auth/me
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const user = await authService.getCurrentUser(userId);

  res.json({
    success: true,
    data: user,
  });
});

/**
 * Change password
 * PUT /api/auth/password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const input: ChangePasswordInput = req.body;

  const result = await authService.changePassword(userId, input);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * Generate 2FA Secret
 * POST /api/auth/2fa/generate
 */
export const generateTwoFactorSecret = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await authService.generateTwoFactorSecret(userId);
  res.json({ success: true, data: result });
});

/**
 * Enable 2FA
 * POST /api/auth/2fa/enable
 */
export const enableTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { token } = req.body; // Secret is no longer taken from body
  const result = await authService.enableTwoFactor(userId, token);
  res.json({ success: true, data: result });
});

/**
 * Verify 2FA Login
 * POST /api/auth/2fa/login
 */
export const verifyTwoFactorLogin = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const { token } = req.body;
  const isTemp = req.user?.isTemp;
  const bearer = mayReturnTokens(req);
  const result = await authService.verifyTwoFactorLogin(userId, token, isTemp);

  const { user, accessToken, refreshToken } = result;
  setSessionCookies(
    res,
    accessToken,
    refreshToken,
    randomCsrfToken(),
    principalClaimsFromToken(accessToken)
  );

  res.json({
    success: true,
    data: bearer ? { user, accessToken, refreshToken } : { user },
  });
});

/**
 * Disable 2FA
 * POST /api/auth/2fa/disable
 */
export const disableTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  const { token, userId: targetUserId } = req.body;
  const userId = req.user!.sub; // Current user

  let result;
  if (targetUserId && targetUserId !== userId) {
    // Admin disabling for another user
    result = await authService.disableTwoFactor(targetUserId, token, userId);
  } else {
    // User disabling their own
    result = await authService.disableTwoFactor(userId, token);
  }

  res.json({ success: true, data: result });
});

/**
 * Get 2FA Status
 * GET /api/auth/2fa/status
 */
export const getTwoFactorStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const result = await authService.getTwoFactorStatus(userId);
  // Per-user session state, never cacheable. Without `no-store` the browser
  // caches the JSON and revalidates with `If-None-Match`, so the next sign-in
  // gets a 304 instead of the body — and a shared machine could serve one
  // account's status to the next. `e2e/two-factor-invite.spec.ts` caught the
  // 304 (Playwright's `r.ok()` is 200–299).
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({ success: true, data: result });
});

/**
 * E-mail a password reset link to one user
 * POST /api/auth/send-password-reset  (admin only)
 *
 * The only way a reset starts. Someone who has forgotten their password
 * contacts an admin, who identifies them and triggers this; there is no public
 * form, so nothing unauthenticated can make this system send mail.
 */
export const sendPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const { userId }: SendPasswordResetInput = req.body;

  const reset = await authService.issuePasswordResetToken(userId);

  // Fire-and-forget: a mail outage must not roll back a token that has already
  // been recorded, and the admin gets told what to check instead.
  eventBus.emit('email:send_reset_token', {
    email: reset.email,
    token: reset.token,
    userId: reset.userId,
    name: reset.name,
    title: 'Reset Password',
    message: 'Silakan setel ulang password Anda melalui tautan berikut.',
    data: { expiresInHours: reset.expiresInHours },
  });

  logger.info('Password reset link requested by an admin', {
    targetUserId: reset.userId,
    requestedBy: req.user?.sub,
  });

  res.json({
    success: true,
    data: {
      message: `Tautan reset password telah dikirim ke ${reset.email}.`,
      expiresInHours: reset.expiresInHours,
    },
  });
});

/**
 * Redeem a password reset token
 * POST /api/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword }: ResetPasswordInput = req.body;

  const result = await authService.resetPassword(token, newPassword);

  res.json({ success: true, data: result });
});
