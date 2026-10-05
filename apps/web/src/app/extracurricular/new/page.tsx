"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { ExtracurricularForm } from "@/components/extracurricular/extracurricular-form";
import { useCreateExtracurricular } from "@/hooks/use-extracurricular";
import { getErrorMessage } from "@/lib/api-error";
import { useAuthStore } from "@/stores/auth";

export default function NewExtracurricularPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const createMutation = useCreateExtracurricular();

  return (
    <MainLayout>
      <PageHeader
        title="Tambah Ekstrakurikuler"
        description="Buat kegiatan ekstrakurikuler baru"
        backHref="/extracurricular"
      />
      <ExtracurricularForm
        mode="create"
        fixedUnitId={
          user?.role === "SUPER_ADMIN" ? null : (user?.unitId ?? null)
        }
        submitting={createMutation.isPending}
        onSubmit={async (payload) => {
          try {
            const created = await createMutation.mutateAsync(payload);
            toast.success("Ekstrakurikuler berhasil dibuat");
            router.push(
              created?.id
                ? `/extracurricular/${created.id}`
                : "/extracurricular",
            );
          } catch (error) {
            toast.error(
              getErrorMessage(error) || "Gagal membuat ekstrakurikuler",
            );
          }
        }}
      />
    </MainLayout>
  );
}
