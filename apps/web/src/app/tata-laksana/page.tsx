"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useSOPs,
  useSOPSummary,
  useCreateSOP,
  useUpdateSOP,
  useApproveSOP,
  useDeleteSOP,
} from "@/hooks/use-tata-laksana";
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
import {
  Plus,
  Trash2,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Edit,
} from "lucide-react";

const sopFormSchema = z.object({
  unitId: z.string().min(1, "Unit wajib"),
  documentNumber: z.string().min(3, "Nomor dokumen minimal 3 karakter"),
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  category: z.string().min(1, "Kategori wajib"),
  content: z.string().optional(),
  scope: z.string().optional(),
  responsibility: z.string().optional(),
});

const categories = [
  "Akademik",
  "Keuangan",
  "SDM",
  "Operasional",
  "Sarana Prasarana",
  "Keagamaan",
  "Kemuridan",
  "Lainnya",
];

const statusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  REVIEW: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  DEPRECATED: "bg-orange-100 text-orange-700",
  ARCHIVED: "bg-red-100 text-red-700",
};

function SOPFormDialog({ onClose }: { onClose: () => void }) {
  const createSOP = useCreateSOP();
  const form = useForm<z.infer<typeof sopFormSchema>>({
    resolver: zodResolver(sopFormSchema),
    defaultValues: {
      unitId: "",
      documentNumber: "",
      title: "",
      description: "",
      category: "",
      content: "",
      scope: "",
      responsibility: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof sopFormSchema>) => {
    await createSOP.mutateAsync(values);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>Buat SOP Baru</DialogTitle>
        <DialogDescription>
          Buat Standard Operating Procedure baru.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4 max-h-[70vh] overflow-y-auto pr-2"
        >
          <FormField
            control={form.control}
            name="unitId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit ID</FormLabel>
                <FormControl>
                  <Input placeholder="UUID unit" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="documentNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor Dokumen</FormLabel>
                  <FormControl>
                    <Input placeholder="SOP-AKD-001" {...field} />
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
                        <SelectValue placeholder="Pilih" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
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
                <FormLabel>Judul</FormLabel>
                <FormControl>
                  <Input
                    placeholder="cth: SOP Penerimaan Siswa Baru"
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
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="scope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ruang Lingkup (Opsional)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={createSOP.isPending}>
              {createSOP.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

function TataLaksanaPageContent() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: sops, isLoading } = useSOPs({
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });
  const { data: summary } = useSOPSummary();
  const deleteSOP = useDeleteSOP();
  const approveSOP = useApproveSOP();

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Tata Laksana (SOP)"
        description="Kelola Standard Operating Procedure lembaga."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> Total SOP
            </CardDescription>
            <CardTitle className="text-3xl">{summary?.total || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Aktif
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {summary?.active || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Draft
            </CardDescription>
            <CardTitle className="text-3xl text-yellow-600">
              {summary?.draft || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Deprecated
            </CardDescription>
            <CardTitle className="text-3xl text-orange-600">
              {summary?.deprecated || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters + Action */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="REVIEW">Review</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="DEPRECATED">Deprecated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1">
              <Plus className="h-4 w-4" /> Buat SOP
            </Button>
          </DialogTrigger>
          <SOPFormDialog onClose={() => setDialogOpen(false)} />
        </Dialog>
      </div>

      {/* SOP List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : sops?.length === 0 || !sops ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p>Belum ada SOP.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sops.map((sop: any) => (
            <Card
              key={sop.id}
              className="hover:shadow-md transition-shadow group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        {sop.documentNumber}
                      </Badge>
                      <Badge className={statusColor[sop.status] || ""}>
                        {sop.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg mt-1">{sop.title}</CardTitle>
                    <CardDescription>
                      {sop.category} • v{sop.version} • {sop.createdBy?.name} •{" "}
                      {sop._count?.revisions || 0} revisi
                    </CardDescription>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    {sop.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveSOP.mutate(sop.id)}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Approve
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(sop.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {sop.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {sop.description}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Hapus SOP?"
        description="SOP ini akan dihapus beserta seluruh riwayat revisinya."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={async () => {
          if (deleteId) await deleteSOP.mutateAsync(deleteId);
          setDeleteId(null);
        }}
        isLoading={deleteSOP.isPending}
      />
    </div>
  );
}

export default function TataLaksanaPageWithShell() {
  return (
    <MainLayout>
      <TataLaksanaPageContent />
    </MainLayout>
  );
}
