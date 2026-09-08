"use client";
import { MainLayout } from "@/components/layout";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  RefreshCw,
  Package,
  TrendingUp,
  AlertTriangle,
  Trash2,
  History,
  Grid,
  List,
  Wallet,
  Banknote,
  Store,
} from "lucide-react";
import { toast } from "sonner";

// Types
interface Category {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  _count: { items: number };
}

interface CanteenItem {
  id: string;
  code?: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  minStock: number;
  unit: string;
  imageUrl?: string;
  isAvailable: boolean;
  category: { id: string; name: string };
}

interface CartItem {
  item: CanteenItem;
  quantity: number;
}

interface CanteenStats {
  summary: {
    totalRevenue: number;
    totalTransactions: number;
  };
  topItems: Array<{
    itemId: string;
    itemName: string;
    quantitySold: number;
    totalRevenue: number;
  }>;
}

// API functions
const api = {
  getCategories: async (): Promise<Category[]> => {
    const res = await fetch("/api/canteen/categories");
    if (!res.ok) throw new Error("Failed to fetch categories");
    const json = await res.json();
    return json.data;
  },

  getItems: async (params?: {
    categoryId?: string;
    search?: string;
    isAvailable?: string;
    businessUnitId?: string;
  }): Promise<{ data: CanteenItem[]; pagination: { total: number } }> => {
    const searchParams = new URLSearchParams();
    if (params?.categoryId) searchParams.set("categoryId", params.categoryId);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.isAvailable)
      searchParams.set("isAvailable", params.isAvailable);
    if (params?.businessUnitId)
      searchParams.set("businessUnitId", params.businessUnitId);
    searchParams.set("limit", "100");

    const res = await fetch(`/api/canteen/items?${searchParams}`);
    if (!res.ok) throw new Error("Failed to fetch items");
    return res.json();
  },

  getLowStockItems: async (): Promise<CanteenItem[]> => {
    const res = await fetch("/api/canteen/items/low-stock");
    if (!res.ok) throw new Error("Failed to fetch low stock items");
    const json = await res.json();
    return json.data;
  },

  getStats: async (): Promise<CanteenStats> => {
    const res = await fetch("/api/canteen/transactions/stats");
    if (!res.ok) throw new Error("Failed to fetch stats");
    const json = await res.json();
    return json.data;
  },

  createTransaction: async (data: {
    studentId?: string;
    customerName?: string;
    businessUnitId?: string;
    items: Array<{ itemId: string; quantity: number }>;
    discount: number;
    paymentMethod: string;
  }) => {
    const res = await fetch("/api/canteen/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message || "Failed to create transaction");
    }
    return res.json();
  },

  searchStudents: async (
    search: string,
  ): Promise<
    Array<{
      id: string;
      nisn: string;
      name: string;
      walletBalance?: number;
    }>
  > => {
    if (!search) return [];
    const res = await fetch(
      `/api/students?search=${encodeURIComponent(search)}&limit=10`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data.map((s: any) => ({
      id: s.id,
      nisn: s.nisn,
      name: s.user?.name || s.name,
      walletBalance: s.wallet?.balance,
    }));
  },
};

// Format currency
const formatRupiah = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

function CanteenPageContent() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pos");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    nisn: string;
    name: string;
    walletBalance?: number;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"WALLET" | "CASH">("CASH");
  const [discount, setDiscount] = useState(0);

  // Queries
  const [selectedBUId, setSelectedBUId] = useState<string>("ALL");

  const { data: businessUnits } = useQuery({
    queryKey: ["business-units", "CANTEEN"],
    queryFn: async () => {
      const res = await fetch("/api/business-units?type=CANTEEN");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["canteen-categories", selectedBUId],
    queryFn: async () => {
      const url = selectedBUId !== "ALL"
        ? `/api/canteen/categories?businessUnitId=${selectedBUId}`
        : "/api/canteen/categories";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch categories");
      const json = await res.json();
      return json.data;
    },
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["canteen-items", selectedCategory, search, selectedBUId],
    queryFn: () =>
      api.getItems({
        categoryId:
          selectedCategory && selectedCategory !== "ALL"
            ? selectedCategory
            : undefined,
        search: search || undefined,
        isAvailable: "true",
        businessUnitId:
          selectedBUId !== "ALL" ? selectedBUId : undefined,
      }),
  });

  const { data: lowStockItems } = useQuery({
    queryKey: ["canteen-low-stock"],
    queryFn: api.getLowStockItems,
  });

  const { data: stats } = useQuery({
    queryKey: ["canteen-stats"],
    queryFn: api.getStats,
  });

  const { data: efficiencyData } = useQuery({
    queryKey: ["canteen-efficiency", selectedBUId],
    queryFn: async () => {
      const url = selectedBUId !== "ALL"
        ? `/api/canteen/efficiency?businessUnitId=${selectedBUId}`
        : "/api/canteen/efficiency";
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
  });

  const { data: studentResults } = useQuery({
    queryKey: ["student-search", studentSearch],
    queryFn: () => api.searchStudents(studentSearch),
    enabled: studentSearch.length >= 2,
  });

  // Mutations
  const createTransactionMutation = useMutation({
    mutationFn: api.createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canteen-items"] });
      queryClient.invalidateQueries({ queryKey: ["canteen-stats"] });
      queryClient.invalidateQueries({ queryKey: ["canteen-low-stock"] });
      toast.success("Transaksi berhasil");
      setCart([]);
      setCheckoutDialogOpen(false);
      setSelectedStudent(null);
      setDiscount(0);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Cart functions
  const addToCart = (item: CanteenItem) => {
    if (item.stock <= 0) {
      toast.error("Stok habis");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        if (existing.quantity >= item.stock) {
          toast.error(`Stok tidak mencukupi (tersedia: ${item.stock})`);
          return prev;
        }
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const updateCartQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((c) => {
          if (c.item.id === itemId) {
            const newQty = c.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > c.item.stock) {
              toast.error(`Stok tidak mencukupi (tersedia: ${c.item.stock})`);
              return c;
            }
            return { ...c, quantity: newQty };
          }
          return c;
        })
        .filter((c): c is CartItem => c !== null);
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
  }, [cart]);

  const grandTotal = useMemo(() => {
    return Math.max(0, cartTotal - discount);
  }, [cartTotal, discount]);

  const handleCheckout = () => {
    if (cart.length === 0) return;

    createTransactionMutation.mutate({
      studentId: selectedStudent?.id,
      customerName: selectedStudent ? undefined : "Umum",
      businessUnitId: selectedBUId !== "ALL" ? selectedBUId : undefined,
      items: cart.map((c) => ({
        itemId: c.item.id,
        quantity: c.quantity,
      })),
      discount,
      paymentMethod,
    });
  };

  // Stats cards
  const statsCards = useMemo(
    () => [
      {
        title: "Pendapatan Hari Ini",
        value: formatRupiah(stats?.summary?.totalRevenue || 0),
        icon: Banknote,
        color: "text-green-600",
        bgColor: "bg-green-100",
      },
      {
        title: "Transaksi Hari Ini",
        value: stats?.summary?.totalTransactions || 0,
        icon: TrendingUp,
        color: "text-blue-600",
        bgColor: "bg-blue-100",
      },
      {
        title: "Total Produk",
        value: itemsData?.pagination?.total || 0,
        icon: Package,
        color: "text-purple-600",
        bgColor: "bg-purple-100",
      },
      {
        title: "Stok Rendah",
        value: lowStockItems?.length || 0,
        icon: AlertTriangle,
        color: "text-red-600",
        bgColor: "bg-red-100",
      },
    ],
    [stats, itemsData, lowStockItems],
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-8 w-8 text-primary" />
            Kantin / Koperasi
          </h1>
          <p className="text-muted-foreground mt-1">
            Point of Sale dan manajemen produk kantin pesantren
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Business Unit Selector */}
      <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border">
        <Store className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <Label htmlFor="bu-select" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pilih Unit Usaha / Kantin</Label>
          <Select value={selectedBUId} onValueChange={(val) => {
            setSelectedBUId(val);
            setSelectedCategory("ALL");
            setCart([]);
          }}>
            <SelectTrigger id="bu-select" className="border-none bg-transparent p-0 h-auto focus:ring-0 text-lg font-semibold">
              <SelectValue placeholder="Pilih Unit Usaha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Kantin (Global)</SelectItem>
              {businessUnits?.map((bu: any) => (
                <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pos" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Kasir (POS)
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Inventori
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Riwayat
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Efisiensi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Product List */}
            <div className="lg:col-span-2 space-y-4">
              {/* Filters */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-4 items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Cari produk..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select
                      value={selectedCategory}
                      onValueChange={setSelectedCategory}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Semua Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Semua Kategori</SelectItem>
                        {categories?.map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name} ({cat._count.items})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex border rounded-md">
                      <Button
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setViewMode("grid")}
                      >
                        <Grid className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setViewMode("list")}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Products Grid/List */}
              {itemsLoading ? (
                <div className="flex justify-center p-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {itemsData?.data.map((item) => (
                    <Card
                      key={item.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        item.stock <= 0 ? "opacity-50" : ""
                      }`}
                      onClick={() => addToCart(item)}
                    >
                      <CardContent className="p-4">
                        <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <Package className="h-12 w-12 text-muted-foreground" />
                          )}
                        </div>
                        <h3 className="font-medium truncate">{item.name}</h3>
                        <div className="flex justify-between items-center mt-2">
                          <span className="font-bold text-primary">
                            {formatRupiah(item.price)}
                          </span>
                          <Badge
                            variant={
                              item.stock <= item.minStock
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {item.stock} {item.unit}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produk</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Harga</TableHead>
                        <TableHead className="text-right">Stok</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsData?.data.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.name}
                          </TableCell>
                          <TableCell>{item.category.name}</TableCell>
                          <TableCell className="text-right">
                            {formatRupiah(item.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                item.stock <= item.minStock
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {item.stock}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => addToCart(item)}
                              disabled={item.stock <= 0}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>

            {/* Cart */}
            <div className="space-y-4">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Keranjang
                    {cart.length > 0 && (
                      <Badge>{cart.reduce((s, c) => s + c.quantity, 0)}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cart.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Keranjang kosong
                    </p>
                  ) : (
                    <>
                      <div className="space-y-3 max-h-80 overflow-auto">
                        {cart.map((cartItem) => (
                          <div
                            key={cartItem.item.id}
                            className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {cartItem.item.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatRupiah(cartItem.item.price)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  updateCartQuantity(cartItem.item.id, -1)
                                }
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center font-medium">
                                {cartItem.quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  updateCartQuantity(cartItem.item.id, 1)
                                }
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => removeFromCart(cartItem.item.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border-t pt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Subtotal</span>
                          <span>{formatRupiah(cartTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Diskon</span>
                          <span className="text-red-600">
                            -{formatRupiah(discount)}
                          </span>
                        </div>
                        <div className="flex justify-between text-lg font-bold border-t pt-2">
                          <span>Total</span>
                          <span className="text-primary">
                            {formatRupiah(grandTotal)}
                          </span>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => setCheckoutDialogOpen(true)}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Proses Pembayaran
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Manajemen Produk</CardTitle>
              <CardDescription>
                Kelola daftar produk dan stok kantin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Produk</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsData?.data.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">
                        {item.code || "-"}
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.category.name}</TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(item.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            item.stock <= item.minStock
                              ? "text-red-600 font-medium"
                              : ""
                          }
                        >
                          {item.stock}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          / {item.minStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={item.isAvailable ? "default" : "secondary"}
                        >
                          {item.isAvailable ? "Tersedia" : "Tidak Tersedia"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Analisis Efisiensi Operasional</CardTitle>
              <CardDescription>Kecepatan perputaran stok (Turnover) dan efisiensi produk</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4 p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                <div className="h-16 w-16 rounded-full bg-white flex items-center justify-center border-4 border-indigo-200">
                   <span className="text-2xl font-black text-indigo-700">{efficiencyData?.overallEfficiency || 0}%</span>
                </div>
                <div>
                   <h3 className="font-bold text-indigo-900">Skor Efisiensi Global</h3>
                   <p className="text-sm text-indigo-700">Rata-rata kecepatan stok keluar dibandingkan ketersediaan</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-3">
                    <h4 className="text-sm font-bold flex items-center gap-2 text-emerald-700">
                       <TrendingUp className="h-4 w-4" /> Produk Paling Cepat (Fast Moving)
                    </h4>
                    <div className="space-y-2">
                       {efficiencyData?.topItems?.map((item: any) => (
                         <div key={item.id} className="p-3 border rounded-lg bg-white flex justify-between items-center">
                            <div>
                               <p className="text-sm font-medium">{item.name}</p>
                               <p className="text-[10px] text-muted-foreground">Stok: {item.stock} • Keluar: {item.turnover}</p>
                            </div>
                            <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                               {item.efficiencyScore}%
                            </Badge>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-3">
                    <h4 className="text-sm font-bold flex items-center gap-2 text-rose-700">
                       <AlertTriangle className="h-4 w-4" /> Produk Lambat (Slow Moving)
                    </h4>
                    <div className="space-y-2">
                       {efficiencyData?.lowItems?.map((item: any) => (
                         <div key={item.id} className="p-3 border rounded-lg bg-white flex justify-between items-center">
                            <div>
                               <p className="text-sm font-medium">{item.name}</p>
                               <p className="text-[10px] text-muted-foreground">Stok: {item.stock} • Keluar: {item.turnover}</p>
                            </div>
                            <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50">
                               {item.efficiencyScore}%
                            </Badge>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Transaksi</CardTitle>
              <CardDescription>Daftar transaksi kantin</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-8">
                Fitur dalam pengembangan
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Checkout Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Proses Pembayaran</DialogTitle>
            <DialogDescription>
              Total: {formatRupiah(grandTotal)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Student Search */}
            <div className="space-y-2">
              <Label>Santri (opsional)</Label>
              <Input
                placeholder="Cari santri berdasarkan nama atau NISN..."
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setSelectedStudent(null);
                }}
              />
              {studentResults &&
                studentResults.length > 0 &&
                !selectedStudent && (
                  <div className="border rounded-md max-h-32 overflow-auto">
                    {studentResults.map((student) => (
                      <button
                        key={student.id}
                        className="w-full p-2 text-left hover:bg-muted flex justify-between items-center"
                        onClick={() => {
                          setSelectedStudent(student);
                          setStudentSearch(student.name);
                          if (student.walletBalance !== undefined) {
                            setPaymentMethod("WALLET");
                          }
                        }}
                      >
                        <div>
                          <span className="font-medium">{student.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ({student.nisn})
                          </span>
                        </div>
                        {student.walletBalance !== undefined && (
                          <span className="text-sm text-green-600">
                            {formatRupiah(student.walletBalance)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              {selectedStudent && (
                <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-medium">{selectedStudent.name}</p>
                    <p className="text-sm text-muted-foreground">
                      NISN: {selectedStudent.nisn}
                    </p>
                  </div>
                  {selectedStudent.walletBalance !== undefined && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        Saldo Wallet
                      </p>
                      <p className="font-bold text-green-600">
                        {formatRupiah(selectedStudent.walletBalance)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={paymentMethod === "CASH" ? "default" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setPaymentMethod("CASH")}
                >
                  <Banknote className="h-4 w-4" />
                  Tunai
                </Button>
                <Button
                  variant={paymentMethod === "WALLET" ? "default" : "outline"}
                  className="flex items-center gap-2"
                  onClick={() => setPaymentMethod("WALLET")}
                  disabled={!selectedStudent}
                >
                  <Wallet className="h-4 w-4" />
                  Wallet
                </Button>
              </div>
              {paymentMethod === "WALLET" && selectedStudent && (
                <p
                  className={`text-sm ${
                    (selectedStudent.walletBalance || 0) < grandTotal
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {(selectedStudent.walletBalance || 0) < grandTotal
                    ? "Saldo tidak mencukupi"
                    : `Saldo cukup (${formatRupiah(selectedStudent.walletBalance || 0)})`}
                </p>
              )}
            </div>

            {/* Discount */}
            <div className="space-y-2">
              <Label>Diskon</Label>
              <Input
                type="number"
                placeholder="0"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </div>

            {/* Summary */}
            <div className="border-t pt-4 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatRupiah(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Diskon</span>
                <span>-{formatRupiah(discount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={
                createTransactionMutation.isPending ||
                (paymentMethod === "WALLET" &&
                  (!selectedStudent ||
                    (selectedStudent.walletBalance || 0) < grandTotal))
              }
            >
              {createTransactionMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShoppingCart className="h-4 w-4 mr-2" />
              )}
              Bayar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CanteenPageWithShell() {
  return (
    <MainLayout>
      <CanteenPageContent />
    </MainLayout>
  );
}
