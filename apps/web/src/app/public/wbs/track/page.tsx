"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { usePublicTrackWbs, usePublicAddWbsComment } from "@/hooks/use-pengawasan";
import { TurnstileWidget, useTurnstile } from "@/components/security/turnstile-widget";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ShieldCheck, AlertTriangle, Search, Lock, RefreshCw, Send, MessageSquare, ArrowLeft, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { safeFormat } from "@/lib/date";
import { id as localeId } from "date-fns/locale";

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  DIAJUKAN: { label: "Diajukan", color: "bg-blue-100 text-blue-800 border-blue-300" },
  DALAM_PENYELIDIKAN: { label: "Dalam Penyelidikan", color: "bg-purple-100 text-purple-800 border-purple-300" },
  DITINDAKLANJUTI: { label: "Ditindaklanjuti", color: "bg-amber-100 text-amber-800 border-amber-300" },
  SELESAI: { label: "Selesai", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  TIDAK_DAPAT_DITINDAKLANJUTI: { label: "Tidak Dapat Ditindaklanjuti", color: "bg-slate-200 text-slate-800 border-slate-300" },
};

function PublicWbsTrackContent() {
  const searchParams = useSearchParams();
  const [ticketCode, setTicketCode] = useState<string>("");
  const [trackingToken, setTrackingToken] = useState<string>("");
  const [reportData, setReportData] = useState<any>(null);

  const [newMessage, setNewMessage] = useState<string>("");

  const trackTurnstile = useTurnstile();
  const commentTurnstile = useTurnstile();

  const trackMutation = usePublicTrackWbs();
  const addCommentMutation = usePublicAddWbsComment();

  useEffect(() => {
    const ticket = searchParams.get("ticket");
    const token = searchParams.get("token");
    if (ticket) setTicketCode(ticket);
    if (token) setTrackingToken(token);
  }, [searchParams]);

  const handleTrack = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticketCode || !trackingToken) return;

    try {
      const res = await trackMutation.mutateAsync({
        ticketCode: ticketCode.trim(),
        trackingToken: trackingToken.trim(),
        turnstileToken: trackTurnstile.token || undefined,
      });
      if (res) {
        setReportData(res);
      }
      trackTurnstile.refresh();
    } catch (err) {
      trackTurnstile.refresh();
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ticketCode || !trackingToken) return;

    try {
      await addCommentMutation.mutateAsync({
        ticketCode: ticketCode.trim(),
        trackingToken: trackingToken.trim(),
        message: newMessage.trim(),
        turnstileToken: commentTurnstile.token || undefined,
      });
      setNewMessage("");
      commentTurnstile.refresh();
      // Refresh report data
      handleTrack();
    } catch (err) {
      commentTurnstile.refresh();
    }
  };

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
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
            Masukkan Kode Tiket WBS dan Token Akses Rahasia Anda untuk memantau status penanganan serta berkomunikasi anonim dengan tim pemeriksa.
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
              Masukkan Kode Tiket dan Token Akses Rahasia yang Anda dapatkan saat pengajuan laporan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTrack} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ticketCode" className="font-semibold">Kode Tiket WBS</Label>
                  <Input
                    id="ticketCode"
                    placeholder="Contoh: WBS-202603-ABC123"
                    value={ticketCode}
                    onChange={(e) => setTicketCode(e.target.value)}
                    required
                    className="bg-white font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trackingToken" className="font-semibold">Token Akses Rahasia</Label>
                  <Input
                    id="trackingToken"
                    placeholder="Masukkan token rahasia..."
                    value={trackingToken}
                    onChange={(e) => setTrackingToken(e.target.value)}
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

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                disabled={trackMutation.isPending || !ticketCode || !trackingToken || !trackTurnstile.ready}
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
                    <span className="text-xs text-slate-500 block font-mono">Kode Tiket: {reportData.ticketCode}</span>
                    <CardTitle className="text-xl font-bold text-slate-900 mt-1">{reportData.subject}</CardTitle>
                  </div>
                  <div>
                    <Badge className={`px-3 py-1 border text-sm font-semibold ${STATUS_BADGES[reportData.status]?.color || 'bg-slate-100 text-slate-800'}`}>
                      {STATUS_BADGES[reportData.status]?.label || reportData.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border">
                  <div>
                    <span className="text-xs text-slate-500 block">Kategori Laporan</span>
                    <span className="font-semibold text-slate-900">{reportData.category}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Subjek Teradu</span>
                    <span className="font-semibold text-slate-900">{reportData.targetLevel} {reportData.targetName ? `(${reportData.targetName})` : ''}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Unit Organisasi</span>
                    <span className="font-semibold text-slate-900">{reportData.unitName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Tanggal Diajukan</span>
                    <span className="font-semibold text-slate-900">
                      {safeFormat(new Date(reportData.createdAt), "dd MMMM yyyy HH:mm", { locale: localeId })} WIB
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Rincian & Kronologi Kejadian</h3>
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
                    <p className="text-sm whitespace-pre-line pt-1">{reportData.resolution}</p>
                  </div>
                )}

                {/* Forwarding Log Timeline */}
                {reportData.forwardTimeline && reportData.forwardTimeline.length > 0 && (
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-blue-600" /> Riwayat Penanganan & Diteruskan
                    </h3>
                    <div className="space-y-2">
                      {reportData.forwardTimeline.map((log: any) => (
                        <div key={log.id} className="p-3 bg-slate-100 rounded border text-xs text-slate-700 flex justify-between items-center">
                          <div>
                            <span className="font-bold text-slate-900">Laporan Diteruskan dari {log.fromRole} ke {log.toRole}</span>
                            <p className="text-slate-600 italic mt-0.5">Alasan: {log.reason}</p>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {safeFormat(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: localeId })}
                          </span>
                        </div>
                      ))}
                    </div>
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
                  Tanyakan progress atau kirimkan informasi tambahan terkait laporan ini.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {/* Messages List */}
                <div className="space-y-3 max-h-96 overflow-y-auto p-1">
                  {reportData.comments && reportData.comments.length > 0 ? (
                    reportData.comments.map((msg: any) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg border text-sm max-w-[85%] ${
                          msg.senderType === "REPORTER"
                            ? "bg-blue-50 border-blue-200 ml-auto text-blue-950"
                            : "bg-slate-100 border-slate-200 mr-auto text-slate-900"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold mb-1 opacity-80 border-b pb-1">
                          <span>{msg.senderName || (msg.senderType === "REPORTER" ? "Anda (Pelapor)" : "Tim Pemeriksa")}</span>
                          <span className="font-normal text-[10px]">
                            {safeFormat(new Date(msg.createdAt), "dd/MM/yyyy HH:mm", { locale: localeId })}
                          </span>
                        </div>
                        <p className="whitespace-pre-line leading-relaxed">{msg.message}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-center text-slate-400 py-6 italic">
                      Belum ada percakapan tambahan untuk laporan ini.
                    </p>
                  )}
                </div>

                {/* Send Reply Form */}
                <form onSubmit={handleSendComment} className="border-t pt-4 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="newMessage" className="text-xs font-semibold">Kirim Pesan Tanggapan / Tambahan Bukti</Label>
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

                  <Button
                    type="submit"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    disabled={addCommentMutation.isPending || !newMessage.trim() || !commentTurnstile.ready}
                  >
                    {addCommentMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Kirim Pesan
                  </Button>
                </form>
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
    <Suspense fallback={<div className="p-8 text-center">Memuat halaman pengaduan WBS...</div>}>
      <PublicWbsTrackContent />
    </Suspense>
  );
}
