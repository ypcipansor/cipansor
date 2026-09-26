"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  Calendar,
  MapPin,
  User,
  Edit,
  Ban,
  LogOut,
  LogIn,
  UserCheck,
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
  useApprovePermit,
  useCancelPermit,
  PERMIT_DECIDER_LABELS,
  PERMIT_TYPE_LABELS,
  PERMIT_PHASES,
  permitPhase,
  whoDecides,
  type Permit,
} from "@/hooks/use-permits";
import { RejectPermitDialog } from "../reject-permit-dialog";

/** "Oleh X sebagai musyrif", with the takeover said out loud. */
function byWhom(permit: Permit): string {
  if (!permit.approvedBy) return "";
  const as = permit.decidedAs
    ? ` sebagai ${PERMIT_DECIDER_LABELS[permit.decidedAs]}`
    : "";
  const mentor =
    permit.decision.mentorKind === "MUSYRIF" ? "musyrif" : "wali kelas";
  const over = permit.tookOver ? `, mengambil alih keputusan ${mentor}` : "";
  return `Oleh ${permit.approvedBy.name}${as}${over}`;
}

const when = (iso: string) =>
  safeFormat(new Date(iso), "dd MMMM yyyy HH:mm", { locale: localeId });

function TimelineStep({
  icon,
  title,
  at,
  detail,
  tone = "bg-primary text-primary-foreground",
}: {
  icon: React.ReactNode;
  title: string;
  at: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="flex gap-4">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        {icon}
      </div>
      <div className="pb-4">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{at}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function PermitDetailPageContent() {
  const params = useParams();
  const permitId = params.id as string;
  const [rejecting, setRejecting] = useState(false);

  const { data: permit, isLoading, error } = usePermit(permitId);
  const approveMutation = useApprovePermit();
  const cancelMutation = useCancelPermit();

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync(permitId);
      toast.success("Izin disetujui");
    } catch {
      // The API client has already shown the server's message.
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(permitId);
      toast.success("Izin dibatalkan");
    } catch {
      // The API client has already shown the server's message.
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
          <Link href="/permits">Kembali ke daftar</Link>
        </Button>
      </div>
    );
  }

  const isPending = permit.status === "PENDING";
  const phase = PERMIT_PHASES[permitPhase(permit)];
  const { canDecide, asTakeover } = permit.decision;
  const mentor =
    permit.decision.mentorKind === "MUSYRIF" ? "musyrif" : "wali kelas";
  const takeoverNote = `Izin ini keputusan ${mentor} santri (${permit.decision.mentors
    .map((m) => m.name)
    .join(
      ", ",
    )}). Anda memutuskannya sebagai kepala unit: tercatat sebagai ambil alih, dan ${mentor}nya diberi tahu.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/permits" aria-label="Kembali ke daftar izin">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Detail Izin</h1>
              <Badge className={phase.className}>{phase.label}</Badge>
            </div>
            <p className="text-muted-foreground">
              {PERMIT_TYPE_LABELS[permit.type]} · {permit.student.user.name}
              {permit.code && ` · ${permit.code}`}
            </p>
          </div>
        </div>

        {isPending && (
          <div className="flex flex-wrap items-center gap-2">
            {canDecide && !asTakeover && (
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
                  onClick={() => setRejecting(true)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Tolak
                </Button>
              </>
            )}
            {canDecide && asTakeover && (
              <>
                <ConfirmDialog
                  title="Setujui sebagai kepala unit"
                  description={takeoverNote}
                  confirmLabel="Setujui (ambil alih)"
                  onConfirm={handleApprove}
                  loading={approveMutation.isPending}
                >
                  <Button
                    variant="outline"
                    className="text-green-600 hover:text-green-700"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Setujui (ambil alih)
                  </Button>
                </ConfirmDialog>
                <ConfirmDialog
                  title="Tolak sebagai kepala unit"
                  description={takeoverNote}
                  confirmLabel="Lanjut menolak"
                  variant="destructive"
                  onConfirm={() => setRejecting(true)}
                >
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Tolak (ambil alih)
                  </Button>
                </ConfirmDialog>
              </>
            )}
            <Button variant="outline" asChild>
              <Link href={`/permits/${permitId}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Ubah
              </Link>
            </Button>
            <ConfirmDialog
              title="Batalkan izin"
              description="Pengajuan ini ditarik dan tidak dapat disetujui lagi. Riwayatnya tetap tersimpan."
              confirmLabel="Batalkan izin"
              variant="destructive"
              onConfirm={handleCancel}
              loading={cancelMutation.isPending}
            >
              <Button variant="destructive">
                <Ban className="mr-2 h-4 w-4" />
                Batalkan
              </Button>
            </ConfirmDialog>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informasi Izin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jenis izin</p>
                <p className="font-medium">{PERMIT_TYPE_LABELS[permit.type]}</p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Waktu</p>
                <p className="font-medium">
                  {when(permit.startDate)} – {when(permit.endDate)}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground">Alasan</p>
              <p className="mt-1">{permit.reason}</p>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <UserCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {isPending ? "Diputuskan oleh" : "Keputusan"}
                </p>
                <p className="font-medium" data-testid="permit-decider">
                  {isPending
                    ? whoDecides(permit.decision)
                    : byWhom(permit) || "—"}
                </p>
              </div>
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

            {permit.rejectionNote && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Alasan penolakan
                  </p>
                  <p className="mt-1">{permit.rejectionNote}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nama</p>
                <p className="font-medium">{permit.student.user.name}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">NIS</p>
                <p className="font-medium">{permit.student.nis}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unit</p>
                <p className="font-medium">{permit.student.unit.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
          <CardDescription>Perjalanan izin ini</CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineStep
            icon={<Clock className="h-4 w-4" />}
            title="Diajukan"
            at={when(permit.createdAt)}
          />
          {permit.status === "APPROVED" || permit.status === "COMPLETED" ? (
            <TimelineStep
              icon={<Check className="h-4 w-4" />}
              title="Disetujui"
              at={permit.approvedAt ? when(permit.approvedAt) : "-"}
              detail={byWhom(permit)}
              tone="bg-green-500 text-white"
            />
          ) : permit.status === "REJECTED" ? (
            <TimelineStep
              icon={<X className="h-4 w-4" />}
              title="Ditolak"
              at={when(permit.updatedAt)}
              detail={byWhom(permit)}
              tone="bg-red-500 text-white"
            />
          ) : permit.status === "CANCELLED" ? (
            <TimelineStep
              icon={<Ban className="h-4 w-4" />}
              title="Dibatalkan"
              at={when(permit.updatedAt)}
              tone="bg-gray-500 text-white"
            />
          ) : null}
          {permit.departedAt && (
            <TimelineStep
              icon={<LogOut className="h-4 w-4" />}
              title="Berangkat"
              at={when(permit.departedAt)}
              tone="bg-orange-500 text-white"
            />
          )}
          {permit.returnedAt && (
            <TimelineStep
              icon={<LogIn className="h-4 w-4" />}
              title="Kembali"
              at={when(permit.returnedAt)}
              tone="bg-blue-500 text-white"
            />
          )}
        </CardContent>
      </Card>

      <RejectPermitDialog
        permitId={rejecting ? permitId : null}
        onClose={() => setRejecting(false)}
      />
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
