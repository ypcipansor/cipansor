"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Loader2, Smile, Meh, Frown } from "lucide-react";
import { toast } from "sonner";
import { useClasses } from "@/hooks/use-classes";
import { useStudents } from "@/hooks/use-students";
import { useBulkCreateDailyReport } from "@/hooks/use-daily-report";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BulkCreateDailyReportsInput } from "@cipansor/shared";
import { STUDENT_STATUS } from "@cipansor/shared";

const MOODS = [
  { value: "HAPPY", label: "Senang", icon: Smile, color: "text-green-500" },
  { value: "NEUTRAL", label: "Biasa", icon: Meh, color: "text-gray-500" },
  { value: "SAD", label: "Sedih", icon: Frown, color: "text-yellow-500" },
  { value: "SICK", label: "Sakit", icon: Frown, color: "text-red-500" },
];

const MEALS = [
  { value: "HABIS", label: "Habis" },
  { value: "SETENGAH", label: "Setengah" },
  { value: "SEDIKIT", label: "Sedikit" },
  { value: "TIDAK_MAU", label: "Tidak Mau" },
];

interface StudentReportDraft {
  studentId: string;
  isPresent: boolean;
  morningMood: string;
  healthNotes: string;
  lunchConsumption: string;
  surahPractice: string; // Tahfidz note (summary)
  sholatDhuha: boolean;
  sholatDzuhur: boolean;
  activitiesSummary: string;
  // New Fields
  readingBookId: string;
  readingPage: string;
  tahfidzSurahName: string;
  tahfidzSurahNumber: string;
  tahfidzAyahStart: string;
  tahfidzAyahEnd: string;
}

export default function BulkCreateDailyReportPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [reports, setReports] = useState<Record<string, StudentReportDraft>>(
    {},
  );

  // Fetch Kitab Books (Iqra)
  const { data: kitabData } = useQuery({
    queryKey: ["kitab-books"],
    queryFn: async () => {
      const res = await api.get("/kitab-progress/kitab", {
        params: { isActive: true, limit: 100 },
      });
      return res.data?.data || [];
    },
  });

  const { data: classes } = useClasses({ unitId: user?.unitId });
  const { data: students, isLoading: isLoadingStudents } = useStudents({
    classId: selectedClassId || undefined,
    unitId: user?.unitId,
    limit: 100,
    status: STUDENT_STATUS.ACTIVE,
  });

  const bulkMutation = useBulkCreateDailyReport();

  // Initialize reports when students are loaded
  useEffect(() => {
    if (students?.data) {
      const initialReports: Record<string, StudentReportDraft> = {};
      students.data.forEach((student) => {
        initialReports[student.id] = {
          studentId: student.id,
          isPresent: true, // Default present
          morningMood: "HAPPY",
          healthNotes: "",
          lunchConsumption: "HABIS",
          surahPractice: "",
          sholatDhuha: true, // Optimistic default
          sholatDzuhur: true,
          activitiesSummary: "",
          readingBookId: "",
          readingPage: "",
          tahfidzSurahName: "",
          tahfidzSurahNumber: "",
          tahfidzAyahStart: "",
          tahfidzAyahEnd: "",
        };
      });
      setTimeout(() => setReports(initialReports), 0);
    }
  }, [students]);

  const updateReport = (
    studentId: string,
    field: keyof StudentReportDraft,
    value: any,
  ) => {
    setReports((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async () => {
    if (!selectedClassId) {
      toast.error("Pilih kelas terlebih dahulu");
      return;
    }

    const presentStudents = Object.values(reports).filter((r) => r.isPresent);

    if (presentStudents.length === 0) {
      toast.error("Tidak ada siswa yang hadir untuk dilaporkan");
      return;
    }

    // Validate inputs
    for (const student of presentStudents) {
      // Tahfidz Validation
      const hasTahfidzData =
        student.tahfidzSurahName ||
        student.tahfidzAyahStart ||
        student.tahfidzAyahEnd ||
        student.tahfidzSurahNumber;

      if (hasTahfidzData) {
        if (
          !student.tahfidzSurahNumber ||
          !student.tahfidzSurahName ||
          !student.tahfidzAyahStart ||
          !student.tahfidzAyahEnd
        ) {
          toast.error(
            `Data Tahfidz tidak lengkap untuk siswa ID: ${student.studentId}. Harap isi semua field.`,
          );
          return;
        }

        const surahNum = parseInt(student.tahfidzSurahNumber);
        const ayahStart = parseInt(student.tahfidzAyahStart);
        const ayahEnd = parseInt(student.tahfidzAyahEnd);

        if (isNaN(surahNum) || surahNum < 1 || surahNum > 114) {
          toast.error(
            `Nomor surat tidak valid untuk siswa ID: ${student.studentId}`,
          );
          return;
        }

        if (isNaN(ayahStart) || isNaN(ayahEnd)) {
          toast.error(
            `Ayat harus berupa angka untuk siswa ID: ${student.studentId}`,
          );
          return;
        }

        if (ayahEnd < ayahStart) {
          toast.error(
            `Data Tahfidz salah untuk siswa ID: ${student.studentId} (Ayat akhir < awal)`,
          );
          return;
        }
      }

      // Reading Validation
      const hasReadingData = student.readingBookId || student.readingPage;
      if (hasReadingData) {
        if (!student.readingBookId || !student.readingPage) {
          toast.error(
            `Data membaca tidak lengkap untuk siswa ID: ${student.studentId}. Harap isi buku dan halaman.`,
          );
          return;
        }
        const page = parseInt(student.readingPage);
        if (isNaN(page) || page < 1) {
          toast.error(
            `Halaman membaca tidak valid untuk siswa ID: ${student.studentId}`,
          );
          return;
        }
      }
    }

    try {
      const reportsData: BulkCreateDailyReportsInput["reports"] =
        presentStudents.map((r) => {
          const reportPayload: BulkCreateDailyReportsInput["reports"][0] = {
            studentId: r.studentId,
            morningMood: r.morningMood as any, // Cast as needed if shared type enum mismatch
            healthNotes: r.healthNotes,
            lunchConsumption: r.lunchConsumption,
            activitiesSummary: r.activitiesSummary,
            ibadahNotes: r.surahPractice,
            sholatDhuha: r.sholatDhuha,
            sholatDzuhur: r.sholatDzuhur,
            sholatAshar: false,
            sholatJamaah: false,
          };

          // Add Reading Progress
          if (r.readingBookId && r.readingPage) {
            reportPayload.readingProgress = {
              bookId: r.readingBookId,
              page: parseInt(r.readingPage),
            };
          }

          // Add Tahfidz Progress
          if (
            r.tahfidzSurahName &&
            r.tahfidzSurahNumber &&
            r.tahfidzAyahStart &&
            r.tahfidzAyahEnd
          ) {
            reportPayload.tahfidzProgress = {
              surahName: r.tahfidzSurahName,
              surahNumber: parseInt(r.tahfidzSurahNumber),
              ayahStart: parseInt(r.tahfidzAyahStart),
              ayahEnd: parseInt(r.tahfidzAyahEnd),
            };
          }

          return reportPayload;
        });

      await bulkMutation.mutateAsync({
        unitId: user?.unitId || "",
        academicYearId: user?.academicYearId || "",
        reportDate: new Date().toISOString(),
        reports: reportsData,
      });

      toast.success(
        `Berhasil membuat ${presentStudents.length} laporan harian`,
      );
      router.push("/tk");
    } catch (error) {
      console.error(error);
      toast.error("Gagal membuat laporan massal");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-20">
        <PageHeader
          title="Input Laporan Harian Massal"
          description="Input cepat untuk satu kelas"
          actions={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Pilih Kelas</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Pilih Kelas..." />
              </SelectTrigger>
              <SelectContent>
                {classes?.data?.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedClassId && students?.data && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              Daftar Siswa ({students.data.length})
            </h3>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {students.data.map((student) => {
                const report = reports[student.id];
                if (!report) return null;

                return (
                  <Card
                    key={student.id}
                    className={`${!report.isPresent ? "opacity-60 bg-muted" : ""}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">
                          {student.name}
                        </CardTitle>
                        <Checkbox
                          checked={report.isPresent}
                          onCheckedChange={(checked) =>
                            updateReport(student.id, "isPresent", !!checked)
                          }
                        />
                      </div>
                    </CardHeader>

                    {report.isPresent && (
                      <CardContent className="space-y-4 text-sm">
                        {/* Mood */}
                        <div className="space-y-2">
                          <Label>Mood Pagi</Label>
                          <div className="flex gap-2">
                            {MOODS.map((mood) => {
                              const Icon = mood.icon;
                              const isSelected =
                                report.morningMood === mood.value;
                              return (
                                <button
                                  key={mood.value}
                                  type="button"
                                  onClick={() =>
                                    updateReport(
                                      student.id,
                                      "morningMood",
                                      mood.value,
                                    )
                                  }
                                  className={`p-2 rounded-full border transition-all ${isSelected ? `bg-accent border-primary ${mood.color}` : "border-transparent hover:bg-muted"}`}
                                  title={mood.label}
                                >
                                  <Icon className="h-6 w-6" />
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Health */}
                        <div className="space-y-2">
                          <Label>Kesehatan</Label>
                          <Input
                            placeholder="Sehat..."
                            value={report.healthNotes}
                            onChange={(e) =>
                              updateReport(
                                student.id,
                                "healthNotes",
                                e.target.value,
                              )
                            }
                            className="h-8"
                          />
                        </div>

                        {/* Makan */}
                        <div className="space-y-2">
                          <Label>Makan Siang</Label>
                          <Select
                            value={report.lunchConsumption}
                            onValueChange={(val) =>
                              updateReport(student.id, "lunchConsumption", val)
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MEALS.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Ibadah */}
                        <div className="space-y-2">
                          <Label>Ibadah</Label>
                          <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`dhuha-${student.id}`}
                                checked={report.sholatDhuha}
                                onCheckedChange={(c) =>
                                  updateReport(student.id, "sholatDhuha", !!c)
                                }
                              />
                              <label htmlFor={`dhuha-${student.id}`}>
                                Dhuha
                              </label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`dzuhur-${student.id}`}
                                checked={report.sholatDzuhur}
                                onCheckedChange={(c) =>
                                  updateReport(student.id, "sholatDzuhur", !!c)
                                }
                              />
                              <label htmlFor={`dzuhur-${student.id}`}>
                                Dzuhur
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Tahfidz/Notes (Summary) */}
                        <div className="space-y-2">
                          <Label>Catatan Ibadah</Label>
                          <Input
                            placeholder="Catatan tambahan..."
                            value={report.surahPractice}
                            onChange={(e) =>
                              updateReport(
                                student.id,
                                "surahPractice",
                                e.target.value,
                              )
                            }
                            className="h-8"
                          />
                        </div>

                        {/* Reading Progress (Iqra) */}
                        <div className="p-3 bg-blue-50 rounded-md space-y-3">
                          <Label className="text-blue-800 font-semibold">
                            Capaian Membaca (Iqra/Jilid)
                          </Label>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <Select
                                value={report.readingBookId}
                                onValueChange={(val) =>
                                  updateReport(student.id, "readingBookId", val)
                                }
                              >
                                <SelectTrigger className="h-8 bg-white">
                                  <SelectValue placeholder="Pilih Buku" />
                                </SelectTrigger>
                                <SelectContent>
                                  {kitabData?.map((book: any) => (
                                    <SelectItem key={book.id} value={book.id}>
                                      {book.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              type="number"
                              placeholder="Hal"
                              value={report.readingPage}
                              onChange={(e) =>
                                updateReport(
                                  student.id,
                                  "readingPage",
                                  e.target.value,
                                )
                              }
                              className="h-8 bg-white"
                            />
                          </div>
                        </div>

                        {/* Tahfidz Progress */}
                        <div className="p-3 bg-green-50 rounded-md space-y-3">
                          <Label className="text-green-800 font-semibold">
                            Capaian Tahfidz (Hafalan Baru)
                          </Label>
                          <div className="space-y-2">
                            <Input
                              placeholder="Nama Surah"
                              value={report.tahfidzSurahName}
                              onChange={(e) =>
                                updateReport(
                                  student.id,
                                  "tahfidzSurahName",
                                  e.target.value,
                                )
                              }
                              className="h-8 bg-white"
                            />
                            <div className="grid grid-cols-3 gap-2">
                              <Input
                                type="number"
                                placeholder="No. Surat"
                                value={report.tahfidzSurahNumber}
                                onChange={(e) =>
                                  updateReport(
                                    student.id,
                                    "tahfidzSurahNumber",
                                    e.target.value,
                                  )
                                }
                                className="h-8 bg-white"
                              />
                              <Input
                                type="number"
                                placeholder="Ayat Awal"
                                value={report.tahfidzAyahStart}
                                onChange={(e) =>
                                  updateReport(
                                    student.id,
                                    "tahfidzAyahStart",
                                    e.target.value,
                                  )
                                }
                                className="h-8 bg-white"
                              />
                              <Input
                                type="number"
                                placeholder="Ayat Akhir"
                                value={report.tahfidzAyahEnd}
                                onChange={(e) =>
                                  updateReport(
                                    student.id,
                                    "tahfidzAyahEnd",
                                    e.target.value,
                                  )
                                }
                                className="h-8 bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Floating Action Button for Save */}
        {selectedClassId && (
          <div className="fixed bottom-6 right-6">
            <Button
              size="lg"
              className="shadow-xl"
              onClick={handleSubmit}
              disabled={bulkMutation.isPending}
            >
              {bulkMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Save className="mr-2 h-5 w-5" />
              )}
              Simpan Laporan (
              {Object.values(reports).filter((r) => r.isPresent).length})
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
