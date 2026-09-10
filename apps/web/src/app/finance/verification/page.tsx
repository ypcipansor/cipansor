"use client";

import { getEffectiveRole } from "@/lib/rbac";
import { useState } from "react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ExternalLink, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import {
  usePaymentVerifications,
  useVerifyPayment,
  type PaymentVerificationStatus,
  type VerifiablePayment,
} from "@/hooks/use-payment-verification";

function formatCurrency(amount: string | number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(amount));
}

function PaymentCard({
  payment,
  isAdmin,
}: {
  payment: VerifiablePayment;
  isAdmin: boolean;
}) {
  const verify = useVerifyPayment();
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const act = (
    action: "TU_APPROVE" | "FINAL_APPROVE" | "REJECT",
    rejectionReason?: string,
  ) => {
    verify.mutate(
      { paymentId: payment.id, action, rejectionReason },
      {
        onSuccess: () => {
          toast.success(
            action === "REJECT"
              ? "Bukti pembayaran ditolak"
              : action === "TU_APPROVE"
                ? "Diverifikasi TU — menunggu persetujuan akhir"
                : "Pembayaran disahkan dan tercatat",
          );
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Gagal memproses",
          );
        },
      },
    );
  };

  const isPending = payment.verificationStatus === "PENDING_VERIFICATION";
  const isTuApproved = payment.verificationStatus === "TU_APPROVED";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-semibold">
              {payment.invoice.student.user.name}{" "}
              <span className="text-muted-foreground font-normal">
                (NISN {payment.invoice.student.nisn})
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {payment.invoice.paymentType.name} •{" "}
              {payment.invoice.invoiceNumber} • {payment.method}
              {payment.referenceNo ? ` • Ref: ${payment.referenceNo}` : ""}
            </p>
            <p className="text-lg font-bold">
              {formatCurrency(payment.amount)}
            </p>
            {isTuApproved && payment.tuVerifiedBy && (
              <Badge variant="outline" className="text-blue-700">
                Diverifikasi TU: {payment.tuVerifiedBy.name}
              </Badge>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {payment.proofUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={payment.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Lihat Bukti
                </a>
              </Button>
            ) : (
              <Badge variant="secondary">Tanpa bukti</Badge>
            )}
            <div className="flex gap-2">
              {isPending && (
                <Button
                  size="sm"
                  onClick={() => act("TU_APPROVE")}
                  disabled={verify.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Verifikasi TU
                </Button>
              )}
              {isTuApproved && isAdmin && (
                <Button
                  size="sm"
                  onClick={() => act("FINAL_APPROVE")}
                  disabled={verify.isPending}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Sahkan
                </Button>
              )}
              {(isPending || isTuApproved) && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowReject((v) => !v)}
                  disabled={verify.isPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Tolak
                </Button>
              )}
            </div>
          </div>
        </div>
        {showReject && (
          <div className="mt-4 space-y-2">
            <Textarea
              placeholder="Alasan penolakan (wajib diisi)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={!rejectReason.trim() || verify.isPending}
              onClick={() => act("REJECT", rejectReason.trim())}
            >
              Konfirmasi Penolakan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Queue({
  status,
  isAdmin,
}: {
  status: PaymentVerificationStatus;
  isAdmin: boolean;
}) {
  const { data, isLoading } = usePaymentVerifications(status);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const payments = data?.data ?? [];
  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Tidak ada pembayaran pada status ini.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {payments.map((payment) => (
        <PaymentCard key={payment.id} payment={payment} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

export default function PaymentVerificationPage() {
  const { user } = useAuthStore();
  const isAdmin = ["SUPER_ADMIN", "UNIT_ADMIN"].includes(getEffectiveRole(user) || "");

  return (
    <MainLayout allowedRoles={["SUPER_ADMIN", "UNIT_ADMIN", "STAFF"]}>
      <div className="space-y-6">
        <PageHeader
          title="Verifikasi Pembayaran"
          description="Verifikasi dua tahap bukti transfer SPP: Tata Usaha memeriksa bukti, lalu admin unit mengesahkan (pemisahan tugas — pengesah harus berbeda dari verifikator TU)."
        />

        <Card>
          <CardHeader>
            <CardTitle>Antrean Verifikasi</CardTitle>
            <CardDescription>
              Pembayaran tercatat ke tagihan dan jurnal hanya setelah disahkan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="PENDING_VERIFICATION">
              <TabsList>
                <TabsTrigger value="PENDING_VERIFICATION">
                  Menunggu TU
                </TabsTrigger>
                <TabsTrigger value="TU_APPROVED">
                  Menunggu Pengesahan
                </TabsTrigger>
                <TabsTrigger value="REJECTED">Ditolak</TabsTrigger>
              </TabsList>
              <TabsContent value="PENDING_VERIFICATION" className="mt-4">
                <Queue status="PENDING_VERIFICATION" isAdmin={isAdmin} />
              </TabsContent>
              <TabsContent value="TU_APPROVED" className="mt-4">
                <Queue status="TU_APPROVED" isAdmin={isAdmin} />
              </TabsContent>
              <TabsContent value="REJECTED" className="mt-4">
                <Queue status="REJECTED" isAdmin={isAdmin} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
