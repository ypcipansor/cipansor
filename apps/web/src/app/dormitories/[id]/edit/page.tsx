"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useCanManageDormitories,
  useDormitory,
  useUpdateDormitory,
} from "@/hooks/use-dormitory";
import { MainLayout } from "@/components/layout";
import { DormitoryForm, NotADormitoryManager } from "../../dormitory-form";

function EditDormitoryPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const canManage = useCanManageDormitories();

  const { data: dormitory, isLoading } = useDormitory(id);
  const updateMutation = useUpdateDormitory();

  if (!canManage)
    return <NotADormitoryManager backHref={`/dormitories/${id}`} />;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dormitory) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Asrama tidak ditemukan</h3>
        <Button asChild className="mt-4">
          <Link href="/dormitories">Kembali ke Daftar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dormitories/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Asrama</h1>
          <p className="text-muted-foreground">
            Perbarui data asrama {dormitory.name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi Asrama</CardTitle>
          <CardDescription>
            Musyrif dan koordinator asrama ditugaskan di tab Musyrif pada
            halaman asrama.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DormitoryForm
            dormitory={dormitory}
            submitting={updateMutation.isPending}
            cancelHref={`/dormitories/${id}`}
            onSubmit={async (data) => {
              try {
                await updateMutation.mutateAsync({ id, data });
                toast.success("Asrama berhasil diperbarui");
                router.push(`/dormitories/${id}`);
              } catch {
                // The API client has already shown the server's message.
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function EditDormitoryPage(
  props: Parameters<typeof EditDormitoryPageContent>[0],
) {
  return (
    <MainLayout>
      <EditDormitoryPageContent {...props} />
    </MainLayout>
  );
}
