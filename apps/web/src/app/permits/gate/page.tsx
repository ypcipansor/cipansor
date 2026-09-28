"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowLeft,
  Scan,
  Search,
  LogOut,
  LogIn,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MainLayout } from "@/components/layout";
import {
  usePermitByCode,
  useDepartPermit,
  useReturnPermit,
  PERMIT_TYPE_LABELS,
  PERMIT_PHASES,
  permitPhase,
} from "@/hooks/use-permits";

const when = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Pos gerbang: type or scan the code on the learner's permit slip, check the
 * photo, and record leaving or coming back.
 */
function PermitGateContent() {
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");

  const { data: permit, isFetching, isError } = usePermitByCode(code);
  const depart = useDepartPermit();
  const markReturned = useReturnPermit();

  const lookUp = (e: React.FormEvent) => {
    e.preventDefault();
    setCode(input.trim().toUpperCase());
  };

  const record = async (action: "depart" | "return") => {
    if (!permit) return;
    try {
      if (action === "depart") {
        await depart.mutateAsync(permit.id);
        toast.success("Keberangkatan dicatat");
      } else {
        await markReturned.mutateAsync(permit.id);
        toast.success("Kepulangan dicatat");
      }
    } catch {
      // The API client has already shown the server's message.
    }
  };

  const phase = permit ? permitPhase(permit) : null;
  const expired = permit ? new Date(permit.endDate) < new Date() : false;
  const canDepart = phase === "APPROVED" && !expired;
  const canReturn = phase === "OUTSIDE" || phase === "OVERDUE";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/permits" aria-label="Kembali ke Perizinan">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pos Gerbang</h1>
          <p className="text-muted-foreground">
            Periksa izin dan catat keluar-masuk
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kode izin</CardTitle>
          <CardDescription>
            Pindai atau ketik kode yang tertera pada surat izin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={lookUp} className="flex gap-4">
            <div className="relative flex-1">
              <Scan className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Kode izin"
                placeholder="Kode izin"
                className="pl-9 font-mono uppercase"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit">
              <Search className="mr-2 h-4 w-4" />
              Periksa
            </Button>
          </form>
        </CardContent>
      </Card>

      {isFetching && (
        <p className="py-4 text-center text-muted-foreground">Memeriksa…</p>
      )}

      {isError && !isFetching && (
        <div className="flex items-center justify-center gap-2 rounded-md bg-red-50 p-4 text-red-800">
          <XCircle className="h-5 w-5" />
          Kode {code} tidak ditemukan.
        </div>
      )}

      {permit && phase && !isFetching && (
        <Card
          className={
            canDepart || canReturn || phase === "COMPLETED"
              ? "border-green-500/50"
              : "border-red-500/50"
          }
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {permit.student.user.name}
                  <Badge className={PERMIT_PHASES[phase].className}>
                    {PERMIT_PHASES[phase].label}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {permit.student.unit.name} · {permit.student.nis}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-bold">
                  {permit.code}
                </div>
                <div className="text-sm text-muted-foreground">
                  {PERMIT_TYPE_LABELS[permit.type]}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-6">
              <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                {permit.student.photoUrl ? (
                  <Image
                    src={permit.student.photoUrl}
                    alt={permit.student.user.name}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Tanpa foto
                  </div>
                )}
              </div>
              <div className="grid flex-1 grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-muted-foreground">Berangkat</span>
                  <span className="font-medium">{when(permit.startDate)}</span>
                </div>
                <div>
                  <span className="block text-muted-foreground">
                    Paling lambat kembali
                  </span>
                  <span className="font-medium">{when(permit.endDate)}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-muted-foreground">Alasan</span>
                  <span className="font-medium">{permit.reason}</span>
                </div>
                {permit.destination && (
                  <div className="col-span-2">
                    <span className="block text-muted-foreground">Tujuan</span>
                    <span className="font-medium">{permit.destination}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 border-t pt-4">
              {canDepart && (
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={() => record("depart")}
                  disabled={depart.isPending}
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  Catat keluar
                </Button>
              )}
              {canReturn && (
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  size="lg"
                  onClick={() => record("return")}
                  disabled={markReturned.isPending}
                >
                  <LogIn className="mr-2 h-5 w-5" />
                  Catat kembali
                </Button>
              )}
              {phase === "COMPLETED" && permit.returnedAt && (
                <div className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-50 p-4 text-blue-800">
                  <CheckCircle className="h-5 w-5" />
                  Sudah kembali {when(permit.returnedAt)}
                </div>
              )}
              {phase === "APPROVED" && expired && (
                <div className="flex w-full items-center justify-center gap-2 rounded-md bg-red-50 p-4 text-red-800">
                  <XCircle className="h-5 w-5" />
                  Masa berlaku izin sudah lewat. Tidak boleh keluar.
                </div>
              )}
              {(phase === "PENDING" ||
                phase === "REJECTED" ||
                phase === "CANCELLED") && (
                <div className="flex w-full items-center justify-center gap-2 rounded-md bg-red-50 p-4 text-red-800">
                  <XCircle className="h-5 w-5" />
                  Izin {PERMIT_PHASES[phase].label.toLowerCase()}. Tidak boleh
                  keluar.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PermitGatePage() {
  return (
    <MainLayout>
      <PermitGateContent />
    </MainLayout>
  );
}
