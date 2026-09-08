"use client";

/**
 * Riwayat tanya-jawab asisten publik, untuk Super Admin.
 *
 * Yang ditampilkan di sini adalah kalimat yang benar-benar diketik pengunjung.
 * Karena itu halamannya menyatakan aturannya sendiri di muka — siapa yang boleh
 * membaca, dan berapa lama disimpan — alih-alih menyembunyikannya di kode:
 * pembaca yang tahu bahwa ini akan terhapus dalam 90 hari memperlakukannya
 * berbeda dari pembaca yang mengira ini arsip permanen.
 *
 * Kegunaannya yang sebenarnya ada pada saringan "hanya yang tak terjawab":
 * setiap penolakan adalah pertanyaan yang orang benar-benar ajukan dan sistem
 * ini belum bisa jawab. Itu daftar pekerjaan basis pengetahuan, ditulis oleh
 * pengunjung sendiri.
 */

import { useState } from "react";
import {
  ShieldAlert,
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  Database,
  Clock,
} from "lucide-react";
import { MainLayout } from "@/components/layout";
import { useAuthStore } from "@/stores/auth";
import { getPrimaryRoleCode } from "@/lib/rbac";
import {
  useChatbotConversation,
  useChatbotConversations,
} from "@/hooks/use-chatbot";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnswerText } from "@/components/chatbot/answer-text";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function ConversationDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useChatbotConversation(id);

  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Percakapan</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="ml-auto h-24 w-4/5" />
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Dimulai {formatWaktu(data.startedAt)} · {data.messageCount} giliran
            </p>

            {data.messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  message.role === "user"
                    ? "border-border bg-muted/50"
                    : "border-primary/20 bg-background",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.role === "user" ? "Pengunjung" : "Asisten"}
                  </span>
                  {message.refused && (
                    <Badge variant="destructive">Tidak terjawab</Badge>
                  )}
                  {/* Dibedakan karena jawabannya adalah pemutaran ulang, bukan
                      kalimat baru: jawaban keliru yang berasal dari cache
                      diperbaiki dengan membersihkan cache, bukan dengan
                      mengubah persona. */}
                  {message.fromCache && (
                    <Badge variant="outline" className="gap-1">
                      <Database className="h-3 w-3" />
                      dari cache
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatWaktu(message.createdAt)}
                  </span>
                </div>

                {/* Jawaban asisten dirender lewat komponen yang sama dengan
                    widget publik. Menampilkannya sebagai teks mentah membuat
                    super admin membaca `**Rp 350.000**`, bukan kalimat yang
                    sebenarnya dilihat pengunjung — dan yang perlu dinilai di
                    halaman ini justru kalimat yang dilihat pengunjung. Yang
                    diketik pengunjung tetap apa adanya: tanda bintang dalam
                    pertanyaan orang bukan perintah pemformatan. */}
                {message.role === "assistant" ? (
                  <AnswerText>{message.content}</AnswerText>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}

                {message.sources.length > 0 && (
                  <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    Sumber: {message.sources.map((s) => s.title).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PercakapanContent() {
  const { user } = useAuthStore();
  const isSuperAdmin = getPrimaryRoleCode(user) === "SUPER_ADMIN";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [onlyRefused, setOnlyRefused] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useChatbotConversations({
    page,
    pageSize: PAGE_SIZE,
    onlyRefused,
    search,
  });

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto max-w-3xl py-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Akses ditolak</AlertTitle>
          <AlertDescription>
            Riwayat percakapan hanya dapat dibaca oleh Super Admin.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Riwayat Percakapan</h1>
        <p className="text-muted-foreground">
          Apa yang ditanyakan pengunjung kepada asisten daring, dan apa yang
          dijawabnya.
        </p>
      </div>

      {/* Aturannya dinyatakan, bukan disembunyikan. */}
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertTitle>Data pribadi, dengan batas waktu</AlertTitle>
        <AlertDescription>
          Isi percakapan dapat memuat nama dan keadaan keluarga yang diketik
          sendiri oleh pengunjung. Halaman ini hanya dapat dibuka Super Admin,
          tidak ada alamat IP yang disimpan, dan seluruh isinya terhapus otomatis
          setelah {data?.retentionDays ?? 90} hari.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchDraft);
            setPage(1);
          }}
        >
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Cari kata di dalam percakapan…"
            className="max-w-sm"
          />
          <Button type="submit" variant="secondary">
            <Search className="mr-2 h-4 w-4" />
            Cari
          </Button>
        </form>

        <Button
          type="button"
          variant={onlyRefused ? "default" : "outline"}
          onClick={() => {
            setOnlyRefused((value) => !value);
            setPage(1);
          }}
        >
          Hanya yang tak terjawab
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {data && data.conversations.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 opacity-50" />
            {search || onlyRefused
              ? "Tidak ada percakapan yang cocok dengan saringan ini."
              : "Belum ada percakapan yang tercatat."}
          </CardContent>
        </Card>
      )}

      {data && data.conversations.length > 0 && (
        <div className="space-y-2">
          {data.conversations.map((conversation) => (
            <Card
              key={conversation.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(conversation.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenId(conversation.id);
                }
              }}
              className="cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base font-medium">
                  <span className="line-clamp-1 flex-1">
                    {conversation.firstQuestion || "(tanpa pertanyaan)"}
                  </span>
                  {conversation.refusedCount > 0 && (
                    <Badge variant="destructive">
                      {conversation.refusedCount} tak terjawab
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {formatWaktu(conversation.lastMessageAt)} ·{" "}
                {conversation.messageCount} giliran
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Halaman {data.page} dari {totalPages} · {data.total} percakapan
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ConversationDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

export default function ChatbotPercakapanPage() {
  return (
    <MainLayout>
      <PercakapanContent />
    </MainLayout>
  );
}
