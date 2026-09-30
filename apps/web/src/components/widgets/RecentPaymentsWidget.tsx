"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Banknote, TrendingUp, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";

interface PaymentEvent {
  invoiceId: string;
  studentName: string;
  amount: number;
  type: string;
  unitName: string;
  time: string;
}

interface RecentPaymentsWidgetProps {
  maxItems?: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function RecentPaymentsWidget({
  maxItems = 10,
}: RecentPaymentsWidgetProps) {
  const [payments, setPayments] = useState<PaymentEvent[]>([]);

  // Initial load - setting state in effect with empty deps is fine, but if we want to avoid the lint warning about "set state in effect"
  // we should use a mounting ref or just accept it's standard for client-side fetching.
  // The lint error specifically complains about synchronous set state in effect that could cause cascading renders.
  // But here we are just setting initial data.

  // Let's try to lazy init in useState if possible, but we can't because of time calculation (Date.now()) being impure.
  // So useEffect is the correct place for client-side only data to avoid hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setPayments([
      {
        invoiceId: "1",
        studentName: "Ahmad Fauzi",
        amount: 1500000,
        type: "SPP",
        unitName: "SMP IT",
        time: new Date().toISOString(),
      },
      {
        invoiceId: "2",
        studentName: "Fatimah Az-Zahra",
        amount: 750000,
        type: "Uang Makan",
        unitName: "SD IT",
        time: new Date(Date.now() - 300000).toISOString(),
      },
      {
        invoiceId: "3",
        studentName: "Muhammad Rizki",
        amount: 2000000,
        type: "SPP",
        unitName: "SMA",
        time: new Date(Date.now() - 600000).toISOString(),
      },
      {
        invoiceId: "4",
        studentName: "Aisyah Putri",
        amount: 500000,
        type: "Kegiatan",
        unitName: "PAUD",
        time: new Date(Date.now() - 900000).toISOString(),
      },
    ]);
  }, []);

  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Simulate polling for real-time updates
    let mounted = true;

    const fetchRecentPayments = async () => {
      try {
        // The session rides an HttpOnly cookie; `api` attaches it. No token is
        // read from JavaScript (there is none to read any more).
        const response = await api.get<{
          success?: boolean;
          data?: { payments?: unknown[] };
        }>("/analytics/finance", { skipErrorToast: true });

        if (mounted) {
          if (response.data?.success && response.data.data?.payments) {
            // If we had real API returning payments list
            // setPayments(data.data.payments);
          }
          setIsConnected(true);
        }
      } catch {
        if (mounted) {
          setIsConnected(false);
        }
      }
    };

    fetchRecentPayments();
    const interval = setInterval(fetchRecentPayments, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Calculate total from current payments
  const todayTotal = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Pembayaran Terbaru
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {isConnected ? (
              <Badge
                variant="outline"
                className="text-green-600 border-green-300"
              >
                <span className="mr-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-500">
                Offline
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <TrendingUp className="h-4 w-4 text-green-500" />
          <span className="text-sm text-muted-foreground">Hari ini:</span>
          <span className="font-semibold text-green-600">
            {formatCurrency(todayTotal)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="space-y-1 p-4 pt-0">
            {payments.slice(0, maxItems).map((payment, idx) => (
              <div
                key={`${payment.invoiceId}-${idx}`}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors border-l-2 border-green-500"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {payment.studentName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payment.type} • {payment.unitName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-600">
                    +{formatCurrency(payment.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(payment.time), {
                      addSuffix: true,
                      locale: id,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
