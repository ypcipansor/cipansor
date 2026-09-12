"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { useRegistrants } from "@/hooks/use-admissions";
import { safeFormat } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Users } from "lucide-react";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  REGISTERED: "secondary",
  DOCUMENT_CHECK: "secondary",
  TEST_SCHEDULED: "outline",
  TEST_COMPLETED: "outline",
  ACCEPTED: "default",
  REJECTED: "destructive",
  ENROLLED: "default",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Mendaftar",
  DOCUMENT_CHECK: "Verifikasi Dokumen",
  TEST_SCHEDULED: "Dijadwalkan Tes",
  TEST_COMPLETED: "Selesai Tes",
  ACCEPTED: "Diterima",
  REJECTED: "Ditolak",
  ENROLLED: "Sudah Daftar Ulang",
  CANCELLED: "Dibatalkan",
};

export default function RegistrationsPage() {
  const searchParams = useSearchParams();
  const queryStatus = searchParams.get("status");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(queryStatus || "ALL");

  useEffect(() => {
    if (queryStatus) {
      setStatus(queryStatus);
    }
  }, [queryStatus]);

  const { data, isLoading } = useRegistrants({
    ...(status !== "ALL" ? { status } : {}),
    limit: 50,
  });

  const registrants: any[] = data?.data ?? [];
  const filtered = registrants.filter((r) => {
    if (!search) return true;
    const haystack = `${r.fullName ?? r.name ?? ""} ${r.registrationNo ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title="Pendaftar"
          description="Kelola calon santri baru dan jalankan onboarding terpadu"
        />

        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau nomor pendaftaran…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
                <p>Belum ada pendaftar.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>No. Pendaftaran</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal Daftar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/spmb/registrations/${reg.id}`}
                          className="text-primary hover:underline"
                        >
                          {reg.fullName || reg.name || "-"}
                        </Link>
                      </TableCell>
                      <TableCell>{reg.registrationNo || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[reg.status] ?? "secondary"}>
                          {STATUS_LABEL[reg.status] ?? reg.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {safeFormat(reg.createdAt, "dd MMM yyyy")}
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
