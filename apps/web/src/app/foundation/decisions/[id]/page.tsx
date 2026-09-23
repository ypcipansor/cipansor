"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MainLayout } from "@/components/layout";
import {
  useFoundationDecision,
  useCastFoundationVote,
  useFinalizeFoundationDecision,
  useDownloadFoundationDecisionDocument,
  useSetFoundationPublication,
  FOUNDATION_ORGAN_LABEL,
  FOUNDATION_STATUS_LABEL,
  FOUNDATION_KIND_LABEL,
} from "@/hooks/use-foundation-decisions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  CheckCircle2,
  Fingerprint,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { getPrimaryRoleCode } from "@/lib/rbac";

const statusColor: Record<string, string> = {
  VOTING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

const choiceLabel: Record<string, string> = {
  APPROVE: "Setuju",
  REJECT: "Tidak Setuju",
  ABSTAIN: "Abstain",
};

const choiceColor: Record<string, string> = {
  APPROVE: "bg-emerald-100 text-emerald-700",
  REJECT: "bg-red-100 text-red-700",
  ABSTAIN: "bg-gray-100 text-gray-700",
};

export default function FoundationDecisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, isLoading } = useFoundationDecision(id);
  const castVote = useCastFoundationVote(id);
  const finalize = useFinalizeFoundationDecision(id);
  const downloadDoc = useDownloadFoundationDecisionDocument();

  // Finalisasi adalah aksi TULIS, dan eligibility-nya TIDAK dapat disimpulkan
  // dari role saja: rute memakai `authorize(...FINALIZE)` (Pengawas termasuk),
  // tetapi service menolak finalizer yang bukan pimpinan/Super Admin kecuali ia
  // anggota snapshot organ keputusan itu. Server menghitungnya untuk kita lewat
  // `d.canFinalize` — definisi yang sama persis dengan `finalize` — sehingga UI
  // tidak pernah menawarkan tombol yang peladen pasti tolak.
  const { user } = useAuthStore();
  const roleCode = getPrimaryRoleCode(user);
  const canFinalize = d?.canFinalize ?? false;
  const canPublish = roleCode === "SUPER_ADMIN";
  const setPublication = useSetFoundationPublication(id);

  const handleDownload = async () => {
    try {
      const blob = await downloadDoc.mutateAsync(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Risalah-Keputusan-${d?.id ?? id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      // Blob error path: report inline is fine.
    }
  };

  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"APPROVE" | "REJECT" | "ABSTAIN">(
    "APPROVE",
  );
  const [passphrase, setPassphrase] = useState("");
  const [note, setNote] = useState("");
  const [voteError, setVoteError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </MainLayout>
    );
  }
  if (!d) {
    return (
      <MainLayout>
        <div className="p-10 text-center text-muted-foreground">
          Keputusan tidak ditemukan.
        </div>
      </MainLayout>
    );
  }

  const submitVote = async () => {
    setVoteError(null);
    try {
      await castVote.mutateAsync({
        choice,
        note: choice === "REJECT" ? note || undefined : undefined,
        passphrase,
      });
      setOpen(false);
      setPassphrase("");
      setNote("");
    } catch {
      setVoteError("Passphrase salah atau kunci tidak dapat digunakan.");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={d.subject}
          description={`${FOUNDATION_ORGAN_LABEL[d.organType]} · ${FOUNDATION_KIND_LABEL[d.kind]}`}
          actions={
            <>
              {d.status === "APPROVED" && (
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  disabled={downloadDoc.isPending}
                >
                  <Download className="mr-2 h-4 w-4" /> Unduh Risalah (PDF)
                </Button>
              )}
              {d.status === "VOTING" && !d.myVote && d.canVote && (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Fingerprint className="mr-2 h-4 w-4" /> Tandatangani &
                      Suara
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        Memberi Suara + Tanda Tangan Digital
                      </DialogTitle>
                      <DialogDescription>
                        Suara Anda diikat ke isi keputusan dan ditandatangani
                        dengan kunci pribadi Anda.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        {(["APPROVE", "REJECT", "ABSTAIN"] as const).map(
                          (c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setChoice(c)}
                              className={`rounded-md border p-3 text-sm font-medium transition ${
                                choice === c
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              {choiceLabel[c]}
                            </button>
                          ),
                        )}
                      </div>
                      {choice === "REJECT" && (
                        <div className="space-y-1.5">
                          <Label>
                            Alasan tidak setuju (wajib untuk sirkuler)
                          </Label>
                          <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            placeholder="Alasan penolakan…"
                          />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label>Passphrase Kunci Tanda Tangan</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="password"
                            autoComplete="off"
                            className="pl-9"
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            placeholder="Passphrase pribadi Anda"
                          />
                        </div>
                      </div>
                      {voteError && (
                        <p className="text-sm text-destructive">{voteError}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpen(false)}>
                        Batal
                      </Button>
                      <Button
                        onClick={submitVote}
                        disabled={!passphrase || castVote.isPending}
                      >
                        <Fingerprint className="mr-2 h-4 w-4" /> Tandatangani
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {d.status === "VOTING" && d.myVote && (
                <Badge className="bg-emerald-100 text-emerald-700">
                  Anda sudah suara: {choiceLabel[d.myVote]}
                </Badge>
              )}
              {d.status === "VOTING" && canFinalize && (
                <Button
                  variant="outline"
                  onClick={() => {
                    // Hanya rapat yang dapat difinalisasi manual: sirkuler
                    // ditutup otomatis saat pemungutan suara, sehingga server
                    // mengirim `canFinalize=false` untuknya dan tombol ini
                    // tidak pernah tampil padanya.
                    if (
                      window.confirm(
                        "Tutup rapat/pemungutan sekarang? Hasil dihitung dari suara yang sudah masuk dan tidak dapat diubah lagi.",
                      )
                    )
                      finalize.mutate();
                  }}
                  disabled={finalize.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Finalisasi
                </Button>
              )}
            </>
          }
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Status &
                Kuorum
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge className={statusColor[d.status]}>
                  {FOUNDATION_STATUS_LABEL[d.status]}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Setuju</span>
                <span className="font-medium">{d.voteSummary.approve}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tidak Setuju</span>
                <span className="font-medium">{d.voteSummary.reject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Abstain</span>
                <span className="font-medium">{d.voteSummary.abstain}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">
                  Sudah memberi suara
                </span>
                <span className="font-medium">
                  {d.votedCount}/{d.memberCount} anggota
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode keputusan</span>
                <span className="font-medium">
                  {d.quorumSnapshot.decisionMode}
                </span>
              </div>
              {d.finalPdfDigest && (
                <div className="pt-2 text-xs text-muted-foreground">
                  <div className="break-all font-mono">
                    SHA-256: {d.finalPdfDigest}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Di-e-seal &
                    disimpan
                  </div>
                </div>
              )}
              {/*
                Publikasi metadata. Bawaannya PRIVATE: halaman verifikasi
                publik hanya menyatakan keabsahan tanpa membocorkan judul,
                organ, tanggal, dan rekap suara. Hanya Super Admin yang dapat
                mengubahnya, dan setiap perubahan tercatat di audit.

                "Terbitkan" hanya ditawarkan bila server menyatakan
                `publishable` — `PUBLIC` hanya bermakna bagi keputusan APPROVED
                dengan dokumen final + e-seal lengkap, dan peladen menolak
                publikasi draf/VOTING. Menarik kembali ke privat selalu boleh.
              */}
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-muted-foreground">
                  Publikasi metadata
                </span>
                {canPublish && (d.publishable || d.publication === "PUBLIC") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={setPublication.isPending}
                    onClick={() =>
                      setPublication.mutate(
                        d.publication === "PUBLIC" ? "PRIVATE" : "PUBLIC",
                      )
                    }
                  >
                    {d.publication === "PUBLIC"
                      ? "Tarik ke privat"
                      : "Terbitkan"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gray-100 text-gray-700">
                      {d.publication === "PUBLIC" ? "Publik" : "Privat"}
                    </Badge>
                    {canPublish && d.status === "VOTING" && (
                      <span className="text-xs text-muted-foreground">
                        Akan dapat diterbitkan setelah disahkan
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Isi Keputusan</CardTitle>
              <CardDescription>
                Dibuat oleh {d.createdByName} ·{" "}
                {new Date(d.createdAt).toLocaleString("id-ID")}
                {d.decidedByName ? ` · Diputus oleh ${d.decidedByName}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm leading-relaxed">
              {d.body}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="h-4 w-4" /> Daftar Penandatangan & Suara
            </CardTitle>
            <CardDescription>
              Setiap suara ditandatangani kunci pribadi anggota dan diikat ke
              hash isi keputusan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {d.votes.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Belum ada anggota yang memberi suara.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anggota</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Suara</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Tanda Tangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.votes.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        {v.userName}
                      </TableCell>
                      <TableCell>{v.roleCode}</TableCell>
                      <TableCell>
                        <Badge className={choiceColor[v.choice]}>
                          {choiceLabel[v.choice]}
                        </Badge>
                        {v.note && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {v.note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(v.signedAt).toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {v.signature.slice(0, 24)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
