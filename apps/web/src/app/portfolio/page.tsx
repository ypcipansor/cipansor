"use client";
import { MainLayout } from "@/components/layout";

/**
 * Portfolio Page - Digital Student Portfolio
 *
 * Halaman manajemen portofolio digital siswa
 * Kategori: Akademik, P5, Ekstrakurikuler, Prestasi, Seni, Tahfidz
 */
import { useState } from "react";
import { authFileUrl } from "@/lib/files";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import {
  usePortfolios,
  usePortfolioTypes,
  usePortfolioStatistics,
  useCreatePortfolio,
  useDeletePortfolio,
  type Portfolio,
} from "@/hooks/use-portfolio";
import { useStudents } from "@/hooks/use-students";
import { useUnits } from "@/hooks/use-units";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  FolderOpen,
  Plus,
  Trash2,
  Eye,
  Star,
  Globe,
  FileText,
  MessageSquare,
  Search,
  BookOpen,
  Target,
  Medal,
  Trophy,
  Palette,
  BookMarked,
  Folder,
  TrendingUp,
} from "lucide-react";

import { id as localeId } from "date-fns/locale";
import { toast } from "sonner";

const typeIcons: Record<string, React.ReactNode> = {
  ACADEMIC: <BookOpen className="h-4 w-4" />,
  P5_PROJECT: <Target className="h-4 w-4" />,
  EXTRACURRICULAR: <Medal className="h-4 w-4" />,
  ACHIEVEMENT: <Trophy className="h-4 w-4" />,
  ARTWORK: <Palette className="h-4 w-4" />,
  TAHFIDZ: <BookMarked className="h-4 w-4" />,
  OTHER: <Folder className="h-4 w-4" />,
};

const typeColors: Record<string, string> = {
  ACADEMIC: "bg-blue-100 text-blue-700",
  P5_PROJECT: "bg-green-100 text-green-700",
  EXTRACURRICULAR: "bg-purple-100 text-purple-700",
  ACHIEVEMENT: "bg-amber-100 text-amber-700",
  ARTWORK: "bg-pink-100 text-pink-700",
  TAHFIDZ: "bg-emerald-100 text-emerald-700",
  OTHER: "bg-gray-100 text-gray-700",
};

function PortfolioPageContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<string>(user?.unitId || "");
  const [selectedType, setSelectedType] = useState<string>("");

  // Queries
  const { data: typesData } = usePortfolioTypes();
  const { data: unitsData } = useUnits();
  const { data: yearsData } = useAcademicYears();
  const { data: studentsData } = useStudents({
    unitId: selectedUnit || undefined,
    limit: 100,
  });
  const { data: portfoliosData, isLoading } = usePortfolios({
    unitId: selectedUnit && selectedUnit !== "ALL" ? selectedUnit : undefined,
    type: selectedType && selectedType !== "ALL" ? selectedType : undefined,
    search: searchQuery || undefined,
  });
  const { data: stats } = usePortfolioStatistics({
    unitId: selectedUnit || undefined,
  });

  // Mutations
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();

  // Form state
  const [formData, setFormData] = useState({
    studentId: "",
    title: "",
    type: "ACADEMIC" as string,
    category: "",
    description: "",
    reflection: "",
    academicYearId: "",
    isPublic: false,
    isShowcase: false,
  });

  const handleOpenDialog = () => {
    setFormData({
      studentId: "",
      title: "",
      type: "ACADEMIC",
      category: "",
      description: "",
      reflection: "",
      academicYearId: yearsData?.data?.find((y: any) => y.isActive)?.id || "",
      isPublic: false,
      isShowcase: false,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createPortfolio.mutateAsync(formData);
      toast.success("Portfolio berhasil dibuat");
      setIsDialogOpen(false);
      router.push(`/portfolio/${result.id}`);
    } catch (error) {
      toast.error("Gagal membuat portfolio");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus portfolio ini?")) return;
    try {
      await deletePortfolio.mutateAsync(id);
      toast.success("Portfolio berhasil dihapus");
    } catch (error) {
      toast.error("Gagal menghapus portfolio");
    }
  };

  const selectedCategories =
    typesData?.categories?.[
      formData.type as keyof typeof typesData.categories
    ] || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" />
            Portofolio Siswa
          </h1>
          <p className="text-muted-foreground mt-1">
            Kumpulan karya dan prestasi siswa
          </p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Tambah Portfolio
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Showcase</CardTitle>
            <Star className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {stats?.showcaseCount || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reviewed</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.reviewedCount || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Rata-rata Nilai
            </CardTitle>
            <Trophy className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats?.averageScore?.toFixed(1) || "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Per Tipe</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {Object.entries(stats?.byType || {})
                .slice(0, 3)
                .map(([type, count]) => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type}: {count as number}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari portfolio..."
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Unit</SelectItem>
                {unitsData?.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Tipe</SelectItem>
                {typesData?.types?.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : portfoliosData?.data?.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <FolderOpen className="h-12 w-12" />
              <p>Belum ada portfolio</p>
              <Button onClick={handleOpenDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Portfolio
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {portfoliosData?.data?.map((portfolio: Portfolio) => (
            <Card
              key={portfolio.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/portfolio/${portfolio.id}`)}
            >
              {/* Cover Image */}
              <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 relative">
                {portfolio.files?.[0]?.fileUrl && (
                  <img
                    src={authFileUrl(portfolio.files[0].fileUrl)}
                    alt={portfolio.title}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  {portfolio.isShowcase && (
                    <Badge className="bg-amber-500 text-white">
                      <Star className="h-3 w-3 mr-1" />
                      Showcase
                    </Badge>
                  )}
                  {portfolio.isPublic && (
                    <Badge variant="secondary">
                      <Globe className="h-3 w-3" />
                    </Badge>
                  )}
                </div>
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={typeColors[portfolio.type]}>
                    {typeIcons[portfolio.type]}
                    <span className="ml-1">
                      {typesData?.types?.find((t) => t.value === portfolio.type)
                        ?.label || portfolio.type}
                    </span>
                  </Badge>
                </div>
                <CardTitle className="text-lg line-clamp-1">
                  {portfolio.title}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {portfolio.description || "Tidak ada deskripsi"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium">
                    {portfolio.student?.user?.name}
                  </span>
                  <span>•</span>
                  <span>{portfolio.student?.unit?.name}</span>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-3">
                <div className="flex justify-between items-center w-full text-sm text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {portfolio._count?.files || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {portfolio._count?.comments || 0}
                    </span>
                  </div>
                  <span>
                    {safeFormat(new Date(portfolio.createdAt), "d MMM yyyy", {
                      locale: localeId,
                    })}
                  </span>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Portfolio Baru</DialogTitle>
            <DialogDescription>
              Tambahkan karya atau prestasi siswa ke dalam portofolio
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Siswa</Label>
                <Select
                  value={formData.studentId}
                  onValueChange={(v) =>
                    setFormData({ ...formData, studentId: v })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Siswa" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentsData?.data?.map((student: any) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.user?.name} ({student.nisn})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Judul</Label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Judul portfolio..."
                  required
                />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipe</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) =>
                      setFormData({ ...formData, type: v, category: "" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typesData?.types?.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) =>
                      setFormData({ ...formData, category: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedCategories.map((cat: string) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Deskripsi</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Deskripsi karya..."
                />
              </div>
              <div className="space-y-2">
                <Label>Refleksi Siswa</Label>
                <Textarea
                  value={formData.reflection}
                  onChange={(e) =>
                    setFormData({ ...formData, reflection: e.target.value })
                  }
                  placeholder="Apa yang dipelajari dari karya ini..."
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isPublic}
                    onCheckedChange={(v) =>
                      setFormData({ ...formData, isPublic: v })
                    }
                  />
                  <Label className="text-sm">Publik</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isShowcase}
                    onCheckedChange={(v) =>
                      setFormData({ ...formData, isShowcase: v })
                    }
                  />
                  <Label className="text-sm">Showcase</Label>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={createPortfolio.isPending}>
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PortfolioPageWithShell() {
  return (
    <MainLayout>
      <PortfolioPageContent />
    </MainLayout>
  );
}
