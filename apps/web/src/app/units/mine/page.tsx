"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { useAuthStore } from "@/stores/auth";

/**
 * Profil Unit — the unit's admin and kepala sekolah land on their own unit's
 * page (its details and its accreditation). An account with no unit (the
 * Super Admin, the yayasan's organs) gets the list of units.
 */
export default function MyUnitPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    router.replace(user.unitId ? `/units/${user.unitId}` : "/units");
  }, [router, user]);

  return (
    <MainLayout>
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </MainLayout>
  );
}
