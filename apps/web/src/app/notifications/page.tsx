"use client";
import { useState } from "react";
import { safeFormat } from "@/lib/date";
import { MainLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  useNotifications,
  useNotificationStats,
  useNotificationTemplates,
  useDeleteNotification,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_PRIORITY_LABELS,
  RECIPIENT_TYPE_LABELS,
  type NotificationType,
  type NotificationPriority,
  type AppNotification,
} from "@/hooks";
import {
  Bell,
  Search,
  Plus,
  Eye,
  Send,
  Trash2,
  FileText,
  Users,
  CheckCircle,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  BarChart3,
} from "lucide-react";

import { id } from "date-fns/locale";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("notifications");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "ALL">("ALL");

  const { data: notificationsData, isLoading } = useNotifications({
    type: typeFilter !== "ALL" ? typeFilter : undefined,
  });
  const { data: stats } = useNotificationStats();
  const { data: templates } = useNotificationTemplates();
  const deleteNotification = useDeleteNotification();

  const notifications: AppNotification[] = notificationsData?.data || [];

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification.mutateAsync(id);
      toast.success("Notifikasi berhasil dihapus");
    } catch {
      toast.error("Gagal menghapus notifikasi");
    }
  };

  const getTypeBadge = (type: NotificationType) => {
    const colors: Record<NotificationType, string> = {
      ANNOUNCEMENT: "bg-blue-100 text-blue-800",
      ATTENDANCE: "bg-green-100 text-green-800",
      FINANCE: "bg-yellow-100 text-yellow-800",
      ACADEMIC: "bg-purple-100 text-purple-800",
      PERMIT: "bg-indigo-100 text-indigo-800",
      HEALTH: "bg-pink-100 text-pink-800",
      VIOLATION: "bg-red-100 text-red-800",
      REWARD: "bg-emerald-100 text-emerald-800",
      SYSTEM: "bg-gray-100 text-gray-800",
    };
    return (
      <Badge className={colors[type]}>{NOTIFICATION_TYPE_LABELS[type]}</Badge>
    );
  };

  const getPriorityBadge = (priority: NotificationPriority) => {
    const colors: Record<NotificationPriority, string> = {
      LOW: "bg-gray-100 text-gray-800",
      NORMAL: "bg-blue-100 text-blue-800",
      HIGH: "bg-orange-100 text-orange-800",
      URGENT: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={colors[priority]}>
        {NOTIFICATION_PRIORITY_LABELS[priority]}
      </Badge>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notifikasi</h1>
            <p className="text-muted-foreground">
              Kelola pengumuman dan notifikasi sistem
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/notifications/templates">
                <FileText className="mr-2 h-4 w-4" />
                Template
              </Link>
            </Button>
            {/* Broadcasting is Pengumuman (decisions/siaran-pengumuman.md). */}
            <Button asChild>
              <Link href="/announcements">
                <Plus className="mr-2 h-4 w-4" />
                Buat Pengumuman
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Notifikasi
              </CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.todayCount ?? 0} hari ini
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Tingkat Pengiriman
              </CardTitle>
              <Send className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats?.deliveryRate
                  ? `${stats.deliveryRate.toFixed(1)}%`
                  : "-"}
              </div>
              <p className="text-xs text-muted-foreground">Berhasil dikirim</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Tingkat Baca
              </CardTitle>
              <Eye className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {stats?.readRate ? `${stats.readRate.toFixed(1)}%` : "-"}
              </div>
              <p className="text-xs text-muted-foreground">Dibaca penerima</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Template</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{templates?.length ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {templates?.filter((t) => t.isActive).length ?? 0} aktif
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="notifications">
              <Bell className="mr-2 h-4 w-4" />
              Notifikasi
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="mr-2 h-4 w-4" />
              Template
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analitik
            </TabsTrigger>
          </TabsList>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cari notifikasi..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={typeFilter}
                    onValueChange={(v) =>
                      setTypeFilter(v as NotificationType | "ALL")
                    }
                  >
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Semua Tipe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Tipe</SelectItem>
                      {NOTIFICATION_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {NOTIFICATION_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Prioritas</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : notifications.length ? (
                    notifications.map((notif) => (
                      <TableRow key={notif.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{notif.title}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[250px]">
                              {notif.message}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(notif.type)}</TableCell>
                        <TableCell>
                          {getPriorityBadge(notif.priority)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {notif.totalRecipients} (
                              {RECIPIENT_TYPE_LABELS[notif.recipientType]})
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {notif.sentAt ? (
                            <div className="flex items-center gap-1">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="text-sm">
                                {notif.readCount}/{notif.deliveredCount} dibaca
                              </span>
                            </div>
                          ) : notif.scheduledAt ? (
                            <div className="flex items-center gap-1 text-yellow-600">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm">Dijadwalkan</span>
                            </div>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {safeFormat(new Date(notif.createdAt), "d MMM yyyy", {
                            locale: id,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/notifications/${notif.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Hapus Notifikasi?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tindakan ini tidak dapat dibatalkan.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(notif.id)}
                                  >
                                    Hapus
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Belum ada notifikasi
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="flex justify-end">
              <Button asChild>
                <Link href="/notifications/templates/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Buat Template
                </Link>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates?.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {template.name}
                        </CardTitle>
                        <CardDescription>
                          {NOTIFICATION_TYPE_LABELS[template.type]}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={template.isActive ? "default" : "secondary"}
                      >
                        {template.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium">Template Judul:</p>
                        <p className="text-sm text-muted-foreground">
                          {template.titleTemplate}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Channel:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {template.channels.map((channel: string) => (
                            <Badge
                              key={channel}
                              variant="outline"
                              className="text-xs"
                            >
                              {channel === "EMAIL" && (
                                <Mail className="mr-1 h-3 w-3" />
                              )}
                              {channel === "IN_APP" && (
                                <Bell className="mr-1 h-3 w-3" />
                              )}
                              {channel === "WHATSAPP" && (
                                <MessageSquare className="mr-1 h-3 w-3" />
                              )}
                              {channel}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Variabel:</p>
                        <p className="text-sm text-muted-foreground">
                          {template.variables.join(", ") || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/notifications/templates/${template.id}/edit`}
                        >
                          Edit
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!templates?.length && (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Belum ada template notifikasi
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Distribusi per Tipe</CardTitle>
                  <CardDescription>
                    Notifikasi berdasarkan kategori
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {NOTIFICATION_TYPES.map((type) => {
                      const count = stats?.byType?.[type] ?? 0;
                      const total = stats?.total ?? 1;
                      const percentage = (count / total) * 100;
                      return (
                        <div key={type} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{NOTIFICATION_TYPE_LABELS[type]}</span>
                            <span>{count}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performa Pengiriman</CardTitle>
                  <CardDescription>
                    Statistik pengiriman notifikasi
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-3xl font-bold text-green-600">
                          {stats?.deliveryRate?.toFixed(1) ?? 0}%
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Terkirim
                        </p>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-blue-600">
                          {stats?.readRate?.toFixed(1) ?? 0}%
                        </div>
                        <p className="text-sm text-muted-foreground">Dibaca</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Minggu Ini</span>
                        <span>{stats?.weekCount ?? 0} notifikasi</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Hari Ini</span>
                        <span>{stats?.todayCount ?? 0} notifikasi</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
