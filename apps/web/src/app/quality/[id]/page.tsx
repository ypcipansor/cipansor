"use client";

import { useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useActiveAcademicYear } from "@/hooks/use-academic-years";
import { useAuth } from "@/hooks/use-auth";
import {
  useStandardDetails,
  useDeleteEvidence,
  useQualityStandards,
} from "@/hooks/use-quality";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Trash2,
  ArrowLeft,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { EvidenceUploadDialog } from "@/components/quality/evidence-upload-dialog";
import { useResolvedFileUrls } from "@/hooks/use-resolved-file-url";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function StandardDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const unitId = user?.unitId;
  const standardId = params.id as string;

  const { data: standard, isLoading } = useStandardDetails(
    standardId,
    unitId || "",
    activeAcademicYear?.id || "",
  );

  // Evidence files are private uploads: a raw URL 403s. Resolve every indicator
  // evidence through one batch resolver that also keeps each link fresh.
  const evidenceUrls = useMemo(
    () =>
      (standard?.indicators ?? [])
        .flatMap((indicator) => indicator.evidences ?? [])
        .map((evidence) => evidence.fileUrl)
        .filter((u): u is string => !!u),
    [standard],
  );
  const resolvedEvidence = useResolvedFileUrls(evidenceUrls);
  const evidenceUrl = (u?: string | null): string =>
    (u && resolvedEvidence[u]) || u || "";

  const deleteEvidence = useDeleteEvidence();

  if (!unitId)
    return (
      <MainLayout>
        <div>Access Denied</div>
      </MainLayout>
    );
  if (isLoading)
    return (
      <MainLayout>
        <div>Loading...</div>
      </MainLayout>
    );
  if (!standard)
    return (
      <MainLayout>
        <div>Standard not found</div>
      </MainLayout>
    );

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Link href="/quality">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {standard.name}
            </h1>
            <p className="text-muted-foreground">{standard.description}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Indikator & Bukti Fisik</CardTitle>
            <CardDescription>
              Daftar indikator pemenuhan standar dan dokumen bukti yang telah
              diunggah.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {standard.indicators.map((indicator) => {
                const hasEvidence =
                  indicator.evidences && indicator.evidences.length > 0;

                return (
                  <AccordionItem key={indicator.id} value={indicator.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4 text-left">
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={hasEvidence ? "default" : "outline"}
                            className={
                              hasEvidence
                                ? "bg-green-600 hover:bg-green-700"
                                : ""
                            }
                          >
                            {indicator.code}
                          </Badge>
                          <span className="text-sm font-medium">
                            {indicator.name}
                          </span>
                        </div>
                        {hasEvidence && (
                          <Badge variant="secondary" className="ml-auto">
                            {indicator.evidences?.length} Bukti
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 pb-4 px-1">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            Target Skor: {indicator.targetScore}
                          </p>
                          <EvidenceUploadDialog
                            unitId={unitId}
                            indicatorId={indicator.id}
                          />
                        </div>

                        {indicator.evidences &&
                        indicator.evidences.length > 0 ? (
                          <div className="grid gap-2">
                            {indicator.evidences.map((evidence) => (
                              <div
                                key={evidence.id}
                                className="flex items-center justify-between border rounded-md p-3"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <FileText className="h-8 w-8 text-blue-500 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {evidence.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {evidence.description}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Oleh: {evidence.uploadedBy?.name} •{" "}
                                      {new Date(
                                        evidence.createdAt,
                                      ).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="icon" asChild>
                                    <a
                                      href={evidenceUrl(evidence.fileUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          "Apakah Anda yakin ingin menghapus bukti ini?",
                                        )
                                      ) {
                                        deleteEvidence.mutate(evidence.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Belum ada bukti</AlertTitle>
                            <AlertDescription>
                              Silakan unggah dokumen bukti fisik untuk indikator
                              ini.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
