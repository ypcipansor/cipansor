"use client";

/**
 * Super-admin settings page for the public AI assistant.
 *
 * The sidebar only shows this link to SUPER_ADMIN and the API enforces the same,
 * but the page guards its own content too: a non-super-admin who reaches the URL
 * gets a clear "access denied" rather than the editor's generic load error.
 */

import { ShieldAlert } from "lucide-react";
import { MainLayout } from "@/components/layout";
import { useAuthStore } from "@/stores/auth";
import { getPrimaryRoleCode } from "@/lib/rbac";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { ChatbotPersonaEditor } from "@/components/settings/chatbot-persona-editor";
import { ChatbotUsageCard } from "@/components/settings/chatbot-usage-card";

function ChatbotSettingsContent() {
  const { user } = useAuthStore();
  const isSuperAdmin = getPrimaryRoleCode(user) === "SUPER_ADMIN";

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Asisten AI</h1>
        <p className="text-muted-foreground">
          Atur gaya bicara chatbot layanan publik Cipansor yang tampil di situs
          untuk masyarakat.
        </p>
      </div>

      {isSuperAdmin ? (
        <>
          {/* Pemakaian ditaruh DI ATAS penyunting persona, bukan di bawahnya:
              yang pertama ingin diketahui orang yang membuka halaman ini
              adalah berapa yang sudah terpakai bulan ini, bukan gaya
              bicaranya. */}
          <ChatbotUsageCard />
          <ChatbotPersonaEditor />
        </>
      ) : (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Akses ditolak</AlertTitle>
          <AlertDescription>
            Hanya Super Admin yang dapat mengatur persona asisten AI.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function ChatbotSettingsPage() {
  return (
    <MainLayout>
      <ChatbotSettingsContent />
    </MainLayout>
  );
}
