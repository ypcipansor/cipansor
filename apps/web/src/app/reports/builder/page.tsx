"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  FileText,
  Users,
  UserCheck,
  Banknote,
  BookOpen,
  GraduationCap,
  UserCog,
  Play,
  Download,
  ArrowLeft,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";

// Types
type ReportType =
  | "students"
  | "attendance"
  | "finance"
  | "tahfidz"
  | "academic"
  | "teachers";

interface ReportField {
  key: string;
  label: string;
  type: "string" | "number" | "date" | "boolean";
  category: string;
}

interface ReportConfig {
  type: ReportType;
  name: string;
  fields: string[];
  limit: number;
}

// Report type definitions
const REPORT_TYPES: Array<{
  type: ReportType;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    type: "students",
    label: "Data Santri",
    description: "Daftar santri lengkap",
    icon: Users,
  },
  {
    type: "attendance",
    label: "Kehadiran",
    description: "Rekap kehadiran",
    icon: UserCheck,
  },
  {
    type: "finance",
    label: "Keuangan",
    description: "Tagihan & pembayaran",
    icon: Banknote,
  },
  {
    type: "tahfidz",
    label: "Tahfidz",
    description: "Hafalan Al-Quran",
    icon: BookOpen,
  },
  {
    type: "academic",
    label: "Akademik",
    description: "Nilai & prestasi",
    icon: GraduationCap,
  },
  {
    type: "teachers",
    label: "Guru",
    description: "Data pengajar",
    icon: UserCog,
  },
];

// Available fields per type
const REPORT_FIELDS: Record<ReportType, ReportField[]> = {
  students: [
    { key: "nisn", label: "NISN", type: "string", category: "Identitas" },
    { key: "name", label: "Nama", type: "string", category: "Identitas" },
    {
      key: "gender",
      label: "Jenis Kelamin",
      type: "string",
      category: "Identitas",
    },
    {
      key: "birthDate",
      label: "Tanggal Lahir",
      type: "date",
      category: "Identitas",
    },
    { key: "unitName", label: "Unit", type: "string", category: "Akademik" },
    { key: "className", label: "Kelas", type: "string", category: "Akademik" },
    { key: "status", label: "Status", type: "string", category: "Status" },
    {
      key: "enrollmentDate",
      label: "Tanggal Masuk",
      type: "date",
      category: "Status",
    },
  ],
  attendance: [
    { key: "date", label: "Tanggal", type: "date", category: "Waktu" },
    {
      key: "studentName",
      label: "Nama Santri",
      type: "string",
      category: "Santri",
    },
    { key: "status", label: "Status", type: "string", category: "Kehadiran" },
    { key: "unitName", label: "Unit", type: "string", category: "Unit" },
    { key: "className", label: "Kelas", type: "string", category: "Unit" },
  ],
  finance: [
    {
      key: "invoiceNumber",
      label: "No Invoice",
      type: "string",
      category: "Invoice",
    },
    {
      key: "studentName",
      label: "Nama Santri",
      type: "string",
      category: "Santri",
    },
    { key: "amount", label: "Jumlah", type: "number", category: "Pembayaran" },
    {
      key: "paidAmount",
      label: "Terbayar",
      type: "number",
      category: "Pembayaran",
    },
    { key: "status", label: "Status", type: "string", category: "Status" },
    { key: "dueDate", label: "Jatuh Tempo", type: "date", category: "Tanggal" },
  ],
  tahfidz: [
    {
      key: "studentName",
      label: "Nama Santri",
      type: "string",
      category: "Santri",
    },
    { key: "surah", label: "Surah", type: "string", category: "Hafalan" },
    {
      key: "totalAyah",
      label: "Total Ayat",
      type: "number",
      category: "Hafalan",
    },
    { key: "grade", label: "Nilai", type: "string", category: "Penilaian" },
    { key: "recordedAt", label: "Tanggal", type: "date", category: "Tanggal" },
  ],
  academic: [
    {
      key: "studentName",
      label: "Nama Santri",
      type: "string",
      category: "Santri",
    },
    {
      key: "subjectName",
      label: "Mata Pelajaran",
      type: "string",
      category: "Akademik",
    },
    { key: "score", label: "Nilai", type: "number", category: "Penilaian" },
    { key: "type", label: "Jenis", type: "string", category: "Penilaian" },
    { key: "className", label: "Kelas", type: "string", category: "Unit" },
  ],
  teachers: [
    { key: "nip", label: "NIP", type: "string", category: "Identitas" },
    { key: "name", label: "Nama", type: "string", category: "Identitas" },
    { key: "email", label: "Email", type: "string", category: "Kontak" },
    { key: "phone", label: "Telepon", type: "string", category: "Kontak" },
    { key: "unitName", label: "Unit", type: "string", category: "Unit" },
  ],
};

export default function ReportBuilderPage() {
  const [step, setStep] = useState<"type" | "fields" | "preview">("type");
  const [config, setConfig] = useState<ReportConfig>({
    type: "students",
    name: "",
    fields: [],
    limit: 100,
  });
  const [reportData, setReportData] = useState<Record<string, unknown>[]>([]);

  // Generate report mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      // Demo data generation
      await new Promise((r) => setTimeout(r, 1000));

      const fields = REPORT_FIELDS[config.type];
      const rows = Array.from({ length: Math.min(config.limit, 10) }).map(
        (_, i) => {
          const row: Record<string, unknown> = {};
          config.fields.forEach((fieldKey) => {
            const field = fields.find((f) => f.key === fieldKey);
            if (field) {
              switch (field.type) {
                case "number":
                  row[fieldKey] = Math.floor(Math.random() * 100);
                  break;
                case "date":
                  row[fieldKey] = new Date().toISOString().split("T")[0];
                  break;
                default:
                  row[fieldKey] = `${field.label} ${i + 1}`;
              }
            }
          });
          return row;
        },
      );

      return rows;
    },
    onSuccess: (data) => {
      setReportData(data);
      setStep("preview");
      toast.success("Laporan berhasil dibuat");
    },
    onError: () => {
      toast.error("Gagal membuat laporan");
    },
  });

  const handleTypeSelect = (type: ReportType) => {
    setConfig((prev) => ({ ...prev, type, fields: [] }));
    setStep("fields");
  };

  const handleFieldToggle = (fieldKey: string) => {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.includes(fieldKey)
        ? prev.fields.filter((f) => f !== fieldKey)
        : [...prev.fields, fieldKey],
    }));
  };

  const handleSelectAll = () => {
    const allFields = REPORT_FIELDS[config.type].map((f) => f.key);
    setConfig((prev) => ({ ...prev, fields: allFields }));
  };

  const handleDeselectAll = () => {
    setConfig((prev) => ({ ...prev, fields: [] }));
  };

  const handleGenerate = () => {
    if (config.fields.length === 0) {
      toast.error("Pilih minimal satu field");
      return;
    }
    generateMutation.mutate();
  };

  const handleExport = (format: "csv" | "json") => {
    if (reportData.length === 0) return;

    if (format === "json") {
      const dataStr = JSON.stringify(reportData, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${config.name || "report"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = config.fields.join(",");
      const rows = reportData.map((row) =>
        config.fields.map((f) => row[f] ?? "").join(","),
      );
      const csv = [headers, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${config.name || "report"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast.success("Laporan berhasil diunduh");
  };

  const selectedType = REPORT_TYPES.find((t) => t.type === config.type);
  const availableFields = REPORT_FIELDS[config.type];
  const fieldsByCategory = availableFields.reduce(
    (acc, field) => {
      if (!acc[field.category]) acc[field.category] = [];
      acc[field.category].push(field);
      return acc;
    },
    {} as Record<string, ReportField[]>,
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <PageHeader
            title="Report Builder"
            description="Buat laporan kustom sesuai kebutuhan"
          />
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2">
          <Badge variant={step === "type" ? "default" : "secondary"}>
            1. Pilih Tipe
          </Badge>
          <div className="h-px w-8 bg-border" />
          <Badge variant={step === "fields" ? "default" : "secondary"}>
            2. Pilih Field
          </Badge>
          <div className="h-px w-8 bg-border" />
          <Badge variant={step === "preview" ? "default" : "secondary"}>
            3. Preview
          </Badge>
        </div>

        {/* Step 1: Select Report Type */}
        {step === "type" && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {REPORT_TYPES.map((report) => {
              const Icon = report.icon;
              return (
                <Card
                  key={report.type}
                  className={`cursor-pointer transition-all hover:border-primary ${
                    config.type === report.type
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                  onClick={() => handleTypeSelect(report.type)}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {report.label}
                        </CardTitle>
                        <CardDescription>{report.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}

        {/* Step 2: Select Fields */}
        {step === "fields" && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Field Selection */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>Pilih Field</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      Pilih Semua
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeselectAll}
                    >
                      Hapus Semua
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {Object.entries(fieldsByCategory).map(
                    ([category, fields]) => (
                      <div key={category}>
                        <h4 className="mb-3 font-medium text-muted-foreground">
                          {category}
                        </h4>
                        <div className="grid gap-2 md:grid-cols-2">
                          {fields.map((field) => (
                            <div
                              key={field.key}
                              className="flex items-center gap-2 rounded-lg border p-3"
                            >
                              <Checkbox
                                id={field.key}
                                checked={config.fields.includes(field.key)}
                                onCheckedChange={() =>
                                  handleFieldToggle(field.key)
                                }
                              />
                              <Label
                                htmlFor={field.key}
                                className="flex-1 cursor-pointer"
                              >
                                {field.label}
                              </Label>
                              <Badge variant="outline" className="text-xs">
                                {field.type}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Konfigurasi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Nama Laporan</Label>
                  <Input
                    placeholder="Laporan Santri"
                    value={config.name}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Batas Data</Label>
                  <Select
                    value={String(config.limit)}
                    onValueChange={(v) =>
                      setConfig((prev) => ({ ...prev, limit: Number(v) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50 baris</SelectItem>
                      <SelectItem value="100">100 baris</SelectItem>
                      <SelectItem value="500">500 baris</SelectItem>
                      <SelectItem value="1000">1000 baris</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    Field terpilih: <strong>{config.fields.length}</strong>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("type")}>
                    Kembali
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={
                      config.fields.length === 0 || generateMutation.isPending
                    }
                  >
                    {generateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Membuat...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Buat Laporan
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{config.name || "Laporan"}</CardTitle>
                  <CardDescription>
                    {reportData.length} baris data
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setStep("fields")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => handleExport("csv")}>
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                  <Button onClick={() => handleExport("json")}>
                    <Download className="mr-2 h-4 w-4" />
                    JSON
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {config.fields.map((fieldKey) => {
                        const field = availableFields.find(
                          (f) => f.key === fieldKey,
                        );
                        return (
                          <TableHead key={fieldKey}>
                            {field?.label || fieldKey}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((row, idx) => (
                      <TableRow key={idx}>
                        {config.fields.map((fieldKey) => (
                          <TableCell key={fieldKey}>
                            {String(row[fieldKey] ?? "")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
