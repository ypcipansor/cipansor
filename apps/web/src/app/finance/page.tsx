"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Plus,
  Search,
  Banknote,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Users,
  PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Pagination } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TunggakanPanel } from "@/components/finance/tunggakan-panel";
import {
  useBills,
  useFinancialSummary,
  BILL_TYPES,
  BILL_STATUSES,
  BillType,
  BillStatus,
  Bill,
} from "@/hooks/use-finance";
import {
  useAcademicYears,
  useActiveAcademicYear,
} from "@/hooks/use-academic-years";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function FinancePageContent() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [billType, setBillType] = useState<BillType | "ALL">("ALL");
  const [status, setStatus] = useState<BillStatus | "ALL">("ALL");
  const [academicYearId, setAcademicYearId] = useState<string>("ACTIVE");
  const limit = 20;

  const { data: activeYear } = useActiveAcademicYear();
  const selectedYearId =
    academicYearId === "ACTIVE" ? activeYear?.id : academicYearId;

  const { data: billsData, isLoading } = useBills({
    page,
    limit,
    academicYearId: selectedYearId,
    billType: billType === "ALL" ? undefined : billType,
    status: status === "ALL" ? undefined : status,
  });

  const { data: summary } = useFinancialSummary(selectedYearId);
  const { data: academicYears } = useAcademicYears({ limit: 20 });

  const getStatusBadge = (billStatus: BillStatus) => {
    const statusInfo = BILL_STATUSES.find((s) => s.value === billStatus);
    return statusInfo ? (
      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
    ) : (
      <Badge variant="secondary">{billStatus}</Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/* Titled for what this page is. It was "Keuangan", which read as
              the whole finance area while showing only santri billing — and
              the menu entry pointing here was labelled "Laporan Keuangan",
              which it is not. Financial statements are at /finance/accounting. */}
          <h1 className="text-3xl font-bold tracking-tight">Tagihan &amp; SPP</h1>
          <p className="text-muted-foreground">
            Kelola tagihan, tunggakan, dan pembayaran santri
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/finance/spp-matrix">
              <CreditCard className="mr-2 h-4 w-4" />
              Matrix SPP
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/finance/payments">
              <CreditCard className="mr-2 h-4 w-4" />
              Riwayat Pembayaran
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/finance/bills/bulk">
              <Users className="mr-2 h-4 w-4" />
              Tagihan Massal
            </Link>
          </Button>
          <Button asChild>
            <Link href="/finance/bills/new">
              <Plus className="mr-2 h-4 w-4" />
              Buat Tagihan
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Collection Ratio</CardTitle>
            <PieChart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {summary && summary.totalBilled > 0
                ? `${Math.round((summary.totalPaid / summary.totalBilled) * 100)}%`
                : "0%"}
            </div>
            <p className="text-xs text-muted-foreground">Persentase Terkumpul</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tagihan</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalBilled || 0)}
            </div>
            <p className="text-xs text-muted-foreground">tahun ajaran aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Terbayar</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary?.totalPaid || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary && summary.totalBilled > 0
                ? `${Math.round((summary.totalPaid / summary.totalBilled) * 100)}% dari total`
                : "0% dari total"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Belum Dibayar</CardTitle>
            <TrendingUp className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(summary?.totalOutstanding || 0)}
            </div>
            <p className="text-xs text-muted-foreground">sisa tagihan</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Jatuh Tempo</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary?.totalOverdue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">perlu perhatian</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bills" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bills">Daftar Tagihan</TabsTrigger>
          <TabsTrigger value="tunggakan">Tunggakan</TabsTrigger>
          <TabsTrigger value="summary">Ringkasan</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama/NISN santri..."
                    className="pl-10"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <Select
                  value={academicYearId}
                  onValueChange={setAcademicYearId}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Tahun Ajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Tahun Aktif</SelectItem>
                    {academicYears?.data.map((year) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={billType}
                  onValueChange={(v) => setBillType(v as BillType | "ALL")}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Jenis Tagihan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Jenis</SelectItem>
                    {BILL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as BillStatus | "ALL")}
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Status</SelectItem>
                    {BILL_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Bills Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : billsData?.data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <CreditCard className="h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">
                    Tidak ada tagihan
                  </h3>
                  <p className="text-muted-foreground">
                    Belum ada tagihan untuk filter yang dipilih
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. Tagihan</TableHead>
                        <TableHead>Santri</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Jumlah</TableHead>
                        <TableHead>Terbayar</TableHead>
                        <TableHead>Jatuh Tempo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billsData?.data.map((bill: Bill) => (
                        <TableRow key={bill.id}>
                          <TableCell className="font-mono text-sm">
                            {bill.id.slice(0, 8).toUpperCase()}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {bill.student?.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {bill.student?.nisn}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {BILL_TYPES.find((t) => t.value === bill.billType)
                              ?.label || bill.billType}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(bill.amount)}
                          </TableCell>
                          <TableCell
                            className={
                              bill.paidAmount > 0
                                ? "text-green-600 font-medium"
                                : ""
                            }
                          >
                            {formatCurrency(bill.paidAmount)}
                          </TableCell>
                          <TableCell>
                            {new Date(bill.dueDate).toLocaleDateString("id-ID")}
                          </TableCell>
                          <TableCell>{getStatusBadge(bill.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {bill.status !== "PAID" &&
                                bill.status !== "CANCELLED" && (
                                  <Button size="sm" asChild>
                                    <Link
                                      href={`/finance/bills/${bill.id}/pay`}
                                    >
                                      Bayar
                                    </Link>
                                  </Button>
                                )}
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/finance/bills/${bill.id}`}>
                                  Detail
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {billsData && billsData.meta.totalPages > 1 && (
                    <Pagination
                      page={page}
                      totalPages={billsData.meta.totalPages}
                      pageSize={limit}
                      total={billsData.meta.total}
                      onPageChange={setPage}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          {/* Summary by Bill Type */}
          <Card>
            <CardHeader>
              <CardTitle>Ringkasan per Jenis Tagihan</CardTitle>
              <CardDescription>
                Rekapitulasi tagihan berdasarkan jenis untuk tahun ajaran aktif
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary?.billsByType && summary.billsByType.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jenis Tagihan</TableHead>
                      <TableHead className="text-right">
                        Total Tagihan
                      </TableHead>
                      <TableHead className="text-right">Terbayar</TableHead>
                      <TableHead className="text-right">
                        Belum Dibayar
                      </TableHead>
                      <TableHead className="text-right">Persentase</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.billsByType.map((item) => (
                      <TableRow key={item.type}>
                        <TableCell className="font-medium">
                          {BILL_TYPES.find((t) => t.value === item.type)
                            ?.label || item.type}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.total)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(item.paid)}
                        </TableCell>
                        <TableCell className="text-right text-yellow-600">
                          {formatCurrency(item.outstanding)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.total > 0
                            ? `${Math.round((item.paid / item.total) * 100)}%`
                            : "0%"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <Banknote className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">
                    Belum ada data ringkasan
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tunggakan" className="space-y-4">
          <TunggakanPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function FinancePageWithShell() {
  return (
    <MainLayout>
      <FinancePageContent />
    </MainLayout>
  );
}
