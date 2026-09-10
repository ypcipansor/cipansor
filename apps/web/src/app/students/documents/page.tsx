"use client";

import { siteConfig, addressLines } from "@/config/site";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useStudents, Student as BaseStudent } from "@/hooks/use-students";
import { useUnits } from "@/hooks/use-units";
import { useClasses } from "@/hooks/use-classes";

// Extended Student type with additional fields for document generation
type Student = BaseStudent & {
  nisn?: string;
  fatherName?: string;
  motherName?: string;
  unit?: {
    id: string;
    name: string;
    type: string;
    code?: string;
  };
};
import {
  FileText,
  Printer,
  Search,
  User,
  ChevronRight,
  CheckCircle2,
  FileCheck,
  FileOutput,
  FileBadge,
  FileHeart,
  FileWarning,
  School,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

// ========================================
// TYPES & TEMPLATES SURAT KETERANGAN
// ========================================

type SuratKeteranganType =
  | "KETERANGAN_AKTIF"
  | "KETERANGAN_PINDAH"
  | "KETERANGAN_LULUS"
  | "KETERANGAN_KELAKUAN_BAIK"
  | "KETERANGAN_DOMISILI"
  | "REKOMENDASI";

interface SuratTemplate {
  type: SuratKeteranganType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  fields: {
    key: string;
    label: string;
    type: "text" | "date" | "select" | "textarea";
    required?: boolean;
    options?: string[];
    placeholder?: string;
  }[];
}

const SURAT_TEMPLATES: SuratTemplate[] = [
  {
    type: "KETERANGAN_AKTIF",
    label: "Surat Keterangan Aktif",
    description: "Surat yang menyatakan siswa masih aktif bersekolah",
    icon: FileCheck,
    color: "bg-green-100 text-green-700",
    fields: [
      {
        key: "keperluan",
        label: "Keperluan",
        type: "select",
        required: true,
        options: [
          "Beasiswa",
          "Pengajuan KIP",
          "Bantuan Sosial",
          "Administrasi Bank",
          "Perpanjangan Visa",
          "Lainnya",
        ],
      },
      {
        key: "keperluanLainnya",
        label: "Keperluan Lainnya",
        type: "text",
        placeholder: "Isi jika memilih Lainnya",
      },
    ],
  },
  {
    type: "KETERANGAN_PINDAH",
    label: "Surat Keterangan Pindah",
    description: "Surat untuk siswa yang pindah ke sekolah lain",
    icon: FileOutput,
    color: "bg-orange-100 text-orange-700",
    fields: [
      {
        key: "sekolahTujuan",
        label: "Sekolah Tujuan",
        type: "text",
        required: true,
        placeholder: "Nama sekolah tujuan",
      },
      {
        key: "alamatTujuan",
        label: "Alamat Sekolah Tujuan",
        type: "text",
        placeholder: "Alamat lengkap",
      },
      {
        key: "alasanPindah",
        label: "Alasan Pindah",
        type: "select",
        required: true,
        options: [
          "Ikut Orang Tua",
          "Pindah Domisili",
          "Alasan Kesehatan",
          "Alasan Ekonomi",
          "Lainnya",
        ],
      },
      {
        key: "tanggalPindah",
        label: "Tanggal Efektif Pindah",
        type: "date",
        required: true,
      },
    ],
  },
  {
    type: "KETERANGAN_LULUS",
    label: "Surat Keterangan Lulus",
    description: "Surat keterangan kelulusan sementara (sebelum ijazah terbit)",
    icon: School,
    color: "bg-blue-100 text-blue-700",
    fields: [
      {
        key: "tahunLulus",
        label: "Tahun Kelulusan",
        type: "text",
        required: true,
        placeholder: "2024/2025",
      },
      {
        key: "nilaiRata",
        label: "Nilai Rata-rata",
        type: "text",
        placeholder: "85.50",
      },
      {
        key: "predikat",
        label: "Predikat",
        type: "select",
        options: ["Sangat Baik", "Baik", "Cukup"],
      },
    ],
  },
  {
    type: "KETERANGAN_KELAKUAN_BAIK",
    label: "Surat Keterangan Kelakuan Baik",
    description:
      "Surat yang menyatakan siswa berkelakuan baik selama bersekolah",
    icon: FileBadge,
    color: "bg-purple-100 text-purple-700",
    fields: [
      {
        key: "keperluan",
        label: "Keperluan",
        type: "select",
        required: true,
        options: [
          "Pendaftaran Sekolah Lanjutan",
          "Pendaftaran Beasiswa",
          "Pendaftaran Kerja",
          "Lainnya",
        ],
      },
      {
        key: "catatan",
        label: "Catatan Khusus",
        type: "textarea",
        placeholder: "Catatan tambahan (opsional)",
      },
    ],
  },
  {
    type: "KETERANGAN_DOMISILI",
    label: "Surat Keterangan Domisili",
    description:
      "Surat keterangan bahwa siswa bertempat tinggal di asrama/pondok",
    icon: FileHeart,
    color: "bg-pink-100 text-pink-700",
    fields: [
      {
        key: "namaAsrama",
        label: "Nama Asrama/Pondok",
        type: "text",
        required: true,
        placeholder: "Asrama Putra A",
      },
      {
        key: "alamatAsrama",
        label: "Alamat Asrama",
        type: "text",
        placeholder: "Alamat lengkap asrama",
      },
      {
        key: "tanggalMasuk",
        label: "Tanggal Masuk Asrama",
        type: "date",
      },
    ],
  },
  {
    type: "REKOMENDASI",
    label: "Surat Rekomendasi",
    description:
      "Surat rekomendasi untuk melanjutkan pendidikan atau keperluan lain",
    icon: FileWarning,
    color: "bg-yellow-100 text-yellow-700",
    fields: [
      {
        key: "tujuanRekomendasi",
        label: "Tujuan Rekomendasi",
        type: "select",
        required: true,
        options: [
          "Melanjutkan ke SMP/MTs",
          "Melanjutkan ke SMA/MA",
          "Melanjutkan ke Perguruan Tinggi",
          "Beasiswa",
          "Lainnya",
        ],
      },
      {
        key: "institusiTujuan",
        label: "Institusi Tujuan",
        type: "text",
        placeholder: "Nama institusi tujuan",
      },
      {
        key: "deskripsiSiswa",
        label: "Deskripsi Siswa",
        type: "textarea",
        placeholder:
          "Tuliskan deskripsi kemampuan, prestasi, dan karakter siswa...",
        required: true,
      },
    ],
  },
];

// Generate nomor surat
const generateNomorSurat = (
  type: SuratKeteranganType,
  unitCode: string,
): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  const typeCode: Record<SuratKeteranganType, string> = {
    KETERANGAN_AKTIF: "SKA",
    KETERANGAN_PINDAH: "SKP",
    KETERANGAN_LULUS: "SKL",
    KETERANGAN_KELAKUAN_BAIK: "SKB",
    KETERANGAN_DOMISILI: "SKD",
    REKOMENDASI: "SR",
  };

  return `${random}/${typeCode[type]}/${unitCode}/${month}/${year}`;
};

interface FormData {
  type: SuratKeteranganType;
  tanggalSurat: string;
  metadata: Record<string, string>;
}

export default function SuratKeteranganPage() {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState("select-student");
  const [formData, setFormData] = useState<FormData>({
    type: "KETERANGAN_AKTIF",
    tanggalSurat: safeFormat(new Date(), "yyyy-MM-dd"),
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
  const selectedTemplate = SURAT_TEMPLATES.find(
    (t) => t.type === formData.type,
  );
  const nomorSurat = selectedStudent
    ? generateNomorSurat(formData.type, selectedStudent.unit?.code || "CPN")
    : "";

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setActiveTab("select-type");
  };

  const handleSelectType = (type: SuratKeteranganType) => {
    setFormData({
      ...formData,
      type,
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
          <title>Surat Keterangan - ${selectedStudent.name}</title>
          <style>
            @page {
              size: A4;
              margin: 2cm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 12pt;
              line-height: 1.5;
              color: #000;
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

    toast.success("Surat siap dicetak");
  };

  // ========================================
  // RENDER PREVIEW SURAT
  // ========================================
  const renderSuratPreview = () => {
    if (!selectedStudent || !selectedTemplate) return null;

    const unitName = selectedStudent.unit?.name || siteConfig.legalName;
    const unitAddress = addressLines.join(", ");
    const unitPhone = siteConfig.contact.phone;
    const unitEmail = siteConfig.contact.email;

    return (
      <div
        ref={printRef}
        className="w-[21cm] min-h-[29.7cm] bg-white p-[2cm] mx-auto"
        style={{
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: "12pt",
        }}
      >
        {/* KOP SURAT */}
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <div className="flex items-center justify-center gap-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-2xl">
              🏫
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider">
                KEMENTERIAN AGAMA REPUBLIK INDONESIA
              </p>
              <h1 className="text-lg font-bold uppercase">{unitName}</h1>
              <p className="text-xs">{unitAddress}</p>
              <p className="text-xs">
                Telp: {unitPhone} | Email: {unitEmail}
              </p>
            </div>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-xl">
              ☪️
            </div>
          </div>
        </div>

        {/* JUDUL SURAT */}
        <div className="text-center mb-6">
          <h2 className="text-base font-bold uppercase underline">
            {selectedTemplate.label}
          </h2>
          <p className="text-sm">Nomor: {nomorSurat}</p>
        </div>

        {/* ISI SURAT */}
        <div className="mb-6 text-justify leading-relaxed">
          <p className="mb-4">Yang bertanda tangan di bawah ini:</p>

          <table className="mb-4 ml-8">
            <tbody>
              <tr>
                <td className="pr-4 align-top">Nama</td>
                <td className="pr-2 align-top">:</td>
                <td>H. Ahmad Fauzi, S.Pd.I., M.Pd.</td>
              </tr>
              <tr>
                <td className="pr-4 align-top">NIP</td>
                <td className="pr-2 align-top">:</td>
                <td>196505121990031002</td>
              </tr>
              <tr>
                <td className="pr-4 align-top">Jabatan</td>
                <td className="pr-2 align-top">:</td>
                <td>Kepala {unitName}</td>
              </tr>
            </tbody>
          </table>

          <p className="mb-4">Dengan ini menerangkan bahwa:</p>

          <table className="mb-4 ml-8">
            <tbody>
              <tr>
                <td className="pr-4 align-top w-36">Nama</td>
                <td className="pr-2 align-top">:</td>
                <td className="font-semibold">{selectedStudent.name}</td>
              </tr>
              <tr>
                <td className="pr-4 align-top">NISN</td>
                <td className="pr-2 align-top">:</td>
                <td>{selectedStudent.nisn}</td>
              </tr>
              <tr>
                <td className="pr-4 align-top">NISN</td>
                <td className="pr-2 align-top">:</td>
                <td>{selectedStudent.nisn || "-"}</td>
              </tr>
              <tr>
                <td className="pr-4 align-top">Tempat, Tanggal Lahir</td>
                <td className="pr-2 align-top">:</td>
                <td>
                  {selectedStudent.birthPlace || "-"},{" "}
                  {selectedStudent.birthDate
                    ? format(
                        new Date(selectedStudent.birthDate),
                        "d MMMM yyyy",
                        {
                          locale: idLocale,
                        },
                      )
                    : "-"}
                </td>
              </tr>
              <tr>
                <td className="pr-4 align-top">Kelas</td>
                <td className="pr-2 align-top">:</td>
                <td>{selectedStudent.currentClass?.name || "-"}</td>
              </tr>
              <tr>
                <td className="pr-4 align-top">Nama Orang Tua</td>
                <td className="pr-2 align-top">:</td>
                <td>{selectedStudent.fatherName || "-"}</td>
              </tr>
              <tr>
                <td className="pr-4 align-top">Alamat</td>
                <td className="pr-2 align-top">:</td>
                <td>{selectedStudent.address || "-"}</td>
              </tr>
            </tbody>
          </table>

          {/* ISI BERDASARKAN JENIS SURAT */}
          {formData.type === "KETERANGAN_AKTIF" && (
            <p className="mb-4">
              Benar adalah siswa/santri yang masih <strong>aktif</strong>{" "}
              terdaftar dan mengikuti kegiatan belajar mengajar di {unitName}{" "}
              pada tahun pelajaran {new Date().getFullYear()}/
              {new Date().getFullYear() + 1}.
            </p>
          )}

          {formData.type === "KETERANGAN_PINDAH" && (
            <>
              <p className="mb-4">
                Benar adalah siswa/santri {unitName} yang akan{" "}
                <strong>pindah</strong> ke:
              </p>
              <table className="mb-4 ml-8">
                <tbody>
                  <tr>
                    <td className="pr-4 align-top w-36">Sekolah Tujuan</td>
                    <td className="pr-2 align-top">:</td>
                    <td>{formData.metadata.sekolahTujuan || "-"}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 align-top">Alamat</td>
                    <td className="pr-2 align-top">:</td>
                    <td>{formData.metadata.alamatTujuan || "-"}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 align-top">Alasan Pindah</td>
                    <td className="pr-2 align-top">:</td>
                    <td>{formData.metadata.alasanPindah || "-"}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 align-top">Efektif Tanggal</td>
                    <td className="pr-2 align-top">:</td>
                    <td>
                      {formData.metadata.tanggalPindah
                        ? format(
                            new Date(formData.metadata.tanggalPindah),
                            "d MMMM yyyy",
                            { locale: idLocale },
                          )
                        : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {formData.type === "KETERANGAN_LULUS" && (
            <p className="mb-4">
              Benar adalah siswa/santri yang telah{" "}
              <strong>menyelesaikan pendidikan</strong> di {unitName} pada tahun
              pelajaran {formData.metadata.tahunLulus || "-"}
              {formData.metadata.nilaiRata &&
                ` dengan nilai rata-rata ${formData.metadata.nilaiRata}`}
              {formData.metadata.predikat &&
                ` dan predikat ${formData.metadata.predikat}`}
              .
            </p>
          )}

          {formData.type === "KETERANGAN_KELAKUAN_BAIK" && (
            <p className="mb-4">
              Benar adalah siswa/santri yang selama menempuh pendidikan di{" "}
              {unitName} memiliki <strong>kelakuan yang baik</strong>, tidak
              pernah terlibat dalam tindakan melanggar tata tertib
              sekolah/madrasah, dan dapat bekerjasama dengan baik dengan sesama
              siswa maupun guru.
              {formData.metadata.catatan && (
                <>
                  <br />
                  <br />
                  Catatan: {formData.metadata.catatan}
                </>
              )}
            </p>
          )}

          {formData.type === "KETERANGAN_DOMISILI" && (
            <p className="mb-4">
              Benar adalah santri yang bertempat tinggal di{" "}
              <strong>
                {formData.metadata.namaAsrama || "Asrama Pesantren"}
              </strong>
              , {formData.metadata.alamatAsrama || unitAddress}
              {formData.metadata.tanggalMasuk &&
                ` sejak tanggal ${format(
                  new Date(formData.metadata.tanggalMasuk),
                  "d MMMM yyyy",
                  { locale: idLocale },
                )}`}
              .
            </p>
          )}

          {formData.type === "REKOMENDASI" && (
            <>
              <p className="mb-4">
                Berdasarkan pengamatan kami selama siswa/santri tersebut
                menempuh pendidikan di {unitName}, dengan ini kami
                merekomendasikan yang bersangkutan untuk{" "}
                <strong>
                  {formData.metadata.tujuanRekomendasi ||
                    "melanjutkan pendidikan"}
                </strong>
                {formData.metadata.institusiTujuan &&
                  ` di ${formData.metadata.institusiTujuan}`}
                .
              </p>
              {formData.metadata.deskripsiSiswa && (
                <p className="mb-4">{formData.metadata.deskripsiSiswa}</p>
              )}
            </>
          )}

          <p className="mb-4">
            Surat keterangan ini dibuat dengan sebenarnya untuk dipergunakan
            sebagaimana mestinya
            {formData.type === "KETERANGAN_AKTIF" &&
              formData.metadata.keperluan &&
              ` sebagai kelengkapan ${
                formData.metadata.keperluan === "Lainnya"
                  ? formData.metadata.keperluanLainnya || "administrasi"
                  : formData.metadata.keperluan.toLowerCase()
              }`}
            .
          </p>
        </div>

        {/* TANDA TANGAN */}
        <div className="flex justify-end mt-12">
          <div className="text-center">
            <p>
              Bandung,{" "}
              {safeFormat(new Date(formData.tanggalSurat), "d MMMM yyyy", {
                locale: idLocale,
              })}
            </p>
            <p className="mb-2">Kepala {unitName.split(" ").slice(-1)[0]}</p>
            <div className="h-20"></div>
            <p className="font-semibold underline">
              H. Ahmad Fauzi, S.Pd.I., M.Pd.
            </p>
            <p className="text-sm">NIP. 196505121990031002</p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="absolute bottom-8 left-8 right-8 text-center text-xs text-gray-400 border-t pt-2">
          <p>
            Dokumen ini dicetak melalui Sistem Informasi Manajemen Pesantren
            Cipansor
          </p>
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
              <FileText className="h-6 w-6 text-primary" />
              Generator Surat Keterangan
            </h1>
            <p className="text-muted-foreground">
              Buat surat keterangan aktif, pindah, kelakuan baik, dan lainnya
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={handlePrint}
              disabled={!selectedStudent}
            >
              <Printer className="h-4 w-4 mr-2" />
              Cetak Surat
            </Button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${
              activeTab === "select-student"
                ? "bg-primary text-primary-foreground"
                : selectedStudent
                  ? "bg-green-100 text-green-800"
                  : "bg-muted"
            }`}
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
          <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${
              activeTab === "select-type"
                ? "bg-primary text-primary-foreground"
                : formData.type && selectedStudent
                  ? "bg-green-100 text-green-800"
                  : "bg-muted"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">
              2
            </span>
            <span className="text-sm font-medium">Pilih Jenis</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${
              activeTab === "fill-details"
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}
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
                  Cari dan pilih siswa yang membutuhkan surat keterangan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 md:flex-row mb-6">
                  <Select
                    value={selectedUnitId}
                    onValueChange={(value) => {
                      setSelectedUnitId(value);
                      setSelectedClassId("");
                    }}
                  >
                    <SelectTrigger className="w-full md:w-48">
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
                    <SelectTrigger className="w-full md:w-48">
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
                      className="pl-9"
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
                            ${
                              isSelected
                                ? "bg-primary/10 border-primary ring-2 ring-primary"
                                : "hover:bg-muted hover:border-muted-foreground/50"
                            }
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

          {/* Step 2: Select Surat Type */}
          <TabsContent value="select-type" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Pilih Jenis Surat Keterangan
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
                  {SURAT_TEMPLATES.map((template) => {
                    const Icon = template.icon;
                    const isSelected = formData.type === template.type;

                    return (
                      <div
                        key={template.type}
                        className={`
                          p-6 rounded-xl border-2 cursor-pointer transition-all
                          ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-lg"
                              : "border-muted hover:border-muted-foreground/50 hover:bg-muted/50"
                          }
                        `}
                        onClick={() => handleSelectType(template.type)}
                      >
                        <div
                          className={`w-12 h-12 rounded-lg ${template.color} flex items-center justify-center mb-4`}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <h3 className="font-semibold mb-1">{template.label}</h3>
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
                    Detail Surat Keterangan
                  </CardTitle>
                  <CardDescription>
                    Isi detail informasi untuk surat
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

                  {/* Surat Type */}
                  {selectedTemplate && (
                    <div className="flex items-center gap-2">
                      <Badge className={selectedTemplate.color}>
                        {selectedTemplate.label}
                      </Badge>
                    </div>
                  )}

                  {/* Tanggal Surat */}
                  <div className="space-y-2">
                    <Label>Tanggal Surat</Label>
                    <Input
                      type="date"
                      value={formData.tanggalSurat}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tanggalSurat: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* Dynamic Fields */}
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
                      ) : field.type === "textarea" ? (
                        <Textarea
                          value={formData.metadata[field.key] || ""}
                          onChange={(e) =>
                            handleMetadataChange(field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          rows={4}
                        />
                      ) : (
                        <Input
                          type={field.type}
                          value={formData.metadata[field.key] || ""}
                          onChange={(e) =>
                            handleMetadataChange(field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setActiveTab("select-type")}
                    >
                      Kembali
                    </Button>
                    <Button onClick={handlePrint} className="flex-1">
                      <Printer className="h-4 w-4 mr-2" />
                      Cetak Surat
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview Surat</CardTitle>
                  <CardDescription>
                    Tampilan surat yang akan dicetak (ukuran A4)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-auto bg-gray-100 max-h-[600px]">
                    <div className="transform scale-50 origin-top-left w-[200%]">
                      {renderSuratPreview()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Hidden Print Area */}
        <div className="hidden">{renderSuratPreview()}</div>
      </div>
    </MainLayout>
  );
}
