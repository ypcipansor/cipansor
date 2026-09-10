"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Award,
  User,
  Calendar,
  Edit,
  Trash2,
  Loader2,
  Star,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useReward,
  useDeleteReward,
  REWARD_CATEGORIES,
  RewardCategory,
} from "@/hooks/use-rewards";

function getCategoryBadge(category: RewardCategory) {
  const cat = REWARD_CATEGORIES.find((c) => c.value === category);
  return (
    <Badge variant="outline" className={cat?.color}>
      {cat?.label || category}
    </Badge>
  );
}

function RewardDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: reward, isLoading } = useReward(id);
  const deleteMutation = useDeleteReward();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Penghargaan berhasil dihapus");
      router.push("/rewards");
    } catch {
      toast.error("Gagal menghapus penghargaan");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!reward) {
    return (
      <div className="text-center py-12">
        <Award className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">
          Data penghargaan tidak ditemukan
        </p>
        <Button variant="link" asChild>
          <Link href="/rewards">Kembali ke daftar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/rewards">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Detail Penghargaan</h1>
              {reward.rewardType &&
                getCategoryBadge(reward.rewardType.category)}
            </div>
            <p className="text-muted-foreground">
              {safeFormat(new Date(reward.date), "d MMMM yyyy", {
                locale: localeId,
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/rewards/${id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Hapus
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Informasi Santri */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informasi Santri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-lg">
                  {reward.student?.name || "-"}
                </p>
                <p className="text-sm text-muted-foreground">
                  NISN: {reward.student?.nisn || "-"}
                </p>
              </div>
            </div>
            {reward.student?.class && (
              <div className="text-sm">
                <span className="text-muted-foreground">Kelas:</span>{" "}
                <span className="font-medium">{reward.student.class.name}</span>
              </div>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/students/${reward.studentId}`}>
                Lihat Profil Santri
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Jenis Penghargaan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Jenis Penghargaan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-semibold text-lg">
                {reward.rewardType?.name || "-"}
              </p>
              {reward.rewardType?.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {reward.rewardType.description}
                </p>
              )}
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Kategori</p>
                {reward.rewardType &&
                  getCategoryBadge(reward.rewardType.category)}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Poin</p>
                <p className="text-2xl font-bold text-green-600">
                  +{reward.rewardType?.points || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Informasi Waktu */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Informasi Waktu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Tanggal Pemberian</p>
              <p className="font-medium">
                {safeFormat(new Date(reward.date), "EEEE, d MMMM yyyy", {
                  locale: localeId,
                })}
              </p>
            </div>
            {reward.givenBy && (
              <div>
                <p className="text-sm text-muted-foreground">Diberikan Oleh</p>
                <p className="font-medium">{reward.givenBy.name}</p>
              </div>
            )}
            {reward.createdAt && (
              <div>
                <p className="text-sm text-muted-foreground">Dicatat</p>
                <p className="text-sm">
                  {safeFormat(
                    new Date(reward.createdAt),
                    "d MMMM yyyy, HH:mm",
                    {
                      locale: localeId,
                    },
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Poin Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Ringkasan Poin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 border border-green-200">
              <div>
                <p className="text-sm text-green-700">Poin Diperoleh</p>
                <p className="text-3xl font-bold text-green-600">
                  +{reward.rewardType?.points || 0}
                </p>
              </div>
              <Award className="h-12 w-12 text-green-500" />
            </div>
            {reward.student?.totalRewardPoints !== undefined && (
              <div className="text-sm">
                <span className="text-muted-foreground">
                  Total Poin Penghargaan Santri:
                </span>{" "}
                <span className="font-semibold text-green-600">
                  {reward.student.totalRewardPoints} poin
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Keterangan */}
      {reward.description && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Keterangan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{reward.description}</p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus Penghargaan"
        description="Apakah Anda yakin ingin menghapus data penghargaan ini? Tindakan ini tidak dapat dibatalkan."
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

export default function RewardDetailPage() {
  return (
    <MainLayout>
      <RewardDetailPageContent />
    </MainLayout>
  );
}
