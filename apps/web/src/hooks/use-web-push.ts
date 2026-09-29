"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { WebPushSubscriptionPayload } from "@cipansor/shared";
import { notificationsService } from "@/services/notifications.service";

/**
 * Browser Web Push, wired end-to-end.
 *
 * Before this, the settings page had a "Push" toggle that saved a preference
 * and nothing else: no `pushManager.subscribe`, no key, no API call — the
 * service worker's `push` handler could never fire because no subscription
 * existed. This is the missing half.
 *
 * The server sender still needs VAPID credentials (they are not in the repo),
 * so the public key arrives as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. With it unset,
 * `supported` is false and the toggle explains that push is not configured
 * rather than failing silently.
 *
 * iOS only delivers Web Push to an *installed* PWA (Add to Home Screen), and
 * only in Safari — the same install path the InstallPrompt guides the user to.
 */
export type WebPushState =
  "unsupported" | "unconfigured" | "denied" | "subscribed" | "unsubscribed";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** The push API returns base64url; subscribe() wants the raw bytes. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back it with a plain ArrayBuffer: `PushManager.subscribe` wants a
  // BufferSource, and a bare `new Uint8Array(n)` is only `ArrayBufferLike`.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/**
 * The worker that will answer `pushManager`, or null if none is coming.
 *
 * `navigator.serviceWorker.ready` never settles when no worker will ever
 * register — `ServiceWorkerRegister` deliberately skips registration under
 * `pnpm dev` and browser automation — so awaiting it directly left the
 * "Aktifkan" button spinning forever. Poll `getRegistration()` for a bounded
 * time instead: return the moment a worker exists, or null once the budget is
 * spent. The worker registers on `load`, so a short poll also covers the race
 * where the button is clicked before registration has finished.
 */
const READY_TIMEOUT_MS = 10_000;
const READY_POLL_MS = 200;

async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) return registration;
  }
  return null;
}

/**
 * Read and control this browser's push subscription.
 *
 * `state` is derived on mount from the live subscription *and* the server row,
 * so the toggle shows the truth for *this* device even though `pushEnabled` in
 * preferences is per-user.
 */
export function useWebPush() {
  const [state, setState] = useState<WebPushState>("unsubscribed");
  const [busy, setBusy] = useState(false);

  // `Notification` does not exist during SSR; resolve support on the client.
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!supported) {
      setState("unsupported");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setState("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    let cancelled = false;
    currentSubscription()
      .then(async (sub) => {
        if (cancelled) return;
        if (!sub) {
          setState("unsubscribed");
          return;
        }
        // A browser subscription can exist while the API has no row for it — a
        // registration that failed after `subscribe()` succeeded, or a row the
        // server dropped on logout. Claiming "Aktif" then leaves the device
        // silently unable to receive anything, so confirm the server really has
        // this endpoint and repair it if not.
        const registered = await notificationsService.pushStatus(sub.endpoint);
        if (cancelled) return;
        if (!registered) {
          try {
            await notificationsService.subscribePush(
              sub.toJSON() as WebPushSubscriptionPayload,
            );
          } catch {
            if (!cancelled) setState("unsubscribed");
            return;
          }
          if (!cancelled) setState("subscribed");
          return;
        }
        if (!cancelled) setState("subscribed");
      })
      .catch(() => {
        if (!cancelled) setState("unsubscribed");
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) {
      toast.error("Notifikasi push belum tersedia di perangkat ini.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "unsubscribed");
        toast.error(
          "Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.",
        );
        return;
      }
      // Bounded wait: if no worker registers (dev/automation), say so rather
      // than spin forever on `serviceWorker.ready`.
      const registration = await activeRegistration();
      if (!registration) {
        toast.error("Notifikasi push belum siap di perangkat ini.");
        return;
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      await notificationsService.subscribePush(
        subscription.toJSON() as WebPushSubscriptionPayload,
      );
      setState("subscribed");
      toast.success("Notifikasi push aktif di perangkat ini.");
    } catch {
      // Deliberately leaves the browser subscription in place: the reconcile on
      // the next mount retries the registration instead of stranding it.
      toast.error("Gagal mengaktifkan notifikasi push.");
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        // Delete the server row *first*, while we still hold the endpoint. Doing
        // it the other way round loses the endpoint the moment `unsubscribe()`
        // succeeds, so a failed API call could never be retried and the row
        // would linger, still pushing to this device (CWE-200).
        await notificationsService.unsubscribePush(endpoint);
        const unsubscribed = await subscription.unsubscribe();
        // `unsubscribe()` resolves false if the browser still holds the
        // subscription; don't report success we did not achieve.
        if (!unsubscribed) {
          throw new Error("Browser refused to unsubscribe");
        }
      }
      setState("unsubscribed");
      toast.success("Notifikasi push dimatikan.");
    } catch {
      toast.error("Gagal mematikan notifikasi push.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, supported, busy, enable, disable };
}
