"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAlumni,
  useAlumniEvents,
  useCreateAlumni,
  useVerifyAlumni,
  useCreateAlumniEvent,
  useAlumniOutcomeAnalytics,
  ALUMNI_STATUSES,
  ALUMNI_STATUS_LABELS,
  type AlumniStatus,
} from "@/hooks";
import { AlumniDashboard } from "@/components/alumni/alumni-dashboard";
import { useAuthStore } from "@/stores/auth";
import { alumniAccessOf } from "@/lib/alumni-access";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";

const statusColors: Record<AlumniStatus, string> = {
  REGISTERED: "bg-blue-100 text-blue-800",
  VERIFIED: "bg-green-100 text-green-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INACTIVE: "bg-gray-100 text-gray-800",
};

function AlumniPageContent() {
  const { user } = useAuthStore();
  const { canManage, canReadPersonalData } = alumniAccessOf(user);
  const [activeTab, setActiveTab] = useState("alumni");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [graduationYearFilter, setGraduationYearFilter] =
    useState<string>("all");
  const [isAddAlumniOpen, setIsAddAlumniOpen] = useState(false);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);

  // Alumni form state
  const [alumniForm, setAlumniForm] = useState({
    studentId: "",
    graduationYear: new Date().getFullYear(),
    currentOccupation: "",
    currentCompany: "",
    currentCity: "",
    phone: "",
    email: "",
    bio: "",
  });

  // Event form state
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    eventDate: "",
    location: "",
    maxParticipants: 0,
  });

  const { data: alumni, isLoading: alumniLoading } = useAlumni({
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as AlumniStatus) : undefined,
    graduationYear:
      graduationYearFilter !== "all"
        ? parseInt(graduationYearFilter)
        : undefined,
  });

  const { data: events, isLoading: eventsLoading } = useAlumniEvents();
  const { data: outcomeData } = useAlumniOutcomeAnalytics(
    undefined,
    canReadPersonalData,
  );

  const createAlumni = useCreateAlumni();
  const verifyAlumni = useVerifyAlumni();
  const createEvent = useCreateAlumniEvent();

  const handleCreateAlumni = () => {
    createAlumni.mutate(alumniForm, {
      onSuccess: () => {
        setIsAddAlumniOpen(false);
        setAlumniForm({
          studentId: "",
          graduationYear: new Date().getFullYear(),
          currentOccupation: "",
          currentCompany: "",
          currentCity: "",
          phone: "",
          email: "",
          bio: "",
        });
      },
    });
  };

  const handleCreateEvent = () => {
    createEvent.mutate(eventForm, {
      onSuccess: () => {
        setIsAddEventOpen(false);
        setEventForm({
          title: "",
          description: "",
          eventDate: "",
          location: "",
          maxParticipants: 0,
        });
      },
    });
  };

  const handleVerifyAlumni = (id: string) => {
    verifyAlumni.mutate(id);
  };

  // Generate graduation years for filter (last 20 years)
  const currentYear = new Date().getFullYear();
  const graduationYears = Array.from({ length: 20 }, (_, i) => currentYear - i);

  // Count by status
  const statusCounts =
    alumni?.data?.reduce(
      (acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ) || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alumni</h1>
          <p className="text-muted-foreground">
            Kelola data alumni dan acara reuni
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {ALUMNI_STATUSES.map((status) => (
          <Card key={status}>
            <CardHeader className="pb-2">
              <CardDescription>{ALUMNI_STATUS_LABELS[status]}</CardDescription>
              <CardTitle className="text-2xl">
                {statusCounts[status] || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="alumni">Data Alumni</TabsTrigger>
          <TabsTrigger value="events">Acara Alumni</TabsTrigger>
          <TabsTrigger value="tracer">Dashboard Tracer</TabsTrigger>
          {canReadPersonalData && (
            <TabsTrigger value="outcome">Analisis Outcome</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="tracer" className="space-y-4">
          <AlumniDashboard />
        </TabsContent>

        <TabsContent value="alumni" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Daftar Alumni</CardTitle>
                  <CardDescription>Data alumni pesantren</CardDescription>
                </div>
                <Dialog
                  open={isAddAlumniOpen}
                  onOpenChange={setIsAddAlumniOpen}
                >
                  {canManage && (
                    <DialogTrigger asChild>
                      <Button>Tambah Alumni</Button>
                    </DialogTrigger>
                  )}
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tambah Alumni Baru</DialogTitle>
                      <DialogDescription>
                        Daftarkan alumni baru ke dalam sistem
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="studentId">ID Santri</Label>
                        <Input
                          id="studentId"
                          value={alumniForm.studentId}
                          onChange={(e) =>
                            setAlumniForm({
                              ...alumniForm,
                              studentId: e.target.value,
                            })
                          }
                          placeholder="ID santri saat masih aktif"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="graduationYear">Tahun Lulus</Label>
                        <Select
                          value={alumniForm.graduationYear.toString()}
                          onValueChange={(v) =>
                            setAlumniForm({
                              ...alumniForm,
                              graduationYear: parseInt(v),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {graduationYears.map((year) => (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={alumniForm.email}
                          onChange={(e) =>
                            setAlumniForm({
                              ...alumniForm,
                              email: e.target.value,
                            })
                          }
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="phone">No. Telepon</Label>
                        <Input
                          id="phone"
                          value={alumniForm.phone}
                          onChange={(e) =>
                            setAlumniForm({
                              ...alumniForm,
                              phone: e.target.value,
                            })
                          }
                          placeholder="08123456789"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="currentOccupation">
                          Pekerjaan Saat Ini
                        </Label>
                        <Input
                          id="currentOccupation"
                          value={alumniForm.currentOccupation}
                          onChange={(e) =>
                            setAlumniForm({
                              ...alumniForm,
                              currentOccupation: e.target.value,
                            })
                          }
                          placeholder="Software Engineer"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="currentCompany">
                          Perusahaan/Instansi
                        </Label>
                        <Input
                          id="currentCompany"
                          value={alumniForm.currentCompany}
                          onChange={(e) =>
                            setAlumniForm({
                              ...alumniForm,
                              currentCompany: e.target.value,
                            })
                          }
                          placeholder="PT. Example"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="currentCity">Kota Domisili</Label>
                        <Input
                          id="currentCity"
                          value={alumniForm.currentCity}
                          onChange={(e) =>
                            setAlumniForm({
                              ...alumniForm,
                              currentCity: e.target.value,
                            })
                          }
                          placeholder="Jakarta"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="bio">Bio</Label>
                        <Textarea
                          id="bio"
                          value={alumniForm.bio}
                          onChange={(e) =>
                            setAlumniForm({
                              ...alumniForm,
                              bio: e.target.value,
                            })
                          }
                          placeholder="Ceritakan tentang diri Anda..."
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsAddAlumniOpen(false)}
                      >
                        Batal
                      </Button>
                      <Button
                        onClick={handleCreateAlumni}
                        disabled={createAlumni.isPending}
                      >
                        {createAlumni.isPending ? "Menyimpan..." : "Simpan"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-4 flex flex-wrap gap-4">
                <Input
                  placeholder="Cari nama alumni..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-sm"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    {ALUMNI_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {ALUMNI_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={graduationYearFilter}
                  onValueChange={setGraduationYearFilter}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Tahun Lulus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tahun</SelectItem>
                    {graduationYears.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {alumniLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-muted-foreground">Memuat data...</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Tahun Lulus</TableHead>
                      <TableHead>Pekerjaan</TableHead>
                      <TableHead>Lokasi</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alumni?.data?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">
                          Tidak ada data alumni
                        </TableCell>
                      </TableRow>
                    ) : (
                      alumni?.data?.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {member.name || member.studentName || "-"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {member.email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{member.graduationYear}</TableCell>
                          <TableCell>
                            <div>
                              <p>{member.currentOccupation || "-"}</p>
                              <p className="text-sm text-muted-foreground">
                                {member.currentCompany}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {member.city || member.currentCity || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[member.status]}>
                              {ALUMNI_STATUS_LABELS[member.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {canManage && member.status === "REGISTERED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleVerifyAlumni(member.id)}
                                  disabled={verifyAlumni.isPending}
                                >
                                  Verifikasi
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" asChild>
                                <Link href={`/alumni/${member.id}`}>Detail</Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outcome" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Outcome Correlation Analysis</CardTitle>
              <CardDescription>
                Korelasi antara performa akademik (Rata-rata Nilai) dengan skor outcome alumni (Karir & Pendidikan Lanjut)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {outcomeData && outcomeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid />
                    <XAxis
                      type="number"
                      dataKey="avgGrade"
                      name="Rata-rata Nilai"
                      unit="%"
                      domain={[0, 100]}
                    />
                    <YAxis
                      type="number"
                      dataKey="outcomeScore"
                      name="Outcome Score"
                      domain={[0, 100]}
                    />
                    <ZAxis type="number" dataKey="maxJuz" range={[50, 400]} name="Hafalan" unit=" Juz" />
                    <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Alumni" data={outcomeData} fill="#8884d8" />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Belum ada data korelasi yang cukup
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Acara Alumni</CardTitle>
                  <CardDescription>
                    Kelola acara reuni dan kegiatan alumni
                  </CardDescription>
                </div>
                <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
                  {canManage && (
                    <DialogTrigger asChild>
                      <Button>Buat Acara</Button>
                    </DialogTrigger>
                  )}
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Buat Acara Baru</DialogTitle>
                      <DialogDescription>
                        Buat acara atau kegiatan untuk alumni
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="eventTitle">Judul Acara</Label>
                        <Input
                          id="eventTitle"
                          value={eventForm.title}
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              title: e.target.value,
                            })
                          }
                          placeholder="Reuni Akbar 2024"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="eventDescription">Deskripsi</Label>
                        <Textarea
                          id="eventDescription"
                          value={eventForm.description}
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              description: e.target.value,
                            })
                          }
                          placeholder="Deskripsi acara..."
                          rows={3}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="eventDate">Tanggal Acara</Label>
                        <Input
                          id="eventDate"
                          type="datetime-local"
                          value={eventForm.eventDate}
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              eventDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="eventLocation">Lokasi</Label>
                        <Input
                          id="eventLocation"
                          value={eventForm.location}
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              location: e.target.value,
                            })
                          }
                          placeholder="Aula Pesantren"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="maxParticipants">Maks. Peserta</Label>
                        <Input
                          id="maxParticipants"
                          type="number"
                          value={eventForm.maxParticipants || ""}
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              maxParticipants: parseInt(e.target.value) || 0,
                            })
                          }
                          placeholder="100"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsAddEventOpen(false)}
                      >
                        Batal
                      </Button>
                      <Button
                        onClick={handleCreateEvent}
                        disabled={createEvent.isPending}
                      >
                        {createEvent.isPending ? "Menyimpan..." : "Simpan"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="text-muted-foreground">Memuat data...</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {events?.data?.length === 0 ? (
                    <p className="col-span-full text-center text-muted-foreground">
                      Belum ada acara alumni
                    </p>
                  ) : (
                    events?.data?.map((event) => (
                      <Card key={event.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">
                                {event.title}
                              </CardTitle>
                              <CardDescription>
                                {format(
                                  new Date(event.date || event.eventDate || ""),
                                  "PPP",
                                  { locale: id },
                                )}
                              </CardDescription>
                            </div>
                            <Badge
                              variant={
                                event.status === "UPCOMING"
                                  ? "default"
                                  : event.status === "ONGOING"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {event.status === "UPCOMING"
                                ? "Akan Datang"
                                : event.status === "ONGOING"
                                  ? "Berlangsung"
                                  : event.status === "COMPLETED"
                                    ? "Selesai"
                                    : "Dibatalkan"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                            {event.description}
                          </p>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Lokasi:
                              </span>
                              <span>{event.location}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Peserta:
                              </span>
                              <span>
                                {event.registeredCount || 0} /{" "}
                                {event.maxParticipants || "∞"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-4 flex gap-2">
                            <Button size="sm" className="flex-1">
                              Lihat Detail
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AlumniPageWithShell() {
  return (
    <MainLayout>
      <AlumniPageContent />
    </MainLayout>
  );
}
