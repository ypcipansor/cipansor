"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCreateFoundationBoardMember } from "@/hooks";
import {
  BoardMemberForm,
  boardMemberFormValues,
  boardMemberPayload,
} from "@/components/foundation/board-member-form";

import { MainLayout } from "@/components/layout";

function NewBoardMemberPageContent() {
  const router = useRouter();
  const createMember = useCreateFoundationBoardMember();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/foundation?tab=board" aria-label="Kembali">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Tambah Anggota Organ
          </h1>
          <p className="text-muted-foreground">
            Pembina, Pengawas, atau Pengurus yayasan
          </p>
        </div>
      </div>

      <BoardMemberForm
        initial={boardMemberFormValues()}
        pending={createMember.isPending}
        onSubmit={async (values) => {
          try {
            await createMember.mutateAsync(boardMemberPayload(values));
            toast.success("Anggota organ berhasil ditambahkan");
            router.push("/foundation?tab=board");
          } catch {
            toast.error("Gagal menambahkan anggota organ");
          }
        }}
      />
    </div>
  );
}

export default function NewBoardMemberPage() {
  return (
    <MainLayout>
      <NewBoardMemberPageContent />
    </MainLayout>
  );
}
