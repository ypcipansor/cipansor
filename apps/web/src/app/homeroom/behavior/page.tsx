"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowLeft,
  Search,
  Clock,
  CheckCircle,
  AlertTriangle,
  Award,
  Trash2,
  Edit,
  ChevronDown,
  MessageCircle,
  User,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
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
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useClasses } from "@/hooks/use-classes";
import {
  useBehaviorRecords,
  useCreateBehaviorRecord,
} from "@/hooks/use-behavior";
import { useMyHomeroomClass } from "@/hooks/use-homeroom";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout";

// Types
type NoteType =
  | "POSITIVE"
  | "NEGATIVE"
  | "ACHIEVEMENT"
  | "VIOLATION"
  | "COUNSELING_NEEDED"
  | "PARENT_CONTACTED";

interface BehaviorNote {
  id: string;
  studentId: string;
  studentName: string;
  studentNisn: string;
  type: NoteType;
  category: string;
  description: string;
  date: string;
  points?: number;
  followUp?: string;
  resolved: boolean;
  resolvedDate?: string;
  createdBy: string;
}

const NOTE_TYPE_CONFIG: Record<
  NoteType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  POSITIVE: {
    label: "Positif",
    color: "bg-green-100 text-green-800",
    icon: <CheckCircle className="h-4 w-4" />,
  },
  NEGATIVE: {
    label: "Negatif",
    color: "bg-orange-100 text-orange-800",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  ACHIEVEMENT: {
    label: "Prestasi",
    color: "bg-yellow-100 text-yellow-800",
    icon: <Award className="h-4 w-4" />,
  },
  VIOLATION: {
    label: "Pelanggaran",
    color: "bg-red-100 text-red-800",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  COUNSELING_NEEDED: {
    label: "Perlu BK",
    color: "bg-purple-100 text-purple-800",
    icon: <MessageCircle className="h-4 w-4" />,
  },
  PARENT_CONTACTED: {
    label: "Wali Dihubungi",
    color: "bg-blue-100 text-blue-800",
    icon: <User className="h-4 w-4" />,
  },
};

const CATEGORIES = [
  "Akademik",
  "Tahfidz",
  "Kedisiplinan",
  "Perilaku",
  "Sosial",
  "Personal",
  "Ekstrakurikuler",
  "Lainnya",
];

function BehaviorAnalytics({ notes }: { notes: any[] }) {
  // 1. Violations by Category
  const categoryData = notes
    .filter((n) => ["NEGATIVE", "VIOLATION"].includes(n.behaviorType))
    .reduce(
      (acc, curr) => {
        const existing = acc.find((a: any) => a.name === curr.category);
        if (existing) {
          existing.value += 1;
        } else {
          acc.push({ name: curr.category, value: 1 });
        }
        return acc;
      },
      [] as { name: string; value: number }[],
    )
    .sort((a: { value: number }, b: { value: number }) => b.value - a.value);

  // 2. Top Violators
  const studentNegativePoints = notes
    .filter((n) => ["NEGATIVE", "VIOLATION"].includes(n.behaviorType))
    .reduce(
      (acc, curr) => {
        const studentName = curr.student?.user?.name || "Unknown";
        const existing = acc.find((a: any) => a.name === studentName);
        if (existing) {
          existing.points += Math.abs(curr.points || 0);
          existing.count += 1;
        } else {
          acc.push({
            name: studentName,
            points: Math.abs(curr.points || 0),
            count: 1,
          });
        }
        return acc;
      },
      [] as { name: string; points: number; count: number }[],
    )
    .sort((a: { points: number }, b: { points: number }) => b.points - a.points)
    .slice(0, 5);

  // 3. Positive vs Negative Trend (Simple count)
  const pieData = [
    {
      name: "Positif",
      value: notes.filter((n) =>
        ["POSITIVE", "ACHIEVEMENT"].includes(n.behaviorType),
      ).length,
      color: "#22c55e",
    },
    {
      name: "Negatif",
      value: notes.filter((n) =>
        ["NEGATIVE", "VIOLATION"].includes(n.behaviorType),
      ).length,
      color: "#ef4444",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CHART 1: PROBLEM AREAS */}
        <Card>
          <CardHeader>
            <CardTitle>Problem Areas (Violations by Category)</CardTitle>
            <CardDescription>Kategori pelanggaran terbanyak</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ left: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Bar
                  dataKey="value"
                  fill="#ef4444"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* CHART 2: RATIO */}
        <Card>
          <CardHeader>
            <CardTitle>Rasio Perilaku</CardTitle>
            <CardDescription>
              Perbandingan catatan positif vs negatif
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* TABLE: TOP VIOLATORS */}
      <Card className="border-red-200 bg-red-50/10">
        <CardHeader>
          <CardTitle className="text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Perlu Perhatian Khusus (Top 5 Poin Negatif)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {studentNegativePoints.map(
              (
                s: { name: string; points: number; count: number },
                idx: number,
              ) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border-b last:border-0 pb-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-700">
                      {idx + 1}
                    </div>
                    <span className="font-semibold">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="bg-white">
                      {s.count} Kasus
                    </Badge>
                    <span className="font-bold text-red-600">
                      -{s.points} Poin
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BehaviorNotesPageContent() {
  const { data: notesData, isLoading } = useBehaviorRecords();
  const { data: homeroomClass, isLoading: isLoadingClass } =
    useMyHomeroomClass();
  const createMutation = useCreateBehaviorRecord();

  // Transform API data to UI model if needed, or use directly
  const notes = notesData || [];

  // Get students from homeroom class
  const students = useMemo(() => {
    return (
      homeroomClass?.students?.map((s) => ({
        id: s.id,
        nisn: s.nisn,
        name: s.name,
      })) || []
    );
  }, [homeroomClass]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterResolved, setFilterResolved] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("analytics");

  // New note form state
  const [newNote, setNewNote] = useState({
    studentId: "",
    type: "POSITIVE" as NoteType,
    category: "",
    description: "",
    points: "",
    followUp: "",
  });

  const filteredNotes = notes.filter((note: any) => {
    const matchesSearch =
      (note.student?.user?.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      note.description.toLowerCase().includes(searchQuery.toLowerCase());

    // Simplistic mapping for demo purposes - enhance with real API data mapping
    const matchesType =
      filterType === "all" || note.behaviorType === filterType;

    return matchesSearch && matchesType;
  });

  const handleAddNote = () => {
    if (!newNote.studentId || !newNote.category || !newNote.description) {
      toast.error("Lengkapi data yang diperlukan");
      return;
    }

    createMutation.mutate(
      {
        studentId: newNote.studentId,
        behaviorType:
          newNote.type === "POSITIVE" || newNote.type === "ACHIEVEMENT"
            ? "POSITIVE"
            : "NEGATIVE",
        category: newNote.category,
        description: newNote.description,
        points: newNote.points ? parseInt(newNote.points) : undefined,
        actionTaken: newNote.followUp,
        date: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          setIsAddDialogOpen(false);
          setNewNote({
            studentId: "",
            type: "POSITIVE",
            category: "",
            description: "",
            points: "",
            followUp: "",
          });
        },
      },
    );
  };

  const handleResolve = (noteId: string) => {
    toast.success("Fitur update status belum tersedia via API");
  };

  const handleDelete = (noteId: string) => {
    toast.success("Fitur hapus belum tersedia via API");
  };

  const getSummary = () => ({
    total: notes.length,
    positive: notes.filter((n: any) => n.behaviorType === "POSITIVE").length,
    negative: notes.filter((n: any) => n.behaviorType === "NEGATIVE").length,
    pending: 0, // Pending logic depends on backend implementation
  });

  const summary = getSummary();

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/homeroom">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Catatan Perilaku Siswa</h1>
          <p className="text-muted-foreground">
            {homeroomClass?.name || "Memuat..."} -{" "}
            {homeroomClass?.unit?.name || "Pesantren Cipansor"}
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Tambah Catatan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tambah Catatan Perilaku</DialogTitle>
              <DialogDescription>
                Catat prestasi, pelanggaran, atau catatan penting siswa
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Siswa</Label>
                <Select
                  value={newNote.studentId}
                  onValueChange={(value) =>
                    setNewNote({ ...newNote, studentId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih siswa" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingClass ? (
                      <SelectItem value="" disabled>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Memuat...
                      </SelectItem>
                    ) : students.length === 0 ? (
                      <SelectItem value="" disabled>
                        Tidak ada data siswa
                      </SelectItem>
                    ) : (
                      students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.nisn} - {student.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Jenis Catatan</Label>
                <Select
                  value={newNote.type}
                  onValueChange={(value) =>
                    setNewNote({ ...newNote, type: value as NoteType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NOTE_TYPE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          {config.icon}
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select
                  value={newNote.category}
                  onValueChange={(value) =>
                    setNewNote({ ...newNote, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deskripsi</Label>
                <Textarea
                  placeholder="Jelaskan detail catatan..."
                  value={newNote.description}
                  onChange={(e) =>
                    setNewNote({ ...newNote, description: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Poin (opsional)</Label>
                  <Input
                    type="number"
                    placeholder="Contoh: 10 atau -5"
                    value={newNote.points}
                    onChange={(e) =>
                      setNewNote({ ...newNote, points: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tindak Lanjut (opsional)</Label>
                <Textarea
                  placeholder="Rencana tindak lanjut..."
                  value={newNote.followUp}
                  onChange={(e) =>
                    setNewNote({ ...newNote, followUp: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Batal
              </Button>
              <Button onClick={handleAddNote}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/20">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.total}</p>
                <p className="text-sm text-muted-foreground">Total Catatan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/20">
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.positive}</p>
                <p className="text-sm text-muted-foreground">
                  Positif/Prestasi
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/20">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.negative}</p>
                <p className="text-sm text-muted-foreground">
                  Negatif/Pelanggaran
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/20">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.pending}</p>
                <p className="text-sm text-muted-foreground">
                  Perlu Tindak Lanjut
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics & Lists Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="analytics">Analytics & Heatmap</TabsTrigger>
            <TabsTrigger value="all">Semua ({notes.length})</TabsTrigger>
            <TabsTrigger value="positive">
              Positif (
              {notes.filter((n: any) => n.behaviorType === "POSITIVE").length})
            </TabsTrigger>
            <TabsTrigger value="negative">
              Negatif (
              {notes.filter((n: any) => n.behaviorType === "NEGATIVE").length})
            </TabsTrigger>
            <TabsTrigger value="followup">
              Tindak Lanjut (
              {notes.filter((n: any) => n.behaviorType === "NEUTRAL").length})
            </TabsTrigger>
          </TabsList>

          {/* Search only shows on list tabs */}
          {activeTab !== "analytics" && (
            <div className="relative w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari siswa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          )}
        </div>

        <TabsContent value="analytics" className="mt-6">
          <BehaviorAnalytics notes={notes} />
        </TabsContent>

        <TabsContent value={activeTab} className="mt-4">
          {activeTab !== "analytics" &&
            (filteredNotes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    Tidak ada catatan ditemukan
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredNotes.map((note: any) => (
                  <Card
                    key={note.id}
                    className={note.resolved ? "opacity-75" : ""}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {(note.student?.user?.name || "?").charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {note.student?.user?.name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {note.student?.nisn}
                              </Badge>
                              <Badge
                                className={`text-xs ${note.behaviorType === "POSITIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                              >
                                <span className="flex items-center gap-1">
                                  {note.behaviorType}
                                </span>
                              </Badge>
                            </div>
                            <p className="text-sm">{note.description}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{note.category}</span>
                              <span>•</span>
                              <span>
                                {new Date(note.date).toLocaleDateString(
                                  "id-ID",
                                )}
                              </span>
                              {note.points && (
                                <>
                                  <span>•</span>
                                  <span
                                    className={
                                      note.points > 0
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }
                                  >
                                    {note.points > 0 ? "+" : ""}
                                    {note.points} poin
                                  </span>
                                </>
                              )}
                            </div>
                            {note.actionTaken && (
                              <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <strong>Tindak lanjut:</strong>{" "}
                                {note.actionTaken}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Actions handled via dropdown/buttons */}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BehaviorNotesPage() {
  return (
    <MainLayout>
      <BehaviorNotesPageContent />
    </MainLayout>
  );
}
