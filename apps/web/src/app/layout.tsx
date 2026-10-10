import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
// Force Global HMR Rebuild
import { QueryProvider } from "@/components/providers/query-provider";
import { I18nProvider } from "@/providers/i18n-provider";
import { dirFor, isLocale, LOCALE_COOKIE, type Locale } from "@/locales";
import { Toaster } from "@/components/ui/sonner";
import {
  SkipLink,
  OfflineBanner,
  TestCopyWatermark,
} from "@/components/shared";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { UpdatePrompt } from "@/components/pwa/update-prompt";
import {
  pwaEnabledForHost,
  indexableHost,
  isPortalHost,
} from "@/lib/host-split";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Built per request, not once at build time, because two hosts share one build
 * and their `<head>` must differ: the manifest and the Apple web-app tags belong
 * to the portal only, and only the public site should be indexed. See
 * `lib/host-split.ts` for why each of those is host-specific.
 *
 * Reading `headers()` opts this layout out of static rendering — but it already
 * reads `cookies()` for the locale below, so nothing is lost that was not
 * already given up.
 */
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  const pwa = pwaEnabledForHost(host);

  return {
    // Product name. `publisher` below stays the legal entity.
    title: "Sistem Informasi Cipansor",
    description:
      "Sistem Informasi Cipansor — layanan digital Yayasan Pesantren Cipansor.",
    applicationName: "Sistem Informasi Cipansor",
    keywords: [
      "pesantren",
      "management",
      "system",
      "education",
      "islamic school",
    ],
    authors: [{ name: "Cipansor Team" }],
    creator: "Cipansor Team",
    publisher: "Yayasan Pesantren Cipansor",
    robots: indexableHost(host) ? "index, follow" : "noindex, nofollow",
    icons: {
      icon: "/favicon.ico",
      // Not PWA-specific — this is the bookmark icon iOS uses for an ordinary
      // "add to home screen", so it stays on both hosts.
      apple: "/icons/icon-180.png",
    },
    // Omitted entirely on the public site: no <link rel="manifest">, so the
    // browser never considers the marketing site installable and never fires
    // `beforeinstallprompt` there in the first place.
    ...(pwa
      ? {
          manifest: "/manifest.json",
          appleWebApp: {
            capable: true,
            statusBarStyle: "default" as const,
            title: "Cipansor",
          },
        }
      : {}),
    openGraph: {
      type: "website",
      locale: "id_ID",
      siteName: "Sistem Informasi Cipansor",
      title: "Sistem Informasi Cipansor",
      description:
        "Sistem Informasi Cipansor — layanan digital Yayasan Pesantren Cipansor.",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16a34a",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the persisted locale server-side so the first paint already has the
  // right lang/dir (no hydration flash, no RTL layout shift for Arabic).
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : "id";

  // The application's host, and only it, gets the PWA. Same value the head
  // metadata is built from, read again here because the two run separately.
  const requestHeaders = await headers();
  const pwa = pwaEnabledForHost(requestHeaders.get("host"));
  // The SPMB announcement mounts on the public site (and localhost), not on the
  // portal — the same gate the public pages pass to `SpmbAnnouncement`. The
  // pre-paint script below only needs to be emitted where the banner can appear.
  const publicSite = !isPortalHost(requestHeaders.get("host"));

  // The CSP nonce the middleware generated for this request. Next stamps it on
  // the inline bootstrap scripts it emits; this is what the app's own executable
  // inline script presents (see the `beforeinstallprompt` capture below).
  const nonce = requestHeaders.get("x-nonce") ?? "";

  return (
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      <head>
        {/*
          Capture `beforeinstallprompt` before React exists.

          Chrome fires it as soon as it has decided the app is installable,
          which is routinely earlier than hydration — and the event fires
          exactly once. InstallPrompt attaches its listener in a useEffect, so
          on any load where hydration lost that race the event was simply
          dropped and the install banner never appeared again for that visit.
          It looked intermittent, and got steadily worse as the bundle grew.

          This runs before the body parses, stashes the event, and lets the
          React component pick it up whenever it mounts.

          Not emitted on the public site. Without a manifest there the event
          would never fire anyway, so this is belt and braces — but it is also
          the only listener that calls preventDefault(), and leaving a
          suppressor for an event we no longer act on is how a browser's own
          install affordance goes quietly missing.
        */}
        {pwa && (
          <script
            // The middleware's `script-src` carries a nonce and no
            // `'unsafe-inline'`, so this executable inline script must present
            // it. It is the request's own CSP nonce, read back off the request
            // headers the middleware set (`middleware.ts` → `pass()`). React
            // strips the attribute when the value is empty, so a host without
            // middleware keeps working.
            nonce={nonce || undefined}
            dangerouslySetInnerHTML={{
              __html: `(function(){window.__installPromptEvent=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPromptEvent=e;window.dispatchEvent(new Event('installpromptready'));});})();`,
            }}
          />
        )}
        {/*
          Keep the SPMB banner out of the first paint under browser automation.

          The banner is server-rendered so it is in the first paint and does not
          push the page down (see `components/landing/spmb-announcement.tsx`).
          But the guard that keeps it out of unrelated e2e specs —
          `navigator.webdriver` — only exists in the browser, so the server
          renders the banner anyway. Hydration then removes it a moment later,
          shifting everything below it while Playwright is between its stability
          check and its click: the landing spec's "Daftar SPMB" link missed
          exactly so, intermittently, at ~52px of movement.

          This runs before the body parses and adds the class the CSS rule in
          `globals.css` uses to hide the banner, so it is `display: none` from
          the first paint and never moves the page. The component still removes
          it from the DOM afterwards, so a spec asserting it is absent sees
          nothing. The announcement's own spec sets
          `localStorage["spmb-announcement-force"]` to opt back in — checked
          here too, or the class would hide the banner the spec came to see.

          Emitted only where the banner can mount (the public site, not the
          portal). The nonce is required for the same reason as the capture
          above: the middleware's `script-src` has no `'unsafe-inline'`.
        */}
        {publicSite && (
          <script
            nonce={nonce || undefined}
            dangerouslySetInnerHTML={{
              __html: `(function(){try{if(navigator.webdriver&&localStorage.getItem('spmb-announcement-force')!=='1'){document.documentElement.classList.add('spmb-under-automation');}}catch(e){}})();`,
            }}
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider initialLocale={locale}>
          <QueryProvider>
            <SkipLink />
            <OfflineBanner />
            {/*
              Deliberately a div, not <main>. It wraps everything the page
              renders — including the sidebar — so as a landmark it was both
              wrong and duplicated: MainLayout renders its own
              <main id="main-content"> inside this one. Two elements shared the
              id, getElementById returned this one, and "Loncat ke konten
              utama" therefore landed *above* the navigation and skipped
              nothing. The single landmark now belongs to whatever renders the
              page's chrome; rbac.test.ts checks every page has exactly one
              source for it.
            */}
            <div id="app-root">{children}</div>
            <TestCopyWatermark />
            <Toaster />
            {/*
              Always mounted, even where the PWA is off: on the public site its
              job flips from registering the worker to removing one that an
              earlier visit already installed. Simply not registering would
              leave every previous visitor — the apex has been live and crawled
              since the host split — with a navigation-intercepting worker that
              nothing ever takes away.
            */}
            <ServiceWorkerRegister enabled={pwa} />
            {pwa && <InstallPrompt />}
            {pwa && <UpdatePrompt />}
          </QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
