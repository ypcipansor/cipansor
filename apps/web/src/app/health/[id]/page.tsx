"use client";
import { use, useState } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useHealthRecord,
  useUpdateHealthRecord,
  useDeleteHealthRecord,
  HEALTH_RECORD_TYPES,
  HEALTH_STATUSES,
  HealthStatus,
} from "@/hooks/use-health";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Loader2,
  User,
  Calendar,
  Heart,
  Stethoscope,
  Pill,
  FileText,
  Activity,
  Clock,
  AlertCircle,
} from "lucide-react";

import { id } from "date-fns/locale";
import Link from "next/link";
import { toast } from "sonner";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function HealthDetailPage({ params }: PageProps) {
  const { id: recordId } = use(params);
  const router = useRouter();
  const [isUpdateStatusOpen, setIsUpdateStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<HealthStatus | "">("");
  const [statusNotes, setStatusNotes] = useState("");

  const { data: record, isLoading } = useHealthRecord(recordId);
  const updateRecord = useUpdateHealthRecord();
  const deleteRecord = useDeleteHealthRecord();

  const getStatusBadge = (status: HealthStatus) => {
    const statusInfo = HEALTH_STATUSES.find((s) => s.value === status);
    return (
      <Badge
        variant="outline"
        className={`${statusInfo?.color} text-sm px-3 py-1`}
      >
        {statusInfo?.label || status}
      </Badge>
    );
  };

  const getRecordTypeLabel = (type: string) => {
    return HEALTH_RECORD_TYPES.find((t) => t.value === type)?.label || type;
  };

  const handleUpdateStatus = async () => {
    if (!newStatus) return;
    try {
      await updateRecord.mutateAsync({
        id: recordId,
        data: {
          status: newStatus,
          notes: statusNotes
            ? `${record?.notes || ""}\n\n[${safeFormat(new Date(), "dd/MM/yyyy HH:mm")}] ${statusNotes}`
            : (record?.notes ?? undefined),
        },
      });
      toast.success("Status berhasil diperbarui");
      setIsUpdateStatusOpen(false);
      setNewStatus("");
      setStatusNotes("");
    } catch (error) {
      toast.error("Gagal memperbarui status");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRecord.mutateAsync(recordId);
      toast.success("Rekam kesehatan berhasil dihapus");
      router.push("/health");
    } catch (error) {
      toast.error("Gagal menghapus rekam kesehatan");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!record) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium">
            Rekam kesehatan tidak ditemukan
          </h2>
          <Button className="mt-4" onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Detail Rekam Kesehatan
              </h1>
              <p className="text-muted-foreground">
                {safeFormat(new Date(record.visitDate), "EEEE, dd MMMM yyyy", {
                  locale: id,
                })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog
              open={isUpdateStatusOpen}
              onOpenChange={setIsUpdateStatusOpen}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Activity className="mr-2 h-4 w-4" />
                  Update Status
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update Status Kesehatan</DialogTitle>
                  <DialogDescription>
                    Perbarui status kondisi kesehatan santri
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status Baru</label>
                    <Select
                      value={newStatus}
                      onValueChange={(v) => setNewStatus(v as HealthStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih status" />
                      </SelectTrigger>
                      <SelectContent>
                        {HEALTH_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Catatan (Opsional)
                    </label>
                    <Textarea
                      placeholder="Tambahkan catatan..."
                      value={statusNotes}
                      onChange={(e) => setStatusNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsUpdateStatusOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    onClick={handleUpdateStatus}
                    disabled={!newStatus || updateRecord.isPending}
                  >
                    {updateRecord.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Simpan
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" asChild>
              <Link href={`/health/${recordId}/edit`}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            <ConfirmDialog
              title="Hapus Rekam Kesehatan"
              description="Apakah Anda yakin ingin menghapus rekam kesehatan ini? Tindakan ini tidak dapat dibatalkan."
              onConfirm={handleDelete}
              loading={deleteRecord.isPending}
            >
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus
              </Button>
            </ConfirmDialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Student Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informasi Santri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    {record.student?.user?.name || record.student?.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {record.student?.nisn || record.student?.nik || "-"}
                  </p>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Unit</span>
                  <span>{record.student?.unit?.name ?? "-"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Health Record Info */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    Rekam Kesehatan
                  </CardTitle>
                  <CardDescription>
                    Jenis: {getRecordTypeLabel(record.type)}
                  </CardDescription>
                </div>
                {getStatusBadge(record.status || HealthStatus.HEALTHY)}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Symptoms */}
              {record.complaint && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    Keluhan / Gejala
                  </div>
                  <p className="text-sm bg-yellow-50 p-3 rounded-lg">
                    {record.complaint}
                  </p>
                </div>
              )}

              {/* Diagnosis */}
              {record.diagnosis && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Stethoscope className="h-4 w-4 text-blue-500" />
                    Diagnosis
                  </div>
                  <p className="text-sm bg-blue-50 p-3 rounded-lg">
                    {record.diagnosis}
                  </p>
                </div>
              )}

              {/* Treatment */}
              {record.treatment && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Pill className="h-4 w-4 text-green-500" />
                    Penanganan / Obat
                  </div>
                  <p className="text-sm bg-green-50 p-3 rounded-lg">
                    {record.treatment}
                  </p>
                </div>
              )}

              {/* Notes */}
              {record.notes && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Catatan
                  </div>
                  <p className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">
                    {record.notes}
                  </p>
                </div>
              )}

              <Separator />

              {/* Meta Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Tanggal Pemeriksaan
                  </p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {safeFormat(new Date(record.visitDate), "dd MMMM yyyy", {
                        locale: id,
                      })}
                    </span>
                  </div>
                </div>
                {record.followUpDate && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Jadwal Follow-Up
                    </p>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium text-yellow-600">
                        {safeFormat(
                          new Date(record.followUpDate),
                          "dd MMMM yyyy",
                          {
                            locale: id,
                          },
                        )}
                      </span>
                    </div>
                  </div>
                )}
                {record.referredTo && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Dirujuk ke</p>
                    <span className="font-medium">{record.referredTo}</span>
                  </div>
                )}
                {record.recordedBy && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Dicatat oleh
                    </p>
                    <span className="font-medium">
                      {record.recordedBy?.name ?? "-"}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Vital Signs if available */}
        {(record.temperature ||
          record.bloodPressure ||
          record.heartRate ||
          record.weight ||
          record.height) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Tanda Vital
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
                {record.temperature && (
                  <div className="p-4 bg-red-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Suhu Tubuh</p>
                    <p className="text-2xl font-bold text-red-600">
                      {record.temperature}°C
                    </p>
                  </div>
                )}
                {record.bloodPressure && (
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      Tekanan Darah
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      {record.bloodPressure}
                    </p>
                  </div>
                )}
                {record.heartRate && (
                  <div className="p-4 bg-pink-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      Detak Jantung
                    </p>
                    <p className="text-2xl font-bold text-pink-600">
                      {record.heartRate} bpm
                    </p>
                  </div>
                )}
                {record.weight && (
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">Berat Badan</p>
                    <p className="text-2xl font-bold text-green-600">
                      {record.weight} kg
                    </p>
                  </div>
                )}
                {record.height && (
                  <div className="p-4 bg-purple-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      Tinggi Badan
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {record.height} cm
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
