"use client";

import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  BookOpen,
  Users,
  Target,
  Sparkles,
  GraduationCap,
  Loader2,
  Printer,
  Download,
  Heart,
  Globe,
  Lightbulb,
  Brain,
  Palette,
  HandHelping,
  FileText,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentUnit } from "@/hooks";
import {
  useRaportMerdekaStudentData,
  useRaportMerdekaStudentsList,
  useRaportMerdekaAcademicYears,
  useExportRaportMerdekaPdf,
  useRaportMerdekaP5Dimensions,
  useRaportMerdekaCpMapping,
} from "@/hooks/use-kurikulum-merdeka";
import { toast } from "sonner";

// P5 Dimension Icons
const P5_ICONS: Record<string, React.ReactNode> = {
  BER: <Heart className="h-5 w-5 text-red-500" />,
  BKB: <Globe className="h-5 w-5 text-blue-500" />,
  GR: <HandHelping className="h-5 w-5 text-green-500" />,
  MAN: <Target className="h-5 w-5 text-orange-500" />,
  BK: <Brain className="h-5 w-5 text-purple-500" />,
  KR: <Palette className="h-5 w-5 text-pink-500" />,
};

// Capaian level colors
const CAPAIAN_COLORS: Record<string, string> = {
  "SANGAT BAIK": "bg-green-100 text-green-800 border-green-200",
  BAIK: "bg-blue-100 text-blue-800 border-blue-200",
  CUKUP: "bg-yellow-100 text-yellow-800 border-yellow-200",
  "PERLU BIMBINGAN": "bg-red-100 text-red-800 border-red-200",
};

// P5 Achievement levels
const P5_LEVELS = [
  { code: "MB", name: "Mulai Berkembang", color: "bg-yellow-500" },
  { code: "SB", name: "Sedang Berkembang", color: "bg-blue-500" },
  { code: "BSH", name: "Berkembang Sesuai Harapan", color: "bg-green-500" },
  { code: "SBH", name: "Sangat Berkembang", color: "bg-purple-500" },
];

interface P5Dimension {
  code: string;
  name: string;
  description: string;
  elements: string[];
}

export default function RaportMerdekaPage() {
  const { data: currentUnit } = useCurrentUnit();
  const [selectedTab, setSelectedTab] = useState("overview");
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [semester, setSemester] = useState<string>("1");
  const [studentSearch, setStudentSearch] = useState<string>("");

  const { data: p5Dimensions, isLoading: p5Loading } = useRaportMerdekaP5Dimensions();

  const { data: studentReportData, isLoading: reportLoading } = useRaportMerdekaStudentData(
    selectedStudentId,
    academicYearId,
    semester
  );

  const { data: cpMtk } = useRaportMerdekaCpMapping("MTK", "7-9");
  const { data: cpThf } = useRaportMerdekaCpMapping("THF", "7-9");

  const { data: students } = useRaportMerdekaStudentsList(currentUnit?.id, studentSearch);
  const { data: academicYears } = useRaportMerdekaAcademicYears();
  const exportPdfMutation = useExportRaportMerdekaPdf();

  const handleExportPDF = async () => {
    if (!selectedStudentId) {
      toast.error("Pilih siswa terlebih dahulu");
      return;
    }
    if (!academicYearId) {
      toast.error("Pilih tahun ajaran terlebih dahulu");
      return;
    }

    try {
      setIsExporting(true);

      const pdfData = await exportPdfMutation.mutateAsync({
        studentId: selectedStudentId,
        academicYearId,
        semester,
      });

      const selectedStudent = Array.isArray(students)
        ? students.find((s) => s.id === selectedStudentId)
        : null;
      const studentName = selectedStudent?.user?.name || "Siswa";

      const blob = new Blob([pdfData], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Raport_Merdeka_${studentName.replace(/\s+/g, "_")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Raport vector PDF berhasil diexport!");
    } catch (error) {
      console.error(error);
      toast.error("Gagal export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  if (p5Loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Memuat data Kurikulum Merdeka...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Raport Kurikulum Merdeka
            </h1>
            <p className="text-muted-foreground">
              Penilaian berbasis Capaian Pembelajaran (CP) dan Projek P5
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Template CP/TP
            </Button>
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              Generate Raport
            </Button>
          </div>
        </div>

        <Tabs
          value={selectedTab}
          onValueChange={setSelectedTab}
          className="space-y-4"
        >
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="p5">Projek P5</TabsTrigger>
            <TabsTrigger value="cp-tp">CP & TP</TabsTrigger>
            <TabsTrigger value="generate">Generate Raport</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Info Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Format Raport
                  </CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Kurikulum Merdeka</div>
                  <p className="text-xs text-muted-foreground">
                    Permendikbudristek No. 56/2022
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Dimensi P5
                  </CardTitle>
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">6 Dimensi</div>
                  <p className="text-xs text-muted-foreground">
                    Profil Pelajar Pancasila
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Fase Pembelajaran
                  </CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">A - F</div>
                  <p className="text-xs text-muted-foreground">
                    PAUD hingga SMA/SMK
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Conversion Table */}
            <Card>
              <CardHeader>
                <CardTitle>Konversi Nilai ke Capaian</CardTitle>
                <CardDescription>
                  Standar penilaian Kurikulum Merdeka berdasarkan level capaian
                  kompetensi
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rentang Nilai</TableHead>
                      <TableHead>Predikat</TableHead>
                      <TableHead>Level Capaian</TableHead>
                      <TableHead>Deskripsi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">91 - 100</TableCell>
                      <TableCell>
                        <Badge className="bg-green-500">A</Badge>
                      </TableCell>
                      <TableCell>Sangat Baik</TableCell>
                      <TableCell className="text-sm">
                        Sangat mampu mendemonstrasikan pemahaman dan
                        keterampilan di atas standar
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">76 - 90</TableCell>
                      <TableCell>
                        <Badge className="bg-blue-500">B</Badge>
                      </TableCell>
                      <TableCell>Baik</TableCell>
                      <TableCell className="text-sm">
                        Mampu mendemonstrasikan pemahaman dan keterampilan
                        sesuai standar
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">61 - 75</TableCell>
                      <TableCell>
                        <Badge className="bg-yellow-500">C</Badge>
                      </TableCell>
                      <TableCell>Cukup</TableCell>
                      <TableCell className="text-sm">
                        Cukup mampu mendemonstrasikan pemahaman sesuai standar
                        minimal
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">0 - 60</TableCell>
                      <TableCell>
                        <Badge className="bg-red-500">D</Badge>
                      </TableCell>
                      <TableCell>Perlu Bimbingan</TableCell>
                      <TableCell className="text-sm">
                        Perlu bimbingan lebih lanjut untuk mencapai kompetensi
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Fase Table */}
            <Card>
              <CardHeader>
                <CardTitle>Fase Pembelajaran Kurikulum Merdeka</CardTitle>
                <CardDescription>
                  Pembagian fase berdasarkan jenjang pendidikan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fase</TableHead>
                      <TableHead>Jenjang</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Usia (tahun)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <Badge variant="outline">Fondasi</Badge>
                      </TableCell>
                      <TableCell>PAUD</TableCell>
                      <TableCell>TK A - TK B</TableCell>
                      <TableCell>5 - 6</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge className="bg-blue-500">A</Badge>
                      </TableCell>
                      <TableCell>SD</TableCell>
                      <TableCell>1 - 2</TableCell>
                      <TableCell>6 - 8</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge className="bg-green-500">B</Badge>
                      </TableCell>
                      <TableCell>SD</TableCell>
                      <TableCell>3 - 4</TableCell>
                      <TableCell>8 - 10</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge className="bg-yellow-500">C</Badge>
                      </TableCell>
                      <TableCell>SD</TableCell>
                      <TableCell>5 - 6</TableCell>
                      <TableCell>10 - 12</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge className="bg-orange-500">D</Badge>
                      </TableCell>
                      <TableCell>SMP</TableCell>
                      <TableCell>7 - 9</TableCell>
                      <TableCell>12 - 15</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge className="bg-purple-500">E</Badge>
                      </TableCell>
                      <TableCell>SMA/SMK</TableCell>
                      <TableCell>10</TableCell>
                      <TableCell>15 - 16</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge className="bg-pink-500">F</Badge>
                      </TableCell>
                      <TableCell>SMA/SMK</TableCell>
                      <TableCell>11 - 12</TableCell>
                      <TableCell>16 - 18</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* P5 Tab */}
          <TabsContent value="p5" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-500" />
                  Profil Pelajar Pancasila (P5)
                </CardTitle>
                <CardDescription>
                  6 dimensi karakter yang dikembangkan melalui projek penguatan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {p5Dimensions?.map((dim) => (
                    <Card
                      key={dim.code}
                      className="hover:shadow-md transition-shadow"
                    >
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          {P5_ICONS[dim.code]}
                          <div>
                            <CardTitle className="text-base">
                              {dim.code}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {dim.name}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">
                          {dim.description}
                        </p>
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Elemen:</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {dim.elements.slice(0, 3).map((el, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                                {el}
                              </li>
                            ))}
                            {dim.elements.length > 3 && (
                              <li className="text-xs text-muted-foreground">
                                +{dim.elements.length - 3} elemen lainnya
                              </li>
                            )}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* P5 Achievement Levels */}
            <Card>
              <CardHeader>
                <CardTitle>Level Capaian P5</CardTitle>
                <CardDescription>
                  Skala penilaian untuk dimensi Profil Pelajar Pancasila
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  {P5_LEVELS.map((level) => (
                    <div
                      key={level.code}
                      className="text-center p-4 border rounded-lg"
                    >
                      <Badge className={level.color}>{level.code}</Badge>
                      <p className="font-medium mt-2">{level.name}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tema P5 */}
            <Card>
              <CardHeader>
                <CardTitle>Tema Projek P5</CardTitle>
                <CardDescription>
                  7 tema yang dapat dipilih untuk projek penguatan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    {
                      tema: "Gaya Hidup Berkelanjutan",
                      desc: "Eco-friendly living dan sustainability",
                    },
                    {
                      tema: "Kearifan Lokal",
                      desc: "Budaya dan tradisi masyarakat setempat",
                    },
                    {
                      tema: "Bhinneka Tunggal Ika",
                      desc: "Keberagaman dan toleransi",
                    },
                    {
                      tema: "Bangunlah Jiwa dan Raganya",
                      desc: "Kesehatan fisik dan mental",
                    },
                    {
                      tema: "Suara Demokrasi",
                      desc: "Partisipasi warga dan demokrasi",
                    },
                    {
                      tema: "Berekayasa dan Berteknologi",
                      desc: "Inovasi dan teknologi untuk kebaikan",
                    },
                    {
                      tema: "Kewirausahaan",
                      desc: "Entrepreneurship dan kreativitas ekonomi",
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 border rounded-lg"
                    >
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold text-primary">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-medium">{item.tema}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CP & TP Tab */}
          <TabsContent value="cp-tp" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  Capaian Pembelajaran (CP) & Tujuan Pembelajaran (TP)
                </CardTitle>
                <CardDescription>
                  CP adalah kompetensi yang harus dicapai, TP adalah langkah
                  menuju CP
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Matematika CP */}
                {cpMtk && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className="bg-blue-500">MTK</Badge>
                      <span className="font-medium">Matematika</span>
                      <Badge variant="outline">Fase {cpMtk.fase}</Badge>
                    </div>
                    <p className="text-sm font-medium mb-2">
                      Capaian Pembelajaran:
                    </p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {cpMtk.cp?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tahfidz CP */}
                {cpThf && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className="bg-green-500">THF</Badge>
                      <span className="font-medium">Tahfidz Al-Qur'an</span>
                      <Badge variant="outline">Fase {cpThf.fase}</Badge>
                    </div>
                    <p className="text-sm font-medium mb-2">
                      Capaian Pembelajaran:
                    </p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {cpThf.cp?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Select Subject for more CP */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  <p className="text-sm font-medium mb-3">
                    Lihat CP mata pelajaran lain:
                  </p>
                  <div className="flex gap-2">
                    <Select>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Pilih Mapel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IPA">IPA</SelectItem>
                        <SelectItem value="IPS">IPS</SelectItem>
                        <SelectItem value="BIG">Bahasa Inggris</SelectItem>
                        <SelectItem value="FIQ">Fiqih</SelectItem>
                        <SelectItem value="AQD">Aqidah Akhlak</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Fase" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Fase A</SelectItem>
                        <SelectItem value="B">Fase B</SelectItem>
                        <SelectItem value="C">Fase C</SelectItem>
                        <SelectItem value="D">Fase D</SelectItem>
                        <SelectItem value="E">Fase E</SelectItem>
                        <SelectItem value="F">Fase F</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="secondary">Tampilkan</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Generate Tab */}
          <TabsContent value="generate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="h-5 w-5" />
                  Generate Raport Merdeka
                </CardTitle>
                <CardDescription>
                  Pilih kelas dan semester untuk generate raport format
                  Kurikulum Merdeka
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Pilih Siswa</label>
                    <input
                      type="text"
                      placeholder="Cari siswa..."
                      className="w-full text-xs px-2 py-1 mb-1 border rounded"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                    <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Siswa" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.isArray(students) &&
                          students.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.user?.name || s.nis} ({s.nis})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tahun Ajaran</label>
                    <Select value={academicYearId} onValueChange={setAcademicYearId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Tahun" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.isArray(academicYears) &&
                          academicYears.map((ay) => (
                            <SelectItem key={ay.id} value={ay.id}>
                              {ay.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Semester</label>
                    <Select value={semester} onValueChange={setSemester}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Semester" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Semester 1 (Ganjil)</SelectItem>
                        <SelectItem value="2">Semester 2 (Genap)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  <Button onClick={handleExportPDF} disabled={isExporting}>
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Export ke PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live Preview Section */}
            <div className="border rounded-xl bg-muted/30 p-8 flex flex-col items-center gap-8 overflow-auto max-h-[800px]">
              {/* Container for PDF Capture */}
              <div ref={reportRef} className="space-y-8 bg-muted/30 p-4">
                {/* PAGE 1: AKADEMIK */}
                <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg rounded-sm p-[15mm] text-black text-sm space-y-4 relative print:shadow-none print:w-full print:border-none mx-auto">
                  {/* Watermark */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                    <div className="text-[100px] font-bold -rotate-45">
                      PREVIEW
                    </div>
                  </div>

                  {/* Header */}
                  <div className="text-center border-b-2 border-double border-black pb-4 mb-6">
                    <h2 className="font-bold text-lg uppercase tracking-wider">
                      Laporan Hasil Belajar
                    </h2>
                    <h3 className="font-bold text-base uppercase">
                      Sekolah Menengah Pertama (SMP) Cipansor
                    </h3>
                    <p className="text-xs mt-1">
                      Jl. Pendidikan No. 123, Kabupaten Bogor, Jawa Barat
                    </p>
                  </div>

                  {/* Student Info */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-6">
                    <div className="grid grid-cols-[100px_1fr]">
                      <div>Nama Peserta Didik</div>
                      <div className="font-semibold">: {studentReportData?.siswa?.nama || "-"}</div>
                      <div>NIS / NISN</div>
                      <div>: {studentReportData?.siswa?.nis || "-"} / {studentReportData?.siswa?.nisn || "-"}</div>
                      <div>Sekolah</div>
                      <div>: {studentReportData?.siswa?.unit || currentUnit?.name || "-"}</div>
                    </div>
                    <div className="grid grid-cols-[100px_1fr]">
                      <div>Kelas</div>
                      <div>: {studentReportData?.siswa?.kelas || "-"}</div>
                      <div>Fase</div>
                      <div>: {studentReportData?.siswa?.fase || "-"}</div>
                      <div>Semester</div>
                      <div>: {semester} ({semester === "1" ? "Ganjil" : "Genap"})</div>
                      <div>Tahun Pelajaran</div>
                      <div>: {studentReportData?.tahunAjaran?.tahun || "-"}</div>
                    </div>
                  </div>

                  {/* Content - Academic */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-sm">A. Nilai Akademik</h4>
                    {reportLoading ? (
                      <div className="flex items-center justify-center p-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Memuat nilai akademik...
                      </div>
                    ) : (
                      <table className="w-full border-collapse border border-black text-xs">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-black p-2 w-8">No</th>
                            <th className="border border-black p-2 w-[25%] font-bold text-left">
                              Mata Pelajaran
                            </th>
                            <th className="border border-black p-2 w-12 font-bold">
                              Nilai Akhir
                            </th>
                            <th className="border border-black p-2 font-bold text-left">
                              Capaian Kompetensi
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const allSubjects = [
                              ...(studentReportData?.intrakurikuler?.kelompokUmum || []),
                              ...(studentReportData?.intrakurikuler?.kelompokPesantren || []),
                            ];

                            if (allSubjects.length > 0) {
                              return allSubjects.map((item, idx) => (
                                <tr key={idx} className="align-top">
                                  <td className="border border-black p-2 text-center">{idx + 1}</td>
                                  <td className="border border-black p-2 font-medium">{item.subjectName}</td>
                                  <td className="border border-black p-2 text-center font-bold">{item.nilaiAkhir}</td>
                                  <td className="border border-black p-2"><p>{item.deskripsi}</p></td>
                                </tr>
                              ));
                            }

                            return (
                              <tr>
                                <td colSpan={4} className="border border-black p-4 text-center text-muted-foreground">
                                  {selectedStudentId
                                    ? "Belum ada data nilai intrakurikuler untuk siswa dan semester ini."
                                    : "Pilih siswa dan tahun ajaran di atas untuk melihat preview nilai."}
                                </td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Content - Extracurricular */}
                  <div className="space-y-4 pt-4">
                    <h4 className="font-bold text-sm">B. Ekstrakurikuler</h4>
                    <table className="w-full border-collapse border border-black text-xs">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-black p-2 w-8">No</th>
                          <th className="border border-black p-2 w-[30%] font-bold text-left">
                            Kegiatan Ekstrakurikuler
                          </th>
                          <th className="border border-black p-2 w-16 font-bold">
                            Predikat
                          </th>
                          <th className="border border-black p-2 font-bold text-left">
                            Keterangan
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentReportData?.ekstrakurikuler && studentReportData.ekstrakurikuler.length > 0 ? (
                          studentReportData.ekstrakurikuler.map((ekstra, idx) => (
                            <tr key={idx}>
                              <td className="border border-black p-2 text-center">{idx + 1}</td>
                              <td className="border border-black p-2">{ekstra.nama}</td>
                              <td className="border border-black p-2 text-center">{ekstra.predikat}</td>
                              <td className="border border-black p-2">{ekstra.keterangan}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="border border-black p-4 text-center text-muted-foreground">
                              {selectedStudentId
                                ? "Tidak ada kegiatan ekstrakurikuler terdaftar."
                                : "Pilih siswa di atas untuk melihat kegiatan ekstrakurikuler."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Attendance */}
                  <div className="space-y-4 pt-4">
                    <h4 className="font-bold text-sm">C. Ketidakhadiran</h4>
                    <div className="border border-black w-1/2 text-xs">
                      <div className="grid grid-cols-[1fr_60px] border-b border-black last:border-0">
                        <div className="p-2 border-r border-black">Sakit</div>
                        <div className="p-2 text-center">
                          {studentReportData?.kehadiran?.sakit ?? "-"} hari
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_60px] border-b border-black last:border-0">
                        <div className="p-2 border-r border-black">Izin</div>
                        <div className="p-2 text-center">
                          {studentReportData?.kehadiran?.izin ?? "-"} hari
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_60px] border-b border-black last:border-0">
                        <div className="p-2 border-r border-black">
                          Tanpa Keterangan
                        </div>
                        <div className="p-2 text-center">
                          {studentReportData?.kehadiran?.alpa ?? "-"} hari
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Signature */}
                  <div className="flex justify-between items-end pt-12 text-xs px-8">
                    <div className="text-center">
                      <p>Mengetahui,</p>
                      <p>Orang Tua/Wali</p>
                      <br />
                      <br />
                      <br />
                      <p className="border-b border-black min-w-[150px] inline-block"></p>
                    </div>
                    <div className="text-center">
                      <p>
                        {studentReportData?.tanggalCetak
                          ? `Bogor, ${new Date(studentReportData.tanggalCetak).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
                          : "Bogor, ........................"}
                      </p>
                      <p>Wali Kelas</p>
                      <br />
                      <br />
                      <br />
                      <p className="font-bold underline">
                        {studentReportData?.waliKelas?.nama ?? "-"}
                      </p>
                      <p>NIP. {studentReportData?.waliKelas?.nip ?? "-"}</p>
                    </div>
                  </div>
                </div>

                {/* PAGE 2: PESANTREN (TAHFIDZ & BEHAVIOR) */}
                <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg rounded-sm p-[15mm] text-black text-sm space-y-6 relative print:shadow-none print:w-full print:border-none mx-auto">
                  {/* Header Page 2 */}
                  <div className="text-center border-b-2 border-double border-black pb-4 mb-6">
                    <h2 className="font-bold text-lg uppercase tracking-wider">
                      Laporan Perkembangan Pesantren
                    </h2>
                    <h3 className="font-bold text-base uppercase">
                      SMP Islam Terpadu Cipansor
                    </h3>
                  </div>

                  {/* Student Info Review */}
                  <div className="border-b pb-2 mb-4">
                    <p className="font-semibold">
                      Nama: {studentReportData?.siswa?.nama || "-"} (Kelas: {studentReportData?.siswa?.kelas || "-"})
                    </p>
                  </div>

                  {/* D. TAHFIDZ AL-QURAN */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-green-50 p-2 rounded border border-green-100">
                      <h4 className="font-bold text-green-900">
                        D. Tahfidz Al-Qur'an
                      </h4>
                      <Badge className="bg-green-600">
                        Target: {studentReportData?.tahfidz?.targetCapaian ?? "-"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="border rounded p-4 space-y-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                          Capaian Hafalan (Ziyadah)
                        </div>
                        <div className="text-3xl font-bold text-green-700">
                          {studentReportData?.tahfidz?.totalJuz ?? "-"} Juz
                        </div>
                        <p className="text-sm">
                          Terakhir: {studentReportData?.tahfidz?.surahTerakhir ?? "-"}
                        </p>
                      </div>
                      <div className="border rounded p-4 space-y-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                          Predikat Murojaah
                        </div>
                        <div className="text-3xl font-bold text-blue-700">
                          {studentReportData?.tahfidz?.statusCapaian ?? "-"}
                        </div>
                        <p className="text-sm">
                          {studentReportData?.tahfidz?.catatan ?? "-"}
                        </p>
                      </div>
                    </div>

                    <table className="w-full border-collapse border border-black text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-black p-2 text-left">
                            Aspek Penilaian
                          </th>
                          <th className="border border-black p-2 w-24 text-center">
                            Predikat
                          </th>
                          <th className="border border-black p-2 text-left">
                            Deskripsi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStudentId && studentReportData?.tahfidz ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="border border-black p-4 text-center text-muted-foreground"
                            >
                              Rincian aspek penilaian tahfidz belum tersedia.
                              Ringkasan capaian dapat dilihat di atas.
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td
                              colSpan={3}
                              className="border border-black p-4 text-center text-muted-foreground"
                            >
                              {selectedStudentId
                                ? "Belum ada data tahfidz untuk siswa ini."
                                : "Pilih siswa untuk melihat capaian tahfidz."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* E. KEPRIBADIAN & AKHLAK */}
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center justify-between bg-blue-50 p-2 rounded border border-blue-100">
                      <h4 className="font-bold text-blue-900">
                        E. Kepribadian & Akhlak (Behavior)
                      </h4>
                    </div>

                    <table className="w-full border-collapse border border-black text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-black p-2 w-8 text-center">
                            No
                          </th>
                          <th className="border border-black p-2">Kategori</th>
                          <th className="border border-black p-2">
                            Catatan Guru / Musyrif
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td
                            colSpan={3}
                            className="border border-black p-4 text-center text-muted-foreground"
                          >
                            {selectedStudentId
                              ? "Belum ada catatan perilaku untuk siswa ini."
                              : "Pilih siswa untuk melihat catatan perilaku."}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* F. IBADAH HARIAN */}
                  <div className="space-y-4 pt-4">
                    <h4 className="font-bold text-sm bg-gray-100 p-1">
                      F. Ibadah Harian
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="border p-2 rounded">
                        <div className="text-muted-foreground">
                          Sholat Berjamaah
                        </div>
                        <div className="text-lg font-bold">-</div>
                      </div>
                      <div className="border p-2 rounded">
                        <div className="text-muted-foreground">
                          Sholat Dhuha
                        </div>
                        <div className="text-lg font-bold">-</div>
                      </div>
                      <div className="border p-2 rounded">
                        <div className="text-muted-foreground">
                          Puasa Sunnah
                        </div>
                        <div className="text-lg font-bold">-</div>
                      </div>
                    </div>
                  </div>

                  {/* Signature */}
                  <div className="flex justify-between items-end pt-8 text-xs px-8">
                    <div className="text-center">
                      <p>Mengetahui,</p>
                      <p>Kepala Pesantren</p>
                      <br />
                      <br />
                      <br />
                      <p className="font-bold underline">
                        {studentReportData?.pimpinanUnit?.nama ?? "-"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p>
                        {studentReportData?.tanggalCetak
                          ? `Bogor, ${new Date(studentReportData.tanggalCetak).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
                          : "Bogor, ........................"}
                      </p>
                      <p>Wali Kelas</p>
                      <br />
                      <br />
                      <br />
                      <p className="font-bold underline">
                        {studentReportData?.waliKelas?.nama ?? "-"}
                      </p>
                    </div>
                  </div>

                  {/* Footer Page 2 */}
                  <div className="absolute bottom-10 right-10 text-[10px] text-gray-400">
                    Halaman 2 dari 2
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
