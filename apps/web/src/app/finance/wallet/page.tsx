"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUpdateWalletLimit } from "@/hooks/use-wallet";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet,
  Plus,
  Search,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  Users,
  Banknote,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";

// Types
interface WalletData {
  id: string;
  studentId: string; // Ensure studentId is part of the interface
  studentName: string;
  studentNisn: string;
  unitName?: string;
  className?: string;
  balance: number;
  spendingLimit?: number;
  lastTopUp?: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  walletId: string;
  studentName: string;
  type: "TOPUP" | "PURCHASE" | "REFUND" | "TRANSFER";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string;
  referenceType?: string;
  createdBy?: string;
  createdAt: string;
}

interface WalletSummary {
  totalWallets: number;
  totalBalance: number;
  averageBalance: number;
  walletsWithLowBalance: number;
  todayTransactions: number;
  todayTopUps: number;
  todayPurchases: number;
}

// API functions
const api = {
  getWallets: async (params: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    data: WalletData[];
    meta: { total: number; totalPages: number };
  }> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    if (params.search) searchParams.set("search", params.search);

    const res = await fetch(`/api/wallet?${searchParams}`);
    if (!res.ok) throw new Error("Failed to fetch wallets");
    const json = await res.json();
    return { data: json.data, meta: json.pagination };
  },

  getSummary: async (): Promise<WalletSummary> => {
    const res = await fetch("/api/wallet/summary");
    if (!res.ok) throw new Error("Failed to fetch summary");
    const json = await res.json();
    return json.data;
  },

  getTransactions: async (params: {
    page?: number;
    limit?: number;
    studentId?: string;
    type?: string;
  }): Promise<{
    data: Transaction[];
    meta: { total: number; totalPages: number };
  }> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    if (params.studentId) searchParams.set("studentId", params.studentId);
    if (params.type) searchParams.set("type", params.type);

    const res = await fetch(`/api/wallet/transactions?${searchParams}`);
    if (!res.ok) throw new Error("Failed to fetch transactions");
    const json = await res.json();
    return { data: json.data, meta: json.pagination };
  },

  topUp: async (data: {
    studentId: string;
    amount: number;
    description?: string;
    paymentMethod: string;
  }) => {
    const res = await fetch("/api/wallet/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || "Failed to top up");
    }
    return res.json();
  },

  deduct: async (data: {
    studentId: string;
    amount: number;
    description?: string;
  }) => {
    const res = await fetch("/api/wallet/deduct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || "Failed to deduct");
    }
    return res.json();
  },
};

// Format currency
const formatRupiah = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Format date
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function WalletPageContent() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("wallets");
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [topUpForm, setTopUpForm] = useState({
    amount: "",
    description: "",
    paymentMethod: "CASH",
  });
  const [transactionFilter, setTransactionFilter] = useState("");

  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitForm, setLimitForm] = useState({ limit: "" });
  const updateLimit = useUpdateWalletLimit();

  // Queries
  const { data: walletsData, isLoading: walletsLoading } = useQuery({
    queryKey: ["wallets", search],
    queryFn: () => api.getWallets({ search, limit: 20 }),
  });

  const { data: summary } = useQuery({
    queryKey: ["wallet-summary"],
    queryFn: api.getSummary,
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ["wallet-transactions", transactionFilter],
    queryFn: () =>
      api.getTransactions({ type: transactionFilter || undefined, limit: 50 }),
  });

  // Mutations
  const topUpMutation = useMutation({
    mutationFn: api.topUp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-summary"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      toast.success("Top up berhasil");
      setTopUpDialogOpen(false);
      setSelectedWallet(null);
      setTopUpForm({ amount: "", description: "", paymentMethod: "CASH" });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleTopUp = () => {
    if (!selectedWallet || !topUpForm.amount) return;
    topUpMutation.mutate({
      studentId: selectedWallet.studentId,
      amount: Number(topUpForm.amount),
      description: topUpForm.description || undefined,
      paymentMethod: topUpForm.paymentMethod,
    });
  };

  const openTopUpDialog = (wallet: WalletData) => {
    setSelectedWallet(wallet);
    setTopUpDialogOpen(true);
  };

  const handleUpdateLimit = async () => {
    if (!selectedWallet || !limitForm.limit) return;
    try {
      await updateLimit.mutateAsync({
        studentId: selectedWallet.studentId,
        limit: Number(limitForm.limit),
      });
      setLimitDialogOpen(false);
      setSelectedWallet(null);
      setLimitForm({ limit: "" });
    } catch (error) {
      // toast handled by hook
    }
  };

  const openLimitDialog = (wallet: WalletData) => {
    setSelectedWallet(wallet);
    setLimitForm({ limit: wallet.spendingLimit?.toString() || "" });
    setLimitDialogOpen(true);
  };

  // Stats cards data
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
        value: formatRupiah(summary?.totalBalance || 0),
        icon: Banknote,
        color: "text-green-600",
        bgColor: "bg-green-100",
      },
      {
        title: "Rata-rata Saldo",
        value: formatRupiah(summary?.averageBalance || 0),
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
        subtitle: "< Rp 50.000",
      },
    ],
    [summary],
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-8 w-8 text-primary" />
            Wallet Santri
          </h1>
          <p className="text-muted-foreground mt-1">
            Kelola saldo wallet santri untuk transaksi internal
          </p>
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

      {/* Today's Activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CreditCard className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Transaksi Hari Ini
              </p>
              <p className="text-xl font-semibold">
                {summary?.todayTransactions || 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <ArrowDownLeft className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Top Up Hari Ini</p>
              <p className="text-xl font-semibold text-green-600">
                {formatRupiah(summary?.todayTopUps || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 bg-orange-100 rounded-lg">
              <ArrowUpRight className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Pembelian Hari Ini
              </p>
              <p className="text-xl font-semibold text-orange-600">
                {formatRupiah(summary?.todayPurchases || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
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

        <TabsContent value="wallets" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Daftar Wallet Santri</CardTitle>
                  <CardDescription>
                    Kelola saldo dan lakukan top up untuk santri
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari santri..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      queryClient.invalidateQueries({ queryKey: ["wallets"] })
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
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
                      <TableHead>NISN</TableHead>
                      <TableHead>Nama Santri</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Top Up Terakhir</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {walletsData?.data.map((wallet) => (
                      <TableRow key={wallet.id}>
                        <TableCell className="font-mono">
                          {wallet.studentNisn}
                        </TableCell>
                        <TableCell className="font-medium">
                          {wallet.studentName}
                        </TableCell>
                        <TableCell>{wallet.className || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-semibold ${
                                wallet.balance < 50000
                                  ? "text-red-600"
                                  : "text-green-600"
                              }`}
                            >
                              {formatRupiah(wallet.balance)}
                            </span>
                            {wallet.spendingLimit && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <ShieldAlert className="h-3 w-3" />
                                Limit: {formatRupiah(wallet.spendingLimit)}/hari
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {wallet.lastTopUp
                            ? formatDate(wallet.lastTopUp)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            onClick={() => openTopUpDialog(wallet)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Top Up
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-2"
                            onClick={() => openLimitDialog(wallet)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!walletsData?.data || walletsData.data.length === 0) && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          Tidak ada data wallet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Riwayat Transaksi</CardTitle>
                  <CardDescription>
                    Semua transaksi wallet santri
                  </CardDescription>
                </div>
                <Select
                  value={transactionFilter}
                  onValueChange={setTransactionFilter}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Semua Tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Tipe</SelectItem>
                    <SelectItem value="TOPUP">Top Up</SelectItem>
                    <SelectItem value="PURCHASE">Pembelian</SelectItem>
                    <SelectItem value="REFUND">Refund</SelectItem>
                    <SelectItem value="TRANSFER">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="text-right">Saldo Akhir</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionsData?.data.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">
                          {formatDate(tx.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {tx.studentName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              tx.type === "TOPUP"
                                ? "default"
                                : tx.type === "REFUND"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {tx.type === "TOPUP" && (
                              <ArrowDownLeft className="h-3 w-3 mr-1" />
                            )}
                            {tx.type === "PURCHASE" && (
                              <ArrowUpRight className="h-3 w-3 mr-1" />
                            )}
                            {tx.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
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
                            {formatRupiah(Math.abs(tx.amount))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatRupiah(tx.balanceAfter)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {tx.description || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!transactionsData?.data ||
                      transactionsData.data.length === 0) && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          Tidak ada transaksi
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Top Up Dialog */}
      <Dialog open={topUpDialogOpen} onOpenChange={setTopUpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up Wallet</DialogTitle>
            <DialogDescription>
              Top up saldo wallet untuk {selectedWallet?.studentName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-green-600">
                {formatRupiah(selectedWallet?.balance || 0)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Jumlah Top Up</Label>
              <Input
                type="number"
                placeholder="Masukkan jumlah"
                value={topUpForm.amount}
                onChange={(e) =>
                  setTopUpForm({ ...topUpForm, amount: e.target.value })
                }
              />
              <div className="flex gap-2 mt-2">
                {[50000, 100000, 200000, 500000].map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTopUpForm({ ...topUpForm, amount: amount.toString() })
                    }
                  >
                    {formatRupiah(amount)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <Select
                value={topUpForm.paymentMethod}
                onValueChange={(v) =>
                  setTopUpForm({ ...topUpForm, paymentMethod: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Tunai</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Transfer Bank</SelectItem>
                  <SelectItem value="QRIS">QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Keterangan (opsional)</Label>
              <Textarea
                placeholder="Tambahkan keterangan..."
                value={topUpForm.description}
                onChange={(e) =>
                  setTopUpForm({ ...topUpForm, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={!topUpForm.amount || topUpMutation.isPending}
            >
              {topUpMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Top Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Limit Dialog */}
      <Dialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur Limit Belanja Harian</DialogTitle>
            <DialogDescription>
              Batasi pengeluaran harian untuk {selectedWallet?.studentName}. Set
              ke 0 untuk menghapus limit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Limit Harian (Rp)</Label>
              <Input
                type="number"
                placeholder="Contoh: 20000"
                value={limitForm.limit}
                onChange={(e) => setLimitForm({ limit: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              {[10000, 20000, 50000].map((val) => (
                <Button
                  key={val}
                  variant="outline"
                  size="sm"
                  onClick={() => setLimitForm({ limit: val.toString() })}
                >
                  {formatRupiah(val)}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleUpdateLimit}
              disabled={updateLimit.isPending}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WalletPage() {
  return (
    <MainLayout>
      <WalletPageContent />
    </MainLayout>
  );
}
