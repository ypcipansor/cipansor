"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  CalendarCheck,
  Wallet,
  Menu,
  Bell,
  BookOpen,
  BarChart3,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Beranda", icon: Home },
  { href: "/students", label: "Santri", icon: Users },
  { href: "/attendance", label: "Kehadiran", icon: CalendarCheck },
  { href: "/finance", label: "Keuangan", icon: Wallet },
  { href: "/analytics", label: "Analitik", icon: BarChart3 },
];

const PARENT_NAV_ITEMS: NavItem[] = [
  { href: "/parent", label: "Beranda", icon: Home },
  { href: "/parent/children", label: "Anak", icon: Users },
  { href: "/parent/finance", label: "Keuangan", icon: Wallet },
  { href: "/parent/messages", label: "Pesan", icon: Bell },
  { href: "/announcements", label: "Info", icon: BookOpen },
];

interface BottomNavigationProps {
  variant?: "default" | "parent";
  customItems?: NavItem[];
}

export function BottomNavigation({
  variant = "default",
  customItems,
}: BottomNavigationProps) {
  const pathname = usePathname();

  const items =
    customItems ||
    (variant === "parent" ? PARENT_NAV_ITEMS : DEFAULT_NAV_ITEMS);

  const isActive = (href: string) => {
    if (href === "/dashboard" || href === "/parent") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t md:hidden safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              <span
                className={cn(
                  "text-[10px] mt-1 truncate",
                  active && "font-medium",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Hook to add bottom padding when using bottom navigation
export function useBottomNavPadding() {
  return "pb-20 md:pb-0";
}
