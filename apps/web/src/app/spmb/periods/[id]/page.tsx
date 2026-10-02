"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AdmissionWaveDTO } from "@cipansor/shared";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  WAVE_STATUS_LABELS,
  WaveForm,
  waveFormValues,
  wavePayload,
} from "@/components/admissions/wave-form";
import {
  FeeTableForm,
  FeeTableView,
  feeTableFormValues,
  feeTablePayload,
} from "@/components/admissions/fee-table";
import {
  useAdmissionPeriod,
  useCreateAdmissionWave,
  useDeleteAdmissionWave,
  useReplaceAdmissionFees,
  useUpdateAdmissionWave,
} from "@/hooks/use-admissions";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api-error";
import {
  calendarDay,
  formatAge,
  formatDays,
  formatRupiah,
  wibDay,
} from "@/lib/admission-intake";
import { canManageIntake } from "@/lib/admission-intake-access";

const session = (start: string | null, end: string | null) =>
  formatDays(calendarDay(start), calendarDay(end));

/**
 * One unit's intake: its window, its waves with the sessions that follow
 * registration and the discount for paying in full, its requirements and its
 * contact person — what the public SPMB page and the chatbot announce.
 */
export default function AdmissionPeriodPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: period, isLoading } = useAdmissionPeriod(id);
  const createWave = useCreateAdmissionWave();
  const updateWave = useUpdateAdmissionWave(id);
  const deleteWave = useDeleteAdmissionWave(id);
  const replaceFees = useReplaceAdmissionFees(id);
  const canManage = canManageIntake(user);
  const [editingFees, setEditingFees] = useState(false);

  // undefined: closed; null: a new wave; a wave: editing it.
  const [editing, setEditing] = useState<AdmissionWaveDTO | null | undefined>();
  const [removing, setRemoving] = useState<AdmissionWaveDTO | null>(null);

  if (isLoading || !period) {
    return (
      <MainLayout>
        {isLoading ? (
          <Loader2 className="mx-auto mt-12 h-6 w-6 animate-spin" />
        ) : (
          <p className="mt-12 text-center text-muted-foreground">
            Periode tidak ditemukan.
          </p>
        )}
      </MainLayout>
    );
  }

  const waves = period.waves ?? [];
  const nextNumber = Math.max(0, ...waves.map((w) => w.waveNumber)) + 1;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            title={period.name}
            description={`${period.unit?.name ?? ""} · Tahun ajaran ${
              period.academicYear?.name ?? ""
            } · Pendaftaran ${formatDays(
              wibDay(period.startDate),
              wibDay(period.endDate),
            )}`}
          />
          <div className="flex gap-2">
            <Badge variant={period.isActive ? "default" : "secondary"}>
              {period.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
            {canManage && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/spmb/periods/${period.id}/edit`}
                  data-testid="period-edit"
                >
                  <Pencil className="mr-2 h-4 w-4" /> Ubah Periode
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Gelombang</CardTitle>
              <CardDescription>
                Tanggal tiap sesi dan potongan bila dibayar lunas, seperti di
                brosur.
              </CardDescription>
            </div>
            {canManage && (
              <Button
                size="sm"
                onClick={() => setEditing(null)}
                data-testid="wave-add"
              >
                <Plus className="mr-2 h-4 w-4" /> Tambah Gelombang
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gelombang</TableHead>
                  <TableHead>Pendaftaran</TableHead>
                  <TableHead>Tes</TableHead>
                  <TableHead>Pengumuman</TableHead>
                  <TableHead>Daftar ulang</TableHead>
                  <TableHead className="text-right">Potongan lunas</TableHead>
                  <TableHead className="text-right">Pendaftar</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {waves.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 9 : 8}
                      className="py-6 text-center text-muted-foreground"
                    >
                      Belum ada gelombang.
                    </TableCell>
                  </TableRow>
                ) : (
                  waves.map((w) => (
                    <TableRow key={w.id} data-testid="wave-row">
                      <TableCell className="font-medium">{w.name}</TableCell>
                      {/* The table's cells do not wrap by default; dates may,
                          so the row fits beside the menu on a laptop. */}
                      <TableCell className="whitespace-normal">
                        {formatDays(wibDay(w.startDate), wibDay(w.endDate))}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {session(w.testStartDate, w.testEndDate)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {session(w.resultsStartDate, w.resultsEndDate)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {session(
                          w.reRegistrationStartDate,
                          w.reRegistrationEndDate,
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(w.fullPaymentDiscount) || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.registeredCount}/{w.quota}
                      </TableCell>
                      <TableCell>{WAVE_STATUS_LABELS[w.status]}</TableCell>
                      {canManage && (
                        <TableCell className="whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ubah ${w.name}`}
                            onClick={() => setEditing(w)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Hapus ${w.name}`}
                            disabled={w.registeredCount > 0}
                            title={
                              w.registeredCount > 0
                                ? "Sudah ada pendaftar; tutup dengan mengubah statusnya"
                                : undefined
                            }
                            onClick={() => setRemoving(w)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Rincian biaya</CardTitle>
              <CardDescription>
                Yang dibayar saat masuk, untuk ikhwan dan akhwat, seperti tabel
                &quot;Rincian Biaya&quot; di brosur. Jumlahnya dihitung dari
                rinciannya.
              </CardDescription>
            </div>
            {canManage && !editingFees && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingFees(true)}
                data-testid="fee-edit"
              >
                <Pencil className="mr-2 h-4 w-4" /> Ubah Rincian Biaya
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editingFees ? (
              <FeeTableForm
                defaultValues={feeTableFormValues(period.feeItems ?? [])}
                isPending={replaceFees.isPending}
                onCancel={() => setEditingFees(false)}
                onSubmit={async (values) => {
                  try {
                    await replaceFees.mutateAsync(feeTablePayload(values));
                    toast.success("Rincian biaya tersimpan");
                    setEditingFees(false);
                  } catch (error) {
                    toast.error(getErrorMessage(error));
                  }
                }}
              />
            ) : (
              <FeeTableView items={period.feeItems ?? []} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Persyaratan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {period.requirements.length ? (
                <ol
                  className="list-decimal space-y-1 pl-5"
                  data-testid="period-requirements-list"
                >
                  {period.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground">Belum diisi.</p>
              )}
              {period.minAgeMonths !== null && (
                <p data-testid="period-min-age-text">
                  Usia minimal {formatAge(period.minAgeMonths)}
                  {period.ageReferenceDate
                    ? ` pada ${formatDays(calendarDay(period.ageReferenceDate))}`
                    : " pada hari mendaftar"}
                  .
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Narahubung dan biaya pendaftaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p data-testid="period-contact">
                {period.contactName || period.contactPhone
                  ? [period.contactName, period.contactPhone]
                      .filter(Boolean)
                      .join(" · ")
                  : "Narahubung belum diisi."}
              </p>
              <p>
                Biaya pendaftaran:{" "}
                {Number(period.registrationFee) > 0
                  ? formatRupiah(period.registrationFee)
                  : "tidak ada"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Ubah ${editing.name}` : "Tambah Gelombang"}
            </DialogTitle>
          </DialogHeader>
          {editing !== undefined && (
            <WaveForm
              key={editing?.id ?? "new"}
              defaultValues={waveFormValues(editing ?? undefined, nextNumber)}
              isNew={!editing}
              isPending={createWave.isPending || updateWave.isPending}
              onCancel={() => setEditing(undefined)}
              onSubmit={async (values) => {
                try {
                  const input = wavePayload(values, !editing);
                  if (editing) {
                    await updateWave.mutateAsync({ id: editing.id, input });
                  } else {
                    await createWave.mutateAsync({
                      periodId: period.id,
                      ...input,
                      registrationFee: undefined,
                      notes: input.notes ?? undefined,
                    });
                  }
                  toast.success("Gelombang tersimpan");
                  setEditing(undefined);
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Gelombang ini belum punya pendaftar. Tanggal dan potongannya ikut
              terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!removing) return;
                try {
                  await deleteWave.mutateAsync(removing.id);
                  toast.success("Gelombang dihapus");
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
                setRemoving(null);
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
