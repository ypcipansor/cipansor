"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building,
  Building2,
  Plus,
  Search,
  Map,
  DoorOpen,
  Layers,
  Eye,
  Pencil,
  Trash2,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { type ColumnDef } from "@/components/shared";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { useUnits } from "@/hooks/use-units";
import {
  useLands,
  useBuildings,
  useRoomTypes,
  useRooms,
  useFacilitySummary,
  useCreateLand,
  useCreateBuilding,
  useCreateRoomType,
  useCreateRoom,
  useDeleteLand,
  useDeleteBuilding,
  useDeleteRoomType,
  useDeleteRoom,
  Land,
  Building as BuildingType,
  RoomType,
  FacilityRoom,
  LAND_OWNERSHIP_TYPES,
  BUILDING_CONDITION_TYPES,
  LandOwnership,
  BuildingCondition,
} from "@/hooks/use-facilities";

export default function FacilitiesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("lands");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter states
  const [selectedUnit, setSelectedUnit] = useState<string>("ALL");
  const [selectedLand, setSelectedLand] = useState<string>("ALL");
  const [selectedBuilding, setSelectedBuilding] = useState<string>("ALL");

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form states
  const [landForm, setLandForm] = useState({
    name: "",
    address: "",
    area: 0,
    ownership: "MILIK_SENDIRI" as LandOwnership,
    certificateNo: "",
    nop: "",
    unitId: "",
    notes: "",
  });

  const [buildingForm, setBuildingForm] = useState({
    name: "",
    code: "",
    landId: "",
    unitId: "",
    floors: 1,
    yearBuilt: new Date().getFullYear(),
    length: 0,
    width: 0,
    condition: "BAIK" as BuildingCondition,
    notes: "",
  });

  const [roomTypeForm, setRoomTypeForm] = useState({
    name: "",
    code: "",
    description: "",
  });

  const [roomForm, setRoomForm] = useState({
    name: "",
    code: "",
    buildingId: "",
    roomTypeId: "",
    floor: 1,
    capacity: 0,
    length: 0,
    width: 0,
    notes: "",
  });

  // Data hooks
  const { data: units } = useUnits();
  const { data: lands, isLoading: loadingLands } = useLands({
    search: searchQuery,
    unitId: selectedUnit !== "ALL" ? selectedUnit : undefined,
  });
  const { data: buildings, isLoading: loadingBuildings } = useBuildings({
    search: searchQuery,
    unitId: selectedUnit !== "ALL" ? selectedUnit : undefined,
    landId: selectedLand !== "ALL" ? selectedLand : undefined,
  });
  const { data: roomTypes, isLoading: loadingRoomTypes } = useRoomTypes();
  const { data: rooms, isLoading: loadingRooms } = useRooms({
    search: searchQuery,
    buildingId: selectedBuilding !== "ALL" ? selectedBuilding : undefined,
  });
  const { data: summary } = useFacilitySummary(
    selectedUnit !== "ALL" ? selectedUnit : undefined,
  );

  // Mutations
  const createLand = useCreateLand();
  const createBuilding = useCreateBuilding();
  const createRoomType = useCreateRoomType();
  const createRoom = useCreateRoom();
  const deleteLand = useDeleteLand();
  const deleteBuilding = useDeleteBuilding();
  const deleteRoomType = useDeleteRoomType();
  const deleteRoom = useDeleteRoom();

  // Land columns
  const landColumns: ColumnDef<Land>[] = [
    {
      accessorKey: "name",
      header: "Nama Tanah",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          {row.original.address && (
            <div className="text-sm text-muted-foreground">
              {row.original.address}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "area",
      header: "Luas (m²)",
      cell: ({ row }) => (
        <span>{Number(row.getValue("area")).toLocaleString("id-ID")} m²</span>
      ),
    },
    {
      accessorKey: "ownership",
      header: "Status Kepemilikan",
      cell: ({ row }) => {
        const ownership = row.getValue("ownership") as LandOwnership;
        const label =
          LAND_OWNERSHIP_TYPES.find((t) => t.value === ownership)?.label ||
          ownership;
        return <Badge variant="outline">{label}</Badge>;
      },
    },
    {
      accessorKey: "certificateNo",
      header: "No. Sertifikat",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.getValue("certificateNo") || "-"}
        </span>
      ),
    },
    {
      id: "unit",
      header: "Unit",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.unit?.name || "-"}
        </span>
      ),
    },
    {
      id: "buildings",
      header: "Gedung",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original._count?.buildings || 0} gedung
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedLand(row.original.id);
              setActiveTab("buildings");
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(row.original.id)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // Building columns
  const buildingColumns: ColumnDef<BuildingType>[] = [
    {
      accessorKey: "name",
      header: "Nama Gedung",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          {row.original.code && (
            <Badge variant="outline" className="text-xs">
              {row.original.code}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "floors",
      header: "Lantai",
      cell: ({ row }) => <span>{row.getValue("floors")} lantai</span>,
    },
    {
      accessorKey: "area",
      header: "Luas (m²)",
      cell: ({ row }) => (
        <span>
          {row.original.area
            ? `${Number(row.original.area).toLocaleString("id-ID")} m²`
            : "-"}
        </span>
      ),
    },
    {
      accessorKey: "condition",
      header: "Kondisi",
      cell: ({ row }) => {
        const condition = row.getValue("condition") as BuildingCondition;
        const label =
          BUILDING_CONDITION_TYPES.find((t) => t.value === condition)?.label ||
          condition;
        const colorMap: Record<BuildingCondition, string> = {
          BAIK: "bg-green-100 text-green-800",
          RUSAK_RINGAN: "bg-yellow-100 text-yellow-800",
          RUSAK_SEDANG: "bg-orange-100 text-orange-800",
          RUSAK_BERAT: "bg-red-100 text-red-800",
        };
        return <Badge className={colorMap[condition]}>{label}</Badge>;
      },
    },
    {
      accessorKey: "yearBuilt",
      header: "Tahun Dibangun",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.getValue("yearBuilt") || "-"}
        </span>
      ),
    },
    {
      id: "rooms",
      header: "Ruang",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original._count?.rooms || 0} ruang
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedBuilding(row.original.id);
              setActiveTab("rooms");
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(row.original.id)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // Room Type columns
  const roomTypeColumns: ColumnDef<RoomType>[] = [
    {
      accessorKey: "code",
      header: "Kode",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("code")}</Badge>
      ),
    },
    {
      accessorKey: "name",
      header: "Nama Tipe Ruang",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "description",
      header: "Deskripsi",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.getValue("description") || "-"}
        </span>
      ),
    },
    {
      id: "rooms",
      header: "Jumlah Ruang",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original._count?.rooms || 0} ruang
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.getValue("isActive") ? "default" : "secondary"}>
          {row.getValue("isActive") ? "Aktif" : "Nonaktif"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteId(row.original.id)}
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  // Room columns
  const roomColumns: ColumnDef<FacilityRoom>[] = [
    {
      accessorKey: "name",
      header: "Nama Ruang",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          {row.original.code && (
            <Badge variant="outline" className="text-xs">
              {row.original.code}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "roomType",
      header: "Tipe Ruang",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.roomType?.name || "-"}</Badge>
      ),
    },
    {
      id: "building",
      header: "Gedung",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.building?.name || "-"}
        </span>
      ),
    },
    {
      accessorKey: "floor",
      header: "Lantai",
      cell: ({ row }) => <span>Lantai {row.getValue("floor")}</span>,
    },
    {
      accessorKey: "capacity",
      header: "Kapasitas",
      cell: ({ row }) => <span>{row.getValue("capacity") || "-"} orang</span>,
    },
    {
      accessorKey: "area",
      header: "Luas",
      cell: ({ row }) => (
        <span>
          {row.original.area
            ? `${Number(row.original.area).toLocaleString("id-ID")} m²`
            : "-"}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.getValue("isActive") ? "default" : "secondary"}>
          {row.getValue("isActive") ? "Aktif" : "Nonaktif"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteId(row.original.id)}
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const handleAdd = async () => {
    try {
      if (activeTab === "lands") {
        if (!landForm.unitId) {
          toast.error("Pilih unit terlebih dahulu");
          return;
        }
        await createLand.mutateAsync({
          name: landForm.name,
          address: landForm.address || undefined,
          area: landForm.area,
          ownership: landForm.ownership,
          certificateNo: landForm.certificateNo || undefined,
          nop: landForm.nop || undefined,
          unitId: landForm.unitId,
          notes: landForm.notes || undefined,
        });
        toast.success("Tanah berhasil ditambahkan");
        setLandForm({
          name: "",
          address: "",
          area: 0,
          ownership: "MILIK_SENDIRI",
          certificateNo: "",
          nop: "",
          unitId: "",
          notes: "",
        });
      } else if (activeTab === "buildings") {
        if (!buildingForm.landId || !buildingForm.unitId) {
          toast.error("Pilih tanah dan unit terlebih dahulu");
          return;
        }
        await createBuilding.mutateAsync({
          name: buildingForm.name,
          code: buildingForm.code || undefined,
          landId: buildingForm.landId,
          unitId: buildingForm.unitId,
          floors: buildingForm.floors,
          yearBuilt: buildingForm.yearBuilt || undefined,
          length: buildingForm.length || undefined,
          width: buildingForm.width || undefined,
          condition: buildingForm.condition,
          notes: buildingForm.notes || undefined,
        });
        toast.success("Gedung berhasil ditambahkan");
        setBuildingForm({
          name: "",
          code: "",
          landId: "",
          unitId: "",
          floors: 1,
          yearBuilt: new Date().getFullYear(),
          length: 0,
          width: 0,
          condition: "BAIK",
          notes: "",
        });
      } else if (activeTab === "room-types") {
        await createRoomType.mutateAsync({
          name: roomTypeForm.name,
          code: roomTypeForm.code,
          description: roomTypeForm.description || undefined,
        });
        toast.success("Tipe ruang berhasil ditambahkan");
        setRoomTypeForm({ name: "", code: "", description: "" });
      } else if (activeTab === "rooms") {
        if (!roomForm.buildingId || !roomForm.roomTypeId) {
          toast.error("Pilih gedung dan tipe ruang terlebih dahulu");
          return;
        }
        await createRoom.mutateAsync({
          name: roomForm.name,
          code: roomForm.code || undefined,
          buildingId: roomForm.buildingId,
          roomTypeId: roomForm.roomTypeId,
          floor: roomForm.floor,
          capacity: roomForm.capacity || undefined,
          length: roomForm.length || undefined,
          width: roomForm.width || undefined,
          notes: roomForm.notes || undefined,
        });
        toast.success("Ruang berhasil ditambahkan");
        setRoomForm({
          name: "",
          code: "",
          buildingId: "",
          roomTypeId: "",
          floor: 1,
          capacity: 0,
          length: 0,
          width: 0,
          notes: "",
        });
      }
      setIsAddDialogOpen(false);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menambahkan data";
      toast.error(errorMessage);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      if (activeTab === "lands") {
        await deleteLand.mutateAsync(deleteId);
        toast.success("Tanah berhasil dihapus");
      } else if (activeTab === "buildings") {
        await deleteBuilding.mutateAsync(deleteId);
        toast.success("Gedung berhasil dihapus");
      } else if (activeTab === "room-types") {
        await deleteRoomType.mutateAsync(deleteId);
        toast.success("Tipe ruang berhasil dihapus");
      } else if (activeTab === "rooms") {
        await deleteRoom.mutateAsync(deleteId);
        toast.success("Ruang berhasil dihapus");
      }
      setDeleteId(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus data";
      toast.error(errorMessage);
    }
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case "lands":
        return "Tanah";
      case "buildings":
        return "Gedung";
      case "room-types":
        return "Tipe Ruang";
      case "rooms":
        return "Ruang";
      default:
        return "";
    }
  };

  const stats = [
    {
      title: "Total Tanah",
      value: summary?.totalLands || 0,
      subValue: summary?.totalLandArea
        ? `${Number(summary.totalLandArea).toLocaleString("id-ID")} m²`
        : "0 m²",
      icon: Map,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Total Gedung",
      value: summary?.totalBuildings || 0,
      subValue: summary?.totalBuildingArea
        ? `${Number(summary.totalBuildingArea).toLocaleString("id-ID")} m²`
        : "0 m²",
      icon: Building2,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Total Ruang",
      value: summary?.totalRooms || 0,
      subValue: `Kapasitas ${summary?.totalRoomCapacity || 0} orang`,
      icon: DoorOpen,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Tipe Ruang",
      value: roomTypes?.length || 0,
      subValue: "Kategori ruang",
      icon: LayoutGrid,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
  ];

  return (
    <MainLayout>
      <PageHeader
        title="Manajemen Fasilitas"
        description="Kelola data tanah, gedung, dan ruang di pesantren/sekolah"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Fasilitas" },
        ]}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">
                    {stat.subValue}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Data Fasilitas</CardTitle>
              <CardDescription>
                Kelola data tanah, gedung, dan ruang
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Unit</SelectItem>
                  {units?.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari..."
                  className="pl-10 w-[150px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah {getTabLabel()}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Tambah {getTabLabel()}</DialogTitle>
                    <DialogDescription>
                      Masukkan data {getTabLabel().toLowerCase()} baru
                    </DialogDescription>
                  </DialogHeader>

                  {activeTab === "lands" && (
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="grid gap-2">
                        <Label htmlFor="land-name">Nama Tanah *</Label>
                        <Input
                          id="land-name"
                          placeholder="Masukkan nama tanah"
                          value={landForm.name}
                          onChange={(e) =>
                            setLandForm({ ...landForm, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="land-unit">Unit *</Label>
                        <Select
                          value={landForm.unitId}
                          onValueChange={(val) =>
                            setLandForm({ ...landForm, unitId: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {units?.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="land-area">Luas (m²) *</Label>
                        <Input
                          id="land-area"
                          type="number"
                          placeholder="0"
                          value={landForm.area || ""}
                          onChange={(e) =>
                            setLandForm({
                              ...landForm,
                              area: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Status Kepemilikan *</Label>
                        <Select
                          value={landForm.ownership}
                          onValueChange={(val: LandOwnership) =>
                            setLandForm({ ...landForm, ownership: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LAND_OWNERSHIP_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="land-address">Alamat</Label>
                        <Textarea
                          id="land-address"
                          placeholder="Alamat tanah"
                          value={landForm.address}
                          onChange={(e) =>
                            setLandForm({
                              ...landForm,
                              address: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="land-cert">No. Sertifikat</Label>
                        <Input
                          id="land-cert"
                          placeholder="Nomor sertifikat"
                          value={landForm.certificateNo}
                          onChange={(e) =>
                            setLandForm({
                              ...landForm,
                              certificateNo: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="land-nop">
                          NOP (Nomor Objek Pajak)
                        </Label>
                        <Input
                          id="land-nop"
                          placeholder="NOP"
                          value={landForm.nop}
                          onChange={(e) =>
                            setLandForm({ ...landForm, nop: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "buildings" && (
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="grid gap-2">
                        <Label htmlFor="building-name">Nama Gedung *</Label>
                        <Input
                          id="building-name"
                          placeholder="Masukkan nama gedung"
                          value={buildingForm.name}
                          onChange={(e) =>
                            setBuildingForm({
                              ...buildingForm,
                              name: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="building-code">Kode Gedung</Label>
                        <Input
                          id="building-code"
                          placeholder="GD001"
                          value={buildingForm.code}
                          onChange={(e) =>
                            setBuildingForm({
                              ...buildingForm,
                              code: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Unit *</Label>
                        <Select
                          value={buildingForm.unitId}
                          onValueChange={(val) =>
                            setBuildingForm({ ...buildingForm, unitId: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {units?.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Tanah *</Label>
                        <Select
                          value={buildingForm.landId}
                          onValueChange={(val) =>
                            setBuildingForm({ ...buildingForm, landId: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih tanah" />
                          </SelectTrigger>
                          <SelectContent>
                            {lands?.map((land) => (
                              <SelectItem key={land.id} value={land.id}>
                                {land.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="building-floors">
                            Jumlah Lantai *
                          </Label>
                          <Input
                            id="building-floors"
                            type="number"
                            min="1"
                            value={buildingForm.floors}
                            onChange={(e) =>
                              setBuildingForm({
                                ...buildingForm,
                                floors: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="building-year">Tahun Dibangun</Label>
                          <Input
                            id="building-year"
                            type="number"
                            value={buildingForm.yearBuilt || ""}
                            onChange={(e) =>
                              setBuildingForm({
                                ...buildingForm,
                                yearBuilt: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="building-length">Panjang (m)</Label>
                          <Input
                            id="building-length"
                            type="number"
                            value={buildingForm.length || ""}
                            onChange={(e) =>
                              setBuildingForm({
                                ...buildingForm,
                                length: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="building-width">Lebar (m)</Label>
                          <Input
                            id="building-width"
                            type="number"
                            value={buildingForm.width || ""}
                            onChange={(e) =>
                              setBuildingForm({
                                ...buildingForm,
                                width: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Kondisi *</Label>
                        <Select
                          value={buildingForm.condition}
                          onValueChange={(val: BuildingCondition) =>
                            setBuildingForm({ ...buildingForm, condition: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BUILDING_CONDITION_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {activeTab === "room-types" && (
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="roomtype-code">Kode *</Label>
                        <Input
                          id="roomtype-code"
                          placeholder="KLS"
                          value={roomTypeForm.code}
                          onChange={(e) =>
                            setRoomTypeForm({
                              ...roomTypeForm,
                              code: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="roomtype-name">Nama Tipe Ruang *</Label>
                        <Input
                          id="roomtype-name"
                          placeholder="Kelas"
                          value={roomTypeForm.name}
                          onChange={(e) =>
                            setRoomTypeForm({
                              ...roomTypeForm,
                              name: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="roomtype-desc">Deskripsi</Label>
                        <Textarea
                          id="roomtype-desc"
                          placeholder="Deskripsi tipe ruang"
                          value={roomTypeForm.description}
                          onChange={(e) =>
                            setRoomTypeForm({
                              ...roomTypeForm,
                              description: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "rooms" && (
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="grid gap-2">
                        <Label htmlFor="room-name">Nama Ruang *</Label>
                        <Input
                          id="room-name"
                          placeholder="Ruang Kelas 1A"
                          value={roomForm.name}
                          onChange={(e) =>
                            setRoomForm({ ...roomForm, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="room-code">Kode Ruang</Label>
                        <Input
                          id="room-code"
                          placeholder="KLS-1A"
                          value={roomForm.code}
                          onChange={(e) =>
                            setRoomForm({ ...roomForm, code: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Gedung *</Label>
                        <Select
                          value={roomForm.buildingId}
                          onValueChange={(val) =>
                            setRoomForm({ ...roomForm, buildingId: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih gedung" />
                          </SelectTrigger>
                          <SelectContent>
                            {buildings?.map((building) => (
                              <SelectItem key={building.id} value={building.id}>
                                {building.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Tipe Ruang *</Label>
                        <Select
                          value={roomForm.roomTypeId}
                          onValueChange={(val) =>
                            setRoomForm({ ...roomForm, roomTypeId: val })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih tipe ruang" />
                          </SelectTrigger>
                          <SelectContent>
                            {roomTypes?.map((type) => (
                              <SelectItem key={type.id} value={type.id}>
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="room-floor">Lantai *</Label>
                          <Input
                            id="room-floor"
                            type="number"
                            min="1"
                            value={roomForm.floor}
                            onChange={(e) =>
                              setRoomForm({
                                ...roomForm,
                                floor: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="room-capacity">Kapasitas</Label>
                          <Input
                            id="room-capacity"
                            type="number"
                            placeholder="30"
                            value={roomForm.capacity || ""}
                            onChange={(e) =>
                              setRoomForm({
                                ...roomForm,
                                capacity: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="room-length">Panjang (m)</Label>
                          <Input
                            id="room-length"
                            type="number"
                            value={roomForm.length || ""}
                            onChange={(e) =>
                              setRoomForm({
                                ...roomForm,
                                length: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="room-width">Lebar (m)</Label>
                          <Input
                            id="room-width"
                            type="number"
                            value={roomForm.width || ""}
                            onChange={(e) =>
                              setRoomForm({
                                ...roomForm,
                                width: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Batal
                    </Button>
                    <Button
                      onClick={handleAdd}
                      disabled={
                        createLand.isPending ||
                        createBuilding.isPending ||
                        createRoomType.isPending ||
                        createRoom.isPending
                      }
                    >
                      {createLand.isPending ||
                      createBuilding.isPending ||
                      createRoomType.isPending ||
                      createRoom.isPending
                        ? "Menyimpan..."
                        : "Simpan"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="lands" className="gap-2">
                <Map className="h-4 w-4" />
                Tanah
              </TabsTrigger>
              <TabsTrigger value="buildings" className="gap-2">
                <Building2 className="h-4 w-4" />
                Gedung
              </TabsTrigger>
              <TabsTrigger value="room-types" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                Tipe Ruang
              </TabsTrigger>
              <TabsTrigger value="rooms" className="gap-2">
                <DoorOpen className="h-4 w-4" />
                Ruang
              </TabsTrigger>
            </TabsList>

            {/* Filter Bar */}
            {activeTab === "buildings" && (
              <div className="mb-4 flex gap-2">
                <Select value={selectedLand} onValueChange={setSelectedLand}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by Tanah" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Tanah</SelectItem>
                    {lands?.map((land) => (
                      <SelectItem key={land.id} value={land.id}>
                        {land.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLand && (
                  <Button variant="outline" onClick={() => setSelectedLand("")}>
                    Reset Filter
                  </Button>
                )}
              </div>
            )}

            {activeTab === "rooms" && (
              <div className="mb-4 flex gap-2">
                <Select
                  value={selectedBuilding}
                  onValueChange={setSelectedBuilding}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by Gedung" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua Gedung</SelectItem>
                    {buildings?.map((building) => (
                      <SelectItem key={building.id} value={building.id}>
                        {building.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedBuilding && (
                  <Button
                    variant="outline"
                    onClick={() => setSelectedBuilding("")}
                  >
                    Reset Filter
                  </Button>
                )}
              </div>
            )}

            <TabsContent value="lands">
              <DataTable
                columns={landColumns}
                data={lands || []}
                isLoading={loadingLands}
              />
            </TabsContent>

            <TabsContent value="buildings">
              <DataTable
                columns={buildingColumns}
                data={buildings || []}
                isLoading={loadingBuildings}
              />
            </TabsContent>

            <TabsContent value="room-types">
              <DataTable
                columns={roomTypeColumns}
                data={roomTypes || []}
                isLoading={loadingRoomTypes}
              />
            </TabsContent>

            <TabsContent value="rooms">
              <DataTable
                columns={roomColumns}
                data={rooms || []}
                isLoading={loadingRooms}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={`Hapus ${getTabLabel()}`}
        description={`Apakah Anda yakin ingin menghapus ${getTabLabel().toLowerCase()} ini? Data yang terkait juga akan terhapus.`}
        onConfirm={handleDelete}
        isLoading={
          deleteLand.isPending ||
          deleteBuilding.isPending ||
          deleteRoomType.isPending ||
          deleteRoom.isPending
        }
      />
    </MainLayout>
  );
}
