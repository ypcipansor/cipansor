"use client";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader, DataTable } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Plus,
  Search,
  Calendar,
  Filter,
  Eye,
  FileEdit,
  Trash2,
} from "lucide-react";
import {
  useTKAssessments,
  useDeleteTKAssessment,
  ACHIEVEMENT_COLORS,
  ACHIEVEMENT_LABELS,
  ASPECT_LABELS,
  TKAchievementLevel,
} from "@/hooks/use-tk-assessment";
import { type ColumnDef } from "@/components/shared";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TKAssessmentListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [aspect, setAspect] = useState<string>("ALL");
  const [date, setDate] = useState<Date | undefined>(undefined);

  const deleteMutation = useDeleteTKAssessment();

  const handleDelete = async (id: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus penilaian ini?")) {
      try {
        await deleteMutation.mutateAsync(id);
        toast.success("Penilaian berhasil dihapus");
      } catch (error) {
        toast.error("Gagal menghapus penilaian");
      }
    }
  };

  const { data, isLoading } = useTKAssessments({
    search,
    aspect: aspect !== "ALL" ? (aspect as any) : undefined,
    startDate: date ? format(date, "yyyy-MM-dd") : undefined,
    limit: 20,
  });

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "periodDate",
      header: "Tanggal",
      cell: ({ row }) =>
        safeFormat(new Date(row.getValue("periodDate")), "dd MMM yyyy", {
          locale: idLocale,
        }),
    },
    {
      accessorKey: "student.user.name",
      header: "Siswa",
    },
    {
      accessorKey: "indicator.code",
      header: "Kode",
    },
    {
      accessorKey: "indicator.name",
      header: "Indikator",
      cell: ({ row }) => (
        <div
          className="max-w-[300px] truncate"
          title={row.original.indicator?.name}
        >
          {row.original.indicator?.name}
        </div>
      ),
    },
    {
      accessorKey: "achievementLevel",
      header: "Capaian",
      cell: ({ row }) => {
        const level = row.getValue("achievementLevel") as TKAchievementLevel;
        return (
          <Badge className={ACHIEVEMENT_COLORS[level]} variant="outline">
            {ACHIEVEMENT_LABELS[level] || level}
          </Badge>
        );
      },
    },
    {
      accessorKey: "notes",
      header: "Catatan",
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate text-muted-foreground">
          {row.getValue("notes") || "-"}
        </div>
      ),
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/tk/assessment/${row.original.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              router.push(`/tk/assessment/${row.original.id}/edit`)
            }
          >
            <FileEdit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(row.original.id)}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Penilaian TK"
          description="Daftar penilaian perkembangan siswa"
          actions={
            <Button onClick={() => router.push("/tk/assessment/create")}>
              <Plus className="mr-2 h-4 w-4" />
              Input Penilaian
            </Button>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Filter Data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari siswa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="w-[200px]">
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Aspek" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Aspek</SelectItem>
                  {Object.entries(ASPECT_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {key} - {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[240px]">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground",
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {date
                      ? format(date, "PPP", { locale: idLocale })
                      : "Pilih Tanggal"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={columns}
              data={data?.data || []}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
