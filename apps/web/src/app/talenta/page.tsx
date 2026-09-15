"use client";
import { MainLayout } from "@/components/layout";

import { useState, useEffect } from "react";
import { Edit, Sparkles, CheckCircle2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useTalentProfiles,
  useTrainings,
  useSuccessions,
  useCreateProfile,
  useCreateTalentAssessment as useCreateAssessment,
  useCreateTraining,
  useCreateSuccession,
  useDeleteProfile,
  useDeleteTraining,
  useDeleteSuccession,
  useSuccessorSuggestions,
  useUpdateSuccession,
} from "@/hooks/use-talenta";
import { useAuth } from "@/hooks/use-auth";
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
  Plus, Trash2, Users, GraduationCap, Star, TrendingUp, ClipboardList,
} from "lucide-react";

// ─── Schemas ────────────────────────────────────────
const profileFormSchema = z.object({
  userId: z.string().min(1, "User wajib dipilih"),
  currentRole: z.string().min(1, "Role wajib"),
  category: z.enum(["HIGH_POTENTIAL", "KEY_TALENT", "EMERGING", "SOLID_PERFORMER", "NEEDS_DEVELOPMENT"]).optional(),
  potentialRole: z.string().optional(),
  strengths: z.string().optional(),
  developmentAreas: z.string().optional(),
  careerAspiration: z.string().optional(),
});

const assessmentFormSchema = z.object({
  talentId: z.string().min(1, "Talent wajib"),
  period: z.string().min(1, "Periode wajib"),
  performanceRating: z.enum(["OUTSTANDING", "EXCEEDS", "MEETS", "BELOW", "UNSATISFACTORY"]),
  potentialRating: z.enum(["OUTSTANDING", "EXCEEDS", "MEETS", "BELOW", "UNSATISFACTORY"]),
  overallScore: z.string().min(1, "Skor wajib"),
  feedback: z.string().optional(),
  developmentPlan: z.string().optional(),
  assessedAt: z.string().min(1, "Tanggal wajib"),
});

const trainingFormSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  category: z.string().min(1, "Kategori wajib"),
  trainer: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  maxParticipants: z.string().optional(),
  location: z.string().optional(),
});

const successionFormSchema = z.object({
  positionTitle: z.string().min(3, "Jabatan wajib"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  readinessLevel: z.string().optional(),
  notes: z.string().optional(),
  targetDate: z.string().optional(),
});

// ─── Constants ──────────────────────────────────────
const categoryColor: Record<string, string> = {
  HIGH_POTENTIAL: "bg-purple-100 text-purple-700",
  KEY_TALENT: "bg-green-100 text-green-700",
  EMERGING: "bg-blue-100 text-blue-700",
  SOLID_PERFORMER: "bg-yellow-100 text-yellow-700",
  NEEDS_DEVELOPMENT: "bg-red-100 text-red-700",
};

const categoryLabel: Record<string, string> = {
  HIGH_POTENTIAL: "High Potential",
  KEY_TALENT: "Key Talent",
  EMERGING: "Emerging",
  SOLID_PERFORMER: "Solid Performer",
  NEEDS_DEVELOPMENT: "Needs Development",
};

const priorityColor: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const ratingOptions = [
  { value: "OUTSTANDING", label: "Outstanding" },
  { value: "EXCEEDS", label: "Exceeds" },
  { value: "MEETS", label: "Meets" },
  { value: "BELOW", label: "Below" },
  { value: "UNSATISFACTORY", label: "Unsatisfactory" },
];

const trainingCategories = [
  "Pedagogik", "Manajerial", "Teknologi", "Kurikulum", "Soft Skills",
  "Kepemimpinan", "Sosial", "Profesional", "Lainnya",
];

// ─── Profile Dialog ─────────────────────────────────
function ProfileFormDialog({ onClose }: { onClose: () => void }) {
  const createProfile = useCreateProfile();
  const form = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { userId: "", currentRole: "", category: undefined, potentialRole: "", strengths: "", developmentAreas: "", careerAspiration: "" },
  });

  const onSubmit = async (values: z.infer<typeof profileFormSchema>) => {
    await createProfile.mutateAsync(values);
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Tambah Profil Talenta</DialogTitle>
        <DialogDescription>Daftarkan SDM ke dalam manajemen talenta.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="userId" render={({ field }) => (
            <FormItem><FormLabel>User ID</FormLabel><FormControl><Input placeholder="UUID user" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="currentRole" render={({ field }) => (
              <FormItem><FormLabel>Role Saat Ini</FormLabel><FormControl><Input placeholder="cth: Guru" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Kategori</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Opsional" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.entries(categoryLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="potentialRole" render={({ field }) => (
            <FormItem><FormLabel>Potensi Jabatan (Opsional)</FormLabel><FormControl><Input placeholder="cth: Kepala Sekolah" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="strengths" render={({ field }) => (
            <FormItem><FormLabel>Kekuatan (Opsional)</FormLabel><FormControl><Textarea rows={2} placeholder="Kekuatan utama…" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="developmentAreas" render={({ field }) => (
            <FormItem><FormLabel>Area Pengembangan (Opsional)</FormLabel><FormControl><Textarea rows={2} placeholder="Area yang perlu dikembangkan…" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={createProfile.isPending}>{createProfile.isPending ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Assessment Dialog ──────────────────────────────
function AssessmentFormDialog({ profiles, onClose }: { profiles?: any[]; onClose: () => void }) {
  const createAssessment = useCreateAssessment();
  const form = useForm<z.infer<typeof assessmentFormSchema>>({
    resolver: zodResolver(assessmentFormSchema),
    defaultValues: { talentId: "", period: "", performanceRating: "MEETS", potentialRating: "MEETS", overallScore: "", feedback: "", developmentPlan: "", assessedAt: "" },
  });

  const onSubmit = async (values: z.infer<typeof assessmentFormSchema>) => {
    await createAssessment.mutateAsync({
      ...values,
      overallScore: Number(values.overallScore),
      assessedAt: new Date(values.assessedAt).toISOString(),
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>Tambah Penilaian Talenta</DialogTitle>
        <DialogDescription>Catat penilaian kinerja dan potensi SDM. Kategori talent akan diperbarui otomatis.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="talentId" render={({ field }) => (
            <FormItem>
              <FormLabel>Talenta</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Pilih talenta" /></SelectTrigger></FormControl>
                <SelectContent>
                  {profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.user?.name} — {p.currentRole}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="period" render={({ field }) => (
              <FormItem><FormLabel>Periode</FormLabel><FormControl><Input placeholder="2025 Semester 1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="assessedAt" render={({ field }) => (
              <FormItem><FormLabel>Tanggal</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField control={form.control} name="performanceRating" render={({ field }) => (
              <FormItem>
                <FormLabel>Kinerja</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{ratingOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="potentialRating" render={({ field }) => (
              <FormItem>
                <FormLabel>Potensi</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{ratingOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="overallScore" render={({ field }) => (
              <FormItem><FormLabel>Skor (0-100)</FormLabel><FormControl><Input type="number" min={0} max={100} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <FormField control={form.control} name="feedback" render={({ field }) => (
            <FormItem><FormLabel>Feedback (Opsional)</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={createAssessment.isPending}>{createAssessment.isPending ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Training Dialog ────────────────────────────────
function TrainingFormDialog({ onClose }: { onClose: () => void }) {
  const createTraining = useCreateTraining();
  const form = useForm<z.infer<typeof trainingFormSchema>>({
    resolver: zodResolver(trainingFormSchema),
    defaultValues: { title: "", description: "", category: "", trainer: "", startDate: "", endDate: "", maxParticipants: "", location: "" },
  });

  const onSubmit = async (values: z.infer<typeof trainingFormSchema>) => {
    await createTraining.mutateAsync({
      ...values,
      startDate: values.startDate ? new Date(values.startDate).toISOString() : undefined,
      endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
      maxParticipants: values.maxParticipants ? Number(values.maxParticipants) : undefined,
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Tambah Program Pelatihan</DialogTitle>
        <DialogDescription>Buat program pelatihan dan pengembangan SDM.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem><FormLabel>Judul</FormLabel><FormControl><Input placeholder="cth: Pelatihan Kurikulum Merdeka" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Kategori</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger></FormControl>
                  <SelectContent>{trainingCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="trainer" render={({ field }) => (
              <FormItem><FormLabel>Trainer (Opsional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="startDate" render={({ field }) => (
              <FormItem><FormLabel>Mulai</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="endDate" render={({ field }) => (
              <FormItem><FormLabel>Selesai</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="maxParticipants" render={({ field }) => (
              <FormItem><FormLabel>Max Peserta</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem><FormLabel>Lokasi</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={createTraining.isPending}>{createTraining.isPending ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Succession Dialog ──────────────────────────────
function SuccessionFormDialog({ onClose, initialData }: { onClose: () => void; initialData?: any }) {
  const createSuccession = useCreateSuccession();
  const updateSuccession = useUpdateSuccession();

  const [selectedSuccessorId, setSelectedSuccessorId] = useState<string | null>(
    initialData?.successorId || null
  );

  const isEdit = !!initialData;
  const isPending = createSuccession.isPending || updateSuccession.isPending;

  const form = useForm<z.infer<typeof successionFormSchema>>({
    resolver: zodResolver(successionFormSchema),
    defaultValues: {
      positionTitle: initialData?.positionTitle || "",
      priority: initialData?.priority || undefined,
      readinessLevel: initialData?.readinessLevel || "",
      notes: initialData?.notes || "",
      targetDate: initialData?.targetDate ? new Date(initialData.targetDate).toISOString().split('T')[0] : ""
    },
  });

  const { user } = useAuth();
  const positionTitle = useWatch({ control: form.control, name: "positionTitle" });
  const { data: suggestions, isLoading: loadingSuggestions } = useSuccessorSuggestions(positionTitle, user?.unitId);

  useEffect(() => {
    form.reset({
      positionTitle: initialData?.positionTitle || "",
      priority: initialData?.priority || undefined,
      readinessLevel: initialData?.readinessLevel || "",
      notes: initialData?.notes || "",
      targetDate: initialData?.targetDate ? new Date(initialData.targetDate).toISOString().split('T')[0] : ""
    });
    setSelectedSuccessorId(initialData?.successorId || null);
  }, [initialData, form]);

  const onSubmit = async (values: z.infer<typeof successionFormSchema>) => {
    const payload = {
      ...values,
      successorId: selectedSuccessorId,
      targetDate: values.targetDate ? new Date(values.targetDate).toISOString() : undefined,
    };

    if (isEdit) {
      await updateSuccession.mutateAsync({ id: initialData.id, data: payload });
    } else {
      await createSuccession.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Rencana Suksesi" : "Tambah Rencana Suksesi"}</DialogTitle>
        <DialogDescription>{isEdit ? "Perbarui" : "Buat"} rencana suksesi untuk posisi kunci di lembaga.</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control} name="positionTitle" render={({ field }) => (
            <FormItem><FormLabel>Jabatan</FormLabel><FormControl><Input placeholder="cth: Kepala Sekolah" {...field} /></FormControl><FormMessage /></FormItem>
          )} />

          {/*
            Kandidat dari mesin saran yang sama dengan /talenta/succession:
            penjumlahan berbobot, bukan model. Label lamanya "(AI-Matching)" —
            klaim yang #410 hapus dari layar suksesi lain karena tidak ada
            model apa pun di baliknya, dan layar ini luput waktu itu.
          */}
          {positionTitle && positionTitle.length > 2 && (
            <div className="space-y-2 border rounded-lg p-3 bg-slate-50/50">
              <div className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                <Sparkles className="h-4 w-4" /> Kandidat Potensial (skor
                kecocokan)
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {loadingSuggestions ? (
                  <Skeleton className="h-10 w-full" />
                ) : suggestions?.length > 0 ? (
                  suggestions.map((s: any) => (
                    <div
                      key={s.talentProfileId}
                      className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                        selectedSuccessorId === s.talentProfileId
                          ? "bg-purple-100 border-purple-300 ring-1 ring-purple-300"
                          : "bg-white hover:bg-slate-100 border-slate-200"
                      }`}
                      onClick={() => {
                        setSelectedSuccessorId(s.talentProfileId);
                        if (s.readiness === "READY_NOW") form.setValue("readinessLevel", "Siap Sekarang");
                        else if (s.readiness === "READY_IN_1_YEAR") form.setValue("readinessLevel", "Siap 1-2 Tahun");
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold flex items-center gap-1">
                          {s.name}
                          {s.shariaMatch && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                        </span>
                        <span className="text-muted-foreground">{s.currentRole} • {s.category}</span>
                      </div>
                      <Badge variant={selectedSuccessorId === s.talentProfileId ? "default" : "outline"} className="text-[10px]">
                        {s.matchScore}% Match
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-muted-foreground italic text-center py-2">Belum ada kandidat yang cocok</div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="priority" render={({ field }) => (
              <FormItem>
                <FormLabel>Prioritas</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Opsional" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="LOW">Rendah</SelectItem>
                    <SelectItem value="MEDIUM">Sedang</SelectItem>
                    <SelectItem value="HIGH">Tinggi</SelectItem>
                    <SelectItem value="CRITICAL">Kritikal</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="targetDate" render={({ field }) => (
              <FormItem><FormLabel>Target Waktu</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <FormField control={form.control} name="readinessLevel" render={({ field }) => (
            <FormItem><FormLabel>Tingkat Kesiapan (Opsional)</FormLabel><FormControl><Input placeholder="cth: Siap dalam 1 tahun" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem><FormLabel>Catatan (Opsional)</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

// ─── Main Page ──────────────────────────────────────
function TalentaPageContent() {
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false);
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  const [successionDialogOpen, setSuccessionDialogOpen] = useState(false);
  const [editingSuccession, setEditingSuccession] = useState<any>(null);
  const [deleteState, setDeleteState] = useState<{ type: string; id: string } | null>(null);

  const { data: profiles, isLoading: loadingProfiles } = useTalentProfiles();
  const { data: trainings } = useTrainings();
  const { data: successions } = useSuccessions();
  const deleteProfile = useDeleteProfile();
  const deleteTraining = useDeleteTraining();
  const deleteSuccession = useDeleteSuccession();

  const handleDelete = async () => {
    if (!deleteState) return;
    const { type, id } = deleteState;
    if (type === "profile") await deleteProfile.mutateAsync(id);
    else if (type === "training") await deleteTraining.mutateAsync(id);
    else if (type === "succession") await deleteSuccession.mutateAsync(id);
    setDeleteState(null);
  };

  const highPotentialCount = profiles?.filter((p: any) => p.category === "HIGH_POTENTIAL" || p.category === "KEY_TALENT").length || 0;

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title="Manajemen Talenta"
        description="Kelola profil talenta, penilaian, pelatihan, dan suksesi SDM."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Users className="h-3 w-3" /> Total Talenta</CardDescription>
            <CardTitle className="text-3xl">{loadingProfiles ? <Skeleton className="h-9 w-12" /> : profiles?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Star className="h-3 w-3" /> High Potential + Key Talent</CardDescription>
            <CardTitle className="text-3xl text-purple-600">{highPotentialCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><GraduationCap className="h-3 w-3" /> Program Pelatihan</CardDescription>
            <CardTitle className="text-3xl text-green-600">{trainings?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Rencana Suksesi</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{successions?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profiles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profiles">Profil Talenta</TabsTrigger>
          <TabsTrigger value="trainings">Pelatihan</TabsTrigger>
          <TabsTrigger value="succession">Suksesi</TabsTrigger>
        </TabsList>

        {/* Profiles Tab */}
        <TabsContent value="profiles" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Dialog open={assessmentDialogOpen} onOpenChange={setAssessmentDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-1"><ClipboardList className="h-4 w-4" /> Penilaian</Button>
              </DialogTrigger>
              <AssessmentFormDialog profiles={profiles} onClose={() => setAssessmentDialogOpen(false)} />
            </Dialog>
            <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1"><Plus className="h-4 w-4" /> Tambah Profil</Button>
              </DialogTrigger>
              <ProfileFormDialog onClose={() => setProfileDialogOpen(false)} />
            </Dialog>
          </div>
          {loadingProfiles ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : profiles?.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p>Belum ada profil talenta.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profiles?.map((profile: any) => {
                const latestAssessment = profile.assessments?.[0];
                return (
                  <Card key={profile.id} className="hover:shadow-md transition-shadow group">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{profile.user?.name}</CardTitle>
                          <CardDescription>{profile.currentRole} • {profile.unitRel?.name}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {profile.category && (
                            <Badge className={categoryColor[profile.category]}>
                              {categoryLabel[profile.category]}
                            </Badge>
                          )}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteState({ type: "profile", id: profile.id })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {latestAssessment ? (
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Kinerja: {latestAssessment.performanceRating}</span>
                          <span>Potensi: {latestAssessment.potentialRating}</span>
                          <span>Skor: {latestAssessment.overallScore}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Belum ada penilaian</span>
                      )}
                      {profile.potentialRole && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Potensi: {profile.potentialRole}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Trainings Tab */}
        <TabsContent value="trainings" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1"><Plus className="h-4 w-4" /> Tambah Pelatihan</Button>
              </DialogTrigger>
              <TrainingFormDialog onClose={() => setTrainingDialogOpen(false)} />
            </Dialog>
          </div>
          {trainings?.length === 0 || !trainings ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Belum ada program pelatihan.</CardContent></Card>
          ) : (
            trainings?.map((training: any) => (
              <Card key={training.id} className="hover:shadow-md transition-shadow group">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{training.title}</CardTitle>
                      <CardDescription>{training.category} {training.trainer && `• Trainer: ${training.trainer}`}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-700">{training.status || "PLANNED"}</Badge>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteState({ type: "training", id: training.id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{training.enrollments?.length || 0} peserta</span>
                    {training.maxParticipants && <span>Max: {training.maxParticipants}</span>}
                    {training.location && <span>Lokasi: {training.location}</span>}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Succession Tab */}
        <TabsContent value="succession" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={successionDialogOpen} onOpenChange={(open) => {
              if (!open) setEditingSuccession(null);
              setSuccessionDialogOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button className="gap-1" onClick={() => setEditingSuccession(null)}><Plus className="h-4 w-4" /> Tambah Suksesi</Button>
              </DialogTrigger>
              <SuccessionFormDialog
                onClose={() => { setSuccessionDialogOpen(false); setEditingSuccession(null); }}
                initialData={editingSuccession}
              />
            </Dialog>
          </div>
          {successions?.length === 0 || !successions ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Belum ada rencana suksesi.</CardContent></Card>
          ) : (
            successions?.map((succ: any) => (
              <Card key={succ.id} className="hover:shadow-md transition-shadow group">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{succ.positionTitle}</CardTitle>
                      <CardDescription>
                        {succ.currentHolder && `Pemegang: ${succ.currentHolder.name}`}
                        {succ.successor?.user && ` → Kandidat: ${succ.successor.user.name}`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {succ.priority && <Badge className={priorityColor[succ.priority]}>{succ.priority}</Badge>}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-500"
                          onClick={() => {
                            setEditingSuccession(succ);
                            setSuccessionDialogOpen(true);
                          }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteState({ type: "succession", id: succ.id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {(succ.readinessLevel || succ.targetDate) && (
                  <CardContent>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {succ.readinessLevel && <span>Kesiapan: {succ.readinessLevel}</span>}
                      {succ.targetDate && <span>Target: {new Date(succ.targetDate).toLocaleDateString("id-ID")}</span>}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!deleteState}
        onOpenChange={(open) => !open && setDeleteState(null)}
        title="Hapus Data?"
        description="Data ini akan dihapus permanen dan tidak dapat dibatalkan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteProfile.isPending || deleteTraining.isPending || deleteSuccession.isPending}
      />
    </div>
  );
}

export default function TalentaPageWithShell() {
  return (
    <MainLayout>
      <TalentaPageContent />
    </MainLayout>
  );
}
