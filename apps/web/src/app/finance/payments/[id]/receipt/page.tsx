"use client";

import { use } from "react";
import { safeFormat } from "@/lib/date";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayment, PAYMENT_METHODS, BILL_TYPES } from "@/hooks/use-finance";
import { useSettings } from "@/hooks/use-settings";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function terbilang(angka: number): string {
  const satuan = [
    "",
    "Satu",
    "Dua",
    "Tiga",
    "Empat",
    "Lima",
    "Enam",
    "Tujuh",
    "Delapan",
    "Sembilan",
    "Sepuluh",
    "Sebelas",
  ];

  if (angka < 12) {
    return satuan[angka];
  } else if (angka < 20) {
    return satuan[angka - 10] + " Belas";
  } else if (angka < 100) {
    return satuan[Math.floor(angka / 10)] + " Puluh " + satuan[angka % 10];
  } else if (angka < 200) {
    return "Seratus " + terbilang(angka - 100);
  } else if (angka < 1000) {
    return satuan[Math.floor(angka / 100)] + " Ratus " + terbilang(angka % 100);
  } else if (angka < 2000) {
    return "Seribu " + terbilang(angka - 1000);
  } else if (angka < 1000000) {
    return (
      terbilang(Math.floor(angka / 1000)) + " Ribu " + terbilang(angka % 1000)
    );
  } else if (angka < 1000000000) {
    return (
      terbilang(Math.floor(angka / 1000000)) +
      " Juta " +
      terbilang(angka % 1000000)
    );
  } else if (angka < 1000000000000) {
    return (
      terbilang(Math.floor(angka / 1000000000)) +
      " Miliar " +
      terbilang(angka % 1000000000)
    );
  }
  return "";
}

interface ReceiptPageProps {
  params: Promise<{ id: string }>;
}

export default function PaymentReceiptPage({ params }: ReceiptPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: payment, isLoading, error } = usePayment(id);
  const { data: settings } = useSettings();

  // Get institution info from settings
  const institutionName =
    settings?.institutionName || "Yayasan Pendidikan Islam";
  const institutionAddress = settings?.institutionAddress || "";
  const institutionPhone = settings?.institutionPhone || "";
  const institutionEmail = settings?.institutionEmail || "";

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-destructive">Gagal memuat data pembayaran</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/finance/payments">Kembali</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header - Hidden when printing */}
      <div className="print:hidden flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/finance/payments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Kuitansi Pembayaran</h1>
            <p className="text-muted-foreground">
              {payment?.receiptNumber || "Loading..."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={isLoading || isPrinting}
          >
            <Printer className="mr-2 h-4 w-4" />
            {isPrinting ? "Mencetak..." : "Cetak"}
          </Button>
        </div>
      </div>

      {/* Receipt Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-8 w-1/2 mx-auto" />
            <Skeleton className="h-4 w-1/3 mx-auto" />
            <div className="h-px bg-border my-4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ) : payment ? (
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="p-8 print:p-0">
            <div ref={receiptRef} className="space-y-6 max-w-2xl mx-auto">
              {/* Institution Header */}
              <div className="text-center border-b-2 border-black pb-4">
                <h1 className="text-xl font-bold uppercase">
                  {institutionName}
                </h1>
                {institutionAddress && (
                  <p className="text-sm">{institutionAddress}</p>
                )}
                {(institutionPhone || institutionEmail) && (
                  <p className="text-sm">
                    {institutionPhone && `Telp: ${institutionPhone}`}
                    {institutionPhone && institutionEmail && " | "}
                    {institutionEmail && `Email: ${institutionEmail}`}
                  </p>
                )}
              </div>

              {/* Receipt Title */}
              <div className="text-center">
                <h2 className="text-lg font-bold uppercase underline">
                  KUITANSI PEMBAYARAN
                </h2>
                <p className="text-sm mt-1">
                  No:{" "}
                  <span className="font-mono font-bold">
                    {payment.receiptNumber}
                  </span>
                </p>
              </div>

              {/* Receipt Details */}
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>Telah Diterima Dari</span>
                  <span>
                    : <strong>{payment.bill?.student?.name || "-"}</strong>
                  </span>
                </div>
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>NISN</span>
                  <span>: {payment.bill?.student?.nisn || "-"}</span>
                </div>
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>Kelas</span>
                  <span>: {payment.bill?.student?.class?.name || "-"}</span>
                </div>
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>Tahun Ajaran</span>
                  <span>: {payment.bill?.academicYear?.name || "-"}</span>
                </div>
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>Uang Sebesar</span>
                  <span>
                    :{" "}
                    <strong className="text-lg">
                      {formatCurrency(payment.amount)}
                    </strong>
                  </span>
                </div>
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>Terbilang</span>
                  <span className="italic">
                    : {terbilang(payment.amount).trim()} Rupiah
                  </span>
                </div>
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>Untuk Pembayaran</span>
                  <span>
                    :{" "}
                    {BILL_TYPES.find((t) => t.value === payment.bill?.billType)
                      ?.label || payment.bill?.billType}
                    {payment.bill?.description &&
                      ` - ${payment.bill.description}`}
                  </span>
                </div>
                <div className="grid grid-cols-[140px,1fr] gap-2">
                  <span>Metode Pembayaran</span>
                  <span>
                    :{" "}
                    {PAYMENT_METHODS.find(
                      (m) => m.value === payment.paymentMethod,
                    )?.label || payment.paymentMethod}
                  </span>
                </div>
                {payment.notes && (
                  <div className="grid grid-cols-[140px,1fr] gap-2">
                    <span>Catatan</span>
                    <span>: {payment.notes}</span>
                  </div>
                )}
              </div>

              {/* Signature Section */}
              <div className="flex justify-end pt-8">
                <div className="text-center">
                  <p className="text-sm">
                    {safeFormat(new Date(payment.paymentDate), "d MMMM yyyy", {
                      locale: localeId,
                    })}
                  </p>
                  <p className="text-sm mt-1">Petugas,</p>
                  <div className="h-20" /> {/* Space for signature */}
                  <p className="text-sm border-t border-black pt-1 min-w-[150px]">
                    {payment.verifiedBy || "(.........................)"}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-muted-foreground pt-4 border-t">
                <p>Kuitansi ini merupakan bukti pembayaran yang sah.</p>
                <p>Simpan kuitansi ini sebagai bukti pembayaran.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:border-0,
          .print\\:border-0 * {
            visibility: visible;
          }
          .print\\:border-0 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: A5;
            margin: 1cm;
          }
        }
      `}</style>
    </MainLayout>
  );
}
