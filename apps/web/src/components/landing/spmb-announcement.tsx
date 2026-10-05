"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { spmbAnnouncementOf } from "@cipansor/shared";
import { usePublicIntakes } from "@/hooks/use-admissions";
import { announcementContentFor } from "@/config/announcement.i18n";
import { dateFormatterFor } from "@/lib/locale-format";
import type { Locale } from "@/locales";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Where "this visitor has seen it" is remembered, per surface and per period. */
const BANNER_KEY = "spmb-announcement-banner";
const DIALOG_KEY = "spmb-announcement-dialog";

/**
 * How long the page is readable before the dialog appears. Not zero: a dialog
 * at the instant of arrival is the intrusive interstitial Google demotes and
 * Baymard's testers reflexively close without reading. A few seconds in, the
 * visitor has the content and the announcement reads as a notice, not a gate.
 */
const DIALOG_DELAY_MS = 5000;

/**
 * Set by the announcement's own e2e spec so it can see the notice under
 * automation; absent everywhere else.
 */
const FORCE_KEY = "spmb-announcement-force";

/**
 * Whether the notice should stay hidden because the page is under browser
 * automation.
 *
 * The e2e suite that is not about this notice would otherwise race it: a dialog
 * that opens five seconds in, and a sticky bar that can sit over a link
 * Playwright scrolls to. The component still mounts and derives its message in
 * every run — only the visible surface is withheld — so a fault in the logic
 * still fails those specs. The announcement's own spec sets `FORCE_KEY` to
 * bring it back. This mirrors `ServiceWorkerRegister`, which skips registration
 * under `navigator.webdriver` for a related reason.
 */
function hiddenUnderAutomation(): boolean {
  if (typeof navigator === "undefined" || !navigator.webdriver) return false;
  try {
    return localStorage.getItem(FORCE_KEY) !== "1";
  } catch {
    return true;
  }
}

function isDismissed(key: string, periodId: string): boolean {
  try {
    // A dismissal stores the period's id, so the announcement returns for next
    // year's intake and not before.
    return localStorage.getItem(key) === periodId;
  } catch {
    // Private mode or blocked storage: better to stay quiet than to nag.
    return true;
  }
}

function rememberDismissed(key: string, periodId: string) {
  try {
    localStorage.setItem(key, periodId);
  } catch {
    // Storage unavailable. The notice still closes for this page-session;
    // dropping the click entirely would be worse than forgetting it later.
  }
}

/**
 * The SPMB announcement on the public site: a banner, and — once per intake —
 * a dialog that appears a few seconds in.
 *
 * What it says is derived from the units' intakes (`findPublicIntakes`), the
 * same source the SPMB page, the hero badge and the chatbot read, so the four
 * cannot disagree. It is never typed by hand, so it cannot outlive the intake
 * it announces the way the old hardcoded "SPMB 2026 Telah Dibuka" badge did.
 *
 * The shape follows the standards, deliberately:
 * - Google Search Central says to "use banners instead of interstitials" and
 *   counts only overlays that obstruct content as intrusive. The banner is the
 *   primary surface; the dialog is small, appears after a delay, gives two ways
 *   out, and never blocks the pages it would interrupt most (`/public/spmb`,
 *   the verification pages — those do not mount this at all).
 * - The dialog is a Radix `Dialog`: `role="dialog"`, `aria-modal`, a labelled
 *   title and description, focus moved in and trapped, Escape and a visible
 *   close to leave, focus restored on close — WAI-ARIA APG and WCAG 2.1.2.
 * - Both are trilingual (`config/announcement.i18n.ts`).
 *
 * `enabled` is the host gate, decided by the server that mounts it: the public
 * site (and staging, and `pnpm dev`) show it, the staff portal does not.
 */
export function SpmbAnnouncement({
  locale,
  enabled = true,
  withDialog = true,
}: {
  locale: Locale;
  enabled?: boolean;
  withDialog?: boolean;
}) {
  const { data: intakes = [] } = usePublicIntakes({
    // The announcement's whole job is to appear the moment an intake opens (or
    // to go away when it closes). The global defaults — 1-minute stale time and
    // no refetch on focus — let a tab open since morning still show yesterday's
    // status, so tighten freshness for this surface only: a quarter-hour poll
    // plus a refetch whenever the visitor returns to the tab. The global
    // defaults are untouched for every other `usePublicIntakes` caller.
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const copy = announcementContentFor(locale);
  // Memoised so the derivation returns the same object across renders and the
  // effects below depend on a stable value, not on a fresh one each time.
  const announcement = useMemo(() => spmbAnnouncementOf(intakes), [intakes]);
  const periodId = announcement?.period.id ?? "";

  const [bannerOpen, setBannerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Starts hidden and is released in an effect, so the server render and the
  // first client paint agree; `hiddenUnderAutomation` reads `navigator`, which
  // only exists on the client.
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(hiddenUnderAutomation());
  }, []);

  useEffect(() => {
    if (hidden || !enabled || !announcement) {
      setBannerOpen(false);
      return;
    }
    setBannerOpen(!isDismissed(BANNER_KEY, periodId));
  }, [hidden, enabled, announcement, periodId]);

  useEffect(() => {
    if (hidden || !enabled || !withDialog || !announcement) {
      setDialogOpen(false);
      return;
    }
    if (isDismissed(DIALOG_KEY, periodId)) return;
    const timer = window.setTimeout(() => setDialogOpen(true), DIALOG_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hidden, enabled, withDialog, announcement, periodId]);

  if (!enabled || !announcement) return null;

  const date = announcement.period.opensAt
    ? dateFormatterFor(locale).format(new Date(announcement.period.opensAt))
    : "";
  const year = announcement.period.academicYear ?? "";
  const open = announcement.window === "open";
  const bannerText = open
    ? copy.bannerOpen(year)
    : copy.bannerOpens(year, date);
  const bannerCta = open ? copy.bannerCtaOpen : copy.bannerCtaOpens;
  const dialogTitle = open
    ? copy.dialogTitleOpen(year)
    : copy.dialogTitleOpens(year, date);
  const dialogBody = open
    ? copy.dialogBodyOpen(announcement.unit.name)
    : copy.dialogBodyOpens(announcement.unit.name, date);
  const dialogCta = open ? copy.dialogCtaOpen : copy.dialogCtaOpens;
  const headingId = "spmb-announcement-text";

  const closeBanner = () => {
    rememberDismissed(BANNER_KEY, periodId);
    setBannerOpen(false);
  };
  const closeDialog = () => {
    rememberDismissed(DIALOG_KEY, periodId);
    setDialogOpen(false);
  };

  return (
    <>
      {bannerOpen && (
        <div
          role="region"
          aria-labelledby={headingId}
          data-testid="spmb-announcement-banner"
          // `sticky top-16` (64px = the navbar's height) parks the bar directly
          // under the fixed header on every public page. The bar is the first
          // child of `<main>`, so its flow box already starts below the navbar
          // (`PublicPage`/`/wakaf-infaq` put `pt-16` on `<main>`; the homepage's
          // hero carries its own `pt-24`), and sticky pins it there on scroll.
          className="sticky top-16 z-40 border-b border-primary/20 bg-primary/10"
        >
          <div className="container mx-auto flex items-start gap-3 px-4 py-3 sm:items-center sm:px-6 lg:px-8">
            <Megaphone
              className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-0"
              aria-hidden="true"
            />
            <p
              id={headingId}
              className="min-w-0 flex-1 text-sm font-medium text-foreground"
            >
              {bannerText}
            </p>
            <Link
              href="/public/spmb"
              className="shrink-0 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {bannerCta}
            </Link>
            {/* 36 px hit area around a 16 px glyph: WCAG 2.5.8 asks for at
                least 24 px, and this sits under a thumb on a phone. */}
            <button
              type="button"
              onClick={closeBanner}
              aria-label={copy.dismiss}
              className="-m-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {withDialog && (
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
        >
          <DialogContent data-testid="spmb-announcement-dialog">
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>{dialogBody}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={closeDialog}>
                {copy.dialogLater}
              </Button>
              <Link href="/public/spmb" onClick={closeDialog}>
                <Button>{dialogCta}</Button>
              </Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
