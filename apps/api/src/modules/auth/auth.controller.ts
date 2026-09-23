import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error';
import { authService } from './auth.service';
import {
  LoginInput,
  RegisterInput,
  RefreshTokenInput,
  ChangePasswordInput,
  SendPasswordResetInput,
  ResetPasswordInput,
} from './auth.schema';
import { eventBus } from '@/lib/event-bus';
import { logger } from '@/lib/logger';
import { Errors } from '@/middleware/error';
import {
  clearedSessionCookies,
  readCookie,
  sessionCookies,
  setCookies,
  signedRoutingCookieValue,
  twoFactorCookie,
} from '@/utils/auth-cookies';
import { verifyToken } from '@/lib/jwt';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@cipansor/shared';

/**
 * Login
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const input: LoginInput = req.body;
  const result = await authService.login(input);

  // Issue the session as server-set `HttpOnly` cookies. On the 2FA-challenge
  // response only the temporary token is minted, and it is short-lived.
  if ('accessToken' in result && 'refreshToken' in result) {
    const tokens = result as { accessToken: string; refreshToken: string };
    setCookies(res, await sessionCookies(tokens));
    // The routing hint is included for the web's own scenarios (Playwright
    // storageState, which cannot originate a Set-Cookie). It is the same signed
    // value the cookie carries — a browser ignores the field and uses the cookie.
    res.json({
      success: true,
      data: { ...result, routing: await signedRoutingCookieValue(tokens) },
    });
    return;
  }

  if ('tempToken' in result && result.tempToken) {
    // Derive the cookie's Max-Age from the token's own TTL, not from the
    // function default. The two used to be independent: the mandatory-setup
    // flow minted a 10-minute token but the cookie defaulted to 5 minutes, so
    // the browser dropped the credential while the server would still have
    // accepted it. `tempTokenExpiresIn` is the one value the service used.
    const ttl =
      'tempTokenExpiresIn' in result && typeof result.tempTokenExpiresIn === 'string'
        ? result.tempTokenExpiresIn
        : '5m';
    setCookies(res, [twoFactorCookie(result.tempToken, ttl)]);
  }

  res.json({
    success: true,
    data: result,
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
  // Cookie-first: the browser presents no body. A body token is still accepted
  // for the native Bearer client, and Express 5 leaves `req.body` undefined for
  // a bodyless request, so the cast is safe.
  const body = (req.body ?? {}) as Partial<RefreshTokenInput>;
  const refresh = body.refreshToken || readCookie(req, REFRESH_TOKEN_COOKIE);

  if (!refresh) {
    throw Errors.unauthorized('No refresh token provided');
  }

  let tokens;
  try {
    tokens = await authService.refreshToken(refresh);
  } catch (error) {
    // A refresh that cannot succeed must also end the session *server-side*.
    //
    // The failed refresh answers 401 but used to leave every cookie in place,
    // including the `HttpOnly` `cipansor_routing` hint. The web client clears
    // them through `/auth/session/clear`, but that is a second round trip and
    // only one of the clients: a native client, or a browser that hit
    // `/auth/refresh` directly, kept the stale routing cookie — and the
    // middleware keeps treating its holder as authenticated, so `/login`
    // bounces straight back to a dashboard the expired session cannot load.
    // Clearing here makes the server the authority on a dead session: the 401
    // response itself carries the deletions.
    //
    // Only for a definitive rejection. A 5xx, a rate-limit or a dropped
    // connection says nothing about the token, and clearing on one would end a
    // working session over a transient failure — the same distinction the web
    // interceptor draws.
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 400 || status === 401 || status === 403) {
      setCookies(res, clearedSessionCookies());
    }
    throw error;
  }

  // Rotation is server-side: the replacement pair is written straight back as
  // new cookies, so the browser never handles the raw token.
  setCookies(res, await sessionCookies(tokens));

  res.json({
    success: true,
    data: tokens,
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

  // Undefined here is meaningful, not a fallback: authService.logout() revokes
  // every refresh token for the user when no specific token is named.
  await authService.logout(userId, refreshToken ?? readCookie(req, REFRESH_TOKEN_COOKIE));

  // Clear every session cookie, so a browser that never held the refresh token
  // in script-reaching storage still ends the session cleanly.
  setCookies(res, clearedSessionCookies());

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
  const result = await authService.verifyTwoFactorLogin(userId, token, isTemp);

  // The challenge is satisfied: replace the short-lived temp cookie with the
  // full session, so the browser needs no token handling at all.
  if ('accessToken' in result && 'refreshToken' in result) {
    const tokens = result as { accessToken: string; refreshToken: string };
    setCookies(res, await sessionCookies(tokens));
    // Same routing hint as `login`, for the web's Playwright storageState path.
    res.json({
      success: true,
      data: { ...result, routing: await signedRoutingCookieValue(tokens) },
    });
    return;
  }

  res.json({ success: true, data: result });
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

/**
 * Terminate a session from the browser, unconditionally.
 *
 * POST /api/auth/session/clear — deliberately NOT behind `authenticate`.
 *
 * The problem this solves: a session can be *already dead* while the browser
 * still holds a `cipansor_routing` cookie. `authenticate` refuses the access
 * token (expired, suspended, revoked), the web interceptor tries a refresh, and
 * if the refresh is refused too the client must end the session. But clearing
 * the `HttpOnly` cookies is a server-only act — `document.cookie` cannot touch
 * them. Without an unauthenticated path to do it, the stale routing cookie
 * survives, `apps/web/middleware.ts` keeps treating the visitor as
 * authenticated, and it redirects `/login` back to the role dashboard: a login
 * loop the user cannot escape.
 *
 * So this door is open on purpose. It performs no privileged action — it only
 * clears cookies, and clearing cookies you already hold is never an escalation.
 * The refresh token, if presented, is revoked best-effort so a stolen one does
 * not outlive the logout; a missing or invalid token is not an error, because
 * the whole point is that the credential may already be invalid.
 */
export const clearSession = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = readCookie(req, REFRESH_TOKEN_COOKIE);
  if (refreshToken) {
    try {
      const payload = verifyToken(refreshToken);
      if (payload.type === 'refresh' && payload.sub) {
        await authService.logout(payload.sub, refreshToken);
      }
    } catch {
      // The token is invalid/expired — nothing to revoke. The cookies are
      // cleared below regardless, which is the only outcome that matters here.
    }
  }

  setCookies(res, clearedSessionCookies());

  res.json({
    success: true,
    data: { message: 'Session cleared' },
  });
});
