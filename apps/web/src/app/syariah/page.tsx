"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useCompliances,
  useSyariahSummary,
  useCreateCompliance,
  useUpdateCompliance,
  useCreateShariaAudit,
} from "@/hooks/use-syariah";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Filter, X, BookOpen, ClipboardCheck } from "lucide-react";

// ─── Schemas ────────────────────────────────────────
const complianceFormSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  category: z.enum(["MUAMALAH", "TARBIYAH", "IBADAH", "AKHLAQ", "GOVERNANCE"]),
  description: z.string().optional(),
  standard: z.string().optional(),
});

const auditFormSchema = z.object({
  findings: z.string().min(5, "Temuan wajib diisi"),
  recommendation: z.string().optional(),
  score: z.string().min(1, "Skor wajib diisi"),
  evidence: z.string().optional(),
  auditDate: z.string().min(1, "Tanggal wajib"),
});

// ─── Constants ──────────────────────────────────────
const statusColor: Record<string, string> = {
  COMPLIANT: "bg-green-100 text-green-700",
  PARTIALLY: "bg-yellow-100 text-yellow-700",
  NON_COMPLIANT: "bg-red-100 text-red-700",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  NOT_APPLICABLE: "bg-gray-100 text-gray-500",
};

const statusLabel: Record<string, string> = {
  COMPLIANT: "Sesuai",
  PARTIALLY: "Sebagian",
  NON_COMPLIANT: "Tidak Sesuai",
  UNDER_REVIEW: "Dalam Review",
  NOT_APPLICABLE: "Tidak Berlaku",
};

const categoryLabel: Record<string, string> = {
  MUAMALAH: "Muamalah",
  TARBIYAH: "Tarbiyah",
  IBADAH: "Ibadah",
  AKHLAQ: "Akhlaq",
  GOVERNANCE: "Tata Kelola",
};

const categories = [
  { value: "MUAMALAH", label: "Muamalah – Transaksi Keuangan" },
  { value: "TARBIYAH", label: "Tarbiyah – Pendidikan Islami" },
  { value: "IBADAH", label: "Ibadah – Pelaksanaan Ibadah" },
  { value: "AKHLAQ", label: "Akhlaq – Etika & Moral" },
  { value: "GOVERNANCE", label: "Governance – Tata Kelola" },
];

// ─── Create Compliance Dialog ───────────────────────
function ComplianceFormDialog({ onClose }: { onClose: () => void }) {
  const createCompliance = useCreateCompliance();
  const form = useForm<z.infer<typeof complianceFormSchema>>({
    resolver: zodResolver(complianceFormSchema),
    defaultValues: {
      title: "",
      category: "MUAMALAH",
      description: "",
      standard: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof complianceFormSchema>) => {
    await createCompliance.mutateAsync(values);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Tambah Item Kepatuhan Syariah</DialogTitle>
        <DialogDescription>
          Tambahkan aspek yang perlu dimonitor kepatuhan syariahnya.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Judul</FormLabel>
                <FormControl>
                  <Input
                    placeholder="cth: Akad Murabahah pembayaran SPP"
                    {...field}
                  />
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
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="standard"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Standar / Dalil Rujukan (Opsional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Rujukan syariah…"
                    rows={2}
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
                <FormLabel>Deskripsi (Opsional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Deskripsi detail…"
                    rows={2}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={createCompliance.isPending}>
              {createCompliance.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Record Audit Dialog ────────────────────────────
function RecordAuditDialog({
  complianceId,
  onClose,
}: {
  complianceId: string;
  onClose: () => void;
}) {
  const createAudit = useCreateShariaAudit();
  const form = useForm<z.infer<typeof auditFormSchema>>({
    resolver: zodResolver(auditFormSchema),
    defaultValues: {
      findings: "",
      recommendation: "",
      score: "",
      evidence: "",
      auditDate: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof auditFormSchema>) => {
    await createAudit.mutateAsync({
      complianceId,
      auditDate: new Date(values.auditDate).toISOString(),
      findings: values.findings,
      recommendation: values.recommendation,
      score: Number(values.score),
      evidence: values.evidence,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Catat Audit Syariah</DialogTitle>
        <DialogDescription>
          Catat hasil audit kepatuhan syariah. Skor ≥80: Sesuai, 50-79:
          Sebagian, &lt;50: Tidak Sesuai.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="auditDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tanggal Audit</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="score"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Skor (0-100)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="85"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="findings"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temuan</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Hasil temuan audit…"
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="recommendation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rekomendasi (Opsional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Rekomendasi perbaikan…"
                    rows={2}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={createAudit.isPending}>
              {createAudit.isPending ? "Menyimpan…" : "Simpan Audit"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Main Page ──────────────────────────────────────
function SyariahPageContent() {
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [complianceDialogOpen, setComplianceDialogOpen] = useState(false);
  const [auditComplianceId, setAuditComplianceId] = useState<string | null>(
    null,
  );

  const { data: compliances, isLoading } = useCompliances(
    filterCategory ? { category: filterCategory } : undefined,
  );
  const { data: summary } = useSyariahSummary();

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Kepatuhan Syariah"
          description="Monitor kepatuhan syariah di seluruh aspek lembaga pendidikan Islam."
        />
        <Dialog
          open={complianceDialogOpen}
          onOpenChange={setComplianceDialogOpen}
        >
          <DialogTrigger asChild>
            <Button className="gap-1">
              <Plus className="h-4 w-4" /> Tambah Item
            </Button>
          </DialogTrigger>
          <ComplianceFormDialog
            onClose={() => setComplianceDialogOpen(false)}
          />
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-slate-400">
          <CardHeader className="pb-2">
            <CardDescription>Total Item</CardDescription>
            <CardTitle className="text-3xl">
              {summary?.total ?? <Skeleton className="h-9 w-12" />}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription>Sesuai Syariah</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {summary?.compliant ?? <Skeleton className="h-9 w-12" />}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <CardDescription>Sebagian</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">
              {summary?.partial ?? <Skeleton className="h-9 w-12" />}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardDescription>Tidak Sesuai</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              {summary?.nonCompliant ?? <Skeleton className="h-9 w-12" />}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription>Skor Rata-rata</CardDescription>
            <CardTitle className="text-3xl text-blue-600">
              {summary ? (
                `${Math.round(summary.averageScore)}%`
              ) : (
                <Skeleton className="h-9 w-12" />
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Category Breakdown */}
      {summary?.byCategory && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Berdasarkan Kategori</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {Object.entries(summary.byCategory).map(
              ([cat, data]: [string, any]) => (
                <Card
                  key={cat}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() =>
                    setFilterCategory(cat === filterCategory ? undefined : cat)
                  }
                >
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {categoryLabel[cat] || cat}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {Math.round(data.averageScore)}%
                    </div>
                    <Progress value={data.averageScore} className="h-2 mt-2" />
                    <div className="text-xs text-muted-foreground mt-1">
                      {data.total} item
                    </div>
                  </CardContent>
                </Card>
              ),
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filterCategory || "ALL"}
          onValueChange={(v) => setFilterCategory(v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Semua Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filterCategory && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilterCategory(undefined)}
          >
            <X className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Compliance List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Daftar Kepatuhan</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : compliances?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-lg mb-1">Belum ada item kepatuhan.</p>
              <p className="text-sm">
                Klik &quot;Tambah Item&quot; untuk mulai memonitor.
              </p>
            </CardContent>
          </Card>
        ) : (
          compliances?.map((item: any) => (
            <Card
              key={item.id}
              className="hover:shadow-md transition-shadow group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription>
                      {categoryLabel[item.category] || item.category}
                    </CardDescription>
                    {item.standard && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Dalil: {item.standard}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.score !== null && (
                      <span className="text-sm font-medium">{item.score}%</span>
                    )}
                    <Badge className={statusColor[item.status]}>
                      {statusLabel[item.status] || item.status}
                    </Badge>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Dialog
                        open={auditComplianceId === item.id}
                        onOpenChange={(open) =>
                          !open && setAuditComplianceId(null)
                        }
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setAuditComplianceId(item.id)}
                          >
                            Audit
                          </Button>
                        </DialogTrigger>
                        <RecordAuditDialog
                          complianceId={item.id}
                          onClose={() => setAuditComplianceId(null)}
                        />
                      </Dialog>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default function SyariahPageWithShell() {
  return (
    <MainLayout>
      <SyariahPageContent />
    </MainLayout>
  );
}
