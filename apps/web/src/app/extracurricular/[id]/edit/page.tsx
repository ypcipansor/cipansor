"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ExtracurricularForm } from "@/components/extracurricular/extracurricular-form";
import {
  useExtracurricular,
  useUpdateExtracurricular,
} from "@/hooks/use-extracurricular";
import { getErrorMessage } from "@/lib/api-error";

/**
 * Editing an extracurricular. The detail page's "Edit" button had always led
 * here, and nothing was here.
 */
export default function EditExtracurricularPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: ekskul, isLoading } = useExtracurricular(id);
  const updateMutation = useUpdateExtracurricular();

  return (
    <MainLayout>
      <PageHeader
        title={ekskul ? `Edit ${ekskul.name}` : "Edit Ekstrakurikuler"}
        description="Ubah data kegiatan ekstrakurikuler"
        backHref={`/extracurricular/${id}`}
      />
      {isLoading || !ekskul ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <ExtracurricularForm
          key={ekskul.id}
          mode="edit"
          initial={ekskul}
          submitting={updateMutation.isPending}
          onSubmit={async (payload) => {
            try {
              await updateMutation.mutateAsync({ id, ...payload });
              toast.success("Ekstrakurikuler berhasil diperbarui");
              router.push(`/extracurricular/${id}`);
            } catch (error) {
              toast.error(
                getErrorMessage(error) || "Gagal memperbarui ekstrakurikuler",
              );
            }
          }}
        />
      )}
    </MainLayout>
  );
}
