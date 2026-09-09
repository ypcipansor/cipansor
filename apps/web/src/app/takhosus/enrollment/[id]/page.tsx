"use client";
import { use, useState } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";

import { id as localeId } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Users,
  Calendar,
  Pencil,
  Plus,
  Check,
  Award,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEnrollment,
  useStudentProgress,
  useCreateSanad,
  TAKHOSUS_STATUSES,
  SANAD_GRADES,
  TakhosusStatus,
} from "@/hooks/use-takhosus";
import { useUsers } from "@/hooks/use-users";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MurojaahList } from "@/components/takhosus/murojaah/murojaah-list";
import { SimaanList } from "@/components/takhosus/simaan/simaan-list";

interface EnrollmentDetailPageProps {
  params: Promise<{ id: string }>;
}

const sanadFormSchema = z.object({
  juz: z.coerce.number().min(1, "Juz minimal 1").max(30, "Juz maksimal 30"),
  teacherId: z.string().min(1, "Penguji wajib dipilih"),
  grade: z.string().min(1, "Nilai wajib dipilih"),
  notes: z.string().optional(),
});

type SanadFormValues = z.infer<typeof sanadFormSchema>;

export default function EnrollmentDetailPage({
  params,
}: EnrollmentDetailPageProps) {
  const { id } = use(params);
  const [sanadDialogOpen, setSanadDialogOpen] = useState(false);

  const { data: enrollment, isLoading: enrollmentLoading } = useEnrollment(id);
  const { data: progress, isLoading: progressLoading } = useStudentProgress(
    enrollment?.studentId || "",
  );
  const { data: usersData } = useUsers({ role: "TEACHER", limit: 100 });
  const createSanad = useCreateSanad();

  const teachers = usersData?.data || [];

  const form = useForm<SanadFormValues>({
    resolver: zodResolver(sanadFormSchema),
    defaultValues: {
      juz: 1,
      teacherId: "",
      grade: "",
      notes: "",
    },
  });

  const getStatusBadge = (status: TakhosusStatus) => {
    const config = TAKHOSUS_STATUSES.find((s) => s.value === status);
    return (
      <Badge variant="secondary" className={config?.color}>
        {config?.label || status}
      </Badge>
    );
  };

  const getGradeBadge = (grade: string) => {
    const config = SANAD_GRADES.find((g) => g.value === grade);
    return (
      <Badge variant="secondary" className={config?.color}>
        {grade}
      </Badge>
    );
  };

  const onSubmitSanad = async (data: SanadFormValues) => {
    if (!enrollment) return;
    try {
      await createSanad.mutateAsync({
        enrollmentId: enrollment.id,
        ...data,
      });
      toast.success(`Sanad Juz ${data.juz} berhasil ditambahkan`);
      setSanadDialogOpen(false);
      form.reset();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menambahkan sanad";
      toast.error(errorMessage);
    }
  };

  if (enrollmentLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </MainLayout>
    );
  }

  if (!enrollment) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Pendaftaran Tidak Ditemukan
          </h2>
          <p className="text-muted-foreground mb-4">
            Data pendaftaran yang Anda cari tidak ditemukan
          </p>
          <Button asChild>
            <Link href="/takhosus">Kembali ke Takhosus</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/takhosus">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {enrollment.student?.user.name || "Santri Takhosus"}
            </h1>
            <p className="text-muted-foreground">
              {enrollment.halaqoh?.name} • {enrollment.halaqoh?.code}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/takhosus/enrollment/${id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Target</span>
            </div>
            <p className="text-2xl font-bold">{enrollment.targetJuz} Juz</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Selesai</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {enrollment.completedJuz} Juz
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Sanad</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {enrollment.sanadCount || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Status</span>
            </div>
            <div className="mt-1">{getStatusBadge(enrollment.status)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Progress Hafalan</CardTitle>
          <CardDescription>
            {enrollment.completedJuz} dari {enrollment.targetJuz} juz selesai (
            {enrollment.progressPercentage || 0}%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress
            value={enrollment.progressPercentage || 0}
            className="h-4"
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="progress" className="mb-6">
        <TabsList>
          <TabsTrigger value="progress">Progress & Sanad</TabsTrigger>
          <TabsTrigger value="murojaah">Riwayat Murojaah</TabsTrigger>
          <TabsTrigger value="simaan">Riwayat Simaan</TabsTrigger>
        </TabsList>

        <TabsContent value="progress">
          {/* Juz Progress Grid */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pencapaian Per Juz</CardTitle>
                <CardDescription>
                  Klik juz yang belum bersanad untuk menambahkan sanad
                </CardDescription>
              </div>
              <Dialog open={sanadDialogOpen} onOpenChange={setSanadDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Sanad
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Sanad</DialogTitle>
                    <DialogDescription>
                      Catat sanad juz yang telah lulus ujian
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(onSubmitSanad)}
                      className="space-y-4"
                    >
                      <FormField
                        control={form.control}
                        name="juz"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Juz</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={30}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="teacherId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Penguji</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih penguji" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {teachers.map((teacher) => (
                                  <SelectItem
                                    key={teacher.id}
                                    value={teacher.id}
                                  >
                                    {teacher.name}
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
                        name="grade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nilai</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih nilai" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {SANAD_GRADES.map((grade) => (
                                  <SelectItem
                                    key={grade.value}
                                    value={grade.value}
                                  >
                                    {grade.label}
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
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Catatan</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Catatan tambahan..."
                                className="resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setSanadDialogOpen(false)}
                        >
                          Batal
                        </Button>
                        <Button type="submit" disabled={createSanad.isPending}>
                          {createSanad.isPending
                            ? "Menyimpan..."
                            : "Simpan Sanad"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {progressLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-6 md:grid-cols-10 gap-2">
                  {progress?.juzProgress?.map((juz) => (
                    <button
                      key={juz.juz}
                      onClick={() => {
                        if (!juz.certified) {
                          form.setValue("juz", juz.juz);
                          setSanadDialogOpen(true);
                        }
                      }}
                      className={cn(
                        "aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-medium transition-colors",
                        juz.certified
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 cursor-pointer",
                      )}
                      title={
                        juz.certified
                          ? `Juz ${juz.juz} - ${juz.grade} (${juz.teacherName})`
                          : `Juz ${juz.juz} - Belum bersanad`
                      }
                    >
                      <span className="text-lg font-bold">{juz.juz}</span>
                      {juz.certified && <Check className="h-3 w-3 mt-0.5" />}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          {progress?.recentActivity && progress.recentActivity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Aktivitas Terakhir</CardTitle>
                <CardDescription>
                  Riwayat setoran dan murajaah terbaru
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {progress.recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between border-b pb-3 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{activity.surah}</p>
                        <p className="text-sm text-muted-foreground">
                          Ayat {activity.ayahStart} - {activity.ayahEnd} •{" "}
                          {activity.type}
                        </p>
                      </div>
                      <div className="text-right">
                        {activity.score && (
                          <Badge variant="secondary">{activity.score}</Badge>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {safeFormat(
                            new Date(activity.recordedAt),
                            "d MMM yyyy",
                            {
                              locale: localeId,
                            },
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="murojaah">
          <Card>
            <CardContent className="pt-6">
              {enrollment?.studentId && (
                <MurojaahList
                  studentId={enrollment.studentId}
                  showStudentName={false}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simaan">
          <Card>
            <CardContent className="pt-6">
              {enrollment?.studentId && (
                <SimaanList
                  studentId={enrollment.studentId}
                  showStudentName={false}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
