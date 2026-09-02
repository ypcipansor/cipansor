"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import {
  usePKDetail,
  useProposePK,
  useApprovePK,
  useRejectPK,
  useCreatePKIndicator,
  useDeletePKIndicator,
} from "@/hooks/use-performance";
import { usePlan } from "@/hooks/use-perencanaan";
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
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Send,
  AlertCircle,
  Building2,
  RotateCcw,
} from "lucide-react";

function PerformanceAgreementDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const pkId = params.id as string;

  const { user } = useAuthStore();
  const { data: pk, isLoading } = usePKDetail(pkId);
  const { data: strategicPlan } = usePlan(pk?.strategicPlanId || "");

  const createIndicator = useCreatePKIndicator();
  const deleteIndicator = useDeletePKIndicator();

  const proposePK = useProposePK();
  const approvePK = useApprovePK();
  const rejectPK = useRejectPK();

  const [openAddIndicator, setOpenAddIndicator] = useState(false);
  const [openRejectDialog, setOpenRejectDialog] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");

  const [indicatorForm, setIndicatorForm] = useState({
    title: "",
    target: 100,
    unit: "%",
    weight: 20,
    category: "NON_CASCADING" as "DIRECT" | "INDIRECT" | "NON_CASCADING",
    refStrategicIndicatorId: "",
    notes: "",
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 text-center text-muted-foreground">
        Memuat detail Perjanjian Kinerja...
      </div>
    );
  }

  if (!pk) {
    return (
      <div className="container mx-auto p-6 text-center space-y-4">
        <div className="text-red-500 font-semibold">Perjanjian Kinerja tidak ditemukan.</div>
        <Link href="/kinerja/pk">
          <Button variant="outline">Kembali ke Daftar PK</Button>
        </Link>
      </div>
    );
  }

  const isOwner = pk.userId === user?.id;
  const isSupervisor = pk.supervisorId === user?.id;
  const isEditable = isOwner && pk.status === "DRAFT";

  const totalWeight = pk.indicators?.reduce((sum, ind) => sum + ind.weight, 0) || 0;
  const isWeightValid = Math.abs(totalWeight - 100) < 0.01;

  const handleAddIndicator = async (e: React.FormEvent) => {
    e.preventDefault();
    await createIndicator.mutateAsync({
      pkId: pk.id,
      title: indicatorForm.title,
      target: Number(indicatorForm.target),
      unit: indicatorForm.unit,
      weight: Number(indicatorForm.weight),
      category: indicatorForm.category,
      refStrategicIndicatorId: indicatorForm.refStrategicIndicatorId || undefined,
      notes: indicatorForm.notes || undefined,
    });
    setOpenAddIndicator(false);
    setIndicatorForm({
      title: "",
      target: 100,
      unit: "%",
      weight: 20,
      category: "NON_CASCADING",
      refStrategicIndicatorId: "",
      notes: "",
    });
  };

  const handleReject = async () => {
    await rejectPK.mutateAsync({ id: pk.id, revisionNotes });
    setOpenRejectDialog(false);
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/kinerja/pk">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Perjanjian Kinerja: {pk.user?.name}</h1>
              <Badge className={
                pk.status === "APPROVED" ? "bg-emerald-500" :
                pk.status === "PROPOSED" ? "bg-amber-500" : "bg-gray-400"
              }>
                {pk.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Periode: {new Date(pk.periodStart).getFullYear()} | Penilai: {pk.supervisor?.name || "Belum Ditentukan"}
            </p>
          </div>
        </div>

        {/* Action Buttons based on status & role */}
        <div className="flex items-center gap-2">
          {isOwner && pk.status === "DRAFT" && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!isWeightValid || pk.indicators?.length === 0 || proposePK.isPending}
              onClick={() => proposePK.mutate(pk.id)}
            >
              <Send className="w-4 h-4 mr-2" /> Ajukan ke Atasan
            </Button>
          )}

          {isSupervisor && pk.status === "PROPOSED" && (
            <>
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => setOpenRejectDialog(true)}
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Minta Revisi
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={approvePK.isPending}
                onClick={() => approvePK.mutate(pk.id)}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> Setujui Perjanjian Kinerja
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Revision Notice */}
      {pk.revisionNotes && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Catatan Revisi dari Atasan:
            </CardTitle>
            <CardDescription className="text-amber-950 dark:text-amber-200 text-xs">
              {pk.revisionNotes}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Indikator</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pk.indicators?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Bobot (Harus 100%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isWeightValid ? "text-emerald-600" : "text-amber-600"}`}>
              {totalWeight}%
            </div>
            {!isWeightValid && (
              <p className="text-xs text-amber-600 mt-1">Total bobot harus pas 100% untuk diajukan</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Capaian Kinerja YTD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{pk.totalScore.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">RKA/Renstra Rujukan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium line-clamp-1">{pk.strategicPlan?.title || "Murni KPI Mandiri"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Indicators Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Indikator Kinerja Utama (IKU / KPI)</CardTitle>
            <CardDescription>
              Detail target hasil kerja dan indikator cascading dari RKA/Renstra unit
            </CardDescription>
          </div>

          {isEditable && (
            <Dialog open={openAddIndicator} onOpenChange={setOpenAddIndicator}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4 mr-1" /> Tambah Indikator
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px]">
                <form onSubmit={handleAddIndicator}>
                  <DialogHeader>
                    <DialogTitle>Tambah Indikator Kinerja Baru</DialogTitle>
                    <DialogDescription>
                      Isi nama target, bobot (%), serta tautkan dengan indikator RKA unit jika ada.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">Judul Indikator / Target Hasil Kerja</Label>
                      <Input
                        placeholder="cth: Ketercapaian Target Kurikulum Pembelajaran..."
                        value={indicatorForm.title}
                        onChange={(e) => setIndicatorForm({ ...indicatorForm, title: e.target.value })}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label>Target</Label>
                        <Input
                          type="number"
                          value={indicatorForm.target}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, target: Number(e.target.value) })}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Satuan</Label>
                        <Input
                          placeholder="%, Dokumen, Orang..."
                          value={indicatorForm.unit}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, unit: e.target.value })}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Bobot (%)</Label>
                        <Input
                          type="number"
                          value={indicatorForm.weight}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, weight: Number(e.target.value) })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Kategori Cascading</Label>
                      <Select
                        value={indicatorForm.category}
                        onValueChange={(val: any) => setIndicatorForm({ ...indicatorForm, category: val })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NON_CASCADING">Indikator Mandiri (Non-Cascading)</SelectItem>
                          <SelectItem value="DIRECT">Turunan Langsung (Direct Cascading)</SelectItem>
                          <SelectItem value="INDIRECT">Turunan Tidak Langsung (Indirect Cascading)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {strategicPlan && (
                      <div className="grid gap-2">
                        <Label>Tautkan dengan Indikator RKA / Renstra Unit</Label>
                        <Select
                          value={indicatorForm.refStrategicIndicatorId}
                          onValueChange={(val) => setIndicatorForm({ ...indicatorForm, refStrategicIndicatorId: val })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Indikator Strategis RKA..." />
                          </SelectTrigger>
                          <SelectContent>
                            {strategicPlan.objectives?.flatMap((obj) => obj.indicators || []).map((ind) => (
                              <SelectItem key={ind.id} value={ind.id}>
                                {ind.name} (Target: {ind.targetValue} {ind.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Label>Catatan / Metode Perhitungan</Label>
                      <Textarea
                        placeholder="Misal: Dihitung dari jumlah laporan yang disetujui..."
                        value={indicatorForm.notes}
                        onChange={(e) => setIndicatorForm({ ...indicatorForm, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpenAddIndicator(false)}>
                      Batal
                    </Button>
                    <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={createIndicator.isPending}>
                      Simpan Indikator
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {pk.indicators?.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              Belum ada indikator kinerja yang ditambahkan pada dokumen Perjanjian Kinerja ini.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Judul Indikator Target</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Tautan RKA Unit</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Bobot</TableHead>
                  <TableHead>Realisasi YTD</TableHead>
                  {isEditable && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pk.indicators?.map((ind, idx) => (
                  <TableRow key={ind.id}>
                    <TableCell className="font-medium">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{ind.title}</div>
                      {ind.notes && <div className="text-xs text-muted-foreground">{ind.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {ind.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ind.refStrategicIndicator ? (
                        <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {ind.refStrategicIndicator.name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {ind.target} {ind.unit}
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-600">{ind.weight}%</TableCell>
                    <TableCell className="font-bold text-blue-600">
                      {ind.realization} {ind.unit}
                    </TableCell>
                    {isEditable && (
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:bg-red-50"
                          onClick={() => deleteIndicator.mutate({ id: ind.id, pkId: pk.id })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reject Modal */}
      <Dialog open={openRejectDialog} onOpenChange={setOpenRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Minta Revisi Perjanjian Kinerja</DialogTitle>
            <DialogDescription>
              Berikan catatan perbaikan terkait bobot atau indikator usulan pegawai ini.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Catatan Revisi / Umpan Balik</Label>
            <Textarea
              className="mt-2"
              placeholder="Jelaskan alasan pengembalian draft PK ini..."
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRejectDialog(false)}>
              Batal
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleReject} disabled={rejectPK.isPending}>
              Kembalikan ke Pegawai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PerformanceAgreementDetailPage() {
  return (
    <MainLayout>
      <PerformanceAgreementDetailPageContent />
    </MainLayout>
  );
}
