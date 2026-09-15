"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import { getPrimaryRoleCode } from "@/lib/rbac";
import {
  useEvaluationDetail,
  useUpdateIndicatorRealization,
  useUpdateBehaviorScore,
  useApproveEvaluation,
  useBehavioralValues,
} from "@/hooks/use-performance";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  Save,
  MessageSquare,
} from "lucide-react";

function PeriodicEvaluationDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const evalId = params.id as string;

  const { user } = useAuthStore();
  const primaryRoleCode = user ? getPrimaryRoleCode(user) || "" : "";
  const { data: evaluation, isLoading } = useEvaluationDetail(evalId);

  const canApprove =
    user?.id === evaluation?.pk?.supervisorId ||
    user?.role === "SUPER_ADMIN" ||
    ["SUPER_ADMIN", "TKQ_ADMIN", "SDIT_ADMIN", "SMPIT_ADMIN", "SMAQ_ADMIN"].includes(primaryRoleCode);
  const { data: saftiMaster } = useBehavioralValues();

  const updateRealization = useUpdateIndicatorRealization();
  const updateBehavior = useUpdateBehaviorScore();
  const approveEvaluation = useApproveEvaluation();

  const [feedback, setFeedback] = useState<string | null>(null);
  const [realizationInputs, setRealizationInputs] = useState<Record<string, { realization: number; activities: string }>>({});
  const [behaviorInputs, setBehaviorInputs] = useState<Record<string, { score: number; notes: string }>>({});

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 text-center text-muted-foreground">
        Memuat detail evaluasi bulanan...
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="container mx-auto p-6 text-center space-y-4">
        <div className="text-red-500 font-semibold">Data evaluasi tidak ditemukan.</div>
        <Link href="/kinerja/evaluasi">
          <Button variant="outline">Kembali ke Daftar Evaluasi</Button>
        </Link>
      </div>
    );
  }

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const handleSaveRealization = async (indicatorId: string) => {
    const input = realizationInputs[indicatorId];
    if (!input) return;

    await updateRealization.mutateAsync({
      evaluationId: evaluation.id,
      indicatorId,
      realization: Number(input.realization),
      activities: input.activities,
    });
  };

  const handleSaveBehavior = async (behaviorValueId: string) => {
    const input = behaviorInputs[behaviorValueId];
    if (!input) return;

    await updateBehavior.mutateAsync({
      evaluationId: evaluation.id,
      behaviorValueId,
      score: Number(input.score),
      notes: input.notes,
    });
  };

  const handleApprove = async () => {
    // Save any pending unsaved realization or behavior inputs before approving
    for (const item of evaluation.indicatorDetails || []) {
      const input = realizationInputs[item.indicatorId];
      if (input) {
        await updateRealization.mutateAsync({
          evaluationId: evaluation.id,
          indicatorId: item.indicatorId,
          realization: Number(input.realization),
          activities: input.activities,
        });
      }
    }

    for (const item of evaluation.behaviorDetails || []) {
      const input = behaviorInputs[item.behaviorValueId];
      if (input) {
        await updateBehavior.mutateAsync({
          evaluationId: evaluation.id,
          behaviorValueId: item.behaviorValueId,
          score: Number(input.score),
          notes: input.notes,
        });
      }
    }

    await approveEvaluation.mutateAsync({
      evaluationId: evaluation.id,
      feedback: feedback !== null ? feedback : (evaluation.feedback || ""),
    });
  };

  // Warna predikat menyampaikan arti, bukan sekadar hiasan: "Butuh Perbaikan"
  // yang tampil hijau seperti "Sangat Baik" menghapus seluruh gunanya kuadran.
  const predikatStyle =
    {
      SANGAT_BAIK: {
        card: "border-emerald-200 bg-emerald-50/40",
        title: "text-emerald-900",
        value: "text-emerald-700",
      },
      BAIK: {
        card: "border-teal-200 bg-teal-50/40",
        title: "text-teal-900",
        value: "text-teal-700",
      },
      BUTUH_PERBAIKAN: {
        card: "border-amber-200 bg-amber-50/40",
        title: "text-amber-900",
        value: "text-amber-700",
      },
      KURANG: {
        card: "border-orange-200 bg-orange-50/40",
        title: "text-orange-900",
        value: "text-orange-700",
      },
      SANGAT_KURANG: {
        card: "border-rose-200 bg-rose-50/40",
        title: "text-rose-900",
        value: "text-rose-700",
      },
    }[evaluation.predikat?.predikat ?? "BAIK"] ?? {
      card: "border-slate-200 bg-slate-50/40",
      title: "text-slate-900",
      value: "text-slate-700",
    };

  const ekspektasiLabel: Record<string, string> = {
    DI_ATAS: "di atas ekspektasi",
    SESUAI: "sesuai ekspektasi",
    DI_BAWAH: "di bawah ekspektasi",
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/kinerja/evaluasi">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Evaluasi Periode: {monthNames[evaluation.month - 1]} {evaluation.year}
              </h1>
              <Badge className={evaluation.status === "APPROVED" ? "bg-emerald-500" : "bg-amber-500"}>
                {evaluation.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hasil Kerja {evaluation.performanceScore.toFixed(1)}% &middot; Perilaku SAFTI{" "}
              {evaluation.behaviorScore.toFixed(1)} &middot; Indeks gabungan{" "}
              {evaluation.overallScore.toFixed(1)}%
            </p>
          </div>
        </div>

        {evaluation.status !== "APPROVED" && canApprove && (
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={approveEvaluation.isPending}
            onClick={handleApprove}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" /> Finalisasi & Setujui Evaluasi
          </Button>
        )}
      </div>

      {/* Summary Score Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-blue-900">Capaian Hasil Kerja (60%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{evaluation.performanceScore.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Realisasi target indikator IKU/KPI</p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-purple-900">Skor Perilaku SAFTI (40%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{evaluation.behaviorScore.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground mt-1">Siddiq, Amanah, Fathonah, Tabligh, Istiqomah</p>
          </CardContent>
        </Card>

        {/*
          Predikat, bukan angka gabungan, adalah kesimpulan penilaiannya.
          PermenPANRB No. 6/2022 menetapkannya dari KUADRAN hasil kerja ×
          perilaku kerja. Angka berbobot tetap ditampilkan, tetapi sebagai
          indeks pendukung — dengan rumus itu saja, hasil kerja 100 dan
          perilaku 50 memberi 80 dan terbaca "baik", padahal kuadran
          menyebutnya Butuh Perbaikan.
        */}
        <Card className={predikatStyle.card}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-xs font-medium ${predikatStyle.title}`}>
              Predikat Kinerja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${predikatStyle.value}`}>
              {evaluation.predikat?.label ?? "Belum dinilai"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {evaluation.predikat
                ? `Hasil kerja ${ekspektasiLabel[evaluation.predikat.hasilKerja]} × perilaku ${ekspektasiLabel[evaluation.predikat.perilakuKerja]} · indeks ${evaluation.overallScore.toFixed(1)}%`
                : "Menunggu realisasi indikator dan penilaian perilaku"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="indicators" className="space-y-4">
        <TabsList>
          <TabsTrigger value="indicators" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> 1. Realisasi Indikator Hasil Kerja
          </TabsTrigger>
          <TabsTrigger value="safti" className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> 2. Evaluasi Perilaku SAFTI
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> 3. Feedback Atasan
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Realisasi Indikator */}
        <TabsContent value="indicators">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Realisasi Bulanan Target Indikator</CardTitle>
              <CardDescription>
                Input jumlah realisasi yang dicapai pada bulan ini beserta uraian kegiatan pendukungnya
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indikator Target</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Bobot</TableHead>
                      <TableHead>Realisasi Bulan Ini</TableHead>
                      <TableHead>Uraian Kegiatan / Bukti Dukung</TableHead>
                      <TableHead className="text-right">Aksi Simpan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluation.indicatorDetails?.map((item) => {
                      const currentRealization = realizationInputs[item.indicatorId]?.realization ?? item.realization;
                      const currentActivities = realizationInputs[item.indicatorId]?.activities ?? (item.activities || "");

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-semibold">
                            {item.indicator?.title}
                            <div className="text-xs text-muted-foreground">Kategori: {item.indicator?.category}</div>
                          </TableCell>
                          <TableCell>{item.indicator?.target} {item.indicator?.unit}</TableCell>
                          <TableCell className="font-semibold text-emerald-600">{item.indicator?.weight}%</TableCell>
                          <TableCell className="w-36">
                            <Input
                              type="number"
                              value={currentRealization}
                              disabled={evaluation.status === "APPROVED"}
                              onChange={(e) =>
                                setRealizationInputs({
                                  ...realizationInputs,
                                  [item.indicatorId]: {
                                    realization: Number(e.target.value),
                                    activities: currentActivities,
                                  },
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Uraian bukti kegiatan..."
                              value={currentActivities}
                              disabled={evaluation.status === "APPROVED"}
                              onChange={(e) =>
                                setRealizationInputs({
                                  ...realizationInputs,
                                  [item.indicatorId]: {
                                    realization: currentRealization,
                                    activities: e.target.value,
                                  },
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {evaluation.status !== "APPROVED" && (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => handleSaveRealization(item.indicatorId)}
                                disabled={updateRealization.isPending}
                              >
                                <Save className="w-3.5 h-3.5 mr-1" /> Simpan
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: SAFTI Behavior */}
        <TabsContent value="safti">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" /> Penilaian Perilaku SAFTI (Nilai 0 - 100)
              </CardTitle>
              <CardDescription>
                Penilaian integritas dan kepribadian Islami berdasarkan lima pilar akhlak mulia
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {evaluation.behaviorDetails?.map((item) => {
                  const val = item.behaviorValue;
                  if (!val) return null;
                  const currentScore = behaviorInputs[val.id]?.score ?? item.score;
                  const currentNotes = behaviorInputs[val.id]?.notes ?? (item.notes || "");

                  return (
                    <div key={val.id} className="p-4 rounded-lg border bg-card space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-base text-purple-900 dark:text-purple-300">{val.name}</h4>
                          <p className="text-xs text-muted-foreground">{val.description || "Indikator standar perilaku Islami Cipansor"}</p>
                        </div>
                        <Badge variant="outline" className="border-purple-300 text-purple-700">Bobot: {val.weight}</Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 items-center">
                        <div className="space-y-1">
                          <Label className="text-xs">Skor Perilaku (0 - 100)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={currentScore}
                            disabled={evaluation.status === "APPROVED" || !canApprove}
                            onChange={(e) =>
                              setBehaviorInputs({
                                ...behaviorInputs,
                                [val.id]: {
                                  score: Number(e.target.value),
                                  notes: currentNotes,
                                },
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <Label className="text-xs">Catatan & Bukti Perilaku</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Misal: Selalu disiplin waktu ibadah dan tepat waktu hadir..."
                              value={currentNotes}
                              disabled={evaluation.status === "APPROVED" || !canApprove}
                              onChange={(e) =>
                                setBehaviorInputs({
                                  ...behaviorInputs,
                                  [val.id]: {
                                    score: currentScore,
                                    notes: e.target.value,
                                  },
                                })
                              }
                            />
                            {evaluation.status !== "APPROVED" && canApprove && (
                              <Button
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700 text-white"
                                onClick={() => handleSaveBehavior(val.id)}
                                disabled={updateBehavior.isPending}
                              >
                                <Save className="w-3.5 h-3.5 mr-1" /> Simpan
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Feedback Atasan */}
        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Catatan & Feedback Atasan Penilai</CardTitle>
              <CardDescription>
                Bimbingan serta apresiasi terhadap pencapaian kinerja pegawai pada periode ini
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={4}
                placeholder="Berikan masukan, apresiasi, atau area pengembangan..."
                value={feedback !== null ? feedback : (evaluation.feedback || "")}
                disabled={evaluation.status === "APPROVED"}
                onChange={(e) => setFeedback(e.target.value)}
              />
              {evaluation.status !== "APPROVED" && canApprove && (
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove}>
                  Simpan Catatan & Approve Evaluasi
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PeriodicEvaluationDetailPage() {
  return (
    <MainLayout>
      <PeriodicEvaluationDetailPageContent />
    </MainLayout>
  );
}
