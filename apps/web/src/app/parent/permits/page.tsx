"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Ban, Calendar, FileText, Plus, QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useParentChildren } from "@/hooks/use-parent-portal";
import {
  usePermits,
  useCreatePermit,
  useCancelPermit,
  localInputToIso,
  PERMIT_TYPES,
  PERMIT_TYPE_LABELS,
  PERMIT_PHASES,
  permitPhase,
  whoDecides,
  type PermitType,
} from "@/hooks/use-permits";

const EMPTY_FORM = {
  type: "" as PermitType | "",
  reason: "",
  startDate: "",
  endDate: "",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * A wali files leave for their child and follows it. The same /permits API
 * staff use, limited by the server to this wali's own children.
 */
export default function ParentPermitsPage() {
  const searchParams = useSearchParams();
  const { data: children = [] } = useParentChildren();
  const [chosen, setChosen] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const selectedChild =
    chosen ||
    children.find((c) => c.id === searchParams.get("studentId"))?.id ||
    children[0]?.id ||
    "";
  const child = children.find((c) => c.id === selectedChild);

  const { data, isLoading } = usePermits(
    { studentId: selectedChild, limit: 50 },
    !!selectedChild,
  );
  const permits = data?.data ?? [];
  const create = useCreatePermit();
  const cancel = useCancelPermit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChild || !form.type) return;
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      toast.error("Waktu kembali harus sesudah waktu berangkat");
      return;
    }
    try {
      await create.mutateAsync({
        studentId: selectedChild,
        type: form.type,
        reason: form.reason,
        startDate: localInputToIso(form.startDate),
        endDate: localInputToIso(form.endDate),
      });
      toast.success("Pengajuan izin terkirim");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    } catch {
      // The API client has already shown the server's message.
    }
  };

  const withdraw = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast.success("Pengajuan dibatalkan");
    } catch {
      // The API client has already shown the server's message.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Izin</h1>
          <p className="text-muted-foreground">
            Ajukan dan lihat riwayat izin anak
          </p>
        </div>
        <div className="flex items-center gap-4">
          {children.length > 1 && (
            <Select value={selectedChild} onValueChange={setChosen}>
              <SelectTrigger className="w-[200px]" aria-label="Pilih anak">
                <SelectValue placeholder="Pilih anak" />
              </SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!selectedChild}>
                <Plus className="h-4 w-4" />
                Ajukan Izin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajukan Izin</DialogTitle>
                <DialogDescription>
                  Ajukan izin untuk {child?.name}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={submit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Jenis izin</Label>
                    <Select
                      value={form.type}
                      onValueChange={(v) =>
                        setForm({ ...form, type: v as PermitType })
                      }
                    >
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Pilih jenis izin" />
                      </SelectTrigger>
                      <SelectContent>
                        {PERMIT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Berangkat</Label>
                      <Input
                        id="startDate"
                        type="datetime-local"
                        value={form.startDate}
                        onChange={(e) =>
                          setForm({ ...form, startDate: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">Kembali</Label>
                      <Input
                        id="endDate"
                        type="datetime-local"
                        value={form.endDate}
                        min={form.startDate || undefined}
                        onChange={(e) =>
                          setForm({ ...form, endDate: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Alasan</Label>
                    <Textarea
                      id="reason"
                      placeholder="Jelaskan alasan izin (minimal 10 karakter)…"
                      value={form.reason}
                      onChange={(e) =>
                        setForm({ ...form, reason: e.target.value })
                      }
                      rows={4}
                      required
                      minLength={10}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      create.isPending ||
                      !form.type ||
                      form.reason.trim().length < 10
                    }
                  >
                    {create.isPending ? "Mengirim…" : "Kirim Pengajuan"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading || !selectedChild ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : permits.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Belum ada izin</h3>
            <p className="mt-2 text-muted-foreground">
              Belum ada izin untuk {child?.name ?? "anak ini"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {permits.map((permit) => {
            const phase = PERMIT_PHASES[permitPhase(permit)];
            return (
              <Card key={permit.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {PERMIT_TYPE_LABELS[permit.type]}
                          </p>
                          <Badge className={phase.className}>
                            {phase.label}
                          </Badge>
                        </div>
                        {permit.code && permit.status === "APPROVED" && (
                          <div className="flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-xs">
                            <QrCode className="h-3 w-3" />
                            {permit.code}
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {permit.reason}
                      </p>
                      <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {when(permit.startDate)} – {when(permit.endDate)}
                        </span>
                      </div>
                      {permit.rejectionNote && (
                        <p className="mt-2 text-sm">
                          <span className="text-muted-foreground">
                            Alasan penolakan:
                          </span>{" "}
                          {permit.rejectionNote}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 text-sm md:text-right">
                      <p className="text-muted-foreground">
                        Diajukan{" "}
                        {new Date(permit.createdAt).toLocaleDateString("id-ID")}
                      </p>
                      {permit.approvedBy && (
                        <p className="text-muted-foreground">
                          {permit.status === "REJECTED"
                            ? "Ditolak"
                            : "Disetujui"}{" "}
                          oleh{" "}
                          <span className="font-medium">
                            {permit.approvedBy.name}
                          </span>
                        </p>
                      )}
                      {permit.status === "PENDING" && (
                        <p className="text-muted-foreground">
                          Diputuskan oleh{" "}
                          <span className="font-medium">
                            {whoDecides(permit.decision)}
                          </span>
                        </p>
                      )}
                      {permit.status === "PENDING" && (
                        <ConfirmDialog
                          title="Batalkan pengajuan"
                          description="Pengajuan izin ini ditarik."
                          confirmLabel="Batalkan pengajuan"
                          variant="destructive"
                          onConfirm={() => withdraw(permit.id)}
                          loading={cancel.isPending}
                        >
                          <Button variant="outline" size="sm">
                            <Ban className="mr-1 h-4 w-4" />
                            Batalkan
                          </Button>
                        </ConfirmDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
