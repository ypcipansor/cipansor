"use client";

import { useParams } from "next/navigation";
import { useRegistration } from "@/hooks/use-admissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, ArrowLeft } from "lucide-react";
import { InteractionTimeline } from "@/components/marketing/interaction-timeline";
import { LogInteractionDialog } from "@/components/marketing/log-interaction-dialog";
import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function LeadDetailPage() {
  const { id } = useParams() as { id: string };
  const { data: lead, isLoading } = useRegistration(id);
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  if (isLoading)
    return <Loader2 className="animate-spin h-8 w-8 mx-auto mt-10" />;
  if (!lead)
    return <div className="text-center mt-10">Data tidak ditemukan</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/marketing/leads">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{lead.fullName}</h1>
        <Badge>{lead.status}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Info Kontak</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Orang Tua</span>
                <span className="col-span-2 font-medium">
                  {(lead as any).parentName}
                </span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Telepon</span>
                <span className="col-span-2">{(lead as any).parentPhone}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Email</span>
                <span className="col-span-2">
                  {(lead as any).parentEmail || "-"}
                </span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Alamat</span>
                <span className="col-span-2">
                  {(lead as any).address || "-"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Info Marketing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Sumber</span>
                <span className="col-span-2 font-medium">
                  {lead.source || "Direct"}
                </span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-muted-foreground">Kampanye</span>
                <span className="col-span-2">
                  {lead.campaign ? (
                    <Badge variant="outline">{lead.campaign.name}</Badge>
                  ) : (
                    "-"
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Aktivitas</h2>
            <Button size="sm" onClick={() => setLogDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Catat Interaksi
            </Button>
          </div>
          <InteractionTimeline registrantId={lead.id} />
        </div>
      </div>

      <LogInteractionDialog
        open={logDialogOpen}
        onOpenChange={setLogDialogOpen}
        registrantId={lead.id}
      />
    </div>
  );
}
