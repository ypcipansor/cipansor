"use client";
import { useParams, useRouter } from "next/navigation";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  Calendar,
  Phone,
  MapPin,
  User,
  Edit,
  Trash2,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  usePermit,
  useDeletePermit,
  useApprovePermit,
  useRejectPermit,
  PERMIT_TYPES,
  PERMIT_STATUSES,
} from "@/hooks/use-permits";

function getStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "PENDING":
      return "secondary";
    case "REJECTED":
      return "destructive";
    default:
      return "outline";
  }
}

function getStatusLabel(status: string): string {
  return PERMIT_STATUSES.find((s) => s.value === status)?.label || status;
}

function getTypeLabel(type: string): string {
  return PERMIT_TYPES.find((t) => t.value === type)?.label || type;
}

function PermitDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const permitId = params.id as string;

  const { data: permit, isLoading, error } = usePermit(permitId);
  const deleteMutation = useDeletePermit();
  const approveMutation = useApprovePermit();
  const rejectMutation = useRejectPermit();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(permitId);
      toast.success("Izin berhasil dihapus");
      router.push("/permits");
    } catch {
      toast.error("Gagal menghapus izin");
    }
  };

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync(permitId);
      toast.success("Izin berhasil disetujui");
    } catch {
      toast.error("Gagal menyetujui izin");
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({
        id: permitId,
        reason: "Ditolak oleh admin",
      });
      toast.success("Izin berhasil ditolak");
    } catch {
      toast.error("Gagal menolak izin");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  if (error || !permit) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Izin tidak ditemukan</p>
        <Button asChild className="mt-4">
          <Link href="/permits">Kembali ke Daftar</Link>
        </Button>
      </div>
    );
  }

  const isPending = permit.status === "PENDING";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/permits">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Detail Izin</h1>
              <Badge variant={getStatusVariant(permit.status)}>
                {getStatusLabel(permit.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {getTypeLabel(permit.permitType)} - {permit.student?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPending && (
            <>
              <Button
                variant="outline"
                className="text-green-600 hover:text-green-700"
                onClick={handleApprove}
                disabled={approveMutation.isPending}
              >
                <Check className="mr-2 h-4 w-4" />
                Setujui
              </Button>
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                Tolak
              </Button>
            </>
          )}
          {isPending && (
            <Button variant="outline" asChild>
              <Link href={`/permits/${permitId}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          <ConfirmDialog
            title="Hapus Izin"
            description="Apakah Anda yakin ingin menghapus izin ini? Tindakan ini tidak dapat dibatalkan."
            onConfirm={handleDelete}
            loading={deleteMutation.isPending}
          >
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </Button>
          </ConfirmDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Permit Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informasi Izin</CardTitle>
            <CardDescription>Detail perizinan santri</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jenis Izin</p>
                <p className="font-medium">{getTypeLabel(permit.permitType)}</p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tanggal</p>
                <p className="font-medium">
                  {safeFormat(new Date(permit.startDate), "dd MMMM yyyy", {
                    locale: localeId,
                  })}{" "}
                  -{" "}
                  {safeFormat(new Date(permit.endDate), "dd MMMM yyyy", {
                    locale: localeId,
                  })}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Alasan</p>
              <p className="mt-1">{permit.reason}</p>
            </div>

            {permit.destination && (
              <>
                <Separator />
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tujuan</p>
                    <p className="font-medium">{permit.destination}</p>
                  </div>
                </div>
              </>
            )}

            {permit.parentPhone && (
              <>
                <Separator />
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      No. HP Penjemput
                    </p>
                    <p className="font-medium">{permit.parentPhone}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Student Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informasi Santri</CardTitle>
            <CardDescription>Data santri yang mengajukan izin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nama</p>
                <p className="font-medium">{permit.student?.name}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">NISN</p>
                <p className="font-medium">{permit.student?.nisn}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kelas</p>
                <p className="font-medium">
                  {permit.student?.class?.name || "-"}
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Unit</p>
                <p className="font-medium">
                  {permit.student?.unit?.name || "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jenis Kelamin</p>
                <p className="font-medium">
                  {permit.student?.gender === "MALE"
                    ? "Laki-laki"
                    : "Perempuan"}
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button variant="outline" asChild>
                <Link href={`/students/${permit.studentId}`}>
                  Lihat Profil Santri
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline / History */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
          <CardDescription>Timeline perizinan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="h-full w-px bg-border" />
              </div>
              <div className="pb-4">
                <p className="font-medium">Izin Dibuat</p>
                <p className="text-sm text-muted-foreground">
                  {safeFormat(
                    new Date(permit.createdAt),
                    "dd MMMM yyyy HH:mm",
                    {
                      locale: localeId,
                    },
                  )}
                </p>
              </div>
            </div>

            {permit.status !== "PENDING" && (
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      permit.status === "APPROVED"
                        ? "bg-green-500 text-white"
                        : "bg-red-500 text-white"
                    }`}
                  >
                    {permit.status === "APPROVED" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-medium">
                    {permit.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {safeFormat(
                      new Date(permit.updatedAt),
                      "dd MMMM yyyy HH:mm",
                      {
                        locale: localeId,
                      },
                    )}
                  </p>
                  {permit.approver && (
                    <p className="text-sm text-muted-foreground">
                      Oleh: {permit.approver.name}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PermitDetailPage() {
  return (
    <MainLayout>
      <PermitDetailPageContent />
    </MainLayout>
  );
}
