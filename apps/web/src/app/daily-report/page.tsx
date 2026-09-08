"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Search,
  Filter,
  MoreHorizontal,
  Plus,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

import { useDailyReports } from "@/hooks/use-daily-report";
import { useClasses } from "@/hooks/use-classes";
import { useUnits } from "@/hooks/use-units";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function DailyReportPage() {
  const router = useRouter();
  const [date, setDate] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [page, setPage] = useState(1);

  // Fetch data
  const { data: unitsData } = useUnits();
  const { data: classesData } = useClasses({ unitId: unitId || undefined });
  const { data: reportsData, isLoading } = useDailyReports({
    page,
    limit: 20,
    search,
    unitId: unitId || undefined,
    classId: classId || undefined,
    date: date ? date.toISOString() : undefined,
  });

  const reports = reportsData?.data || [];
  const pagination: any = reportsData?.meta || {
    totalPages: 1,
    page: 1,
    total: 0,
  };

  // Helper to format mood
  const getMoodConfig = (mood?: string | null) => {
    switch (mood) {
      case "HAPPY":
        return {
          label: "Senang",
          color: "bg-green-100 text-green-700",
          icon: "😊",
        };
      case "SAD":
        return {
          label: "Sedih",
          color: "bg-blue-100 text-blue-700",
          icon: "😢",
        };
      case "TIRED":
        return {
          label: "Lelah",
          color: "bg-orange-100 text-orange-700",
          icon: "😴",
        };
      case "SICK":
        return { label: "Sakit", color: "bg-red-100 text-red-700", icon: "🤒" };
      case "EXCITED":
        return {
          label: "Antusias",
          color: "bg-yellow-100 text-yellow-700",
          icon: "🤩",
        };
      default:
        return {
          label: "Biasa",
          color: "bg-gray-100 text-gray-700",
          icon: "😐",
        };
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="Laporan Harian (Mutabaah)"
        description="Kelola laporan harian aktivitas dan perkembangan siswa."
        action={{
          label: "Buat Laporan",
          icon: <Plus className="h-4 w-4" />,
          href: "/daily-report/new",
        }}
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari siswa..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? (
                    format(date, "PPP", { locale: idLocale })
                  ) : (
                    <span>Pilih Tanggal</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  autoFocus
                />
              </PopoverContent>
            </Popover>

            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Pilih Unit" />
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

            <Select
              value={classId}
              onValueChange={setClassId}
              disabled={!unitId || unitId === "ALL"}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Pilih Kelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Kelas</SelectItem>
                {classesData?.data?.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Belum ada laporan harian untuk tanggal ini.</p>
              <Button variant="link" asChild className="mt-2">
                <Link href="/daily-report/new">Buat Laporan Baru</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reports.map((report: any) => {
              const mood = getMoodConfig(report.mood);

              return (
                <Card
                  key={report.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={report.student?.photoUrl} />
                          <AvatarFallback>
                            {report.student?.user?.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-base">
                            {report.student?.user?.name}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {report.student?.nisn}
                          </CardDescription>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/daily-report/${report.id}`}>
                              Lihat Detail
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/daily-report/${report.id}/edit`}>
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-3">
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          Mood:
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("text-xs font-normal", mood.color)}
                        >
                          {mood.icon} {mood.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-muted-foreground text-xs">
                          Orang Tua:
                        </span>
                        {report.parentReadAt ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-700 hover:bg-green-100 text-xs gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Dibaca
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-gray-100 text-gray-500 hover:bg-gray-100 text-xs gap-1"
                          >
                            <Clock className="h-3 w-3" /> Belum
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Activity Snippet */}
                    <div className="bg-muted/30 p-2 rounded text-xs text-muted-foreground line-clamp-2">
                      {report.activitiesSummary ||
                        "Tidak ada ringkasan aktivitas."}
                    </div>

                    {/* Prayer Indicators (New Feature) */}
                    <div className="flex gap-1 justify-center pt-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1",
                          report.sholatDhuha
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "opacity-50",
                        )}
                      >
                        Dhuha
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1",
                          report.sholatDzuhur
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "opacity-50",
                        )}
                      >
                        Dzuhur
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1",
                          report.sholatAshar
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "opacity-50",
                        )}
                      >
                        Ashar
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center text-sm px-2">
              Halaman {page} dari {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === pagination.totalPages}
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
