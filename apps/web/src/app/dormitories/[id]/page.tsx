"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Users,
  Bed,
  Pencil,
  Plus,
  DoorOpen,
  Trash2,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useDormitory,
  useDormitoryRooms,
  useCreateRoom,
  useDeleteRoom,
  useRoomAssignments,
  useUnassignRoom,
  Room,
} from "@/hooks/use-dormitory";

function DormitoryDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);
  const [unassignId, setUnassignId] = useState<string | null>(null);

  // New room form state
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomFloor, setNewRoomFloor] = useState(1);
  const [newRoomCapacity, setNewRoomCapacity] = useState(4);

  const { data: dormitory, isLoading } = useDormitory(id);
  const { data: rooms, isLoading: roomsLoading } = useDormitoryRooms(id);
  const { data: assignments } = useRoomAssignments(selectedRoom?.id || "");

  const createRoomMutation = useCreateRoom();
  const deleteRoomMutation = useDeleteRoom();
  const unassignMutation = useUnassignRoom();

  const handleAddRoom = async () => {
    if (!newRoomName) {
      toast.error("Nama kamar wajib diisi");
      return;
    }

    try {
      await createRoomMutation.mutateAsync({
        name: newRoomName,
        floor: newRoomFloor,
        capacity: newRoomCapacity,
        dormitoryId: id,
      });
      toast.success("Kamar berhasil ditambahkan");
      setShowAddRoom(false);
      setNewRoomName("");
      setNewRoomFloor(1);
      setNewRoomCapacity(4);
    } catch {
      toast.error("Gagal menambahkan kamar");
    }
  };

  const handleDeleteRoom = async () => {
    if (!deleteRoomId) return;
    try {
      await deleteRoomMutation.mutateAsync(deleteRoomId);
      toast.success("Kamar berhasil dihapus");
      setDeleteRoomId(null);
      if (selectedRoom?.id === deleteRoomId) {
        setSelectedRoom(null);
      }
    } catch {
      toast.error("Gagal menghapus kamar");
    }
  };

  const handleUnassign = async () => {
    if (!unassignId) return;
    try {
      await unassignMutation.mutateAsync(unassignId);
      toast.success("Santri berhasil dikeluarkan dari kamar");
      setUnassignId(null);
    } catch {
      toast.error("Gagal mengeluarkan santri dari kamar");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!dormitory) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Asrama tidak ditemukan</h3>
        <Button asChild className="mt-4">
          <Link href="/dormitories">Kembali ke Daftar</Link>
        </Button>
      </div>
    );
  }

  const occupancyPercent = dormitory.capacity
    ? Math.round(((dormitory.currentOccupancy || 0) / dormitory.capacity) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dormitories">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                {dormitory.name}
              </h1>
              <Badge
                className={
                  dormitory.type === "MALE"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-pink-100 text-pink-800"
                }
              >
                {dormitory.type === "MALE" ? "Putra" : "Putri"}
              </Badge>
              {!dormitory.isActive && (
                <Badge variant="secondary">Tidak Aktif</Badge>
              )}
            </div>
            <p className="text-muted-foreground">{dormitory.code}</p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/dormitories/${id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Kapasitas
            </CardTitle>
            <Bed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dormitory.capacity}</div>
            <p className="text-xs text-muted-foreground">santri</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Terisi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dormitory.currentOccupancy || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {occupancyPercent}% kapasitas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tersedia</CardTitle>
            <DoorOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dormitory.capacity - (dormitory.currentOccupancy || 0)}
            </div>
            <p className="text-xs text-muted-foreground">tempat kosong</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Jumlah Kamar</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rooms?.length || 0}</div>
            <p className="text-xs text-muted-foreground">kamar</p>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Asrama</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Unit</p>
            <p>{dormitory.unit?.name || "-"}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Pengasuh
            </p>
            <p>{dormitory.supervisor?.name || "-"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-muted-foreground">
              Deskripsi
            </p>
            <p>{dormitory.description || "-"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-muted-foreground">
              Fasilitas
            </p>
            <p>{dormitory.facilities || "-"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Rooms Management */}
      <Tabs defaultValue="rooms" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="rooms">Daftar Kamar</TabsTrigger>
            <TabsTrigger value="occupants">Penghuni</TabsTrigger>
          </TabsList>
          <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Tambah Kamar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Kamar Baru</DialogTitle>
                <DialogDescription>
                  Tambahkan kamar baru ke asrama {dormitory.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roomName">Nama Kamar</Label>
                  <Input
                    id="roomName"
                    placeholder="Kamar 101"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="floor">Lantai</Label>
                    <Input
                      id="floor"
                      type="number"
                      min={1}
                      value={newRoomFloor}
                      onChange={(e) =>
                        setNewRoomFloor(parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity">Kapasitas</Label>
                    <Input
                      id="capacity"
                      type="number"
                      min={1}
                      value={newRoomCapacity}
                      onChange={(e) =>
                        setNewRoomCapacity(parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAddRoom(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    onClick={handleAddRoom}
                    disabled={createRoomMutation.isPending}
                  >
                    {createRoomMutation.isPending ? "Menyimpan..." : "Simpan"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="rooms">
          <Card>
            <CardContent className="p-0">
              {roomsLoading ? (
                <div className="p-6">
                  <Skeleton className="h-32" />
                </div>
              ) : rooms?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <DoorOpen className="h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">
                    Belum ada kamar
                  </h3>
                  <p className="text-muted-foreground">
                    Tambahkan kamar untuk mulai mengelola penghuni
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Kamar</TableHead>
                      <TableHead>Lantai</TableHead>
                      <TableHead>Kapasitas</TableHead>
                      <TableHead>Terisi</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rooms?.map((room) => (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">
                          {room.name}
                        </TableCell>
                        <TableCell>{room.floor}</TableCell>
                        <TableCell>{room.capacity}</TableCell>
                        <TableCell>{room.currentOccupancy || 0}</TableCell>
                        <TableCell>
                          {(room.currentOccupancy || 0) >= room.capacity ? (
                            <Badge variant="destructive">Penuh</Badge>
                          ) : (room.currentOccupancy || 0) > 0 ? (
                            <Badge variant="default">Sebagian</Badge>
                          ) : (
                            <Badge variant="secondary">Kosong</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedRoom(room)}
                            >
                              <Users className="mr-1 h-4 w-4" />
                              Lihat Penghuni
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteRoomId(room.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="occupants">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedRoom ? `Penghuni ${selectedRoom.name}` : "Pilih Kamar"}
              </CardTitle>
              <CardDescription>
                {selectedRoom
                  ? `${selectedRoom.currentOccupancy || 0} dari ${selectedRoom.capacity} tempat terisi`
                  : 'Klik "Lihat Penghuni" pada daftar kamar untuk melihat penghuni'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedRoom ? (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" asChild>
                      <Link
                        href={`/dormitories/${id}/rooms/${selectedRoom.id}/assign`}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Tambah Penghuni
                      </Link>
                    </Button>
                  </div>
                  {assignments?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Users className="h-8 w-8 text-muted-foreground" />
                      <p className="mt-2 text-muted-foreground">
                        Belum ada penghuni di kamar ini
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>NISN</TableHead>
                          <TableHead>Nama</TableHead>
                          <TableHead>Tanggal Masuk</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignments?.map((assignment) => (
                          <TableRow key={assignment.id}>
                            <TableCell>{assignment.student?.nisn || assignment.student?.nik || "-"}</TableCell>
                            <TableCell className="font-medium">
                              {assignment.student?.name}
                            </TableCell>
                            <TableCell>
                              {new Date(
                                assignment.startDate,
                              ).toLocaleDateString("id-ID")}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setUnassignId(assignment.id)}
                              >
                                <UserMinus className="mr-1 h-4 w-4" />
                                Keluarkan
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <DoorOpen className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">
                    Pilih kamar dari tab &quot;Daftar Kamar&quot; untuk melihat
                    penghuni
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Room Dialog */}
      <ConfirmDialog
        open={!!deleteRoomId}
        onOpenChange={(open: boolean) => !open && setDeleteRoomId(null)}
        title="Hapus Kamar"
        description="Apakah Anda yakin ingin menghapus kamar ini? Semua data penghuni akan dihapus."
        confirmLabel="Hapus"
        onConfirm={handleDeleteRoom}
        isLoading={deleteRoomMutation.isPending}
        variant="destructive"
      />

      {/* Unassign Dialog */}
      <ConfirmDialog
        open={!!unassignId}
        onOpenChange={(open: boolean) => !open && setUnassignId(null)}
        title="Keluarkan Santri"
        description="Apakah Anda yakin ingin mengeluarkan santri ini dari kamar?"
        confirmLabel="Keluarkan"
        onConfirm={handleUnassign}
        isLoading={unassignMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}

export default function DormitoryDetailPage(props: Parameters<typeof DormitoryDetailPageContent>[0]) {
  return (
    <MainLayout>
      <DormitoryDetailPageContent {...props} />
    </MainLayout>
  );
}
