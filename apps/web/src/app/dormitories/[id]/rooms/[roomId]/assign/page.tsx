"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDormitory, useRoom, useAssignRoom } from "@/hooks/use-dormitory";
import { useStudents } from "@/hooks/use-students";

import { MainLayout } from "@/components/layout";
function AssignRoomPageContent({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id, roomId } = use(params);
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );

  const { data: dormitory, isLoading: dormitoryLoading } = useDormitory(id);
  const { data: room, isLoading: roomLoading } = useRoom(roomId);
  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    search: search || undefined,
    limit: 20,
  });

  const assignMutation = useAssignRoom();

  const handleAssign = async () => {
    if (!selectedStudentId) {
      toast.error("Pilih santri terlebih dahulu");
      return;
    }

    if (!startDate) {
      toast.error("Tanggal masuk wajib diisi");
      return;
    }

    try {
      await assignMutation.mutateAsync({
        roomId,
        studentId: selectedStudentId,
        startDate,
      });
      toast.success("Santri berhasil ditambahkan ke kamar");
      router.push(`/dormitories/${id}`);
    } catch {
      toast.error("Gagal menambahkan santri ke kamar");
    }
  };

  const isLoading = dormitoryLoading || roomLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!dormitory || !room) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h3 className="text-lg font-semibold">Data tidak ditemukan</h3>
        <Button asChild className="mt-4">
          <Link href="/dormitories">Kembali ke Daftar</Link>
        </Button>
      </div>
    );
  }

  const availableSpots = room.capacity - (room.currentOccupancy || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dormitories/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tambah Penghuni</h1>
          <p className="text-muted-foreground">
            {dormitory.name} - {room.name}
          </p>
        </div>
      </div>

      {/* Room Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Kamar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Nama Kamar
            </p>
            <p className="font-medium">{room.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Kapasitas
            </p>
            <p>
              {room.currentOccupancy || 0}/{room.capacity} terisi
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Tersedia
            </p>
            <Badge variant={availableSpots > 0 ? "default" : "destructive"}>
              {availableSpots} tempat
            </Badge>
          </div>
        </CardContent>
      </Card>

      {availableSpots <= 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-semibold text-destructive">
              Kamar Penuh
            </h3>
            <p className="mt-2 text-muted-foreground">
              Kamar ini sudah penuh. Tidak dapat menambahkan penghuni baru.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/dormitories/${id}`}>Kembali</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Assignment Form */}
          <Card>
            <CardHeader>
              <CardTitle>Pilih Santri</CardTitle>
              <CardDescription>
                Cari dan pilih santri yang akan ditempatkan di kamar ini
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="search">Cari Santri</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Nama atau NISN..."
                      className="pl-10"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Tanggal Masuk</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>

              {studentsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : studentsData?.data.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  {search
                    ? "Tidak ada santri ditemukan"
                    : "Masukkan nama atau NISN untuk mencari"}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>NISN</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Jenis Kelamin</TableHead>
                        <TableHead>Kelas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsData?.data.map((student) => (
                        <TableRow
                          key={student.id}
                          className={`cursor-pointer ${
                            selectedStudentId === student.id ? "bg-muted" : ""
                          }`}
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          <TableCell>
                            <input
                              type="radio"
                              name="student"
                              checked={selectedStudentId === student.id}
                              onChange={() => setSelectedStudentId(student.id)}
                              className="h-4 w-4"
                            />
                          </TableCell>
                          <TableCell>{student.nisn}</TableCell>
                          <TableCell className="font-medium">
                            {student.name}
                          </TableCell>
                          <TableCell>
                            {student.gender === "MALE"
                              ? "Laki-laki"
                              : "Perempuan"}
                          </TableCell>
                          <TableCell>
                            {student.currentClass?.name || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex justify-end gap-4 pt-4">
                <Button variant="outline" asChild>
                  <Link href={`/dormitories/${id}`}>Batal</Link>
                </Button>
                <Button
                  onClick={handleAssign}
                  disabled={!selectedStudentId || assignMutation.isPending}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {assignMutation.isPending
                    ? "Menyimpan..."
                    : "Tambahkan ke Kamar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function AssignRoomPage(props: Parameters<typeof AssignRoomPageContent>[0]) {
  return (
    <MainLayout>
      <AssignRoomPageContent {...props} />
    </MainLayout>
  );
}
