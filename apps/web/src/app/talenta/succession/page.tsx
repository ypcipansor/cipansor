"use client";

import { useState } from "react";
import {
  useSuccessions,
  useSuccessorSuggestions,
  useOrgPositionsForSuccession,
} from "@/hooks/use-talenta";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserCheck, Search, Loader2, Target, Info } from "lucide-react";
import {
  SuccessionPlanningList,
  type SuccessionCandidate,
} from "@/components/hr/succession-planning-list";
import { MainLayout } from "@/components/layout";

interface SuccessionPlanItem {
  id: string;
  positionTitle: string;
  priority: string;
  readinessLevel: string | null;
  notes: string | null;
  targetDate: string | null;
  currentHolder: { id: string; name: string } | null;
  successor: { user: { id: string; name: string } } | null;
}

/*
  This page absorbed /hr/talenta and /hr/talenta/succession (deleted). There
  used to be two screens for one job: a "Manajemen Talenta" at /hr/talenta
  whose 9-box and distribution cards already existed at /talenta/matrix and
  /talenta/analytics, and a /hr/talenta/succession that nothing linked to but
  which held the only part worth keeping — picking a real jabatan from the org
  chart, and the honest statement of how the score is computed. Both live here
  now, next to the plans they are meant to fill.
*/
function SuccessionDashboardPageContent() {
  const { data: successions, isLoading } = useSuccessions();
  const [search, setSearch] = useState("");
  const [targetPositionId, setTargetPositionId] = useState<string | null>(null);
  const { data: positions } = useOrgPositionsForSuccession();
  const { data: suggestions, isLoading: suggestionsLoading } =
    useSuccessorSuggestions(search, undefined, targetPositionId);

  const selected = positions?.find((p) => p.id === targetPositionId);
  const selectedHasRequirements = Boolean(selected?.requirements);
  const candidates = (suggestions as SuccessionCandidate[] | undefined) ?? [];

  return (
    <div className="container mx-auto py-8 space-y-8">
      <PageHeader
        title="Perencanaan Suksesi"
        description="Rencana suksesi aktif, dan penyaringan kandidat dari data talenta yang tercatat"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Rencana Suksesi Aktif</CardTitle>
              <CardDescription>
                Daftar posisi strategis dan kandidat suksesinya
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin" />
                </div>
              ) : !successions || successions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  Belum ada rencana suksesi. Buat rencana dari modul Talenta.
                </p>
              ) : (
                <div className="space-y-4">
                  {(successions as SuccessionPlanItem[]).map((s) => (
                    <div
                      key={s.id}
                      className="p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-lg">
                            {s.positionTitle}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Pejabat saat ini:{" "}
                            {s.currentHolder?.name || "Kosong"}
                          </p>
                        </div>
                        <Badge
                          variant={
                            s.priority === "CRITICAL" || s.priority === "HIGH"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {s.priority}
                        </Badge>
                      </div>
                      {s.successor ? (
                        <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-md">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4 text-emerald-600" />
                              <span className="font-medium">
                                {s.successor.user.name}
                              </span>
                            </div>
                            {s.readinessLevel && (
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-100"
                              >
                                {s.readinessLevel}
                              </Badge>
                            )}
                          </div>
                          {s.notes && (
                            <p className="text-xs text-muted-foreground">
                              {s.notes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 border border-dashed rounded-md text-center text-sm text-muted-foreground">
                          Belum ada kandidat terpilih
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" /> Cari Kandidat Suksesor
              </CardTitle>
              <CardDescription>
                Pilih jabatan dari struktur organisasi agar kesesuaian
                kompetensi ikut dihitung.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Masukkan nama jabatan, misal: Kepala Sekolah"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setTargetPositionId(null);
                }}
              />

              {positions && positions.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Jabatan pada struktur organisasi
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {positions.map((p) => (
                      <Badge
                        key={p.id}
                        variant={
                          targetPositionId === p.id ? "default" : "secondary"
                        }
                        className="cursor-pointer"
                        onClick={() => {
                          setTargetPositionId(p.id);
                          setSearch(p.title);
                        }}
                      >
                        {p.title}
                      </Badge>
                    ))}
                  </div>
                  {targetPositionId && !selectedHasRequirements && (
                    <p className="text-xs text-amber-700 dark:text-amber-500">
                      Jabatan ini belum punya syarat kompetensi tercatat, jadi
                      kesesuaian kompetensi tetap tidak bisa dihitung.
                    </p>
                  )}
                </div>
              )}

              {positions && positions.length === 0 && (
                <p className="border-t pt-4 text-xs text-muted-foreground">
                  Belum ada jabatan pada struktur organisasi. Tambahkan lewat
                  menu Struktur Organisasi agar kesesuaian kompetensi bisa
                  dinilai.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-6">
        {suggestionsLoading ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50 py-20 dark:bg-slate-900/40">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Menghitung skor kandidat...</p>
          </div>
        ) : search.length > 2 ? (
          <SuccessionPlanningList
            candidates={candidates}
            positionTitle={search}
          />
        ) : (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            <Search className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">
              Ketik nama jabatan di atas, atau pilih satu dari struktur
              organisasi, untuk melihat kandidat suksesornya.
            </p>
          </div>
        )}

        {/*
          The old copy called this "AI-Driven" and stamped an "AI Powered
          Recommendations" badge on it. It is a weighted sum, not a model, and
          saying otherwise on a screen used to pick who runs a school is not a
          harmless flourish. The weights are stated here so a reader can judge
          the number instead of trusting it.
        */}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-bold">Cara skor dihitung</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Penjumlahan berbobot, bukan model AI: kategori talenta (maks 80),
              relevansi peran saat ini terhadap judul jabatan (10), pelatihan
              yang diselesaikan (15), pelatihan syariah (10), dan kesesuaian
              kompetensi terhadap syarat jabatan (25). Komponen yang datanya
              belum ada ditandai pada setiap kandidat, dan bila hanya kategori
              yang menyumbang, skornya tidak ditampilkan sebagai angka — karena
              angka itu tidak menjawab kecocokan terhadap jabatan yang dicari.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuccessionDashboardPage() {
  return (
    <MainLayout>
      <SuccessionDashboardPageContent />
    </MainLayout>
  );
}
