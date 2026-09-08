"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, Trash2, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useBill,
  useBillPayments,
  useCreatePayment,
  useDeletePayment,
  useDeleteBill,
  BILL_TYPES,
  BILL_STATUSES,
  PAYMENT_METHODS,
  PaymentMethod,
} from "@/hooks/use-finance";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function BillDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [showPayment, setShowPayment] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBillConfirm, setDeleteBillConfirm] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: bill, isLoading } = useBill(id);
  const { data: payments } = useBillPayments(id);

  const createPaymentMutation = useCreatePayment();
  const deletePaymentMutation = useDeletePayment();
  const deleteBillMutation = useDeleteBill();

  const remainingAmount = bill ? bill.amount - bill.paidAmount : 0;

  const handleCreatePayment = async () => {
    if (paymentAmount <= 0) {
      toast.error("Jumlah pembayaran harus lebih dari 0");
      return;
    }

    if (paymentAmount > remainingAmount) {
      toast.error("Jumlah pembayaran melebihi sisa tagihan");
      return;
    }

    try {
      await createPaymentMutation.mutateAsync({
        billId: id,
        amount: paymentAmount,
        paymentMethod,
        paymentDate,
        notes: paymentNotes || undefined,
      });
      toast.success("Pembayaran berhasil dicatat");
      setShowPayment(false);
      setPaymentAmount(0);
      setPaymentNotes("");
    } catch {
      toast.error("Gagal mencatat pembayaran");
    }
  };

  const handleDeletePayment = async () => {
    if (!deleteId) return;
    try {
      await deletePaymentMutation.mutateAsync(deleteId);
      toast.success("Pembayaran berhasil dihapus");
      setDeleteId(null);
    } catch {
      toast.error("Gagal menghapus pembayaran");
    }
  };

  const handleDeleteBill = async () => {
    try {
      await deleteBillMutation.mutateAsync(id);
      toast.success("Tagihan berhasil dihapus");
      router.push("/finance");
    } catch {
      toast.error("Gagal menghapus tagihan");
    }
  };

  const getStatusBadge = (status: string) => {
    const statusInfo = BILL_STATUSES.find((s) => s.value === status);
    return statusInfo ? (
      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
    ) : (
      <Badge variant="secondary">{status}</Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Receipt className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Tagihan tidak ditemukan</h3>
        <Button asChild className="mt-4">
          <Link href="/finance">Kembali</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/finance">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                Detail Tagihan
              </h1>
              {getStatusBadge(bill.status)}
            </div>
            <p className="text-muted-foreground font-mono">
              #{bill.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
        {bill.status !== "PAID" && bill.status !== "CANCELLED" && (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => setDeleteBillConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </Button>
            <Dialog open={showPayment} onOpenChange={setShowPayment}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Catat Pembayaran
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Catat Pembayaran</DialogTitle>
                  <DialogDescription>
                    Sisa tagihan: {formatCurrency(remainingAmount)}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Jumlah Pembayaran</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(Number(e.target.value))}
                      max={remainingAmount}
                    />
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => setPaymentAmount(remainingAmount)}
                    >
                      Bayar penuh ({formatCurrency(remainingAmount)})
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="method">Metode Pembayaran</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(v) =>
                        setPaymentMethod(v as PaymentMethod)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date">Tanggal Pembayaran</Label>
                    <Input
                      id="date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Catatan (Opsional)</Label>
                    <Textarea
                      id="notes"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowPayment(false)}
                    >
                      Batal
                    </Button>
                    <Button
                      onClick={handleCreatePayment}
                      disabled={createPaymentMutation.isPending}
                    >
                      {createPaymentMutation.isPending
                        ? "Menyimpan..."
                        : "Simpan"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Bill Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informasi Tagihan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Jenis Tagihan</p>
                <p className="font-medium">
                  {BILL_TYPES.find((t) => t.value === bill.billType)?.label ||
                    bill.billType}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tahun Ajaran</p>
                <p className="font-medium">{bill.academicYear?.name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Jatuh Tempo</p>
                <p className="font-medium">
                  {new Date(bill.dueDate).toLocaleDateString("id-ID", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dibuat</p>
                <p className="font-medium">
                  {new Date(bill.createdAt).toLocaleDateString("id-ID")}
                </p>
              </div>
            </div>
            {bill.description && (
              <div>
                <p className="text-sm text-muted-foreground">Keterangan</p>
                <p className="font-medium">{bill.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informasi Santri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nama</p>
                <p className="font-medium">{bill.student?.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">NISN</p>
                <p className="font-medium font-mono">{bill.student?.nisn}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/students/${bill.studentId}`}>
                Lihat Profil Santri
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Payment Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">Total Tagihan</p>
              <p className="text-2xl font-bold">
                {formatCurrency(bill.amount)}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm text-green-600">Terbayar</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(bill.paidAmount)}
              </p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <p className="text-sm text-yellow-600">Sisa</p>
              <p className="text-2xl font-bold text-yellow-600">
                {formatCurrency(remainingAmount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Pembayaran</CardTitle>
          <CardDescription>Daftar pembayaran untuk tagihan ini</CardDescription>
        </CardHeader>
        <CardContent>
          {payments && payments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Kuitansi</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-sm">
                      {payment.receiptNumber}
                    </TableCell>
                    <TableCell>
                      {new Date(payment.paymentDate).toLocaleDateString(
                        "id-ID",
                      )}
                    </TableCell>
                    <TableCell>
                      {PAYMENT_METHODS.find(
                        (m) => m.value === payment.paymentMethod,
                      )?.label || payment.paymentMethod}
                    </TableCell>
                    <TableCell className="font-medium text-green-600">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.notes || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(payment.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Belum ada pembayaran</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Payment Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open: boolean) => !open && setDeleteId(null)}
        title="Hapus Pembayaran"
        description="Apakah Anda yakin ingin menghapus pembayaran ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        onConfirm={handleDeletePayment}
        isLoading={deletePaymentMutation.isPending}
        variant="destructive"
      />

      {/* Delete Bill Dialog */}
      <ConfirmDialog
        open={deleteBillConfirm}
        onOpenChange={setDeleteBillConfirm}
        title="Hapus Tagihan"
        description="Apakah Anda yakin ingin menghapus tagihan ini beserta semua riwayat pembayarannya?"
        confirmLabel="Hapus"
        onConfirm={handleDeleteBill}
        isLoading={deleteBillMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}

export default function BillDetailPage(props: Parameters<typeof BillDetailPageContent>[0]) {
  return (
    <MainLayout>
      <BillDetailPageContent {...props} />
    </MainLayout>
  );
}
