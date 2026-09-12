"use client";

import { getEffectiveRole } from "@/lib/rbac";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  getNavigationForRole,
  getNavigationForRoleCode,
  type NavGroup,
  type NavItem,
} from "@/config/navigation";
import { useAuthStore } from "@/stores/auth";
import { demoPhotoForEmail } from "@/lib/demo-avatar";
import { ChevronDown, ChevronLeft, LogOut } from "lucide-react";
import { useState } from "react";

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

interface UserRole {
  id: string;
  isPrimary: boolean;
  role: {
    id: string;
    code: string;
    name: string;
    realm: string;
  };
  unit?: {
    id: string;
    name: string;
  } | null;
}

// Realm colors for badges
const realmColors: Record<string, string> = {
  GLOBAL: "bg-purple-500",
  YAYASAN: "bg-amber-500",
  TK: "bg-pink-500",
  SD_IT: "bg-green-500",
  SMP_IT: "bg-blue-500",
  SMA_ALQURAN: "bg-emerald-500",
};

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  // Get active role from userRoles
  const userRoles = user?.userRoles as UserRole[] | undefined;
  const activeRole = userRoles?.find((r) => r.isPrimary) || userRoles?.[0];

  // Get navigation based on active role code or fallback to legacy role
  const navigation = activeRole
    ? getNavigationForRoleCode(activeRole.role.code)
    : user
      ? getNavigationForRole(getEffectiveRole(user) ?? user.role)
      : [];

  return (
    <aside
      aria-label="Menu utama"
      className={cn(
        "flex h-screen flex-col border-r sidebar-gradient transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Logo Pesantren Cipansor"
              width={32}
              height={32}
              priority
              className="h-8 w-8 object-contain rounded-lg"
            />
            <span className="font-semibold text-foreground">Cipansor</span>
          </Link>
        )}
        {collapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center">
            <Image
              src="/logo.png"
              alt="Logo Pesantren Cipansor"
              width={32}
              height={32}
              priority
              className="h-8 w-8 object-contain rounded-lg"
            />
          </div>
        )}
        {onToggle && !collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation — gulir bawaan peramban, bukan `ScrollArea` Radix — dan ini hasil
          pengukuran, bukan selera.

          Di build produksi, posisi ibu jari Radix di sini hanya ditulis SEKALI
          per sesi gulir. Diukur dengan MutationObserver pada atribut `style`
          ibu jarinya, tiga sesi berturut-turut yang masing-masing memutar roda
          empat kali: satu penulisan per sesi, selalu pada peristiwa gulir
          PERTAMA. Isinya turun 0→1200, 1200→2400, 2400→3600, sementara ibu
          jarinya berhenti di 44px, 222px, 399px dari trek 609px. Hasilnya
          persis keluhan yang dilaporkan: bilahnya tertinggal jauh sementara
          menunya sudah mentok bawah, lalu meloncat menyusul saat putaran
          berikutnya dimulai. Gelung rAF pelacaknya (`addUnlinkedScrollListener`)
          tidak pernah berjalan — `requestAnimationFrame` nol panggilan selama
          seluruh gulir. Komponen yang sama di luar Next merender dengan benar,
          jadi cacatnya muncul dari kombinasinya, bukan dari komponennya saja.

          `min-h-0` tetap penting: anak flex tidak mau menyusut di bawah tinggi
          isinya tanpa itu, dan menu ~4800px ini akan meluber keluar layar
          alih-alih bergulir.

          `overscroll-contain` menahan gulir agar tidak merembet ke induknya
          begitu menyentuh ujung. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 pl-3 pr-1 thin-scrollbar">
        {navigation.map((group, index) => (
          <NavGroupComponent
            key={group.title}
            group={group}
            pathname={pathname}
            collapsed={collapsed}
            showSeparator={index > 0}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t p-4">
        {!collapsed && user && (
          <div className="mb-4 flex items-center gap-3">
            {demoPhotoForEmail(user.email) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={demoPhotoForEmail(user.email)}
                alt={user.name ?? "User"}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {user.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{user.name}</p>
              {activeRole && (
                <div className="flex items-center gap-1">
                  <Badge
                    className={cn(
                      "text-[10px] px-1 py-0 text-white",
                      realmColors[activeRole.role.realm],
                    )}
                  >
                    {activeRole.role.realm.replace("_", " ")}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {activeRole.role.name}
                  </span>
                </div>
              )}
              {!activeRole && (
                <p className="truncate text-xs text-muted-foreground">
                  {user.role}
                </p>
              )}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start",
            collapsed && "justify-center px-2",
          )}
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Logout</span>}
        </Button>
      </div>
    </aside>
  );
}

interface NavGroupComponentProps {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
  showSeparator: boolean;
}

function NavGroupComponent({
  group,
  pathname,
  collapsed,
  showSeparator,
}: NavGroupComponentProps) {
  return (
    <div className="mb-4">
      {showSeparator && <Separator className="mb-4" />}
      {!collapsed && (
        <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {group.title}
        </h4>
      )}
      <nav className="space-y-1">
        {group.items.map((item) => (
          <NavItemComponent
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </div>
  );
}

function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One sidebar entry, with its submenu when it has one.
 *
 * `NavItem.children` sudah ada di tipenya sejak lama tetapi tidak pernah
 * dirender — jadi satu-satunya cara merapikan menu yang panjang adalah
 * menumpuk entri datar sampai bilah sisinya harus digulir jauh. Sekarang
 * induknya bisa dibuka-tutup, dan cabang yang sedang dibuka terbuka sendiri.
 */
function NavItemComponent({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const children = item.children ?? [];
  const hasChildren = children.length > 0;
  // Aktif bila halamannya sendiri atau salah satu anaknya sedang dibuka.
  const branchActive =
    isWithin(pathname, item.href) || children.some((c) => isWithin(pathname, c.href));
  const [open, setOpen] = useState(branchActive);
  const Icon = item.icon;

  // Saat bilah sisinya menyempit hanya ikon yang terlihat, jadi submenu
  // ditiadakan dan induknya kembali menjadi tautan biasa.
  if (!hasChildren || collapsed) {
    return (
      <Link href={item.href}>
        <Button
          variant={branchActive ? "secondary" : "ghost"}
          className={cn(
            "w-full justify-start transition-all duration-200 hover:translate-x-1",
            branchActive && "active-glow bg-secondary/80 font-medium",
            collapsed && "justify-center px-2 hover:translate-x-0",
          )}
          title={collapsed ? item.title : undefined}
        >
          <Icon className="h-4 w-4" />
          {!collapsed && <span className="ml-2">{item.title}</span>}
        </Button>
      </Link>
    );
  }

  const panelId = `submenu-${item.href.replace(/[^\w-]/g, "-")}`;

  return (
    <div>
      <div className="flex items-center">
        <Link href={item.href} className="min-w-0 flex-1">
          <Button
            variant={branchActive ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start transition-all duration-200",
              branchActive && "bg-secondary/60 font-medium",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="ml-2 flex-1 truncate text-left">{item.title}</span>
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Tutup" : "Buka"} submenu ${item.title}`}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <div id={panelId} hidden={!open} className="mt-1 space-y-1 pl-4">
        {children.map((child) => {
          const childActive = isWithin(pathname, child.href);
          const ChildIcon = child.icon;
          return (
            <Link key={child.href} href={child.href}>
              <Button
                variant={childActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start border-l border-border pl-3 transition-all duration-200 hover:translate-x-1",
                  childActive && "active-glow bg-secondary/80 font-medium",
                )}
              >
                <ChildIcon className="h-3.5 w-3.5" />
                <span className="ml-2">{child.title}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
