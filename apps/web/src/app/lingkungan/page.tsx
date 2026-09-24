"use client";
import { MainLayout } from "@/components/layout";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useEnvironmentPrograms,
  useWasteSummary,
  useGreenIndicators,
  useCreateProgram,
  useUpdateProgram,
  useDeleteProgram,
  useCreateWasteRecord,
  useCreateIndicator,
} from "@/hooks/use-lingkungan";
import { useAuth } from "@/hooks/use-auth";
import { useUnits } from "@/hooks/use-units";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Leaf, Recycle, BarChart3 } from "lucide-react";

// ─── Schemas ────────────────────────────────────────
const programFormSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  category: z.string().min(1, "Kategori wajib"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.string().optional(),
});

const wasteFormSchema = z.object({
  category: z.enum([
    "ORGANIC",
    "INORGANIC",
    "B3",
    "PAPER",
    "ELECTRONIC",
    "OTHER",
  ]),
  weight: z.string().min(1, "Berat wajib"),
  method: z.string().min(1, "Metode wajib"),
  recordDate: z.string().min(1, "Tanggal wajib"),
  notes: z.string().optional(),
});

const indicatorFormSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  category: z.string().min(1, "Kategori wajib"),
  targetValue: z.string().min(1, "Target wajib"),
  currentValue: z.string().optional(),
  unit: z.string().min(1, "Satuan wajib"),
  period: z.string().min(1, "Periode wajib"),
  recordDate: z.string().min(1, "Tanggal wajib"),
});

// ─── Constants ──────────────────────────────────────
const statusColor: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const wasteCategories = [
  { value: "ORGANIC", label: "Organik" },
  { value: "INORGANIC", label: "Anorganik" },
  { value: "B3", label: "B3 (Berbahaya)" },
  { value: "PAPER", label: "Kertas" },
  { value: "ELECTRONIC", label: "Elektronik" },
  { value: "OTHER", label: "Lainnya" },
];

const programCategories = [
  "Penghijauan",
  "Konservasi Air",
  "Hemat Energi",
  "Pengelolaan Sampah",
  "Edukasi Lingkungan",
  "Kebersihan",
  "Daur Ulang",
  "Lainnya",
];

// ─── Create Program Dialog ──────────────────────────
function ProgramFormDialog({
  editData,
  onClose,
}: {
  editData?: any;
  onClose: () => void;
}) {
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const isEdit = !!editData;

  const form = useForm<z.infer<typeof programFormSchema>>({
    resolver: zodResolver(programFormSchema),
    defaultValues: {
      title: editData?.title || "",
      description: editData?.description || "",
      category: editData?.category || "",
      startDate: editData?.startDate
        ? new Date(editData.startDate).toISOString().split("T")[0]
        : "",
      endDate: editData?.endDate
        ? new Date(editData.endDate).toISOString().split("T")[0]
        : "",
      budget: editData?.budget ? String(editData.budget) : "",
    },
  });

  const onSubmit = async (values: z.infer<typeof programFormSchema>) => {
    const payload = {
      ...values,
      startDate: values.startDate
        ? new Date(values.startDate).toISOString()
        : undefined,
      endDate: values.endDate
        ? new Date(values.endDate).toISOString()
        : undefined,
      budget: values.budget ? Number(values.budget) : undefined,
    };
    if (isEdit)
      await updateProgram.mutateAsync({ id: editData.id, ...payload });
    else await createProgram.mutateAsync(payload);
    onClose();
  };

  const isPending = createProgram.isPending || updateProgram.isPending;

  return (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Edit Program" : "Tambah Program Lingkungan"}
        </DialogTitle>
        <DialogDescription>
          Kelola program green campus dan lingkungan hidup.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Judul Program</FormLabel>
                <FormControl>
                  <Input
                    placeholder="cth: Penghijauan Area Sekolah"
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
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {programCategories.map((c) => (
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
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mulai</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Selesai</FormLabel>
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
            name="budget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Anggaran (Rp, Opsional)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
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

// ─── Record Waste Dialog ────────────────────────────
function WasteFormDialog({ onClose }: { onClose: () => void }) {
  const createWaste = useCreateWasteRecord();
  const form = useForm<z.infer<typeof wasteFormSchema>>({
    resolver: zodResolver(wasteFormSchema),
    defaultValues: {
      category: "ORGANIC",
      weight: "",
      method: "",
      recordDate: "",
      notes: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof wasteFormSchema>) => {
    await createWaste.mutateAsync({
      ...values,
      weight: Number(values.weight),
      recordDate: new Date(values.recordDate).toISOString(),
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Catat Pengelolaan Sampah</DialogTitle>
        <DialogDescription>
          Rekam data pengelolaan sampah dan metode yang digunakan.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
                      {wasteCategories.map((c) => (
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
              name="weight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Berat (kg)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Metode Pengolahan</FormLabel>
                <FormControl>
                  <Input
                    placeholder="cth: Kompos, Daur Ulang, TPA"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="recordDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tanggal</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Catatan (Opsional)</FormLabel>
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
            <Button type="submit" disabled={createWaste.isPending}>
              {createWaste.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Add Indicator Dialog ───────────────────────────
function IndicatorFormDialog({ onClose }: { onClose: () => void }) {
  const createIndicator = useCreateIndicator();
  const form = useForm<z.infer<typeof indicatorFormSchema>>({
    resolver: zodResolver(indicatorFormSchema),
    defaultValues: {
      name: "",
      category: "",
      targetValue: "",
      currentValue: "0",
      unit: "",
      period: "",
      recordDate: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof indicatorFormSchema>) => {
    await createIndicator.mutateAsync({
      ...values,
      targetValue: Number(values.targetValue),
      currentValue: Number(values.currentValue || 0),
      recordDate: new Date(values.recordDate).toISOString(),
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Tambah Indikator Green Campus</DialogTitle>
        <DialogDescription>
          Tambahkan indikator pengukuran kinerja lingkungan.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Indikator</FormLabel>
                <FormControl>
                  <Input placeholder="cth: Konsumsi Energi" {...field} />
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
                  <Input placeholder="cth: Energi, Air, Sampah" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="targetValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currentValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Saat Ini</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Satuan</FormLabel>
                  <FormControl>
                    <Input placeholder="kWh, m³" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="period"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Periode</FormLabel>
                  <FormControl>
                    <Input placeholder="Bulanan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="recordDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tanggal</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={createIndicator.isPending}>
              {createIndicator.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Main Page ──────────────────────────────────────
function LingkunganPageContent() {
  const [programDialogOpen, setProgramDialogOpen] = useState(false);
  const [wasteDialogOpen, setWasteDialogOpen] = useState(false);
  const [indicatorDialogOpen, setIndicatorDialogOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // The backend scopes every read by unitId (and requires one for users without
  // their own, e.g. SUPER_ADMIN), so resolve a unit before querying.
  const { user } = useAuth();
  const { data: units } = useUnits();
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  useEffect(() => {
    const ownUnit = (user as { unitId?: string } | null)?.unitId;
    if (!selectedUnitId) {
      if (ownUnit) setSelectedUnitId(ownUnit);
      else if (units?.length) setSelectedUnitId(units[0].id);
    }
  }, [user, units, selectedUnitId]);
  const isSuperAdmin = !(user as { unitId?: string } | null)?.unitId;

  const { data: programs, isLoading: loadingPrograms } =
    useEnvironmentPrograms(selectedUnitId);
  const { data: wasteSummary } = useWasteSummary(selectedUnitId);
  const { data: indicators } = useGreenIndicators(selectedUnitId);
  const deleteProgram = useDeleteProgram();

  const handleEditProgram = (prog: any) => {
    setEditProgram(prog);
    setProgramDialogOpen(true);
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Kampus Hijau"
          description="Kelola program lingkungan (Adiwiyata), pengelolaan sampah, dan indikator Kampus Hijau."
        />
        {isSuperAdmin && units && units.length > 0 && (
          <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Pilih unit" />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Leaf className="h-3 w-3" /> Total Program
            </CardDescription>
            <CardTitle className="text-3xl">
              {loadingPrograms ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                programs?.length || 0
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardDescription>Program Aktif</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">
              {programs?.filter((p: any) => p.status === "ACTIVE").length || 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Recycle className="h-3 w-3" /> Total Sampah
            </CardDescription>
            <CardTitle className="text-3xl">
              {wasteSummary ? (
                `${wasteSummary.totalWeight.toFixed(1)} kg`
              ) : (
                <Skeleton className="h-9 w-16" />
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" /> Indikator
            </CardDescription>
            <CardTitle className="text-3xl">
              {indicators?.length || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="programs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="programs">Program Lingkungan</TabsTrigger>
          <TabsTrigger value="waste">Pengelolaan Sampah</TabsTrigger>
          <TabsTrigger value="indicators">Indikator Green Campus</TabsTrigger>
        </TabsList>

        {/* Programs Tab */}
        <TabsContent value="programs" className="space-y-4">
          <div className="flex justify-end">
            <Dialog
              open={programDialogOpen}
              onOpenChange={setProgramDialogOpen}
            >
              <DialogTrigger asChild>
                <Button className="gap-1" onClick={() => setEditProgram(null)}>
                  <Plus className="h-4 w-4" /> Tambah Program
                </Button>
              </DialogTrigger>
              <ProgramFormDialog
                editData={editProgram}
                onClose={() => {
                  setProgramDialogOpen(false);
                  setEditProgram(null);
                }}
              />
            </Dialog>
          </div>
          {loadingPrograms ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : programs?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Leaf className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                <p>Belum ada program lingkungan.</p>
              </CardContent>
            </Card>
          ) : (
            programs?.map((prog: any) => (
              <Card
                key={prog.id}
                className="hover:shadow-md transition-shadow group"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{prog.title}</CardTitle>
                      <CardDescription>
                        {prog.category} {prog.pic && `• PIC: ${prog.pic.name}`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={statusColor[prog.status] || "bg-gray-100"}
                      >
                        {prog.status}
                      </Badge>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleEditProgram(prog)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteId(prog.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-medium">{prog.progress || 0}%</span>
                  </div>
                  <Progress value={prog.progress || 0} className="h-2 mt-1" />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Waste Tab */}
        <TabsContent value="waste" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={wasteDialogOpen} onOpenChange={setWasteDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1">
                  <Plus className="h-4 w-4" /> Catat Sampah
                </Button>
              </DialogTrigger>
              <WasteFormDialog onClose={() => setWasteDialogOpen(false)} />
            </Dialog>
          </div>
          {wasteSummary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Berdasarkan Kategori
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(wasteSummary.byCategory || {}).map(
                    ([cat, weight]: [string, any]) => {
                      const pct =
                        wasteSummary.totalWeight > 0
                          ? (weight / wasteSummary.totalWeight) * 100
                          : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>
                              {wasteCategories.find((c) => c.value === cat)
                                ?.label || cat}
                            </span>
                            <span className="font-medium">
                              {weight.toFixed(1)} kg ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <Progress value={pct} className="h-2" />
                        </div>
                      );
                    },
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Berdasarkan Metode</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(wasteSummary.byMethod || {}).map(
                    ([method, weight]: [string, any]) => {
                      const pct =
                        wasteSummary.totalWeight > 0
                          ? (weight / wasteSummary.totalWeight) * 100
                          : 0;
                      return (
                        <div key={method}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{method}</span>
                            <span className="font-medium">
                              {weight.toFixed(1)} kg ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <Progress value={pct} className="h-2" />
                        </div>
                      );
                    },
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Indicators Tab */}
        <TabsContent value="indicators" className="space-y-4">
          <div className="flex justify-end">
            <Dialog
              open={indicatorDialogOpen}
              onOpenChange={setIndicatorDialogOpen}
            >
              <DialogTrigger asChild>
                <Button className="gap-1">
                  <Plus className="h-4 w-4" /> Tambah Indikator
                </Button>
              </DialogTrigger>
              <IndicatorFormDialog
                onClose={() => setIndicatorDialogOpen(false)}
              />
            </Dialog>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {indicators?.map((ind: any) => {
              const pct =
                ind.targetValue > 0
                  ? Math.min(100, (ind.currentValue / ind.targetValue) * 100)
                  : 0;
              return (
                <Card key={ind.id}>
                  <CardHeader className="pb-2">
                    <CardDescription>
                      {ind.category} • {ind.period}
                    </CardDescription>
                    <CardTitle className="text-base">{ind.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between text-sm text-muted-foreground mb-1">
                      <span>
                        {ind.currentValue} / {ind.targetValue} {ind.unit}
                      </span>
                      <span className="font-medium">{pct.toFixed(0)}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </CardContent>
                </Card>
              );
            })}
            {(!indicators || indicators.length === 0) && (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  Belum ada indikator.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Hapus Program?"
        description="Program lingkungan akan dihapus permanen."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={async () => {
          if (deleteId) {
            await deleteProgram.mutateAsync(deleteId);
            setDeleteId(null);
          }
        }}
        isLoading={deleteProgram.isPending}
      />
    </div>
  );
}

export default function LingkunganPageWithShell() {
  return (
    <MainLayout>
      <LingkunganPageContent />
    </MainLayout>
  );
}
