"use client";

import { useState } from "react";
import Link from "next/link";
import { MainLayout } from "@/components/layout";
import {
  useFoundationDecisions,
  FOUNDATION_ORGAN_LABEL,
  FOUNDATION_STATUS_LABEL,
  FOUNDATION_KIND_LABEL,
} from "@/hooks/use-foundation-decisions";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Plus } from "lucide-react";

const statusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  VOTING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function FoundationDecisionsPage() {
  const [organType, setOrganType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const { data, isLoading } = useFoundationDecisions({
    organType: organType || undefined,
    status: status || undefined,
  });

  const items = data?.items ?? [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Keputusan & Risalah Organ"
          description="Keputusan Dewan Pembina, Pengurus, dan Pengawas dengan tanda tangan digital."
          actions={
            <Button asChild>
              <Link href="/foundation/decisions/new">
                <Plus className="mr-2 h-4 w-4" /> Buat Keputusan
              </Link>
            </Button>
          }
        />

        <div className="flex flex-wrap gap-3">
          <Select value={organType} onValueChange={setOrganType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Semua organ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua organ</SelectItem>
              {Object.entries(FOUNDATION_ORGAN_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {Object.entries(FOUNDATION_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Belum ada keputusan. Buat keputusan baru untuk membuka
                sirkuler/rapat.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Perihal</TableHead>
                    <TableHead>Organ</TableHead>
                    <TableHead>Cara</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Suara</TableHead>
                    <TableHead>Dibuat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link
                          href={`/foundation/decisions/${d.id}`}
                          className="flex items-center gap-2 font-medium"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {d.subject}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {FOUNDATION_ORGAN_LABEL[d.organType]}
                      </TableCell>
                      <TableCell>{FOUNDATION_KIND_LABEL[d.kind]}</TableCell>
                      <TableCell>
                        <Badge className={statusColor[d.status]}>
                          {FOUNDATION_STATUS_LABEL[d.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {d.voteSummary.approve}✓ · {d.voteSummary.reject}✗ ·{" "}
                        {d.votedCount}/{d.memberCount}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(d.createdAt).toLocaleDateString("id-ID")}
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
