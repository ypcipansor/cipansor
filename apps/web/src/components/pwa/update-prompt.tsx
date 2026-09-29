"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SW_UPDATE_RELOAD_FLAG } from "./service-worker-register";

/**
 * "Versi baru tersedia" banner.
 *
 * The service worker deliberately does not call skipWaiting(), so a freshly
 * deployed build waits instead of swapping mid-session (see public/sw.js). This
 * is the other half: it notices the waiting worker — via the `sw-update-ready`
 * event or the `window.__swWaiting` stash, whichever wins the mount race — and
 * offers a reload. Confirming sends SKIP_WAITING and reloads once the new
 * worker takes control, so no tab is ever running old HTML against new chunks.
 */
export function UpdatePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Update prompts only make sense once a worker is already in control.
    if (!navigator.serviceWorker?.controller) return;

    const show = () => setVisible(true);
    if (window.__swWaiting) show();

    const onControllerChange = () => {
      // Only auto-reload for an update the user explicitly accepted.
      let accepted = false;
      try {
        accepted = sessionStorage.getItem(SW_UPDATE_RELOAD_FLAG) === "1";
      } catch {
        accepted = false;
      }
      if (accepted) {
        try {
          sessionStorage.removeItem(SW_UPDATE_RELOAD_FLAG);
        } catch {
          // Storage blocked; the reload below still proceeds once.
        }
        window.location.reload();
      }
    };

    window.addEventListener("sw-update-ready", show);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    return () => {
      window.removeEventListener("sw-update-ready", show);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  const reload = useCallback(() => {
    try {
      sessionStorage.setItem(SW_UPDATE_RELOAD_FLAG, "1");
    } catch {
      // Storage blocked. controllerchange would then not auto-reload; fall back
      // to a direct reload so the update still lands.
      window.location.reload();
      return;
    }
    window.__swWaiting?.postMessage({ type: "SKIP_WAITING" });
    // Safety net: if the message never reaches a worker (e.g. it finished
    // activating in the meantime), reload anyway so the user is not stuck.
    setTimeout(() => window.location.reload(), 1500);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Versi baru tersedia"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background p-4 shadow-lg sm:left-auto sm:right-4 sm:mx-0"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Versi baru tersedia</p>
        <p className="text-xs text-muted-foreground">
          Muat ulang untuk memakai versi terbaru.
        </p>
      </div>
      <Button size="sm" onClick={reload}>
        <RefreshCw className="mr-1 h-4 w-4" />
        Muat ulang
      </Button>
    </div>
  );
}
