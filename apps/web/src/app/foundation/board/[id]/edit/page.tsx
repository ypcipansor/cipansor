"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useFoundationBoardMember,
  useUpdateFoundationBoardMember,
} from "@/hooks";
import {
  BoardMemberForm,
  boardMemberFormValues,
  boardMemberPayload,
} from "@/components/foundation/board-member-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

function EditBoardMemberPageContent({ params }: PageProps) {
  const { id: memberId } = use(params);
  const router = useRouter();

  const { data: member, isLoading } = useFoundationBoardMember(memberId);
  const updateMember = useUpdateFoundationBoardMember();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Anggota organ tidak ditemukan</h2>
        <Button className="mt-4" onClick={() => router.back()}>
          Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="Kembali"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Edit Anggota Organ
          </h1>
          <p className="text-muted-foreground">{member.name}</p>
        </div>
      </div>

      {/* Built once the member has arrived, so its values are the defaults
          rather than a reset (lessons/select-empty-value-sentinel.md). */}
      <BoardMemberForm
        initial={boardMemberFormValues(member)}
        pending={updateMember.isPending}
        onSubmit={async (values) => {
          try {
            await updateMember.mutateAsync({
              id: memberId,
              data: boardMemberPayload(values),
            });
            toast.success("Anggota organ berhasil diperbarui");
            router.push("/foundation?tab=board");
          } catch {
            toast.error("Gagal memperbarui anggota organ");
          }
        }}
      />
    </div>
  );
}

export default function EditBoardMemberPage({ params }: PageProps) {
  return (
    <MainLayout>
      <EditBoardMemberPageContent params={params} />
    </MainLayout>
  );
}
