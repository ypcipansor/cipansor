"use client";

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
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getActiveRoleCode } from "@/lib/rbac";
import { useCanManageSubjects, useCreateSubject } from "@/hooks/use-curriculum";
import { MainLayout } from "@/components/layout";
import { NotASubjectManager, SubjectForm } from "../subject-form";

function NewSubjectPageContent() {
  const router = useRouter();
  const { user } = useAuth();
  const canManage = useCanManageSubjects();
  const createMutation = useCreateSubject();

  if (!canManage) return <NotASubjectManager backHref="/curriculum" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/curriculum">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Tambah Mata Pelajaran
          </h1>
          <p className="text-muted-foreground">
            Mata pelajaran baru untuk unit Anda
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi Mata Pelajaran</CardTitle>
          <CardDescription>
            Guru pengampu ditugaskan dari halaman mata pelajaran sesudah
            tersimpan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubjectForm
            defaultUnitId={user?.unitId ?? undefined}
            lockUnit={getActiveRoleCode(user) !== "SUPER_ADMIN"}
            submitting={createMutation.isPending}
            cancelHref="/curriculum"
            onSubmit={async (data) => {
              try {
                const subject = await createMutation.mutateAsync(data);
                toast.success("Mata pelajaran ditambahkan");
                router.push(`/curriculum/subjects/${subject.id}`);
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

export default function NewSubjectPage() {
  return (
    <MainLayout>
      <NewSubjectPageContent />
    </MainLayout>
  );
}
