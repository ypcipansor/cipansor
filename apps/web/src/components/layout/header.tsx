"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/auth";
import { demoPhotoForEmail } from "@/lib/demo-avatar";
import { Bell, Menu, Settings, User, LogOut } from "lucide-react";
import Link from "next/link";
import { RoleSwitcher } from "./role-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { useI18n } from "@/providers/i18n-provider";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b glass px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden lg:block">
          {/* Deliberately not an <h1>. This names the site (or the signed-in
              user's unit), not the page. As a heading it sat above every
              page's own <h1>, so each of the 400-odd pages announced itself
              twice and led with the wrong title. The banner landmark already
              carries this text; see the guard in rbac.test.ts. */}
          <div className="text-lg font-semibold">
            {/* Foundation-level accounts have no unit, so the fallback is what
                the yayasan board actually sees every day. */}
            {user?.unit?.name ||
              t("common.appName", "Sistem Informasi Cipansor")}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Role Switcher */}
        <RoleSwitcher />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Notifications */}
        <Button variant="ghost" size="icon" asChild>
          <Link href="/notifications">
            <Bell className="h-5 w-5" />
          </Link>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              aria-label="User menu"
              className="relative h-10 w-10 rounded-full"
            >
              <Avatar className="h-10 w-10">
                {demoPhotoForEmail(user?.email) && (
                  <AvatarImage
                    src={demoPhotoForEmail(user?.email)}
                    alt={user?.name || "User"}
                  />
                )}
                <AvatarFallback>
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              className="cursor-pointer text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
