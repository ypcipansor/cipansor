"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import {
  useStudentVisits,
  useCreateStudentVisit,
  useUpdateStudentVisit,
  StudentVisit,
} from "@/hooks/use-reception";
import { useStudents } from "@/hooks/use-students";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { format } from "date-fns";
import { toast } from "sonner";
import { CreateStudentVisitInput, VisitStatus } from "@cipansor/shared";
import { Loader2, Plus, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";

export default function StudentVisitPage() {
  const [date, setDate] = useState<Date>(new Date());
  const { data: visits, isLoading } = useStudentVisits({
    date: date.toISOString(),
  });
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Kunjungan Santri</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={format(date, "yyyy-MM-dd")}
            onChange={(e) => setDate(new Date(e.target.value))}
            className="w-auto"
          />
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Catat Kunjungan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Catat Kunjungan Santri</DialogTitle>
              </DialogHeader>
              <VisitForm onSuccess={() => setIsOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Santri</TableHead>
              <TableHead>Wali Santri</TableHead>
              <TableHead>Keperluan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : visits?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center h-24 text-muted-foreground"
                >
                  Belum ada kunjungan hari ini
                </TableCell>
              </TableRow>
            ) : (
              visits?.map((visit) => <VisitRow key={visit.id} visit={visit} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function VisitForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateStudentVisitInput>();
  const createVisit = useCreateStudentVisit();
  const { data: studentsData } = useStudents({
    page: 1,
    limit: 100,
    status: "active",
  }); // Simplified for demo

  // Transform students for SearchableSelect
  const studentOptions =
    studentsData?.data?.map((s) => ({
      value: s.id,
      label: `${s.name} (${s.nisn})`,
    })) || [];

  const onSubmit = async (data: CreateStudentVisitInput) => {
    try {
      await createVisit.mutateAsync(data);
      toast.success("Kunjungan berhasil dicatat");
      onSuccess();
    } catch (_error) {
      // Handled by mutation
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-2">
        <Label>Santri</Label>
        <Controller
          control={control}
          name="studentId"
          rules={{ required: true }}
          render={({ field }) => (
            <SearchableSelect
              options={studentOptions}
              value={field.value}
              onValueChange={field.onChange}
              placeholder="Pilih santri..."
            />
          )}
        />
        {errors.studentId && (
          <span className="text-xs text-red-500">Wajib dipilih</span>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="visitorName">Nama Pengunjung (Wali)</Label>
        <Input
          id="visitorName"
          {...register("visitorName", { required: true })}
        />
        {errors.visitorName && (
          <span className="text-xs text-red-500">Wajib diisi</span>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="relationship">Hubungan</Label>
        <Controller
          control={control}
          name="relationship"
          rules={{ required: true }}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih hubungan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AYAH">Ayah</SelectItem>
                <SelectItem value="IBU">Ibu</SelectItem>
                <SelectItem value="WALI">Wali</SelectItem>
                <SelectItem value="SAUDARA">Saudara</SelectItem>
                <SelectItem value="LAINNYA">Lainnya</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="needs">Keperluan</Label>
        <Textarea id="needs" {...register("needs", { required: true })} />
        {errors.needs && (
          <span className="text-xs text-red-500">Wajib diisi</span>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={createVisit.isPending}>
        {createVisit.isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Simpan
      </Button>
    </form>
  );
}

function VisitRow({ visit }: { visit: StudentVisit }) {
  const updateVisit = useUpdateStudentVisit();

  const handleStatusChange = async (status: VisitStatus) => {
    try {
      await updateVisit.mutateAsync({
        id: visit.id,
        data: { status },
      });
      toast.success(`Status diubah menjadi ${status}`);
    } catch (_error) {
      // Handled
    }
  };

  const getStatusBadge = (status: VisitStatus) => {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-green-600">Disetujui</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Ditolak</Badge>;
      case "COMPLETED":
        return <Badge variant="outline">Selesai</Badge>;
      default:
        return <Badge variant="secondary">Menunggu</Badge>;
    }
  };

  return (
    <TableRow>
      <TableCell>{safeFormat(new Date(visit.createdAt), "HH:mm")}</TableCell>
      <TableCell>
        <div className="font-medium">{visit.student?.name}</div>
        <div className="text-xs text-muted-foreground">
          {visit.student?.nisn}
        </div>
      </TableCell>
      <TableCell>
        <div className="font-medium">{visit.visitorName}</div>
        <div className="text-xs text-muted-foreground">
          {visit.relationship}
        </div>
      </TableCell>
      <TableCell>{visit.needs}</TableCell>
      <TableCell>{getStatusBadge(visit.status)}</TableCell>
      <TableCell>
        {visit.status === "PENDING" && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => handleStatusChange(VisitStatus.APPROVED)}
              title="Setujui"
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => handleStatusChange(VisitStatus.REJECTED)}
              title="Tolak"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}
        {visit.status === "APPROVED" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange(VisitStatus.COMPLETED)}
          >
            Selesaikan
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
