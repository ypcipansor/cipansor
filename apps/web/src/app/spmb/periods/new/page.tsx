"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  PeriodForm,
  periodFormValues,
  periodPayload,
} from "@/components/admissions/period-form";
import { useCreateAdmissionPeriod } from "@/hooks/use-admissions";
import { useUnits } from "@/hooks/use-units";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api-error";

export default function NewAdmissionPeriodPage() {
  const router = useRouter();
  const { user } = useAuth();
  const units = useUnits();
  const years = useAcademicYears({ limit: 50 });
  const create = useCreateAdmissionPeriod();

  const ready = !units.isLoading && !years.isLoading;
  // A unit's admin enters their own unit's intake; start the form there.
  const ownUnit = (user as { unitId?: string | null } | null)?.unitId ?? "";

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Tambah Periode SPMB"
          description="Gelombang, persyaratan, dan narahubung ditambahkan sesudah periode tersimpan."
        />
        {!ready ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        ) : (
          <PeriodForm
            defaultValues={{ ...periodFormValues(), unitId: ownUnit }}
            units={(units.data ?? []).map((u) => ({ id: u.id, name: u.name }))}
            academicYears={(years.data?.data ?? []).map((y) => ({
              id: y.id,
              name: y.name,
            }))}
            isEdit={false}
            isPending={create.isPending}
            cancelHref="/spmb/periods"
            onSubmit={async (values) => {
              try {
                const period = await create.mutateAsync(periodPayload(values));
                toast.success("Periode tersimpan. Tambahkan gelombangnya.");
                router.push(`/spmb/periods/${period.id}`);
              } catch (error) {
                toast.error(getErrorMessage(error));
              }
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}
