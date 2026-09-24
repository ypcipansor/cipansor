"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCashFlowReport } from "@/hooks/use-finance-enhancement";
import { useUnits } from "@/hooks/use-units";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import type { CashFlowItem } from "@cipansor/shared";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CashFlowPage() {
  const currentDate = new Date();
  const [unitId, setUnitId] = useState("");
  const [startDate, setStartDate] = useState(
    safeFormat(new Date(currentDate.getFullYear(), 0, 1), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(format(currentDate, "yyyy-MM-dd"));

  const { data: units } = useUnits();
  const { data: report, isLoading } = useCashFlowReport({
    unitId: unitId || undefined,
    startDate,
    endDate,
  });

  const renderSection = (
    title: string,
    total: number,
    items: CashFlowItem[],
  ) => (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span
          className={`font-bold ${total >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {formatCurrency(total)}
        </span>
      </div>
      <div className="pl-4 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Tidak ada aktivitas
          </p>
        ) : (
          items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span className="font-mono">{formatCurrency(item.amount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Laporan Arus Kas (Cash Flow)"
          description="Laporan penerimaan dan pengeluaran kas"
          actions={
            <Link href="/finance/reports">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali
              </Button>
            </Link>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Semua Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Unit</SelectItem>
                    {units?.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tanggal Mulai</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Akhir</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => window.print()}
                disabled={!report}
              >
                <Download className="h-4 w-4 mr-2" />
                Cetak / PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : report ? (
              <div className="space-y-8 max-w-3xl mx-auto border p-8 rounded-lg bg-white shadow-sm">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold">Laporan Arus Kas</h2>
                  <p className="text-muted-foreground">
                    Periode:{" "}
                    {safeFormat(
                      new Date(report.period.startDate),
                      "dd MMM yyyy",
                    )}{" "}
                    s/d{" "}
                    {safeFormat(new Date(report.period.endDate), "dd MMM yyyy")}
                  </p>
                </div>

                {renderSection(
                  report.operatingActivities.title,
                  report.operatingActivities.total,
                  report.operatingActivities.items,
                )}

                {renderSection(
                  report.investingActivities.title,
                  report.investingActivities.total,
                  report.investingActivities.items,
                )}

                {renderSection(
                  report.financingActivities.title,
                  report.financingActivities.total,
                  report.financingActivities.items,
                )}

                <div className="border-t-2 pt-4 mt-8">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">
                      Kenaikan/(Penurunan) Kas Bersih
                    </span>
                    <span
                      className={`font-bold font-mono text-lg ${report.netChangeInCash >= 0 ? "text-green-700" : "text-red-700"}`}
                    >
                      {formatCurrency(report.netChangeInCash)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Saldo Kas Awal</span>
                    <span className="font-mono">
                      {formatCurrency(report.beginningCashBalance)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-lg font-bold mt-2 bg-muted/20 p-2 rounded">
                    <span>Saldo Kas Akhir</span>
                    <span className="font-mono">
                      {formatCurrency(report.endingCashBalance)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Pilih filter untuk melihat laporan
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
