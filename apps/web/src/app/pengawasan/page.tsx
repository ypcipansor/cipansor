"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useAudits,
  useCreateAudit,
  useUpdateAudit,
  useDeleteAudit,
  useCreateFinding,
  useCreateFollowUp,
} from "@/hooks/use-pengawasan";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Filter,
  X,
} from "lucide-react";

// ─── Schemas ────────────────────────────────────────
const auditFormSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  auditType: z.string().min(1, "Tipe audit wajib"),
  plannedDate: z.string().min(1, "Tanggal wajib"),
  scope: z.string().optional(),
  methodology: z.string().optional(),
});

const findingFormSchema = z.object({
  findingNumber: z.string().min(1, "Nomor temuan wajib"),
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().min(5, "Deskripsi wajib"),
  severity: z.enum(["OBSERVATION", "MINOR", "MAJOR", "CRITICAL"]),
  category: z.string().min(1, "Kategori wajib"),
  recommendation: z.string().optional(),
});

const followUpFormSchema = z.object({
  action: z.string().min(5, "Tindakan wajib minimal 5 karakter"),
  dueDate: z.string().optional(),
});

type AuditFormValues = z.infer<typeof auditFormSchema>;

// ─── Constants ──────────────────────────────────────
const statusColor: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const severityColor: Record<string, string> = {
  OBSERVATION: "bg-gray-100 text-gray-700",
  MINOR: "bg-yellow-100 text-yellow-700",
  MAJOR: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const auditTypes = [
  "Akademik",
  "Keuangan",
  "Operasional",
  "Kepatuhan",
  "Tata Kelola",
];

// ─── Create Audit Dialog ────────────────────────────
function AuditFormDialog({
  editData,
  onClose,
}: {
  editData?: any;
  onClose: () => void;
}) {
  const createAudit = useCreateAudit();
  const updateAudit = useUpdateAudit();
  const isEdit = !!editData;

  const form = useForm<AuditFormValues>({
    resolver: zodResolver(auditFormSchema),
    defaultValues: {
      title: editData?.title || "",
      description: editData?.description || "",
      auditType: editData?.auditType || "",
      plannedDate: editData?.plannedDate
        ? new Date(editData.plannedDate).toISOString().split("T")[0]
        : "",
      scope: editData?.scope || "",
      methodology: editData?.methodology || "",
    },
  });

  const onSubmit = async (values: AuditFormValues) => {
    const payload = {
      ...values,
      plannedDate: new Date(values.plannedDate).toISOString(),
    };
    if (isEdit) {
      await updateAudit.mutateAsync({ id: editData.id, ...payload });
    } else {
      await createAudit.mutateAsync(payload);
    }
    onClose();
  };

  const isPending = createAudit.isPending || updateAudit.isPending;

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Edit Audit" : "Jadwalkan Audit Baru"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Perbarui jadwal audit internal."
            : "Isi data audit internal yang akan dijadwalkan."}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Judul Audit</FormLabel>
                <FormControl>
                  <Input placeholder="cth: Audit Keuangan Q1 2025" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="auditType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipe Audit</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih tipe" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {auditTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
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
              name="plannedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tanggal Rencana</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="scope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ruang Lingkup (Opsional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Ruang lingkup audit…"
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
                <FormLabel>Catatan (Opsional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Catatan tambahan…"
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan…" : isEdit ? "Perbarui" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Add Finding Dialog ─────────────────────────────
function AddFindingDialog({
  auditId,
  onClose,
}: {
  auditId: string;
  onClose: () => void;
}) {
  const createFinding = useCreateFinding();
  const form = useForm<z.infer<typeof findingFormSchema>>({
    resolver: zodResolver(findingFormSchema),
    defaultValues: {
      findingNumber: "",
      title: "",
      description: "",
      severity: "MINOR",
      category: "",
      recommendation: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof findingFormSchema>) => {
    await createFinding.mutateAsync({ auditId, ...values });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>Tambah Temuan</DialogTitle>
        <DialogDescription>
          Catat temuan audit beserta tingkat keparahan.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="findingNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor Temuan</FormLabel>
                  <FormControl>
                    <Input placeholder="TM-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="severity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tingkat</FormLabel>
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
                      <SelectItem value="OBSERVATION">Observasi</SelectItem>
                      <SelectItem value="MINOR">Minor</SelectItem>
                      <SelectItem value="MAJOR">Major</SelectItem>
                      <SelectItem value="CRITICAL">Kritikal</SelectItem>
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
                <FormLabel>Judul Temuan</FormLabel>
                <FormControl>
                  <Input
                    placeholder="cth: Pengelolaan kas tidak sesuai SOP"
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
                <FormControl>
                  <Input placeholder="cth: Keuangan" {...field} />
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
                <FormLabel>Deskripsi</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Deskripsi temuan…"
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
            <Button type="submit" disabled={createFinding.isPending}>
              {createFinding.isPending ? "Menyimpan…" : "Simpan Temuan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Main Page ──────────────────────────────────────
function PengawasanPageContent() {
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [findingAuditId, setFindingAuditId] = useState<string | null>(null);

  const { data: audits, isLoading } = useAudits(
    filterStatus ? { status: filterStatus } : undefined,
  );
  const deleteAudit = useDeleteAudit();

  const totalFindings =
    audits?.reduce(
      (sum: number, a: any) => sum + (a.findings?.length || 0),
      0,
    ) || 0;
  const criticalFindings =
    audits?.reduce(
      (sum: number, a: any) =>
        sum +
        (a.findings?.filter(
          (f: any) => f.severity === "CRITICAL" || f.severity === "MAJOR",
        ).length || 0),
      0,
    ) || 0;

  const handleEdit = (audit: any) => {
    setEditItem(audit);
    setDialogOpen(true);
  };
  const handleCreate = () => {
    setEditItem(null);
    setDialogOpen(true);
  };
  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditItem(null);
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Pengawasan Internal"
          description="Kelola audit internal, temuan, dan tindak lanjut."
        />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate} className="gap-1">
              <Plus className="h-4 w-4" />
              Jadwalkan Audit
            </Button>
          </DialogTrigger>
          <AuditFormDialog editData={editItem} onClose={handleDialogClose} />
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription>Total Audit</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                audits?.length || 0
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <CardDescription>Sedang Berjalan</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">
              {isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                audits?.filter((a: any) => a.status === "IN_PROGRESS").length ||
                0
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardDescription>Total Temuan</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? <Skeleton className="h-9 w-12" /> : totalFindings}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardDescription>Temuan Kritis/Major</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              {isLoading ? <Skeleton className="h-9 w-12" /> : criticalFindings}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filterStatus || "ALL"}
          onValueChange={(v) => setFilterStatus(v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Status</SelectItem>
            <SelectItem value="PLANNED">Terjadwal</SelectItem>
            <SelectItem value="IN_PROGRESS">Berjalan</SelectItem>
            <SelectItem value="COMPLETED">Selesai</SelectItem>
          </SelectContent>
        </Select>
        {filterStatus && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilterStatus(undefined)}
          >
            <X className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Audit List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Daftar Audit</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : audits?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-lg mb-1">Belum ada audit terjadwal.</p>
              <p className="text-sm">
                Klik &quot;Jadwalkan Audit&quot; untuk membuat jadwal baru.
              </p>
            </CardContent>
          </Card>
        ) : (
          audits?.map((audit: any) => (
            <Card
              key={audit.id}
              className="hover:shadow-md transition-shadow group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{audit.title}</CardTitle>
                    <CardDescription>
                      Tipe: {audit.auditType} • Auditor:{" "}
                      {audit.leadAuditor?.name} •{" "}
                      {new Date(audit.plannedDate).toLocaleDateString("id-ID")}
                    </CardDescription>
                    {audit.scope && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Ruang Lingkup: {audit.scope}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor[audit.status]}>
                      {audit.status}
                    </Badge>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleEdit(audit)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteId(audit.id)}
                        title="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Temuan ({audit.findings?.length || 0})
                  </span>
                  <Dialog
                    open={findingAuditId === audit.id}
                    onOpenChange={(open) => !open && setFindingAuditId(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 h-7"
                        onClick={() => setFindingAuditId(audit.id)}
                      >
                        <Plus className="h-3 w-3" /> Tambah Temuan
                      </Button>
                    </DialogTrigger>
                    <AddFindingDialog
                      auditId={audit.id}
                      onClose={() => setFindingAuditId(null)}
                    />
                  </Dialog>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {audit.findings?.map((f: any) => (
                    <Badge
                      key={f.id}
                      variant="outline"
                      className={severityColor[f.severity]}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {f.severity}: {f.title}
                    </Badge>
                  ))}
                  {(!audit.findings || audit.findings.length === 0) && (
                    <span className="text-sm text-muted-foreground italic">
                      Belum ada temuan
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Hapus Audit?"
        description="Audit beserta seluruh temuan dan tindak lanjut akan dihapus permanen."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={async () => {
          if (deleteId) {
            await deleteAudit.mutateAsync(deleteId);
            setDeleteId(null);
          }
        }}
        isLoading={deleteAudit.isPending}
      />
    </div>
  );
}

export default function PengawasanPageWithShell() {
  return (
    <MainLayout>
      <PengawasanPageContent />
    </MainLayout>
  );
}
