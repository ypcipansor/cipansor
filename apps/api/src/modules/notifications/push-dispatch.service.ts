import type { NotificationType } from '@prisma/client';
import { isSafePushEndpoint, type NotificationKindKey } from '@cipansor/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { config } from '../../config';
import { allowsKind, getPreferencesFor, isInQuietHours } from './preferences.service';
import { sendPush, vapidKeysMatch, type VapidKeys } from './web-push';

/**
 * Web Push delivery: the notification table is the outbox.
 *
 * Twenty-odd modules and jobs create notifications — through
 * `createNotification`, `createMany`, or `prisma.notification.create` directly.
 * Teaching each of them about push would leave the next one out. Instead every
 * new row starts `push_state = PENDING` (a column default), and this dispatcher,
 * run every few seconds by the scheduler, claims what is due and sends it to
 * the owner's registered devices. A producer does nothing new.
 *
 * What it honours, in order (decided 2026-10-03, decisions/notifikasi-push.md):
 *
 *  1. Only rows for someone with a registered device, still unread, and fresh
 *     (`STALE_AFTER`); the rest are SKIPPED in bulk without a round trip each.
 *  2. The person's stored preferences: the push channel, the kind of
 *     notification, and quiet hours (WIB). A push held back by quiet hours is
 *     not sent later — the bell still has it.
 *  3. Lock-screen privacy: a notification about health, counselling,
 *     discipline, a complaint, or an audit/risk finding is pushed as generic text;
 *     its content is read in the portal after unlocking (OWASP MASTG-BEST-0027).
 *  4. A subscription the push service reports gone (404/410) is deleted.
 */

// Two windows live in the SQL below as literals, not interpolated values, so
// this module does nothing with `Prisma` at load time:
//  - a notification older than 2 hours when first seen is no longer news;
//  - a claim abandoned by a crash for 3 hours is written off, not sent twice.
/** How long a push service may hold a message for a device that is offline. */
const TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_BATCH = 100;

export const GENERIC_PUSH = {
  title: 'Cipansor',
  body: 'Ada pemberitahuan baru. Buka portal untuk membacanya.',
} as const;

/** `data.originalType` values whose content stays off the lock screen. */
const SENSITIVE_ORIGINAL_TYPES = new Set(['HEALTH', 'VIOLATION', 'COUNSELING']);

/** Pages whose notifications stay off the lock screen, whatever their type. */
const SENSITIVE_LINK_PREFIXES = [
  '/counseling',
  '/parent/counseling',
  '/health',
  '/parent/health',
  '/violations',
  '/parent/violations',
  '/quality/complaints',
  '/pengawasan',
  '/risk-management',
];

export interface OutboxNotification {
  id: string;
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  link: string | null;
  data: unknown;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushDispatchSummary {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  pruned: number;
}

function dataField(data: unknown, key: string): unknown {
  return data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
}

/**
 * Which preference toggle governs this notification, or null when none does.
 *
 * A permit decision, a request waiting for the reader's approval, a health or
 * discipline notice: no toggle on the settings page names them, so only the
 * push channel itself can turn them off.
 */
export function notificationKindFor(type: string, data: unknown): NotificationKindKey | null {
  switch (dataField(data, 'originalType')) {
    case 'ATTENDANCE':
      return 'attendanceAlerts';
    case 'TAHFIDZ':
      return 'tahfidzProgress';
    case 'FINANCE':
      return 'paymentReminders';
    case 'PERMIT':
    case 'HEALTH':
    case 'VIOLATION':
    case 'COUNSELING':
      return null;
  }
  switch (type) {
    case 'PAYMENT':
      return 'paymentReminders';
    case 'ANNOUNCEMENT':
      return 'announcements';
    case 'ACADEMIC':
      return 'academicUpdates';
    case 'REMINDER':
      return 'eventReminders';
    default:
      return null;
  }
}

/** Whether this notification's content must stay off the lock screen. */
export function isSensitiveNotification(n: Pick<OutboxNotification, 'link' | 'data'>): boolean {
  if (dataField(n.data, 'sensitive') === true) return true;
  const originalType = dataField(n.data, 'originalType');
  if (typeof originalType === 'string' && SENSITIVE_ORIGINAL_TYPES.has(originalType)) return true;
  const link = n.link ?? '';
  return SENSITIVE_LINK_PREFIXES.some(
    (prefix) => link === prefix || link.startsWith(`${prefix}/`) || link.startsWith(`${prefix}?`)
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** A same-origin path, or the notification list. The worker re-checks it. */
function safePath(link: string | null): string {
  if (link && link.startsWith('/') && !link.startsWith('//')) return link;
  return '/notifications';
}

/** What the device shows. Sensitive kinds get the generic text. */
export function pushPayloadFor(n: OutboxNotification): PushPayload {
  const url = safePath(n.link);
  if (isSensitiveNotification(n)) return { ...GENERIC_PUSH, url, tag: n.id };
  return { title: truncate(n.title, 120), body: truncate(n.message, 240), url, tag: n.id };
}

let warnedMismatch = false;

/**
 * The configured key pair, or null when this server does not send push.
 *
 * A pair whose halves do not belong together is reported once and treated as
 * absent: every send would be refused, and the browser would be asked to
 * subscribe to a key nobody can sign for.
 */
export function webPushKeys(): VapidKeys | null {
  const { publicKey, privateKey, subject } = config.webPush;
  if (!publicKey || !privateKey) return null;
  if (!vapidKeysMatch({ publicKey, privateKey })) {
    if (!warnedMismatch) {
      logger.error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not one key pair; Web Push is off');
      warnedMismatch = true;
    }
    return null;
  }
  return { publicKey, privateKey, subject };
}

/** Test seam: forget the one-time mismatch warning. */
export function resetWebPushWarnings(): void {
  warnedMismatch = false;
}

type State = 'SENT' | 'SKIPPED' | 'FAILED';

/**
 * Claim due notifications and push them. One run; the scheduler repeats it.
 *
 * Safe to run on several instances at once: the claim is `FOR UPDATE SKIP
 * LOCKED`, so two runs never take the same row.
 */
export async function dispatchPendingPush(
  options: { now?: Date; batchSize?: number; fetchImpl?: typeof fetch } = {}
): Promise<PushDispatchSummary> {
  const summary: PushDispatchSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, pruned: 0 };
  const keys = webPushKeys();
  if (!keys) return summary;
  const now = options.now ?? new Date();

  // Timestamps are compared inside the database (`now()` in UTC, the zone
  // Prisma writes), so a session time zone can never shift the window.
  summary.skipped += await prisma.$executeRaw`
    UPDATE notifications n SET push_state = 'SKIPPED'
    WHERE n.push_state = 'PENDING'
      AND (n.scheduled_at IS NULL OR n.scheduled_at <= (now() AT TIME ZONE 'UTC'))
      AND (
        n.status <> 'UNREAD'
        OR COALESCE(n.scheduled_at, n.created_at) < (now() AT TIME ZONE 'UTC') - interval '2 hours'
        OR NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = n.user_id)
      )`;

  await prisma.$executeRaw`
    UPDATE notifications SET push_state = 'FAILED'
    WHERE push_state = 'SENDING'
      AND created_at < (now() AT TIME ZONE 'UTC') - interval '3 hours'`;

  const claimed = await prisma.$queryRaw<OutboxNotification[]>`
    UPDATE notifications SET push_state = 'SENDING'
    WHERE id IN (
      SELECT id FROM notifications
      WHERE push_state = 'PENDING'
        AND (scheduled_at IS NULL OR scheduled_at <= (now() AT TIME ZONE 'UTC'))
      ORDER BY created_at
      LIMIT ${options.batchSize ?? DEFAULT_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id AS "userId", type::text AS type, title, message, link, data`;
  summary.claimed = claimed.length;
  if (claimed.length === 0) return summary;

  const userIds = [...new Set(claimed.map((n) => n.userId))];
  const [preferences, subscriptions] = await Promise.all([
    getPreferencesFor(userIds),
    prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    }),
  ]);
  const devices = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    devices.set(sub.userId, [...(devices.get(sub.userId) ?? []), sub]);
  }

  const outcome: Record<State, string[]> = { SENT: [], SKIPPED: [], FAILED: [] };
  const gone = new Set<string>();

  for (const n of claimed) {
    const prefs = preferences.get(n.userId);
    const targets = (devices.get(n.userId) ?? []).filter((d) => !gone.has(d.id));
    if (
      !prefs ||
      targets.length === 0 ||
      !allowsKind(prefs, notificationKindFor(n.type, n.data), 'push') ||
      isInQuietHours(prefs, now)
    ) {
      outcome.SKIPPED.push(n.id);
      continue;
    }

    const payload = Buffer.from(JSON.stringify(pushPayloadFor(n)));
    const results = await Promise.all(
      targets.map(async (device) => {
        // Rows stored before the push-service allowlist existed are checked
        // again here: a host the sender may not call is never called.
        if (!isSafePushEndpoint(device.endpoint)) {
          gone.add(device.id);
          return false;
        }
        const result = await sendPush(device, payload, keys, {
          ttlSeconds: TTL_SECONDS,
          urgency: n.type === 'ALERT' ? 'high' : 'normal',
          now,
          fetchImpl: options.fetchImpl,
        });
        if (result.kind === 'gone') gone.add(device.id);
        if (result.kind === 'failed') {
          logger.warn('Web Push delivery failed', {
            notificationId: n.id,
            status: result.status,
            reason: result.reason,
          });
        }
        return result.kind === 'delivered';
      })
    );
    outcome[results.some(Boolean) ? 'SENT' : 'FAILED'].push(n.id);
  }

  for (const pushState of ['SENT', 'SKIPPED', 'FAILED'] as const) {
    const ids = outcome[pushState];
    if (ids.length === 0) continue;
    await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { pushState } });
  }
  if (gone.size > 0) {
    const { count } = await prisma.pushSubscription.deleteMany({
      where: { id: { in: [...gone] } },
    });
    summary.pruned = count;
  }

  summary.sent = outcome.SENT.length;
  summary.skipped += outcome.SKIPPED.length;
  summary.failed = outcome.FAILED.length;
  return summary;
}
