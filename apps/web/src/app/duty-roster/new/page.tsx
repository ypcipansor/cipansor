"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Calendar,
  Clock,
  MapPin,
  Users,
  Plus,
  X,
  Search,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  DUTY_TYPE_LABELS,
  DutyType,
  useCreateDutyRoster,
} from "@/hooks/use-duty-roster";
import { useStudents } from "@/hooks/use-students";
import { useTeachers } from "@/hooks/use-teachers";
import { useClasses } from "@/hooks/use-classes";
import { useAuthStore } from "@/stores/auth";
import { MainLayout } from "@/components/layout";

const LOCATIONS: Record<DutyType, string[]> = {
  CLEANING_CLASSROOM: [
    "Kelas VII-A",
    "Kelas VII-B",
    "Kelas VIII-A",
    "Kelas VIII-B",
  ],
  CLEANING_BATHROOM: [
    "Kamar Mandi Lantai 1",
    "Kamar Mandi Lantai 2",
    "Kamar Mandi Asrama Putra",
    "Kamar Mandi Asrama Putri",
  ],
  CLEANING_YARD: [
    "Halaman Depan",
    "Halaman Belakang",
    "Taman Sekolah",
    "Lapangan",
  ],
  CLEANING_MOSQUE: ["Masjid Al-Ikhlas", "Musholla Putra", "Musholla Putri"],
  SECURITY: ["Gerbang Utama", "Gerbang Samping", "Area Parkir"],
  CANTEEN: ["Kantin Utama", "Kantin Asrama"],
  LIBRARY: ["Perpustakaan"],
  GARDEN: ["Taman Depan", "Taman Belakang", "Kebun Sekolah"],
  KITCHEN: ["Dapur Asrama Putra", "Dapur Asrama Putri"],
};

function NewDutyRosterPageContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const unitId = user?.unitId || user?.unit?.id;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("all");

  // Fetch real data
  const { data: studentsData, isLoading: isLoadingStudents } = useStudents({
    unitId,
    status: "ACTIVE",
    limit: 100,
  });
  const { data: teachersData, isLoading: isLoadingTeachers } = useTeachers({
    unitId,
    status: "ACTIVE",
  });
  const { data: classesData } = useClasses({ unitId });

  const createDutyRoster = useCreateDutyRoster();

  // Extract students and teachers from API response
  const students = useMemo(() => {
    return (
      studentsData?.data?.map((s: any) => ({
        id: s.id,
        nisn: s.nisn,
        name: s.user?.name ?? s.name ?? "",
        class: { id: s.class?.id || "", name: s.class?.name || "-" },
        gender: s.gender,
      })) || []
    );
  }, [studentsData]);

  const supervisors = useMemo(() => {
    return (
      teachersData?.data?.map((t: any) => ({
        id: t.id,
        name: t.user?.name || t.name,
      })) || []
    );
  }, [teachersData]);

  const classes = useMemo(() => {
    return classesData?.data || [];
  }, [classesData]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    dutyType: "" as DutyType | "",
    location: "",
    shift: "" as "MORNING" | "AFTERNOON" | "EVENING" | "",
    startTime: "",
    endTime: "",
    supervisorId: "",
    notes: "",
    studentIds: [] as string[],
  });

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      (student.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (student.nisn ?? "").includes(searchQuery);
    const matchesClass =
      filterClass === "all" || student.class.id === filterClass;
    return matchesSearch && matchesClass;
  });

  const toggleStudent = (studentId: string) => {
    setFormData((prev) => ({
      ...prev,
      studentIds: prev.studentIds.includes(studentId)
        ? prev.studentIds.filter((id) => id !== studentId)
        : [...prev.studentIds, studentId],
    }));
  };

  const getShiftTimes = (shift: string) => {
    switch (shift) {
      case "MORNING":
        return { startTime: "05:00", endTime: "07:00" };
      case "AFTERNOON":
        return { startTime: "12:00", endTime: "14:00" };
      case "EVENING":
        return { startTime: "17:00", endTime: "19:00" };
      default:
        return { startTime: "", endTime: "" };
    }
  };

  const handleShiftChange = (shift: "MORNING" | "AFTERNOON" | "EVENING") => {
    const times = getShiftTimes(shift);
    setFormData((prev) => ({
      ...prev,
      shift,
      startTime: times.startTime,
      endTime: times.endTime,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.dutyType ||
      !formData.location ||
      !formData.shift ||
      !formData.date
    ) {
      toast.error("Lengkapi semua data yang diperlukan");
      return;
    }

    if (formData.studentIds.length === 0) {
      toast.error("Pilih minimal 1 santri");
      return;
    }

    setIsSubmitting(true);

    try {
      await createDutyRoster.mutateAsync({
        date: formData.date,
        dutyType: formData.dutyType as DutyType,
        location: formData.location,
        shift: formData.shift,
        startTime: formData.startTime,
        endTime: formData.endTime,
        supervisorId: formData.supervisorId || undefined,
        notes: formData.notes || undefined,
        studentIds: formData.studentIds,
      });

      toast.success("Jadwal piket berhasil dibuat");
      router.push("/duty-roster");
    } catch (error) {
      toast.error("Gagal membuat jadwal piket");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStudents = students.filter((s) =>
    formData.studentIds.includes(s.id),
  );

  // Loading state
  if (isLoadingStudents) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/duty-roster">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Buat Jadwal Piket</h1>
          <p className="text-muted-foreground">
            Tentukan tugas piket untuk santri
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Roster Details */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Detail Piket
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tanggal</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, date: e.target.value }))
                    }
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Jenis Piket</Label>
                  <Select
                    value={formData.dutyType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        dutyType: value as DutyType,
                        location: "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis piket" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DUTY_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Lokasi</Label>
                  <Select
                    value={formData.location}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, location: value }))
                    }
                    disabled={!formData.dutyType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih lokasi" />
                    </SelectTrigger>
                    <SelectContent>
                      {formData.dutyType &&
                        LOCATIONS[formData.dutyType]?.map((loc) => (
                          <SelectItem key={loc} value={loc}>
                            {loc}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Shift</Label>
                  <Select
                    value={formData.shift}
                    onValueChange={(value) =>
                      handleShiftChange(
                        value as "MORNING" | "AFTERNOON" | "EVENING",
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MORNING">
                        Pagi (05:00 - 07:00)
                      </SelectItem>
                      <SelectItem value="AFTERNOON">
                        Siang (12:00 - 14:00)
                      </SelectItem>
                      <SelectItem value="EVENING">
                        Sore/Malam (17:00 - 19:00)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Waktu Mulai</Label>
                    <Input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          startTime: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Waktu Selesai</Label>
                    <Input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          endTime: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pengawas (opsional)</Label>
                  <Select
                    value={formData.supervisorId}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, supervisorId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih pengawas" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingTeachers ? (
                        <SelectItem value="" disabled>
                          Memuat...
                        </SelectItem>
                      ) : supervisors.length === 0 ? (
                        <SelectItem value="" disabled>
                          Tidak ada data guru
                        </SelectItem>
                      ) : (
                        supervisors.map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>
                            {sup.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Catatan (opsional)</Label>
                  <Textarea
                    placeholder="Tambahkan instruksi atau catatan khusus..."
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Selected Students Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Santri Terpilih
                  </span>
                  <Badge variant="secondary">
                    {selectedStudents.length} santri
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedStudents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Belum ada santri yang dipilih
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedStudents.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {student.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {student.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {student.class.name}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleStudent(student.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Student Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Pilih Santri
              </CardTitle>
              <CardDescription>
                Pilih santri yang akan bertugas piket
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search & Filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama atau NISN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterClass} onValueChange={setFilterClass}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Student List */}
              <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mb-2" />
                    <p>Tidak ada santri ditemukan</p>
                  </div>
                ) : (
                  filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${
                        formData.studentIds.includes(student.id)
                          ? "bg-primary/10"
                          : ""
                      }`}
                      onClick={() => toggleStudent(student.id)}
                    >
                      <Checkbox
                        checked={formData.studentIds.includes(student.id)}
                        onCheckedChange={() => toggleStudent(student.id)}
                      />
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {student.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{student.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {student.nisn} • {student.class.name}
                        </p>
                      </div>
                      <Badge
                        variant={
                          student.gender === "MALE" ? "default" : "secondary"
                        }
                      >
                        {student.gender === "MALE" ? "L" : "P"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{filteredStudents.length} santri ditampilkan</span>
                <span>{formData.studentIds.length} terpilih</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Link href="/duty-roster">
            <Button type="button" variant="outline">
              Batal
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>Menyimpan...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Simpan Jadwal
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewDutyRosterPage() {
  return (
    <MainLayout>
      <NewDutyRosterPageContent />
    </MainLayout>
  );
}
