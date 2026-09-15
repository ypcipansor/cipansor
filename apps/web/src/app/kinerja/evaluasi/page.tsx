"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import {
  usePKList,
  useCreateEvaluation,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  Clock,
  Plus,
  Eye,
  Calendar,
  ShieldCheck,
} from "lucide-react";

function PeriodicEvaluationListPageContent() {
  const { user } = useAuthStore();
  const { data: pks, isLoading } = usePKList({ status: "APPROVED" });
  const { data: saftiValues } = useBehavioralValues();

  const createEvaluation = useCreateEvaluation();

  const [openCreate, setOpenCreate] = useState(false);
  const [selectedPkId, setSelectedPkId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const handleCreateEval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPkId) return;

    const pk = pks?.find((p) => p.id === selectedPkId);
    if (pk) {
      const evalDate = new Date(Number(year), Number(month) - 1, 1);
      const start = new Date(pk.periodStart);
      const end = new Date(pk.periodEnd);
      if (evalDate < new Date(start.getFullYear(), start.getMonth(), 1) || evalDate > new Date(end.getFullYear(), end.getMonth(), 1)) {
        alert("Bulan/Tahun evaluasi di luar periode Perjanjian Kinerja!");
        return;
      }
    }

    await createEvaluation.mutateAsync({
      pkId: selectedPkId,
      month: Number(month),
      year: Number(year),
    });
    setOpenCreate(false);
  };

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evaluasi Kinerja Periodik Bulanan</h1>
          <p className="text-muted-foreground text-sm">
            Input realisasi capaian indikator bulanan dan penilaian Perilaku Kerja <b>SAFTI</b> (*Siddiq, Amanah, Fathonah, Tabligh, Istiqomah*)
          </p>
        </div>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Buat Evaluasi Bulanan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateEval}>
              <DialogHeader>
                <DialogTitle>Buat Evaluasi Bulanan Baru</DialogTitle>
                <DialogDescription>
                  Pilih Perjanjian Kinerja (PK) yang sudah disetujui serta bulan & tahun evaluasi.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Perjanjian Kinerja (PK)</Label>
                  <Select
                    value={selectedPkId}
                    onValueChange={(pkId) => {
                      setSelectedPkId(pkId);
                      const pk = pks?.find((p) => p.id === pkId);
                      if (pk) {
                        const start = new Date(pk.periodStart);
                        setYear(start.getFullYear());
                        setMonth(start.getMonth() + 1);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih dokumen PK..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pks?.map((pk) => (
                        <SelectItem key={pk.id} value={pk.id}>
                          {pk.user?.name} (Periode {new Date(pk.periodStart).getFullYear()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Bulan Evaluasi</Label>
                    <Select value={String(month)} onValueChange={(val) => setMonth(Number(val))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthNames.map((m, idx) => (
                          <SelectItem key={m} value={String(idx + 1)}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Tahun Evaluasi</Label>
                    <Input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
                  Batal
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={createEvaluation.isPending}>
                  Mulai Evaluasi
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* SAFTI Banner Info */}
      <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-purple-900 dark:text-purple-300 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" /> Nilai Perilaku SAFTI (Kultur Pesantren Cipansor)
          </CardTitle>
          <CardDescription className="text-purple-950 dark:text-purple-200 text-xs">
            Komponen penilaian gabungan: <b>60% Nilai Hasil Kerja (KPI Target)</b> + <b>40% Nilai Perilaku SAFTI</b>:
            Siddiq (Integritas/Jujur), Amanah (Tanggung Jawab), Fathonah (Profesional/Cerdas), Tabligh (Komunikasi/Transparan), Istiqomah (Konsistensi).
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Evaluation Records Table per PK */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Memuat daftar evaluasi...</div>
        ) : pks?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Belum ada Perjanjian Kinerja (PK) yang berstatus APPROVED untuk dievaluasi. Susun dan ajukan PK terlebih dahulu.
            </CardContent>
          </Card>
        ) : (
          pks?.map((pk) => (
            <Card key={pk.id}>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                    Evaluasi PK: {pk.user?.name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Atasan Penilai: {pk.supervisor?.name || "-"} | RKA Unit: {pk.strategicPlan?.title || "Mandiri"}
                  </CardDescription>
                </div>
                <Badge className="bg-emerald-500">APPROVED</Badge>
              </CardHeader>
              <CardContent>
                {pk.evaluations?.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground border-2 border-dashed rounded-lg">
                    Belum ada riwayat evaluasi bulanan yang dibuat untuk PK ini.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bulan / Periode</TableHead>
                        <TableHead>Skor Hasil Kerja (KPI)</TableHead>
                        <TableHead>Skor Perilaku SAFTI</TableHead>
                        <TableHead>Nilai Akhir</TableHead>
                        <TableHead>Status Evaluasi</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pk.evaluations?.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="font-semibold">
                            {monthNames[ev.month - 1]} {ev.year}
                          </TableCell>
                          <TableCell className="font-medium text-blue-600">
                            {ev.performanceScore.toFixed(1)}%
                          </TableCell>
                          <TableCell className="font-medium text-purple-600">
                            {ev.behaviorScore.toFixed(1)} / 100
                          </TableCell>
                          <TableCell className="font-bold text-emerald-700 text-base">
                            {ev.overallScore.toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            {ev.status === "APPROVED" ? (
                              <Badge className="bg-emerald-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Disetujui</Badge>
                            ) : (
                              <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Draf / Menunggu</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/kinerja/evaluasi/${ev.id}`}>
                              <Button size="sm" variant="outline" className="border-emerald-200 hover:bg-emerald-50 text-emerald-700">
                                <Eye className="w-4 h-4 mr-1" /> Input & Verifikasi Evaluasi
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default function PeriodicEvaluationListPage() {
  return (
    <MainLayout>
      <PeriodicEvaluationListPageContent />
    </MainLayout>
  );
}
