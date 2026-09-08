"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Plus, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Pagination, ConfirmDialog } from "@/components/shared";
import { toast } from "sonner";
import {
  usePermits,
  useApprovePermit,
  useRejectPermit,
  useMarkReturned,
  PERMIT_TYPES,
  PERMIT_STATUSES,
  PermitType,
  PermitStatus,
  Permit,
} from "@/hooks/use-permits";

function PermitsPageContent() {
  const [page, setPage] = useState(1);
  const [permitType, setPermitType] = useState<PermitType | "">("");
  const [status, setStatus] = useState<PermitStatus | "">("");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const limit = 20;

  const { data: permitsData, isLoading } = usePermits({
    page,
    limit,
    permitType: permitType || undefined,
    status: status || undefined,
  });

  const approveMutation = useApprovePermit();
  const rejectMutation = useRejectPermit();
  const returnMutation = useMarkReturned();

  const handleApprove = async () => {
    if (!approveId) return;
    try {
      await approveMutation.mutateAsync(approveId);
      toast.success("Izin berhasil disetujui");
      setApproveId(null);
    } catch {
      toast.error("Gagal menyetujui izin");
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason) {
      toast.error("Alasan penolakan wajib diisi");
      return;
    }
    try {
      await rejectMutation.mutateAsync({ id: rejectId, reason: rejectReason });
      toast.success("Izin berhasil ditolak");
      setRejectId(null);
      setRejectReason("");
    } catch {
      toast.error("Gagal menolak izin");
    }
  };

  const handleMarkReturned = async () => {
    if (!returnId) return;
    try {
      await returnMutation.mutateAsync(returnId);
      toast.success("Santri berhasil ditandai sudah kembali");
      setReturnId(null);
    } catch {
      toast.error("Gagal menandai kembali");
    }
  };

  const getStatusBadge = (permitStatus: PermitStatus) => {
    const statusInfo = PERMIT_STATUSES.find((s) => s.value === permitStatus);
    return statusInfo ? (
      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
    ) : (
      <Badge variant="secondary">{permitStatus}</Badge>
    );
  };

  // Count pending permits
  const pendingCount =
    permitsData?.data.filter((p) => p.status === "PENDING").length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Perizinan</h1>
          <p className="text-muted-foreground">Kelola izin keluar santri</p>
        </div>
        <Button asChild>
          <Link href="/permits/new">
            <Plus className="mr-2 h-4 w-4" />
            Buat Izin
          </Link>
        </Button>
      </div>

      {/* Stats */}
      {pendingCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-center gap-4 py-4">
            <CalendarClock className="h-8 w-8 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">
                {pendingCount} izin menunggu persetujuan
              </p>
              <p className="text-sm text-yellow-600">
                Segera proses izin yang tertunda
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select
              value={permitType || "ALL"}
              onValueChange={(v) =>
                setPermitType(v === "ALL" ? "" : (v as PermitType))
              }
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Jenis Izin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Jenis</SelectItem>
                {PERMIT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status || "ALL"}
              onValueChange={(v) =>
                setStatus(v === "ALL" ? "" : (v as PermitStatus))
              }
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                {PERMIT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(permitType || status) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPermitType("");
                  setStatus("");
                }}
              >
                Reset Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Permits Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : permitsData?.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CalendarClock className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">
                Tidak ada data izin
              </h3>
              <p className="text-muted-foreground">
                Belum ada izin untuk filter yang dipilih
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Santri</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permitsData?.data.map((permit: Permit) => (
                    <TableRow key={permit.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{permit.student?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {permit.student?.nisn}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {PERMIT_TYPES.find((t) => t.value === permit.permitType)
                          ?.label || permit.permitType}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {permit.reason}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>
                            {new Date(permit.startDate).toLocaleDateString(
                              "id-ID",
                            )}
                          </p>
                          <p className="text-muted-foreground">
                            s/d{" "}
                            {new Date(permit.endDate).toLocaleDateString(
                              "id-ID",
                            )}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(permit.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {permit.status === "PENDING" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600"
                                onClick={() => setApproveId(permit.id)}
                              >
                                <Check className="mr-1 h-4 w-4" />
                                Setuju
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => setRejectId(permit.id)}
                              >
                                <X className="mr-1 h-4 w-4" />
                                Tolak
                              </Button>
                            </>
                          )}
                          {permit.status === "APPROVED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReturnId(permit.id)}
                            >
                              <RotateCcw className="mr-1 h-4 w-4" />
                              Kembali
                            </Button>
                          )}
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/permits/${permit.id}`}>Detail</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {permitsData && permitsData.meta.totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={permitsData.meta.totalPages}
                  pageSize={limit}
                  total={permitsData.meta.total}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <ConfirmDialog
        open={!!approveId}
        onOpenChange={(open: boolean) => !open && setApproveId(null)}
        title="Setujui Izin"
        description="Apakah Anda yakin ingin menyetujui izin ini? Sistem akan otomatis membuat data absensi (Izin/Sakit) untuk santri selama periode izin."
        confirmLabel="Setujui"
        onConfirm={handleApprove}
        isLoading={approveMutation.isPending}
      />

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectId}
        onOpenChange={(open) => !open && setRejectId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Izin</DialogTitle>
            <DialogDescription>
              Berikan alasan penolakan izin ini
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Alasan Penolakan</Label>
              <Textarea
                id="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Masukkan alasan penolakan..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectId(null)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectMutation.isPending || !rejectReason}
              >
                {rejectMutation.isPending ? "Menolak..." : "Tolak"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <ConfirmDialog
        open={!!returnId}
        onOpenChange={(open: boolean) => !open && setReturnId(null)}
        title="Tandai Sudah Kembali"
        description="Apakah santri sudah kembali ke pondok?"
        confirmLabel="Ya, Sudah Kembali"
        onConfirm={handleMarkReturned}
        isLoading={returnMutation.isPending}
      />
    </div>
  );
}

export default function PermitsPageWithShell() {
  return (
    <MainLayout>
      <PermitsPageContent />
    </MainLayout>
  );
}
