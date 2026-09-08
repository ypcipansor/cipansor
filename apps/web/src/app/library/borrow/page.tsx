"use client";

import { useState, useMemo, Suspense } from "react";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft,
  BookOpen,
  Search,
  User,
  Calendar,
  Clock,
  Save,
  Loader2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  useBooks,
  useCreateBorrow,
  BOOK_CATEGORIES,
  Book,
  BookCategory,
} from "@/hooks/use-library";
import { useStudents, Student } from "@/hooks/use-students";
import { cn } from "@/lib/utils";
import { MainLayout } from "@/components/layout";

const borrowSchema = z.object({
  bookId: z.string().min(1, "Pilih buku yang akan dipinjam"),
  studentId: z.string().min(1, "Pilih peminjam"),
  borrowDate: z.string().min(1, "Tanggal pinjam wajib diisi"),
  dueDate: z.string().min(1, "Tanggal jatuh tempo wajib diisi"),
  notes: z.string().optional(),
});

type BorrowFormData = z.infer<typeof borrowSchema>;

function getCategoryLabel(category: BookCategory) {
  // Use a type guard or safe access if BOOK_CATEGORIES is typed
  const cat = BOOK_CATEGORIES.find((c) => c.value === (category as any));
  return cat?.label || category;
}

function BorrowBookContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedBookId = searchParams.get("bookId");

  const [bookSearchOpen, setBookSearchOpen] = useState(false);
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);
  const [bookSearch, setBookSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const { data: booksData } = useBooks({
    limit: 100,
    search: bookSearch || undefined,
  });
  const { data: studentsData } = useStudents({
    limit: 100,
    search: studentSearch || undefined,
  });
  const createBorrowMutation = useCreateBorrow();

  const availableBooks = useMemo(() => {
    return booksData?.data.filter((book) => (book as any).available > 0) || [];
  }, [booksData]);

  const form = useForm<BorrowFormData>({
    resolver: zodResolver(borrowSchema),
    defaultValues: {
      bookId: preselectedBookId || "",
      studentId: "",
      borrowDate: safeFormat(new Date(), "yyyy-MM-dd"),
      dueDate: format(addDays(new Date(), 14), "yyyy-MM-dd"), // Default 14 days loan
      notes: "",
    },
  });

  const selectedBookId = form.watch("bookId");
  const selectedStudentId = form.watch("studentId");

  const selectedBook = useMemo(() => {
    return booksData?.data.find((b) => b.id === selectedBookId);
  }, [booksData, selectedBookId]);

  const selectedStudent = useMemo(() => {
    return studentsData?.data?.find((s: Student) => s.id === selectedStudentId);
  }, [studentsData, selectedStudentId]);

  const onSubmit = async (data: BorrowFormData) => {
    try {
      await createBorrowMutation.mutateAsync({
        bookId: data.bookId,
        studentId: data.studentId,
        borrowerType: "STUDENT",
        dueDate: data.dueDate,
        notes: data.notes || undefined,
      });
      toast.success("Peminjaman berhasil dicatat");
      router.push("/library");
    } catch {
      toast.error("Gagal mencatat peminjaman");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/library">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pinjam Buku</h1>
          <p className="text-muted-foreground">
            Catat peminjaman buku oleh siswa
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Book Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Pilih Buku
                  </CardTitle>
                  <CardDescription>
                    Cari dan pilih buku yang akan dipinjam
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="bookId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Buku *</FormLabel>
                        <Popover
                          open={bookSearchOpen}
                          onOpenChange={setBookSearchOpen}
                        >
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !field.value && "text-muted-foreground",
                                )}
                              >
                                {selectedBook ? (
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="truncate">
                                      {selectedBook.title}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="shrink-0"
                                    >
                                      {(selectedBook as any).available} tersedia
                                    </Badge>
                                  </div>
                                ) : (
                                  "Cari buku..."
                                )}
                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Cari judul atau penulis..."
                                value={bookSearch}
                                onValueChange={setBookSearch}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  Buku tidak ditemukan
                                </CommandEmpty>
                                <CommandGroup>
                                  {availableBooks.map((book) => (
                                    <CommandItem
                                      key={book.id}
                                      value={book.id}
                                      onSelect={() => {
                                        form.setValue("bookId", book.id);
                                        setBookSearchOpen(false);
                                      }}
                                    >
                                      <div className="flex flex-col flex-1">
                                        <span className="font-medium">
                                          {book.title}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                          {book.author} ·{" "}
                                          {
                                            getCategoryLabel(
                                              book.category,
                                            ) as React.ReactNode
                                          }
                                        </span>
                                      </div>
                                      <Badge variant="outline">
                                        {(book as any).available} tersedia
                                      </Badge>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedBook && (
                    <div className="mt-4 p-4 rounded-lg bg-muted">
                      <div className="flex gap-4">
                        <div className="h-20 w-14 flex items-center justify-center rounded bg-background">
                          <BookOpen className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">{selectedBook.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedBook.author}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">
                              {
                                getCategoryLabel(
                                  selectedBook.category,
                                ) as React.ReactNode
                              }
                            </Badge>
                            {selectedBook.isbn && (
                              <Badge variant="secondary">
                                ISBN: {selectedBook.isbn}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Student Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Pilih Peminjam
                  </CardTitle>
                  <CardDescription>
                    Cari dan pilih siswa yang meminjam
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="studentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Siswa *</FormLabel>
                        <Popover
                          open={studentSearchOpen}
                          onOpenChange={setStudentSearchOpen}
                        >
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !field.value && "text-muted-foreground",
                                )}
                              >
                                {selectedStudent ? (
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="truncate">
                                      {selectedStudent.name}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="shrink-0"
                                    >
                                      {selectedStudent.nisn}
                                    </Badge>
                                  </div>
                                ) : (
                                  "Cari siswa..."
                                )}
                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Cari nama atau NISN..."
                                value={studentSearch}
                                onValueChange={setStudentSearch}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  Siswa tidak ditemukan
                                </CommandEmpty>
                                <CommandGroup>
                                  {studentsData?.data?.map(
                                    (student: Student) => (
                                      <CommandItem
                                        key={student.id}
                                        value={student.id}
                                        onSelect={() => {
                                          form.setValue(
                                            "studentId",
                                            student.id,
                                          );
                                          setStudentSearchOpen(false);
                                        }}
                                      >
                                        <div className="flex flex-col flex-1">
                                          <span className="font-medium">
                                            {student.name}
                                          </span>
                                          <span className="text-sm text-muted-foreground">
                                            NISN: {student.nisn} ·{" "}
                                            {student.currentClass?.name ||
                                              "Tanpa Kelas"}
                                          </span>
                                        </div>
                                      </CommandItem>
                                    ),
                                  )}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedStudent && (
                    <div className="mt-4 p-4 rounded-lg bg-muted">
                      <div className="flex gap-4">
                        <div className="h-12 w-12 flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                          {selectedStudent.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">
                            {selectedStudent.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            NISN: {selectedStudent.nisn} ·{" "}
                            {selectedStudent.currentClass?.name ||
                              "Tanpa Kelas"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle>Catatan</CardTitle>
                  <CardDescription>
                    Tambahkan catatan untuk peminjaman ini (opsional)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            placeholder="Catatan tambahan..."
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Date Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Tanggal Peminjaman
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="borrowDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Pinjam *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Jatuh Tempo *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription>
                          Batas waktu pengembalian buku
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Quick Duration Buttons */}
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Durasi cepat:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[7, 14, 21, 30].map((days) => (
                        <Button
                          key={days}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const borrowDate = form.getValues("borrowDate");
                            const newDueDate = format(
                              addDays(new Date(borrowDate), days),
                              "yyyy-MM-dd",
                            );
                            form.setValue("dueDate", newDueDate);
                          }}
                        >
                          {days} hari
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Ringkasan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Buku:</span>
                      <span className="font-medium text-right truncate max-w-[150px]">
                        {selectedBook?.title || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Peminjam:</span>
                      <span className="font-medium">
                        {selectedStudent?.name || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Tanggal Pinjam:
                      </span>
                      <span className="font-medium">
                        {form.watch("borrowDate")
                          ? format(
                              new Date(form.watch("borrowDate")),
                              "dd MMM yyyy",
                              { locale: localeId },
                            )
                          : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Jatuh Tempo:
                      </span>
                      <span className="font-medium">
                        {form.watch("dueDate")
                          ? format(
                              new Date(form.watch("dueDate")),
                              "dd MMM yyyy",
                              { locale: localeId },
                            )
                          : "-"}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      createBorrowMutation.isPending ||
                      !selectedBook ||
                      !selectedStudent
                    }
                  >
                    {createBorrowMutation.isPending ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Simpan Peminjaman
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

function BorrowBookPageContent() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BorrowBookContent />
    </Suspense>
  );
}

export default function BorrowBookPage() {
  return (
    <MainLayout>
      <BorrowBookPageContent />
    </MainLayout>
  );
}
