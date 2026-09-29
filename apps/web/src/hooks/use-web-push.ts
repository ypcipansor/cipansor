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
 * Read and control this browser's push subscription.
 *
 * `state` is derived on mount from the live subscription, so the toggle shows
 * the truth for *this* device even though `pushEnabled` in preferences is
 * per-user.
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
      .then((sub) => {
        if (!cancelled) setState(sub ? "subscribed" : "unsubscribed");
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
      // Wait for the worker so pushManager exists; the PWA registers it on load.
      const registration = await navigator.serviceWorker.ready;
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
        await subscription.unsubscribe();
        await notificationsService.unsubscribePush(endpoint);
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
