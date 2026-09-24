"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MainLayout } from "@/components/layout";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useAudits,
  useCreateAudit,
  useUpdateAudit,
  useDeleteAudit,
  useCreateFinding,
  useWbsReports,
  useUpdateWbsStatus,
  useForwardWbsReport,
  useAddWbsHandlerComment,
  useBoardSuspensions,
  useSuspendableCandidates,
  usePlhCandidates,
  useCreateBoardSuspension,
  useLiftBoardSuspension,
  useFinancialArrears,
  useDraftPeriodicReportToEOffice,
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
  FormDescription,
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
import { Label } from "@/components/ui/label";
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
  Send,
  Lock,
  ArrowRight,
  UserX,
  FileText,
  DollarSign,
  Users,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { safeFormat } from "@/lib/date";
import { id as localeId } from "date-fns/locale";
import {
  PLH_ROLE_CODES,
  createBoardSuspensionSchema,
  draftPeriodicReportSchema,
  isClosedWbsStatus,
  isFoundationWideRoleCode,
  pengawasanAccessOf,
} from "@cipansor/shared";
import type {
  WbsForwardRoleCode,
  WbsStatusCode,
  WbsReportDto,
  WbsCommentDto,
  WbsForwardLogDto,
  BoardSuspensionDto,
  FinancialArrearsDto,
  InternalAuditDto,
  AuditFindingDto,
} from "@cipansor/shared";
import { useAuthStore } from "@/stores/auth";
import { getPrimaryRoleCode } from "@/lib/rbac";
import {
  resolvePengawasanTab,
  visiblePengawasanTabs,
} from "@/lib/pengawasan-tabs";
import { useUnits } from "@/hooks/use-units";
import {
  boardSuspensionFormDefaults,
  plhSelectionPatch,
} from "@/lib/pengawasan-form";

// ─── Schemas ────────────────────────────────────────
const auditFormSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  auditType: z.string().min(1, "Tipe audit wajib"),
  plannedDate: z.string().min(1, "Tanggal wajib"),
  scope: z.string().optional(),
  methodology: z.string().optional(),
  // The unit the audit is filed against. Required at the edge for a
  // foundation-wide actor (the API rejects an absent target), but a unit-scoped
  // actor never sees or sends it — the API pins the record to their own unit
  // regardless. Blank is sent as `undefined`.
  unitId: z.string().optional(),
});

const findingFormSchema = z.object({
  findingNumber: z.string().min(1, "Nomor temuan wajib"),
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().min(5, "Deskripsi wajib"),
  severity: z.enum(["OBSERVATION", "MINOR", "MAJOR", "CRITICAL"]),
  category: z.string().min(1, "Kategori wajib"),
  recommendation: z.string().optional(),
});

// The suspension and periodic-report payloads come from `@cipansor/shared`, so
// the form and the API validate against one contract. Only the schemas unique
// to this page are declared here.
const boardSuspensionSchema = createBoardSuspensionSchema;
const periodicReportSchema = draftPeriodicReportSchema;

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

const wbsStatusBadges: Record<string, { label: string; color: string }> = {
  DIAJUKAN: {
    label: "Diajukan",
    color: "bg-blue-100 text-blue-800 border-blue-300",
  },
  DALAM_PENYELIDIKAN: {
    label: "Dalam Penyelidikan",
    color: "bg-purple-100 text-purple-800 border-purple-300",
  },
  DITINDAKLANJUTI: {
    label: "Ditindaklanjuti",
    color: "bg-amber-100 text-amber-800 border-amber-300",
  },
  SELESAI: {
    label: "Selesai",
    color: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  TIDAK_DAPAT_DITINDAKLANJUTI: {
    label: "Tidak Dapat Ditindaklanjuti",
    color: "bg-slate-200 text-slate-800 border-slate-300",
  },
};

// ─── Audit Dialogs ────────────────────────────
function AuditFormDialog({
  editData,
  onClose,
  allowUnitChoice,
}: {
  editData?: InternalAuditDto | null;
  onClose: () => void;
  /**
   * A foundation-wide actor filing an audit must name the unit it covers, and
   * the API rejects an absent target. A unit-scoped actor has no choice — the
   * API pins the record to their own unit — so the picker is hidden rather than
   * shown and ignored.
   */
  allowUnitChoice: boolean;
}) {
  const createAudit = useCreateAudit();
  const updateAudit = useUpdateAudit();
  const { data: units } = useUnits({ limit: 100 });
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
      unitId: editData?.unitId || "",
    },
  });

  const onSubmit = async (values: AuditFormValues) => {
    const payload = {
      ...values,
      plannedDate: new Date(values.plannedDate).toISOString(),
      // Blank must not travel as `""`: the API treats an empty string as an
      // invalid UUID for a foundation-wide actor and as a stray field for a
      // unit-scoped one.
      unitId: values.unitId || undefined,
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
                  <Input placeholder="cth: Audit Keuangan Q1 2026" {...field} />
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
          {allowUnitChoice && (
            <FormField
              control={form.control}
              name="unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Pelaksana</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih unit" />
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
                  <FormDescription>
                    Audit disimpan atas unit ini; wajib untuk peran tingkat
                    yayasan.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
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
        <DialogTitle>Tambah Temuan Audit</DialogTitle>
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
                  <FormLabel>Tingkat Severity</FormLabel>
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

// ─── Main Component ──────────────────────────────────
function PengawasanPageContent() {
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<InternalAuditDto | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [findingAuditId, setFindingAuditId] = useState<string | null>(null);

  // WBS States
  const [selectedWbs, setSelectedWbs] = useState<WbsReportDto | null>(null);
  const [forwardRole, setForwardRole] =
    useState<WbsForwardRoleCode>("YAYASAN_KETUA");
  const [forwardReason, setForwardReason] = useState<string>("");
  const [forwardDialogOpen, setForwardRoleDialogOpen] =
    useState<boolean>(false);
  const [handlerComment, setHandlerComment] = useState<string>("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  // Closing a case is a one-way door: the API refuses any later write, so the
  // resolution has to be captured *with* the closure. The status Select alone
  // sent only `{ status }`, which the API now rejects for a terminal status —
  // the dialog below collects the required resolution (and an optional note)
  // before the close is submitted.
  const [statusDialogOpen, setStatusDialogOpen] = useState<boolean>(false);
  const [statusTarget, setStatusTarget] = useState<WbsReportDto | null>(null);
  const [statusValue, setStatusValue] = useState<WbsStatusCode>("DIAJUKAN");
  const [resolutionText, setResolutionText] = useState<string>("");
  const [statusNote, setStatusNote] = useState<string>("");

  // Board Suspension States
  const [suspensionDialogOpen, setSuspensionDialogOpen] =
    useState<boolean>(false);
  const [liftReason, setLiftReason] = useState<string>("");
  const [selectedLiftId, setSelectedLiftId] = useState<string | null>(null);

  // Periodic Report States
  const [periodicDialogOpen, setPeriodicDialogOpen] = useState<boolean>(false);

  // Which governance controls this account may actually use. The API gates
  // each action on its own role list; rendering them all to everyone meant a
  // Pengawas saw "Tetapkan SK" and "Pulihkan Status" buttons that answered 403.
  const authUser = useAuthStore((s) => s.user);
  const access = pengawasanAccessOf(getPrimaryRoleCode(authUser));

  // Hooks
  const { data: audits, isLoading: isAuditsLoading } = useAudits(
    filterStatus ? { status: filterStatus } : undefined,
  );
  const deleteAudit = useDeleteAudit();

  // Each register request is gated on the same permission that renders its
  // tab. A role with audit access only never fires these, so it sees no 403
  // toast for a panel it was never shown.
  const { data: wbsReports, isLoading: isWbsLoading } = useWbsReports(
    access.canHandleWbs,
  );
  const updateWbsStatusMutation = useUpdateWbsStatus();
  const forwardWbsMutation = useForwardWbsReport();

  const { data: boardSuspensions, isLoading: isSuspensionsLoading } =
    useBoardSuspensions(access.canReadSuspensions);
  const createSuspensionMutation = useCreateBoardSuspension();
  const liftSuspensionMutation = useLiftBoardSuspension();
  const handlerCommentMutation = useAddWbsHandlerComment();

  const { data: arrearsData, isLoading: isArrearsLoading } =
    useFinancialArrears(undefined, access.canViewArrears);
  const draftPeriodicReportMutation = useDraftPeriodicReportToEOffice();

  // Forms
  // The suspension schema preprocesses `""` to `undefined`, so its input and
  // output types differ. React Hook Form validates the *input* and hands the
  // handler the *output*, so both generics are spelled out.
  const suspensionForm = useForm<
    z.input<typeof boardSuspensionSchema>,
    unknown,
    z.output<typeof boardSuspensionSchema>
  >({
    resolver: zodResolver(boardSuspensionSchema),
    // Both Plh fields blank: the pair is all-or-nothing, so a suspension with
    // no Plh/Plt must submit without the operator clearing anything.
    defaultValues: boardSuspensionFormDefaults(),
  });

  const periodicForm = useForm<z.infer<typeof periodicReportSchema>>({
    resolver: zodResolver(periodicReportSchema),
    defaultValues: {
      title: "Laporan Hasil Pengawasan Periodik 2026",
      period: "2026-Q1",
      executiveSummary: "",
      findingsSummary: "",
      recommendations: "",
    },
  });

  // The suspension form selects people, not raw UUIDs. Both lists are scoped
  // by the API: `candidates` is Pengurus with no ACTIVE suspension, and
  // `plhCandidates` excludes the officer being suspended.
  const suspendableUserId =
    useWatch({ control: suspensionForm.control, name: "userId" }) || undefined;
  const plhUserId =
    useWatch({ control: suspensionForm.control, name: "plhUserId" }) ||
    undefined;
  const { data: suspendableCandidates } =
    useSuspendableCandidates(suspensionDialogOpen);
  const { data: plhCandidates } = usePlhCandidates(
    suspendableUserId,
    suspensionDialogOpen,
  );

  const handleEdit = (audit: InternalAuditDto) => {
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

  const handleCreateSuspensionSubmit = async (
    values: z.output<typeof boardSuspensionSchema>,
  ) => {
    await createSuspensionMutation.mutateAsync(values);
    setSuspensionDialogOpen(false);
    suspensionForm.reset();
  };

  const handleLiftSuspension = async () => {
    if (!selectedLiftId || !liftReason) return;
    await liftSuspensionMutation.mutateAsync({
      id: selectedLiftId,
      liftReason,
    });
    setSelectedLiftId(null);
    setLiftReason("");
  };

  const handleForwardWbsSubmit = async () => {
    if (!selectedWbs || !forwardReason) return;
    await forwardWbsMutation.mutateAsync({
      id: selectedWbs.id,
      toRole: forwardRole,
      reason: forwardReason,
    });
    setForwardRoleDialogOpen(false);
    setForwardReason("");
    setSelectedWbs(null);
  };

  const handleSendHandlerComment = async (reportId: string) => {
    const message = handlerComment.trim();
    if (!message) return;
    await handlerCommentMutation.mutateAsync({ id: reportId, message });
    setHandlerComment("");
    setReplyTargetId(null);
  };

  /**
   * Open the status dialog pre-filled with the report's current status.
   *
   * A transition into a terminal status requires a resolution, so it is
   * collected here rather than sent straight from the Select.
   */
  const openStatusDialog = (report: WbsReportDto) => {
    setStatusTarget(report);
    setStatusValue(report.status as WbsStatusCode);
    setResolutionText(report.resolution ?? "");
    setStatusNote("");
    setStatusDialogOpen(true);
  };

  const handleStatusSubmit = async () => {
    if (!statusTarget) return;
    const closing = isClosedWbsStatus(statusValue);
    if (closing && !resolutionText.trim()) return;
    await updateWbsStatusMutation.mutateAsync({
      id: statusTarget.id,
      status: statusValue,
      ...(resolutionText.trim() ? { resolution: resolutionText.trim() } : {}),
      ...(statusNote.trim() ? { handlerNote: statusNote.trim() } : {}),
    });
    setStatusDialogOpen(false);
    setStatusTarget(null);
    setResolutionText("");
    setStatusNote("");
  };

  const handlePeriodicReportSubmit = async (
    values: z.infer<typeof periodicReportSchema>,
  ) => {
    await draftPeriodicReportMutation.mutateAsync(values);
    setPeriodicDialogOpen(false);
    periodicForm.reset();
  };

  // Land on the first tab the role may actually use. `Tabs` is controlled —
  // `defaultValue` is read once at mount, and `authUser` arrives asynchronously
  // (the persisted blob, then `/auth/me`), so an uncontrolled `defaultValue`
  // computed while the user is still null latched onto `eoffice`, a panel a
  // non-reporting role never renders: a blank page with no way back.
  const visibleTabs = React.useMemo(
    () => visiblePengawasanTabs(getPrimaryRoleCode(authUser)),
    [authUser],
  );

  const [activeTab, setActiveTab] = useState<string>("");

  // Keep the selection on a visible tab: the first one until the user picks,
  // and whenever access shrinks (a role switch, or the user object loading in)
  // so the panel can never point at a tab that is no longer rendered.
  React.useEffect(() => {
    setActiveTab((previous) => resolvePengawasanTab(visibleTabs, previous));
  }, [visibleTabs]);

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="Pengawasan Internal & Governance Yayasan"
          description="Fungsi Audit Internal, Whistleblowing System (WBS), Pembekuan Pengurus & Plh/Plt, serta Laporan Pengawasan via E-Office."
        />
        <div className="flex gap-2 flex-wrap">
          {access.canSubmitPeriodicReport && (
            <Button
              onClick={() => setPeriodicDialogOpen(true)}
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50 gap-1"
            >
              <FileText className="h-4 w-4" />
              Laporan Pengawasan E-Office
            </Button>
          )}
          {access.canWriteAudits && (
            <Button
              onClick={handleCreate}
              className="gap-1 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Jadwalkan Audit
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        {/*
          Each tab is shown only to a role the API would answer. A tab whose
          endpoint returns 403 is a dead end the user only discovers after
          clicking it, so visibility follows the same `pengawasanAccessOf`
          resolution as the buttons and the route guards.
        */}
        <TabsList className="flex flex-wrap gap-2 h-auto p-1 bg-slate-100 rounded-lg">
          {access.canReadAudits && (
            <TabsTrigger
              value="audits"
              className="py-2.5 text-xs md:text-sm font-medium"
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" /> Audit & Temuan
            </TabsTrigger>
          )}
          {access.canHandleWbs && (
            <TabsTrigger
              value="wbs"
              className="py-2.5 text-xs md:text-sm font-medium"
            >
              <AlertTriangle className="h-4 w-4 mr-1.5" /> WBS & Pengaduan (
              {wbsReports?.length || 0})
            </TabsTrigger>
          )}
          {access.canReadSuspensions && (
            <TabsTrigger
              value="suspensions"
              className="py-2.5 text-xs md:text-sm font-medium"
            >
              <UserX className="h-4 w-4 mr-1.5" /> Pembekuan Pengurus
            </TabsTrigger>
          )}
          {access.canViewArrears && (
            <TabsTrigger
              value="arrears"
              className="py-2.5 text-xs md:text-sm font-medium"
            >
              <DollarSign className="h-4 w-4 mr-1.5" /> Tagihan Belum Dibayar
            </TabsTrigger>
          )}
          {access.canSubmitPeriodicReport && (
            <TabsTrigger
              value="eoffice"
              className="py-2.5 text-xs md:text-sm font-medium"
            >
              <Send className="h-4 w-4 mr-1.5" /> E-Office Report
            </TabsTrigger>
          )}
        </TabsList>

        {/* ================= TAB 1: AUDIT & TEMUAN ================= */}
        {access.canReadAudits && (
          <TabsContent value="audits" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardDescription>Total Audit</CardDescription>
                  <CardTitle className="text-3xl">
                    {isAuditsLoading ? (
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
                    {isAuditsLoading ? (
                      <Skeleton className="h-9 w-12" />
                    ) : (
                      audits?.filter((a) => a.status === "IN_PROGRESS")
                        .length || 0
                    )}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="pb-2">
                  <CardDescription>Total Temuan</CardDescription>
                  <CardTitle className="text-3xl">
                    {isAuditsLoading ? (
                      <Skeleton className="h-9 w-12" />
                    ) : (
                      audits?.reduce(
                        (sum: number, a) => sum + (a.findings?.length || 0),
                        0,
                      ) || 0
                    )}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardDescription>Temuan Kritikal / Major</CardDescription>
                  <CardTitle className="text-3xl text-red-600">
                    {isAuditsLoading ? (
                      <Skeleton className="h-9 w-12" />
                    ) : (
                      audits?.reduce(
                        (sum: number, a) =>
                          sum +
                          (a.findings?.filter(
                            (f: AuditFindingDto) =>
                              f.severity === "CRITICAL" ||
                              f.severity === "MAJOR",
                          ).length || 0),
                        0,
                      ) || 0
                    )}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Daftar Audit Internal
              </h2>
              {isAuditsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : audits?.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-lg mb-1">Belum ada audit internal.</p>
                  </CardContent>
                </Card>
              ) : (
                audits?.map((audit) => (
                  <Card
                    key={audit.id}
                    className="hover:shadow-md transition-shadow group"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {audit.title}
                          </CardTitle>
                          <CardDescription>
                            Tipe: {audit.auditType} • Auditor:{" "}
                            {audit.leadAuditor?.name} •{" "}
                            {safeFormat(
                              new Date(audit.plannedDate),
                              "dd MMMM yyyy",
                              { locale: localeId },
                            )}
                          </CardDescription>
                          {audit.scope && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Lingkup: {audit.scope}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColor[audit.status]}>
                            {audit.status}
                          </Badge>
                          {access.canWriteAudits && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => handleEdit(audit)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setDeleteId(audit.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          Temuan ({audit.findings?.length || 0})
                        </span>
                        {access.canWriteAudits && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7"
                            onClick={() => setFindingAuditId(audit.id)}
                          >
                            <Plus className="h-3 w-3" /> Tambah Temuan
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {audit.findings?.map((f) => (
                          <Badge
                            key={f.id}
                            variant="outline"
                            className={severityColor[f.severity]}
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {f.severity}: {f.title}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}

        {/* ================= TAB 2: WHISTLEBLOWING SYSTEM (WBS) ================= */}
        {access.canHandleWbs && (
          <TabsContent value="wbs" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Pengaduan & Whistleblowing System (WBS)
                </h2>
                <p className="text-xs text-slate-500">
                  Laporan aduan yang didistribusikan secara otomatis atau
                  diteruskan berdasarkan subjek teradu.
                </p>
              </div>
              <Link href="/public/wbs" target="_blank">
                <Button variant="outline" size="sm" className="gap-1">
                  Buka Portal WBS Publik
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>

            {isWbsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : wbsReports?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-lg mb-1">
                    Belum ada laporan WBS yang masuk.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {wbsReports?.map((report) => (
                  <Card
                    key={report.id}
                    className="border border-slate-200 hover:shadow-md transition-shadow"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-500">
                              {report.ticketCode}
                            </span>
                            <Badge
                              className={`px-2.5 py-0.5 border text-xs font-semibold ${wbsStatusBadges[report.status]?.color}`}
                            >
                              {wbsStatusBadges[report.status]?.label ||
                                report.status}
                            </Badge>
                          </div>
                          <CardTitle className="text-base font-bold text-slate-900 mt-1">
                            {report.subject}
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* A terminal case is immutable: the API refuses both
                              a status change and a forward once SELESAI /
                              TIDAK_DAPAT_DITINDAKLANJUTI (under its row lock).
                              Offering the controls the API will reject is a
                              dead end the user only discovers after clicking, so
                              they follow the same shared predicate as the reply
                              control and the API guards. */}
                          {access.canHandleWbs &&
                            !isClosedWbsStatus(report.status) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1"
                                  onClick={() => openStatusDialog(report)}
                                >
                                  Ubah Status
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1"
                                  onClick={() => {
                                    setSelectedWbs(report);
                                    // A unitless report cannot be routed to the
                                    // unit queue (the API refuses it). Keep the
                                    // form from opening on a destination that is
                                    // disabled for this report.
                                    if (
                                      !report.unitId &&
                                      forwardRole === "UNIT_ADMIN"
                                    ) {
                                      setForwardRole("YAYASAN_KETUA");
                                    }
                                    setForwardRoleDialogOpen(true);
                                  }}
                                >
                                  Teruskan
                                </Button>
                              </>
                            )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border">
                        <div>
                          <span className="text-slate-400 block">
                            Kategori:
                          </span>{" "}
                          <strong className="text-slate-800">
                            {report.category}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Teradu:</span>{" "}
                          <strong className="text-slate-800">
                            {report.targetLevel}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Unit:</span>{" "}
                          <strong className="text-slate-800">
                            {report.unit?.name || "Yayasan Pusat"}
                          </strong>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 whitespace-pre-line bg-white p-3 rounded border">
                        {report.description}
                      </p>

                      {/* Conversation thread. `senderType: HANDLER` is what the
                        public tracking page anonymizes as "Tim Pemeriksa"; a
                        reporter's own message is never shown with handler
                        identity. */}
                      {report.comments && report.comments.length > 0 && (
                        <div className="space-y-1 border-t pt-2">
                          <span className="text-[11px] font-semibold text-slate-500 uppercase">
                            Percakapan:
                          </span>
                          {report.comments.map((c: WbsCommentDto) => (
                            <div
                              key={c.id}
                              className={`text-xs p-2 rounded border ${
                                c.senderType === "HANDLER"
                                  ? "bg-blue-50/60 border-blue-200"
                                  : "bg-slate-50 border-slate-200"
                              }`}
                            >
                              <span className="font-semibold text-slate-700">
                                {c.senderType === "HANDLER"
                                  ? c.senderName || "Tim Pemeriksa"
                                  : "Pelapor"}
                              </span>
                              <p className="text-slate-800 whitespace-pre-line">
                                {c.message}
                              </p>
                              {(c.attachments?.length ?? 0) > 0 && (
                                <ul className="mt-1 space-y-1">
                                  {c.attachments!.map((url, index) => (
                                    <li key={`${c.id}-att-${index}`}>
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline break-all"
                                      >
                                        Lampiran {index + 1}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Handler reply. A terminal case is immutable for both
                          sides of the thread, so the reply control is hidden
                          for the same statuses the API refuses under its row
                          lock — keeping the two in lockstep via the shared
                          predicate. */}
                      {access.canHandleWbs &&
                        !isClosedWbsStatus(report.status) &&
                        (replyTargetId === report.id ? (
                          <div className="space-y-2 border-t pt-2">
                            <Textarea
                              rows={2}
                              value={handlerComment}
                              onChange={(e) =>
                                setHandlerComment(e.target.value)
                              }
                              placeholder="Tulis tanggapan untuk pelapor..."
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setReplyTargetId(null);
                                  setHandlerComment("");
                                }}
                              >
                                Batal
                              </Button>
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={
                                  !handlerComment.trim() ||
                                  handlerCommentMutation.isPending
                                }
                                onClick={() =>
                                  handleSendHandlerComment(report.id)
                                }
                              >
                                {handlerCommentMutation.isPending
                                  ? "Mengirim…"
                                  : "Kirim Tanggapan"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1"
                            onClick={() => {
                              setReplyTargetId(report.id);
                              setHandlerComment("");
                            }}
                          >
                            Tanggapi Pelapor
                          </Button>
                        ))}

                      {/* Forward Logs */}
                      {report.forwardLogs && report.forwardLogs.length > 0 && (
                        <div className="space-y-1 border-t pt-2">
                          <span className="text-[11px] font-semibold text-slate-500 uppercase">
                            Riwayat Diteruskan:
                          </span>
                          {report.forwardLogs.map((log: WbsForwardLogDto) => (
                            <div
                              key={log.id}
                              className="text-xs p-2 bg-amber-50/50 rounded border border-amber-200"
                            >
                              Laporan diteruskan dari{" "}
                              <strong>{log.fromRole}</strong> ke{" "}
                              <strong>{log.toRole}</strong> — Alasan:{" "}
                              <em>{log.reason}</em>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ================= TAB 3: PEMBEKUAN PENGURUS & PLH/PLT ================= */}
        {access.canReadSuspensions && (
          <TabsContent value="suspensions" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Pemberhentian Sementara Pengurus (Board Suspension)
                </h2>
                <p className="text-xs text-slate-500">
                  Mekanisme penetapan pembekuan sementara akun Pengurus yang
                  terindikasi pelanggaran serta penunjukan Plh/Plt.
                </p>
              </div>
              {access.canIssueSuspension && (
                <Button
                  onClick={() => setSuspensionDialogOpen(true)}
                  className="bg-red-600 hover:bg-red-700 text-white gap-1"
                >
                  <UserX className="h-4 w-4" />
                  Tetapkan SK Pembekuan Pengurus
                </Button>
              )}
            </div>

            {isSuspensionsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : boardSuspensions?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-emerald-500/60" />
                  <p className="text-lg mb-1">
                    Tidak Ada Pengurus yang Sedang Dibekukan.
                  </p>
                  <p className="text-xs">
                    Seluruh akun Pengurus Yayasan dalam keadaan aktif & normal.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {boardSuspensions?.map((susp: BoardSuspensionDto) => (
                  <Card
                    key={susp.id}
                    className={`border ${susp.status === "ACTIVE" ? "border-red-300 bg-red-50/10" : "border-slate-200"}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={
                                susp.status === "ACTIVE"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }
                            >
                              {susp.status === "ACTIVE"
                                ? "DIBEKUKAN / SUSPENDED"
                                : "PEMULIHAN STATUS (LIFTED)"}
                            </Badge>
                            <span className="font-mono text-xs text-slate-500">
                              No. SK: {susp.skNumber}
                            </span>
                          </div>
                          <CardTitle className="text-base font-bold text-slate-900 mt-1">
                            {susp.user?.name} ({susp.user?.email})
                          </CardTitle>
                        </div>
                        {susp.status === "ACTIVE" &&
                          access.canLiftSuspension && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => setSelectedLiftId(susp.id)}
                            >
                              Pulihkan Status Pengurus
                            </Button>
                          )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded border space-y-1">
                        <span className="font-semibold text-slate-700">
                          Pertimbangan Audit / Alasan Pembekuan:
                        </span>
                        <p className="text-slate-800 whitespace-pre-line">
                          {susp.auditReason}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                        <div>
                          Plh / Plt Pengganti Sementara:{" "}
                          <strong>{susp.plhUser?.name || "Tidak Ada"}</strong> (
                          {susp.plhRoleCode})
                        </div>
                        <div>
                          Ditetapkan Oleh:{" "}
                          <strong>{susp.suspendedBy?.name}</strong>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ================= TAB 4: TAGIHAN BELUM DIBAYAR ================= */}
        {access.canViewArrears && (
          <TabsContent value="arrears" className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Laporan Tagihan & Tunggakan Pembayaran (Arrears)
              </h2>
              <p className="text-xs text-slate-500">
                Visibilitas pengawasan atas risiko likuiditas dan tunggakan
                iuran/SPP per unit organisasi.
              </p>
            </div>

            {isArrearsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                      <CardDescription>Total Tunggakan Tagihan</CardDescription>
                      <CardTitle className="text-2xl font-bold text-amber-700">
                        Rp{" "}
                        {(
                          arrearsData?.summary?.totalUnpaidAmount || 0
                        ).toLocaleString("id-ID")}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                      <CardDescription>
                        Total Tagihan Belum Lunas
                      </CardDescription>
                      <CardTitle className="text-2xl font-bold text-slate-900">
                        {arrearsData?.summary?.totalUnpaidInvoicesCount || 0}{" "}
                        Tagihan
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="border-l-4 border-l-red-500">
                    <CardHeader className="pb-2">
                      <CardDescription>
                        Tagihan Jatuh Tempo (Overdue)
                      </CardDescription>
                      <CardTitle className="text-2xl font-bold text-red-600">
                        {arrearsData?.summary?.overdueInvoicesCount || 0}{" "}
                        Tagihan
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {/* Unit Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Rincian Tunggakan per Unit Organisasi
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {arrearsData?.unitBreakdown?.map((u) => (
                        <div
                          key={u.unitId}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded border text-sm"
                        >
                          <div>
                            <span className="font-bold text-slate-900">
                              {u.unitName}
                            </span>
                            <span className="text-xs text-slate-500 block">
                              {u.count} tagihan ({u.overdueCount} terlambat)
                            </span>
                          </div>
                          <span className="font-bold text-amber-700">
                            Rp {u.totalUnpaid.toLocaleString("id-ID")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top arrears pupils. The row is keyed to the invoice's unit of
                    record, while `nis` is the pupil's current NIS — so the two
                    units are shown side by side and the NIS column is labelled
                    "NIS saat ini" to keep a transferred pupil's old arrears from
                    reading as if their current NIS belonged to the old unit. */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Tunggakan Terbesar per Santri
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative w-full overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-slate-500">
                            <th className="py-2 pr-4 font-medium">Nama</th>
                            <th className="py-2 pr-4 font-medium">
                              NIS saat ini
                            </th>
                            <th className="py-2 pr-4 font-medium">
                              Unit Penagihan
                            </th>
                            <th className="py-2 pr-4 font-medium">
                              Unit Saat Ini
                            </th>
                            <th className="py-2 pr-4 font-medium text-right">
                              Total Tunggakan
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {arrearsData?.topArrearsStudents?.map((s) => (
                            <tr
                              key={`${s.studentId}-${s.unitId}`}
                              className="border-b last:border-0"
                            >
                              <td className="py-2 pr-4 font-medium text-slate-900">
                                {s.studentName}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {s.nis}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {s.unitName}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {s.currentUnitName ?? "-"}
                              </td>
                              <td className="py-2 pr-4 text-right font-bold text-amber-700">
                                Rp {s.totalUnpaid.toLocaleString("id-ID")}
                              </td>
                            </tr>
                          ))}
                          {(arrearsData?.topArrearsStudents?.length ?? 0) ===
                            0 && (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-4 text-center text-slate-500"
                              >
                                Tidak ada tunggakan.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        )}

        {/* ================= TAB 5: E-OFFICE PERIODIC REPORT ================= */}
        {access.canSubmitPeriodicReport && (
          <TabsContent value="eoffice" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Konsep Laporan Pengawasan Periodik di E-Office
                </CardTitle>
                <CardDescription>
                  Susun Laporan Pengawasan untuk didaftarkan sebagai konsep
                  (draft) Surat Keluar E-Office. Laporan belum terkirim: buka
                  konsepnya di E-Office dan jalankan alur pengajuan/verifikasi
                  untuk mengirimkannya kepada Ketua Pembina Yayasan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() => setPeriodicDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  <Send className="h-4 w-4" />
                  Buat Konsep Laporan Pengawasan di E-Office
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AuditFormDialog
          editData={editItem}
          onClose={handleDialogClose}
          allowUnitChoice={isFoundationWideRoleCode(
            getPrimaryRoleCode(authUser),
          )}
        />
      </Dialog>

      <Dialog
        open={!!findingAuditId}
        onOpenChange={(open) => !open && setFindingAuditId(null)}
      >
        {findingAuditId && (
          <AddFindingDialog
            auditId={findingAuditId}
            onClose={() => setFindingAuditId(null)}
          />
        )}
      </Dialog>

      {/* WBS Status Dialog — a terminal status is a one-way door, so the
          required resolution is collected here before the close is sent. */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Ubah Status Laporan WBS</DialogTitle>
            <DialogDescription>
              {statusTarget?.ticketCode} — pilih status baru. Menutup laporan
              (Selesai / Tidak Dapat Ditindaklanjuti) mewajibkan penyelesaian
              karena laporan yang ditutup tidak dapat diubah lagi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Status Baru</Label>
              <Select
                value={statusValue}
                onValueChange={(v) => setStatusValue(v as WbsStatusCode)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIAJUKAN">Diajukan</SelectItem>
                  <SelectItem value="DALAM_PENYELIDIKAN">
                    Dalam Penyelidikan
                  </SelectItem>
                  <SelectItem value="DITINDAKLANJUTI">
                    Ditindaklanjuti
                  </SelectItem>
                  <SelectItem value="SELESAI">Selesai</SelectItem>
                  <SelectItem value="TIDAK_DAPAT_DITINDAKLANJUTI">
                    Tidak Dapat Ditindaklanjuti
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                Penyelesaian (resolution){" "}
                {isClosedWbsStatus(statusValue) ? "*" : ""}
              </Label>
              <Textarea
                rows={3}
                placeholder="Tuliskan hasil penyelesaian atau alasan tidak dapat ditindaklanjuti..."
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
              />
              {isClosedWbsStatus(statusValue) && !resolutionText.trim() && (
                <p className="text-xs text-red-600 mt-1">
                  Penyelesaian wajib diisi untuk menutup laporan.
                </p>
              )}
            </div>
            <div>
              <Label>Catatan Pemeriksa (opsional)</Label>
              <Textarea
                rows={2}
                placeholder="Catatan internal untuk riwayat penanganan..."
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setStatusDialogOpen(false)}
              >
                Batal
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={
                  updateWbsStatusMutation.isPending ||
                  (isClosedWbsStatus(statusValue) && !resolutionText.trim())
                }
                onClick={handleStatusSubmit}
              >
                {updateWbsStatusMutation.isPending
                  ? "Menyimpan…"
                  : "Simpan Status"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forward WBS Dialog */}
      <Dialog open={forwardDialogOpen} onOpenChange={setForwardRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teruskan Laporan WBS</DialogTitle>
            <DialogDescription>
              Pilih peran penerima baru beserta alasan penerusan laporan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Role Penerima Utama Baru</Label>
              <Select
                value={forwardRole}
                onValueChange={(v) => setForwardRole(v as WbsForwardRoleCode)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YAYASAN_PEMBINA">
                    Pembina Yayasan
                  </SelectItem>
                  <SelectItem value="YAYASAN_PENGAWAS">
                    Pengawas Yayasan
                  </SelectItem>
                  <SelectItem value="YAYASAN_KETUA">
                    Pengurus Yayasan (Ketua)
                  </SelectItem>
                  {/* A unit-level destination is only readable by a unit
                      handler when the report carries a unit; the API refuses
                      it otherwise, so the option is disabled rather than
                      offered and then rejected. */}
                  <SelectItem
                    value="UNIT_ADMIN"
                    disabled={!selectedWbs?.unitId}
                  >
                    Kepala Unit Organisasi
                    {!selectedWbs?.unitId ? " (laporan tanpa unit)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alasan Penerusan Laporan *</Label>
              <Textarea
                rows={3}
                placeholder="Tuliskan pertimbangan atau alasan penerusan laporan..."
                value={forwardReason}
                onChange={(e) => setForwardReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setForwardRoleDialogOpen(false)}
              >
                Batal
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleForwardWbsSubmit}
              >
                Teruskan Laporan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Board Suspension Dialog */}
      <Dialog
        open={suspensionDialogOpen}
        onOpenChange={setSuspensionDialogOpen}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <UserX className="h-5 w-5" />
              Penetapan SK Pembekuan Pengurus & Plh/Plt
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan menonaktifkan akun Pengurus, mengunci sementara
              hak akses E-Sign (pemulihan status akan mengembalikannya), dan
              menetapkan Plh/Plt sementara.
            </DialogDescription>
          </DialogHeader>
          <Form {...suspensionForm}>
            <form
              onSubmit={suspensionForm.handleSubmit(
                handleCreateSuspensionSubmit,
              )}
              className="space-y-4"
            >
              <FormField
                control={suspensionForm.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pengurus yang Dibekukan *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Pengurus..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suspendableCandidates?.length ? (
                          suspendableCandidates.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} — {c.email}
                              {c.roleCodes.length
                                ? ` (${c.roleCodes.join(", ")})`
                                : ""}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__none__" disabled>
                            Tidak ada Pengurus yang dapat dibekukan
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={suspensionForm.control}
                name="skNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nomor SK Pembekuan *</FormLabel>
                    <FormControl>
                      <Input placeholder="SK/PENGAWAS/2026/001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={suspensionForm.control}
                name="auditReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alasan Audit / Indikasi Pelanggaran *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Jelaskan pertimbangan audit..."
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
                  control={suspensionForm.control}
                  name="plhUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plh/Plt Pengganti (opsional)</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : "__none__"}
                        onValueChange={(v) => {
                          const patch = plhSelectionPatch(
                            v === "__none__" ? "" : v,
                          );
                          field.onChange(patch.plhUserId);
                          if (patch.plhRoleCode !== undefined) {
                            suspensionForm.setValue(
                              "plhRoleCode",
                              patch.plhRoleCode,
                            );
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Plh/Plt..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">
                            — Tidak menunjuk Plh/Plt —
                          </SelectItem>
                          {plhCandidates
                            ?.filter((c) => c.plhEligible)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name} — {c.email}
                                {c.roleCodes.length
                                  ? ` (${c.roleCodes.join(", ")})`
                                  : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={suspensionForm.control}
                  name="plhRoleCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Peran / Role Plh</FormLabel>
                      <Select
                        value={
                          field.value == null ? "__none__" : String(field.value)
                        }
                        onValueChange={(v) =>
                          field.onChange(v === "__none__" ? "" : v)
                        }
                        disabled={!plhUserId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih peran Plh" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">
                            — Tidak ada peran —
                          </SelectItem>
                          {PLH_ROLE_CODES.map((code) => (
                            <SelectItem key={code} value={code}>
                              {code.replace("YAYASAN_", "Yayasan ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSuspensionDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Tetapkan SK Pembekuan
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Lift Suspension Dialog */}
      <Dialog
        open={!!selectedLiftId}
        onOpenChange={() => setSelectedLiftId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pemulihan Status Pengurus</DialogTitle>
            <DialogDescription>
              Masukkan alasan pemulihan status / pencabutan pembekuan pengurus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Alasan Pemulihan Status *</Label>
              <Textarea
                rows={3}
                placeholder="Masukkan pertimbangan pemulihan status..."
                value={liftReason}
                onChange={(e) => setLiftReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedLiftId(null)}>
                Batal
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleLiftSuspension}
              >
                Pulihkan Status Akun
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Periodic Report Dialog */}
      <Dialog open={periodicDialogOpen} onOpenChange={setPeriodicDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              Konsep Laporan Pengawasan Periodik di E-Office
            </DialogTitle>
            <DialogDescription>
              Isi ringkasan laporan pengawasan. Laporan akan terdaftar sebagai
              konsep (draft) Surat Keluar di E-Office dan belum dikirim;
              jalankan alur pengajuan/verifikasi E-Office untuk mengirimkannya
              kepada Pembina.
            </DialogDescription>
          </DialogHeader>
          <Form {...periodicForm}>
            <form
              onSubmit={periodicForm.handleSubmit(handlePeriodicReportSubmit)}
              className="space-y-4"
            >
              <FormField
                control={periodicForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Judul Laporan *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={periodicForm.control}
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Periode *</FormLabel>
                    <FormControl>
                      <Input placeholder="2026-Q1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={periodicForm.control}
                name="executiveSummary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ringkasan Eksekutif *</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Tuliskan poin utama hasil pengawasan..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={periodicForm.control}
                name="recommendations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rekomendasi Pengawas</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        placeholder="Rekomendasi tindak lanjut bagi Pengurus..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPeriodicDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Simpan sebagai Konsep di E-Office
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Audit Confirmation */}
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
