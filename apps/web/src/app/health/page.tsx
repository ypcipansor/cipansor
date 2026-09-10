"use client";
import { MainLayout } from "@/components/layout";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import {
  Plus,
  Search,
  Heart,
  Eye,
  Trash2,
  Filter,
  AlertCircle,
  Activity,
  CalendarClock,
  Thermometer,
  Bandage,
  Pill,
  Stethoscope,
  BedDouble,
  Check,
  ChevronsUpDown,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useHealthRecords,
  useDeleteHealthRecord,
  useHealthSummary,
  useCreateHealthRecord,
  HEALTH_RECORD_TYPES,
  HEALTH_STATUSES,
  HealthRecordType,
  HealthStatus,
} from "@/hooks/use-health";
import { useStudentSearch } from "@/hooks/use-students";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// --- COMPONENTS ---

function StatusBadge({ status }: { status: HealthStatus }) {
  const statusInfo = HEALTH_STATUSES.find((s) => s.value === status);
  return (
    <Badge variant="outline" className={statusInfo?.color}>
      {statusInfo?.label || status}
    </Badge>
  );
}

function QuickAdmitCard() {
  const [open, setOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: students, isLoading: isLoadingStudents } =
    useStudentSearch(searchQuery);
  const createMutation = useCreateHealthRecord();
  const [confirmComplaint, setConfirmComplaint] = useState<string | null>(null);
  const [createAttendance, setCreateAttendance] = useState(true);
  const [notifyParent, setNotifyParent] = useState(true);

  const commonAilments = [
    {
      label: "Demam",
      icon: Thermometer,
      color: "text-red-500 bg-red-50 border-red-200",
    },
    {
      label: "Flu / Batuk",
      icon: Activity,
      color: "text-blue-500 bg-blue-50 border-blue-200",
    },
    {
      label: "Sakit Kepala",
      icon: Activity,
      color: "text-orange-500 bg-orange-50 border-orange-200",
    },
    {
      label: "Luka Ringan",
      icon: Bandage,
      color: "text-amber-500 bg-amber-50 border-amber-200",
    },
    {
      label: "Maag",
      icon: Pill,
      color: "text-green-500 bg-green-50 border-green-200",
    },
  ];

  const handleQuickAdmit = async () => {
    if (!selectedStudent || !confirmComplaint) return;

    try {
      await createMutation.mutateAsync({
        studentId: selectedStudent.id,
        type: HealthRecordType.ILLNESS,
        complaint: confirmComplaint,
        visitDate: new Date().toISOString(),
        status: HealthStatus.SICK, // Default status for quick admit
        notes: "Quick Admit via Dashboard",
        createAttendance,
        notifyParent,
      });
      toast.success(
        `Berhasil mencatat keluhan ${confirmComplaint} untuk ${selectedStudent.name}`,
      );
      setConfirmComplaint(null);
      setSelectedStudent(null);
      setSearchQuery("");
    } catch (error) {
      toast.error("Gagal mencatat data kesehatan");
    }
  };

  return (
    <Card className="h-full border-2 border-primary/20 shadow-md">
      <CardHeader className="pb-3 bg-primary/5 border-b">
        <CardTitle className="flex items-center gap-2 text-primary">
          <Stethoscope className="h-5 w-5" />
          Quick Admit (UKS)
        </CardTitle>
        <CardDescription>Catat keluhan santri dengan cepat.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Student Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Cari Santri</label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                {selectedStudent
                  ? selectedStudent.name
                  : "Ketik nama santri..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Cari nama santri..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {isLoadingStudents && (
                    <div className="p-2 text-xs text-muted-foreground">
                      Mencari...
                    </div>
                  )}
                  {!isLoadingStudents && students?.length === 0 && (
                    <CommandEmpty>Tidak ditemukan.</CommandEmpty>
                  )}
                  <CommandGroup>
                    {students?.map((student) => (
                      <CommandItem
                        key={student.id}
                        value={student.id}
                        onSelect={() => {
                          setSelectedStudent(student);
                          setOpen(false);
                          setSearchQuery(""); // clear search query implies reset but keeping it empty feels cleaner for next search
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedStudent?.id === student.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{student.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {student.nisn || student.nik || "-"} •{" "}
                            {student.currentClass?.name || "No Class"}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Ailment Buttons */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Keluhan Umum</label>
          <div className="grid grid-cols-2 gap-2">
            {commonAilments.map((item) => (
              <Button
                key={item.label}
                variant="outline"
                className={cn(
                  "h-auto py-3 justify-start gap-2 border",
                  item.color,
                  selectedStudent
                    ? "opacity-100"
                    : "opacity-50 cursor-not-allowed",
                )}
                onClick={() =>
                  selectedStudent && setConfirmComplaint(item.label)
                }
                disabled={!selectedStudent}
              >
                <item.icon className="h-4 w-4" />
                <span className="text-xs font-semibold">{item.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Integration Options */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="attendance"
              checked={createAttendance}
              onCheckedChange={(c) => setCreateAttendance(!!c)}
            />
            <Label
              htmlFor="attendance"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Catat Absensi Sakit
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="notify"
              checked={notifyParent}
              onCheckedChange={(c) => setNotifyParent(!!c)}
            />
            <Label
              htmlFor="notify"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Notifikasi Wali Santri
            </Label>
          </div>
        </div>
      </CardContent>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!confirmComplaint}
        onOpenChange={(o) => !o && setConfirmComplaint(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Quick Admit</DialogTitle>
            <DialogDescription>
              Mencatat <strong>{confirmComplaint}</strong> untuk santri{" "}
              <strong>{selectedStudent?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmComplaint(null)}>
              Batal
            </Button>
            <Button
              onClick={handleQuickAdmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? "Menyimpan..."
                : "Konfirmasi & Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SickBayMonitor({ summaryData }: { summaryData: any }) {
  // Determine bed occupancy (Mocked capacity: 20)
  const sickCount =
    summaryData?.recordsByType?.find((s: any) => s.type === "ILLNESS")?.count ||
    0;
  const bedCapacity = 20;
  const occupancyRate = Math.min((sickCount / bedCapacity) * 100, 100);

  return (
    <Card className="h-full bg-slate-900 text-white border-0 shadow-lg overflow-hidden relative">
      {/* Background Pattern */}
      <div className="absolute top-0 right-0 p-8 opacity-10">
        <BedDouble className="w-32 h-32" />
      </div>

      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="text-green-400 animate-pulse" />
          Sick Bay Monitor (Monitor UKS)
        </CardTitle>
        <CardDescription className="text-slate-400">
          Real-time occupancy & status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-300">Bed Occupancy</span>
            <span className="font-bold text-green-400">
              {sickCount} / {bedCapacity} Beds
            </span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                occupancyRate > 80
                  ? "bg-red-500"
                  : occupancyRate > 50
                    ? "bg-yellow-500"
                    : "bg-green-500",
              )}
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
            <div className="text-xs text-slate-400 uppercase tracking-wider">
              Isolation Room
            </div>
            <div className="text-2xl font-bold mt-1 text-yellow-400">0</div>
            <div className="text-[10px] text-slate-500">Available</div>
          </div>
          <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
            <div className="text-xs text-slate-400 uppercase tracking-wider">
              Doctor on Duty
            </div>
            <div className="text-lg font-bold mt-1 text-white truncate">
              Dr. Aisyah
            </div>
            <div className="text-[10px] text-green-400">Active Now</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- MAIN PAGE ---

function HealthPageContent() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { data: healthData, isLoading } = useHealthRecords({
    page,
    limit: 10,
    recordType:
      typeFilter !== "ALL" ? (typeFilter as HealthRecordType) : undefined,
    status: statusFilter !== "ALL" ? (statusFilter as HealthStatus) : undefined,
  });

  const { data: summaryData } = useHealthSummary();
  const deleteMutation = useDeleteHealthRecord();

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Rekam kesehatan berhasil dihapus");
    } catch {
      toast.error("Gagal menghapus rekam kesehatan");
    }
  };

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Digital Walisongo: Health
          </h1>
          <p className="text-muted-foreground">
            Pusat pemantauan kesehatan santri & manajemen UKS
          </p>
        </div>
        <Button
          asChild
          className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
        >
          <Link href="/health/new">
            <Plus className="mr-2 h-4 w-4" />
            Catat Manual
          </Link>
        </Button>
      </div>

      {/* Hero Section: Stats + Sick Bay + Quick Admit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: VISUAL MONITOR */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-red-50 to-white border-red-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-600">
                  Sakit Hari Ini
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-700 flex items-center gap-2">
                  {summaryData?.recordsByType?.find(
                    (s) => s.type === ("ILLNESS" as any),
                  )?.count || 0}
                  <Activity className="h-4 w-4 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">
                  Obat Tersedia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-700 flex items-center gap-2">
                  {summaryData?.medications.total || 0}
                  <Pill className="h-4 w-4 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-50 to-white border-yellow-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-600">
                  Perlu Restock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-700 flex items-center gap-2">
                  {summaryData?.medications.lowStock || 0}
                  <AlertCircle className="h-4 w-4 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SICK BAY MONITOR (Dark Mode Card) */}
          <div className="h-64">
            <SickBayMonitor summaryData={summaryData} />
          </div>
        </div>

        {/* RIGHT COLUMN: QUICK ADMIT */}
        <div className="lg:col-span-1 h-full">
          <QuickAdmitCard />
        </div>
      </div>

      {/* Main Data Table */}
      <div className="pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">
            Riwayat Medis Terkini
          </h2>

          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Jenis</SelectItem>
                  {HEALTH_RECORD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                {HEALTH_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="border-t-4 border-t-indigo-500 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : healthData?.data?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Heart className="h-12 w-12 text-muted-foreground opacity-20" />
                <p className="mt-4 text-muted-foreground">
                  Belum ada data kesehatan
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Santri</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Diagnosis / Keluhan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthData?.data?.map((record) => (
                    <TableRow key={record.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-600">
                        {safeFormat(new Date(record.visitDate), "dd MMM yyyy", {
                          locale: localeId,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">
                              {record.student?.user?.name ||
                                record.student?.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {record.student?.nisn || record.student?.nik || "-"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {
                            HEALTH_RECORD_TYPES.find(
                              (t) => t.value === record.type,
                            )?.label
                          }
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate font-medium text-slate-700">
                          {record.diagnosis || record.complaint || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={record.status || HealthStatus.HEALTHY}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-8 w-8 p-0"
                          >
                            <Link href={`/health/${record.id}`}>
                              <Eye className="h-4 w-4 text-indigo-600" />
                            </Link>
                          </Button>
                          <ConfirmDialog
                            title="Hapus Rekam Kesehatan"
                            description="Tindakan ini tidak dapat dibatalkan."
                            onConfirm={() => handleDelete(record.id)}
                            loading={deleteMutation.isPending}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </ConfirmDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {healthData && healthData.meta.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              page={page}
              totalPages={healthData.meta.pagination.totalPages}
              pageSize={healthData.meta.pagination.limit}
              total={healthData.meta.pagination.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function HealthPageWithShell() {
  return (
    <MainLayout>
      <HealthPageContent />
    </MainLayout>
  );
}
