"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MainLayout } from "@/components/layout";
import { PERMIT_HEAD_AFTER_DAYS } from "@cipansor/shared";
import { DoctorNoteField } from "@/components/permits/doctor-note";
import {
  useAttachDoctorNote,
  useCreatePermit,
  localInputToIso,
} from "@/hooks/use-permits";
import { PermitForm, type PermitFormValues } from "../permit-form";

function NewPermitPageContent() {
  const router = useRouter();
  const createMutation = useCreatePermit();
  const attachNote = useAttachDoctorNote();
  const [note, setNote] = useState<File | null>(null);

  const onSubmit = async (values: PermitFormValues) => {
    try {
      const permit = await createMutation.mutateAsync({
        studentId: values.studentId,
        type: values.type,
        reason: values.reason,
        destination: values.destination || undefined,
        startDate: localInputToIso(values.startDate),
        endDate: localInputToIso(values.endDate),
      });
      if (note) {
        try {
          await attachNote.mutateAsync({ id: permit.id, file: note });
        } catch {
          // Filed without it; the permit page offers to attach it again.
          toast.warning("Izin diajukan, tetapi surat dokter gagal dilampirkan");
          router.push(`/permits/${permit.id}`);
          return;
        }
      }
      toast.success("Izin diajukan");
      router.push(`/permits/${permit.id}`);
    } catch {
      // The API client has already shown the server's message.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/permits" aria-label="Kembali ke daftar izin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ajukan Izin</h1>
          <p className="text-muted-foreground">
            Diputuskan musyrif santri (santri mukim) atau wali kelasnya; izin
            lebih dari {PERMIT_HEAD_AFTER_DAYS} hari oleh kepala unit
          </p>
        </div>
      </div>
      <PermitForm
        cancelHref="/permits"
        submitLabel="Ajukan"
        isSubmitting={createMutation.isPending || attachNote.isPending}
        onSubmit={onSubmit}
        after={<DoctorNoteField file={note} onChange={setNote} />}
      />
    </div>
  );
}

export default function NewPermitPage() {
  return (
    <MainLayout>
      <NewPermitPageContent />
    </MainLayout>
  );
}
