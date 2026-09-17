"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useParams, useRouter } from "next/navigation";

import { id as localeId } from "date-fns/locale";
import {
  useAudit,
  useUpdateAudit,
  useCreateFinding,
  useCreateFollowUp,
  useUpdateFollowUp,
} from "@/hooks/use-pengawasan";
import type { AuditFindingDto } from "@cipansor/shared";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { MainLayout } from "@/components/layout";
import {
  ArrowLeft,
  Target,
  Calendar,
  AlertTriangle,
  ShieldCheck,
  Play,
  CheckCircle2,
} from "lucide-react";

const findingSchema = z.object({
  findingNumber: z.string().min(2, "Nomor temuan wajib diisi"),
  title: z.string().min(5, "Judul temuan wajib diisi"),
  description: z.string().min(10, "Deskripsi wajib diisi detail"),
  severity: z.string().min(1, "Severity wajib dipilih"),
  category: z.string().min(1, "Kategori wajib dipilih"),
  recommendation: z.string().optional(),
});

function PengawasanAuditDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const auditId = params.id as string;

  const { data: audit, isLoading } = useAudit(auditId);
  const updateAudit = useUpdateAudit();
  const createFinding = useCreateFinding();

  const [findingDialogOpen, setFindingDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof findingSchema>>({
    resolver: zodResolver(findingSchema),
    defaultValues: {
      findingNumber: "",
      title: "",
      description: "",
      severity: "MINOR",
      category: "OPERATIONAL",
      recommendation: "",
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="container mx-auto py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Audit Tidak Ditemukan</h2>
        <Button onClick={() => router.back()}>Kembali</Button>
      </div>
    );
  }

  const handleStartAudit = async () => {
    if (confirm("Mulai pelaksanaan audit ini?")) {
      await updateAudit.mutateAsync({ id: audit.id, status: "IN_PROGRESS" });
    }
  };

  const handleCompleteAudit = async () => {
    if (
      confirm(
        "Tandai audit ini selesai? Laporan final akan dibuat berdasarkan temuan yang ada.",
      )
    ) {
      await updateAudit.mutateAsync({ id: audit.id, status: "COMPLETED" });
    }
  };

  const onFindingSubmit = async (values: z.infer<typeof findingSchema>) => {
    await createFinding.mutateAsync({
      auditId: audit.id,
      ...values,
    });
    setFindingDialogOpen(false);
    form.reset();
  };

  const statusColor =
    {
      PLANNED: "bg-slate-100 text-slate-700",
      IN_PROGRESS: "bg-blue-100 text-blue-700",
      COMPLETED: "bg-green-100 text-green-700",
      CANCELLED: "bg-red-100 text-red-700",
    }[audit.status as string] || "bg-gray-100 text-gray-700";

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Button
        variant="ghost"
        className="mb-2 -ml-4"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Kembali
      </Button>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <PageHeader
              title={audit.title}
              description={`Tipe Audit: ${audit.auditType || "-"}`}
            />
            <Badge
              className={`${statusColor} hover:${statusColor} ml-2 mt-[-24px]`}
            >
              {audit.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {audit.status === "PLANNED" && (
            <Button
              onClick={handleStartAudit}
              disabled={updateAudit.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Mulai Pelaksanaan
            </Button>
          )}
          {audit.status === "IN_PROGRESS" && (
            <Button
              onClick={handleCompleteAudit}
              disabled={updateAudit.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Selesaikan Audit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" /> Ruang Lingkup & Metodologi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">
                Ruang Lingkup (Scope)
              </h4>
              <p className="text-sm rounded-md leading-relaxed p-4 border bg-muted/30">
                {audit.scope || "Belum ada batasan ruang lingkup."}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">
                Metodologi Uji Petik
              </h4>
              <p className="text-sm rounded-md leading-relaxed p-4 border bg-muted/30">
                {audit.methodology ||
                  "Belum ada metodologi yang didefinisikan."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Detail Administrasi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Tipe Audit</span>
              <span className="font-medium">{audit.auditType}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Unit Auditee</span>
              <span className="font-medium">{audit.unit?.name || "-"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Ketua Auditor</span>
              <span className="font-medium">
                {audit.leadAuditor?.name || "-"}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Tgl Rencana</span>
              <span className="font-medium">
                {audit.plannedDate
                  ? safeFormat(new Date(audit.plannedDate), "dd MMM yyyy", {
                      locale: localeId,
                    })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between pb-2">
              <span className="text-muted-foreground">
                Tgl Selesai Realisasi
              </span>
              <span className="font-medium">
                {audit.completedDate
                  ? safeFormat(new Date(audit.completedDate), "dd MMM yyyy", {
                      locale: localeId,
                    })
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 border-t-4 border-t-yellow-500">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" /> Temuan Audit
              (Findings)
            </CardTitle>
            <CardDescription>
              Catatan ketidaksesuaian atau area perbaikan.
            </CardDescription>
          </div>
          {audit.status === "IN_PROGRESS" && (
            <Dialog
              open={findingDialogOpen}
              onOpenChange={setFindingDialogOpen}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  + Catat Temuan Baru
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Catat Temuan Audit</DialogTitle>
                  <DialogDescription>
                    Masukkan rincian temuan ketidaksesuaian yang didapat di
                    lapangan.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onFindingSubmit)}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="findingNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>No. Referensi Temuan</FormLabel>
                            <FormControl>
                              <Input placeholder="FND-001" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Kategori</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih kategori" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="FINANCIAL">
                                  Keuangan
                                </SelectItem>
                                <SelectItem value="OPERATIONAL">
                                  Operasional
                                </SelectItem>
                                <SelectItem value="COMPLIANCE">
                                  Kepatuhan Hukum
                                </SelectItem>
                                <SelectItem value="IT">
                                  Teknologi Informasi
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Judul Singkat Temuan</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="SOP Pembayaran tidak dijalankan"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Kondisi (Description)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Penjelasan lengkap mengenai kondisi aktual di lapangan..."
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="severity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tingkat Signifikansi</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Tingkat" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="CRITICAL">
                                  Kritis (Critical)
                                </SelectItem>
                                <SelectItem value="MAJOR">
                                  Mayor (Major)
                                </SelectItem>
                                <SelectItem value="MINOR">
                                  Minor (Minor)
                                </SelectItem>
                                <SelectItem value="OBSERVATION">
                                  Observasi (Observation)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="recommendation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rekomendasi (Saran Perbaikan)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Tindakan yang disarankan kepada Auditee..."
                              rows={2}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFindingDialogOpen(false)}
                      >
                        Batal
                      </Button>
                      <Button type="submit" disabled={createFinding.isPending}>
                        {createFinding.isPending
                          ? "Menyimpan..."
                          : "Simpan Temuan"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {audit.findings && audit.findings.length > 0 ? (
            <div className="space-y-4">
              {audit.findings.map((finding: AuditFindingDto) => {
                const sevColors: Record<string, string> = {
                  CRITICAL: "bg-red-100 text-red-800 border-red-200",
                  MAJOR: "bg-orange-100 text-orange-800 border-orange-200",
                  MINOR: "bg-yellow-100 text-yellow-800 border-yellow-200",
                  OBSERVATION: "bg-slate-100 text-slate-800 border-slate-200",
                };
                const badgeClass =
                  sevColors[finding.severity] || sevColors.OBSERVATION;

                return (
                  <div
                    key={finding.id}
                    className="border border-l-4 border-l-yellow-500 rounded-md p-4 bg-muted/20"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          {finding.findingNumber}
                        </span>
                        <h4 className="font-bold">{finding.title}</h4>
                      </div>
                      <Badge variant="outline" className={badgeClass}>
                        {finding.severity}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap mb-4">
                      {finding.description}
                    </div>

                    {finding.recommendation && (
                      <div className="bg-green-50/50 border border-green-100 rounded p-3 mt-3">
                        <div className="text-xs font-bold text-green-800 mb-1">
                          REKOMENDASI:
                        </div>
                        <div className="text-sm text-green-900">
                          {finding.recommendation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Belum ada temuan dicatat untuk audit ini.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PengawasanAuditDetailPage() {
  return (
    <MainLayout>
      <PengawasanAuditDetailPageContent />
    </MainLayout>
  );
}
