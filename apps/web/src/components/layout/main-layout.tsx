"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ProtectedRoute } from "@/components/auth/protected-route";

interface MainLayoutProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  /** See ProtectedRoute: any one of these API permissions also admits. */
  allowedPermissions?: string[];
  showSidebar?: boolean;
}

import { PageTransition } from "./page-transition";

export function MainLayout({
  children,
  allowedRoles,
  allowedPermissions,
  showSidebar = true,
}: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ProtectedRoute
      allowedRoles={allowedRoles}
      allowedPermissions={allowedPermissions}
    >
      {/* The skip link lives in the root layout, where it is genuinely the
          first focusable thing on the page and covers the public site too.
          This one was a second link with a different label ("Langsung ke
          konten" vs "Loncat ke konten utama") pointing at the same target. */}
      <div className="flex h-screen overflow-hidden">
        {/* Desktop Sidebar */}
        {showSidebar && (
          <div className="hidden lg:block">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
          </div>
        )}

        {/* Mobile Sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <Sidebar />
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            onMenuClick={showSidebar ? () => setMobileOpen(true) : undefined}
          />
          {/* role="main" is what <main> already means; stating it again is
              the kind of redundancy screen readers announce twice. */}
          <main
            id="main-content"
            className="flex-1 overflow-auto bg-muted/30 p-4 lg:p-6 premium-gradient"
          >
            <PageTransition>
              <div className="mx-auto max-w-7xl">{children}</div>
            </PageTransition>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
