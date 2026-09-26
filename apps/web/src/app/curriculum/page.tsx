"use client";

import { useState } from "react";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSubjectList,
  useCurriculums,
  useSchedules,
  useCanManageSubjects,
  passingScoreOf,
  SUBJECT_TYPES,
  SUBJECT_TYPE_LABELS,
  SUBJECT_TYPE_BADGE_CLASS,
  SCHEDULE_DAYS,
  SCHEDULE_DAY_LABELS,
  type SubjectType,
  type ScheduleDay,
} from "@/hooks";
import { useUnits, useAcademicYears, useClasses } from "@/hooks";
import {
  BookOpen,
  Search,
  Plus,
  Eye,
  Edit,
  Calendar,
  Clock,
  UserX,
  GraduationCap,
  Loader2,
} from "lucide-react";
import Link from "next/link";

export default function CurriculumPage() {
  const [activeTab, setActiveTab] = useState("subjects");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<SubjectType | "ALL">("ALL");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");

  const canManageSubjects = useCanManageSubjects();
  const { data: subjectList, isLoading: loadingSubjects } = useSubjectList({
    search: search || undefined,
    type: typeFilter !== "ALL" ? typeFilter : undefined,
    unitId: unitFilter !== "ALL" ? unitFilter : undefined,
  });
  const subjects = subjectList?.rows;
  const subjectTotal = subjectList?.total ?? 0;
  const { data: curriculums, isLoading: loadingCurriculums } = useCurriculums({
    unitId: unitFilter !== "ALL" ? unitFilter : undefined,
  });
  const { data: schedules, isLoading: loadingSchedules } = useSchedules({
    classId: classFilter !== "ALL" ? classFilter : undefined,
  });
  const { data: units } = useUnits();
  const { data: academicYears } = useAcademicYears();
  const { data: classes } = useClasses();

  const activeAcademicYear = academicYears?.data?.find((ay) => ay.isActive);

  // Counted from the rows shown; the table says when those are not all.
  const withoutPengampu =
    subjects?.filter((s) => s.isActive && !s._count?.teacherSubjects).length ??
    0;

  // Group schedules by day
  const schedulesByDay = SCHEDULE_DAYS.reduce(
    (acc, day) => {
      acc[day] = schedules?.filter((s) => s.day === day) || [];
      return acc;
    },
    {} as Record<ScheduleDay, typeof schedules>,
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Kurikulum</h1>
            <p className="text-muted-foreground">
              Kelola mata pelajaran, kurikulum, dan jadwal
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Mata Pelajaran
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{subjectTotal}</div>
              <p className="text-xs text-muted-foreground">
                {subjects?.filter((s) => s.isActive).length ?? 0} aktif
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Kurikulum</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {curriculums?.length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {curriculums?.filter((c) => c.isActive).length ?? 0} aktif
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Jadwal Pelajaran
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{schedules?.length ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                Total sesi per minggu
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Tanpa Guru Pengampu
              </CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{withoutPengampu}</div>
              <p className="text-xs text-muted-foreground">
                Mata pelajaran aktif yang belum ada gurunya
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="subjects">
              <BookOpen className="mr-2 h-4 w-4" />
              Mata Pelajaran
            </TabsTrigger>
            <TabsTrigger value="curriculum">
              <GraduationCap className="mr-2 h-4 w-4" />
              Kurikulum
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Jadwal
            </TabsTrigger>
          </TabsList>

          {/* Subjects Tab */}
          <TabsContent value="subjects" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cari mata pelajaran..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={unitFilter} onValueChange={setUnitFilter}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Semua Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Unit</SelectItem>
                      {units?.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={typeFilter}
                    onValueChange={(v) =>
                      setTypeFilter(v as SubjectType | "ALL")
                    }
                  >
                    <SelectTrigger className="w-full md:w-[160px]">
                      <SelectValue placeholder="Semua Jenis" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Jenis</SelectItem>
                      {SUBJECT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {SUBJECT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canManageSubjects && (
                    <Button asChild>
                      <Link href="/curriculum/subjects/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Tambah
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>JP/Minggu</TableHead>
                    <TableHead>KKM</TableHead>
                    <TableHead>Guru Pengampu</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSubjects ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : subjects?.length ? (
                    subjects.map((subject) => (
                      <TableRow key={subject.id}>
                        <TableCell className="font-mono text-sm">
                          {subject.code}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{subject.name}</p>
                            {subject.description && (
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {subject.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{subject.unit?.name ?? "-"}</TableCell>
                        <TableCell>
                          <Badge
                            className={SUBJECT_TYPE_BADGE_CLASS[subject.type]}
                          >
                            {SUBJECT_TYPE_LABELS[subject.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>{subject.credits}</TableCell>
                        <TableCell>{passingScoreOf(subject)}</TableCell>
                        <TableCell>
                          {subject._count?.teacherSubjects ?? 0}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={subject.isActive ? "default" : "secondary"}
                          >
                            {subject.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              aria-label={`Lihat ${subject.name}`}
                            >
                              <Link href={`/curriculum/subjects/${subject.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            {canManageSubjects && (
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                aria-label={`Edit ${subject.name}`}
                              >
                                <Link
                                  href={`/curriculum/subjects/${subject.id}/edit`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Belum ada mata pelajaran
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {subjects && subjectTotal > subjects.length && (
                <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                  Menampilkan {subjects.length} dari {subjectTotal} mata
                  pelajaran. Persempit dengan unit, jenis, atau pencarian.
                </p>
              )}
            </Card>
          </TabsContent>

          {/* Curriculum Tab */}
          <TabsContent value="curriculum" className="space-y-4">
            <div className="flex justify-between items-center">
              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Semua Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Unit</SelectItem>
                  {units?.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button asChild>
                <Link href="/curriculum/curriculums/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Buat Kurikulum
                </Link>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {loadingCurriculums ? (
                <div className="col-span-full text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : curriculums?.length ? (
                curriculums.map((curriculum) => (
                  <Card key={curriculum.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {curriculum.name}
                          </CardTitle>
                          <CardDescription>{curriculum.code}</CardDescription>
                        </div>
                        <Badge
                          variant={
                            curriculum.isActive ? "default" : "secondary"
                          }
                        >
                          {curriculum.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Unit</span>
                          <span>{curriculum.unit?.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Tahun Ajaran
                          </span>
                          <span>{curriculum.academicYear?.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tingkat</span>
                          <span>Kelas {curriculum.gradeLevel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Mata Pelajaran
                          </span>
                          <span>{curriculum.subjects?.length ?? 0}</span>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/curriculum/curriculums/${curriculum.id}`}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Detail
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/curriculum/curriculums/${curriculum.id}/edit`}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Belum ada kurikulum
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Pilih Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Kelas</SelectItem>
                    {classes?.data?.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button asChild>
                <Link href="/curriculum/schedules/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Jadwal
                </Link>
              </Button>
            </div>

            {/* Schedule Grid */}
            <div className="grid gap-4">
              {loadingSchedules ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : (
                SCHEDULE_DAYS.slice(0, 6).map((day) => (
                  <Card key={day}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">
                        {SCHEDULE_DAY_LABELS[day]}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {schedulesByDay[day]?.length ? (
                        <div className="space-y-2">
                          {schedulesByDay[day]
                            ?.sort((a, b) =>
                              a.startTime.localeCompare(b.startTime),
                            )
                            .map((schedule) => (
                              <div
                                key={schedule.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-1 text-sm font-mono">
                                    <Clock className="h-4 w-4" />
                                    {schedule.startTime} - {schedule.endTime}
                                  </div>
                                  <div>
                                    <p className="font-medium">
                                      {schedule.subject?.name}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {schedule.teacher?.name} •{" "}
                                      {schedule.class?.name}
                                      {schedule.room && ` • ${schedule.room}`}
                                    </p>
                                  </div>
                                </div>
                                <Button variant="ghost" size="icon" asChild>
                                  <Link
                                    href={`/curriculum/schedules/${schedule.id}/edit`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Tidak ada jadwal
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
