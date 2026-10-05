"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Bell, CheckCheck, Loader2, Settings } from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useUserNotifications,
  type MyNotification,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

/**
 * The caller's own notifications — what the header bell opens, for everyone.
 *
 * Until 2026-09-28 the bell opened the management page (broadcasts and
 * templates), which lists what admins sent, so a wali, teacher or musyrif
 * had nowhere in the app to read what was sent to them.
 */

const PAGE_SIZE = 20;

/** Only paths inside the app become links; anything else stays text. */
const internalLink = (link: string | null) =>
  link && link.startsWith("/") && !link.startsWith("//") ? link : null;

function NotificationRow({ notification }: { notification: MyNotification }) {
  const markRead = useMarkNotificationAsRead();
  const unread = notification.status === "UNREAD";
  const href = internalLink(notification.link);
  const when = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
    locale: localeId,
  });

  const body = (
    <div className="min-w-0 flex-1 space-y-1">
      <p className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>
        {notification.title}
      </p>
      <p className="text-sm text-muted-foreground">{notification.message}</p>
      <p className="text-xs text-muted-foreground">{when}</p>
    </div>
  );

  return (
    <li
      data-testid={`notification-${notification.id}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        unread && "border-primary/40 bg-primary/5",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      {href ? (
        <Link
          href={href}
          className="min-w-0 flex-1"
          onClick={() => unread && markRead.mutate(notification.id)}
        >
          {body}
        </Link>
      ) : (
        body
      )}
      {unread && (
        <Button
          variant="ghost"
          size="sm"
          disabled={markRead.isPending}
          onClick={() => markRead.mutate(notification.id)}
          aria-label={`Tandai dibaca: ${notification.title}`}
        >
          Tandai dibaca
        </Button>
      )}
    </li>
  );
}

export default function MyNotificationsPage() {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useUserNotifications({
    page,
    limit: PAGE_SIZE,
    ...(onlyUnread ? { isRead: false } : {}),
  });
  const markAll = useMarkAllNotificationsAsRead();

  const notifications = data?.data ?? [];
  const unreadCount = data?.meta.unreadCount ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;

  const show = (unreadOnly: boolean) => {
    setOnlyUnread(unreadOnly);
    setPage(1);
  };

  return (
    <MainLayout>
      <PageHeader
        title="Notifikasi Saya"
        description="Pemberitahuan yang dikirim untuk Anda"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/notifications/settings">
              <Settings className="mr-2 h-4 w-4" />
              Pengaturan
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Saring notifikasi">
          <Button
            variant={onlyUnread ? "outline" : "secondary"}
            size="sm"
            aria-pressed={!onlyUnread}
            onClick={() => show(false)}
          >
            Semua
          </Button>
          <Button
            variant={onlyUnread ? "secondary" : "outline"}
            size="sm"
            aria-pressed={onlyUnread}
            onClick={() => show(true)}
          >
            Belum dibaca{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </Button>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Tandai semua dibaca
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Bell className="h-8 w-8" />
              <p>
                {onlyUnread
                  ? "Semua notifikasi sudah dibaca"
                  : "Belum ada notifikasi untuk Anda"}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => (
                <NotificationRow key={n.id} notification={n} />
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {page} dari {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
