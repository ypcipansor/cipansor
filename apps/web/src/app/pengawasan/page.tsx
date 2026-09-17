"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MainLayout } from "@/components/layout";
import { useForm } from "react-hook-form";
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
  useCreateBoardSuspension,
  useLiftBoardSuspension,
  useFinancialArrears,
  useSubmitPeriodicReportToEOffice,
} from "@/hooks/use-pengawasan";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, AlertTriangle, ShieldCheck, Filter, X, Send, Lock, ArrowRight, UserX, FileText, DollarSign, Users, RefreshCw, CheckCircle2 } from "lucide-react";
import { safeFormat } from "@/lib/date";
import { id as localeId } from "date-fns/locale";
import {
  PLH_ROLE_CODES,
  createBoardSuspensionSchema,
  submitPeriodicReportSchema,
  pengawasanAccessOf,
} from "@cipansor/shared";
import type { WbsForwardRoleCode, WbsStatusCode } from "@cipansor/shared";
import { useAuthStore } from "@/stores/auth";
import { getPrimaryRoleCode } from "@/lib/rbac";

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

// The suspension and periodic-report payloads come from `@cipansor/shared`, so
// the form and the API validate against one contract. Only the schemas unique
// to this page are declared here.
const boardSuspensionSchema = createBoardSuspensionSchema;
const periodicReportSchema = submitPeriodicReportSchema;

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

const auditTypes = ["Akademik", "Keuangan", "Operasional", "Kepatuhan", "Tata Kelola"];

const wbsStatusBadges: Record<string, { label: string; color: string }> = {
  DIAJUKAN: { label: "Diajukan", color: "bg-blue-100 text-blue-800 border-blue-300" },
  DALAM_PENYELIDIKAN: { label: "Dalam Penyelidikan", color: "bg-purple-100 text-purple-800 border-purple-300" },
  DITINDAKLANJUTI: { label: "Ditindaklanjuti", color: "bg-amber-100 text-amber-800 border-amber-300" },
  SELESAI: { label: "Selesai", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  TIDAK_DAPAT_DITINDAKLANJUTI: { label: "Tidak Dapat Ditindaklanjuti", color: "bg-slate-200 text-slate-800 border-slate-300" },
};

// ─── Audit Dialogs ────────────────────────────
function AuditFormDialog({ editData, onClose }: { editData?: any; onClose: () => void }) {
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
    const payload = { ...values, plannedDate: new Date(values.plannedDate).toISOString() };
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
        <DialogTitle>{isEdit ? "Edit Audit" : "Jadwalkan Audit Baru"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Perbarui jadwal audit internal." : "Isi data audit internal yang akan dijadwalkan."}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem>
              <FormLabel>Judul Audit</FormLabel>
              <FormControl><Input placeholder="cth: Audit Keuangan Q1 2026" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="auditType" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipe Audit</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {auditTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="plannedDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Tanggal Rencana</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="scope" render={({ field }) => (
            <FormItem>
              <FormLabel>Ruang Lingkup (Opsional)</FormLabel>
              <FormControl><Textarea placeholder="Ruang lingkup audit…" rows={2} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan…" : isEdit ? "Perbarui" : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

function AddFindingDialog({ auditId, onClose }: { auditId: string; onClose: () => void }) {
  const createFinding = useCreateFinding();
  const form = useForm<z.infer<typeof findingFormSchema>>({
    resolver: zodResolver(findingFormSchema),
    defaultValues: { findingNumber: "", title: "", description: "", severity: "MINOR", category: "", recommendation: "" },
  });

  const onSubmit = async (values: z.infer<typeof findingFormSchema>) => {
    await createFinding.mutateAsync({ auditId, ...values });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>Tambah Temuan Audit</DialogTitle>
        <DialogDescription>Catat temuan audit beserta tingkat keparahan.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="findingNumber" render={({ field }) => (
              <FormItem>
                <FormLabel>Nomor Temuan</FormLabel>
                <FormControl><Input placeholder="TM-001" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="severity" render={({ field }) => (
              <FormItem>
                <FormLabel>Tingkat Severity</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="OBSERVATION">Observasi</SelectItem>
                    <SelectItem value="MINOR">Minor</SelectItem>
                    <SelectItem value="MAJOR">Major</SelectItem>
                    <SelectItem value="CRITICAL">Kritikal</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem>
              <FormLabel>Judul Temuan</FormLabel>
              <FormControl><Input placeholder="cth: Pengelolaan kas tidak sesuai SOP" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>Kategori</FormLabel>
              <FormControl><Input placeholder="cth: Keuangan" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Deskripsi</FormLabel>
              <FormControl><Textarea placeholder="Deskripsi temuan…" rows={3} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
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
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [findingAuditId, setFindingAuditId] = useState<string | null>(null);

  // WBS States
  const [selectedWbs, setSelectedWbs] = useState<any>(null);
  const [forwardRole, setForwardRole] = useState<WbsForwardRoleCode>("YAYASAN_KETUA");
  const [forwardReason, setForwardReason] = useState<string>("");
  const [forwardDialogOpen, setForwardRoleDialogOpen] = useState<boolean>(false);
  const [handlerComment, setHandlerComment] = useState<string>("");

  // Board Suspension States
  const [suspensionDialogOpen, setSuspensionDialogOpen] = useState<boolean>(false);
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
    filterStatus ? { status: filterStatus } : undefined
  );
  const deleteAudit = useDeleteAudit();

  const { data: wbsReports, isLoading: isWbsLoading } = useWbsReports();
  const updateWbsStatusMutation = useUpdateWbsStatus();
  const forwardWbsMutation = useForwardWbsReport();

  const { data: boardSuspensions, isLoading: isSuspensionsLoading } = useBoardSuspensions();
  const createSuspensionMutation = useCreateBoardSuspension();
  const liftSuspensionMutation = useLiftBoardSuspension();

  const { data: arrearsData, isLoading: isArrearsLoading } = useFinancialArrears();
  const submitPeriodicReportMutation = useSubmitPeriodicReportToEOffice();

  // Forms
  // The suspension schema preprocesses `""` to `undefined`, so its input and
  // output types differ. React Hook Form validates the *input* and hands the
  // handler the *output*, so both generics are spelled out.
  const suspensionForm = useForm<
    z.input<typeof boardSuspensionSchema>,
    any,
    z.output<typeof boardSuspensionSchema>
  >({
    resolver: zodResolver(boardSuspensionSchema),
    defaultValues: { userId: "", skNumber: "", auditReason: "", documentUrl: "", plhUserId: "", plhRoleCode: "YAYASAN_KETUA" },
  });

  const periodicForm = useForm<z.infer<typeof periodicReportSchema>>({
    resolver: zodResolver(periodicReportSchema),
    defaultValues: { title: "Laporan Hasil Pengawasan Periodik 2026", period: "2026-Q1", executiveSummary: "", findingsSummary: "", recommendations: "" },
  });

  const handleEdit = (audit: any) => { setEditItem(audit); setDialogOpen(true); };
  const handleCreate = () => { setEditItem(null); setDialogOpen(true); };
  const handleDialogClose = () => { setDialogOpen(false); setEditItem(null); };

  const handleCreateSuspensionSubmit = async (values: z.output<typeof boardSuspensionSchema>) => {
    await createSuspensionMutation.mutateAsync(values);
    setSuspensionDialogOpen(false);
    suspensionForm.reset();
  };

  const handleLiftSuspension = async () => {
    if (!selectedLiftId || !liftReason) return;
    await liftSuspensionMutation.mutateAsync({ id: selectedLiftId, liftReason });
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

  const handlePeriodicReportSubmit = async (values: z.infer<typeof periodicReportSchema>) => {
    await submitPeriodicReportMutation.mutateAsync(values);
    setPeriodicDialogOpen(false);
    periodicForm.reset();
  };

  // Land on the first tab the role may actually use: `defaultValue` pointing at
  // a hidden `TabsContent` renders an empty panel.
  const defaultTab = access.canReadAudits
    ? "audits"
    : access.canHandleWbs
      ? "wbs"
      : access.canManageSuspensions
        ? "suspensions"
        : access.canViewArrears
          ? "arrears"
          : "eoffice";

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader
          title="Pengawasan Internal & Governance Yayasan"
          description="Fungsi Audit Internal, Whistleblowing System (WBS), Pembekuan Pengurus & Plh/Plt, serta Laporan Pengawasan via E-Office."
        />
        <div className="flex gap-2 flex-wrap">
          {access.canSubmitPeriodicReport && (
            <Button onClick={() => setPeriodicDialogOpen(true)} variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50 gap-1">
              <FileText className="h-4 w-4" />
              Laporan Pengawasan E-Office
            </Button>
          )}
          {access.canWriteAudits && (
            <Button onClick={handleCreate} className="gap-1 bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              Jadwalkan Audit
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        {/*
          Each tab is shown only to a role the API would answer. A tab whose
          endpoint returns 403 is a dead end the user only discovers after
          clicking it, so visibility follows the same `pengawasanAccessOf`
          resolution as the buttons and the route guards.
        */}
        <TabsList className="flex flex-wrap gap-2 h-auto p-1 bg-slate-100 rounded-lg">
          {access.canReadAudits && (
            <TabsTrigger value="audits" className="py-2.5 text-xs md:text-sm font-medium">
              <ShieldCheck className="h-4 w-4 mr-1.5" /> Audit & Temuan
            </TabsTrigger>
          )}
          {access.canHandleWbs && (
            <TabsTrigger value="wbs" className="py-2.5 text-xs md:text-sm font-medium">
              <AlertTriangle className="h-4 w-4 mr-1.5" /> WBS & Pengaduan ({wbsReports?.length || 0})
            </TabsTrigger>
          )}
          {access.canManageSuspensions && (
            <TabsTrigger value="suspensions" className="py-2.5 text-xs md:text-sm font-medium">
              <UserX className="h-4 w-4 mr-1.5" /> Pembekuan Pengurus
            </TabsTrigger>
          )}
          {access.canViewArrears && (
            <TabsTrigger value="arrears" className="py-2.5 text-xs md:text-sm font-medium">
              <DollarSign className="h-4 w-4 mr-1.5" /> Tagihan Belum Dibayar
            </TabsTrigger>
          )}
          {access.canSubmitPeriodicReport && (
            <TabsTrigger value="eoffice" className="py-2.5 text-xs md:text-sm font-medium">
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
                  {isAuditsLoading ? <Skeleton className="h-9 w-12" /> : audits?.length || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-l-4 border-l-yellow-500">
              <CardHeader className="pb-2">
                <CardDescription>Sedang Berjalan</CardDescription>
                <CardTitle className="text-3xl text-yellow-600">
                  {isAuditsLoading ? <Skeleton className="h-9 w-12" /> : audits?.filter((a: any) => a.status === "IN_PROGRESS").length || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="pb-2">
                <CardDescription>Total Temuan</CardDescription>
                <CardTitle className="text-3xl">
                  {isAuditsLoading ? <Skeleton className="h-9 w-12" /> : audits?.reduce((sum: number, a: any) => sum + (a.findings?.length || 0), 0) || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardDescription>Temuan Kritikal / Major</CardDescription>
                <CardTitle className="text-3xl text-red-600">
                  {isAuditsLoading ? <Skeleton className="h-9 w-12" /> : audits?.reduce((sum: number, a: any) => sum + (a.findings?.filter((f: any) => f.severity === "CRITICAL" || f.severity === "MAJOR").length || 0), 0) || 0}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Daftar Audit Internal</h2>
            {isAuditsLoading ? (
              <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
            ) : audits?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-lg mb-1">Belum ada audit internal.</p>
                </CardContent>
              </Card>
            ) : (
              audits?.map((audit: any) => (
                <Card key={audit.id} className="hover:shadow-md transition-shadow group">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{audit.title}</CardTitle>
                        <CardDescription>
                          Tipe: {audit.auditType} • Auditor: {audit.leadAuditor?.name} •{" "}
                          {safeFormat(new Date(audit.plannedDate), "dd MMMM yyyy", { locale: localeId })}
                        </CardDescription>
                        {audit.scope && <p className="text-xs text-muted-foreground mt-1">Lingkup: {audit.scope}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColor[audit.status]}>{audit.status}</Badge>
                        {access.canWriteAudits && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(audit)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(audit.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Temuan ({audit.findings?.length || 0})</span>
                      {access.canWriteAudits && (
                      <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => setFindingAuditId(audit.id)}>
                        <Plus className="h-3 w-3" /> Tambah Temuan
                      </Button>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {audit.findings?.map((f: any) => (
                        <Badge key={f.id} variant="outline" className={severityColor[f.severity]}>
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
              <h2 className="text-lg font-semibold text-slate-900">Pengaduan & Whistleblowing System (WBS)</h2>
              <p className="text-xs text-slate-500">Laporan aduan yang didistribusikan secara otomatis atau diteruskan berdasarkan subjek teradu.</p>
            </div>
            <Link href="/public/wbs" target="_blank">
              <Button variant="outline" size="sm" className="gap-1">
                Buka Portal WBS Publik
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {isWbsLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
          ) : wbsReports?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-lg mb-1">Belum ada laporan WBS yang masuk.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {wbsReports?.map((report: any) => (
                <Card key={report.id} className="border border-slate-200 hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">{report.ticketCode}</span>
                          <Badge className={`px-2.5 py-0.5 border text-xs font-semibold ${wbsStatusBadges[report.status]?.color}`}>
                            {wbsStatusBadges[report.status]?.label || report.status}
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 mt-1">{report.subject}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {access.canHandleWbs && (
                        <>
                        <Select
                          value={report.status}
                          onValueChange={(status) => updateWbsStatusMutation.mutate({ id: report.id, status: status as WbsStatusCode })}
                        >
                          <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Ubah Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DIAJUKAN">Diajukan</SelectItem>
                            <SelectItem value="DALAM_PENYELIDIKAN">Dalam Penyelidikan</SelectItem>
                            <SelectItem value="DITINDAKLANJUTI">Ditindaklanjuti</SelectItem>
                            <SelectItem value="SELESAI">Selesai</SelectItem>
                            <SelectItem value="TIDAK_DAPAT_DITINDAKLANJUTI">Tidak Dapat Ditindaklanjuti</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => { setSelectedWbs(report); setForwardRoleDialogOpen(true); }}
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
                      <div><span className="text-slate-400 block">Kategori:</span> <strong className="text-slate-800">{report.category}</strong></div>
                      <div><span className="text-slate-400 block">Teradu:</span> <strong className="text-slate-800">{report.targetLevel}</strong></div>
                      <div><span className="text-slate-400 block">Unit:</span> <strong className="text-slate-800">{report.unit?.name || 'Yayasan Pusat'}</strong></div>
                    </div>

                    <p className="text-xs text-slate-700 whitespace-pre-line bg-white p-3 rounded border">
                      {report.description}
                    </p>

                    {/* Forward Logs */}
                    {report.forwardLogs && report.forwardLogs.length > 0 && (
                      <div className="space-y-1 border-t pt-2">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase">Riwayat Diteruskan:</span>
                        {report.forwardLogs.map((log: any) => (
                          <div key={log.id} className="text-xs p-2 bg-amber-50/50 rounded border border-amber-200">
                            Laporan diteruskan dari <strong>{log.fromRole}</strong> ke <strong>{log.toRole}</strong> — Alasan: <em>{log.reason}</em>
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
        {access.canManageSuspensions && (
        <TabsContent value="suspensions" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pemberhentian Sementara Pengurus (Board Suspension)</h2>
              <p className="text-xs text-slate-500">Mekanisme penetapan pembekuan sementara akun Pengurus yang terindikasi pelanggaran serta penunjukan Plh/Plt.</p>
            </div>
            {access.canManageSuspensions && (
              <Button onClick={() => setSuspensionDialogOpen(true)} className="bg-red-600 hover:bg-red-700 text-white gap-1">
                <UserX className="h-4 w-4" />
                Tetapkan SK Pembekuan Pengurus
              </Button>
            )}
          </div>

          {isSuspensionsLoading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
          ) : boardSuspensions?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-emerald-500/60" />
                <p className="text-lg mb-1">Tidak Ada Pengurus yang Sedang Dibekukan.</p>
                <p className="text-xs">Seluruh akun Pengurus Yayasan dalam keadaan aktif & normal.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {boardSuspensions?.map((susp: any) => (
                <Card key={susp.id} className={`border ${susp.status === 'ACTIVE' ? 'border-red-300 bg-red-50/10' : 'border-slate-200'}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className={susp.status === 'ACTIVE' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}>
                            {susp.status === 'ACTIVE' ? 'DIBEKUKAN / SUSPENDED' : 'PEMULIHAN STATUS (LIFTED)'}
                          </Badge>
                          <span className="font-mono text-xs text-slate-500">No. SK: {susp.skNumber}</span>
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 mt-1">
                          {susp.user?.name} ({susp.user?.email})
                        </CardTitle>
                      </div>
                      {susp.status === 'ACTIVE' && access.canLiftSuspension && (
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
                      <span className="font-semibold text-slate-700">Pertimbangan Audit / Alasan Pembekuan:</span>
                      <p className="text-slate-800 whitespace-pre-line">{susp.auditReason}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                      <div>Plh / Plt Pengganti Sementara: <strong>{susp.plhUser?.name || 'Tidak Ada'}</strong> ({susp.plhRoleCode})</div>
                      <div>Ditetapkan Oleh: <strong>{susp.suspendedBy?.name}</strong></div>
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
            <h2 className="text-lg font-semibold text-slate-900">Laporan Tagihan & Tunggakan Pembayaran (Arrears)</h2>
            <p className="text-xs text-slate-500">Visibilitas pengawasan atas risiko likuiditas dan tunggakan iuran/SPP per unit organisasi.</p>
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
                      Rp {(arrearsData?.summary?.totalUnpaidAmount || 0).toLocaleString('id-ID')}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Total Tagihan Belum Lunas</CardDescription>
                    <CardTitle className="text-2xl font-bold text-slate-900">
                      {arrearsData?.summary?.totalUnpaidInvoicesCount || 0} Tagihan
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Tagihan Jatuh Tempo (Overdue)</CardDescription>
                    <CardTitle className="text-2xl font-bold text-red-600">
                      {arrearsData?.summary?.overdueInvoicesCount || 0} Tagihan
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Unit Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rincian Tunggakan per Unit Organisasi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {arrearsData?.unitBreakdown?.map((u: any) => (
                      <div key={u.unitId} className="flex items-center justify-between p-3 bg-slate-50 rounded border text-sm">
                        <div>
                          <span className="font-bold text-slate-900">{u.unitName}</span>
                          <span className="text-xs text-slate-500 block">{u.count} tagihan ({u.overdueCount} terlambat)</span>
                        </div>
                        <span className="font-bold text-amber-700">Rp {u.totalUnpaid.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
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
              <CardTitle className="text-base">Pengajuan Laporan Pengawasan Periodik via E-Office</CardTitle>
              <CardDescription>
                Pilih atau susun Laporan Pengawasan untuk diajukan secara resmi kepada Ketua Pembina Yayasan lewat modul Surat Keluar E-Office.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => setPeriodicDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Send className="h-4 w-4" />
                Buat & Ajukan Laporan Pengawasan ke E-Office
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AuditFormDialog editData={editItem} onClose={handleDialogClose} />
      </Dialog>

      <Dialog open={!!findingAuditId} onOpenChange={(open) => !open && setFindingAuditId(null)}>
        {findingAuditId && <AddFindingDialog auditId={findingAuditId} onClose={() => setFindingAuditId(null)} />}
      </Dialog>

      {/* Forward WBS Dialog */}
      <Dialog open={forwardDialogOpen} onOpenChange={setForwardRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teruskan Laporan WBS</DialogTitle>
            <DialogDescription>Pilih peran penerima baru beserta alasan penerusan laporan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Role Penerima Utama Baru</Label>
              <Select value={forwardRole} onValueChange={(v) => setForwardRole(v as WbsForwardRoleCode)}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YAYASAN_PEMBINA">Pembina Yayasan</SelectItem>
                  <SelectItem value="YAYASAN_PENGAWAS">Pengawas Yayasan</SelectItem>
                  <SelectItem value="YAYASAN_KETUA">Pengurus Yayasan (Ketua)</SelectItem>
                  <SelectItem value="UNIT_ADMIN">Kepala Unit Organisasi</SelectItem>
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
              <Button variant="outline" onClick={() => setForwardRoleDialogOpen(false)}>Batal</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleForwardWbsSubmit}>
                Teruskan Laporan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Board Suspension Dialog */}
      <Dialog open={suspensionDialogOpen} onOpenChange={setSuspensionDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <UserX className="h-5 w-5" />
              Penetapan SK Pembekuan Pengurus & Plh/Plt
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan menonaktifkan akun Pengurus, mencabut hak akses E-Sign, dan menetapkan Plh/Plt sementara.
            </DialogDescription>
          </DialogHeader>
          <Form {...suspensionForm}>
            <form onSubmit={suspensionForm.handleSubmit(handleCreateSuspensionSubmit)} className="space-y-4">
              <FormField control={suspensionForm.control} name="userId" render={({ field }) => (
                <FormItem>
                  <FormLabel>ID Pengurus yang Dibekukan *</FormLabel>
                  <FormControl><Input placeholder="Masukkan ID Pengurus..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={suspensionForm.control} name="skNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor SK Pembekuan *</FormLabel>
                  <FormControl><Input placeholder="SK/PENGAWAS/2026/001" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={suspensionForm.control} name="auditReason" render={({ field }) => (
                <FormItem>
                  <FormLabel>Alasan Audit / Indikasi Pelanggaran *</FormLabel>
                  <FormControl><Textarea placeholder="Jelaskan pertimbangan audit..." rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={suspensionForm.control} name="plhUserId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID User Plh/Plt Pengganti</FormLabel>
                    <FormControl><Input placeholder="ID Pengurus Pendamping..." {...field} value={field.value == null ? "" : String(field.value)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={suspensionForm.control} name="plhRoleCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peran / Role Plh</FormLabel>
                    <Select value={field.value == null ? undefined : String(field.value)} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Pilih peran Plh" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PLH_ROLE_CODES.map((code) => (
                          <SelectItem key={code} value={code}>{code.replace("YAYASAN_", "Yayasan ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSuspensionDialogOpen(false)}>Batal</Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">
                  Tetapkan SK Pembekuan
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Lift Suspension Dialog */}
      <Dialog open={!!selectedLiftId} onOpenChange={() => setSelectedLiftId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pemulihan Status Pengurus</DialogTitle>
            <DialogDescription>Masukkan alasan pemulihan status / pencabutan pembekuan pengurus.</DialogDescription>
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
              <Button variant="outline" onClick={() => setSelectedLiftId(null)}>Batal</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleLiftSuspension}>
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
            <DialogTitle>Pengajuan Laporan Pengawasan Periodik ke Pembina</DialogTitle>
            <DialogDescription>
              Isi ringkasan laporan pengawasan. Laporan akan terdaftar sebagai Surat Keluar di E-Office.
            </DialogDescription>
          </DialogHeader>
          <Form {...periodicForm}>
            <form onSubmit={periodicForm.handleSubmit(handlePeriodicReportSubmit)} className="space-y-4">
              <FormField control={periodicForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Judul Laporan *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={periodicForm.control} name="period" render={({ field }) => (
                <FormItem>
                  <FormLabel>Periode *</FormLabel>
                  <FormControl><Input placeholder="2026-Q1" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={periodicForm.control} name="executiveSummary" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ringkasan Eksekutif *</FormLabel>
                  <FormControl><Textarea rows={3} placeholder="Tuliskan poin utama hasil pengawasan..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={periodicForm.control} name="recommendations" render={({ field }) => (
                <FormItem>
                  <FormLabel>Rekomendasi Pengawas</FormLabel>
                  <FormControl><Textarea rows={2} placeholder="Rekomendasi tindak lanjut bagi Pengurus..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setPeriodicDialogOpen(false)}>Batal</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Ajukan Surat Laporan ke E-Office
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
        onConfirm={async () => { if (deleteId) { await deleteAudit.mutateAsync(deleteId); setDeleteId(null); } }}
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
