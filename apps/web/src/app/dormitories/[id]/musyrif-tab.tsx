"use client";

import { useState } from "react";
import { UserCheck, UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";
import {
  MUSYRIF_ASSIGNER_ROLE_CODES,
  MUSYRIF_DUTY_VALUES,
  type MusyrifDuty,
} from "@cipansor/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getActiveRoleCode } from "@/lib/rbac";
import { useAuthStore } from "@/stores/auth";
import {
  MUSYRIF_DUTY_LABELS,
  useAssignMusyrif,
  useDormitoryMusyrif,
  useEndMusyrifAssignment,
  useMusyrifCandidates,
  type Room,
} from "@/hooks/use-dormitory";

const WHOLE_ASRAMA = "ALL";

/**
 * Who looks after this asrama and its kamar. A santri mukim's musyrif is the
 * one assigned to their kamar, or to the whole asrama: that musyrif decides
 * their leave and sees them under "Santri saya".
 */
export function MusyrifTab({
  dormitoryId,
  rooms,
}: {
  dormitoryId: string;
  rooms: Room[];
}) {
  const user = useAuthStore((s) => s.user);
  const canAssign = MUSYRIF_ASSIGNER_ROLE_CODES.includes(
    getActiveRoleCode(user) ?? "",
  );
  const { data: assignments, isLoading } = useDormitoryMusyrif(dormitoryId);
  const end = useEndMusyrifAssignment(dormitoryId);
  const [open, setOpen] = useState(false);

  const handleEnd = async (assignmentId: string) => {
    try {
      await end.mutateAsync(assignmentId);
      toast.success("Penugasan diakhiri");
    } catch {
      // The API client has already shown the server's message.
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Musyrif</CardTitle>
          <CardDescription>
            Musyrif memutuskan izin santri di kamar yang ia asuh dan melihat
            mereka di &quot;Santri saya&quot;. Tanpa kamar berarti seluruh
            asrama.
          </CardDescription>
        </div>
        {canAssign && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Tugaskan musyrif
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-24" />
          </div>
        ) : !assignments?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <UserCheck className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">Belum ada musyrif ditugaskan</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Sampai ada musyrif yang ditugaskan, izin santri asrama ini
              diputuskan kepala unit.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Cakupan</TableHead>
                <TableHead>Tugas</TableHead>
                <TableHead>Sejak</TableHead>
                {canAssign && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.user.name}</TableCell>
                  <TableCell>{a.room?.name ?? "Seluruh asrama"}</TableCell>
                  <TableCell>{MUSYRIF_DUTY_LABELS[a.role]}</TableCell>
                  <TableCell>
                    {new Date(a.startDate).toLocaleDateString("id-ID")}
                  </TableCell>
                  {canAssign && (
                    <TableCell className="text-right">
                      <ConfirmDialog
                        title="Akhiri penugasan"
                        description={`${a.user.name} tidak lagi mengasuh ${
                          a.room?.name ?? "asrama ini"
                        }. Riwayat penugasannya tetap tersimpan.`}
                        confirmLabel="Akhiri"
                        variant="destructive"
                        onConfirm={() => handleEnd(a.id)}
                        loading={end.isPending}
                      >
                        <Button variant="ghost" size="sm">
                          <UserX className="mr-1 h-4 w-4" />
                          Akhiri
                        </Button>
                      </ConfirmDialog>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {canAssign && (
        <AssignDialog
          dormitoryId={dormitoryId}
          rooms={rooms}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </Card>
  );
}

function AssignDialog({
  dormitoryId,
  rooms,
  open,
  onOpenChange,
}: {
  dormitoryId: string;
  rooms: Room[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [scope, setScope] = useState(WHOLE_ASRAMA);
  const [role, setRole] = useState<MusyrifDuty>("PEMBINA");
  const { data: candidates = [], isLoading } = useMusyrifCandidates(
    dormitoryId,
    q.trim(),
    open,
  );
  const assign = useAssignMusyrif(dormitoryId);

  const reset = () => {
    setQ("");
    setUserId("");
    setScope(WHOLE_ASRAMA);
    setRole("PEMBINA");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    try {
      await assign.mutateAsync({
        userId,
        roomId: scope === WHOLE_ASRAMA ? null : scope,
        role,
      });
      toast.success("Musyrif ditugaskan");
      reset();
      onOpenChange(false);
    } catch {
      // The API client has already shown the server's message.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tugaskan musyrif</DialogTitle>
          <DialogDescription>
            Pilih ustadz, musyrif, muhafidz atau guru, dan kamar yang ia asuh.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="musyrif-search">Cari nama</Label>
            <Input
              id="musyrif-search"
              placeholder="Ketik nama…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setUserId("");
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="musyrif-person">Musyrif</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="musyrif-person">
                <SelectValue
                  placeholder={
                    isLoading
                      ? "Memuat…"
                      : candidates.length
                        ? "Pilih orang"
                        : "Tidak ada yang cocok"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="musyrif-scope">Cakupan</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="musyrif-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_ASRAMA}>Seluruh asrama</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="musyrif-role">Tugas</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as MusyrifDuty)}
              >
                <SelectTrigger id="musyrif-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUSYRIF_DUTY_VALUES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {MUSYRIF_DUTY_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={!userId || assign.isPending}>
              {assign.isPending ? "Menyimpan…" : "Tugaskan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
