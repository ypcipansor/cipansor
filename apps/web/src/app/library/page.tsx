"use client";
import { MainLayout } from "@/components/layout";

import { useState } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  Plus,
  Search,
  BookOpen,
  Eye,
  Edit,
  Trash2,
  Filter,
  Clock,
  RotateCcw,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/shared/pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import {
  useBooks,
  useBookCategories,
  useBorrows,
  useDeleteBook,
  useReturnBook,
  useLibrarySummary,
  BORROW_STATUSES,
  BookCategory,
  BorrowStatus,
  BookStatus,
} from "@/hooks/use-library";
import { useAuthStore } from "@/stores/auth";

function getStatusBadge(status: BorrowStatus) {
  const statusInfo = BORROW_STATUSES.find((s) => s.value === status);
  return (
    <Badge variant="outline" className={statusInfo?.color}>
      {statusInfo?.label || status}
    </Badge>
  );
}

function LibraryPageContent() {
  const [activeTab, setActiveTab] = useState<"books" | "borrows">("books");
  const [booksPage, setBooksPage] = useState(1);
  const [borrowsPage, setBorrowsPage] = useState(1);
  const [bookSearch, setBookSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const user = useAuthStore((state) => state.user);
  const unitId = user?.unitId;

  const { data: categories } = useBookCategories(unitId || undefined);

  const { data: booksData, isLoading: booksLoading } = useBooks({
    page: booksPage,
    limit: 10,
    search: bookSearch || undefined,
    categoryId: categoryFilter !== "ALL" ? categoryFilter : undefined,
    unitId: unitId || undefined,
  });

  const { data: borrowsData, isLoading: borrowsLoading } = useBorrows({
    page: borrowsPage,
    limit: 10,
    status: statusFilter !== "ALL" ? (statusFilter as BorrowStatus) : undefined,
  });

  const { data: summaryData } = useLibrarySummary(unitId || undefined);
  const deleteBookMutation = useDeleteBook();
  const returnMutation = useReturnBook();

  const handleDeleteBook = async (id: string) => {
    try {
      await deleteBookMutation.mutateAsync(id);
      toast.success("Buku berhasil dihapus");
    } catch {
      toast.error("Gagal menghapus buku");
    }
  };

  const handleReturn = async (id: string) => {
    try {
      await returnMutation.mutateAsync({
        id,
        data: {
          notes: "Dikembalikan via Dashboard",
        },
      });
      toast.success("Buku berhasil dikembalikan");
    } catch {
      toast.error("Gagal mengembalikan buku");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Perpustakaan</h1>
          <p className="text-muted-foreground">
            Kelola koleksi buku dan peminjaman
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/library/borrow">
              <Clock className="mr-2 h-4 w-4" />
              Pinjam Buku
            </Link>
          </Button>
          <Button asChild>
            <Link href="/library/books/new">
              <Plus className="mr-2 h-4 w-4" />
              Tambah Buku
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Buku</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryData?.totalTitles || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {summaryData?.totalBooks || 0} eksemplar
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipinjam</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {summaryData?.activeBorrowings || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terlambat</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summaryData?.overdueBorrowings || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryData?.totalCategories || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "books" | "borrows")}
      >
        <TabsList>
          <TabsTrigger value="books">Koleksi Buku</TabsTrigger>
          <TabsTrigger value="borrows">Peminjaman</TabsTrigger>
        </TabsList>

        {/* Books Tab */}
        <TabsContent value="books" className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari judul/penulis..."
                className="pl-10"
                value={bookSearch}
                onChange={(e) => setBookSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Kategori</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {booksLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : booksData?.data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">
                    Belum ada koleksi buku
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/library/books/new">Tambah Buku Baru</Link>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Judul</TableHead>
                      <TableHead>Penulis</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Tersedia</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {booksData?.data.map((book) => (
                      <TableRow key={book.id}>
                        <TableCell className="font-medium">
                          {book.title}
                        </TableCell>
                        <TableCell>{book.author}</TableCell>
                        <TableCell>{book.category?.name || "-"}</TableCell>
                        <TableCell>{book.quantity}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              book.available > 0 ? "default" : "secondary"
                            }
                          >
                            {book.available}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/library/books/${book.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/library/books/${book.id}/edit`}>
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <ConfirmDialog
                              title="Hapus Buku"
                              description="Apakah Anda yakin ingin menghapus buku ini?"
                              onConfirm={() => handleDeleteBook(book.id)}
                              loading={deleteBookMutation.isPending}
                            >
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </ConfirmDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {booksData && booksData.meta.totalPages > 1 && (
            <Pagination
              page={booksPage}
              totalPages={booksData.meta.totalPages}
              pageSize={booksData.meta.limit}
              total={booksData.meta.total}
              onPageChange={setBooksPage}
            />
          )}
        </TabsContent>

        {/* Borrows Tab */}
        <TabsContent value="borrows" className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                {BORROW_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {borrowsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : borrowsData?.data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">
                    Belum ada peminjaman
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal Pinjam</TableHead>
                      <TableHead>Buku</TableHead>
                      <TableHead>Peminjam</TableHead>
                      <TableHead>Jatuh Tempo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {borrowsData?.data.map((borrow) => (
                      <TableRow key={borrow.id}>
                        <TableCell>
                          {borrow.borrowedAt
                            ? format(
                                new Date(borrow.borrowedAt),
                                "dd MMM yyyy",
                                { locale: localeId },
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {borrow.book?.title}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{borrow.student?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {borrow.student?.nisn}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {safeFormat(new Date(borrow.dueDate), "dd MMM yyyy", {
                            locale: localeId,
                          })}
                        </TableCell>
                        <TableCell>{getStatusBadge(borrow.status)}</TableCell>
                        <TableCell className="text-right">
                          {borrow.status === "ACTIVE" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReturn(borrow.id)}
                              disabled={returnMutation.isPending}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Kembalikan
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {borrowsData && borrowsData.meta.totalPages > 1 && (
            <Pagination
              page={borrowsPage}
              totalPages={borrowsData.meta.totalPages}
              pageSize={borrowsData.meta.limit}
              total={borrowsData.meta.total}
              onPageChange={setBorrowsPage}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function LibraryPageWithShell() {
  return (
    <MainLayout>
      <LibraryPageContent />
    </MainLayout>
  );
}
