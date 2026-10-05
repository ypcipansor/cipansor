"use client";

import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  PeriodForm,
  periodChange,
  periodFormValues,
} from "@/components/admissions/period-form";
import {
  useAdmissionPeriod,
  useUpdateAdmissionPeriod,
} from "@/hooks/use-admissions";
import { getErrorMessage } from "@/lib/api-error";

export default function EditAdmissionPeriodPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: period, isLoading } = useAdmissionPeriod(id);
  const update = useUpdateAdmissionPeriod(id);

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Ubah Periode SPMB" description={period?.name} />
        {isLoading || !period ? (
          isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <p className="text-center text-muted-foreground">
              Periode tidak ditemukan.
            </p>
          )
        ) : (
          // Built once the period is here, with it as the defaults: a form of
          // Selects filled by reset after mount loses its values
          // (lessons/select-empty-value-sentinel.md).
          <PeriodForm
            key={period.id}
            defaultValues={periodFormValues(period)}
            units={
              period.unit
                ? [{ id: period.unit.id, name: period.unit.name }]
                : []
            }
            academicYears={
              period.academicYear
                ? [
                    {
                      id: period.academicYear.id,
                      name: period.academicYear.name,
                    },
                  ]
                : []
            }
            isEdit
            isPending={update.isPending}
            cancelHref={`/spmb/periods/${id}`}
            onSubmit={async (values) => {
              try {
                await update.mutateAsync(periodChange(values));
                toast.success("Periode tersimpan");
                router.push(`/spmb/periods/${id}`);
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
