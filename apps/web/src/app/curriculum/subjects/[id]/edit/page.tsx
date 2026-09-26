"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  useCanManageSubjects,
  useSubject,
  useUpdateSubject,
} from "@/hooks/use-curriculum";
import { MainLayout } from "@/components/layout";
import { NotASubjectManager, SubjectForm } from "../../subject-form";

function EditSubjectPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const canManage = useCanManageSubjects();
  const { data: subject, isLoading } = useSubject(id);
  const updateMutation = useUpdateSubject();

  if (!canManage) {
    return <NotASubjectManager backHref={`/curriculum/subjects/${id}`} />;
  }
  if (isLoading) return <Skeleton className="h-96" />;
  if (!subject) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <h3 className="text-lg font-semibold">
          Mata pelajaran tidak ditemukan
        </h3>
        <Button asChild>
          <Link href="/curriculum">Kembali ke Kurikulum</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/curriculum/subjects/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Edit Mata Pelajaran
          </h1>
          <p className="text-muted-foreground">
            {subject.code} · {subject.name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi Mata Pelajaran</CardTitle>
          <CardDescription>{subject.unit?.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <SubjectForm
            subject={subject}
            lockUnit
            submitting={updateMutation.isPending}
            cancelHref={`/curriculum/subjects/${id}`}
            // The unit field is locked here, and the API's update schema
            // drops unitId anyway: a subject never moves to another unit.
            onSubmit={async (data) => {
              try {
                await updateMutation.mutateAsync({ id, data });
                toast.success("Mata pelajaran diperbarui");
                router.push(`/curriculum/subjects/${id}`);
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

export default function EditSubjectPage(
  props: Parameters<typeof EditSubjectPageContent>[0],
) {
  return (
    <MainLayout>
      <EditSubjectPageContent {...props} />
    </MainLayout>
  );
}
