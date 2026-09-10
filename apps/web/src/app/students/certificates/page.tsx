"use client";
import { useState, useRef } from "react";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout/main-layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStudents, Student } from "@/hooks/use-students";
import { useUnits } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";
import {
  CERTIFICATE_TEMPLATES,
  CertificateType,
  generateCertificateNumber,
} from "@/hooks/use-certificate";
import {
  Award,
  Printer,
  Download,
  Search,
  User,
  GraduationCap,
  BookOpen,
  Trophy,
  Heart,
  FileText,
  ChevronRight,
  CheckCircle2,
  Calendar,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

import { id as idLocale } from "date-fns/locale";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  GraduationCap,
  BookOpen,
  Trophy,
  Award,
  Heart,
};

interface CertificateFormData {
  type: CertificateType;
  title: string;
  description: string;
  issuedDate: string;
  metadata: Record<string, string>;
}

export default function CertificateGeneratorPage() {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState("select-student");
  const [formData, setFormData] = useState<CertificateFormData>({
    type: "GRADUATION",
    title: "",
    description: "",
    issuedDate: safeFormat(new Date(), "yyyy-MM-dd"),
    metadata: {},
  });
  const printRef = useRef<HTMLDivElement>(null);

  const { data: units = [], isLoading: unitsLoading } = useUnits();
  const { data: classesData, isLoading: classesLoading } = useClasses({
    unitId: selectedUnitId || undefined,
  });
  const classes = classesData?.data || [];
  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    unitId: selectedUnitId || undefined,
    classId: selectedClassId || undefined,
    search: searchQuery || undefined,
    status: "ACTIVE",
    limit: 50,
  });

  const students = studentsData?.data || [];
  const selectedTemplate = CERTIFICATE_TEMPLATES.find(
    (t) => t.type === formData.type,
  );
  const certificateNumber = generateCertificateNumber(formData.type, "CPN");

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setActiveTab("select-type");
  };

  const handleSelectType = (type: CertificateType) => {
    const template = CERTIFICATE_TEMPLATES.find((t) => t.type === type);
    setFormData({
      ...formData,
      type,
      title: template?.label || "",
      metadata: {},
    });
    setActiveTab("fill-details");
  };

  const handleMetadataChange = (key: string, value: string) => {
    setFormData({
      ...formData,
      metadata: {
        ...formData.metadata,
        [key]: value,
      },
    });
  };

  const handlePrint = () => {
    if (!selectedStudent) {
      toast.error("Pilih siswa terlebih dahulu");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup diblokir. Izinkan popup untuk mencetak.");
      return;
    }

    const printContent = printRef.current?.innerHTML || "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sertifikat - ${selectedStudent.name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Great+Vibes&family=Noto+Serif:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4 landscape;
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Noto Serif', serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);

    toast.success("Sertifikat siap dicetak");
  };

  const renderCertificatePreview = () => {
    if (!selectedStudent || !selectedTemplate) return null;

    const bgGradient: Record<string, string> = {
      GRADUATION: "linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)",
      TAHFIDZ: "linear-gradient(135deg, #065f46 0%, #022c22 100%)",
      ACHIEVEMENT: "linear-gradient(135deg, #92400e 0%, #451a03 100%)",
      COURSE_COMPLETION: "linear-gradient(135deg, #5b21b6 0%, #2e1065 100%)",
      APPRECIATION: "linear-gradient(135deg, #be185d 0%, #500724 100%)",
      IJAZAH: "linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)",
      STTB: "linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)",
      SANAD: "linear-gradient(135deg, #065f46 0%, #022c22 100%)",
      PARTICIPATION: "linear-gradient(135deg, #5b21b6 0%, #2e1065 100%)",
      OTHER: "linear-gradient(135deg, #4b5563 0%, #1f2937 100%)",
    };

    const accentColor: Record<string, string> = {
      GRADUATION: "#c9a227",
      TAHFIDZ: "#10b981",
      ACHIEVEMENT: "#f59e0b",
      COURSE_COMPLETION: "#8b5cf6",
      APPRECIATION: "#ec4899",
      IJAZAH: "#c9a227",
      STTB: "#c9a227",
      SANAD: "#10b981",
      PARTICIPATION: "#8b5cf6",
      OTHER: "#9ca3af",
    };

    return (
      <div
        ref={printRef}
        className="w-[297mm] h-[210mm] relative overflow-hidden"
        style={{
          background: bgGradient[formData.type],
        }}
      >
        {/* Decorative Border */}
        <div
          className="absolute inset-4 border-4 rounded-lg"
          style={{ borderColor: accentColor[formData.type] }}
        >
          <div
            className="absolute inset-2 border-2 rounded"
            style={{ borderColor: accentColor[formData.type], opacity: 0.5 }}
          />
        </div>

        {/* Corner Decorations */}
        <div className="absolute top-8 left-8 w-24 h-24 opacity-20">
          <svg viewBox="0 0 100 100" fill={accentColor[formData.type]}>
            <path d="M0,0 L50,0 L50,10 L10,10 L10,50 L0,50 Z" />
            <circle cx="60" cy="60" r="20" />
          </svg>
        </div>
        <div className="absolute top-8 right-8 w-24 h-24 opacity-20 rotate-90">
          <svg viewBox="0 0 100 100" fill={accentColor[formData.type]}>
            <path d="M0,0 L50,0 L50,10 L10,10 L10,50 L0,50 Z" />
            <circle cx="60" cy="60" r="20" />
          </svg>
        </div>
        <div className="absolute bottom-8 left-8 w-24 h-24 opacity-20 -rotate-90">
          <svg viewBox="0 0 100 100" fill={accentColor[formData.type]}>
            <path d="M0,0 L50,0 L50,10 L10,10 L10,50 L0,50 Z" />
            <circle cx="60" cy="60" r="20" />
          </svg>
        </div>
        <div className="absolute bottom-8 right-8 w-24 h-24 opacity-20 rotate-180">
          <svg viewBox="0 0 100 100" fill={accentColor[formData.type]}>
            <path d="M0,0 L50,0 L50,10 L10,10 L10,50 L0,50 Z" />
            <circle cx="60" cy="60" r="20" />
          </svg>
        </div>

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-16 py-12">
          {/* Header */}
          <div className="text-center mb-4">
            <p className="text-sm tracking-[0.3em] uppercase opacity-80">
              Yayasan Pendidikan Islam
            </p>
            <h1
              className="text-3xl font-bold tracking-wide mt-1"
              style={{
                fontFamily: "'Cinzel', serif",
                color: accentColor[formData.type],
              }}
            >
              CIPANSOR
            </h1>
            <p className="text-xs opacity-70 mt-1">
              {selectedStudent.unit?.name}
            </p>
          </div>

          {/* Certificate Type */}
          <div className="text-center mb-6">
            <p
              className="text-5xl font-bold tracking-widest"
              style={{ fontFamily: "'Cinzel', serif" }}
            >
              {selectedTemplate.label.toUpperCase()}
            </p>
            <p className="text-sm opacity-70 mt-1 italic">
              {selectedTemplate.labelEn}
            </p>
          </div>

          {/* Certificate Number */}
          <p className="text-xs opacity-60 mb-4">No: {certificateNumber}</p>

          {/* Main Text */}
          <div className="text-center mb-6">
            <p className="text-lg mb-3">Diberikan kepada:</p>
            <p
              className="text-4xl mb-2"
              style={{
                fontFamily: "'Great Vibes', cursive",
                color: accentColor[formData.type],
              }}
            >
              {selectedStudent.name}
            </p>
            <p className="text-sm opacity-80">NISN: {selectedStudent.nisn}</p>
          </div>

          {/* Description */}
          <div className="text-center mb-6 max-w-2xl">
            {formData.type === "GRADUATION" && (
              <p className="text-base leading-relaxed">
                Telah menyelesaikan pendidikan di{" "}
                {selectedStudent.unit?.name || "unit"} dengan
                {formData.metadata.finalGrade &&
                  ` nilai ${formData.metadata.finalGrade}`}
                {formData.metadata.rank &&
                  ` dan meraih peringkat ${formData.metadata.rank}`}
                {formData.metadata.graduationYear &&
                  ` pada tahun ${formData.metadata.graduationYear}`}
                .
              </p>
            )}
            {formData.type === "TAHFIDZ" && (
              <p className="text-base leading-relaxed">
                Telah menyelesaikan hafalan Al-Quran sebanyak{" "}
                <strong>{formData.metadata.juzCount || "-"} Juz</strong>
                {formData.metadata.completedJuz &&
                  ` (${formData.metadata.completedJuz})`}
                {formData.metadata.grade &&
                  ` dengan predikat ${formData.metadata.grade}`}
                .
              </p>
            )}
            {formData.type === "ACHIEVEMENT" && (
              <p className="text-base leading-relaxed">
                Atas prestasi{" "}
                {formData.metadata.achievementType &&
                  `dalam bidang ${formData.metadata.achievementType}`}
                : <strong>{formData.metadata.achievement || "-"}</strong>
                {formData.metadata.level &&
                  ` tingkat ${formData.metadata.level}`}
                {formData.metadata.rank &&
                  ` dengan raihan ${formData.metadata.rank}`}
                .
              </p>
            )}
            {formData.type === "COURSE_COMPLETION" && (
              <p className="text-base leading-relaxed">
                Telah menyelesaikan{" "}
                <strong>{formData.metadata.courseName || "-"}</strong>
                {formData.metadata.duration &&
                  ` selama ${formData.metadata.duration}`}
                {formData.metadata.score &&
                  ` dengan nilai ${formData.metadata.score}`}
                .
              </p>
            )}
            {formData.type === "APPRECIATION" && (
              <p className="text-base leading-relaxed">
                Atas <strong>{formData.metadata.reason || "-"}</strong>
                {formData.metadata.event &&
                  ` dalam kegiatan ${formData.metadata.event}`}
                {formData.metadata.role && ` sebagai ${formData.metadata.role}`}
                .
              </p>
            )}
            {formData.description && (
              <p className="text-sm mt-2 opacity-90">{formData.description}</p>
            )}
          </div>

          {/* Date */}
          <p className="text-sm mb-8">
            Ditetapkan di .............,{" "}
            {safeFormat(new Date(formData.issuedDate), "d MMMM yyyy", {
              locale: idLocale,
            })}
          </p>

          {/* Signatures */}
          <div className="flex justify-center gap-32 w-full">
            <div className="text-center">
              <p className="text-sm mb-16">
                Kepala{" "}
                {selectedStudent.unit?.type === "SD_IT"
                  ? "Sekolah"
                  : selectedStudent.unit?.type === "SMP_IT" ||
                      selectedStudent.unit?.type === "SMA_IT" ||
                      selectedStudent.unit?.type === "MA"
                    ? "Madrasah"
                    : "Lembaga"}
              </p>
              <div
                className="w-48 border-b mb-2"
                style={{ borderColor: accentColor[formData.type] }}
              />
              <p className="text-sm font-semibold">
                (.................................)
              </p>
            </div>
            {formData.type === "TAHFIDZ" && formData.metadata.teacherName && (
              <div className="text-center">
                <p className="text-sm mb-16">Musyrif/ah</p>
                <div
                  className="w-48 border-b mb-2"
                  style={{ borderColor: accentColor[formData.type] }}
                />
                <p className="text-sm font-semibold">
                  {formData.metadata.teacherName}
                </p>
              </div>
            )}
            <div className="text-center">
              <p className="text-sm mb-16">Ketua Yayasan</p>
              <div
                className="w-48 border-b mb-2"
                style={{ borderColor: accentColor[formData.type] }}
              />
              <p className="text-sm font-semibold">
                (.................................)
              </p>
            </div>
          </div>
        </div>

        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
          <GraduationCap
            className="w-96 h-96"
            style={{ color: accentColor[formData.type] }}
          />
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Award className="h-6 w-6 text-primary" />
              Generator Sertifikat
            </h1>
            <p className="text-muted-foreground">
              Buat sertifikat kelulusan, tahfidz, penghargaan, dan lainnya
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={handlePrint}
              disabled={!selectedStudent}
              className="transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <Printer className="h-4 w-4 mr-2" />
              Cetak Sertifikat
            </Button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${activeTab === "select-student" ? "bg-primary text-primary-foreground" : selectedStudent ? "bg-green-100 text-green-800" : "bg-muted"}`}
          >
            {selectedStudent ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">
                1
              </span>
            )}
            <span className="text-sm font-medium">Pilih Siswa</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${activeTab === "select-type" ? "bg-primary text-primary-foreground" : formData.type && selectedStudent ? "bg-green-100 text-green-800" : "bg-muted"}`}
          >
            <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">
              2
            </span>
            <span className="text-sm font-medium">Pilih Jenis</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${activeTab === "fill-details" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">
              3
            </span>
            <span className="text-sm font-medium">Isi Detail</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="hidden">
            <TabsTrigger value="select-student">Pilih Siswa</TabsTrigger>
            <TabsTrigger value="select-type">Pilih Jenis</TabsTrigger>
            <TabsTrigger value="fill-details">Isi Detail</TabsTrigger>
          </TabsList>

          {/* Step 1: Select Student */}
          <TabsContent value="select-student" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Pilih Siswa
                </CardTitle>
                <CardDescription>
                  Cari dan pilih siswa yang akan menerima sertifikat
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="glass-card p-4 rounded-xl flex flex-col gap-4 md:flex-row mb-6 shadow-sm border-none">
                  <Select
                    value={selectedUnitId}
                    onValueChange={(value) => {
                      setSelectedUnitId(value);
                      setSelectedClassId("");
                    }}
                  >
                    <SelectTrigger className="w-full md:w-48 bg-background/50 backdrop-blur-sm border-muted-foreground/20">
                      <SelectValue placeholder="Pilih unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Semua Unit</SelectItem>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedClassId}
                    onValueChange={setSelectedClassId}
                    disabled={!selectedUnitId}
                  >
                    <SelectTrigger className="w-full md:w-48 bg-background/50 backdrop-blur-sm border-muted-foreground/20">
                      <SelectValue placeholder="Pilih kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Semua Kelas</SelectItem>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama atau NISN..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-background/50 backdrop-blur-sm border-muted-foreground/20"
                    />
                  </div>
                </div>

                {studentsLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <Skeleton key={i} className="h-24" />
                    ))}
                  </div>
                ) : students.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Tidak ada siswa ditemukan</p>
                    <p className="text-sm">
                      Gunakan filter untuk mencari siswa
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {students.map((student) => {
                      const initials = student.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase();
                      const isSelected = selectedStudent?.id === student.id;

                      return (
                        <div
                          key={student.id}
                          className={`
                            flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all
                            ${isSelected ? "bg-primary/10 border-primary ring-2 ring-primary" : "hover:bg-muted hover:border-muted-foreground/50"}
                          `}
                          onClick={() => handleSelectStudent(student)}
                        >
                          <Avatar className="h-12 w-12">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {student.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              NISN: {student.nisn}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {student.currentClass?.name || "-"} •{" "}
                              {student.unit?.name}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 2: Select Certificate Type */}
          <TabsContent value="select-type" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Pilih Jenis Sertifikat
                </CardTitle>
                <CardDescription>
                  {selectedStudent && (
                    <span>
                      Untuk: <strong>{selectedStudent.name}</strong> (
                      {selectedStudent.nisn})
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {CERTIFICATE_TEMPLATES.map((template) => {
                    const Icon = iconMap[template.icon] || Award;
                    const isSelected = formData.type === template.type;

                    return (
                      <div
                        key={template.type}
                        className={`
                          p-6 rounded-xl border-2 cursor-pointer transition-all
                          ${isSelected ? "border-primary bg-primary/5 shadow-lg" : "border-muted hover:border-muted-foreground/50 hover:bg-muted/50"}
                        `}
                        onClick={() => handleSelectType(template.type)}
                      >
                        <div
                          className={`w-12 h-12 rounded-lg ${template.color} flex items-center justify-center mb-4`}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <h3 className="font-semibold mb-1">{template.label}</h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {template.labelEn}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {template.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 3: Fill Details */}
          <TabsContent value="fill-details" className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Detail Sertifikat
                  </CardTitle>
                  <CardDescription>
                    Isi detail informasi untuk sertifikat
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Student Info */}
                  {selectedStudent && (
                    <div className="p-4 bg-muted rounded-lg flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-emerald-100 text-emerald-700">
                          {selectedStudent.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{selectedStudent.name}</p>
                        <p className="text-sm text-muted-foreground">
                          NISN: {selectedStudent.nisn} •{" "}
                          {selectedStudent.unit?.name}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Certificate Type */}
                  {selectedTemplate && (
                    <div className="flex items-center gap-2">
                      <Badge className={selectedTemplate.color}>
                        {selectedTemplate.label}
                      </Badge>
                    </div>
                  )}

                  {/* Issue Date */}
                  <div className="space-y-2">
                    <Label>Tanggal Terbit</Label>
                    <Input
                      type="date"
                      value={formData.issuedDate}
                      onChange={(e) =>
                        setFormData({ ...formData, issuedDate: e.target.value })
                      }
                    />
                  </div>

                  {/* Dynamic Fields based on Template */}
                  {selectedTemplate?.fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label>
                        {field.label}
                        {field.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </Label>
                      {field.type === "select" ? (
                        <Select
                          value={formData.metadata[field.key] || ""}
                          onValueChange={(value) =>
                            handleMetadataChange(field.key, value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={`Pilih ${field.label.toLowerCase()}`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={field.type}
                          value={formData.metadata[field.key] || ""}
                          onChange={(e) =>
                            handleMetadataChange(field.key, e.target.value)
                          }
                          placeholder={`Masukkan ${field.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}

                  {/* Additional Description */}
                  <div className="space-y-2">
                    <Label>Keterangan Tambahan (Opsional)</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      placeholder="Tambahkan keterangan jika diperlukan..."
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setActiveTab("select-type")}
                    >
                      Kembali
                    </Button>
                    <Button onClick={handlePrint} className="flex-1">
                      <Printer className="h-4 w-4 mr-2" />
                      Cetak Sertifikat
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview Sertifikat</CardTitle>
                  <CardDescription>
                    Tampilan sertifikat yang akan dicetak (ukuran A4 landscape)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden bg-gray-100">
                    <div className="transform scale-[0.35] origin-top-left w-[286%] -mb-[65%]">
                      {renderCertificatePreview()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Hidden Print Area */}
        <div className="hidden">{renderCertificatePreview()}</div>
      </div>
    </MainLayout>
  );
}
