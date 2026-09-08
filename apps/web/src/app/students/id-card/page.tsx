"use client";

import { useState, useRef, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStudents, Student } from "@/hooks/use-students";
import { useClasses } from "@/hooks/use-classes";
import { useUnits } from "@/hooks/use-units";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  IdCard,
  Printer,
  Download,
  Search,
  User,
  School,
  Calendar,
  Phone,
  QrCode,
  CheckCircle2,
  XCircle,
  Eye,
  Users,
  Scan,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

/**
 * The QR printed on a student card.
 *
 * What stood here was not a QR code. It hashed the value with a 32-bit string
 * hash, laid 49 pseudo-random cells into a 7×7 grid, and then — in its own
 * words — filled the corners "for QR-like appearance". No scanner could read
 * it, because there was nothing encoded to read. Cards were being printed with
 * a decorative checkerboard where the machine-readable part belongs.
 *
 * `qrcode.react` was already a dependency of this app and simply unused here.
 *
 * It encodes the NIS alone, deliberately. The old payload was a JSON object
 * carrying nis, name, unit and year — around 90 characters, which forces a
 * version-6 symbol of 41×41 modules. At the 48px this card allots (roughly
 * 12mm on an ID-1 card) that is about 0.3mm per module: below what a phone
 * camera resolves, so a "real" QR at that size would still have been
 * unscannable, just honestly so. The NIS fits in a version-1 symbol at 21×21,
 * and it is the identifier staff can act on — the name and unit are already
 * printed in plain text beside it.
 */
function StudentQRCode({ value, size = 64 }: { value: string; size?: number }) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="L"
      marginSize={2}
    />
  );
}

interface StudentCardProps {
  student: Student;
  unitName?: string;
  showPreview?: boolean;
}

function StudentIDCard({
  student,
  unitName,
  showPreview = false,
}: StudentCardProps) {
  const initials = student.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const { data: cardDetails, isLoading: cardLoading } = useQuery({
    queryKey: ["student-id-card-details", student.id],
    queryFn: async () => {
      const res = await api.get(`/students/${student.id}/id-card`);
      return res.data.data;
    },
    enabled: !!student.id,
  });

  const qrPayload = cardDetails?.cardData?.qrCode?.data;

  return (
    <div
      className={`
        bg-linear-to-br from-emerald-500 to-teal-600 text-white rounded-xl overflow-hidden shadow-lg
        ${showPreview ? "w-[340px]" : "w-full max-w-[340px]"}
      `}
      style={{ aspectRatio: "85.6/53.98" }}
    >
      {/* Header */}
      <div className="bg-white/10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <School className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="text-xs">
            <p className="font-bold">CIPANSOR</p>
            <p className="text-[10px] opacity-80">Yayasan Pendidikan Islam</p>
          </div>
        </div>
        <Badge className="bg-white/20 text-white text-[10px]">SISWA</Badge>
      </div>

      {/* Content */}
      <div className="px-4 py-3 flex gap-3">
        {/* Photo */}
        <div className="shrink-0">
          <Avatar className="w-16 h-20 rounded-lg border-2 border-white/30">
            <AvatarImage
              src={`/api/students/${student.id}/photo`}
              alt={student.name}
            />
            <AvatarFallback className="bg-white/20 text-white text-lg rounded-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-bold text-sm truncate">{student.name}</p>
          <div className="space-y-0.5 text-[10px] opacity-90">
            <p className="flex items-center gap-1">
              <IdCard className="h-3 w-3" />
              NIS: {student.nis}
            </p>
            <p className="flex items-center gap-1">
              <School className="h-3 w-3" />
              {student.unit?.name || unitName}
            </p>
            {student.currentClass && (
              <p className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Kelas: {student.currentClass.name}
              </p>
            )}
            <p className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(student.birthDate).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* QR Code */}
        <div className="shrink-0 bg-white p-1 rounded min-w-[66px] min-h-[66px] flex items-center justify-center">
          {cardLoading || !qrPayload ? (
            <Skeleton className="h-[64px] w-[64px] rounded" />
          ) : (
            <StudentQRCode value={qrPayload} size={64} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white/10 px-4 py-1.5 flex items-center justify-between text-[9px]">
        <span>
          Berlaku: TA {new Date().getFullYear()}/{new Date().getFullYear() + 1}
        </span>
        <span className="opacity-75">ID: {student.id.substring(0, 8)}</span>
      </div>
    </div>
  );
}

function StudentIDCardBack({ student }: { student: Student }) {
  return (
    <div
      className="bg-linear-to-br from-gray-100 to-gray-200 text-gray-800 rounded-xl overflow-hidden shadow-lg w-full max-w-[340px]"
      style={{ aspectRatio: "85.6/53.98" }}
    >
      {/* Header */}
      <div className="bg-emerald-600 text-white px-4 py-2 text-center">
        <p className="font-bold text-xs">KARTU PELAJAR</p>
        <p className="text-[10px] opacity-90">
          CIPANSOR - Yayasan Pendidikan Islam
        </p>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-2 text-xs">
        <div>
          <p className="text-[10px] text-gray-500">Kontak Orang Tua/Wali:</p>
          <p className="font-medium">{student.parentName}</p>
          <p className="flex items-center gap-1 text-[10px]">
            <Phone className="h-3 w-3" />
            {student.parentPhone}
          </p>
        </div>

        <div>
          <p className="text-[10px] text-gray-500">Alamat:</p>
          <p className="text-[10px] line-clamp-2">{student.address}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-emerald-600 text-white px-4 py-1.5 text-center text-[9px]">
        <p>Jika menemukan kartu ini, hubungi: (021) 123-4567</p>
      </div>
    </div>
  );
}

export default function StudentIDCardPage() {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
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
    limit: 100,
  });

  const students = studentsData?.data || [];

  const handleSelectAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map((s) => s.id));
    }
  };

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  const handlePrint = () => {
    if (selectedStudents.length === 0) {
      toast.error("Pilih minimal satu siswa untuk dicetak");
      return;
    }

    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup diblokir. Izinkan popup untuk mencetak.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Kartu Pelajar</title>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            .card-container {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 16px;
              page-break-inside: avoid;
            }
            .card {
              width: 85.6mm;
              height: 53.98mm;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          </style>
        </head>
        <body class="p-4">
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);

    toast.success(`${selectedStudents.length} kartu siap dicetak`);
  };

  const selectedStudentsList = students.filter((s) =>
    selectedStudents.includes(s.id),
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <IdCard className="h-6 w-6 text-primary" />
              Generator Kartu Pelajar
            </h1>
            <p className="text-muted-foreground">
              Buat dan cetak kartu identitas siswa dengan QR code
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={handlePrint}
              disabled={selectedStudents.length === 0}
            >
              <Printer className="h-4 w-4 mr-2" />
              Cetak{" "}
              {selectedStudents.length > 0
                ? `(${selectedStudents.length})`
                : ""}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Student Selection */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row">
                  {/* Unit Select */}
                  <div className="flex-1">
                    <Select
                      value={selectedUnitId}
                      onValueChange={(value) => {
                        setSelectedUnitId(value);
                        setSelectedClassId("");
                        setSelectedStudents([]);
                      }}
                    >
                      <SelectTrigger>
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
                  </div>

                  {/* Class Select */}
                  <div className="flex-1">
                    <Select
                      value={selectedClassId}
                      onValueChange={(value) => {
                        setSelectedClassId(value);
                        setSelectedStudents([]);
                      }}
                      disabled={!selectedUnitId}
                    >
                      <SelectTrigger>
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
                  </div>

                  {/* Search */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama/NIS..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Student List */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Daftar Siswa
                  </CardTitle>
                  {students.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      {selectedStudents.length === students.length
                        ? "Batal Pilih Semua"
                        : "Pilih Semua"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {studentsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : students.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Tidak ada siswa ditemukan</p>
                    <p className="text-sm">
                      Pilih unit atau kelas untuk melihat siswa
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {students.map((student) => {
                      const isSelected = selectedStudents.includes(student.id);
                      const initials = student.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase();

                      return (
                        <div
                          key={student.id}
                          className={`
                            flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                            ${isSelected ? "bg-emerald-50 border-emerald-300" : "hover:bg-gray-50"}
                          `}
                          onClick={() => handleSelectStudent(student.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              handleSelectStudent(student.id)
                            }
                          />
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {student.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              NIS: {student.nis} •{" "}
                              {student.currentClass?.name || "-"}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewStudent(student);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Preview Kartu
                </CardTitle>
                <CardDescription>
                  {previewStudent
                    ? previewStudent.name
                    : "Pilih siswa untuk preview"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {previewStudent ? (
                  <>
                    <div className="flex flex-col items-center gap-4">
                      <div>
                        <p className="text-xs text-center text-muted-foreground mb-2">
                          Depan
                        </p>
                        <StudentIDCard student={previewStudent} showPreview />
                      </div>
                      <div>
                        <p className="text-xs text-center text-muted-foreground mb-2">
                          Belakang
                        </p>
                        <StudentIDCardBack student={previewStudent} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <IdCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Klik ikon mata pada siswa</p>
                    <p className="text-sm">untuk melihat preview kartu</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selected Summary */}
            {selectedStudents.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Dipilih ({selectedStudents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {selectedStudentsList.slice(0, 10).map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        <span className="truncate">{student.name}</span>
                      </div>
                    ))}
                    {selectedStudents.length > 10 && (
                      <p className="text-sm text-muted-foreground">
                        +{selectedStudents.length - 10} siswa lainnya
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Hidden Print Area */}
        <div ref={printRef} className="hidden">
          <div className="card-container">
            {selectedStudentsList.map((student) => (
              <div key={student.id} className="card mb-4">
                <StudentIDCard student={student} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
