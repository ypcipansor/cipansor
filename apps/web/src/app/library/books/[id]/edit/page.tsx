"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout";
import {
  useBook,
  useUpdateBook,
  BOOK_CATEGORIES,
  BookCategory,
} from "@/hooks/use-library";

const bookSchema = z.object({
  title: z.string().min(1, "Judul buku wajib diisi"),
  author: z.string().min(1, "Nama penulis wajib diisi"),
  isbn: z.string().optional(),
  publisher: z.string().optional(),
  publishYear: z.coerce
    .number()
    .min(1900)
    .max(new Date().getFullYear())
    .optional()
    .or(z.literal("")),
  category: z.enum(
    [
      "ISLAMIC",
      "ACADEMIC",
      "FICTION",
      "NON_FICTION",
      "REFERENCE",
      "OTHER",
    ] as const,
    {
      error: "Kategori wajib dipilih",
    },
  ),
  description: z.string().optional(),
  quantity: z.coerce.number().min(1, "Minimal 1 eksemplar"),
  location: z.string().optional(),
});

type BookFormData = z.infer<typeof bookSchema>;

function EditBookPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: book, isLoading } = useBook(id);
  const updateMutation = useUpdateBook();

  const form = useForm<BookFormData>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      title: "",
      author: "",
      isbn: "",
      publisher: "",
      publishYear: "",
      category: undefined,
      description: "",
      quantity: 1,
      location: "",
    },
  });

  useEffect(() => {
    if (book) {
      form.reset({
        title: book.title,
        author: book.author,
        isbn: book.isbn || "",
        publisher: book.publisher || "",
        publishYear: book.publishYear || "",
        category: (book.category as any) || "OTHER",
        description: book.description || "",
        quantity: book.quantity,
        location: (book as any).location || (book as any).shelfLocation || "",
      });
    }
  }, [book, form]);

  const onSubmit = async (data: BookFormData) => {
    try {
      const payload = {
        title: data.title,
        author: data.author,
        isbn: data.isbn || undefined,
        publisher: data.publisher || undefined,
        publishYear: data.publishYear ? Number(data.publishYear) : undefined,
        category: data.category as any,
        description: data.description || undefined,
        quantity: data.quantity,
        location: data.location || undefined,
      };

      await updateMutation.mutateAsync({ id, data: payload });
      toast.success("Buku berhasil diperbarui");
      router.push(`/library/books/${id}`);
    } catch {
      toast.error("Gagal memperbarui buku");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/library/books/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Buku</h1>
          <p className="text-muted-foreground">{book.title}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Info */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Informasi Buku</CardTitle>
                <CardDescription>Edit detail informasi buku</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Judul Buku *</FormLabel>
                      <FormControl>
                        <Input placeholder="Masukkan judul buku" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="author"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Penulis *</FormLabel>
                        <FormControl>
                          <Input placeholder="Nama penulis" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isbn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ISBN</FormLabel>
                        <FormControl>
                          <Input placeholder="978-xxx-xxx-xxx-x" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="publisher"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Penerbit</FormLabel>
                        <FormControl>
                          <Input placeholder="Nama penerbit" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="publishYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tahun Terbit</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="2024"
                            min={1900}
                            max={new Date().getFullYear()}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deskripsi</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Deskripsi singkat tentang buku..."
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Side Info */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Kategori & Stok</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kategori *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih kategori" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BOOK_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jumlah Eksemplar *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormDescription>
                            Tersedia: {(book as any).available} dari{" "}
                          {book.quantity}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lokasi Rak</FormLabel>
                        <FormControl>
                          <Input placeholder="A1-01" {...field} />
                        </FormControl>
                        <FormDescription>
                          Lokasi penyimpanan buku
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center text-center">
                    {book.coverUrl ? (
                      <div className="h-32 w-24 overflow-hidden rounded-lg bg-muted mb-4">
                        <img
                          src={book.coverUrl}
                          alt={book.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-32 w-24 flex items-center justify-center rounded-lg bg-muted mb-4">
                        <BookOpen className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    <p className="font-semibold">
                      {form.watch("title") || "Judul Buku"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {form.watch("author") || "Nama Penulis"}
                    </p>
                    {form.watch("category") && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {
                          BOOK_CATEGORIES.find(
                            (c) => c.value === form.watch("category"),
                          )?.label
                        }
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href={`/library/books/${id}`}>Batal</Link>
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Simpan Perubahan
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function EditBookPage(props: Parameters<typeof EditBookPageContent>[0]) {
  return (
    <MainLayout>
      <EditBookPageContent {...props} />
    </MainLayout>
  );
}
