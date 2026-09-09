"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
import { PageHeader, DataTable } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSanadRecords, SanadRecord } from "@/hooks/use-takhosus";
import { type ColumnDef } from "@/components/shared";

import { id } from "date-fns/locale";
import {
  BookOpen,
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Award,
  CheckCircle,
  Calendar,
} from "lucide-react";

const gradeLabels: Record<string, string> = {
  Mumtaz: "Mumtaz (Istimewa)",
  "Jayyid Jiddan": "Jayyid Jiddan (Sangat Baik)",
  Jayyid: "Jayyid (Baik)",
  Maqbul: "Maqbul (Cukup)",
};

const gradeBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  Mumtaz: "default",
  "Jayyid Jiddan": "default",
  Jayyid: "secondary",
  Maqbul: "outline",
};

export default function SanadPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [juzFilter, setJuzFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSanadRecords({
    page,
    limit: 20,
    juz: juzFilter ? parseInt(juzFilter) : undefined,
  });

  const columns: ColumnDef<SanadRecord>[] = [
    {
      accessorKey: "enrollment.student.name",
      header: "Santri",
      cell: ({ row }) =>
        row.original.enrollment?.student?.name ||
        row.original.enrollment?.student?.user?.name ||
        "-",
    },
    {
      accessorKey: "nis",
      header: "NIS",
      cell: ({ row }) => row.original.enrollment?.student?.nis || "-",
    },
    {
      accessorKey: "juz",
      header: "Juz",
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">
          Juz {row.original.juz}
        </Badge>
      ),
    },
    {
      accessorKey: "teacher.name",
      header: "Pensahih",
      cell: ({ row }) => row.original.teacher?.name || "-",
    },
    {
      accessorKey: "nip",
      header: "NIP",
      cell: ({ row }) => row.original.teacher?.nip || "-",
    },
    {
      accessorKey: "surahRange",
      header: "Surah",
      cell: ({ row }) => {
        const { surahStart, surahEnd } = row.original;
        if (!surahStart)
          return <span className="text-muted-foreground">-</span>;
        if (surahStart === surahEnd || !surahEnd) {
          return <span>Surah {surahStart}</span>;
        }
        return (
          <span>
            Surah {surahStart} - {surahEnd}
          </span>
        );
      },
    },
    {
      accessorKey: "grade",
      header: "Predikat",
      cell: ({ row }) =>
        row.original.grade ? (
          <Badge variant={gradeBadgeVariant[row.original.grade] || "outline"}>
            {row.original.grade}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      accessorKey: "certifiedAt",
      header: "Tanggal Pengesahan",
      cell: ({ row }) =>
        safeFormat(new Date(row.original.certifiedAt), "dd MMM yyyy", {
          locale: id,
        }),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => router.push(`/tahfidz/sanad/${row.original.id}`)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Lihat Detail
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                router.push(`/tahfidz/sanad/${row.original.id}/edit`)
              }
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Filter by search
  const filteredData =
    data?.data?.filter(
      (record: SanadRecord) =>
        record.enrollment?.student?.name
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        record.enrollment?.student?.user?.name
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        record.teacher?.name?.toLowerCase().includes(search.toLowerCase()),
    ) || [];

  // Calculate stats
  const totalRecords = data?.meta?.total || 0;
  const completedJuz = new Set(data?.data?.map((r: SanadRecord) => r.juz) || [])
    .size;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Sanad Hafidz"
            description="Daftar pengesahan hafalan (sanad) santri"
            icon={BookOpen}
          />
          <Button onClick={() => router.push("/tahfidz/sanad/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Tambah Sanad
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Sanad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{totalRecords}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Juz Tersertifikasi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{completedJuz}</span>
                <span className="text-muted-foreground">/ 30</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mumtaz
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-yellow-500" />
                <span className="text-2xl font-bold">
                  {data?.data?.filter((r: SanadRecord) => r.grade === "Mumtaz")
                    .length || 0}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Bulan Ini
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">
                  {data?.data?.filter((r: SanadRecord) => {
                    const certDate = new Date(r.certifiedAt);
                    const now = new Date();
                    return (
                      certDate.getMonth() === now.getMonth() &&
                      certDate.getFullYear() === now.getFullYear()
                    );
                  }).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari santri atau pensahih..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={juzFilter} onValueChange={setJuzFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Semua Juz" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Semua Juz</SelectItem>
              {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                <SelectItem key={juz} value={String(juz)}>
                  Juz {juz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredData}
          isLoading={isLoading}
        />

        {/* Pagination */}
        {data?.meta && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Sebelumnya
            </Button>
            <span className="text-sm text-muted-foreground">
              Halaman {page} dari {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPage((p) => Math.min(data.meta.totalPages, p + 1))
              }
              disabled={page === data.meta.totalPages}
            >
              Selanjutnya
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
