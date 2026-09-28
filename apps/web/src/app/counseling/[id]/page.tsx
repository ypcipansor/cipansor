"use client";
import { use, useState } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Shield,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  MessageSquare,
  Lock,
  Send,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import {
  useCounselingRecord,
  useDeleteCounselingRecord,
  getCounselingCategoryConfig,
  getCounselingStatusConfig,
  getCounselingPriorityConfig,
  REFERRAL_TYPE_LABELS,
} from "@/hooks/use-counseling";

interface CounselingDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function CounselingDetailPage({
  params,
}: CounselingDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const { data: record, isLoading, error } = useCounselingRecord(id);
  const deleteMutation = useDeleteCounselingRecord();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !record) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <AlertCircle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Gagal Memuat Data</h2>
          <p className="text-muted-foreground mb-6">
            Terjadi kesalahan saat mengambil detail konseling atau data tidak
            ditemukan.
          </p>
          <Button asChild>
            <Link href="/counseling">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali ke Daftar
            </Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  // Content withheld: the kepala sekolah on a confidential session.
  const withheld = record.viewerAccess === "REFERRALS_ONLY";
  const tab = activeTab ?? (withheld ? "referrals" : "notes");
  const notes = record.notes ?? [];
  const referrals = record.referrals ?? [];

  const catConfig = getCounselingCategoryConfig(record.category);
  const statusConfig = getCounselingStatusConfig(record.status);
  const priorityConfig = getCounselingPriorityConfig(record.priority);

  const handleDelete = async () => {
    if (!confirm("Yakin ingin menghapus sesi konseling ini?")) return;

    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Sesi konseling berhasil dihapus");
      router.push("/counseling");
    } catch {
      toast.error("Gagal menghapus sesi konseling");
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="Detail Konseling"
        description={`Sesi untuk ${record.student?.user?.name}`}
        backHref="/counseling"
        action={
          !withheld && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/counseling/${id}/edit`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Detail
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus Sesi
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* Main Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{record.title}</CardTitle>
                    {record.isConfidential && (
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-200 bg-amber-50"
                      >
                        <Shield className="h-3 w-3 mr-1" />
                        Rahasia
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    Dibuat pada{" "}
                    {safeFormat(
                      new Date(record.createdAt),
                      "dd MMMM yyyy, HH:mm",
                      { locale: localeId },
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge className={statusConfig?.color}>
                    {statusConfig?.label}
                  </Badge>
                  <Badge className={priorityConfig?.color}>
                    {priorityConfig?.label}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Kategori
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{catConfig?.icon}</span>
                    <span>{catConfig?.label}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Konselor
                  </p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{record.counselor?.user?.name || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Jadwal & Lokasi
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {safeFormat(
                      new Date(record.scheduledAt),
                      "eeee, dd MMMM yyyy",
                      { locale: localeId },
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {safeFormat(new Date(record.scheduledAt), "HH:mm", {
                      locale: localeId,
                    })}
                    {record.duration ? ` (${record.duration} menit)` : ""}
                  </div>
                  {record.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {record.location}
                    </div>
                  )}
                </div>
              </div>

              {withheld ? (
                <div
                  className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                  data-testid="counseling-withheld"
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Isi sesi ini rahasia: hanya konselornya dan guru BK unit ini
                    yang dapat membacanya. Sebagai kepala sekolah, Anda melihat
                    rujukannya.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Deskripsi Masalah
                  </p>
                  <div className="p-4 bg-muted/30 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                    {record.description || "-"}
                  </div>
                </div>
              )}

              {record.summary && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Ringkasan & Hasil
                  </p>
                  <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                    {record.summary}
                  </div>
                </div>
              )}

              {record.recommendations && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Rekomendasi
                  </p>
                  <div className="p-4 bg-green-50/50 border border-green-100 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                    {record.recommendations}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes & Referrals */}
          <Tabs value={tab} onValueChange={setActiveTab}>
            <TabsList>
              {!withheld && (
                <TabsTrigger value="notes">
                  Catatan ({notes.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="referrals">
                Rujukan ({referrals.length})
              </TabsTrigger>
            </TabsList>
            {!withheld && (
              <TabsContent value="notes" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Catatan Konseling
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {notes.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Belum ada catatan.
                      </p>
                    ) : (
                      notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <p className="whitespace-pre-wrap">{note.content}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {note.createdBy?.name ?? "-"} ·{" "}
                            {safeFormat(
                              new Date(note.createdAt),
                              "dd MMM yyyy, HH:mm",
                              { locale: localeId },
                            )}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
            <TabsContent value="referrals" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Rujukan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {referrals.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Belum ada rujukan.
                    </p>
                  ) : (
                    referrals.map((referral) => (
                      <div
                        key={referral.id}
                        className="space-y-1 rounded-lg border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {REFERRAL_TYPE_LABELS[referral.type] ??
                              referral.type}
                          </Badge>
                          <span className="font-medium">
                            {referral.referredTo}
                          </span>
                          {referral.institution && (
                            <span className="text-muted-foreground">
                              · {referral.institution}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{referral.reason}</p>
                        {referral.outcome && (
                          <p className="text-muted-foreground">
                            Hasil: {referral.outcome}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Dirujuk{" "}
                          {safeFormat(
                            new Date(referral.referredAt),
                            "dd MMM yyyy",
                            { locale: localeId },
                          )}
                          {referral.createdBy?.name
                            ? ` oleh ${referral.createdBy.name}`
                            : ""}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          {/* Student Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profil Siswa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{record.student?.user?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {record.student?.nis}
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Kelas</span>
                  <span className="font-medium">
                    {record.student?.currentClass?.name || "-"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Unit</span>
                  <span className="font-medium">
                    {record.unit?.name || "-"}
                  </span>
                </div>
              </div>
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/students/${record.studentId}`}>
                  Lihat Profil Lengkap
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Quick Actions — changes, so not for a withheld session */}
          {!withheld && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aksi Cepat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {record.status === "SCHEDULED" && (
                  <Button className="w-full justify-start" variant="outline">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mulai Sesi
                  </Button>
                )}
                {record.status === "IN_PROGRESS" && (
                  <Button className="w-full justify-start" variant="outline">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Selesaikan Sesi
                  </Button>
                )}
                <Button className="w-full justify-start" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Hubungi Orang Tua
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
