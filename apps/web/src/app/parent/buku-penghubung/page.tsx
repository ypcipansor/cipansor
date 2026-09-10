"use client";

import { useState, useEffect } from "react";
import { safeFormat } from "@/lib/date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { api } from "@/lib/api";
// Shared shape — see use-parent-portal.ts.
import type { ParentChild } from "@/hooks/use-parent-portal";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Calendar,
  BookOpen,
  AlertCircle,
  Clock,
  CheckCircle2,
  MessageCircle,
  Star,
  ThumbsUp,
  RefreshCw,
  Plus,
  Search,
  Filter,
  Check,
  X,
  Smile,
  Meh,
  Frown,
  Activity,
  Map as MapIcon,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useDailyReports } from "@/hooks/use-daily-report";
import { useMessages } from "@/hooks/use-messages";
import Link from "next/link";
import { MessageCategory, Message } from "@cipansor/shared";

// ========================================
// TYPES
// ========================================


interface WeeklyProgress {
  week: string;
  attendance: {
    present: number;
    absent: number;
    sick: number;
    permitted: number;
  };
  tahfidz: {
    newMemorization: number;
    review: number;
    grade: string;
  };
  behavior: {
    positive: number;
    negative: number;
    notes: string;
  };
  academic: {
    averageScore: number;
    improvement: string;
  };
}

// ========================================
// COMPONENT
// ========================================

export default function BukuPenghubungPage() {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState({
    subject: "",
    message: "",
    category: "GENERAL" as MessageCategory,
  });
  const [replyMessage, setReplyMessage] = useState("");
  const [weeklyProgress, setWeeklyProgress] = useState<WeeklyProgress | null>(
    null,
  );

  // Daily Reports Query
  const { data: dailyReportsData, isLoading: isLoadingReports } =
    useDailyReports({
      studentId: selectedChildId,
      limit: 10,
      page: 1,
    });

  // Messages Query
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
    createMessage,
    replyMessage: sendReply,
  } = useMessages({
    limit: 50,
    type: "all", // Fetch both inbox and sent to show full history
  });

  const dailyReports = dailyReportsData?.data || [];
  const entries = (messagesData?.data as Message[]) || [];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch children
        const childrenRes = await api.get("/parent/children");
        const childrenData = childrenRes.data.data || [];
        setChildren(childrenData);

        if (childrenData.length > 0 && !selectedChildId) {
          setSelectedChildId(childrenData[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch children:", err);
        toast.error("Gagal memuat data anak");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedChildId) {
      setWeeklyProgress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(
          `/parent/children/${selectedChildId}/weekly-progress`,
        );
        if (!cancelled) setWeeklyProgress(res.data.data as WeeklyProgress);
      } catch (err) {
        console.error("Failed to fetch weekly progress:", err);
        if (!cancelled) setWeeklyProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId]);

  const selectedChild = children.find((c) => c.id === selectedChildId);

  const filteredEntries = entries.filter((entry) => {
    const matchCategory =
      filterCategory === "all" || entry.category === filterCategory;
    const matchSearch =
      !searchQuery ||
      entry.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase());
    // Only show top-level messages (no parentId)
    const isTopLevel = !entry.parentId;
    return matchCategory && matchSearch && isTopLevel;
  });

  const unreadCount = entries.filter(
    (e) =>
      !e.isRead && e.recipientId !== "me" /* logic needs real user id check */,
  ).length;

  const handleSendMessage = async () => {
    if (!newMessage.subject || !newMessage.message) {
      toast.error("Lengkapi semua field");
      return;
    }

    // The recipient is the homeroom teacher's *User* id. `/parent/children`
    // now returns it; this used to send the literal string
    // "system-admin-uuid", so every message a parent wrote failed.
    const recipientId = selectedChild?.currentClass?.homeroomTeacher?.user?.id;
    if (!recipientId) {
      toast.error("Data Wali Kelas tidak ditemukan");
      return;
    }

    createMessage.mutate(
      {
        recipientId: recipientId,
        subject: newMessage.subject,
        content: newMessage.message,
        category: newMessage.category,
      },
      {
        onSuccess: () => {
          setNewMessageOpen(false);
          setNewMessage({
            subject: "",
            message: "",
            category: "GENERAL" as any,
          });
          toast.success("Pesan berhasil dikirim");
        },
        onError: () => {
          toast.error("Gagal mengirim pesan");
        },
      },
    );
  };

  const handleSendReply = async (entryId: string) => {
    if (!replyMessage.trim()) {
      toast.error("Tulis balasan terlebih dahulu");
      return;
    }

    sendReply.mutate(
      { id: entryId, content: replyMessage },
      {
        onSuccess: () => {
          setReplyOpen(null);
          setReplyMessage("");
          toast.success("Balasan berhasil dikirim");
        },
        onError: () => {
          toast.error("Gagal mengirim balasan");
        },
      },
    );
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      ACADEMIC: "bg-blue-100 text-blue-700",
      BEHAVIOR: "bg-purple-100 text-purple-700",
      HEALTH: "bg-red-100 text-red-700",
      GENERAL: "bg-gray-100 text-gray-700",
      ATTENDANCE: "bg-orange-100 text-orange-700",
      TAHFIDZ: "bg-green-100 text-green-700",
    };
    return colors[category] || colors.GENERAL;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      ACADEMIC: "Akademik",
      BEHAVIOR: "Perilaku",
      HEALTH: "Kesehatan",
      GENERAL: "Umum",
      ATTENDANCE: "Kehadiran",
      TAHFIDZ: "Tahfidz",
    };
    return labels[category] || "Umum";
  };

  const getMoodIcon = (mood: string) => {
    switch (mood) {
      case "HAPPY":
      case "EXCITED":
        return <Smile className="h-5 w-5 text-green-500" />;
      case "SAD":
      case "TIRED":
      case "SICK":
        return <Frown className="h-5 w-5 text-red-500" />;
      default:
        return <Meh className="h-5 w-5 text-yellow-500" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Belum ada data anak</h3>
          <p className="text-muted-foreground mt-2">
            Silakan hubungi admin sekolah untuk menghubungkan akun Anda dengan
            data anak.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Buku Penghubung Digital
          </h1>
          <p className="text-muted-foreground">
            Komunikasi antara sekolah dan orang tua
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* ParentChild Selector */}
          <Select value={selectedChildId} onValueChange={setSelectedChildId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Pilih anak" />
            </SelectTrigger>
            <SelectContent>
              {children.map((child) => (
                <SelectItem key={child.id} value={child.id}>
                  {child.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* New Message Button */}
          <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Kirim Pesan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Kirim Pesan ke Guru</DialogTitle>
                <DialogDescription>
                  Kirim pesan kepada wali kelas atau guru{" "}
                  {selectedChild?.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Select
                    value={newMessage.category}
                    onValueChange={(value) =>
                      setNewMessage((prev) => ({
                        ...prev,
                        category: value as MessageCategory,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GENERAL">Umum</SelectItem>
                      <SelectItem value="ACADEMIC">Akademik</SelectItem>
                      <SelectItem value="BEHAVIOR">Perilaku</SelectItem>
                      <SelectItem value="HEALTH">Kesehatan</SelectItem>
                      <SelectItem value="ATTENDANCE">Kehadiran</SelectItem>
                      <SelectItem value="TAHFIDZ">Tahfidz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subjek</Label>
                  <Input
                    placeholder="Judul pesan"
                    value={newMessage.subject}
                    onChange={(e) =>
                      setNewMessage((prev) => ({
                        ...prev,
                        subject: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pesan</Label>
                  <Textarea
                    placeholder="Tulis pesan Anda..."
                    rows={4}
                    value={newMessage.message}
                    onChange={(e) =>
                      setNewMessage((prev) => ({
                        ...prev,
                        message: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setNewMessageOpen(false)}
                >
                  Batal
                </Button>
                <Button onClick={handleSendMessage}>
                  <Send className="h-4 w-4 mr-2" />
                  Kirim
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ParentChild Info Card */}
      {selectedChild && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {selectedChild.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">
                  {selectedChild.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  NISN: {selectedChild.nisn} • Kelas:{" "}
                  {selectedChild.currentClass?.name || "-"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Wali Kelas:{" "}
                  {selectedChild.currentClass?.homeroomTeacher?.user?.name || "-"}
                </p>
              </div>
              {/* Quran Map Link */}
              <Button variant="outline" className="ml-auto" asChild>
                <Link href="/tahfidz/quran-map">
                  <MapIcon className="h-4 w-4 mr-2" />
                  Peta Hafalan
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList>
          <TabsTrigger value="daily" className="gap-2">
            <Activity className="h-4 w-4" />
            Laporan Harian
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Pesan
          </TabsTrigger>
          <TabsTrigger value="weekly" className="gap-2">
            <Calendar className="h-4 w-4" />
            Progress Mingguan
          </TabsTrigger>
        </TabsList>

        {/* Daily Reports Tab */}
        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Laporan Harian Santri</CardTitle>
              <CardDescription>
                Aktivitas harian {selectedChild?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingReports ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : dailyReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Belum ada laporan harian</p>
                </div>
              ) : (
                dailyReports.map((report) => (
                  <Card key={report.id} className="border border-muted">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        {/* Header & Mood */}
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center">
                            <span className="text-2xl font-bold text-primary">
                              {safeFormat(new Date(report.reportDate), "dd")}
                            </span>
                            <span className="text-xs text-muted-foreground uppercase">
                              {safeFormat(new Date(report.reportDate), "MMM")}
                            </span>
                          </div>
                          <div className="h-10 w-[1px] bg-border" />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">
                                {format(
                                  new Date(report.reportDate),
                                  "EEEE, d MMMM yyyy",
                                  { locale: idLocale },
                                )}
                              </h4>
                              {report.mood && getMoodIcon(report.mood)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {report.healthStatus || "Sehat"}
                              {report.temperature &&
                                ` - ${report.temperature}°C`}
                            </p>
                          </div>
                        </div>

                        {/* Ibadah Status */}
                        <div className="flex gap-4 text-sm">
                          <div className="flex flex-col items-center">
                            <span className="text-muted-foreground text-xs mb-1">
                              Dhuha
                            </span>
                            {report.sholatDhuha ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <X className="h-4 w-4 text-red-300" />
                            )}
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-muted-foreground text-xs mb-1">
                              Dzuhur
                            </span>
                            {report.sholatDzuhur ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <X className="h-4 w-4 text-red-300" />
                            )}
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-muted-foreground text-xs mb-1">
                              Ashar
                            </span>
                            {report.sholatAshar ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <X className="h-4 w-4 text-red-300" />
                            )}
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-muted-foreground text-xs mb-1">
                              Jamaah
                            </span>
                            {report.sholatJamaah ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <X className="h-4 w-4 text-red-300" />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm bg-muted/30 p-3 rounded-lg">
                        {/* Tahfidz Note */}
                        {report.tahfidzActivity && (
                          <div>
                            <span className="font-semibold block mb-1">
                              Catatan Tahfidz:
                            </span>
                            <p className="text-muted-foreground">
                              {report.tahfidzActivity}
                            </p>
                          </div>
                        )}

                        {/* Activities */}
                        {report.activitiesSummary && (
                          <div>
                            <span className="font-semibold block mb-1">
                              Aktivitas:
                            </span>
                            <p className="text-muted-foreground whitespace-pre-wrap">
                              {report.activitiesSummary}
                            </p>
                          </div>
                        )}

                        {/* General Note */}
                        {report.teacherNotes && (
                          <div className="md:col-span-2 border-t border-border pt-2 mt-2">
                            <span className="font-semibold block mb-1">
                              Catatan Wali Kelas:
                            </span>
                            <p className="text-muted-foreground italic">
                              "{report.teacherNotes}"
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari pesan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={filterCategory}
                  onValueChange={setFilterCategory}
                >
                  <SelectTrigger className="w-full md:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kategori</SelectItem>
                    <SelectItem value="ACADEMIC">Akademik</SelectItem>
                    <SelectItem value="BEHAVIOR">Perilaku</SelectItem>
                    <SelectItem value="HEALTH">Kesehatan</SelectItem>
                    <SelectItem value="ATTENDANCE">Kehadiran</SelectItem>
                    <SelectItem value="TAHFIDZ">Tahfidz</SelectItem>
                    <SelectItem value="GENERAL">Umum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Messages List */}
          <div className="space-y-4">
            {isLoadingMessages ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : filteredEntries.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Tidak ada pesan</p>
                </CardContent>
              </Card>
            ) : (
              filteredEntries.map((entry) => (
                <Card
                  key={entry.id}
                  className={`${!entry.isRead ? "border-primary/50 bg-primary/5" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback
                          className={`${
                            entry.sender?.role === "TEACHER"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {entry.sender?.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">
                            {entry.sender?.name || "Unknown"}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {entry.sender?.role || "User"}
                          </Badge>
                          <Badge
                            className={`text-xs ${getCategoryColor(entry.category)}`}
                          >
                            {getCategoryLabel(entry.category)}
                          </Badge>
                          {!entry.isRead && (
                            <Badge className="text-xs bg-primary">Baru</Badge>
                          )}
                        </div>
                        <h4 className="font-medium mt-1">{entry.subject}</h4>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                          {entry.content}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(entry.createdAt), {
                              addSuffix: true,
                              locale: idLocale,
                            })}
                          </span>
                          {entry.replies && entry.replies.length > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Sudah dibalas ({entry.replies.length})
                            </span>
                          )}
                        </div>

                        {/* Replies */}
                        {entry.replies && entry.replies.length > 0 && (
                          <div className="mt-4 pl-4 border-l-2 border-muted space-y-3">
                            {entry.replies.map((reply) => (
                              <div key={reply.id} className="text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {reply.sender?.name}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {reply.sender?.role}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(
                                      new Date(reply.createdAt),
                                      {
                                        addSuffix: true,
                                        locale: idLocale,
                                      },
                                    )}
                                  </span>
                                </div>
                                <p className="text-muted-foreground mt-1">
                                  {reply.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply Button */}
                        <div className="mt-3">
                          {replyOpen === entry.id ? (
                            <div className="space-y-2">
                              <Textarea
                                placeholder="Tulis balasan..."
                                rows={2}
                                value={replyMessage}
                                onChange={(e) =>
                                  setReplyMessage(e.target.value)
                                }
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleSendReply(entry.id)}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  Kirim
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReplyOpen(null);
                                    setReplyMessage("");
                                  }}
                                >
                                  Batal
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReplyOpen(entry.id)}
                            >
                              <MessageCircle className="h-3 w-3 mr-1" />
                              Balas
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Weekly Progress Tab — aggregated from the parent weekly-progress API */}
        <TabsContent value="weekly" className="space-y-4">
          {!weeklyProgress && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {selectedChildId
                  ? "Belum ada data perkembangan untuk minggu ini."
                  : "Pilih anak untuk melihat perkembangan mingguan."}
              </CardContent>
            </Card>
          )}
          {weeklyProgress && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {weeklyProgress.week}
                  </CardTitle>
                  <CardDescription>
                    Ringkasan perkembangan {selectedChild?.name} minggu
                    ini
                  </CardDescription>
                </CardHeader>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Attendance */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Kehadiran
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <p className="text-2xl font-bold text-green-700">
                          {weeklyProgress.attendance.present}
                        </p>
                        <p className="text-xs text-green-600">Hadir</p>
                      </div>
                      <div className="p-2 bg-red-100 rounded-lg">
                        <p className="text-2xl font-bold text-red-700">
                          {weeklyProgress.attendance.absent}
                        </p>
                        <p className="text-xs text-red-600">Alpha</p>
                      </div>
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <p className="text-2xl font-bold text-yellow-700">
                          {weeklyProgress.attendance.sick}
                        </p>
                        <p className="text-xs text-yellow-600">Sakit</p>
                      </div>
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <p className="text-2xl font-bold text-blue-700">
                          {weeklyProgress.attendance.permitted}
                        </p>
                        <p className="text-xs text-blue-600">Izin</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tahfidz */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Tahfidz
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">
                          Hafalan Baru
                        </span>
                        <span className="font-medium">
                          {weeklyProgress.tahfidz.newMemorization} ayat
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">
                          Muraja'ah
                        </span>
                        <span className="font-medium">
                          {weeklyProgress.tahfidz.review} ayat
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">
                          Predikat
                        </span>
                        <Badge className="bg-green-100 text-green-700">
                          {weeklyProgress.tahfidz.grade}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Behavior */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4" />
                      Perilaku
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold">
                            +{weeklyProgress.behavior.positive}
                          </span>
                          <span className="text-sm">Positif</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold">
                            -{weeklyProgress.behavior.negative}
                          </span>
                          <span className="text-sm">Negatif</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {weeklyProgress.behavior.notes}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Academic */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Akademik
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          Nilai Rata-rata
                        </span>
                        <span className="text-2xl font-bold text-primary">
                          {weeklyProgress.academic.averageScore}
                        </span>
                      </div>
                      <p className="text-sm text-green-600 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {weeklyProgress.academic.improvement}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
