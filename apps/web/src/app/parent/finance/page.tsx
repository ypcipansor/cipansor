"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
// Children come from `useParentChildren`'s shared `ParentChild` shape.
// Each of these pages used to declare its own local `Child` with a nested
// `student` object the API never returns — see use-parent-portal.ts.
import type { ParentChild } from "@/hooks/use-parent-portal";
import {
  Receipt,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Printer,
  History,
  FileText,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  paymentType: {
    id: string;
    name: string;
    code: string;
  };
  payments: Array<{
    id: string;
    amount: number;
    paidAt: string;
    method: string;
    receiptNumber?: string;
    verificationStatus?: string;
    rejectionReason?: string | null;
  }>;
  createdAt: string;
}

interface FinanceSummary {
  totalInvoices: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  pendingCount: number;
  overdueCount: number;
}

interface WalletData {
  id: string;
  balance: number;
  transactions: Array<{
    id: string;
    type: "TOP_UP" | "DEDUCT" | "TRANSFER" | "REFUND";
    amount: number;
    balanceAfter: number;
    referenceType?: string;
    description?: string;
    createdAt: string;
  }>;
  spendingLimit?: number;
}

const verificationBadge = (status?: string) => {
  switch (status) {
    case "PENDING_VERIFICATION":
      return (
        <Badge variant="secondary" className="text-xs">
          <Clock className="h-3 w-3 mr-1" /> Menunggu Verifikasi TU
        </Badge>
      );
    case "TU_APPROVED":
      return (
        <Badge className="bg-blue-500 text-xs">
          <Clock className="h-3 w-3 mr-1" /> Diverifikasi TU
        </Badge>
      );
    case "REJECTED":
      return (
        <Badge variant="destructive" className="text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" /> Ditolak
        </Badge>
      );
    default:
      return null;
  }
};

function UploadProofDialog({
  invoice,
  open,
  onClose,
  onSuccess,
}: {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [referenceNo, setReferenceNo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const remaining = invoice
    ? Number(invoice.amount) - Number(invoice.paidAmount)
    : 0;

  useEffect(() => {
    if (invoice) {
      setAmount(String(remaining));
      setFile(null);
      setReferenceNo("");
      setMethod("BANK_TRANSFER");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  const submit = async () => {
    if (!invoice) return;
    if (!file) {
      toast.error("Pilih berkas bukti pembayaran terlebih dahulu");
      return;
    }
    const value = Number(amount);
    if (!value || value <= 0 || value > remaining) {
      toast.error("Nominal harus di antara 1 dan sisa tagihan");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const proofUrl: string =
        uploadRes.data?.data?.url ?? uploadRes.data?.data?.fileUrl;
      if (!proofUrl) throw new Error("Upload gagal");

      await api.post(`/finance/invoices/${invoice.id}/payment-proof`, {
        amount: value,
        method,
        referenceNo: referenceNo || undefined,
        proofUrl,
      });

      toast.success(
        "Bukti pembayaran terkirim — menunggu verifikasi Tata Usaha",
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to submit payment proof:", err);
      toast.error("Gagal mengirim bukti pembayaran. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Upload Bukti Pembayaran</DialogTitle>
          <DialogDescription>
            {invoice
              ? `${invoice.paymentType.name} — ${invoice.invoiceNumber}. Setelah diverifikasi Tata Usaha, Anda akan menerima notifikasi pembayaran berhasil.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proof-amount">Nominal (Rp)</Label>
            <Input
              id="proof-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sisa tagihan:{" "}
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(remaining)}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Metode Pembayaran</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">Transfer Bank</SelectItem>
                <SelectItem value="VIRTUAL_ACCOUNT">Virtual Account</SelectItem>
                <SelectItem value="EWALLET">E-Wallet</SelectItem>
                <SelectItem value="OTHER">Lainnya</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof-ref">No. Referensi (Opsional)</Label>
            <Input
              id="proof-ref"
              placeholder="cth: nomor transaksi transfer"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof-file">Berkas Bukti (JPG/PNG/PDF)</Label>
            <Input
              id="proof-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} disabled={submitting || !file}>
            {submitting ? "Mengirim…" : "Kirim Bukti"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FinancePage() {
  const searchParams = useSearchParams();
  const selectedStudentId = searchParams.get("studentId");

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [proofInvoice, setProofInvoice] = useState<Invoice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        const res = await api.get("/parent/children");
        const childrenData = res.data.data || [];
        setChildren(childrenData);

        if (childrenData.length > 0) {
          const defaultChild = selectedStudentId
            ? childrenData.find((c: ParentChild) => c.id === selectedStudentId)
                ?.id
            : childrenData[0].id;
          setSelectedChild(defaultChild || childrenData[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch children:", err);
      }
    };

    fetchChildren();
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedChild) return;

    const fetchFinance = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/parent/children/${selectedChild}/finance`);
        setInvoices(res.data.data.invoices || []);
        setSummary(res.data.data.summary || null);
      } catch (err) {
        console.error("Failed to fetch finance:", err);
      } finally {
        setLoading(false);
      }
    };

    const fetchWallet = async () => {
      setWalletLoading(true);
      try {
        const res = await api.get(`/wallet/${selectedChild}`);
        if (res.data.data) {
          const txRes = await api.get(
            `/wallet/${selectedChild}/transactions?limit=10`,
          );
          setWallet({
            id: res.data.data.id,
            balance: res.data.data.balance,
            spendingLimit: res.data.data.spendingLimit,
            transactions: txRes.data.data || [],
          });
        }
      } catch (err) {
        console.error("Failed to fetch wallet:", err);
        setWallet(null);
      } finally {
        setWalletLoading(false);
      }
    };

    fetchFinance();
    fetchWallet();
  }, [selectedChild, reloadKey]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" /> Lunas
          </Badge>
        );
      case "PARTIAL":
        return (
          <Badge className="bg-yellow-500">
            <Clock className="h-3 w-3 mr-1" /> Sebagian
          </Badge>
        );
      case "PENDING":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" /> Belum Bayar
          </Badge>
        );
      case "OVERDUE":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" /> Jatuh Tempo
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Keuangan</h1>
          <p className="text-muted-foreground">
            Lihat tagihan dan riwayat pembayaran
          </p>
        </div>
        {children.length > 1 && (
          <Select value={selectedChild} onValueChange={setSelectedChild}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Pilih Anak" />
            </SelectTrigger>
            <SelectContent>
              {children.map((child) => (
                <SelectItem key={child.id} value={child.id}>
                  {child.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Receipt className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Tagihan
                      </p>
                      <p className="text-xl font-bold">
                        {formatCurrency(summary.totalAmount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Sudah Dibayar
                      </p>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(summary.totalPaid)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-yellow-100 rounded-lg">
                      <Clock className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Belum Lunas
                      </p>
                      <p className="text-xl font-bold text-yellow-600">
                        {formatCurrency(summary.totalOutstanding)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Jatuh Tempo
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        {summary.overdueCount}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Wallet className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Saldo Dompet
                      </p>
                      <p className="text-xl font-bold text-indigo-600">
                        {wallet ? formatCurrency(wallet.balance) : "-"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Invoice List */}
          <Tabs defaultValue="invoices" className="space-y-4">
            <TabsList>
              <TabsTrigger value="invoices" className="gap-2">
                <FileText className="h-4 w-4" />
                Daftar Tagihan
              </TabsTrigger>
              <TabsTrigger value="wallet" className="gap-2">
                <Wallet className="h-4 w-4" />
                Dompet Santri
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                Riwayat Pembayaran
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invoices">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Daftar Tagihan
                  </CardTitle>
                  <CardDescription>
                    {invoices.length} tagihan tercatat
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {invoices.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Belum ada tagihan
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {invoices.map((invoice) => (
                        <Card key={invoice.id} className="overflow-hidden">
                          <CardContent className="p-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {invoice.paymentType.name}
                                  </p>
                                  {getStatusBadge(invoice.status)}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {invoice.invoiceNumber}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Jatuh tempo:{" "}
                                  {new Date(invoice.dueDate).toLocaleDateString(
                                    "id-ID",
                                    {
                                      day: "numeric",
                                      month: "long",
                                      year: "numeric",
                                    },
                                  )}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold">
                                  {formatCurrency(Number(invoice.amount))}
                                </p>
                                {invoice.status === "PARTIAL" && (
                                  <p className="text-sm text-muted-foreground">
                                    Dibayar:{" "}
                                    {formatCurrency(Number(invoice.paidAmount))}
                                  </p>
                                )}
                                {invoice.status !== "PAID" && (
                                  <p className="text-sm text-yellow-600">
                                    Sisa:{" "}
                                    {formatCurrency(
                                      Number(invoice.amount) -
                                        Number(invoice.paidAmount),
                                    )}
                                  </p>
                                )}
                                {invoice.status !== "PAID" &&
                                  invoice.status !== "CANCELLED" && (
                                    <Button
                                      size="sm"
                                      className="mt-2 gap-1"
                                      onClick={() => setProofInvoice(invoice)}
                                    >
                                      <Upload className="h-4 w-4" /> Upload
                                      Bukti Bayar
                                    </Button>
                                  )}
                              </div>
                            </div>

                            {/* Payment History */}
                            {invoice.payments.length > 0 && (
                              <div className="mt-4 pt-4 border-t">
                                <p className="text-sm font-medium mb-2">
                                  Riwayat Pembayaran:
                                </p>
                                <div className="space-y-2">
                                  {invoice.payments.map((payment) => (
                                    <div
                                      key={payment.id}
                                      className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded"
                                    >
                                      <div>
                                        <span>
                                          {new Date(
                                            payment.paidAt,
                                          ).toLocaleDateString("id-ID")}
                                        </span>
                                        {payment.receiptNumber && (
                                          <span className="text-muted-foreground ml-2">
                                            ({payment.receiptNumber})
                                          </span>
                                        )}
                                        <span className="ml-2">
                                          {verificationBadge(
                                            payment.verificationStatus,
                                          )}
                                        </span>
                                        {payment.verificationStatus ===
                                          "REJECTED" &&
                                          payment.rejectionReason && (
                                            <p className="text-xs text-destructive mt-1">
                                              Alasan: {payment.rejectionReason}
                                            </p>
                                          )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-green-600">
                                          {formatCurrency(
                                            Number(payment.amount),
                                          )}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          asChild
                                          title="Cetak Kwitansi"
                                        >
                                          <Link
                                            href={`/finance/payments/${payment.id}/receipt`}
                                            target="_blank"
                                          >
                                            <Printer className="h-4 w-4" />
                                          </Link>
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="wallet">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Dompet Santri
                  </CardTitle>
                  <CardDescription>
                    Saldo dan riwayat transaksi dompet digital santri
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {walletLoading ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !wallet ? (
                    <div className="text-center py-8">
                      <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        Dompet belum diaktifkan untuk santri ini
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Hubungi admin untuk mengaktifkan dompet digital
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Balance Card */}
                      <div className="p-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 text-white">
                        <p className="text-blue-100 text-sm">Saldo Tersedia</p>
                        <p className="text-3xl font-bold mt-1">
                          {formatCurrency(wallet.balance)}
                        </p>
                        <p className="text-blue-200 text-xs mt-2">
                          Dapat digunakan untuk pembayaran di kantin, laundry,
                          dll
                        </p>
                        <div className="mt-4 flex gap-3">
                          <Button
                            className="bg-white text-blue-600 hover:bg-blue-50"
                            onClick={() =>
                              toast.info(
                                "Fitur Top Up Online akan segera hadir. Silakan Top Up melalui Admin/Kasir.",
                              )
                            }
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Top Up Saldo
                          </Button>
                        </div>
                      </div>

                      {/* Limit & Alerts */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {wallet.spendingLimit ? (
                          <div className="p-4 border rounded-lg bg-slate-50 flex items-center gap-3">
                            <ShieldAlert className="h-8 w-8 text-orange-500" />
                            <div>
                              <p className="text-sm font-medium">
                                Limit Belanja Harian
                              </p>
                              <p className="text-lg font-bold">
                                {formatCurrency(wallet.spendingLimit)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 border rounded-lg bg-slate-50 flex items-center gap-3">
                            <CheckCircle className="h-8 w-8 text-green-500" />
                            <div>
                              <p className="text-sm font-medium">
                                Limit Belanja
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Tidak ada batasan
                              </p>
                            </div>
                          </div>
                        )}

                        {wallet.balance < 20000 && (
                          <div className="p-4 border rounded-lg bg-red-50 flex items-center gap-3">
                            <AlertTriangle className="h-8 w-8 text-red-500" />
                            <div>
                              <p className="text-sm font-medium text-red-700">
                                Saldo Menipis
                              </p>
                              <p className="text-xs text-red-600">
                                Segera lakukan Top Up agar santri dapat
                                berbelanja.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Transactions */}
                      <div>
                        <h4 className="font-medium mb-4">Riwayat Transaksi</h4>
                        {wallet.transactions.length === 0 ? (
                          <p className="text-center text-muted-foreground py-4">
                            Belum ada transaksi
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {wallet.transactions.map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center justify-between p-3 rounded-lg border"
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`p-2 rounded-full ${
                                      tx.type === "TOP_UP" ||
                                      tx.type === "REFUND"
                                        ? "bg-green-100 text-green-600"
                                        : "bg-red-100 text-red-600"
                                    }`}
                                  >
                                    {tx.type === "TOP_UP" ||
                                    tx.type === "REFUND" ? (
                                      <ArrowDownRight className="h-4 w-4" />
                                    ) : (
                                      <ArrowUpRight className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">
                                      {tx.type === "TOP_UP" && "Top Up"}
                                      {tx.type === "DEDUCT" && "Pembayaran"}
                                      {tx.type === "TRANSFER" && "Transfer"}
                                      {tx.type === "REFUND" && "Pengembalian"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {tx.description ||
                                        tx.referenceType ||
                                        "-"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(
                                        tx.createdAt,
                                      ).toLocaleDateString("id-ID", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p
                                    className={`font-bold ${
                                      tx.type === "TOP_UP" ||
                                      tx.type === "REFUND"
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {tx.type === "TOP_UP" ||
                                    tx.type === "REFUND"
                                      ? "+"
                                      : "-"}
                                    {formatCurrency(tx.amount)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Saldo: {formatCurrency(tx.balanceAfter)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Riwayat Pembayaran
                  </CardTitle>
                  <CardDescription>
                    Daftar semua pembayaran yang telah dilakukan
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {invoices.flatMap((i) => i.payments).length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Belum ada pembayaran
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>No. Kwitansi</TableHead>
                          <TableHead>Jenis Tagihan</TableHead>
                          <TableHead>Metode</TableHead>
                          <TableHead className="text-right">Nominal</TableHead>
                          <TableHead className="w-20">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices
                          .flatMap((invoice) =>
                            invoice.payments.map((payment) => ({
                              ...payment,
                              invoiceType: invoice.paymentType.name,
                              invoiceNumber: invoice.invoiceNumber,
                            })),
                          )
                          .sort(
                            (a, b) =>
                              new Date(b.paidAt).getTime() -
                              new Date(a.paidAt).getTime(),
                          )
                          .map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>
                                {new Date(payment.paidAt).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {payment.receiptNumber || "-"}
                              </TableCell>
                              <TableCell>{payment.invoiceType}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {payment.method === "CASH"
                                    ? "Tunai"
                                    : payment.method === "TRANSFER"
                                      ? "Transfer"
                                      : payment.method === "QRIS"
                                        ? "QRIS"
                                        : payment.method === "VA"
                                          ? "Virtual Account"
                                          : payment.method}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                {formatCurrency(Number(payment.amount))}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  title="Cetak Kwitansi"
                                >
                                  <Link
                                    href={`/finance/payments/${payment.id}/receipt`}
                                    target="_blank"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
      <UploadProofDialog
        invoice={proofInvoice}
        open={!!proofInvoice}
        onClose={() => setProofInvoice(null)}
        onSuccess={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
