"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  ChevronRight,
  Search,
  Building2,
  Map,
  Home,
} from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
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
import { toast } from "sonner";
import { type ColumnDef } from "@/components/shared";

import {
  useProvinces,
  useRegencies,
  useDistricts,
  useVillages,
  useCreateProvince,
  useCreateRegency,
  useCreateDistrict,
  useCreateVillage,
  Province,
  Regency,
  District,
  Village,
} from "@/hooks/use-wilayah";

export default function WilayahPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("provinces");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter states
  const [selectedProvince, setSelectedProvince] = useState<string>("");
  const [selectedRegency, setSelectedRegency] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newItemData, setNewItemData] = useState({
    code: "",
    name: "",
    postalCode: "",
  });

  // Data hooks
  const { data: provinces, isLoading: loadingProvinces } = useProvinces({
    search: searchQuery,
  });
  const { data: regencies, isLoading: loadingRegencies } = useRegencies({
    provinceId: selectedProvince || undefined,
    search: searchQuery,
  });
  const { data: districts, isLoading: loadingDistricts } = useDistricts({
    regencyId: selectedRegency || undefined,
    search: searchQuery,
  });
  const { data: villages, isLoading: loadingVillages } = useVillages({
    districtId: selectedDistrict || undefined,
    search: searchQuery,
  });

  // Mutations
  const createProvince = useCreateProvince();
  const createRegency = useCreateRegency();
  const createDistrict = useCreateDistrict();
  const createVillage = useCreateVillage();

  // Province columns
  const provinceColumns: ColumnDef<Province>[] = [
    {
      accessorKey: "code",
      header: "Kode",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("code")}</Badge>
      ),
    },
    {
      accessorKey: "name",
      header: "Nama Provinsi",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      id: "regencyCount",
      header: "Jumlah Kabupaten/Kota",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original._count?.regencies || 0} kabupaten/kota
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedProvince(row.original.id);
            setActiveTab("regencies");
          }}
        >
          Lihat Kabupaten/Kota
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ),
    },
  ];

  // Regency columns
  const regencyColumns: ColumnDef<Regency>[] = [
    {
      accessorKey: "code",
      header: "Kode",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("code")}</Badge>
      ),
    },
    {
      accessorKey: "name",
      header: "Nama Kabupaten/Kota",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      id: "province",
      header: "Provinsi",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.province?.name || "-"}
        </span>
      ),
    },
    {
      id: "districtCount",
      header: "Jumlah Kecamatan",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original._count?.districts || 0} kecamatan
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedRegency(row.original.id);
            setActiveTab("districts");
          }}
        >
          Lihat Kecamatan
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ),
    },
  ];

  // District columns
  const districtColumns: ColumnDef<District>[] = [
    {
      accessorKey: "code",
      header: "Kode",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("code")}</Badge>
      ),
    },
    {
      accessorKey: "name",
      header: "Nama Kecamatan",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      id: "regency",
      header: "Kabupaten/Kota",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.regency?.name || "-"}
        </span>
      ),
    },
    {
      id: "villageCount",
      header: "Jumlah Kelurahan/Desa",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original._count?.villages || 0} kelurahan/desa
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedDistrict(row.original.id);
            setActiveTab("villages");
          }}
        >
          Lihat Kelurahan/Desa
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ),
    },
  ];

  // Village columns
  const villageColumns: ColumnDef<Village>[] = [
    {
      accessorKey: "code",
      header: "Kode",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("code")}</Badge>
      ),
    },
    {
      accessorKey: "name",
      header: "Nama Kelurahan/Desa",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      id: "district",
      header: "Kecamatan",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.district?.name || "-"}
        </span>
      ),
    },
    {
      accessorKey: "postalCode",
      header: "Kode Pos",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.getValue("postalCode") || "-"}
        </span>
      ),
    },
  ];

  const handleAdd = async () => {
    try {
      if (activeTab === "provinces") {
        await createProvince.mutateAsync({
          code: newItemData.code,
          name: newItemData.name,
        });
        toast.success("Provinsi berhasil ditambahkan");
      } else if (activeTab === "regencies") {
        if (!selectedProvince) {
          toast.error("Pilih provinsi terlebih dahulu");
          return;
        }
        await createRegency.mutateAsync({
          code: newItemData.code,
          name: newItemData.name,
          provinceId: selectedProvince,
        });
        toast.success("Kabupaten/Kota berhasil ditambahkan");
      } else if (activeTab === "districts") {
        if (!selectedRegency) {
          toast.error("Pilih kabupaten/kota terlebih dahulu");
          return;
        }
        await createDistrict.mutateAsync({
          code: newItemData.code,
          name: newItemData.name,
          regencyId: selectedRegency,
        });
        toast.success("Kecamatan berhasil ditambahkan");
      } else if (activeTab === "villages") {
        if (!selectedDistrict) {
          toast.error("Pilih kecamatan terlebih dahulu");
          return;
        }
        await createVillage.mutateAsync({
          code: newItemData.code,
          name: newItemData.name,
          districtId: selectedDistrict,
          postalCode: newItemData.postalCode || undefined,
        });
        toast.success("Kelurahan/Desa berhasil ditambahkan");
      }
      setIsAddDialogOpen(false);
      setNewItemData({ code: "", name: "", postalCode: "" });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menambahkan data";
      toast.error(errorMessage);
    }
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case "provinces":
        return "Provinsi";
      case "regencies":
        return "Kabupaten/Kota";
      case "districts":
        return "Kecamatan";
      case "villages":
        return "Kelurahan/Desa";
      default:
        return "";
    }
  };

  const stats = [
    {
      title: "Provinsi",
      value: provinces?.length || 0,
      icon: Map,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Kabupaten/Kota",
      value: regencies?.length || 0,
      icon: Building2,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Kecamatan",
      value: districts?.length || 0,
      icon: MapPin,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      title: "Kelurahan/Desa",
      value: villages?.length || 0,
      icon: Home,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  return (
    <MainLayout>
      <PageHeader
        title="Wilayah Indonesia"
        description="Kelola data wilayah administratif Indonesia (Provinsi, Kabupaten/Kota, Kecamatan, Kelurahan/Desa)"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Wilayah" },
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
              <CardTitle>Data Wilayah</CardTitle>
              <CardDescription>
                Kelola data wilayah administratif Indonesia
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari wilayah..."
                  className="pl-10 w-[200px]"
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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah {getTabLabel()}</DialogTitle>
                    <DialogDescription>
                      Masukkan data {getTabLabel().toLowerCase()} baru
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="code">Kode</Label>
                      <Input
                        id="code"
                        placeholder="Masukkan kode"
                        value={newItemData.code}
                        onChange={(e) =>
                          setNewItemData({
                            ...newItemData,
                            code: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="name">Nama</Label>
                      <Input
                        id="name"
                        placeholder={`Masukkan nama ${getTabLabel().toLowerCase()}`}
                        value={newItemData.name}
                        onChange={(e) =>
                          setNewItemData({
                            ...newItemData,
                            name: e.target.value,
                          })
                        }
                      />
                    </div>
                    {activeTab === "villages" && (
                      <div className="grid gap-2">
                        <Label htmlFor="postalCode">Kode Pos (Opsional)</Label>
                        <Input
                          id="postalCode"
                          placeholder="Masukkan kode pos"
                          value={newItemData.postalCode}
                          onChange={(e) =>
                            setNewItemData({
                              ...newItemData,
                              postalCode: e.target.value,
                            })
                          }
                        />
                      </div>
                    )}
                    {activeTab === "regencies" && (
                      <div className="grid gap-2">
                        <Label>Provinsi</Label>
                        <Select
                          value={selectedProvince}
                          onValueChange={setSelectedProvince}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih provinsi" />
                          </SelectTrigger>
                          <SelectContent>
                            {provinces?.map((province) => (
                              <SelectItem key={province.id} value={province.id}>
                                {province.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {activeTab === "districts" && (
                      <div className="grid gap-2">
                        <Label>Kabupaten/Kota</Label>
                        <Select
                          value={selectedRegency}
                          onValueChange={setSelectedRegency}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih kabupaten/kota" />
                          </SelectTrigger>
                          <SelectContent>
                            {regencies?.map((regency) => (
                              <SelectItem key={regency.id} value={regency.id}>
                                {regency.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {activeTab === "villages" && (
                      <div className="grid gap-2">
                        <Label>Kecamatan</Label>
                        <Select
                          value={selectedDistrict}
                          onValueChange={setSelectedDistrict}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih kecamatan" />
                          </SelectTrigger>
                          <SelectContent>
                            {districts?.map((district) => (
                              <SelectItem key={district.id} value={district.id}>
                                {district.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
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
                        createProvince.isPending ||
                        createRegency.isPending ||
                        createDistrict.isPending ||
                        createVillage.isPending
                      }
                    >
                      {createProvince.isPending ||
                      createRegency.isPending ||
                      createDistrict.isPending ||
                      createVillage.isPending
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
              <TabsTrigger value="provinces" className="gap-2">
                <Map className="h-4 w-4" />
                Provinsi
              </TabsTrigger>
              <TabsTrigger value="regencies" className="gap-2">
                <Building2 className="h-4 w-4" />
                Kabupaten/Kota
              </TabsTrigger>
              <TabsTrigger value="districts" className="gap-2">
                <MapPin className="h-4 w-4" />
                Kecamatan
              </TabsTrigger>
              <TabsTrigger value="villages" className="gap-2">
                <Home className="h-4 w-4" />
                Kelurahan/Desa
              </TabsTrigger>
            </TabsList>

            {/* Filter Bar for sub-levels */}
            {activeTab === "regencies" && (
              <div className="mb-4 flex gap-2">
                <Select
                  value={selectedProvince}
                  onValueChange={setSelectedProvince}
                >
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Filter by Provinsi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Provinsi</SelectItem>
                    {provinces?.map((province) => (
                      <SelectItem key={province.id} value={province.id}>
                        {province.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProvince && (
                  <Button
                    variant="outline"
                    onClick={() => setSelectedProvince("")}
                  >
                    Reset Filter
                  </Button>
                )}
              </div>
            )}

            {activeTab === "districts" && (
              <div className="mb-4 flex gap-2">
                <Select
                  value={selectedProvince}
                  onValueChange={(val) => {
                    setSelectedProvince(val);
                    setSelectedRegency("");
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Pilih Provinsi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Provinsi</SelectItem>
                    {provinces?.map((province) => (
                      <SelectItem key={province.id} value={province.id}>
                        {province.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedRegency}
                  onValueChange={setSelectedRegency}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Pilih Kabupaten/Kota" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua Kabupaten/Kota</SelectItem>
                    {regencies
                      ?.filter(
                        (r) =>
                          !selectedProvince ||
                          r.provinceId === selectedProvince,
                      )
                      .map((regency) => (
                        <SelectItem key={regency.id} value={regency.id}>
                          {regency.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {(selectedProvince || selectedRegency) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedProvince("");
                      setSelectedRegency("");
                    }}
                  >
                    Reset Filter
                  </Button>
                )}
              </div>
            )}

            {activeTab === "villages" && (
              <div className="mb-4 flex gap-2 flex-wrap">
                <Select
                  value={selectedProvince}
                  onValueChange={(val) => {
                    setSelectedProvince(val);
                    setSelectedRegency("");
                    setSelectedDistrict("");
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Pilih Provinsi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua</SelectItem>
                    {provinces?.map((province) => (
                      <SelectItem key={province.id} value={province.id}>
                        {province.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedRegency}
                  onValueChange={(val) => {
                    setSelectedRegency(val);
                    setSelectedDistrict("");
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Pilih Kab/Kota" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua</SelectItem>
                    {regencies
                      ?.filter(
                        (r) =>
                          !selectedProvince ||
                          r.provinceId === selectedProvince,
                      )
                      .map((regency) => (
                        <SelectItem key={regency.id} value={regency.id}>
                          {regency.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedDistrict}
                  onValueChange={setSelectedDistrict}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Pilih Kecamatan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Semua</SelectItem>
                    {districts
                      ?.filter(
                        (d) =>
                          !selectedRegency || d.regencyId === selectedRegency,
                      )
                      .map((district) => (
                        <SelectItem key={district.id} value={district.id}>
                          {district.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {(selectedProvince || selectedRegency || selectedDistrict) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedProvince("");
                      setSelectedRegency("");
                      setSelectedDistrict("");
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            )}

            <TabsContent value="provinces">
              <DataTable
                columns={provinceColumns}
                data={provinces || []}
                isLoading={loadingProvinces}
              />
            </TabsContent>

            <TabsContent value="regencies">
              <DataTable
                columns={regencyColumns}
                data={regencies || []}
                isLoading={loadingRegencies}
              />
            </TabsContent>

            <TabsContent value="districts">
              <DataTable
                columns={districtColumns}
                data={districts || []}
                isLoading={loadingDistricts}
              />
            </TabsContent>

            <TabsContent value="villages">
              <DataTable
                columns={villageColumns}
                data={villages || []}
                isLoading={loadingVillages}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
