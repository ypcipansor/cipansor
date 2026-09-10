"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, RefreshCw, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadingSpinner } from "@/components/shared";
import { useUnits } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";
import { useAcademicYears } from "@/hooks/use-academic-years";
import { useLeger, LegerItem } from "@/hooks/use-rapor-pesantren";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";

function LegerPesantrenPageContent() {
  const router = useRouter();

  // Filters
  const [unitId, setUnitId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [semester, setSemester] = useState<string>("1");

  // Queries
  const { data: unitsData } = useUnits();
  const { data: classesData } = useClasses({ unitId: unitId || undefined });
  const { data: academicYearsData } = useAcademicYears();

  const {
    data: legerData,
    isLoading,
    refetch,
  } = useLeger({
    unitId,
    classId,
    academicYearId,
    semester: parseInt(semester),
  });

  const units = unitsData || [];
  const classes = classesData?.data || [];
  const academicYears = academicYearsData?.data || [];

  const handleExport = () => {
    if (!legerData || legerData.length === 0) return;

    const headers = [
      "No",
      "NISN",
      "Nama Santri",
      "Tahfidz (Nilai)",
      "Tahfidz (Predikat)",
      "Ibadah (Nilai)",
      "Ibadah (Predikat)",
      "Muhadhoroh (Nilai)",
      "Muhadhoroh (Predikat)",
      "Muhadatsah (Nilai)",
      "Muhadatsah (Predikat)",
      "Kitab (Nilai)",
      "Kitab (Predikat)",
      "Akhlak (Nilai)",
      "Akhlak (Predikat)",
      "Kehadiran (Nilai)",
      "Kehadiran (Predikat)",
      "TOTAL (Nilai)",
      "TOTAL (Predikat)",
    ];

    const rows = legerData.map((item, index) => [
      index + 1,
      item.studentNisn,
      item.studentName,
      item.tahfidzScore.toFixed(0),
      item.tahfidzGrade,
      item.ibadahScore.toFixed(0),
      item.ibadahGrade,
      item.muhadhorohScore.toFixed(0),
      item.muhadhorohGrade,
      item.muhadatsahScore.toFixed(0),
      item.muhadatsahGrade,
      item.kitabScore.toFixed(0),
      item.kitabGrade,
      item.akhlakScore.toFixed(0),
      item.akhlakGrade,
      item.attendanceScore.toFixed(0),
      item.attendanceGrade,
      item.overallScore.toFixed(1),
      item.overallGrade,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `leger_nilai_pesantren_${classId}_${semester}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getGradeColor = (grade: string) => {
    if (["MUMTAZ", "JAYYID_JIDDAN"].includes(grade))
      return "bg-green-100 text-green-800";
    if (grade === "JAYYID") return "bg-blue-100 text-blue-800";
    if (grade === "MAQBUL") return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/rapor-pesantren")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali
          </Button>
          <PageHeader
            title="Leger Nilai Pesantren"
            description="Rekapitulasi nilai rapor pesantren per kelas"
          />
        </div>
        <Button
          onClick={handleExport}
          disabled={!legerData || legerData.length === 0}
          className="print:hidden"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader className="print:hidden">
          <CardTitle>Filter Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4 print:hidden">
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih Unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={classId}
              onValueChange={setClassId}
              disabled={!unitId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih Kelas" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={academicYearId} onValueChange={setAcademicYearId}>
              <SelectTrigger>
                <SelectValue placeholder="Tahun Ajaran" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={semester} onValueChange={setSemester}>
              <SelectTrigger>
                <SelectValue placeholder="Semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Semester 1</SelectItem>
                <SelectItem value="2">Semester 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="print:border-none print:shadow-none">
        <CardContent className="p-0">
          {!unitId || !classId || !academicYearId ? (
            <div className="text-center py-12 text-muted-foreground print:hidden">
              Silakan pilih filter unit, kelas, dan tahun ajaran untuk
              menampilkan data
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : !legerData || legerData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Tidak ada data nilai untuk kelas ini
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Print Header */}
              <div className="hidden print:block text-center mb-6">
                <h2 className="text-xl font-bold">LEGER NILAI PESANTREN</h2>
                <p className="text-sm">
                  Kelas: {classes.find((c) => c.id === classId)?.name} |
                  Semester: {semester} | Tahun Ajaran:{" "}
                  {academicYears.find((y) => y.id === academicYearId)?.name}
                </p>
              </div>

              <Table className="print:text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] sticky left-0 bg-background z-10 print:static">
                      No
                    </TableHead>
                    <TableHead className="w-[200px] sticky left-[50px] bg-background z-10 print:static">
                      Nama Santri
                    </TableHead>
                    <TableHead
                      className="text-center border-l bg-muted/30 print:bg-transparent"
                      colSpan={2}
                    >
                      Tahfidz
                    </TableHead>
                    <TableHead
                      className="text-center border-l bg-muted/30 print:bg-transparent"
                      colSpan={2}
                    >
                      Ibadah
                    </TableHead>
                    <TableHead
                      className="text-center border-l bg-muted/30 print:bg-transparent"
                      colSpan={2}
                    >
                      Muhadhoroh
                    </TableHead>
                    <TableHead
                      className="text-center border-l bg-muted/30 print:bg-transparent"
                      colSpan={2}
                    >
                      Muhadatsah
                    </TableHead>
                    <TableHead
                      className="text-center border-l bg-muted/30 print:bg-transparent"
                      colSpan={2}
                    >
                      Kitab
                    </TableHead>
                    <TableHead
                      className="text-center border-l bg-muted/30 print:bg-transparent"
                      colSpan={2}
                    >
                      Akhlak
                    </TableHead>
                    <TableHead
                      className="text-center border-l bg-muted/30 print:bg-transparent"
                      colSpan={2}
                    >
                      Kehadiran
                    </TableHead>
                    <TableHead
                      className="text-center border-l font-bold bg-primary/5 text-primary print:bg-transparent print:text-black"
                      colSpan={2}
                    >
                      TOTAL
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 print:static"></TableHead>
                    <TableHead className="sticky left-[50px] bg-background z-10 print:static"></TableHead>

                    <TableHead className="text-center text-xs w-[60px] border-l">
                      Nilai
                    </TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      Predikat
                    </TableHead>

                    <TableHead className="text-center text-xs w-[60px] border-l">
                      Nilai
                    </TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      Predikat
                    </TableHead>

                    <TableHead className="text-center text-xs w-[60px] border-l">
                      Nilai
                    </TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      Predikat
                    </TableHead>

                    <TableHead className="text-center text-xs w-[60px] border-l">
                      Nilai
                    </TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      Predikat
                    </TableHead>

                    <TableHead className="text-center text-xs w-[60px] border-l">
                      Nilai
                    </TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      Predikat
                    </TableHead>

                    <TableHead className="text-center text-xs w-[60px] border-l">
                      Nilai
                    </TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      Predikat
                    </TableHead>

                    <TableHead className="text-center text-xs w-[60px] border-l">
                      Nilai
                    </TableHead>
                    <TableHead className="text-center text-xs w-[80px]">
                      Predikat
                    </TableHead>

                    <TableHead className="text-center text-xs w-[70px] border-l font-bold bg-primary/5 print:bg-transparent">
                      Skor
                    </TableHead>
                    <TableHead className="text-center text-xs w-[90px] font-bold bg-primary/5 print:bg-transparent">
                      Predikat
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {legerData.map((item, index) => (
                    <TableRow
                      key={item.studentId}
                      className="hover:bg-muted/50 print:hover:bg-transparent"
                    >
                      <TableCell className="sticky left-0 bg-background z-10 font-medium print:static">
                        {index + 1}
                      </TableCell>
                      <TableCell className="sticky left-[50px] bg-background z-10 font-medium whitespace-nowrap print:static">
                        <div className="flex flex-col">
                          {item.id ? (
                            <Link
                              href={`/rapor-pesantren/${item.id}`}
                              className="hover:underline text-primary print:text-black print:no-underline"
                            >
                              {item.studentName}
                            </Link>
                          ) : (
                            <span>{item.studentName}</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {item.studentNisn}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="text-center border-l">
                        {item.tahfidzScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.tahfidzGrade}
                      </TableCell>

                      <TableCell className="text-center border-l">
                        {item.ibadahScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.ibadahGrade}
                      </TableCell>

                      <TableCell className="text-center border-l">
                        {item.muhadhorohScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.muhadhorohGrade}
                      </TableCell>

                      <TableCell className="text-center border-l">
                        {item.muhadatsahScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.muhadatsahGrade}
                      </TableCell>

                      <TableCell className="text-center border-l">
                        {item.kitabScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.kitabGrade}
                      </TableCell>

                      <TableCell className="text-center border-l">
                        {item.akhlakScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.akhlakGrade}
                      </TableCell>

                      <TableCell className="text-center border-l">
                        {item.attendanceScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {item.attendanceGrade}
                      </TableCell>

                      <TableCell className="text-center border-l font-bold bg-primary/5 print:bg-transparent">
                        {item.overallScore.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center bg-primary/5 print:bg-transparent">
                        <Badge
                          className={`${getGradeColor(item.overallGrade)} whitespace-nowrap print:border print:bg-transparent print:text-black`}
                        >
                          {item.overallGrade}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LegerPesantrenPage() {
  return (
    <MainLayout>
      <LegerPesantrenPageContent />
    </MainLayout>
  );
}
