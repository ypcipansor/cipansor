"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  MinusCircle,
  Plus,
  RefreshCw,
  Download,
  Filter,
  Banknote,
  Users,
  TrendingUp,
} from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useSppMatrix,
  useGenerateSppInvoices,
  SppMatrixMonth,
} from "@/hooks/use-finance";
import { useUnits } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";
import { MainLayout } from "@/components/layout";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const MONTHS_LABEL: { [key: string]: string } = {
  Jan: "Januari",
  Feb: "Februari",
  Mar: "Maret",
  Apr: "April",
  May: "Mei",
  Jun: "Juni",
  Jul: "Juli",
  Aug: "Agustus",
  Sep: "September",
  Oct: "Oktober",
  Nov: "November",
  Dec: "Desember",
};

function StatusCell({
  month,
  onClick,
}: {
  month: SppMatrixMonth;
  onClick?: () => void;
}) {
  const getStatusIcon = () => {
    switch (month.status) {
      case "PAID":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "PARTIAL":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "PENDING":
        return <MinusCircle className="h-5 w-5 text-yellow-600" />;
      case "OVERDUE":
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case "NOT_BILLED":
        return <XCircle className="h-5 w-5 text-gray-300" />;
      default:
        return <MinusCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusLabel = () => {
    switch (month.status) {
      case "PAID":
        return "Lunas";
      case "PARTIAL":
        return `Cicilan ${formatCurrency(month.paidAmount)}`;
      case "PENDING":
        return "Belum Bayar";
      case "OVERDUE":
        return "Jatuh Tempo";
      case "NOT_BILLED":
        return "Belum Ditagih";
      default:
        return "-";
    }
  };

  const getBgColor = () => {
    switch (month.status) {
      case "PAID":
        return "bg-green-50 hover:bg-green-100";
      case "PARTIAL":
        return "bg-blue-50 hover:bg-blue-100";
      case "PENDING":
        return "bg-yellow-50 hover:bg-yellow-100";
      case "OVERDUE":
        return "bg-red-50 hover:bg-red-100";
      case "NOT_BILLED":
        return "bg-gray-50";
      default:
        return "bg-white";
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`w-full h-10 flex items-center justify-center transition-colors ${getBgColor()} ${
              month.status !== "NOT_BILLED" && month.status !== "PAID"
                ? "cursor-pointer"
                : "cursor-default"
            }`}
            onClick={onClick}
            disabled={month.status === "NOT_BILLED"}
          >
            {getStatusIcon()}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">{getStatusLabel()}</p>
            {month.amount > 0 && (
              <p className="text-muted-foreground">
                {formatCurrency(month.paidAmount)} /{" "}
                {formatCurrency(month.amount)}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SppMatrixPageContent() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [generateMonth, setGenerateMonth] = useState<number>(
    new Date().getMonth(),
  );
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  const { data: units } = useUnits();
  const { data: classesData } = useClasses({
    unitId: selectedUnitId || undefined,
    limit: 100,
  });

  const {
    data: matrixData,
    isLoading,
    refetch,
  } = useSppMatrix({
    year: selectedYear,
    unitId: selectedUnitId || undefined,
    classId: selectedClassId || undefined,
  });

  const generateMutation = useGenerateSppInvoices();

  const handleGenerateInvoices = async () => {
    if (!matrixData?.paymentTypeId) {
      toast.error("Jenis pembayaran SPP tidak ditemukan");
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        paymentTypeId: matrixData.paymentTypeId,
        year: selectedYear,
        month: generateMonth,
        unitId: selectedUnitId || undefined,
        classId: selectedClassId || undefined,
      });

      toast.success(
        `${result.created} tagihan dibuat, ${result.skipped} sudah ada`,
      );

      setIsGenerateOpen(false);
      refetch();
    } catch {
      toast.error("Gagal membuat tagihan");
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Matrix Pembayaran SPP
          </h1>
          <p className="text-muted-foreground">
            Tampilan pembayaran SPP per santri per bulan (Syahriah)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Generate Tagihan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Tagihan SPP Bulanan</DialogTitle>
                <DialogDescription>
                  Buat tagihan SPP untuk semua santri pada bulan tertentu
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Bulan</Label>
                  <Select
                    value={generateMonth.toString()}
                    onValueChange={(v) => setGenerateMonth(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MONTHS_LABEL).map(
                        ([key, label], index) => (
                          <SelectItem key={key} value={index.toString()}>
                            {label} {selectedYear}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Tarif SPP: {formatCurrency(matrixData?.sppRate || 0)}</p>
                  <p>Total santri: {matrixData?.summary?.totalStudents || 0}</p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsGenerateOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleGenerateInvoices}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending
                    ? "Membuat..."
                    : "Generate Tagihan"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      {matrixData?.summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Santri
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {matrixData.summary.totalStudents}
              </div>
              <p className="text-xs text-muted-foreground">santri terdaftar</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Tagihan
              </CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(matrixData.summary.totalBilled)}
              </div>
              <p className="text-xs text-muted-foreground">
                tahun {selectedYear}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Sudah Dibayar
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(matrixData.summary.totalPaid)}
              </div>
              <p className="text-xs text-muted-foreground">
                {matrixData.summary.totalBilled > 0
                  ? `${Math.round((matrixData.summary.totalPaid / matrixData.summary.totalBilled) * 100)}%`
                  : "0%"}{" "}
                terkumpul
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tunggakan</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(matrixData.summary.totalOutstanding)}
              </div>
              <p className="text-xs text-muted-foreground">
                {matrixData.summary.overdueCount} tagihan jatuh tempo
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Lunas ({matrixData?.summary?.paidCount || 0})</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <span>Cicilan ({matrixData?.summary?.partialCount || 0})</span>
            </div>
            <div className="flex items-center gap-2">
              <MinusCircle className="h-4 w-4 text-yellow-600" />
              <span>
                Belum Bayar ({matrixData?.summary?.pendingCount || 0})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span>
                Jatuh Tempo ({matrixData?.summary?.overdueCount || 0})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-gray-300" />
              <span>Belum Ditagih</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="space-y-2">
              <Label>Tahun</Label>
              <Select
                value={selectedYear.toString()}
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Semua Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua Unit</SelectItem>
                  {units?.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kelas</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Semua Kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua Kelas</SelectItem>
                  {classesData?.data?.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matrix Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Matrix SPP {selectedYear}
          </CardTitle>
          <CardDescription>
            Tarif SPP: {formatCurrency(matrixData?.sppRate || 0)} / bulan
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : !matrixData?.students?.length ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Tidak ada data</h3>
              <p className="text-muted-foreground">
                Belum ada santri atau tagihan untuk filter yang dipilih
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[50px]">
                      No
                    </TableHead>
                    <TableHead className="sticky left-[50px] bg-background z-10 min-w-[200px]">
                      Santri
                    </TableHead>
                    <TableHead className="sticky left-[250px] bg-background z-10 min-w-[100px]">
                      Kelas
                    </TableHead>
                    {matrixData.months.map((month) => (
                      <TableHead
                        key={month}
                        className="text-center min-w-[60px]"
                      >
                        {month}
                      </TableHead>
                    ))}
                    <TableHead className="text-right min-w-[120px]">
                      Total
                    </TableHead>
                    <TableHead className="text-right min-w-[120px]">
                      Dibayar
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixData.students.map((student, index) => (
                    <TableRow key={student.studentId}>
                      <TableCell className="sticky left-0 bg-background">
                        {index + 1}
                      </TableCell>
                      <TableCell className="sticky left-[50px] bg-background">
                        <div>
                          <Link
                            href={`/students/${student.studentId}`}
                            className="font-medium hover:underline"
                          >
                            {student.studentName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {student.nisn}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="sticky left-[250px] bg-background">
                        <Badge variant="outline">{student.className}</Badge>
                      </TableCell>
                      {matrixData.months.map((month) => (
                        <TableCell key={month} className="p-0">
                          <StatusCell
                            month={student.months[month]}
                            onClick={() => {
                              if (student.months[month].invoiceId) {
                                window.location.href = `/finance/bills/${student.months[month].invoiceId}`;
                              }
                            }}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium">
                        {formatCurrency(student.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            student.totalPaid >= student.totalAmount
                              ? "text-green-600"
                              : "text-yellow-600"
                          }
                        >
                          {formatCurrency(student.totalPaid)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SppMatrixPage() {
  return (
    <MainLayout>
      <SppMatrixPageContent />
    </MainLayout>
  );
}
