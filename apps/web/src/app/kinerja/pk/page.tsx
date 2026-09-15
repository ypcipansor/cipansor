"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth";
import {
  usePKList,
  useCreatePK,
  useDeletePK,
  useProposePK,
  useSupervisors,
} from "@/hooks/use-performance";
import { usePlans } from "@/hooks/use-perencanaan";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Send,
  Trash2,
  UserCheck,
  Building2,
} from "lucide-react";

function PerformanceAgreementListPageContent() {
  const { user } = useAuthStore();
  const { data: pks, isLoading } = usePKList();
  const { data: plans } = usePlans();
  const { data: supervisors } = useSupervisors();

  const createPK = useCreatePK();
  const deletePK = useDeletePK();
  const proposePK = useProposePK();

  const [openCreate, setOpenCreate] = useState(false);
  const [formData, setFormData] = useState({
    supervisorId: "",
    strategicPlanId: "",
    periodStart: new Date().getFullYear() + "-01-01",
    periodEnd: new Date().getFullYear() + "-12-31",
    notes: "",
  });

  const myPks = pks?.filter((p) => p.userId === user?.id) || [];
  const subordinatePks = pks?.filter((p) => p.supervisorId === user?.id) || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (new Date(formData.periodEnd) < new Date(formData.periodStart)) {
      alert("Tanggal akhir periode tidak boleh lebih awal dari tanggal mulai!");
      return;
    }

    await createPK.mutateAsync({
      supervisorId: formData.supervisorId || undefined,
      strategicPlanId: formData.strategicPlanId || undefined,
      periodStart: new Date(formData.periodStart).toISOString(),
      periodEnd: new Date(formData.periodEnd).toISOString(),
      notes: formData.notes || undefined,
    });
    setOpenCreate(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" /> APPROVED</Badge>;
      case "PROPOSED":
        return <Badge className="bg-amber-500 hover:bg-amber-600"><Clock className="w-3 h-3 mr-1" /> PROPOSED</Badge>;
      default:
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" /> DRAFT</Badge>;
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Perjanjian Kinerja (PK) Pegawai</h1>
          <p className="text-muted-foreground text-sm">
            Dokumen penetapan target indikator hasil kerja pegawai yang diturunkan dari RKA & Renstra Unit
          </p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Buat Perjanjian Kinerja
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Buat Perjanjian Kinerja Baru</DialogTitle>
                <DialogDescription>
                  Pilih Atasan Langsung dan RKA/Renstra Unit rujukan untuk cascading indikator.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="supervisor">Atasan Langsung (Penilai)</Label>
                  <Select
                    value={formData.supervisorId}
                    onValueChange={(val) => setFormData({ ...formData, supervisorId: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih atasan langsung..." />
                    </SelectTrigger>
                    <SelectContent>
                      {supervisors
                        ?.filter((u) => u.id !== user?.id)
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} {u.unit ? `(${u.unit.name})` : "(Yayasan)"} - #{u.id.slice(0, 6)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="plan">RKA / Renstra Rujukan (Cascading)</Label>
                  <Select
                    value={formData.strategicPlanId}
                    onValueChange={(val) => setFormData({ ...formData, strategicPlanId: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih dokumen RKA / Renstra unit..." />
                    </SelectTrigger>
                    <SelectContent>
                      {plans?.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          [{plan.type}] {plan.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Awal Periode</Label>
                    <Input
                      type="date"
                      value={formData.periodStart}
                      onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">Akhir Periode</Label>
                    <Input
                      type="date"
                      value={formData.periodEnd}
                      onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notes">Catatan Tambahan</Label>
                  <Textarea
                    placeholder="Misal: Sasaran strategis fokus penguatan akademik..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
                  Batal
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={createPK.isPending}>
                  {createPK.isPending ? "Menyimpan..." : "Buat PK"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs list: PK Saya & PK Bawahan */}
      <Tabs defaultValue="mypk" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mypk" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> PK Saya ({myPks.length})
          </TabsTrigger>
          <TabsTrigger value="subordinates" className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" /> Persetujuan PK Bawahan ({subordinatePks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mypk" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Daftar Perjanjian Kinerja Saya</CardTitle>
              <CardDescription>
                Kelola indikator, isi bobot target (total 100%), dan ajukan ke atasan untuk disetujui
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Memuat data PK...</div>
              ) : myPks.length === 0 ? (
                <div className="py-12 text-center space-y-3 border-2 border-dashed rounded-lg">
                  <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
                  <div className="text-sm font-medium">Belum ada dokumen Perjanjian Kinerja</div>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Klik tombol &quot;Buat Perjanjian Kinerja&quot; di atas untuk mulai membuat penetapan kinerja tahunan Anda.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead>Atasan Penilai</TableHead>
                      <TableHead>RKA/Renstra Rujukan</TableHead>
                      <TableHead>Indikator Target</TableHead>
                      <TableHead>Skor Akhir</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myPks.map((pk) => (
                      <TableRow key={pk.id}>
                        <TableCell className="font-medium">
                          {new Date(pk.periodStart).getFullYear()}
                        </TableCell>
                        <TableCell>{pk.supervisor?.name || "-"}</TableCell>
                        <TableCell>
                          {pk.strategicPlan ? (
                            <Badge variant="outline" className="text-xs">
                              <Building2 className="w-3 h-3 mr-1" /> {pk.strategicPlan.title}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{pk.indicators?.length || 0} Indikator</TableCell>
                        <TableCell className="font-semibold text-emerald-600">
                          {pk.overallScore ? `${pk.overallScore.toFixed(1)}%` : "0%"}
                        </TableCell>
                        <TableCell>{getStatusBadge(pk.status)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Link href={`/kinerja/pk/${pk.id}`}>
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4 mr-1" /> Detail & Indikator
                            </Button>
                          </Link>
                          {pk.status === "DRAFT" && (
                            <>
                              <Link href={`/kinerja/pk/${pk.id}`}>
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <Send className="w-3.5 h-3.5 mr-1" /> Ajukan
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deletePK.isPending}
                                onClick={() => {
                                  if (confirm("Apakah Anda yakin ingin menghapus draft Perjanjian Kinerja ini?")) {
                                    deletePK.mutate(pk.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subordinates" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Perjanjian Kinerja Bawahan Saya</CardTitle>
              <CardDescription>
                Verifikasi dan setujui draft usulan Perjanjian Kinerja staf/tim di bawah koordinasi Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Memuat data PK...</div>
              ) : subordinatePks.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                  Tidak ada dokumen PK bawahan yang terhubung dengan akun Anda.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pegawai</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>RKA/Renstra Rujukan</TableHead>
                      <TableHead>Indikator</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi Verifikasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subordinatePks.map((pk) => (
                      <TableRow key={pk.id}>
                        <TableCell className="font-semibold">{pk.user?.name}</TableCell>
                        <TableCell>{new Date(pk.periodStart).getFullYear()}</TableCell>
                        <TableCell>{pk.strategicPlan?.title || "-"}</TableCell>
                        <TableCell>{pk.indicators?.length || 0} Indikator</TableCell>
                        <TableCell>{getStatusBadge(pk.status)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/kinerja/pk/${pk.id}`}>
                            <Button size="sm" variant="outline" className="border-emerald-200 hover:bg-emerald-50 text-emerald-700">
                              <Eye className="w-4 h-4 mr-1" /> Tinjau & Verifikasi
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PerformanceAgreementListPage() {
  return (
    <MainLayout>
      <PerformanceAgreementListPageContent />
    </MainLayout>
  );
}
