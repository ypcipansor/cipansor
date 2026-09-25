"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MainLayout } from "@/components/layout";
import {
  usePermit,
  useUpdatePermit,
  isoToLocalInput,
  localInputToIso,
} from "@/hooks/use-permits";
import { PermitForm, type PermitFormValues } from "../../permit-form";

function EditPermitPageContent() {
  const params = useParams();
  const router = useRouter();
  const permitId = params.id as string;

  const { data: permit, isLoading } = usePermit(permitId);
  const updateMutation = useUpdatePermit();

  const onSubmit = async (values: PermitFormValues) => {
    try {
      await updateMutation.mutateAsync({
        id: permitId,
        data: {
          type: values.type,
          reason: values.reason,
          destination: values.destination || undefined,
          startDate: localInputToIso(values.startDate),
          endDate: localInputToIso(values.endDate),
        },
      });
      toast.success("Izin diperbarui");
      router.push(`/permits/${permitId}`);
    } catch {
      // The API client has already shown the server's message.
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Izin tidak ditemukan</p>
        <Button asChild className="mt-4">
          <Link href="/permits">Kembali ke daftar</Link>
        </Button>
      </div>
    );
  }

  if (permit.status !== "PENDING") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">
          Izin yang sudah diputuskan tidak dapat diubah.
        </p>
        <Button asChild className="mt-4">
          <Link href={`/permits/${permitId}`}>Lihat izin</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link
            href={`/permits/${permitId}`}
            aria-label="Kembali ke detail izin"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Ubah Izin</h1>
      </div>
      <PermitForm
        student={{
          id: permit.student.id,
          name: permit.student.user.name,
          nis: permit.student.nis,
        }}
        lockStudent
        defaultValues={{
          studentId: permit.studentId,
          type: permit.type,
          reason: permit.reason,
          destination: permit.destination ?? "",
          startDate: isoToLocalInput(permit.startDate),
          endDate: isoToLocalInput(permit.endDate),
        }}
        cancelHref={`/permits/${permitId}`}
        submitLabel="Simpan"
        isSubmitting={updateMutation.isPending}
        onSubmit={onSubmit}
      />
    </div>
  );
}

export default function EditPermitPage() {
  return (
    <MainLayout>
      <EditPermitPageContent />
    </MainLayout>
  );
}
