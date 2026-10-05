import { z } from "zod";

// `URL` is a global in Node and in every browser, but its type ships only with
// the DOM lib, which this package deliberately does not load: with it, code
// that the API runs could reach `window` or `document` and still type-check.
// Declared here for the slice this file uses.
declare const URL: new (input: string) => {
  protocol: string;
  hostname: string;
  port: string;
  username: string;
  password: string;
};

/**
 * Web Push contract — one home for the shape both sides speak.
 *
 * The browser builds a payload from `PushSubscription.toJSON()`; the API
 * validates the same shape at the edge and stores it. Until 2026-09-29 the API
 * declared its own `pushSubscribeSchema` and the web carried a hand-written
 * `WebPushSubscriptionPayload` interface, so the two could drift with nothing
 * to catch it. This schema is the single source; the interface is inferred from
 * it (see `types/notifications.ts`).
 */

/**
 * The push services browsers actually use, and nothing else.
 *
 * The endpoint is chosen by the client and the API POSTs to it from inside our
 * network, so an unchecked value is a server-side request forgery primitive
 * (CWE-918): `https://169.254.169.254/…` would aim the sender at the cloud
 * metadata service. An earlier version tried to recognise *bad* hosts (private
 * IP ranges); a name that resolves to one, or a redirect, walked straight past
 * it. Naming the *good* hosts closes the class instead (OWASP SSRF Prevention
 * Cheat Sheet: allowlist). Every browser hands out an endpoint on one of these:
 *
 *  - FCM — Chrome, Edge on Android, Samsung Internet, Opera, Brave
 *    (`android.googleapis.com` is the legacy GCM name some still return);
 *  - Mozilla autopush — Firefox;
 *  - Apple — Safari on macOS 13+, and iOS/iPadOS 16.4+ home-screen apps;
 *  - WNS — Edge on Windows.
 *
 * A browser on some other push service is refused with a message saying so,
 * which is the honest outcome: the alternative is a sender that will POST
 * wherever it is told.
 */
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "android.googleapis.com"];
const PUSH_SERVICE_SUFFIXES = [
  ".push.services.mozilla.com",
  ".push.apple.com",
  ".notify.windows.com",
];

export function isSafePushEndpoint(value: string): boolean {
  let url: InstanceType<typeof URL>;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // Default port only, and no credentials: `https://fcm.googleapis.com:8443/`
  // or `https://x@host/` are not what a browser produces.
  if (url.port !== "" && url.port !== "443") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return (
    PUSH_SERVICE_HOSTS.includes(host) ||
    PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

export const pushEndpointSchema = z
  .string()
  .url()
  .max(2048)
  .refine(isSafePushEndpoint, {
    message:
      "Endpoint notifikasi push harus berasal dari layanan push peramban (Google, Mozilla, Apple, atau Microsoft)",
  });

/** A browser PushSubscription as sent to the API (`subscription.toJSON()`). */
export const webPushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export type WebPushSubscription = z.infer<typeof webPushSubscriptionSchema>;

/** `GET /notifications/push/config` — null when this server cannot send push. */
export interface WebPushConfigDTO {
  publicKey: string | null;
}

// ==================== PREFERENCES ====================

/** The kinds of notification a person can switch off, one toggle each. */
export const NOTIFICATION_KIND_KEYS = [
  "paymentReminders",
  "attendanceAlerts",
  "academicUpdates",
  "tahfidzProgress",
  "announcements",
  "eventReminders",
  "monthlyReports",
] as const;
export type NotificationKindKey = (typeof NOTIFICATION_KIND_KEYS)[number];

export const REMINDER_FREQUENCIES = ["DAILY", "WEEKLY", "NONE"] as const;
export type ReminderFrequencyCode = (typeof REMINDER_FREQUENCIES)[number];

/** Wall-clock time, WIB, "HH:MM". */
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam harus berformat JJ:MM");

const preferenceFields = {
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  paymentReminders: z.boolean(),
  attendanceAlerts: z.boolean(),
  academicUpdates: z.boolean(),
  tahfidzProgress: z.boolean(),
  announcements: z.boolean(),
  eventReminders: z.boolean(),
  monthlyReports: z.boolean(),
  quietHoursStart: clockTime.nullable(),
  quietHoursEnd: clockTime.nullable(),
  reminderFrequency: z.enum(REMINDER_FREQUENCIES),
};

/**
 * A complete set of preferences, as stored.
 *
 * Quiet hours are both set or both empty, and never zero-length — the same
 * rule the table's CHECK constraint holds.
 */
export const notificationPreferencesSchema = z
  .object(preferenceFields)
  .refine((p) => (p.quietHoursStart === null) === (p.quietHoursEnd === null), {
    message: "Isi jam mulai dan jam selesai, atau kosongkan keduanya",
    path: ["quietHoursEnd"],
  })
  .refine(
    (p) => p.quietHoursStart === null || p.quietHoursStart !== p.quietHoursEnd,
    {
      message: "Jam mulai dan jam selesai tidak boleh sama",
      path: ["quietHoursEnd"],
    },
  );

/** `PATCH /notifications/preferences` — any subset; checked again once merged. */
export const updateNotificationPreferencesSchema = z
  .object(preferenceFields)
  .partial()
  .strict();

export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>;
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

export interface NotificationPreferencesDTO extends NotificationPreferencesInput {
  userId: string;
}

/** What a person gets before they ever open the settings page. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesInput = {
  emailEnabled: true,
  smsEnabled: false,
  whatsappEnabled: true,
  pushEnabled: true,
  paymentReminders: true,
  attendanceAlerts: true,
  academicUpdates: true,
  tahfidzProgress: true,
  announcements: true,
  eventReminders: true,
  monthlyReports: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  reminderFrequency: "DAILY",
};
