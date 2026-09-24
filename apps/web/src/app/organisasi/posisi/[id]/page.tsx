"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { ArrowLeft, User, FileText, CheckCircle2 } from "lucide-react";

import { MainLayout } from "@/components/layout";
function PositionDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const positionId = params.id as string;

  const { data: position, isLoading } = useQuery({
    queryKey: ["org-position", positionId],
    queryFn: () =>
      api
        .get(`/organisasi/positions/${positionId}`)
        .then((res) => res.data.data),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!position) {
    return (
      <div className="container mx-auto py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Posisi Tidak Ditemukan</h2>
        <Button onClick={() => router.back()}>Kembali</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Button
        variant="ghost"
        className="mb-2 -ml-4"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Kembali
      </Button>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <PageHeader
            title={position.title}
            description={`Kode: ${position.code || "-"} | Unit: ${position.orgUnit?.name}`}
          />
        </div>
        <Badge
          variant={position.holder ? "default" : "secondary"}
          className="text-sm px-3 py-1"
        >
          {position.holder ? "Terisi" : "Kosong"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" /> Penjabat Saat Ini
            </CardTitle>
          </CardHeader>
          <CardContent>
            {position.holder ? (
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xl">
                  {position.holder.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-semibold">{position.holder.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {position.holder.email}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>Belum ada penjabat yang ditugaskan</p>
                <Button variant="outline" size="sm" className="mt-4">
                  Tugaskan Personil
                </Button>
              </div>
            )}

            <div className="mt-6 pt-6 border-t space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">
                  Unit Kerja
                </span>
                <p className="font-medium">{position.orgUnit?.name}</p>
              </div>
              {position.parentPosition && (
                <div>
                  <span className="text-sm text-muted-foreground">
                    Melapor Kepada
                  </span>
                  <p className="font-medium">{position.parentPosition.title}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <Tabs defaultValue="tugas">
            <CardHeader className="pb-0 border-b">
              <TabsList className="bg-transparent border-none">
                <TabsTrigger
                  value="tugas"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  Tugas & Tanggung Jawab
                </TabsTrigger>
                <TabsTrigger
                  value="syarat"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  Persyaratan
                </TabsTrigger>
                <TabsTrigger
                  value="sop"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                >
                  SOP Terkait
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="pt-6">
              <TabsContent value="tugas" className="space-y-4 m-0">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {position.description ? (
                    <p className="whitespace-pre-line">
                      {position.description}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Deskripsi tugas belum diisi untuk posisi ini.
                    </p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="syarat" className="m-0">
                <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Fitur persyaratan kualifikasi posisi akan segera hadir.</p>
                </div>
              </TabsContent>
              <TabsContent value="sop" className="m-0">
                <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>
                    Integrasi dengan modul Tata Laksana (SOP) akan ditampilkan
                    di sini.
                  </p>
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

export default function PositionDetailPage() {
  return (
    <MainLayout>
      <PositionDetailPageContent />
    </MainLayout>
  );
}
