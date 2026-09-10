"use client";

import { use } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  Edit,
  Trash2,
  BookOpen,
  Clock,
  MapPin,
  RotateCcw,
  AlertTriangle,
  User,
  Calendar,
  Hash,
  Building,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useBook,
  useBorrows,
  useDeleteBook,
  useReturnBook,
  useMarkLost,
  BOOK_CATEGORIES,
  BORROW_STATUSES,
  BookCategory,
  BorrowStatus,
} from "@/hooks/use-library";

function getCategoryLabel(category: BookCategory) {
  return (
    BOOK_CATEGORIES.find((c) => c.value === (category as any))?.label ||
    category
  );
}

function getStatusBadge(status: BorrowStatus) {
  const statusInfo = BORROW_STATUSES.find((s) => s.value === status);
  return (
    <Badge variant="outline" className={statusInfo?.color}>
      {statusInfo?.label || status}
    </Badge>
  );
}

function BookDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: book, isLoading } = useBook(id);
  const { data: borrowsData } = useBorrows({ bookId: id, limit: 50 });
  const deleteBookMutation = useDeleteBook();
  const returnMutation = useReturnBook();
  const markLostMutation = useMarkLost();

  const handleDelete = async () => {
    try {
      await deleteBookMutation.mutateAsync(id);
      toast.success("Buku berhasil dihapus");
      router.push("/library");
    } catch {
      toast.error("Gagal menghapus buku");
    }
  };

  const handleReturn = async (borrowId: string) => {
    try {
      await returnMutation.mutateAsync({
        id: borrowId,
        data: {
          notes: "Returned via system",
        },
      });
      toast.success("Buku berhasil dikembalikan");
    } catch {
      toast.error("Gagal mengembalikan buku");
    }
  };

  const handleMarkLost = async (borrowId: string) => {
    try {
      await markLostMutation.mutateAsync(borrowId);
      toast.success("Buku ditandai sebagai hilang");
    } catch {
      toast.error("Gagal menandai buku sebagai hilang");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BookOpen className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Buku tidak ditemukan</p>
        <Button asChild className="mt-4">
          <Link href="/library">Kembali ke Perpustakaan</Link>
        </Button>
      </div>
    );
  }

  const activeBorrows =
    borrowsData?.data.filter(
      (b) => b.status === "ACTIVE" || b.status === "OVERDUE",
    ) || [];
  const historyBorrows =
    borrowsData?.data.filter(
      (b) => b.status === "RETURNED" || b.status === "LOST",
    ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/library">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{book.title}</h1>
          <p className="text-muted-foreground">{book.author}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/library/books/${id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <ConfirmDialog
            title="Hapus Buku"
            description={`Apakah Anda yakin ingin menghapus buku "${book.title}"? Tindakan ini tidak dapat dibatalkan.`}
            onConfirm={handleDelete}
            loading={deleteBookMutation.isPending}
          >
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Hapus
            </Button>
          </ConfirmDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Book Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Buku</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {book.coverUrl ? (
                <div className="aspect-3/4 w-full overflow-hidden rounded-lg bg-muted">
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-3/4 w-full flex items-center justify-center rounded-lg bg-muted">
                  <BookOpen className="h-16 w-16 text-muted-foreground" />
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge>
                    {getCategoryLabel(book.category) as React.ReactNode}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Penulis:</span>
                    <span className="font-medium">{book.author}</span>
                  </div>

                  {book.isbn && (
                    <div className="flex items-center gap-2 text-sm">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">ISBN:</span>
                      <span className="font-medium">{book.isbn}</span>
                    </div>
                  )}

                  {book.publisher && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Penerbit:</span>
                      <span className="font-medium">{book.publisher}</span>
                    </div>
                  )}

                  {book.publishYear && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Tahun:</span>
                      <span className="font-medium">{book.publishYear}</span>
                    </div>
                  )}

                  {((book as any).location || book.shelfLocation) && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Lokasi:</span>
                      <span className="font-medium">
                        {(book as any).location || book.shelfLocation}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stock Info */}
          <Card>
            <CardHeader>
              <CardTitle>Stok</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-3xl font-bold">{book.quantity}</p>
                  <p className="text-sm text-muted-foreground">
                    Total Eksemplar
                  </p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p
                    className={`text-3xl font-bold ${(book as any).available > 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {(book as any).available}
                  </p>
                  <p className="text-sm text-muted-foreground">Tersedia</p>
                </div>
              </div>
              <div className="mt-4">
                <Button
                  asChild
                  className="w-full"
                  disabled={(book as any).available === 0}
                >
                  <Link href={`/library/borrow?bookId=${id}`}>
                    <Clock className="mr-2 h-4 w-4" />
                    {(book as any).available > 0
                      ? "Pinjamkan Buku Ini"
                      : "Stok Habis"}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Borrows */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Peminjaman</CardTitle>
              <CardDescription>Riwayat peminjaman buku ini</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="active">
                <TabsList>
                  <TabsTrigger value="active">
                    Aktif ({activeBorrows.length})
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    Riwayat ({historyBorrows.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-4">
                  {activeBorrows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Clock className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-4 text-muted-foreground">
                        Tidak ada peminjaman aktif
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Peminjam</TableHead>
                          <TableHead>Tanggal Pinjam</TableHead>
                          <TableHead>Jatuh Tempo</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeBorrows.map((borrow) => (
                          <TableRow key={borrow.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {borrow.student?.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {borrow.student?.nisn} -{" "}
                                  {borrow.student?.class?.name}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {format(
                                new Date(borrow.borrowedAt),
                                "dd MMM yyyy",
                                { locale: localeId },
                              )}
                            </TableCell>
                            <TableCell>
                              {safeFormat(
                                new Date(borrow.dueDate),
                                "dd MMM yyyy",
                                {
                                  locale: localeId,
                                },
                              )}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(borrow.status)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReturn(borrow.id)}
                                  disabled={returnMutation.isPending}
                                >
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                  Kembalikan
                                </Button>
                                <ConfirmDialog
                                  title="Tandai Hilang"
                                  description="Apakah Anda yakin ingin menandai buku ini sebagai hilang?"
                                  onConfirm={() => handleMarkLost(borrow.id)}
                                  loading={markLostMutation.isPending}
                                >
                                  <Button variant="destructive" size="sm">
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    Hilang
                                  </Button>
                                </ConfirmDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {historyBorrows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <BookOpen className="h-12 w-12 text-muted-foreground" />
                      <p className="mt-4 text-muted-foreground">
                        Belum ada riwayat peminjaman
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Peminjam</TableHead>
                          <TableHead>Tanggal Pinjam</TableHead>
                          <TableHead>Tanggal Kembali</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyBorrows.map((borrow) => (
                          <TableRow key={borrow.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {borrow.student?.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {borrow.student?.nisn}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {format(
                                new Date(borrow.borrowedAt),
                                "dd MMM yyyy",
                                { locale: localeId },
                              )}
                            </TableCell>
                            <TableCell>
                              {borrow.returnedAt
                                ? format(
                                    new Date(borrow.returnedAt),
                                    "dd MMM yyyy",
                                    { locale: localeId },
                                  )
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(borrow.status)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Description */}
          {book.description && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Deskripsi</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {book.description}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BookDetailPage(props: Parameters<typeof BookDetailPageContent>[0]) {
  return (
    <MainLayout>
      <BookDetailPageContent {...props} />
    </MainLayout>
  );
}
