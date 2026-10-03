"use client";
import { MainLayout } from "@/components/layout";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ANNOUNCEMENT_AUDIENCES,
  FAMILY_AUDIENCES,
  type AnnouncementAudience,
  type AnnouncementScopeCode,
} from "@cipansor/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared";
import {
  AlertCircle,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  FileText,
  Info,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Search,
  Undo2,
  Users,
} from "lucide-react";
import {
  useAnnouncement,
  useAnnouncementComposeOptions,
  useAnnouncements,
  useAnnouncementStats,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useWithdrawAnnouncement,
  type Announcement,
} from "@/hooks/use-announcements";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

const PRIORITY_OPTIONS = [
  { value: 0, label: "Normal", color: "bg-gray-500" },
  { value: 1, label: "Penting", color: "bg-orange-500" },
  { value: 2, label: "Mendesak", color: "bg-red-500" },
];

const TYPE_OPTIONS = [
  { value: "ANNOUNCEMENT", label: "Pengumuman" },
  { value: "INFO", label: "Informasi" },
  { value: "REMINDER", label: "Pengingat" },
  { value: "ALERT", label: "Peringatan" },
] as const;

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  STUDENT: "Santri",
  PARENT: "Wali",
  TEACHER: "Guru/Ustadz",
  STAFF: "Staf",
};

const SCOPE_LABELS: Record<AnnouncementScopeCode, string> = {
  YAYASAN: "Seluruh yayasan",
  UNIT: "Satu unit",
  CLASSES: "Kelas saya",
  BOARDERS: "Santri mukim binaan saya",
};

const when = (iso: string) =>
  format(new Date(iso), "dd MMM yyyy HH:mm", { locale: localeId });

/** "yyyy-MM-ddTHH:mm" in the browser's clock, for a datetime-local input. */
const toLocalInput = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");

/** Who an announcement went to, in words. */
function reachOf(a: Announcement): string {
  const place =
    a.scope === "YAYASAN"
      ? "Seluruh yayasan"
      : a.scope === "CLASSES"
        ? `${a.classIds.length} kelas`
        : a.scope === "BOARDERS"
          ? "Santri mukim"
          : (a.unit?.name ?? "Unit");
  const who = a.targetRoles.length
    ? a.targetRoles
        .map((r) => AUDIENCE_LABELS[r as AnnouncementAudience] ?? r)
        .join(", ")
    : "semua";
  return `${place} · ${who}`;
}

/** Withdrawn, scheduled, expired — or nothing when it is live. */
function stateOf(a: Announcement, now: Date) {
  if (a.withdrawnAt)
    return { label: "Ditarik", variant: "destructive" as const };
  if (a.publishedAt && new Date(a.publishedAt) > now)
    return { label: "Terjadwal", variant: "secondary" as const };
  if (a.expiresAt && new Date(a.expiresAt) < now)
    return { label: "Berakhir", variant: "outline" as const };
  return null;
}

function priorityBadge(priority: number) {
  const option = PRIORITY_OPTIONS.find((o) => o.value === priority);
  return (
    <Badge className={option?.color ?? "bg-gray-500"}>
      {option?.label ?? "Normal"}
    </Badge>
  );
}

function priorityIcon(priority: number) {
  if (priority === 2) return <AlertCircle className="h-5 w-5 text-red-500" />;
  if (priority === 1)
    return <AlertCircle className="h-5 w-5 text-orange-500" />;
  return <Info className="h-5 w-5 text-blue-500" />;
}

interface FormState {
  scope: AnnouncementScopeCode | "";
  unitId: string;
  classIds: string[];
  targetRoles: AnnouncementAudience[];
  title: string;
  content: string;
  type: (typeof TYPE_OPTIONS)[number]["value"];
  priority: number;
  publishedAt: string;
  expiresAt: string;
}

const emptyForm = (scope: AnnouncementScopeCode | ""): FormState => ({
  scope,
  unitId: "",
  classIds: [],
  targetRoles: [],
  title: "",
  content: "",
  type: "ANNOUNCEMENT",
  priority: 0,
  publishedAt: toLocalInput(new Date()),
  expiresAt: "",
});

function AnnouncementsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedId = searchParams.get("id");

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [viewing, setViewing] = useState<Announcement | null>(null);
  const [withdrawing, setWithdrawing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(""));

  const { data: options } = useAnnouncementComposeOptions();
  const scopes = options?.scopes ?? [];
  const oversees = scopes.includes("UNIT") || scopes.includes("YAYASAN");

  const { data: list, isLoading } = useAnnouncements({
    active: activeTab === "active",
    limit: 50,
  });
  const { data: stats } = useAnnouncementStats(oversees);
  const { data: linked } = useAnnouncement(linkedId);

  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const withdraw = useWithdrawAnnouncement();

  const now = new Date();
  const announcements = list?.data ?? [];
  const shown = announcements.filter((a) => {
    const q = searchQuery.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
    );
  });

  // The bell's link opens the board on one announcement.
  const opened = viewing ?? (linkedId ? (linked ?? null) : null);
  const closeView = () => {
    setViewing(null);
    if (linkedId) router.replace("/announcements");
  };

  const audiences = useMemo(
    () =>
      form.scope === "CLASSES" || form.scope === "BOARDERS"
        ? FAMILY_AUDIENCES
        : ANNOUNCEMENT_AUDIENCES,
    [form.scope],
  );

  const openCompose = () => {
    setEditing(null);
    const first = scopes[0] ?? "";
    setForm({
      ...emptyForm(first),
      unitId: options?.units.length === 1 ? options.units[0].id : "",
    });
    setComposing(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      ...emptyForm(a.scope),
      title: a.title,
      content: a.content,
      type: (TYPE_OPTIONS.find((t) => t.value === a.type)?.value ??
        "ANNOUNCEMENT") as FormState["type"],
      priority: a.priority,
      expiresAt: a.expiresAt ? toLocalInput(new Date(a.expiresAt)) : "",
    });
    setComposing(true);
  };

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Judul dan isi wajib diisi");
      return;
    }
    const expiresAt = form.expiresAt
      ? new Date(form.expiresAt).toISOString()
      : null;
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          data: {
            title: form.title,
            content: form.content,
            type: form.type,
            priority: form.priority,
            expiresAt,
          },
        });
        toast.success("Pengumuman diperbarui");
      } else {
        if (!form.scope) return;
        if (form.scope === "CLASSES" && form.classIds.length === 0) {
          toast.error("Pilih paling sedikit satu kelas");
          return;
        }
        const made = await create.mutateAsync({
          scope: form.scope,
          ...(form.scope === "UNIT" && form.unitId
            ? { unitId: form.unitId }
            : {}),
          classIds: form.scope === "CLASSES" ? form.classIds : [],
          targetRoles: form.targetRoles,
          title: form.title,
          content: form.content,
          type: form.type,
          priority: form.priority,
          publishedAt: form.publishedAt
            ? new Date(form.publishedAt).toISOString()
            : undefined,
          ...(expiresAt ? { expiresAt } : {}),
        });
        toast.success(
          `Pengumuman terbit — masuk ke lonceng ${made.recipientCount ?? 0} orang`,
        );
      }
      setComposing(false);
    } catch {
      // The API's reason (e.g. a class that is not the sender's) is toasted
      // by the global handler.
    }
  };

  const confirmWithdraw = async () => {
    if (!withdrawing) return;
    try {
      const out = await withdraw.mutateAsync(withdrawing.id);
      toast.success(
        `Pengumuman ditarik dari papan dan dari ${out.removedFromBells} lonceng`,
      );
    } catch {
      // The API's reason is toasted by the global handler.
    } finally {
      setWithdrawing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Pengumuman"
        description="Pengumuman untuk Anda, dan yang Anda terbitkan"
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Cari pengumuman"
                placeholder="Cari pengumuman..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {scopes.length > 0 && (
              <Button onClick={openCompose}>
                <Megaphone className="mr-2 h-4 w-4" />
                Buat Pengumuman
              </Button>
            )}
          </>
        }
      />

      {oversees && stats && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {[
            { label: "Total", value: stats.total, icon: FileText },
            { label: "Aktif", value: stats.active, icon: CheckCircle },
            { label: "Mendesak", value: stats.urgent, icon: AlertCircle },
            { label: "Bulan ini", value: stats.thisMonth, icon: Calendar },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Semua</TabsTrigger>
          <TabsTrigger value="active">Sedang berlaku</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        {shown.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Bell className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Tidak ada pengumuman</h3>
              <p className="mt-2 text-muted-foreground">
                {searchQuery
                  ? "Tidak ada pengumuman yang sesuai dengan pencarian Anda"
                  : "Belum ada pengumuman untuk Anda"}
              </p>
            </CardContent>
          </Card>
        ) : (
          shown.map((a) => {
            const state = stateOf(a, now);
            return (
              <Card
                key={a.id}
                data-testid="announcement-card"
                className={state?.label === "Ditarik" ? "opacity-70" : ""}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {priorityIcon(a.priority)}
                      <div>
                        <CardTitle className="text-lg">{a.title}</CardTitle>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {when(a.publishedAt ?? a.createdAt)}
                          </span>
                          {a.createdBy && <span>• {a.createdBy.name}</span>}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {reachOf(a)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {state && (
                        <Badge variant={state.variant}>{state.label}</Badge>
                      )}
                      {priorityBadge(a.priority)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Tindakan untuk ${a.title}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(a)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Lihat
                          </DropdownMenuItem>
                          {a.canManage && !a.withdrawnAt && (
                            <>
                              <DropdownMenuItem onClick={() => openEdit(a)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Ubah
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setWithdrawing(a)}
                                className="text-red-600"
                              >
                                <Undo2 className="mr-2 h-4 w-4" />
                                Tarik
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {a.content}
                  </p>
                  {a.expiresAt && (
                    <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Berlaku sampai {when(a.expiresAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Compose / revise */}
      <Dialog open={composing} onOpenChange={setComposing}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Ubah Pengumuman" : "Buat Pengumuman"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Penerimanya tetap; lonceng mereka ikut memakai teks baru. Push yang sudah terkirim tidak berubah."
                : "Pengumuman masuk ke lonceng (dan push) setiap penerima, dan tetap bisa dibaca di papan ini."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!editing && (
              <div className="space-y-2">
                <Label>Untuk</Label>
                <RadioGroup
                  value={form.scope}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      scope: v as AnnouncementScopeCode,
                      targetRoles: [],
                      classIds: [],
                    })
                  }
                  className="flex flex-wrap gap-4"
                >
                  {scopes.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <RadioGroupItem value={s} id={`scope-${s}`} />
                      <Label htmlFor={`scope-${s}`} className="font-normal">
                        {SCOPE_LABELS[s]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}

            {!editing &&
              form.scope === "UNIT" &&
              (options?.units.length ?? 0) > 1 && (
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select
                    value={form.unitId}
                    onValueChange={(v) => setForm({ ...form, unitId: v })}
                  >
                    <SelectTrigger aria-label="Unit">
                      <SelectValue placeholder="Pilih unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {!editing && form.scope === "CLASSES" && (
              <div className="space-y-2">
                <Label>Kelas</Label>
                {options?.classes.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {options.classes.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={form.classIds.includes(c.id)}
                          onCheckedChange={() =>
                            setForm({
                              ...form,
                              classIds: toggle(form.classIds, c.id),
                            })
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Anda belum tercatat sebagai wali kelas atau pengajar kelas
                    mana pun tahun ini.
                  </p>
                )}
              </div>
            )}

            {!editing && form.scope === "BOARDERS" && (
              <p className="text-sm text-muted-foreground">
                Untuk {options?.boarders ?? 0} santri mukim di kamar yang Anda
                bina, dan walinya.
              </p>
            )}

            {!editing && form.scope && (
              <div className="space-y-2">
                <Label>Penerima</Label>
                <div className="flex flex-wrap gap-4">
                  {audiences.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.targetRoles.includes(r)}
                        onCheckedChange={() =>
                          setForm({
                            ...form,
                            targetRoles: toggle(form.targetRoles, r),
                          })
                        }
                      />
                      {AUDIENCE_LABELS[r]}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tidak dicentang = semuanya.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="announcement-title">Judul</Label>
              <Input
                id="announcement-title"
                value={form.title}
                maxLength={200}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="announcement-content">Isi</Label>
              <Textarea
                id="announcement-content"
                value={form.content}
                rows={5}
                maxLength={10000}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Jenis</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm({ ...form, type: v as FormState["type"] })
                  }
                >
                  <SelectTrigger aria-label="Jenis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioritas</Label>
                <Select
                  value={String(form.priority)}
                  onValueChange={(v) =>
                    setForm({ ...form, priority: Number(v) })
                  }
                >
                  <SelectTrigger aria-label="Prioritas">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {!editing && (
                <div className="space-y-2">
                  <Label htmlFor="announcement-published">Terbit</Label>
                  <Input
                    id="announcement-published"
                    type="datetime-local"
                    value={form.publishedAt}
                    onChange={(e) =>
                      setForm({ ...form, publishedAt: e.target.value })
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="announcement-expires">
                  Berakhir (opsional)
                </Label>
                <Input
                  id="announcement-expires"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) =>
                    setForm({ ...form, expiresAt: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setComposing(false)}>
              Batal
            </Button>
            <Button
              onClick={handleSave}
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : editing ? (
                "Simpan"
              ) : (
                "Terbitkan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read */}
      <Dialog
        open={!!opened}
        onOpenChange={(open) => {
          if (!open) closeView();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {opened && priorityIcon(opened.priority)}
              {opened?.title}
            </DialogTitle>
            <DialogDescription>
              {opened &&
                `${when(opened.publishedAt ?? opened.createdAt)} · ${
                  opened.createdBy?.name ?? "Sistem"
                } · ${reachOf(opened)}`}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{opened?.content}</p>
          {opened?.recipientCount !== undefined && (
            <p className="text-sm text-muted-foreground">
              Masuk ke lonceng {opened.recipientCount} orang.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeView}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw */}
      <AlertDialog
        open={!!withdrawing}
        onOpenChange={(open) => {
          if (!open) setWithdrawing(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tarik pengumuman ini?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{withdrawing?.title}&rdquo; hilang dari papan dan dari
              lonceng setiap penerima. Push yang sudah sampai ke ponsel tidak
              bisa ditarik. Catatannya tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmWithdraw}
              className="bg-red-600 hover:bg-red-700"
            >
              Tarik
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AnnouncementsPageWithShell() {
  return (
    <MainLayout>
      <Suspense fallback={null}>
        <AnnouncementsPageContent />
      </Suspense>
    </MainLayout>
  );
}
