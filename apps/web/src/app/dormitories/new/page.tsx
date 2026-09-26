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
import {
  useCanManageDormitories,
  useCreateDormitory,
} from "@/hooks/use-dormitory";
import { MainLayout } from "@/components/layout";
import { DormitoryForm, NotADormitoryManager } from "../dormitory-form";

function NewDormitoryPageContent() {
  const router = useRouter();
  const canManage = useCanManageDormitories();
  const createMutation = useCreateDormitory();

  if (!canManage) return <NotADormitoryManager backHref="/dormitories" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dormitories">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tambah Asrama</h1>
          <p className="text-muted-foreground">Tambahkan asrama baru</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informasi Asrama</CardTitle>
          <CardDescription>
            Sesudah asrama tersimpan, tambahkan kamarnya dan tugaskan musyrifnya
            dari halaman asrama.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DormitoryForm
            submitting={createMutation.isPending}
            cancelHref="/dormitories"
            onSubmit={async (data) => {
              try {
                const dormitory = await createMutation.mutateAsync(data);
                toast.success("Asrama berhasil ditambahkan");
                router.push(`/dormitories/${dormitory.id}`);
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

export default function NewDormitoryPage() {
  return (
    <MainLayout>
      <NewDormitoryPageContent />
    </MainLayout>
  );
}
