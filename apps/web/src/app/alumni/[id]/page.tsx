"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useParams, useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAlumniDetail,
  useVerifyAlumni,
  useDeleteAlumni,
  useAddAlumniAchievement,
  useDeleteAlumniAchievement,
  ALUMNI_STATUS_LABELS,
  EDUCATION_LEVEL_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  type AlumniStatus,
  type AlumniAchievement,
} from "@/hooks";
import {
  ArrowLeft,
  User,
  Briefcase,
  GraduationCap,
  Award,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Building,
  Edit,
  Trash2,
  CheckCircle,
  Plus,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Linkedin, Instagram, Facebook } from "@/components/icons/social";

import { id as idLocale } from "date-fns/locale";
import Link from "next/link";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth";
import { alumniAccessOf } from "@/lib/alumni-access";

export default function AlumniDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuthStore();
  const { canManage } = alumniAccessOf(user);

  const { data: alumni, isLoading } = useAlumniDetail(id);
  const verifyMutation = useVerifyAlumni();
  const deleteMutation = useDeleteAlumni();
  const addAchievementMutation = useAddAlumniAchievement();
  const deleteAchievementMutation = useDeleteAlumniAchievement();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [deleteAchievementId, setDeleteAchievementId] = useState<string | null>(
    null,
  );

  // Achievement form
  const [achievementTitle, setAchievementTitle] = useState("");
  const [achievementDesc, setAchievementDesc] = useState("");
  const [achievementYear, setAchievementYear] = useState("");
  const [achievementCategory, setAchievementCategory] = useState("");

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!alumni) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Data alumni tidak ditemukan</p>
          <Button variant="link" asChild>
            <Link href="/alumni">Kembali ke daftar</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const handleVerify = async () => {
    try {
      await verifyMutation.mutateAsync(id);
      toast.success("Alumni berhasil diverifikasi");
    } catch {
      toast.error("Gagal memverifikasi alumni");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Data alumni berhasil dihapus");
      router.push("/alumni");
    } catch {
      toast.error("Gagal menghapus data");
    }
  };

  const handleAddAchievement = async () => {
    try {
      const formData = new FormData();
      formData.append("title", achievementTitle);
      formData.append("description", achievementDesc);
      formData.append("year", achievementYear);
      formData.append("category", achievementCategory);

      await addAchievementMutation.mutateAsync({
        alumniId: id,
        data: formData,
      });
      toast.success("Prestasi berhasil ditambahkan");
      setAchievementOpen(false);
      setAchievementTitle("");
      setAchievementDesc("");
      setAchievementYear("");
      setAchievementCategory("");
    } catch {
      toast.error("Gagal menambahkan prestasi");
    }
  };

  const handleDeleteAchievement = async () => {
    if (!deleteAchievementId) return;
    try {
      await deleteAchievementMutation.mutateAsync({
        alumniId: id,
        achievementId: deleteAchievementId,
      });
      toast.success("Prestasi berhasil dihapus");
      setDeleteAchievementId(null);
    } catch {
      toast.error("Gagal menghapus prestasi");
    }
  };

  const getStatusBadge = (status: AlumniStatus) => {
    const colors: Record<AlumniStatus, string> = {
      REGISTERED: "bg-gray-100 text-gray-800",
      VERIFIED: "bg-blue-100 text-blue-800",
      ACTIVE: "bg-green-100 text-green-800",
      INACTIVE: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={colors[status]}>{ALUMNI_STATUS_LABELS[status]}</Badge>
    );
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/alumni">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Avatar className="h-16 w-16">
              <AvatarImage
                src={alumni.photoUrl}
                alt={alumni.name ?? alumni.fullName}
              />
              <AvatarFallback className="text-lg">
                {getInitials(alumni.name ?? alumni.fullName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">
                  {alumni.name ?? alumni.fullName}
                </h1>
                {getStatusBadge(alumni.status)}
              </div>
              <p className="text-muted-foreground">
                Alumni {alumni.graduationYear} · {alumni.unit?.name}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {alumni.status === "REGISTERED" && (
                <Button
                  variant="outline"
                  onClick={handleVerify}
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Verifikasi
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href={`/alumni/${id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus
              </Button>
            </div>
          )}
        </div>

        {/* Quick Info Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <GraduationCap className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tahun Lulus</p>
                  <p className="text-lg font-semibold">
                    {alumni.graduationYear}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Briefcase className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Status Pekerjaan
                  </p>
                  <p className="text-lg font-semibold">
                    {alumni.employmentStatus
                      ? EMPLOYMENT_STATUS_LABELS[alumni.employmentStatus]
                      : "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Building className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pendidikan</p>
                  <p className="text-lg font-semibold">
                    {alumni.currentEducation
                      ? EDUCATION_LEVEL_LABELS[alumni.currentEducation]
                      : "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Award className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Prestasi</p>
                  <p className="text-lg font-semibold">
                    {alumni.achievements?.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="biodata">
          <TabsList>
            <TabsTrigger value="biodata">
              <User className="mr-2 h-4 w-4" />
              Biodata
            </TabsTrigger>
            <TabsTrigger value="career">
              <Briefcase className="mr-2 h-4 w-4" />
              Karir & Pendidikan
            </TabsTrigger>
            <TabsTrigger value="achievements">
              <Award className="mr-2 h-4 w-4" />
              Prestasi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="biodata" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Pribadi</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Nama Lengkap</Label>
                  <p className="font-medium">
                    {alumni.name ?? alumni.fullName}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Jenis Kelamin</Label>
                  <p className="font-medium">
                    {alumni.gender === "MALE" ? "Laki-laki" : "Perempuan"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">
                    Tempat, Tanggal Lahir
                  </Label>
                  <p className="font-medium">
                    {alumni.birthPlace},{" "}
                    {safeFormat(new Date(alumni.birthDate), "d MMMM yyyy", {
                      locale: idLocale,
                    })}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Unit Asal</Label>
                  <p className="font-medium">{alumni.unit?.name || "-"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kontak</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Telepon</p>
                    <p className="font-medium">{alumni.phone || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{alumni.email || "-"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 md:col-span-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Alamat</p>
                    <p className="font-medium">
                      {[alumni.address, alumni.city, alumni.province]
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Media Sosial</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                {alumni.linkedinUrl && (
                  <a
                    href={alumni.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:underline"
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {alumni.instagramUrl && (
                  <a
                    href={alumni.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-pink-600 hover:underline"
                  >
                    <Instagram className="h-4 w-4" />
                    Instagram
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {alumni.facebookUrl && (
                  <a
                    href={alumni.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-700 hover:underline"
                  >
                    <Facebook className="h-4 w-4" />
                    Facebook
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {!alumni.linkedinUrl &&
                  !alumni.instagramUrl &&
                  !alumni.facebookUrl && (
                    <p className="text-muted-foreground">
                      Belum ada media sosial
                    </p>
                  )}
              </CardContent>
            </Card>

            {alumni.bio && (
              <Card>
                <CardHeader>
                  <CardTitle>Bio</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{alumni.bio}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="career" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pekerjaan Saat Ini</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">
                    Status Pekerjaan
                  </Label>
                  <p className="font-medium">
                    {alumni.employmentStatus
                      ? EMPLOYMENT_STATUS_LABELS[alumni.employmentStatus]
                      : "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Jabatan</Label>
                  <p className="font-medium">
                    {alumni.position || alumni.currentOccupation || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Perusahaan</Label>
                  <p className="font-medium">
                    {alumni.companyName || alumni.currentCompany || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Industri</Label>
                  <p className="font-medium">{alumni.industry || "-"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Kota</Label>
                  <p className="font-medium">
                    {alumni.workCity || alumni.currentCity || "-"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pendidikan Lanjutan</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Jenjang</Label>
                  <p className="font-medium">
                    {alumni.currentEducation
                      ? EDUCATION_LEVEL_LABELS[alumni.currentEducation]
                      : "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Institusi</Label>
                  <p className="font-medium">
                    {alumni.educationInstitution || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Jurusan</Label>
                  <p className="font-medium">{alumni.educationMajor || "-"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Tahun</Label>
                  <p className="font-medium">{alumni.educationYear || "-"}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Daftar Prestasi</h3>
              {canManage && (
                <Button onClick={() => setAchievementOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Prestasi
                </Button>
              )}
            </div>

            {alumni.achievements?.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {alumni.achievements.map((achievement) => (
                  <Card key={achievement.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">
                            {achievement.title}
                          </CardTitle>
                          <CardDescription>
                            {achievement.category}
                          </CardDescription>
                        </div>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setDeleteAchievementId(achievement.id)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {achievement.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {achievement.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {achievement.year}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Belum ada data prestasi
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Alumni Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Alumni</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus data alumni ini? Tindakan ini
              tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Achievement Dialog */}
      <Dialog open={achievementOpen} onOpenChange={setAchievementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Prestasi</DialogTitle>
            <DialogDescription>
              Masukkan detail prestasi alumni
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Judul Prestasi *</Label>
              <Input
                value={achievementTitle}
                onChange={(e) => setAchievementTitle(e.target.value)}
                placeholder="Juara 1 Lomba Pidato"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Kategori *</Label>
                <Input
                  value={achievementCategory}
                  onChange={(e) => setAchievementCategory(e.target.value)}
                  placeholder="Akademik, Olahraga, dll"
                />
              </div>
              <div className="space-y-2">
                <Label>Tahun *</Label>
                <Input
                  type="number"
                  value={achievementYear}
                  onChange={(e) => setAchievementYear(e.target.value)}
                  placeholder="2024"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Textarea
                value={achievementDesc}
                onChange={(e) => setAchievementDesc(e.target.value)}
                placeholder="Detail prestasi"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAchievementOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleAddAchievement}
              disabled={
                !achievementTitle ||
                !achievementCategory ||
                !achievementYear ||
                addAchievementMutation.isPending
              }
            >
              {addAchievementMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Achievement Dialog */}
      <Dialog
        open={!!deleteAchievementId}
        onOpenChange={() => setDeleteAchievementId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Prestasi</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus prestasi ini?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteAchievementId(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAchievement}
              disabled={deleteAchievementMutation.isPending}
            >
              {deleteAchievementMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
