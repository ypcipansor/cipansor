"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useNotification,
  useSendNotification,
  useDeleteNotification,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_PRIORITY_LABELS,
  RECIPIENT_TYPE_LABELS,
  type NotificationType,
  type NotificationPriority,
  type AppNotification,
} from "@/hooks";
import {
  ArrowLeft,
  Send,
  Trash2,
  Loader2,
  Bell,
  Users,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
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

interface PageProps {
  params: Promise<{ id: string }>;
}

// `GET /notifications/:id` returns the Notification row (status/readAt/user),
// not the delivery-report shape the shared `AppNotification` describes. Those
// DB-only fields are optional here so the detail view can show them when the
// API sends them without the shared contract having to grow them.
type NotificationDetail = AppNotification & {
  status?: string;
  readAt?: string | null;
  user?: { id: string; name: string; email?: string };
};

// The Notification model stores a narrower enum (INFO / ANNOUNCEMENT / REMINDER
// / ALERT / PAYMENT / ACADEMIC) than the shared UI type, so label maps keyed
// only on the UI union render blank for the DB values. Cover both.
const TYPE_LABELS: Record<string, string> = {
  ...NOTIFICATION_TYPE_LABELS,
  INFO: "Informasi",
  REMINDER: "Pengingat",
  ALERT: "Peringatan",
  PAYMENT: "Pembayaran",
};

const STATUS_LABELS: Record<string, string> = {
  UNREAD: "Belum Dibaca",
  READ: "Dibaca",
  ARCHIVED: "Diarsipkan",
};

const TYPE_COLORS: Record<string, string> = {
  ANNOUNCEMENT: "bg-blue-100 text-blue-800",
  ATTENDANCE: "bg-green-100 text-green-800",
  FINANCE: "bg-yellow-100 text-yellow-800",
  ACADEMIC: "bg-purple-100 text-purple-800",
  PERMIT: "bg-indigo-100 text-indigo-800",
  HEALTH: "bg-pink-100 text-pink-800",
  VIOLATION: "bg-red-100 text-red-800",
  REWARD: "bg-emerald-100 text-emerald-800",
  SYSTEM: "bg-gray-100 text-gray-800",
  INFO: "bg-gray-100 text-gray-800",
  REMINDER: "bg-amber-100 text-amber-800",
  ALERT: "bg-red-100 text-red-800",
  PAYMENT: "bg-yellow-100 text-yellow-800",
};

function NotificationDetailPageContent({ params }: PageProps) {
  const { id: notificationId } = use(params);
  const router = useRouter();

  const { data: rawNotification, isLoading } = useNotification(notificationId);
  const notification = rawNotification as NotificationDetail | undefined;
  const sendNotification = useSendNotification();
  const deleteNotification = useDeleteNotification();

  const getTypeBadge = (type: string) => {
    return (
      <Badge className={TYPE_COLORS[type] ?? "bg-gray-100 text-gray-800"}>
        {TYPE_LABELS[type] ?? type}
      </Badge>
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

  const handleSend = async () => {
    try {
      await sendNotification.mutateAsync(notificationId);
      toast.success("Notifikasi berhasil dikirim");
    } catch {
      toast.error("Gagal mengirim notifikasi");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteNotification.mutateAsync(notificationId);
      toast.success("Notifikasi berhasil dihapus");
      router.push("/notifications");
    } catch {
      toast.error("Gagal menghapus notifikasi");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Notifikasi tidak ditemukan</h2>
        <Button className="mt-4" onClick={() => router.back()}>
          Kembali
        </Button>
      </div>
    );
  }

  const isSent = !!notification.sentAt;
  const isScheduled = !!notification.scheduledAt && !notification.sentAt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Detail Notifikasi
            </h1>
            <p className="text-muted-foreground">
              {isSent ? "Terkirim" : isScheduled ? "Dijadwalkan" : "Draft"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isSent && (
            <>
              <Button
                onClick={handleSend}
                disabled={sendNotification.isPending}
              >
                {sendNotification.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Kirim Sekarang
              </Button>
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus Notifikasi?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tindakan ini tidak dapat dibatalkan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Notification Content */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  {notification.title}
                </CardTitle>
                <CardDescription>
                  Dibuat pada{" "}
                  {format(
                    new Date(notification.createdAt),
                    "d MMMM yyyy, HH:mm",
                    { locale: id },
                  )}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {notification.type && getTypeBadge(notification.type)}
                {notification.priority && getPriorityBadge(notification.priority)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Pesan
                </h4>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="whitespace-pre-wrap">{notification.message}</p>
                </div>
              </div>

              {notification.data &&
                Object.keys(notification.data).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      Data Tambahan
                    </h4>
                    <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
                      {JSON.stringify(notification.data, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>

        {/* Delivery details */}
        <Card>
          <CardHeader>
            <CardTitle>Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline">
                  {(notification.status
                    ? STATUS_LABELS[notification.status] ?? notification.status
                    : "-")}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Penerima</span>
                <span>{notification.user?.name ?? "-"}</span>
              </div>
              {notification.link && (
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Tautan</span>
                  <Link
                    href={notification.link}
                    className="truncate text-primary hover:underline"
                  >
                    {notification.link}
                  </Link>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dibuat</span>
                <span>
                  {format(
                    new Date(notification.createdAt),
                    "d MMM yyyy, HH:mm",
                    { locale: id },
                  )}
                </span>
              </div>
              {notification.readAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dibaca</span>
                  <span>
                    {format(
                      new Date(notification.readAt),
                      "d MMM yyyy, HH:mm",
                      { locale: id },
                    )}
                  </span>
                </div>
              )}
              {notification.sentAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dikirim</span>
                  <span>
                    {format(
                      new Date(notification.sentAt),
                      "d MMM yyyy, HH:mm",
                      { locale: id },
                    )}
                  </span>
                </div>
              )}
              {notification.scheduledAt && !notification.sentAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dijadwalkan</span>
                  <span className="text-yellow-600">
                    {format(
                      new Date(notification.scheduledAt),
                      "d MMM yyyy, HH:mm",
                      { locale: id },
                    )}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recipients Table */}
      {notification.recipients && notification.recipients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daftar Penerima</CardTitle>
            <CardDescription>
              Status pengiriman untuk setiap penerima
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Penerima</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status Kirim</TableHead>
                  <TableHead>Status Baca</TableHead>
                  <TableHead>Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(notification.recipients ?? []).map((recipient: any) => (
                  <TableRow key={recipient.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {recipient.user?.name ?? "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {recipient.user?.email ?? "-"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{recipient.channel}</Badge>
                    </TableCell>
                    <TableCell>
                      {recipient.deliveredAt ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span>Terkirim</span>
                        </div>
                      ) : recipient.failedAt ? (
                        <div className="flex items-center gap-1 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span>Gagal</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-yellow-600">
                          <Clock className="h-4 w-4" />
                          <span>Pending</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {recipient.readAt ? (
                        <div className="flex items-center gap-1 text-blue-600">
                          <CheckCircle className="h-4 w-4" />
                          <span>Dibaca</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {recipient.deliveredAt
                        ? format(
                            new Date(recipient.deliveredAt),
                            "d MMM HH:mm",
                            { locale: id },
                          )
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function NotificationDetailPage(props: Parameters<typeof NotificationDetailPageContent>[0]) {
  return (
    <MainLayout>
      <NotificationDetailPageContent {...props} />
    </MainLayout>
  );
}
