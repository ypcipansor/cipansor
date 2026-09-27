"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  ClipboardCheck,
  Clock,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HomeroomNote } from "@cipansor/shared";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  useBehaviorRecords,
  useCreateBehaviorRecord,
  useDeleteBehaviorRecord,
} from "@/hooks/use-behavior";
import {
  useHomeroomClasses,
  useHomeroomClassStudents,
} from "@/hooks/use-homeroom";
import { MainLayout } from "@/components/layout";

/**
 * A wali kelas's notes on the pupils of their class. Two kinds, as the API
 * stores them: positive (a reward) and needing attention (a minor violation,
 * with what was done about it). No points: a sanction and its points are the
 * kesiswaan's, in the violations module.
 */
type Kind = HomeroomNote["kind"];

const KIND_LABEL: Record<Kind, string> = {
  reward: "Positif",
  violation: "Perlu Perhatian",
};

const CATEGORIES = [
  "Akademik",
  "Tahfidz",
  "Ibadah",
  "Kedisiplinan",
  "Akhlak",
  "Sosial",
  "Kebersihan",
  "Lainnya",
];

const EMPTY_NOTE = {
  studentId: "",
  type: "POSITIVE" as "POSITIVE" | "NEGATIVE",
  category: "",
  description: "",
  action: "",
};

function BehaviorAnalytics({ notes }: { notes: HomeroomNote[] }) {
  const attention = notes.filter((n) => n.kind === "violation");

  // Categories that need attention most often.
  const byCategory = Object.entries(
    attention.reduce<Record<string, number>>((acc, n) => {
      acc[n.category] = (acc[n.category] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Pupils with the most notes needing attention.
  const byPupil = Object.values(
    attention.reduce<Record<string, { name: string; count: number }>>(
      (acc, n) => {
        const entry = (acc[n.student.id] ??= {
          name: n.student.user.name,
          count: 0,
        });
        entry.count += 1;
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const ratio = [
    {
      name: KIND_LABEL.reward,
      value: notes.length - attention.length,
      color: "#22c55e",
    },
    { name: KIND_LABEL.violation, value: attention.length, color: "#ef4444" },
  ];

  if (notes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Belum ada catatan untuk kelas ini.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Kategori yang Perlu Perhatian</CardTitle>
            <CardDescription>Jumlah catatan per kategori</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada catatan yang perlu perhatian.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byCategory}
                  layout="vertical"
                  margin={{ left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    name="Catatan"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rasio Catatan</CardTitle>
            <CardDescription>Positif dibanding perlu perhatian</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ratio}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {ratio.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {byPupil.length > 0 && (
        <Card className="border-red-200 bg-red-50/10">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Paling Sering Perlu Perhatian
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {byPupil.map((pupil, idx) => (
                <div
                  key={pupil.name}
                  className="flex items-center justify-between border-b last:border-0 pb-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-700">
                      {idx + 1}
                    </div>
                    <span className="font-semibold">{pupil.name}</span>
                  </div>
                  <Badge variant="outline" className="bg-white">
                    {pupil.count} catatan
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BehaviorNotesPageContent() {
  // This academic year's class of this wali kelas (the API lists it first).
  const { data: classes, isLoading: isLoadingClass } = useHomeroomClasses();
  const homeroomClass = classes?.find((c) => c.isCurrent);

  const { data: studentsData } = useHomeroomClassStudents(homeroomClass?.id);
  const students = useMemo(
    () =>
      (studentsData ?? []).map((s) => ({
        id: s.id,
        nis: s.nis,
        name: s.user.name,
      })),
    [studentsData],
  );

  const { data: notesData, isLoading: isLoadingNotes } = useBehaviorRecords(
    homeroomClass?.id,
  );
  const notes = useMemo(() => notesData ?? [], [notesData]);
  const createNote = useCreateBehaviorRecord();
  const deleteNote = useDeleteBehaviorRecord();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"analytics" | "all" | Kind>("all");
  const [newNote, setNewNote] = useState(EMPTY_NOTE);

  const listed = notes.filter((note) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      note.student.user.name.toLowerCase().includes(q) ||
      note.description.toLowerCase().includes(q);
    const matchesKind =
      activeTab === "all" || activeTab === "analytics"
        ? true
        : note.kind === activeTab;
    return matchesSearch && matchesKind;
  });

  const summary = {
    total: notes.length,
    positive: notes.filter((n) => n.kind === "reward").length,
    attention: notes.filter((n) => n.kind === "violation").length,
    followedUp: notes.filter((n) => n.kind === "violation" && n.action).length,
  };

  const handleAddNote = () => {
    if (!newNote.studentId || !newNote.category || !newNote.description) {
      toast.error("Lengkapi siswa, kategori dan isi catatan");
      return;
    }
    createNote.mutate(
      {
        studentId: newNote.studentId,
        type: newNote.type,
        category: newNote.category,
        description: newNote.description,
        action:
          newNote.type === "NEGATIVE" && newNote.action
            ? newNote.action
            : undefined,
      },
      {
        onSuccess: () => {
          setIsAddDialogOpen(false);
          setNewNote(EMPTY_NOTE);
        },
      },
    );
  };

  const handleDelete = (note: HomeroomNote) => {
    if (!window.confirm("Hapus catatan ini?")) return;
    deleteNote.mutate({ id: note.id, kind: note.kind });
  };

  if (isLoadingClass) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!homeroomClass) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertTitle>Tidak ada kelas perwalian</AlertTitle>
          <AlertDescription>
            Anda bukan wali kelas kelas mana pun tahun ajaran ini. Catatan
            perilaku ditulis oleh wali kelas untuk murid kelasnya.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/homeroom">
          <Button variant="ghost" size="icon" aria-label="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Catatan Perilaku Siswa</h1>
          <p className="text-muted-foreground">
            {homeroomClass.name} - {homeroomClass.unit.name} ·{" "}
            {homeroomClass.academicYear.name}
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
                Catatan positif, atau hal yang perlu perhatian beserta
                tindakannya.
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
                  <SelectTrigger aria-label="Siswa">
                    <SelectValue placeholder="Pilih siswa" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.nis} - {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Jenis Catatan</Label>
                <Select
                  value={newNote.type}
                  onValueChange={(value) =>
                    setNewNote({
                      ...newNote,
                      type: value as "POSITIVE" | "NEGATIVE",
                    })
                  }
                >
                  <SelectTrigger aria-label="Jenis Catatan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POSITIVE">
                      {KIND_LABEL.reward}
                    </SelectItem>
                    <SelectItem value="NEGATIVE">
                      {KIND_LABEL.violation}
                    </SelectItem>
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
                  <SelectTrigger aria-label="Kategori">
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
                <Label htmlFor="note-description">Catatan</Label>
                <Textarea
                  id="note-description"
                  placeholder="Apa yang terjadi?"
                  value={newNote.description}
                  onChange={(e) =>
                    setNewNote({ ...newNote, description: e.target.value })
                  }
                  rows={3}
                />
              </div>

              {newNote.type === "NEGATIVE" && (
                <div className="space-y-2">
                  <Label htmlFor="note-action">Tindakan (opsional)</Label>
                  <Textarea
                    id="note-action"
                    placeholder="Apa yang sudah atau akan dilakukan?"
                    value={newNote.action}
                    onChange={(e) =>
                      setNewNote({ ...newNote, action: e.target.value })
                    }
                    rows={2}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Batal
              </Button>
              <Button onClick={handleAddNote} disabled={createNote.isPending}>
                {createNote.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          {
            label: "Total Catatan",
            value: summary.total,
            icon: <Clock className="h-5 w-5 text-blue-600" />,
            tone: "bg-blue-100 dark:bg-blue-900/20",
          },
          {
            label: KIND_LABEL.reward,
            value: summary.positive,
            icon: <Award className="h-5 w-5 text-green-600" />,
            tone: "bg-green-100 dark:bg-green-900/20",
          },
          {
            label: KIND_LABEL.violation,
            value: summary.attention,
            icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
            tone: "bg-red-100 dark:bg-red-900/20",
          },
          {
            label: "Sudah Ditindaklanjuti",
            value: summary.followedUp,
            icon: <ClipboardCheck className="h-5 w-5 text-yellow-600" />,
            tone: "bg-yellow-100 dark:bg-yellow-900/20",
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${card.tone}`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {isLoadingNotes ? "–" : card.value}
                  </p>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="all">Semua ({summary.total})</TabsTrigger>
            <TabsTrigger value="reward">
              {KIND_LABEL.reward} ({summary.positive})
            </TabsTrigger>
            <TabsTrigger value="violation">
              {KIND_LABEL.violation} ({summary.attention})
            </TabsTrigger>
            <TabsTrigger value="analytics">Analitik</TabsTrigger>
          </TabsList>

          {activeTab !== "analytics" && (
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari siswa atau catatan..."
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

        {activeTab !== "analytics" && (
          <TabsContent value={activeTab} className="mt-4">
            {listed.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    {isLoadingNotes ? "Memuat…" : "Tidak ada catatan ditemukan"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {listed.map((note) => (
                  <Card key={note.id} data-testid={`note-${note.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {note.student.user.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">
                                {note.student.user.name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {note.student.nis}
                              </Badge>
                              <Badge
                                className={`text-xs ${note.kind === "reward" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                              >
                                {KIND_LABEL[note.kind]}
                              </Badge>
                            </div>
                            <p className="text-sm">{note.description}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{note.category}</span>
                              <span>•</span>
                              <span>
                                {new Date(note.at).toLocaleDateString("id-ID", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                })}
                              </span>
                              {note.author && (
                                <>
                                  <span>•</span>
                                  <span>{note.author.name}</span>
                                </>
                              )}
                            </div>
                            {note.action && (
                              <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <strong>Tindakan:</strong> {note.action}
                              </div>
                            )}
                          </div>
                        </div>
                        {note.canChange && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Hapus catatan"
                            onClick={() => handleDelete(note)}
                            disabled={deleteNote.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
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
