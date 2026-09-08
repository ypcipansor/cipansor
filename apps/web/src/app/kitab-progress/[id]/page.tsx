"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Users,
  BookOpen,
  Award,
  Calendar,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Download,
  GraduationCap,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

import {
  useKitabDetail,
  useKitabProgresses,
  useDeleteKitab,
  useUpdateProgress,
  useMarkCompleted,
  KITAB_CATEGORY_LABELS,
  KITAB_LEVEL_LABELS,
  KITAB_LEVEL_COLORS,
  PROGRESS_STATUS_LABELS,
  PROGRESS_STATUS_COLORS,
  getCategoryIcon,
  getProgressPercentage,
  formatScore,
  type KitabProgress,
  type ProgressStatus,
} from "@/hooks/use-kitab-progress";

export default function KitabDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kitabId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedProgress, setSelectedProgress] =
    useState<KitabProgress | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProgressStatus | "ALL">(
    "ALL",
  );
  const [search, setSearch] = useState("");

  const {
    data: kitab,
    isLoading: kitabLoading,
    error: kitabError,
  } = useKitabDetail(kitabId);
  const { data: progressData, isLoading: progressLoading } = useKitabProgresses(
    {
      kitabId,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
    },
  );

  const deleteMutation = useDeleteKitab();
  const updateProgressMutation = useUpdateProgress();
  const markCompletedMutation = useMarkCompleted();

  const progresses = progressData?.data || [];

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(kitabId);
      toast.success("Kitab berhasil dihapus");
      router.push("/kitab-progress");
    } catch {
      toast.error("Gagal menghapus kitab");
    }
  };

  const handleUpdateProgress = async (data: {
    studentId: string;
    currentPage?: number;
    currentChapter?: number;
    status?: ProgressStatus;
    score?: number;
    notes?: string;
  }) => {
    try {
      await updateProgressMutation.mutateAsync({
        kitabId,
        ...data,
      });
      toast.success("Progress berhasil diperbarui");
      setProgressDialogOpen(false);
      setSelectedProgress(null);
    } catch {
      toast.error("Gagal memperbarui progress");
    }
  };

  const handleMarkCompleted = async (
    studentId: string,
    score?: number,
    notes?: string,
  ) => {
    try {
      await markCompletedMutation.mutateAsync({
        kitabId,
        studentId,
        score,
        notes,
      });
      toast.success("Santri berhasil ditandai khatam");
    } catch {
      toast.error("Gagal menandai khatam");
    }
  };

  // Calculate stats
  const stats = {
    total: progresses.length,
    notStarted: progresses.filter((p) => p.status === "NOT_STARTED").length,
    inProgress: progresses.filter((p) => p.status === "IN_PROGRESS").length,
    completed: progresses.filter((p) => p.status === "COMPLETED").length,
    averageScore: progresses
      .filter((p) => p.score)
      .reduce((acc, p, _, arr) => acc + (p.score || 0) / arr.length, 0),
  };

  if (kitabLoading) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (kitabError || !kitab) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground mb-4">Kitab tidak ditemukan</p>
          <Button asChild>
            <Link href="/kitab-progress">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/kitab-progress">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{getCategoryIcon(kitab.category)}</span>
            <div>
              <h1 className="text-2xl font-bold">{kitab.title}</h1>
              {kitab.author && (
                <p className="text-muted-foreground">{kitab.author}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/kitab-progress/${kitabId}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/kitab-progress/${kitabId}/assign`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Santri
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="h-4 w-4 mr-2" />
                Export Progress
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Hapus Kitab
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Kitab Info */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <BookOpen className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kategori</p>
                <p className="font-medium">
                  {KITAB_CATEGORY_LABELS[kitab.category]}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <GraduationCap className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Level</p>
                <Badge className={KITAB_LEVEL_COLORS[kitab.level]}>
                  {KITAB_LEVEL_LABELS[kitab.level]}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Santri</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Award className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Khatam</p>
                <p className="text-2xl font-bold">
                  {stats.completed}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    (
                    {stats.total > 0
                      ? ((stats.completed / stats.total) * 100).toFixed(0)
                      : 0}
                    %)
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Info */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Halaman</p>
              <p className="font-medium">
                {kitab.totalPages ? `${kitab.totalPages} halaman` : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bab</p>
              <p className="font-medium">
                {kitab.totalChapters ? `${kitab.totalChapters} bab` : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unit</p>
              <p className="font-medium">{kitab.unit?.name || "-"}</p>
            </div>
          </div>
          {kitab.description && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">Deskripsi</p>
              <p className="mt-1">{kitab.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Tabs */}
      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">
            <Users className="h-4 w-4 mr-2" />
            Progress Santri ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="completed">
            <Award className="h-4 w-4 mr-2" />
            Khatam ({stats.completed})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="mt-4">
          {/* Filters */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari santri..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) =>
                    setStatusFilter(v as typeof statusFilter)
                  }
                >
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Status</SelectItem>
                    <SelectItem value="NOT_STARTED">Belum Dimulai</SelectItem>
                    <SelectItem value="IN_PROGRESS">
                      Sedang Dipelajari
                    </SelectItem>
                    <SelectItem value="COMPLETED">Khatam</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Progress Table */}
          <Card>
            {progressLoading ? (
              <CardContent className="p-4">
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </CardContent>
            ) : progresses.length === 0 ? (
              <CardContent className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Belum Ada Santri</h3>
                <p className="text-muted-foreground mb-4">
                  Belum ada santri yang mempelajari kitab ini
                </p>
                <Button asChild>
                  <Link href={`/kitab-progress/${kitabId}/assign`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Santri
                  </Link>
                </Button>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Santri</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-center">Nilai</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progresses.map((progress) => {
                    const percentage = getProgressPercentage(progress, kitab);
                    const studentClass =
                      progress.student?.classEnrollment?.[0]?.class;

                    return (
                      <TableRow key={progress.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {progress.student?.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {progress.student?.nisn}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{studentClass?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge
                            className={PROGRESS_STATUS_COLORS[progress.status]}
                          >
                            {PROGRESS_STATUS_LABELS[progress.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-32">
                            <div className="flex justify-between text-xs mb-1">
                              <span>
                                {progress.currentPage && kitab.totalPages
                                  ? `${progress.currentPage}/${kitab.totalPages}`
                                  : progress.currentChapter &&
                                      kitab.totalChapters
                                    ? `Bab ${progress.currentChapter}/${kitab.totalChapters}`
                                    : "-"}
                              </span>
                              <span>{percentage}%</span>
                            </div>
                            <Progress value={percentage} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {formatScore(progress.score)}
                        </TableCell>
                        <TableCell>
                          {progress.startedAt
                            ? format(
                                new Date(progress.startedAt),
                                "dd MMM yyyy",
                                {
                                  locale: idLocale,
                                },
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedProgress(progress);
                                  setProgressDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Update Progress
                              </DropdownMenuItem>
                              {progress.status !== "COMPLETED" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleMarkCompleted(progress.studentId)
                                  }
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Tandai Khatam
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/students/${progress.studentId}/kitab`}
                                >
                                  <GraduationCap className="h-4 w-4 mr-2" />
                                  Lihat Semua Kitab
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Santri yang Sudah Khatam
              </CardTitle>
              <CardDescription>
                Daftar santri yang telah menyelesaikan kitab {kitab.title}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {progresses.filter((p) => p.status === "COMPLETED").length ===
              0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Belum ada santri yang khatam kitab ini
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {progresses
                    .filter((p) => p.status === "COMPLETED")
                    .map((progress) => (
                      <Card
                        key={progress.id}
                        className="bg-green-50 border-green-200"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-full">
                              <Award className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">
                                {progress.student?.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {progress.student?.nisn}
                              </p>
                            </div>
                            {progress.score && (
                              <div className="text-right">
                                <p className="text-2xl font-bold text-green-600">
                                  {progress.score}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Nilai
                                </p>
                              </div>
                            )}
                          </div>
                          {progress.completedAt && (
                            <p className="text-xs text-muted-foreground mt-3">
                              Khatam:{" "}
                              {format(
                                new Date(progress.completedAt),
                                "dd MMMM yyyy",
                                {
                                  locale: idLocale,
                                },
                              )}
                            </p>
                          )}
                          {progress.notes && (
                            <p className="text-sm mt-2 p-2 bg-white rounded">
                              {progress.notes}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Kitab?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Semua data progress santri
              terkait kitab &quot;{kitab.title}&quot; akan ikut terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Progress Dialog */}
      <UpdateProgressDialog
        open={progressDialogOpen}
        onOpenChange={setProgressDialogOpen}
        progress={selectedProgress}
        kitab={kitab}
        onSubmit={handleUpdateProgress}
        isLoading={updateProgressMutation.isPending}
      />
    </MainLayout>
  );
}

// Update Progress Dialog Component
function UpdateProgressDialog({
  open,
  onOpenChange,
  progress,
  kitab,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: KitabProgress | null;
  kitab: any;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [currentPage, setCurrentPage] = useState("");
  const [currentChapter, setCurrentChapter] = useState("");
  const [status, setStatus] = useState<ProgressStatus>("IN_PROGRESS");
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");

  // Reset form when progress changes
  useState(() => {
    if (progress) {
      setCurrentPage(progress.currentPage?.toString() || "");
      setCurrentChapter(progress.currentChapter?.toString() || "");
      setStatus(progress.status);
      setScore(progress.score?.toString() || "");
      setNotes(progress.notes || "");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!progress) return;

    onSubmit({
      studentId: progress.studentId,
      currentPage: currentPage ? parseInt(currentPage) : undefined,
      currentChapter: currentChapter ? parseInt(currentChapter) : undefined,
      status,
      score: score ? parseFloat(score) : undefined,
      notes: notes || undefined,
    });
  };

  if (!progress) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Progress</DialogTitle>
          <DialogDescription>
            Update progress {progress.student?.name} untuk kitab {kitab?.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {kitab?.totalPages && (
                <div>
                  <Label htmlFor="currentPage">Halaman</Label>
                  <Input
                    id="currentPage"
                    type="number"
                    min={0}
                    max={kitab.totalPages}
                    value={currentPage}
                    onChange={(e) => setCurrentPage(e.target.value)}
                    placeholder={`Maks ${kitab.totalPages}`}
                  />
                </div>
              )}
              {kitab?.totalChapters && (
                <div>
                  <Label htmlFor="currentChapter">Bab</Label>
                  <Input
                    id="currentChapter"
                    type="number"
                    min={0}
                    max={kitab.totalChapters}
                    value={currentChapter}
                    onChange={(e) => setCurrentChapter(e.target.value)}
                    placeholder={`Maks ${kitab.totalChapters}`}
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ProgressStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">
                    <span className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-gray-500" />
                      Belum Dimulai
                    </span>
                  </SelectItem>
                  <SelectItem value="IN_PROGRESS">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      Sedang Dipelajari
                    </span>
                  </SelectItem>
                  <SelectItem value="COMPLETED">
                    <span className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Khatam
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="score">Nilai (0-100)</Label>
              <Input
                id="score"
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Opsional"
              />
            </div>

            <div>
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan dari ustadz/musyrif..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
