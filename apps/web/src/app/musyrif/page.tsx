"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  BookOpen,
  AlertTriangle,
  Moon,
  Search,
  CheckCircle2,
  RefreshCw,
  Heart,
  Shield,
  Activity,
  Clock,
  Plus,
  Bell,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth";
import {
  useMusyrifDashboard,
  useQuickViolation,
  useQuickIbadah,
  useReportHealthIssue,
  VIOLATION_TYPES,
  IBADAH_TYPES,
  getSeverityColor,
  getPatrolStatusColor,
  MusyrifStudent,
} from "@/hooks/use-musyrif-dashboard";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";

function MusyrifDashboardContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("students");

  // Dialog states
  const [violationDialog, setViolationDialog] = useState(false);
  const [ibadahDialog, setIbadahDialog] = useState(false);
  const [healthDialog, setHealthDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<MusyrifStudent | null>(
    null,
  );

  // Form states
  const [violationType, setViolationType] = useState("");
  const [violationNotes, setViolationNotes] = useState("");
  const [ibadahType, setIbadahType] = useState("");
  const [ibadahStatus, setIbadahStatus] = useState<"COMPLETED" | "MISSED">(
    "COMPLETED",
  );
  const [healthCondition, setHealthCondition] = useState("");
  const [healthSeverity, setHealthSeverity] = useState<
    "LOW" | "MEDIUM" | "HIGH"
  >("LOW");
  const [healthNotes, setHealthNotes] = useState("");

  const { students, stats, healthAlerts, patrolLogs, isLoading, refetch } =
    useMusyrifDashboard();
  const quickViolation = useQuickViolation();
  const quickIbadah = useQuickIbadah();
  const reportHealth = useReportHealthIssue();

  const filteredStudents = (students || []).filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.nisn.includes(search) ||
      s.room.toLowerCase().includes(search.toLowerCase()),
  );

  // Handle quick violation submit
  const handleViolationSubmit = () => {
    if (!selectedStudent || !violationType) return;

    const violationInfo = VIOLATION_TYPES.find(
      (v) => v.value === violationType,
    );
    quickViolation.mutate(
      {
        studentId: selectedStudent.id,
        type: violationType,
        description: violationNotes,
        severity: violationInfo?.severity || "RINGAN",
      },
      {
        onSuccess: () => {
          setViolationDialog(false);
          setViolationType("");
          setViolationNotes("");
          setSelectedStudent(null);
        },
      },
    );
  };

  // Handle quick ibadah submit
  const handleIbadahSubmit = () => {
    if (!selectedStudent || !ibadahType) return;

    quickIbadah.mutate(
      {
        studentId: selectedStudent.id,
        type: ibadahType,
        status: ibadahStatus,
      },
      {
        onSuccess: () => {
          setIbadahDialog(false);
          setIbadahType("");
          setSelectedStudent(null);
        },
      },
    );
  };

  // Handle health report submit
  const handleHealthSubmit = () => {
    if (!selectedStudent || !healthCondition) return;

    reportHealth.mutate(
      {
        studentId: selectedStudent.id,
        condition: healthCondition,
        severity: healthSeverity,
        notes: healthNotes,
      },
      {
        onSuccess: () => {
          setHealthDialog(false);
          setHealthCondition("");
          setHealthSeverity("LOW");
          setHealthNotes("");
          setSelectedStudent(null);
        },
      },
    );
  };

  if (isLoading) {
    return <MusyrifSkeleton />;
  }

  return (
    <div className="container mx-auto max-w-2xl p-4 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard Musyrif</h1>
          <p className="text-sm text-muted-foreground">
            Assalamu&apos;alaikum, {user?.name?.split(" ")[0] || "Ustadz"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={refetch}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Avatar>
            <AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="bg-green-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">
              {stats?.presentToday || 0}
            </p>
            <p className="text-xs text-muted-foreground">Hadir</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {stats?.sickToday || 0}
            </p>
            <p className="text-xs text-muted-foreground">Sakit</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {stats?.permissionToday || 0}
            </p>
            <p className="text-xs text-muted-foreground">Izin</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">
              {stats?.violationsToday || 0}
            </p>
            <p className="text-xs text-muted-foreground">Pelanggaran</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Alerts */}
      {healthAlerts && healthAlerts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <Bell className="h-4 w-4" />
              Alert Kesehatan ({healthAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {healthAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between bg-white p-2 rounded"
                >
                  <div>
                    <p className="text-sm font-medium">{alert.studentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.condition}
                    </p>
                  </div>
                  <Badge className={getSeverityColor(alert.severity)}>
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-auto flex-col py-4 gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10"
          onClick={() => router.push("/ibadah/bulk")}
        >
          <Moon className="w-6 h-6 text-primary" />
          <span className="text-xs font-medium">Input Ibadah Massal</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col py-4 gap-2 border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
          onClick={() => router.push("/violations/create")}
        >
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <span className="text-xs font-medium">Lapor Pelanggaran</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col py-4 gap-2 border-green-500/20 bg-green-500/5 hover:bg-green-500/10"
          onClick={() => router.push("/tahfidz/create")}
        >
          <BookOpen className="w-6 h-6 text-green-500" />
          <span className="text-xs font-medium">Setoran Tahfidz</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col py-4 gap-2 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10"
          onClick={() => router.push("/attendance/create")}
        >
          <CheckCircle2 className="w-6 h-6 text-blue-500" />
          <span className="text-xs font-medium">Absen Kamar</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col py-4 gap-2 border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10"
          onClick={() => router.push("/dormitories/patrol")}
        >
          <Shield className="w-6 h-6 text-purple-500" />
          <span className="text-xs font-medium">Night Patrol</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col py-4 gap-2 border-pink-500/20 bg-pink-500/5 hover:bg-pink-500/10"
          onClick={() => router.push("/health/check")}
        >
          <Heart className="w-6 h-6 text-pink-500" />
          <span className="text-xs font-medium">Cek Kesehatan</span>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="students">
            <Users className="h-4 w-4 mr-2" />
            Santri ({filteredStudents.length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="h-4 w-4 mr-2" />
            Aktivitas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, NISN, atau kamar..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Student List */}
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Tidak ada santri ditemukan</p>
                </div>
              ) : (
                filteredStudents.map((student) => (
                  <Card key={student.id} className="overflow-hidden">
                    <div
                      className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/student/${student.id}`)}
                    >
                      <Avatar className="h-12 w-12 border">
                        <AvatarImage src={student.photo || undefined} />
                        <AvatarFallback>
                          {student.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <p className="font-medium truncate">{student.name}</p>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5"
                          >
                            {student.room}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {student.nisn} • Kelas {student.class}
                        </p>
                      </div>
                    </div>
                    <div className="bg-muted/50 p-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudent(student);
                          setIbadahDialog(true);
                        }}
                      >
                        <Moon className="w-3 h-3 mr-1" /> Ibadah
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-pink-600 hover:text-pink-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudent(student);
                          setHealthDialog(true);
                        }}
                      >
                        <Heart className="w-3 h-3 mr-1" /> Kesehatan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudent(student);
                          setViolationDialog(true);
                        }}
                      >
                        <AlertTriangle className="w-3 h-3 mr-1" /> Pelanggaran
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {/* Night Patrol Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Night Patrol Hari Ini
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">
                    Status:{" "}
                    <Badge
                      className={
                        stats?.nightPatrolStatus === "COMPLETED"
                          ? "bg-green-100 text-green-700"
                          : stats?.nightPatrolStatus === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                      }
                    >
                      {stats?.nightPatrolStatus === "COMPLETED"
                        ? "Selesai"
                        : stats?.nightPatrolStatus === "IN_PROGRESS"
                          ? "Sedang Berjalan"
                          : "Belum Dimulai"}
                    </Badge>
                  </p>
                  {patrolLogs && patrolLogs.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {patrolLogs.length} kamar sudah dicek
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => router.push("/dormitories/patrol")}
                >
                  Mulai Patrol
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Patrol Logs */}
          {patrolLogs && patrolLogs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Log Patrol Terakhir</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {patrolLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded"
                    >
                      <div>
                        <p className="text-sm font-medium">Kamar {log.room}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.studentCount} santri •{" "}
                          {log.checkedAt &&
                          !Number.isNaN(new Date(log.checkedAt).getTime())
                            ? formatDistanceToNow(new Date(log.checkedAt), {
                                addSuffix: true,
                                locale: localeId,
                              })
                            : "-"}
                        </p>
                      </div>
                      <Badge className={getPatrolStatusColor(log.status)}>
                        {log.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Ringkasan Aktivitas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-50 rounded text-center">
                  <p className="text-xl font-bold text-green-600">
                    {stats?.ibadahCompletedToday || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ibadah Tercatat
                  </p>
                </div>
                <div className="p-3 bg-blue-50 rounded text-center">
                  <p className="text-xl font-bold text-blue-600">
                    {stats?.totalStudents || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Santri</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Violation Dialog */}
      <Dialog open={violationDialog} onOpenChange={setViolationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Pelanggaran</DialogTitle>
            <DialogDescription>{selectedStudent?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Jenis Pelanggaran</Label>
              <Select value={violationType} onValueChange={setViolationType}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jenis pelanggaran" />
                </SelectTrigger>
                <SelectContent>
                  {VIOLATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        {type.label}
                        <Badge
                          className={getSeverityColor(type.severity)}
                          variant="outline"
                        >
                          {type.severity}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Catatan (Opsional)</Label>
              <Textarea
                placeholder="Tambahkan catatan..."
                value={violationNotes}
                onChange={(e) => setViolationNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViolationDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleViolationSubmit}
              disabled={!violationType || quickViolation.isPending}
            >
              {quickViolation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Ibadah Dialog */}
      <Dialog open={ibadahDialog} onOpenChange={setIbadahDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Ibadah</DialogTitle>
            <DialogDescription>{selectedStudent?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Jenis Ibadah</Label>
              <Select value={ibadahType} onValueChange={setIbadahType}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jenis ibadah" />
                </SelectTrigger>
                <SelectContent>
                  {IBADAH_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={ibadahStatus}
                onValueChange={(v) =>
                  setIbadahStatus(v as "COMPLETED" | "MISSED")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Dilaksanakan
                    </div>
                  </SelectItem>
                  <SelectItem value="MISSED">
                    <div className="flex items-center gap-2">
                      <X className="h-4 w-4 text-red-500" />
                      Tidak Dilaksanakan
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIbadahDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleIbadahSubmit}
              disabled={!ibadahType || quickIbadah.isPending}
            >
              {quickIbadah.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Health Report Dialog */}
      <Dialog open={healthDialog} onOpenChange={setHealthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lapor Kesehatan</DialogTitle>
            <DialogDescription>{selectedStudent?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kondisi/Keluhan</Label>
              <Input
                placeholder="Contoh: Demam, Batuk, Sakit perut..."
                value={healthCondition}
                onChange={(e) => setHealthCondition(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tingkat Keparahan</Label>
              <Select
                value={healthSeverity}
                onValueChange={(v) =>
                  setHealthSeverity(v as "LOW" | "MEDIUM" | "HIGH")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Ringan</SelectItem>
                  <SelectItem value="MEDIUM">Sedang</SelectItem>
                  <SelectItem value="HIGH">Berat (Perlu Rujukan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Catatan Tambahan</Label>
              <Textarea
                placeholder="Catatan tambahan..."
                value={healthNotes}
                onChange={(e) => setHealthNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHealthDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleHealthSubmit}
              disabled={!healthCondition || reportHealth.isPending}
            >
              {reportHealth.isPending ? "Mengirim..." : "Kirim Laporan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Skeleton component
function MusyrifSkeleton() {
  return (
    <div className="container mx-auto max-w-2xl p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32 mt-1" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function MusyrifDashboardWithShell() {
  return (
    <MainLayout>
      <MusyrifDashboardContent />
    </MainLayout>
  );
}
