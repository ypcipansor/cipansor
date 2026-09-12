"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  usePlans,
  useCreatePlan,
  useUpdatePlan,
  useApprovePlan,
  useDeletePlan,
  type StrategicPlan,
  PLAN_STATUS_LABEL,
  PLAN_REVIEW_STAGE_LABEL,
  PLAN_TYPE_LABEL,
  planTierLabel,
} from "@/hooks/use-perencanaan";
import { useUnits } from "@/hooks/use-units";
import { useAuthStore } from "@/stores/auth";
import { getPrimaryRoleCode } from "@/lib/rbac";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, CheckCircle, Filter, X } from "lucide-react";

// ─── Schemas ────────────────────────────────────────────────
const planFormBase = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  type: z.enum(["RPJP", "RENSTRA", "RKA"]),
  // Only the annual document has two tiers. RPJP and Renstra are always the
  // yayasan's own, so the control is hidden for them and pinned to YAYASAN.
  level: z.enum(["YAYASAN", "UNIT"]),
  unitId: z.string().optional(),
  parentId: z.string().optional(),
  startDate: z.string().min(1, "Tanggal mulai wajib"),
  endDate: z.string().min(1, "Tanggal selesai wajib"),
  budget: z.string().optional(),
});

type PlanFormValues = z.infer<typeof planFormBase>;

/**
 * Hierarchy is fixed at creation — `updatePlan` deliberately drops unit and
 * parent — so the edit dialog hides those pickers. Requiring them there anyway
 * would fail the form on a field the user cannot see.
 */
const planFormSchema = (isEdit: boolean, needsUnitPick: boolean) =>
  planFormBase.superRefine((v, ctx) => {
    if (isEdit) return;
    if (needsUnitPick && v.type === "RKA" && v.level === "UNIT" && !v.unitId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unitId"],
        message: "Pilih unit kerja pemilik RKA ini",
      });
    }
    if (v.type !== "RPJP" && !v.parentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentId"],
        message:
          v.type === "RENSTRA"
            ? "Renstra harus menginduk pada RPJP"
            : v.level === "UNIT"
              ? "RKA unit harus menginduk pada RKA Yayasan"
              : "RKA Yayasan harus menginduk pada Renstra",
      });
    }
  });

// ─── Constants ──────────────────────────────────────────────
const statusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  PROPOSED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

// RPJP was in the database enum but absent from this list, so the longest-horizon
// document was the one plan type the UI could not create.
const typeOptions = [
  { value: "RPJP", label: "RPJP — Rencana Pembangunan Jangka Panjang (20 Tahun)" },
  { value: "RENSTRA", label: "Renstra — Rencana Strategis (5 Tahun)" },
  { value: "RKA", label: "RKA — Rencana Kerja dan Anggaran (1 Tahun)" },
];

// The annual level has two tiers, mirroring the national chain
// (RKPD konsolidasi → Renja/RKA per OPD): the pengurus approves one
// consolidated RKA Yayasan, and each school files its own slice beneath it.
const levelOptions = [
  { value: "YAYASAN", label: "Yayasan — konsolidasi seluruh unit" },
  { value: "UNIT", label: "Unit — turunan dari RKA Yayasan" },
];

const statusOptions = Object.entries(PLAN_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}));

// ─── Create/Edit Dialog ─────────────────────────────────────
function PlanFormDialog({
  editData,
  onClose,
}: {
  editData?: any;
  onClose: () => void;
}) {
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const isEdit = !!editData;
  const { data: allPlans } = usePlans();
  const { data: units } = useUnits();
  // The controller files a plan against the caller's own unit whenever they
  // have one, so a unit-scoped user offered the "Yayasan" tier would fill in
  // the whole form and then be refused by the server for a reason the screen
  // never mentioned. Only a foundation-scoped caller gets the choice.
  const callerUnitId = useAuthStore((s) => s.user?.unitId) ?? null;
  const canFileForYayasan = callerUnitId === null;

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema(isEdit, canFileForYayasan)),
    defaultValues: {
      title: editData?.title || "",
      description: editData?.description || "",
      type: editData?.type || "RKA",
      level: editData?.unitId || !canFileForYayasan ? "UNIT" : "YAYASAN",
      unitId: editData?.unitId || undefined,
      parentId: editData?.parentId || undefined,
      startDate: editData?.startDate
        ? new Date(editData.startDate).toISOString().split("T")[0]
        : "",
      endDate: editData?.endDate
        ? new Date(editData.endDate).toISOString().split("T")[0]
        : "",
      budget: editData?.budget ? String(editData.budget) : "",
    },
  });

  const type = form.watch("type");
  const level = form.watch("level");
  const isUnitRka = type === "RKA" && level === "UNIT";
  // A unit-scoped caller has exactly one unit and the server uses it
  // regardless, so the picker would be a control with one correct answer.
  const showUnitPicker = isUnitRka && canFileForYayasan;

  // The example must match the document being created — a Renstra example on
  // an RKA Unit form is an instruction to name the thing wrongly.
  const titlePlaceholder =
    type === "RPJP"
      ? "cth: RPJP Yayasan Pesantren Cipansor 2027–2045"
      : type === "RENSTRA"
        ? "cth: Renstra Yayasan Pesantren Cipansor 2027–2029"
        : isUnitRka
          ? "cth: RKA SMP IT Pesantren Cipansor 2027"
          : "cth: RKA Yayasan Pesantren Cipansor 2027";

  // Each tier may only hang off the one directly above it, so the picker only
  // ever offers that tier — a Renstra lists RPJPs, an RKA Yayasan lists
  // Renstras, and a unit RKA lists the consolidated RKAs (unitId null).
  const parentType = type === "RENSTRA" ? "RPJP" : isUnitRka ? "RKA" : "RENSTRA";
  const parentOptions = (allPlans ?? []).filter(
    (p) =>
      p.type === parentType &&
      (parentType !== "RKA" || p.unitId === null) &&
      p.id !== editData?.id,
  );

  const onSubmit = async (values: PlanFormValues) => {
    const { level: _level, ...rest } = values;
    const payload = {
      ...rest,
      // A yayasan document carries no unit — that is what makes it the
      // foundation's own plan rather than a school's.
      unitId: isUnitRka ? values.unitId : undefined,
      parentId: values.type === "RPJP" ? undefined : values.parentId,
      startDate: new Date(values.startDate).toISOString(),
      endDate: new Date(values.endDate).toISOString(),
      budget: values.budget ? Number(values.budget) : undefined,
    };

    if (isEdit) {
      await updatePlan.mutateAsync({ id: editData.id, ...payload });
    } else {
      await createPlan.mutateAsync(payload);
    }
    onClose();
  };

  const isPending = createPlan.isPending || updatePlan.isPending;

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Edit Rencana" : "Buat Rencana Baru"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Perbarui informasi rencana strategis. Induk dan unit ditetapkan saat pembuatan dan tidak diubah di sini."
            : "Rantai: RPJP → Renstra → RKA Yayasan → RKA Unit. Setiap dokumen menginduk pada satu tingkat di atasnya."}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Judul Rencana</FormLabel>
                <FormControl>
                  <Input placeholder={titlePlaceholder} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jenis Rencana</FormLabel>
                <Select
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue("parentId", undefined);
                    if (v !== "RKA") {
                      form.setValue("level", "YAYASAN");
                      form.setValue("unitId", undefined);
                    }
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {typeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {!isEdit && type === "RKA" && canFileForYayasan && (
            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tingkat RKA</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v);
                      // The eligible parents differ per tier, so a stale
                      // selection would silently submit the wrong induk.
                      form.setValue("parentId", undefined);
                      if (v === "YAYASAN") form.setValue("unitId", undefined);
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih tingkat" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {levelOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {!isEdit && showUnitPicker && (
            <FormField
              control={form.control}
              name="unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Kerja</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih unit kerja" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(units ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {!isEdit && type !== "RPJP" && (
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {type === "RENSTRA"
                      ? "RPJP Induk"
                      : isUnitRka
                        ? "RKA Yayasan Induk"
                        : "Renstra Induk"}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            parentOptions.length
                              ? "Pilih dokumen induk"
                              : `Belum ada ${PLAN_TYPE_LABEL[parentType]} untuk diinduki`
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {parentOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deskripsi (Opsional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Deskripsi singkat rencana…"
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
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tanggal Mulai</FormLabel>
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
                  <FormLabel>Tanggal Selesai</FormLabel>
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
                  <Input
                    type="number"
                    placeholder="cth: 500000000"
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

// ─── Main Page ──────────────────────────────────────────────
function PerencanaanPageContent() {
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: plans, isLoading } = usePlans({
    type: filterType,
    status: filterStatus,
  });
  const approvePlan = useApprovePlan();
  const deletePlan = useDeletePlan();
  const authUser = useAuthStore((s) => s.user);
  // Only an RKA Unit is approved with one click, and only by Ketua Pengurus;
  // a yayasan document goes Pengurus → Pengawas → Pembina on its detail page.
  const isKetua = getPrimaryRoleCode(authUser) === "YAYASAN_KETUA";

  const approvedCount =
    plans?.filter(
      (p) => p.status === "APPROVED" || p.status === "IN_PROGRESS"
    ).length || 0;
  const avgProgress = plans?.length
    ? Math.round(plans.reduce((s, p) => s + p.progress, 0) / plans.length)
    : 0;
  // budget is serialized as a string (Prisma Decimal); coerce so the reduce
  // sums numerically instead of concatenating strings.
  const totalBudget = plans?.reduce((s, p) => s + Number(p.budget || 0), 0) || 0;

  const handleEdit = (plan: any) => {
    setEditItem(plan);
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

  const handleDelete = async () => {
    if (deleteId) {
      await deletePlan.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const hasFilters = filterType || filterStatus;

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Perencanaan Strategis"
          description="Kelola RPJP, Renstra, dan RKA yayasan."
        />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate} className="gap-1">
              <Plus className="h-4 w-4" />
              Tambah Rencana
            </Button>
          </DialogTrigger>
          <PlanFormDialog editData={editItem} onClose={handleDialogClose} />
        </Dialog>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription>Total Rencana</CardDescription>
            <CardTitle className="text-3xl">
              {isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                plans?.length || 0
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription>Disetujui / Berjalan</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {isLoading ? <Skeleton className="h-9 w-12" /> : approvedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2">
            <CardDescription>Rata-rata Progress</CardDescription>
            <CardTitle className="text-3xl text-indigo-600">
              {isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                `${avgProgress}%`
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardDescription>Total Anggaran</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                `Rp ${(totalBudget / 1_000_000).toFixed(0)} jt`
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={filterType || "ALL"}
          onValueChange={(v) => setFilterType(v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Semua Jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Jenis</SelectItem>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterStatus || "ALL"}
          onValueChange={(v) => setFilterStatus(v === "ALL" ? undefined : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Status</SelectItem>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterType(undefined);
              setFilterStatus(undefined);
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {/* Plans List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Daftar Rencana</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : plans?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-2">Belum ada rencana.</p>
              <p className="text-sm">
                Klik &quot;Tambah Rencana&quot; untuk membuat rencana baru.
              </p>
            </CardContent>
          </Card>
        ) : (
          plans?.map((plan) => (
            <Card
              key={plan.id}
              className="hover:shadow-md transition-shadow group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{plan.title}</CardTitle>
                    <CardDescription>
                      {planTierLabel(plan)} • {plan.createdBy?.name}
                    </CardDescription>
                    {plan.parent && (
                      <p className="text-xs text-muted-foreground">
                        Menginduk pada{" "}
                        <span className="font-medium text-foreground">
                          {plan.parent.title}
                        </span>
                      </p>
                    )}
                    {plan.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {plan.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor[plan.status]}>
                      {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
                    </Badge>
                    {plan.reviewStage && plan.reviewStage !== "DITETAPKAN" && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-700 dark:text-amber-300"
                      >
                        {PLAN_REVIEW_STAGE_LABEL[plan.reviewStage]}
                      </Badge>
                    )}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      {plan.status === "DRAFT" && plan.unitId && isKetua && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600"
                          onClick={() => approvePlan.mutate(plan.id)}
                          title="Sahkan RKA unit"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleEdit(plan)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteId(plan.id)}
                        title="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-medium">{plan.progress}%</span>
                  </div>
                  <Progress value={plan.progress} className="h-2" />
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>{plan.objectives?.length || 0} sasaran</span>
                    {plan.budget && (
                      <span>
                        Anggaran: Rp{" "}
                        {Number(plan.budget).toLocaleString("id-ID")}
                      </span>
                    )}
                    <span>
                      {new Date(plan.startDate).toLocaleDateString("id-ID")} -{" "}
                      {new Date(plan.endDate).toLocaleDateString("id-ID")}
                    </span>
                  </div>
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
        title="Hapus Rencana?"
        description="Rencana beserta seluruh sasaran, indikator, dan kegiatan akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deletePlan.isPending}
      />
    </div>
  );
}

export default function PerencanaanPageWithShell() {
  return (
    <MainLayout>
      <PerencanaanPageContent />
    </MainLayout>
  );
}
