"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  usePublicTrackWbs,
  usePublicAddWbsComment,
} from "@/hooks/use-pengawasan";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  AlertTriangle,
  Search,
  Lock,
  RefreshCw,
  Send,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { safeFormat } from "@/lib/date";
import { id as localeId } from "date-fns/locale";
import type { WbsTrackingDto, WbsCommentDto } from "@cipansor/shared";
import { isClosedWbsStatus } from "@cipansor/shared";
import { readWbsTrackingToken } from "@/lib/wbs-tracking";

/**
 * Turn an unknown thrown value into a message worth showing the reporter.
 *
 * The previous handlers discarded the error entirely and only refreshed the
 * Turnstile challenge, so a rejection looked identical to nothing happening.
 */
function errorMessage(err: unknown, fallback: string): string {
  const maybe = err as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return maybe?.response?.data?.message || maybe?.message || fallback;
}

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  DIAJUKAN: {
    label: "Diajukan",
    color: "bg-blue-100 text-blue-800 border-blue-300",
  },
  DALAM_PENYELIDIKAN: {
    label: "Dalam Penyelidikan",
    color: "bg-purple-100 text-purple-800 border-purple-300",
  },
  DITINDAKLANJUTI: {
    label: "Ditindaklanjuti",
    color: "bg-amber-100 text-amber-800 border-amber-300",
  },
  SELESAI: {
    label: "Selesai",
    color: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  TIDAK_DAPAT_DITINDAKLANJUTI: {
    label: "Tidak Dapat Ditindaklanjuti",
    color: "bg-slate-200 text-slate-800 border-slate-300",
  },
};

function PublicWbsTrackContent() {
  const searchParams = useSearchParams();
  const [ticketCode, setTicketCode] = useState<string>("");
  const [trackingToken, setTrackingToken] = useState<string>("");
  const [reportData, setReportData] = useState<WbsTrackingDto | null>(null);
  // The ticket/token the displayed report was actually loaded with.
  //
  // The reply form must post against these, never against the input state:
  // the reporter can edit the ticket while a lookup is pending, and the reply
  // would otherwise be sent with the *new* ticket against the *old* token —
  // silently posting the message to a report the lookup never resolved.
  const [reportCredentials, setReportCredentials] = useState<{
    ticketCode: string;
    trackingToken: string;
  } | null>(null);
  // Identifies the newest lookup so a slow earlier response cannot overwrite
  // the result of a faster later one. Incremented on every `handleTrack`.
  const lookupSeq = useRef(0);

  const [newMessage, setNewMessage] = useState<string>("");
  const [trackError, setTrackError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  const trackTurnstile = useTurnstile();
  const commentTurnstile = useTurnstile();

  const trackMutation = usePublicTrackWbs();
  const addCommentMutation = usePublicAddWbsComment();

  useEffect(() => {
    const ticket = searchParams.get("ticket");
    if (!ticket) return;
    setTicketCode(ticket);
    // The token is never read from the query string. It is handed over through
    // sessionStorage by the submission page, and if it is absent (different
    // tab, bookmarked URL, storage disabled) the reporter types it below.
    const stored = readWbsTrackingToken(ticket);
    if (stored) setTrackingToken(stored);
  }, [searchParams]);

  const handleTrack = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticketCode || !trackingToken) return;

    const credentials = {
      ticketCode: ticketCode.trim(),
      trackingToken: trackingToken.trim(),
    };
    const seq = ++lookupSeq.current;

    setTrackError(null);
    // Clear the previous report before the lookup. A failed lookup must not
    // leave the last ticket's detail on screen: it would then describe a
    // report that is not the one in the inputs, and the reply form would post
    // to the *old* ticket/token. The displayed report is always the result of
    // the current lookup — or nothing while it is pending/failed.
    setReportData(null);
    setReportCredentials(null);
    try {
      const res = await trackMutation.mutateAsync({
        ...credentials,
        turnstileToken: trackTurnstile.token || undefined,
      });
      // A superseded lookup (the input changed and a newer request started)
      // must not install its result: the report would not match the inputs,
      // and its bound credentials would let the reply form post to a report
      // the reporter is no longer looking at.
      if (seq !== lookupSeq.current) return;
      if (res) {
        setReportData(res);
        setReportCredentials(credentials);
      }
      trackTurnstile.refresh();
    } catch (err) {
      if (seq !== lookupSeq.current) return;
      setTrackError(errorMessage(err, "Gagal memuat status laporan."));
      trackTurnstile.refresh();
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    // Post against the credentials the displayed report was loaded with, not
    // the current inputs. If the reporter edited the ticket/token after the
    // lookup, `reportCredentials` still names the resolved report — and when no
    // report is loaded there is nothing to reply to.
    if (!newMessage.trim() || !reportCredentials) return;

    setCommentError(null);
    try {
      const created = await addCommentMutation.mutateAsync({
        ticketCode: reportCredentials.ticketCode,
        trackingToken: reportCredentials.trackingToken,
        message: newMessage.trim(),
        turnstileToken: commentTurnstile.token || undefined,
      });
      setNewMessage("");

      /**
       * Show the reply immediately by folding the mutation's own response into
       * the loaded report, instead of re-running the tracking lookup.
       *
       * Re-running `handleTrack()` here was a silent failure: the tracking (and
       * comment) Turnstile tokens are single-use, `commentTurnstile.refresh()`
       * clears the comment token, and the track widget's token had already been
       * spent by the lookup that loaded this page. The refetch therefore went
       * out with no token, the server's Turnstile gate rejected it, and the
       * catch swallowed it — the message was stored but never appeared until a
       * manual reload. The comment endpoint already returns the created row, so
       * appending it is both correct and one round trip fewer.
       */
      if (created) {
        setReportData((prev) =>
          prev
            ? {
                ...prev,
                comments: [...(prev.comments ?? []), created as WbsCommentDto],
              }
            : prev,
        );
      }
      commentTurnstile.refresh();
    } catch (err) {
      setCommentError(errorMessage(err, "Gagal mengirim pesan."));
      commentTurnstile.refresh();
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-blue-100 text-blue-700 rounded-full mb-2">
            <Search className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Lacak Progress Laporan WBS
          </h1>
          <p className="text-slate-600 text-sm max-w-xl mx-auto">
            Masukkan Kode Tiket WBS dan Token Akses Rahasia Anda untuk memantau
            status penanganan serta berkomunikasi anonim dengan tim pemeriksa.
          </p>
          <div className="pt-2">
            <Link href="/public/wbs">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Form Buat Laporan WBS
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Card */}
        <Card className="shadow-md border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5 text-blue-600" />
              Pengecekan Status Laporan
            </CardTitle>
            <CardDescription>
              Masukkan Kode Tiket dan Token Akses Rahasia yang Anda dapatkan
              saat pengajuan laporan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTrack} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ticketCode" className="font-semibold">
                    Kode Tiket WBS
                  </Label>
                  <Input
                    id="ticketCode"
                    placeholder="Contoh: WBS-202603-ABC123"
                    value={ticketCode}
                    onChange={(e) => {
                      setTicketCode(e.target.value);
                      setReportData(null);
                      setReportCredentials(null);
                      // Invalidate any in-flight lookup: it was started for the
                      // previous inputs, so its result must not be installed
                      // against the edited ones.
                      lookupSeq.current += 1;
                    }}
                    required
                    className="bg-white font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trackingToken" className="font-semibold">
                    Token Akses Rahasia
                  </Label>
                  <Input
                    id="trackingToken"
                    placeholder="Masukkan token rahasia..."
                    value={trackingToken}
                    onChange={(e) => {
                      setTrackingToken(e.target.value);
                      setReportData(null);
                      setReportCredentials(null);
                      lookupSeq.current += 1;
                    }}
                    required
                    className="bg-white font-mono"
                  />
                </div>
              </div>

              {trackTurnstile.required && (
                <div className="p-3 bg-slate-100 rounded-md border text-sm space-y-2">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <Lock className="h-4 w-4 text-blue-600" />
                    Verifikasi Keamanan
                  </div>
                  <TurnstileWidget
                    action="wbs_track"
                    {...trackTurnstile.widgetProps}
                  />
                </div>
              )}

              {trackError && (
                <p
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {trackError}
                </p>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                disabled={
                  trackMutation.isPending ||
                  !ticketCode ||
                  !trackingToken ||
                  !trackTurnstile.ready
                }
              >
                {trackMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Memeriksa Status Laporan...
                  </>
                ) : (
                  "Lacak Status Laporan"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Report Details Card */}
        {reportData && (
          <div className="space-y-6">
            <Card className="shadow-md border-slate-200">
              <CardHeader className="border-b bg-slate-50/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs text-slate-500 block font-mono">
                      Kode Tiket: {reportData.ticketCode}
                    </span>
                    <CardTitle className="text-xl font-bold text-slate-900 mt-1">
                      {reportData.subject}
                    </CardTitle>
                  </div>
                  <div>
                    <Badge
                      className={`px-3 py-1 border text-sm font-semibold ${STATUS_BADGES[reportData.status]?.color || "bg-slate-100 text-slate-800"}`}
                    >
                      {STATUS_BADGES[reportData.status]?.label ||
                        reportData.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border">
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Kategori Laporan
                    </span>
                    <span className="font-semibold text-slate-900">
                      {reportData.category}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Subjek Teradu
                    </span>
                    <span className="font-semibold text-slate-900">
                      {reportData.targetLevel}{" "}
                      {reportData.targetName
                        ? `(${reportData.targetName})`
                        : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Unit Organisasi
                    </span>
                    <span className="font-semibold text-slate-900">
                      {reportData.unitName}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">
                      Tanggal Diajukan
                    </span>
                    <span className="font-semibold text-slate-900">
                      {safeFormat(
                        new Date(reportData.createdAt),
                        "dd MMMM yyyy HH:mm",
                        { locale: localeId },
                      )}{" "}
                      WIB
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">
                    Rincian & Kronologi Kejadian
                  </h3>
                  <p className="text-sm text-slate-800 whitespace-pre-line bg-white p-4 rounded-lg border leading-relaxed">
                    {reportData.description}
                  </p>
                </div>

                {reportData.resolution && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-1">
                    <h4 className="font-semibold text-sm flex items-center gap-2 text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Hasil Penanganan / Resolusi Laporan:
                    </h4>
                    <p className="text-sm whitespace-pre-line pt-1">
                      {reportData.resolution}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2-Way Conversation Box */}
            <Card className="shadow-md border-slate-200">
              <CardHeader className="border-b bg-slate-50/50 pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-slate-900">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  Komunikasi Dua Arah (Anonim) dengan Pemeriksa
                </CardTitle>
                <CardDescription>
                  Tanyakan progress atau kirimkan informasi tambahan terkait
                  laporan ini.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {/* Messages List */}
                <div className="space-y-3 max-h-96 overflow-y-auto p-1">
                  {reportData.comments && reportData.comments.length > 0 ? (
                    reportData.comments.map((msg: WbsCommentDto) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg border text-sm max-w-[85%] ${
                          msg.senderType === "REPORTER"
                            ? "bg-blue-50 border-blue-200 ml-auto text-blue-950"
                            : "bg-slate-100 border-slate-200 mr-auto text-slate-900"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold mb-1 opacity-80 border-b pb-1">
                          <span>
                            {msg.senderName ||
                              (msg.senderType === "REPORTER"
                                ? "Anda (Pelapor)"
                                : "Tim Pemeriksa")}
                          </span>
                          <span className="font-normal text-[10px]">
                            {safeFormat(
                              new Date(msg.createdAt),
                              "dd/MM/yyyy HH:mm",
                              { locale: localeId },
                            )}
                          </span>
                        </div>
                        <p className="whitespace-pre-line leading-relaxed">
                          {msg.message}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-center text-slate-400 py-6 italic">
                      Belum ada percakapan tambahan untuk laporan ini.
                    </p>
                  )}
                </div>

                {/* Send Reply Form — hidden entirely for a terminal case.
                    The API refuses a public reply once the case is `SELESAI`
                    or `TIDAK_DAPAT_DITINDAKLANJUTI` (both sides of the thread
                    close under the same row lock). Disabling just the button
                    would still render an input the reporter cannot use and
                    invite a message the server then rejects, so the whole
                    control — textarea, Turnstile and submit — is removed and
                    replaced with a plain notice. The status predicate is the
                    shared `isClosedWbsStatus`, not a local list. */}
                {isClosedWbsStatus(reportData.status) ? (
                  <div className="border-t pt-4">
                    <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 text-center">
                      Kasus ini telah ditutup. Percakapan lanjutan tidak dapat
                      dikirim, namun seluruh riwayat di atas tetap dapat Anda
                      baca.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendComment}
                    className="border-t pt-4 space-y-3"
                  >
                    <div className="space-y-1">
                      <Label
                        htmlFor="newMessage"
                        className="text-xs font-semibold"
                      >
                        Kirim Pesan Tanggapan / Tambahan Bukti
                      </Label>
                      <Textarea
                        id="newMessage"
                        rows={3}
                        placeholder="Ketik pesan Anda di sini..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        required
                        className="bg-white"
                      />
                    </div>

                    {commentTurnstile.required && (
                      <div className="p-2 bg-slate-100 rounded border text-xs">
                        <TurnstileWidget
                          action="wbs_comment"
                          {...commentTurnstile.widgetProps}
                        />
                      </div>
                    )}

                    {commentError && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800"
                      >
                        {commentError}
                      </p>
                    )}

                    <Button
                      type="submit"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                      disabled={
                        addCommentMutation.isPending ||
                        !newMessage.trim() ||
                        !commentTurnstile.ready
                      }
                    >
                      {addCommentMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Kirim Pesan
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PublicWbsTrackPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center">Memuat halaman pengaduan WBS...</div>
      }
    >
      <PublicWbsTrackContent />
    </Suspense>
  );
}
