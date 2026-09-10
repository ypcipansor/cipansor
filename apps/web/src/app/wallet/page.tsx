"use client";
import { MainLayout } from "@/components/layout";

import { useState, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Wallet,
  Plus,
  Minus,
  Search,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  Users,
  TrendingUp,
  AlertTriangle,
  Eye,
  History,
  CreditCard,
  Banknote,
  QrCode,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  useWallets,
  useWalletSummary,
  useWalletTransactions,
  useTopUpWallet,
  useBulkTopUp,
  useDeductWallet,
  useRefundWallet,
  formatCurrency,
  getTransactionTypeColor,
  getTransactionTypeLabel,
  getReferenceTypeLabel,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getPaymentMethodLabel,
  TRANSACTION_TYPES,
  REFERENCE_TYPES,
  PAYMENT_METHODS,
  Wallet as WalletType,
  WalletTransaction,
  TransactionType,
  ReferenceType,
  PaymentMethod,
} from "@/hooks/use-wallet";
import { useUnits } from "@/hooks";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

// Simple student search
const searchStudents = async (search: string) => {
  if (!search || search.length < 2) return [];
  const res = await api.get("/students", { params: { search, limit: 10 } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.data.data.map((s: any) => ({
    id: s.id,
    nisn: s.nisn,
    name: s.user?.name || s.name,
    className: s.class?.name,
    walletBalance: s.wallet?.balance,
  }));
};

// Student picker component extracted to avoid re-creation in render
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StudentPicker = ({
  onSelect,
  search,
  setSearch,
  results,
}: {
  onSelect: (student: any) => void;
  search: string;
  setSearch: (v: string) => void;
  results: any[] | undefined;
}) => (
  <div className="space-y-2">
    <Label>Cari Santri</Label>
    <Input
      placeholder="Ketik nama atau NISN santri..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
    {results && results.length > 0 && (
      <div className="border rounded-md max-h-40 overflow-auto">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {results.map((student: any) => (
          <button
            key={student.id}
            className="w-full p-3 text-left hover:bg-muted flex justify-between items-center border-b last:border-b-0"
            onClick={() => {
              onSelect(student);
            }}
          >
            <div>
              <span className="font-medium">{student.name}</span>
              <span className="text-sm text-muted-foreground ml-2">
                ({student.nisn})
              </span>
              {student.className && (
                <span className="text-sm text-muted-foreground ml-2">
                  - {student.className}
                </span>
              )}
            </div>
            {student.walletBalance !== undefined && (
              <span className="text-sm font-medium text-green-600">
                {formatCurrency(student.walletBalance)}
              </span>
            )}
          </button>
        ))}
      </div>
    )}
  </div>
);

function WalletPageContent() {
  const [activeTab, setActiveTab] = useState("wallets");
  const [search, setSearch] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionType, setTransactionType] = useState<string>("ALL");

  // Dialogs
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [bulkTopUpDialogOpen, setBulkTopUpDialogOpen] = useState(false);

  // Forms
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [referenceType, setReferenceType] = useState<ReferenceType>("OTHER");
  const [bulkAmount, setBulkAmount] = useState<number>(0);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Queries
  const { data: units } = useUnits();
  const {
    data: walletsData,
    isLoading: walletsLoading,
    refetch: refetchWallets,
  } = useWallets({
    page,
    limit: 20,
    search: search || undefined,
    unitId: selectedUnitId !== "ALL" ? selectedUnitId : undefined,
  });

  const { data: summary } = useWalletSummary(
    selectedUnitId !== "ALL" ? selectedUnitId : undefined,
  );

  const { data: transactionsData, isLoading: transactionsLoading } =
    useWalletTransactions({
      page: transactionPage,
      limit: 20,
      type:
        transactionType !== "ALL"
          ? (transactionType as TransactionType)
          : undefined,
    });

  const { data: searchResults } = useQuery({
    queryKey: ["student-search-wallet", studentSearch],
    queryFn: () => searchStudents(studentSearch),
    enabled: studentSearch.length >= 2,
  });

  // Mutations
  const topUpMutation = useTopUpWallet();
  const deductMutation = useDeductWallet();
  const refundMutation = useRefundWallet();
  const bulkTopUpMutation = useBulkTopUp();

  // Reset form
  const resetForm = () => {
    setSelectedStudentId("");
    setStudentSearch("");
    setAmount(0);
    setDescription("");
    setPaymentMethod("CASH");
    setReferenceType("OTHER");
  };

  // Handle Top Up
  const handleTopUp = async () => {
    if (!selectedStudentId || amount <= 0) {
      toast.error("Pilih santri dan masukkan nominal");
      return;
    }

    await topUpMutation.mutateAsync({
      studentId: selectedStudentId,
      amount,
      description: description || undefined,
      paymentMethod,
    });

    setTopUpDialogOpen(false);
    resetForm();
    refetchWallets();
  };

  // Handle Deduct
  const handleDeduct = async () => {
    if (!selectedStudentId || amount <= 0) {
      toast.error("Pilih santri dan masukkan nominal");
      return;
    }

    await deductMutation.mutateAsync({
      studentId: selectedStudentId,
      amount,
      description: description || undefined,
      referenceType,
    });

    setDeductDialogOpen(false);
    resetForm();
    refetchWallets();
  };

  // Handle Refund
  const handleRefund = async () => {
    if (!selectedStudentId || amount <= 0 || !description) {
      toast.error("Lengkapi semua field yang diperlukan");
      return;
    }

    await refundMutation.mutateAsync({
      studentId: selectedStudentId,
      amount,
      description,
      referenceType,
    });

    setRefundDialogOpen(false);
    resetForm();
    refetchWallets();
  };

  // Handle Bulk Top Up
  const handleBulkTopUp = async () => {
    if (selectedStudentIds.length === 0 || bulkAmount <= 0) {
      toast.error("Pilih santri dan masukkan nominal");
      return;
    }

    await bulkTopUpMutation.mutateAsync({
      studentIds: selectedStudentIds,
      amount: bulkAmount,
      description: description || undefined,
    });

    setBulkTopUpDialogOpen(false);
    setSelectedStudentIds([]);
    setBulkAmount(0);
    setDescription("");
    refetchWallets();
  };

  // Stats cards
  const statsCards = useMemo(
    () => [
      {
        title: "Total Wallet",
        value: summary?.totalWallets || 0,
        icon: Users,
        color: "text-blue-600",
        bgColor: "bg-blue-100",
      },
      {
        title: "Total Saldo",
        value: formatCurrency(summary?.totalBalance || 0),
        icon: Banknote,
        color: "text-green-600",
        bgColor: "bg-green-100",
      },
      {
        title: "Rata-rata Saldo",
        value: formatCurrency(summary?.averageBalance || 0),
        icon: TrendingUp,
        color: "text-purple-600",
        bgColor: "bg-purple-100",
      },
      {
        title: "Saldo Rendah",
        value: summary?.walletsWithLowBalance || 0,
        icon: AlertTriangle,
        color: "text-red-600",
        bgColor: "bg-red-100",
        subtitle: "< Rp 10.000",
      },
    ],
    [summary],
  );

  const todayStats = useMemo(
    () => [
      {
        title: "Transaksi Hari Ini",
        value: summary?.todayTransactions || 0,
        icon: History,
      },
      {
        title: "Top Up Hari Ini",
        value: summary?.todayTopUps || 0,
        icon: ArrowUpRight,
        color: "text-green-600",
      },
      {
        title: "Pembelian Hari Ini",
        value: summary?.todayPurchases || 0,
        icon: ArrowDownRight,
        color: "text-red-600",
      },
    ],
    [summary],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleStudentSelect = (student: any) => {
    setSelectedStudentId(student.id);
    setStudentSearch(student.name);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-8 w-8 text-primary" />
            E-Wallet Santri
          </h1>
          <p className="text-muted-foreground mt-1">
            Kelola saldo dan transaksi wallet santri
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setBulkTopUpDialogOpen(true)}
          >
            <Users className="h-4 w-4 mr-2" />
            Bulk Top Up
          </Button>
          <Button onClick={() => setTopUpDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Top Up
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  {stat.subtitle && (
                    <p className="text-xs text-muted-foreground">
                      {stat.subtitle}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today Stats */}
      <div className="grid grid-cols-3 gap-4">
        {todayStats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-4 flex items-center gap-4">
              <stat.icon
                className={`h-8 w-8 ${stat.color || "text-muted-foreground"}`}
              />
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-xl font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="wallets" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Daftar Wallet
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Riwayat Transaksi
          </TabsTrigger>
        </TabsList>

        {/* Wallets Tab */}
        <TabsContent value="wallets" className="mt-4 space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari berdasarkan nama atau NISN..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={selectedUnitId}
                  onValueChange={(val) => {
                    setSelectedUnitId(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Semua Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Unit</SelectItem>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {units?.map((unit: any) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => refetchWallets()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Wallets Table */}
          <Card>
            <CardHeader>
              <CardTitle>Daftar Wallet Santri</CardTitle>
              <CardDescription>
                {walletsData?.meta?.total || 0} wallet ditemukan
              </CardDescription>
            </CardHeader>
            <CardContent>
              {walletsLoading ? (
                <div className="flex justify-center p-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Santri</TableHead>
                      <TableHead>NISN</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {walletsData?.data?.map((wallet: WalletType) => (
                      <TableRow key={wallet.id}>
                        <TableCell className="font-medium">
                          {wallet.student?.name || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {wallet.student?.nisn || "-"}
                        </TableCell>
                        <TableCell>
                          {wallet.student?.class?.name || "-"}
                        </TableCell>
                        <TableCell>
                          {wallet.student?.unit?.name || "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <span
                            className={
                              wallet.balance < 10000
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            {formatCurrency(wallet.balance)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={wallet.isActive ? "default" : "secondary"}
                          >
                            {wallet.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/wallet/${wallet.studentId}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-green-600"
                              onClick={() => {
                                setSelectedStudentId(wallet.studentId);
                                setStudentSearch(wallet.student?.name || "");
                                setTopUpDialogOpen(true);
                              }}
                            >
                              <ArrowUpRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600"
                              onClick={() => {
                                setSelectedStudentId(wallet.studentId);
                                setStudentSearch(wallet.student?.name || "");
                                setDeductDialogOpen(true);
                              }}
                            >
                              <ArrowDownRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {walletsData?.meta && walletsData.meta.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Sebelumnya
                  </Button>
                  <span className="flex items-center px-4">
                    Halaman {page} dari {walletsData.meta.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page >= walletsData.meta.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Selanjutnya
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="mt-4 space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <Select
                  value={transactionType}
                  onValueChange={(val) => {
                    setTransactionType(val);
                    setTransactionPage(1);
                  }}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Semua Tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Tipe</SelectItem>
                    {TRANSACTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Transaksi</CardTitle>
              <CardDescription>
                {transactionsData?.meta?.total || 0} transaksi ditemukan
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex justify-center p-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Santri</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Referensi</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead className="text-right">
                        Saldo Setelah
                      </TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionsData?.data?.map((tx: WalletTransaction) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">
                          {new Date(tx.createdAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {tx.wallet?.student?.name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={getTransactionTypeColor(tx.type)}>
                            {getTransactionTypeLabel(tx.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {tx.referenceType
                            ? getReferenceTypeLabel(tx.referenceType)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <span
                            className={
                              tx.type === "TOPUP" || tx.type === "REFUND"
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          >
                            {tx.type === "TOPUP" || tx.type === "REFUND"
                              ? "+"
                              : "-"}
                            {formatCurrency(tx.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(tx.balanceAfter)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {tx.description || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {transactionsData?.meta &&
                transactionsData.meta.totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      disabled={transactionPage <= 1}
                      onClick={() => setTransactionPage(transactionPage - 1)}
                    >
                      Sebelumnya
                    </Button>
                    <span className="flex items-center px-4">
                      Halaman {transactionPage} dari{" "}
                      {transactionsData.meta.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      disabled={
                        transactionPage >= transactionsData.meta.totalPages
                      }
                      onClick={() => setTransactionPage(transactionPage + 1)}
                    >
                      Selanjutnya
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Top Up Dialog */}
      <Dialog
        open={topUpDialogOpen}
        onOpenChange={(open) => {
          setTopUpDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-green-600" />
              Top Up Saldo
            </DialogTitle>
            <DialogDescription>Tambah saldo ke wallet santri</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <StudentPicker
              onSelect={handleStudentSelect}
              search={studentSearch}
              setSearch={setStudentSearch}
              results={searchResults}
            />

            <div className="space-y-2">
              <Label>Nominal Top Up</Label>
              <Input
                type="number"
                placeholder="Masukkan nominal..."
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <div className="flex gap-2 flex-wrap">
                {[10000, 25000, 50000, 100000, 200000].map((val) => (
                  <Button
                    key={val}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(val)}
                  >
                    {formatCurrency(val)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <Button
                    key={method.value}
                    type="button"
                    variant={
                      paymentMethod === method.value ? "default" : "outline"
                    }
                    className="flex items-center gap-2"
                    onClick={() => setPaymentMethod(method.value)}
                  >
                    {method.value === "CASH" && (
                      <Banknote className="h-4 w-4" />
                    )}
                    {method.value === "BANK_TRANSFER" && (
                      <CreditCard className="h-4 w-4" />
                    )}
                    {method.value === "QRIS" && <QrCode className="h-4 w-4" />}
                    {method.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Keterangan (opsional)</Label>
              <Textarea
                placeholder="Masukkan keterangan..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={
                topUpMutation.isPending || !selectedStudentId || amount <= 0
              }
              className="bg-green-600 hover:bg-green-700"
            >
              {topUpMutation.isPending && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              Top Up {amount > 0 && formatCurrency(amount)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deduct Dialog */}
      <Dialog
        open={deductDialogOpen}
        onOpenChange={(open) => {
          setDeductDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownRight className="h-5 w-5 text-red-600" />
              Kurangi Saldo
            </DialogTitle>
            <DialogDescription>
              Kurangi saldo wallet santri untuk pembelian
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <StudentPicker
              onSelect={handleStudentSelect}
              search={studentSearch}
              setSearch={setStudentSearch}
              results={searchResults}
            />

            <div className="space-y-2">
              <Label>Nominal</Label>
              <Input
                type="number"
                placeholder="Masukkan nominal..."
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipe Referensi</Label>
              <Select
                value={referenceType}
                onValueChange={(val) => setReferenceType(val as ReferenceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Keterangan (opsional)</Label>
              <Textarea
                placeholder="Masukkan keterangan..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeductDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleDeduct}
              disabled={
                deductMutation.isPending || !selectedStudentId || amount <= 0
              }
              variant="destructive"
            >
              {deductMutation.isPending && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              Kurangi {amount > 0 && formatCurrency(amount)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog
        open={refundDialogOpen}
        onOpenChange={(open) => {
          setRefundDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-blue-600" />
              Refund Saldo
            </DialogTitle>
            <DialogDescription>
              Kembalikan saldo ke wallet santri
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <StudentPicker
              onSelect={handleStudentSelect}
              search={studentSearch}
              setSearch={setStudentSearch}
              results={searchResults}
            />

            <div className="space-y-2">
              <Label>Nominal Refund</Label>
              <Input
                type="number"
                placeholder="Masukkan nominal..."
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipe Referensi</Label>
              <Select
                value={referenceType}
                onValueChange={(val) => setReferenceType(val as ReferenceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Alasan Refund *</Label>
              <Textarea
                placeholder="Masukkan alasan refund..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleRefund}
              disabled={
                refundMutation.isPending ||
                !selectedStudentId ||
                amount <= 0 ||
                !description
              }
            >
              {refundMutation.isPending && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              Refund {amount > 0 && formatCurrency(amount)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Top Up Dialog */}
      <Dialog
        open={bulkTopUpDialogOpen}
        onOpenChange={(open) => {
          setBulkTopUpDialogOpen(open);
          if (!open) {
            setSelectedStudentIds([]);
            setBulkAmount(0);
            setDescription("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Bulk Top Up
            </DialogTitle>
            <DialogDescription>
              Top up saldo ke beberapa wallet sekaligus
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pilih Santri dari Daftar</Label>
              <p className="text-sm text-muted-foreground">
                Centang wallet yang ingin di-top up dari tab Daftar Wallet, lalu
                kembali ke sini.
              </p>
              <Badge variant="outline" className="text-lg px-4 py-2">
                {selectedStudentIds.length} santri dipilih
              </Badge>
            </div>

            <div className="space-y-2">
              <Label>Nominal Top Up per Santri</Label>
              <Input
                type="number"
                placeholder="Masukkan nominal..."
                value={bulkAmount || ""}
                onChange={(e) => setBulkAmount(Number(e.target.value))}
              />
              <div className="flex gap-2 flex-wrap">
                {[10000, 25000, 50000, 100000].map((val) => (
                  <Button
                    key={val}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkAmount(val)}
                  >
                    {formatCurrency(val)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Keterangan (opsional)</Label>
              <Textarea
                placeholder="Masukkan keterangan..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {selectedStudentIds.length > 0 && bulkAmount > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Ringkasan:</p>
                <p className="text-sm">
                  {selectedStudentIds.length} santri ×{" "}
                  {formatCurrency(bulkAmount)} ={" "}
                  <span className="font-bold text-green-600">
                    {formatCurrency(selectedStudentIds.length * bulkAmount)}
                  </span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkTopUpDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleBulkTopUp}
              disabled={
                bulkTopUpMutation.isPending ||
                selectedStudentIds.length === 0 ||
                bulkAmount <= 0
              }
              className="bg-green-600 hover:bg-green-700"
            >
              {bulkTopUpMutation.isPending && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              Proses Bulk Top Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WalletPageWithShell() {
  return (
    <MainLayout>
      <WalletPageContent />
    </MainLayout>
  );
}
