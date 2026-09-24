"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  Search,
  Calendar,
  AlertCircle,
  Info,
  CheckCircle,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Megaphone,
  Users,
  Clock,
  Eye,
  FileText,
  Loader2,
} from "lucide-react";
import {
  useAnnouncements,
  useAnnouncementStats,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  Announcement,
} from "@/hooks/use-announcements";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { getEffectiveRole } from "@/lib/rbac";

const PRIORITY_OPTIONS = [
  { value: 0, label: "Normal", color: "bg-gray-500", icon: Info },
  { value: 1, label: "Penting", color: "bg-orange-500", icon: AlertCircle },
  { value: 2, label: "Mendesak", color: "bg-red-500", icon: AlertCircle },
];

const TYPE_OPTIONS = [
  { value: "ANNOUNCEMENT", label: "Pengumuman" },
  { value: "INFO", label: "Informasi" },
  { value: "REMINDER", label: "Pengingat" },
  { value: "ALERT", label: "Peringatan" },
];

const ROLE_OPTIONS = [
  { value: "STUDENT", label: "Santri" },
  { value: "PARENT", label: "Orang Tua" },
  { value: "TEACHER", label: "Guru/Ustadz" },
  { value: "STAFF", label: "Staff" },
];

function AnnouncementsPageContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<Announcement | null>(null);
  const [viewingAnnouncement, setViewingAnnouncement] =
    useState<Announcement | null>(null);

  const [form, setForm] = useState({
    title: "",
    content: "",
    type: "ANNOUNCEMENT",
    priority: 0,
    publishedAt: safeFormat(new Date(), "yyyy-MM-dd'T'HH:mm"),
    expiresAt: "",
    targetRoles: [] as string[],
  });

  const { data: announcementsData, isLoading } = useAnnouncements({
    unitId: user?.unitId,
    published: activeTab === "published",
    limit: 50,
  });
  const { data: stats } = useAnnouncementStats(user?.unitId);

  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  const announcements = announcementsData?.data || [];

  const resetForm = () => {
    setForm({
      title: "",
      content: "",
      type: "ANNOUNCEMENT",
      priority: 0,
      publishedAt: safeFormat(new Date(), "yyyy-MM-dd'T'HH:mm"),
      expiresAt: "",
      targetRoles: [],
    });
    setEditingAnnouncement(null);
  };

  const handleOpenEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setForm({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      priority: announcement.priority,
      publishedAt: announcement.publishedAt
        ? safeFormat(new Date(announcement.publishedAt), "yyyy-MM-dd'T'HH:mm")
        : "",
      expiresAt: announcement.expiresAt
        ? safeFormat(new Date(announcement.expiresAt), "yyyy-MM-dd'T'HH:mm")
        : "",
      targetRoles: announcement.targetRoles || [],
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.content) {
      toast.error("Judul dan konten wajib diisi");
      return;
    }

    try {
      const payload = {
        ...form,
        unitId: user?.unitId,
        publishedAt: form.publishedAt
          ? new Date(form.publishedAt).toISOString()
          : undefined,
        expiresAt: form.expiresAt
          ? new Date(form.expiresAt).toISOString()
          : undefined,
      };

      if (editingAnnouncement) {
        await updateAnnouncement.mutateAsync({
          id: editingAnnouncement.id,
          data: payload,
        });
        toast.success("Pengumuman berhasil diperbarui");
      } else {
        await createAnnouncement.mutateAsync(payload);
        toast.success("Pengumuman berhasil dibuat");
      }
      setShowDialog(false);
      resetForm();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Gagal menyimpan pengumuman",
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus pengumuman ini?")) return;

    try {
      await deleteAnnouncement.mutateAsync(id);
      toast.success("Pengumuman berhasil dihapus");
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Gagal menghapus pengumuman",
      );
    }
  };

  const toggleRole = (role: string) => {
    setForm((prev) => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter((r) => r !== role)
        : [...prev.targetRoles, role],
    }));
  };

  const filteredAnnouncements = announcements.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.content.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getPriorityBadge = (priority: number) => {
    const option = PRIORITY_OPTIONS.find((o) => o.value === priority);
    return (
      <Badge className={option?.color || "bg-gray-500"}>
        {option?.label || "Normal"}
      </Badge>
    );
  };

  const getPriorityIcon = (priority: number) => {
    switch (priority) {
      case 2:
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 1:
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const isAdmin =
    getEffectiveRole(user) === "SUPER_ADMIN" ||
    getEffectiveRole(user) === "UNIT_ADMIN";

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Pengumuman
          </h1>
          <p className="text-muted-foreground">
            Informasi dan pengumuman terbaru
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari pengumuman..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {isAdmin && (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Buat Baru
            </Button>
          )}
        </div>
      </div>

      {/* Stats for Admin */}
      {isAdmin && stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Pengumuman
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktif</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mendesak</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {stats.urgent}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bulan Ini</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.thisMonth}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Announcements List */}
      <div className="space-y-4">
        {filteredAnnouncements.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">Tidak ada pengumuman</h3>
              <p className="text-muted-foreground mt-2">
                {searchQuery
                  ? "Tidak ada pengumuman yang sesuai dengan pencarian Anda"
                  : "Belum ada pengumuman yang tersedia"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredAnnouncements.map((announcement) => (
            <Card
              key={announcement.id}
              className="overflow-hidden hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {getPriorityIcon(announcement.priority)}
                    <div>
                      <CardTitle className="text-lg">
                        {announcement.title}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {announcement.publishedAt
                            ? format(
                                new Date(announcement.publishedAt),
                                "dd MMM yyyy HH:mm",
                                { locale: localeId },
                              )
                            : format(
                                new Date(announcement.createdAt),
                                "dd MMM yyyy",
                                { locale: localeId },
                              )}
                        </span>
                        {announcement.createdBy && (
                          <span>• {announcement.createdBy.name}</span>
                        )}
                        {announcement.unit && (
                          <Badge variant="outline">
                            {announcement.unit.name}
                          </Badge>
                        )}
                        {announcement.targetRoles?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {announcement.targetRoles.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getPriorityBadge(announcement.priority)}
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setViewingAnnouncement(announcement)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Lihat Detail
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenEdit(announcement)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(announcement.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {announcement.content}
                </p>
                {announcement.expiresAt && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Berlaku sampai:{" "}
                    {format(
                      new Date(announcement.expiresAt),
                      "dd MMM yyyy HH:mm",
                      { locale: localeId },
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setShowDialog(open);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? "Edit Pengumuman" : "Buat Pengumuman Baru"}
            </DialogTitle>
            <DialogDescription>
              {editingAnnouncement
                ? "Perbarui informasi pengumuman"
                : "Buat pengumuman baru untuk disampaikan ke pengguna"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Judul*</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Judul pengumuman"
              />
            </div>

            <div className="space-y-2">
              <Label>Konten*</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Isi pengumuman..."
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipe</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
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
                    setForm({ ...form, priority: parseInt(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={String(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tanggal Publish</Label>
                <Input
                  type="datetime-local"
                  value={form.publishedAt}
                  onChange={(e) =>
                    setForm({ ...form, publishedAt: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Berakhir (opsional)</Label>
                <Input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) =>
                    setForm({ ...form, expiresAt: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Audience</Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((option) => (
                  <Badge
                    key={option.value}
                    variant={
                      form.targetRoles.includes(option.value)
                        ? "default"
                        : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => toggleRole(option.value)}
                  >
                    {option.label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Kosongkan untuk semua pengguna
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                createAnnouncement.isPending || updateAnnouncement.isPending
              }
            >
              {createAnnouncement.isPending || updateAnnouncement.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                "Simpan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog
        open={!!viewingAnnouncement}
        onOpenChange={(open) => {
          if (!open) setViewingAnnouncement(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingAnnouncement &&
                getPriorityIcon(viewingAnnouncement.priority)}
              {viewingAnnouncement?.title}
            </DialogTitle>
            <DialogDescription>
              {viewingAnnouncement?.publishedAt && (
                <span>
                  Dipublikasi:{" "}
                  {format(
                    new Date(viewingAnnouncement.publishedAt),
                    "dd MMMM yyyy HH:mm",
                    { locale: localeId },
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {viewingAnnouncement &&
                getPriorityBadge(viewingAnnouncement.priority)}
              <Badge variant="outline">{viewingAnnouncement?.type}</Badge>
              {viewingAnnouncement?.unit && (
                <Badge variant="secondary">
                  {viewingAnnouncement.unit.name}
                </Badge>
              )}
            </div>
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap">
                {viewingAnnouncement?.content}
              </p>
            </div>
            {viewingAnnouncement?.targetRoles &&
              viewingAnnouncement.targetRoles.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <strong>Target:</strong>{" "}
                  {viewingAnnouncement.targetRoles.join(", ")}
                </div>
              )}
            {viewingAnnouncement?.expiresAt && (
              <div className="text-sm text-muted-foreground">
                <strong>Berlaku sampai:</strong>{" "}
                {format(
                  new Date(viewingAnnouncement.expiresAt),
                  "dd MMMM yyyy HH:mm",
                  { locale: localeId },
                )}
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              <strong>Dibuat oleh:</strong>{" "}
              {viewingAnnouncement?.createdBy?.name || "System"}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewingAnnouncement(null)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AnnouncementsPageWithShell() {
  return (
    <MainLayout>
      <AnnouncementsPageContent />
    </MainLayout>
  );
}
