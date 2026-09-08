"use client";

import { useState, use } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowLeft,
  RefreshCw,
  User,
  CreditCard,
  History,
  TrendingUp,
  TrendingDown,
  Banknote,
  QrCode,
  Calendar,
  Download,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useWallet,
  useStudentWalletTransactions,
  useTopUpWallet,
  useDeductWallet,
  useRefundWallet,
  formatCurrency,
  getTransactionTypeColor,
  getTransactionTypeLabel,
  getReferenceTypeLabel,
  TRANSACTION_TYPES,
  REFERENCE_TYPES,
  PAYMENT_METHODS,
  WalletTransaction,
  TransactionType,
  ReferenceType,
  PaymentMethod,
} from "@/hooks/use-wallet";

interface PageProps {
  params: Promise<{ studentId: string }>;
}

function WalletDetailPageContent({ params }: PageProps) {
  const { studentId } = use(params);
  const [page, setPage] = useState(1);
  const [transactionType, setTransactionType] = useState<string>("");

  // Dialogs
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);

  // Forms
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [referenceType, setReferenceType] = useState<ReferenceType>("OTHER");

  // Queries
  const {
    data: wallet,
    isLoading: walletLoading,
    refetch: refetchWallet,
  } = useWallet(studentId);
  const { data: transactionsData, isLoading: transactionsLoading } =
    useStudentWalletTransactions(studentId, {
      page,
      limit: 20,
      type: (transactionType as TransactionType) || undefined,
    });

  // Mutations
  const topUpMutation = useTopUpWallet();
  const deductMutation = useDeductWallet();
  const refundMutation = useRefundWallet();

  // Reset form
  const resetForm = () => {
    setAmount(0);
    setDescription("");
    setPaymentMethod("CASH");
    setReferenceType("OTHER");
  };

  // Handle Top Up
  const handleTopUp = async () => {
    if (amount <= 0) {
      toast.error("Masukkan nominal yang valid");
      return;
    }

    await topUpMutation.mutateAsync({
      studentId,
      amount,
      description: description || undefined,
      paymentMethod,
    });

    setTopUpDialogOpen(false);
    resetForm();
    refetchWallet();
  };

  // Handle Deduct
  const handleDeduct = async () => {
    if (amount <= 0) {
      toast.error("Masukkan nominal yang valid");
      return;
    }

    if (wallet && amount > wallet.balance) {
      toast.error("Saldo tidak mencukupi");
      return;
    }

    await deductMutation.mutateAsync({
      studentId,
      amount,
      description: description || undefined,
      referenceType,
    });

    setDeductDialogOpen(false);
    resetForm();
    refetchWallet();
  };

  // Handle Refund
  const handleRefund = async () => {
    if (amount <= 0 || !description) {
      toast.error("Lengkapi semua field yang diperlukan");
      return;
    }

    await refundMutation.mutateAsync({
      studentId,
      amount,
      description,
      referenceType,
    });

    setRefundDialogOpen(false);
    resetForm();
    refetchWallet();
  };

  // Calculate stats from transactions
  const transactionStats = transactionsData?.data?.reduce(
    (acc, tx) => {
      if (tx.type === "TOPUP") {
        acc.totalTopUp += tx.amount;
        acc.topUpCount++;
      } else if (tx.type === "PURCHASE") {
        acc.totalPurchase += tx.amount;
        acc.purchaseCount++;
      }
      return acc;
    },
    { totalTopUp: 0, totalPurchase: 0, topUpCount: 0, purchaseCount: 0 },
  ) || { totalTopUp: 0, totalPurchase: 0, topUpCount: 0, purchaseCount: 0 };

  if (walletLoading) {
    return (
      <div className="container mx-auto p-6 flex justify-center items-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Wallet Tidak Ditemukan
            </h2>
            <p className="text-muted-foreground mb-4">
              Wallet untuk santri ini belum tersedia.
            </p>
            <Button asChild>
              <Link href="/wallet">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali ke Daftar Wallet
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/wallet">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Detail Wallet
          </h1>
          <p className="text-muted-foreground">
            Informasi dan riwayat transaksi wallet santri
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="text-green-600 border-green-600 hover:bg-green-50"
            onClick={() => setTopUpDialogOpen(true)}
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Top Up
          </Button>
          <Button
            variant="outline"
            className="text-red-600 border-red-600 hover:bg-red-50"
            onClick={() => setDeductDialogOpen(true)}
          >
            <ArrowDownRight className="h-4 w-4 mr-2" />
            Kurangi
          </Button>
          <Button variant="outline" onClick={() => setRefundDialogOpen(true)}>
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Refund
          </Button>
        </div>
      </div>

      {/* Student Info & Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informasi Santri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Nama</p>
              <p className="font-semibold text-lg">
                {wallet.student?.name || "-"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">NISN</p>
                <p className="font-mono">{wallet.student?.nisn || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kelas</p>
                <p>{wallet.student?.class?.name || "-"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unit</p>
              <p>{wallet.student?.unit?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={wallet.isActive ? "default" : "secondary"}>
                {wallet.isActive ? "Aktif" : "Nonaktif"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Balance Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Saldo Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Current Balance */}
              <div className="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
                <Wallet className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <p className="text-sm text-muted-foreground">Saldo Saat Ini</p>
                <p
                  className={`text-3xl font-bold ${wallet.balance < 10000 ? "text-red-600" : "text-green-600"}`}
                >
                  {formatCurrency(wallet.balance)}
                </p>
                {wallet.lastTopUp && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Top up terakhir:{" "}
                    {new Date(wallet.lastTopUp).toLocaleDateString("id-ID")}
                  </p>
                )}
              </div>

              {/* Total Top Up (this page) */}
              <div className="text-center p-6 bg-blue-50 rounded-xl">
                <TrendingUp className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <p className="text-sm text-muted-foreground">Total Top Up</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(transactionStats.totalTopUp)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {transactionStats.topUpCount} transaksi
                </p>
              </div>

              {/* Total Purchase (this page) */}
              <div className="text-center p-6 bg-red-50 rounded-xl">
                <TrendingDown className="h-8 w-8 mx-auto text-red-600 mb-2" />
                <p className="text-sm text-muted-foreground">Total Pembelian</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(transactionStats.totalPurchase)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {transactionStats.purchaseCount} transaksi
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Riwayat Transaksi
            </CardTitle>
            <CardDescription>
              {transactionsData?.meta?.total || 0} transaksi ditemukan
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select
              value={transactionType}
              onValueChange={(val) => {
                setTransactionType(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Semua Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Semua Tipe</SelectItem>
                {TRANSACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="flex justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : transactionsData?.data?.length === 0 ? (
            <div className="text-center p-8">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Belum ada transaksi</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Referensi</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead className="text-right">Saldo Sebelum</TableHead>
                  <TableHead className="text-right">Saldo Setelah</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactionsData?.data?.map((tx: WalletTransaction) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {new Date(tx.createdAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getTransactionTypeColor(tx.type)}>
                        {tx.type === "TOPUP" && (
                          <ArrowUpRight className="h-3 w-3 mr-1" />
                        )}
                        {tx.type === "PURCHASE" && (
                          <ArrowDownRight className="h-3 w-3 mr-1" />
                        )}
                        {tx.type === "REFUND" && (
                          <ArrowLeftRight className="h-3 w-3 mr-1" />
                        )}
                        {tx.type === "TRANSFER" && (
                          <ArrowLeftRight className="h-3 w-3 mr-1" />
                        )}
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
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(tx.balanceBefore)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
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
          {transactionsData?.meta && transactionsData.meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Sebelumnya
              </Button>
              <span className="flex items-center px-4">
                Halaman {page} dari {transactionsData.meta.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= transactionsData.meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Selanjutnya
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
            <DialogDescription>
              Top up saldo untuk {wallet.student?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(wallet.balance)}
              </p>
            </div>

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

            {amount > 0 && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-muted-foreground">
                  Saldo Setelah Top Up
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(wallet.balance + amount)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={topUpMutation.isPending || amount <= 0}
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
              Kurangi saldo untuk {wallet.student?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(wallet.balance)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Nominal</Label>
              <Input
                type="number"
                placeholder="Masukkan nominal..."
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              {amount > wallet.balance && (
                <p className="text-sm text-red-600">Saldo tidak mencukupi</p>
              )}
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

            {amount > 0 && amount <= wallet.balance && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-muted-foreground">
                  Saldo Setelah Pengurangan
                </p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(wallet.balance - amount)}
                </p>
              </div>
            )}
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
                deductMutation.isPending ||
                amount <= 0 ||
                amount > wallet.balance
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
              Kembalikan saldo ke {wallet.student?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(wallet.balance)}
              </p>
            </div>

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

            {amount > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-muted-foreground">
                  Saldo Setelah Refund
                </p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(wallet.balance + amount)}
                </p>
              </div>
            )}
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
              disabled={refundMutation.isPending || amount <= 0 || !description}
            >
              {refundMutation.isPending && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              Refund {amount > 0 && formatCurrency(amount)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WalletDetailPage(props: Parameters<typeof WalletDetailPageContent>[0]) {
  return (
    <MainLayout>
      <WalletDetailPageContent {...props} />
    </MainLayout>
  );
}
