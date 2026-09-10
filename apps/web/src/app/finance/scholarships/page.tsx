"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  RefreshCw,
  Filter,
  GraduationCap,
  Users,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

import { id as localeID } from "date-fns/locale";

import {
  useScholarships,
  useCreateScholarship,
  useAssignScholarship,
  useScholarshipRecipients,
  type Scholarship,
  type ScholarshipRecipient,
  ScholarshipSource,
  ScholarshipType,
} from "@/hooks/use-finance-enhancement";
import { useUnits } from "@/hooks/use-units";
import { useStudents } from "@/hooks/use-students";
import { useAcademicYears } from "@/hooks/use-academic-years";

const SOURCE_LABELS: Record<ScholarshipSource, string> = {
  [ScholarshipSource.INTERNAL]: "Internal Yayasan",
  [ScholarshipSource.GOVERNMENT]: "Pemerintah (PIP/KIP)",
  [ScholarshipSource.COMPANY]: "CSR Perusahaan",
  [ScholarshipSource.FOUNDATION]: "Lembaga Zakat/Amil",
  [ScholarshipSource.DONOR]: "Donatur Perorangan",
  [ScholarshipSource.OTHER]: "Lainnya",
};

const TYPE_LABELS: Record<ScholarshipType, string> = {
  [ScholarshipType.FULL]: "Beasiswa Penuh (Full)",
  [ScholarshipType.PARTIAL]: "Beasiswa Parsial",
  [ScholarshipType.SPECIFIC]: "Bantuan Khusus",
  [ScholarshipType.FIXED_AMOUNT]: "Bantuan Tetap (Fixed)",
};

function RecipientsDialog({
  scholarship,
  onClose,
}: {
  scholarship: Scholarship | null;
  onClose: () => void;
}) {
  const { data: recipients, isLoading } = useScholarshipRecipients(
    scholarship?.id || "",
    { limit: 50 },
  );

  if (!scholarship) return null;

  return (
    <Dialog open={!!scholarship} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Penerima Beasiswa: {scholarship.name}</DialogTitle>
          <DialogDescription>
            Daftar santri penerima beasiswa ini.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Santri</TableHead>
                <TableHead>NISN</TableHead>
                <TableHead>Kelas</TableHead>
                <TableHead>Tahun Ajaran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mulai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : recipients?.data?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-4 text-muted-foreground"
                  >
                    Belum ada penerima.
                  </TableCell>
                </TableRow>
              ) : (
                recipients?.data?.map((recipient: any) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">
                      {recipient.student?.name || "Unknown"}
                    </TableCell>
                    <TableCell>{recipient.student?.nisn || "-"}</TableCell>
                    <TableCell>{recipient.student?.class || "-"}</TableCell>
                    <TableCell>{recipient.academicYear?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          recipient.status === "ACTIVE"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {recipient.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {safeFormat(
                        new Date(recipient.startDate),
                        "dd MMM yyyy",
                        {
                          locale: localeID,
                        },
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ScholarshipsPage() {
  const [activeView, setActiveView] = useState<"SCHOLARSHIPS" | "RECIPIENTS">(
    "SCHOLARSHIPS",
  );
  const [selectedUnitId, setSelectedUnitId] = useState<string | "ALL">("ALL");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedScholarshipForView, setSelectedScholarshipForView] =
    useState<Scholarship | null>(null);

  const { data: unitsData } = useUnits();
  const { data: academicYears } = useAcademicYears();
  const { data: studentsData } = useStudents({
    unitId: selectedUnitId === "ALL" ? undefined : selectedUnitId,
    search: studentSearch, // Added search
    limit: 20, // Reduced limit, rely on search
  });

  const {
    data: scholarshipsData,
    isLoading: scholarshipsLoading,
    refetch: refetchScholarships,
  } = useScholarships({
    unitId: selectedUnitId === "ALL" ? undefined : selectedUnitId,
    limit: 100,
  });

  const createScholarship = useCreateScholarship();
  const assignScholarship = useAssignScholarship();

  const handleCreate = async (formData: FormData) => {
    try {
      await createScholarship.mutateAsync({
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        source: formData.get("source") as ScholarshipSource,
        type: formData.get("type") as ScholarshipType,
        quota: parseInt(formData.get("quota") as string) || undefined,
        startDate: formData.get("startDate") as string,
        endDate: (formData.get("endDate") as string) || undefined,
        unitId: (formData.get("unitId") as string) || undefined,
        isActive: true,
      });
      toast.success("Program beasiswa berhasil dibuat");
      setIsAddDialogOpen(false);
      refetchScholarships();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Gagal membuat program");
    }
  };

  const handleAssign = async (formData: FormData) => {
    try {
      await assignScholarship.mutateAsync({
        scholarshipId: formData.get("scholarshipId") as string,
        studentId: formData.get("studentId") as string,
        academicYearId: formData.get("academicYearId") as string,
        startDate: formData.get("startDate") as string,
        notes: formData.get("notes") as string,
      });
      toast.success("Beasiswa berhasil diberikan ke santri");
      setIsAssignDialogOpen(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Gagal memberikan beasiswa");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Manajemen Beasiswa"
          description="Kelola program beasiswa dan penerima bantuan"
        />

        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex gap-2">
            <Button
              variant={activeView === "SCHOLARSHIPS" ? "default" : "outline"}
              onClick={() => setActiveView("SCHOLARSHIPS")}
            >
              <GraduationCap className="h-4 w-4 mr-2" />
              Program Beasiswa
            </Button>
          </div>

          <div className="flex gap-2">
            <Dialog
              open={isAssignDialogOpen}
              onOpenChange={setIsAssignDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="secondary">
                  <Users className="h-4 w-4 mr-2" />
                  Assign Santri
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form action={handleAssign}>
                  <DialogHeader>
                    <DialogTitle>Berikan Beasiswa</DialogTitle>
                    <DialogDescription>
                      Pilih santri dan program beasiswa
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="studentId">Cari Santri</Label>
                      {/* Simple Search Input inside Dialog */}
                      <Input
                        placeholder="Ketik nama santri..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="mb-2"
                      />
                      <Select name="studentId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih santri" />
                        </SelectTrigger>
                        <SelectContent>
                          {studentsData?.data.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.user.name} ({s.nisn})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scholarshipId">Program Beasiswa</Label>
                      <Select name="scholarshipId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih program" />
                        </SelectTrigger>
                        <SelectContent>
                          {scholarshipsData?.data.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="academicYearId">Tahun Ajaran</Label>
                      <Select name="academicYearId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih tahun ajaran" />
                        </SelectTrigger>
                        <SelectContent>
                          {academicYears?.data?.map((ay: any) => (
                            <SelectItem key={ay.id} value={ay.id}>
                              {ay.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Tanggal Mulai</Label>
                      <Input
                        id="startDate"
                        name="startDate"
                        type="date"
                        defaultValue={safeFormat(new Date(), "yyyy-MM-dd")}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Catatan</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        placeholder="Keterangan tambahan..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAssignDialogOpen(false)}
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={assignScholarship.isPending}
                    >
                      {assignScholarship.isPending ? "Menyimpan..." : "Simpan"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Buat Program
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form action={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Buat Program Beasiswa Baru</DialogTitle>
                    <DialogDescription>
                      Tambahkan skema bantuan pembiayaan baru
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nama Program</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="Beasiswa Prestasi Tahfidz"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="source">Sumber Dana</Label>
                        <Select name="source" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih sumber" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(SOURCE_LABELS).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Tipe Beasiswa</Label>
                        <Select name="type" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih tipe" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(TYPE_LABELS).map(([key, label]) => (
                              <SelectItem key={key} value={key}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="quota">Kuota (Opsional)</Label>
                        <Input
                          id="quota"
                          name="quota"
                          type="number"
                          min="0"
                          placeholder="Tak terbatas"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unitId">Unit (Opsional)</Label>
                        <Select name="unitId">
                          <SelectTrigger>
                            <SelectValue placeholder="Semua Unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Semua Unit</SelectItem>
                            {unitsData?.map((unit: any) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Berlaku Mulai</Label>
                        <Input
                          id="startDate"
                          name="startDate"
                          type="date"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endDate">Berlaku Sampai</Label>
                        <Input id="endDate" name="endDate" type="date" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Deskripsi</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Syarat dan ketentuan..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={createScholarship.isPending}
                    >
                      {createScholarship.isPending ? "Menyimpan..." : "Simpan"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* List */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Program</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Penerima</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scholarshipsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : scholarshipsData?.data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Belum ada program beasiswa
                    </TableCell>
                  </TableRow>
                ) : (
                  scholarshipsData?.data.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {item.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {SOURCE_LABELS[item.source as ScholarshipSource] ||
                            item.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {TYPE_LABELS[item.type as ScholarshipType] ||
                            item.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        {item._count?.recipients || 0} /{" "}
                        {item.quota ? item.quota : "∞"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={item.isActive ? "default" : "secondary"}
                        >
                          {item.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedScholarshipForView(item)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Lihat
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recipients Dialog */}
        <RecipientsDialog
          scholarship={selectedScholarshipForView}
          onClose={() => setSelectedScholarshipForView(null)}
        />
      </div>
    </MainLayout>
  );
}
