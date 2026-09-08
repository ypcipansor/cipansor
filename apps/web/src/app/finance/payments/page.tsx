"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, Download, Printer, Search } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared";
import { MainLayout } from "@/components/layout";
import {
  usePayments,
  PAYMENT_METHODS,
  BILL_TYPES,
  PaymentMethod,
  Payment,
} from "@/hooks/use-finance";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function PaymentsPageContent() {
  const [page, setPage] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const limit = 20;

  const { data: paymentsData, isLoading } = usePayments({
    page,
    limit,
    paymentMethod: paymentMethod || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

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
            <h1 className="text-3xl font-bold tracking-tight">
              Riwayat Pembayaran
            </h1>
            <p className="text-muted-foreground">
              Lihat semua transaksi pembayaran
            </p>
          </div>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod | "")}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Metode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Semua Metode</SelectItem>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                placeholder="Dari"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-40"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                placeholder="Sampai"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>

            {(paymentMethod || startDate || endDate) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPaymentMethod("");
                  setStartDate("");
                  setEndDate("");
                }}
              >
                Reset Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : paymentsData?.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">
                Tidak ada pembayaran
              </h3>
              <p className="text-muted-foreground">
                Belum ada transaksi pembayaran
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Kuitansi</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Santri</TableHead>
                    <TableHead>Jenis Tagihan</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsData?.data.map((payment: Payment) => (
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
                        <div>
                          <p className="font-medium">
                            {payment.bill?.student?.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {payment.bill?.student?.nisn}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {BILL_TYPES.find(
                          (t) => t.value === payment.bill?.billType,
                        )?.label || payment.bill?.billType}
                      </TableCell>
                      <TableCell>
                        {PAYMENT_METHODS.find(
                          (m) => m.value === payment.paymentMethod,
                        )?.label || payment.paymentMethod}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            title="Cetak Kuitansi"
                          >
                            <Link
                              href={`/finance/payments/${payment.id}/receipt`}
                            >
                              <Printer className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/finance/bills/${payment.billId}`}>
                              Detail
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {paymentsData && paymentsData.meta.totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={paymentsData.meta.totalPages}
                  pageSize={limit}
                  total={paymentsData.meta.total}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <MainLayout>
      <PaymentsPageContent />
    </MainLayout>
  );
}
