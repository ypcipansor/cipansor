"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
import { useTKReport, useUpdateTKReport } from "@/hooks/use-tk-report";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  ArrowLeft,
  Save,
  AlertCircle,
  User,
  Calendar,
  Clock,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

const SEMESTER_LABELS = {
  GANJIL: "Ganjil",
  GENAP: "Genap",
};

const editReportSchema = z.object({
  narrativeNAM: z.string().optional(),
  narrativeFM: z.string().optional(),
  narrativeKOG: z.string().optional(),
  narrativeBHS: z.string().optional(),
  narrativeSE: z.string().optional(),
  narrativeSNI: z.string().optional(),
  overallStrengths: z.string().optional(),
  parentRecommendations: z.string().optional(),
  height: z.number().optional().nullable(),
  weight: z.number().optional().nullable(),
  presentDays: z.number().min(0),
  sickDays: z.number().min(0),
  excusedDays: z.number().min(0),
  totalDays: z.number().min(0),
});

type EditReportFormData = z.infer<typeof editReportSchema>;

export default function EditTKReportPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;

  const { data: report, isLoading } = useTKReport(reportId);
  const updateMutation = useUpdateTKReport();

  const form = useForm<EditReportFormData>({
    resolver: zodResolver(editReportSchema),
    defaultValues: {
      narrativeNAM: "",
      narrativeFM: "",
      narrativeKOG: "",
      narrativeBHS: "",
      narrativeSE: "",
      narrativeSNI: "",
      overallStrengths: "",
      parentRecommendations: "",
      height: null,
      weight: null,
      presentDays: 0,
      sickDays: 0,
      excusedDays: 0,
      totalDays: 0,
    },
  });

  // Populate form when report loads
  useEffect(() => {
    if (report) {
      form.reset({
        narrativeNAM: report.narrativeNAM || "",
        narrativeFM: report.narrativeFM || "",
        narrativeKOG: report.narrativeKOG || "",
        narrativeBHS: report.narrativeBHS || "",
        narrativeSE: report.narrativeSE || "",
        narrativeSNI: report.narrativeSNI || "",
        overallStrengths: report.overallStrengths || "",
        parentRecommendations: report.parentRecommendations || "",
        height: report.height,
        weight: report.weight,
        presentDays: report.presentDays || 0,
        sickDays: report.sickDays || 0,
        excusedDays: report.excusedDays || 0,
        totalDays: report.totalDays || 0,
      });
    }
  }, [report, form]);

  const onSubmit = async (data: EditReportFormData) => {
    try {
      await updateMutation.mutateAsync({
        id: reportId,
        data: {
          narrativeNAM: data.narrativeNAM,
          narrativeFM: data.narrativeFM,
          narrativeKOG: data.narrativeKOG,
          narrativeBHS: data.narrativeBHS,
          narrativeSE: data.narrativeSE,
          narrativeSNI: data.narrativeSNI,
          overallStrengths: data.overallStrengths,
          parentRecommendations: data.parentRecommendations,
          height: data.height || undefined,
          weight: data.weight || undefined,
          presentDays: data.presentDays,
          sickDays: data.sickDays,
          excusedDays: data.excusedDays,
          totalDays: data.totalDays,
        },
      });
      toast.success("Raport berhasil diperbarui");
      router.push(`/paud/reports/${reportId}`);
    } catch {
      toast.error("Gagal memperbarui raport");
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!report) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Raport Tidak Ditemukan</h2>
          <p className="text-muted-foreground mb-4">
            Raport yang Anda cari tidak ada atau telah dihapus.
          </p>
          <Button onClick={() => router.push("/paud/reports")}>
            Kembali ke Daftar
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (report.status !== "DRAFT") {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="h-16 w-16 text-yellow-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Raport Tidak Dapat Diedit
          </h2>
          <p className="text-muted-foreground mb-4">
            Raport yang sudah difinalisasi atau dicetak tidak dapat diedit.
          </p>
          <Button onClick={() => router.push(`/paud/reports/${reportId}`)}>
            Lihat Detail
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Edit Raport"
          description={`${report.student?.user?.name || "-"} - ${report.academicYear?.name || "-"} - Semester ${SEMESTER_LABELS[report.semester]}`}
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        {/* Student Info Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {report.student?.photoUrl ? (
                <img
                  src={report.student.photoUrl}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <h3 className="font-semibold text-lg">
                  {report.student?.user?.name || "-"}
                </h3>
                <p className="text-muted-foreground">
                  NISN: {report.student?.nisn || "-"}
                </p>
                <p className="text-muted-foreground">
                  {report.student?.enrollments?.[0]?.class?.name || "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="narrative" className="space-y-6">
              <TabsList>
                <TabsTrigger value="narrative">Narasi Perkembangan</TabsTrigger>
                <TabsTrigger value="attendance">Kehadiran</TabsTrigger>
                <TabsTrigger value="physical">Data Fisik</TabsTrigger>
              </TabsList>

              {/* Narrative Tab */}
              <TabsContent value="narrative" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      🕌 Agama & Budi Pekerti
                    </CardTitle>
                    <CardDescription>
                      Narasi perkembangan nilai agama dan moral anak
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="narrativeNAM"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tuliskan narasi perkembangan nilai agama dan moral anak..."
                              rows={6}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      💪 Jati Diri
                    </CardTitle>
                    <CardDescription>
                      Narasi perkembangan sosial emosional dan kemandirian anak
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="narrativeSE"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tuliskan narasi perkembangan sosial emosional anak..."
                              rows={6}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      📚 Literasi & STEAM
                    </CardTitle>
                    <CardDescription>
                      Narasi perkembangan bahasa, literasi, sains, teknologi,
                      seni, dan matematika
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="narrativeBHS"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tuliskan narasi perkembangan literasi dan STEAM anak..."
                              rows={6}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      ✍️ Catatan Guru
                    </CardTitle>
                    <CardDescription>
                      Catatan tambahan dari guru
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="overallStrengths"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tuliskan catatan tambahan..."
                              rows={4}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      💡 Rekomendasi
                    </CardTitle>
                    <CardDescription>
                      Rekomendasi untuk perkembangan anak selanjutnya
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="parentRecommendations"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Tuliskan rekomendasi untuk orang tua..."
                              rows={4}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Attendance Tab */}
              <TabsContent value="attendance" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Data Kehadiran
                    </CardTitle>
                    <CardDescription>
                      Rekap kehadiran siswa selama periode raport
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                      <FormField
                        control={form.control}
                        name="presentDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Hadir</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value) || 0)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="sickDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sakit</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value) || 0)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="excusedDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Izin</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value) || 0)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* absentDays is removed from hook and schema */}

                      <FormField
                        control={form.control}
                        name="totalDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Total Hari</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value) || 0)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Physical Tab */}
              <TabsContent value="physical" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Data Fisik</CardTitle>
                    <CardDescription>
                      Data tinggi dan berat badan siswa
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="height"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tinggi Badan (cm)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                placeholder="Contoh: 105.5"
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value
                                      ? parseFloat(e.target.value)
                                      : null,
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="weight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Berat Badan (kg)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                placeholder="Contoh: 18.5"
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value
                                      ? parseFloat(e.target.value)
                                      : null,
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Batal
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan Perubahan
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </MainLayout>
  );
}
