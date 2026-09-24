"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useI18n } from "@/providers/i18n-provider";
import type { TranslationPath } from "@/locales";

/**
 * Real pages, not on-page anchors.
 *
 * These used to be `#about`, `#programs`, `#units`, `#news` — the whole site
 * was one document with five hash links, which left search engines (and the
 * Google Ad Grants review, which rejected the account for exactly this) with a
 * single indexable URL and no substantial content behind the menu.
 *
 * Labels are translation keys rather than literals: the switcher below now
 * reaches the public site, and a hardcoded Indonesian menu above translated
 * page content reads worse than no switcher at all.
 */
const navItems: Array<{ key: TranslationPath; href: string }> = [
  { key: "public.nav.home", href: "/" },
  { key: "public.nav.profile", href: "/profil" },
  { key: "public.nav.programs", href: "/program-unggulan" },
  { key: "public.nav.units", href: "/unit" },
  { key: "public.nav.news", href: "/berita" },
  { key: "public.nav.donate", href: "/wakaf-infaq" },
];

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll(); // Initialize on mount
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300 border-b border-transparent",
        scrolled
          ? "bg-background/80 backdrop-blur-md border-border shadow-sm"
          : "bg-transparent",
      )}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/images/cipansor/logo-cipansor.webp"
              alt="Logo Pesantren Cipansor"
              width={32}
              height={32}
              priority
              className="h-8 w-8 object-contain"
            />
            <span className="whitespace-nowrap text-base xl:text-lg font-bold tracking-tight text-foreground">
              Pesantren Cipansor
            </span>
          </Link>

          {/*
            The constraint is `container`, not the viewport.

            A previous pass measured the row at a 1280px viewport, found it
            needed 1062px, and moved the switch to `min-[1100px]`. That number
            was measured against the wrong thing. `container` caps its width at
            the active breakpoint, so between 1024px and 1279px the row is
            1024px wide no matter how wide the window is — 960px of content
            after `lg:px-8`. The nav needed 998px, so it overflowed and the
            brand was squeezed into the first link. The original `xl` note was
            right about the collision even though its estimate was off.

            The band 1024-1279 is the only tight one (960px available; at
            1280-1535 the row is 1216px, above that 1472px). So the row is made
            to fit *there* rather than the breakpoint pushed up: `gap-3` and a
            `text-base` brand below `xl` bring it to 184 + 740 = 924px, leaving
            36px. Full spacing returns at `xl`, where there is 226px spare.

            That lets the desktop nav start at `lg` (1024px) — wider coverage
            than either 1100 or 1280, and it fixes the 1920x1080 laptop at 150%
            scaling (1280 CSS px, or just under once the scrollbar is counted)
            that fell to the hamburger before. Below 1024 the container drops to
            768px and the hamburger is genuinely the right answer.

            `whitespace-nowrap` keeps a label from breaking mid-phrase
            ("Program / Unggulan"). Verified with Playwright at 1024, 1280 and
            1920; see the sweep in nav-breakpoint.spec.ts.
          */}
          {/*
            The switcher costs the row width, in the band that had 36px spare.

            A compact trigger (32px) plus its gap is ~40px, so the inter-link
            gap drops from 12px to 8px below `xl` — six gaps, 24px back — and
            full spacing returns at `xl` where there is room. Measured, not
            estimated: nav-breakpoint.spec.ts sweeps 1024-1920 and fails on
            either overlap or internal scrolling.
          */}
          <nav className="hidden lg:flex items-center gap-2 xl:gap-5 2xl:gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {t(item.key)}
              </Link>
            ))}
            {/*
              No portal link here, on purpose.

              This site's visitors are prospective families: its job is SPMB and
              legitimacy. Everyone who can actually sign in — santri, wali santri,
              guru — is told the address directly ("buka portal.cipansor.or.id"),
              which is a shorter instruction with fewer steps to get wrong than
              "open cipansor.or.id, find the button, then follow a redirect".

              Nothing is lost by leaving it out: `/login` still 308s to the portal
              (see lib/host-split.ts), so anyone who types it out of habit lands
              in the right place. That safety net costs no pixels here.
            */}
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <LanguageSwitcher compact />
              <Link href="/public/spmb">
                <Button
                  size="sm"
                  className="whitespace-nowrap bg-primary hover:bg-primary/90"
                >
                  {t("public.nav.register")}
                </Button>
              </Link>
            </div>
          </nav>

          {/* Mobile Nav — must mirror the desktop breakpoint above. If these
              two ever disagree, both render and `justify-between` silently
              eats the gap between brand and nav. */}
          <div className="flex items-center gap-1 lg:hidden">
            {/* Outside the drawer: a reader who cannot read the menu labels
                should not have to open the menu to find the language. */}
            <LanguageSwitcher compact />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">{t("public.nav.toggleMenu")}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-6">
                <SheetHeader>
                  <SheetTitle className="text-left flex items-center gap-2">
                    <Image
                      src="/images/cipansor/logo-cipansor.webp"
                      alt="Logo Pesantren Cipansor"
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain"
                    />
                    Pesantren Cipansor
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 mt-8">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {t(item.key)}
                    </Link>
                  ))}
                  <div className="h-px bg-border my-2" />
                  {/* No portal link — see the note in the desktop nav above. */}
                  <Link href="/public/spmb">
                    <Button className="w-full justify-start">
                      {t("public.nav.register")}
                    </Button>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
