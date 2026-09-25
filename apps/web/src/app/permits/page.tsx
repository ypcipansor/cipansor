"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Plus, Check, X, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Pagination, ConfirmDialog } from "@/components/shared";
import { toast } from "sonner";
import {
  usePermits,
  usePermitSummary,
  usePermitAbilities,
  useApprovePermit,
  PERMIT_TYPES,
  PERMIT_TYPE_LABELS,
  PERMIT_STATUS_FILTERS,
  PERMIT_PHASES,
  PERMIT_DECIDER_LABELS,
  permitPhase,
  whoDecides,
  type Permit,
  type PermitStatus,
  type PermitType,
} from "@/hooks/use-permits";
import { RejectPermitDialog } from "./reject-permit-dialog";

/** Under the status: who decides it, or who did and in what capacity. */
function decidedLine(permit: Permit): string | null {
  if (permit.status === "PENDING") return whoDecides(permit.decision);
  if (!permit.approvedBy) return null;
  const as = permit.decidedAs
    ? ` (${PERMIT_DECIDER_LABELS[permit.decidedAs]}${permit.tookOver ? ", ambil alih" : ""})`
    : "";
  return `${permit.approvedBy.name}${as}`;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function PermitsPageContent() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<PermitType | "">("");
  const [status, setStatus] = useState<PermitStatus | "">("");
  const [outside, setOutside] = useState(false);
  const [mine, setMine] = useState(false);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const limit = 20;

  const { isStaff, mayDecideSome } = usePermitAbilities();
  const { data: permitsData, isLoading } = usePermits({
    page,
    limit,
    type: type || undefined,
    status: status || undefined,
    outside: outside ? "true" : undefined,
    awaitingMe: mine ? "true" : undefined,
  });
  const { data: summary } = usePermitSummary(isStaff);
  const approveMutation = useApprovePermit();

  const handleApprove = async () => {
    if (!approveId) return;
    try {
      await approveMutation.mutateAsync(approveId);
      toast.success("Izin disetujui");
      setApproveId(null);
    } catch {
      // The API client has already shown the server's message.
    }
  };

  const filtered = !!(type || status || outside || mine);
  const permits = permitsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Perizinan</h1>
          <p className="text-muted-foreground">
            Izin pulang, keluar sementara, dan sakit
          </p>
        </div>
        <div className="flex gap-2">
          {isStaff && (
            <Button variant="outline" asChild>
              <Link href="/permits/gate">
                <ScanLine className="mr-2 h-4 w-4" />
                Pos gerbang
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/permits/new">
              <Plus className="mr-2 h-4 w-4" />
              Ajukan Izin
            </Link>
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(
            [
              mayDecideSome
                ? ["Menunggu keputusan Anda", summary.awaitingMe]
                : ["Menunggu keputusan", summary.pending],
              ["Disetujui, belum berangkat", summary.approved],
              ["Sedang di luar", summary.outside],
              ["Terlambat kembali", summary.overdue],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select
              value={type || "ALL"}
              onValueChange={(v) => {
                setType(v === "ALL" ? "" : (v as PermitType));
                setPage(1);
              }}
            >
              <SelectTrigger
                className="w-full sm:w-[200px]"
                aria-label="Jenis izin"
              >
                <SelectValue placeholder="Jenis izin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua jenis</SelectItem>
                {PERMIT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status || "ALL"}
              onValueChange={(v) => {
                setStatus(v === "ALL" ? "" : (v as PermitStatus));
                setPage(1);
              }}
            >
              <SelectTrigger
                className="w-full sm:w-[180px]"
                aria-label="Status izin"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status</SelectItem>
                {PERMIT_STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {mayDecideSome && (
              <Button
                variant={mine ? "default" : "outline"}
                onClick={() => {
                  setMine(!mine);
                  setPage(1);
                }}
              >
                Perlu keputusan saya
              </Button>
            )}

            <Button
              variant={outside ? "default" : "outline"}
              onClick={() => {
                setOutside(!outside);
                setPage(1);
              }}
            >
              Sedang di luar
            </Button>

            {filtered && (
              <Button
                variant="ghost"
                onClick={() => {
                  setType("");
                  setStatus("");
                  setOutside(false);
                  setMine(false);
                  setPage(1);
                }}
              >
                Reset filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : permits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CalendarClock className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Tidak ada izin</h3>
              <p className="text-muted-foreground">
                {mine
                  ? "Tidak ada izin yang menunggu keputusan Anda"
                  : filtered
                    ? "Tidak ada izin untuk filter yang dipilih"
                    : "Belum ada izin yang diajukan"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permits.map((permit) => {
                    const phase = PERMIT_PHASES[permitPhase(permit)];
                    const decided = decidedLine(permit);
                    // A head's takeover is made on the permit's own page,
                    // where it says whose decision it was; not from a list.
                    const decidesHere =
                      permit.decision.canDecide && !permit.decision.asTakeover;
                    return (
                      <TableRow key={permit.id}>
                        <TableCell>
                          <p className="font-medium">
                            {permit.student.user.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {permit.student.nis} · {permit.student.unit.name}
                          </p>
                        </TableCell>
                        <TableCell>{PERMIT_TYPE_LABELS[permit.type]}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {permit.reason}
                        </TableCell>
                        <TableCell className="text-sm">
                          <p>{formatDateTime(permit.startDate)}</p>
                          <p className="text-muted-foreground">
                            s/d {formatDateTime(permit.endDate)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge className={phase.className}>
                            {phase.label}
                          </Badge>
                          {decided && (
                            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                              {decided}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {decidesHere && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600"
                                  onClick={() => setApproveId(permit.id)}
                                >
                                  <Check className="mr-1 h-4 w-4" />
                                  Setujui
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
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/permits/${permit.id}`}>Detail</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {permitsData && permitsData.pagination.totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={permitsData.pagination.totalPages}
                  pageSize={limit}
                  total={permitsData.pagination.total}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!approveId}
        onOpenChange={(open: boolean) => !open && setApproveId(null)}
        title="Setujui izin"
        description="Presensi kelas pada hari-hari izin ini akan dicatat Izin (atau Sakit untuk izin sakit), dan wali diberi tahu."
        confirmLabel="Setujui"
        onConfirm={handleApprove}
        isLoading={approveMutation.isPending}
      />

      <RejectPermitDialog
        permitId={rejectId}
        onClose={() => setRejectId(null)}
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
