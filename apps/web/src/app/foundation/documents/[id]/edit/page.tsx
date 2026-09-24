"use client";

import { use, useEffect, useState } from "react";
import { useResolvedFileUrl } from "@/hooks/use-resolved-file-url";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  useFoundationDocument,
  useUpdateFoundationDocument,
  DOCUMENT_TYPE_LABELS,
} from "@/hooks";

const documentTypes = Object.entries(DOCUMENT_TYPE_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

const formSchema = z.object({
  name: z.string().min(1, "Nama dokumen wajib diisi"),
  type: z.string().min(1, "Jenis dokumen wajib dipilih"),
  description: z.string().optional(),
  documentNumber: z.string().optional(),
  issuedDate: z.string().optional(),
  expiryDate: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PageProps {
  params: Promise<{ id: string }>;
}

function EditDocumentPageContent({ params }: PageProps) {
  const { id: documentId } = use(params);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);

  const { data: document, isLoading } = useFoundationDocument(documentId);
  // The stored file is a private upload; resolve (and keep fresh) its link.
  const resolvedDocumentUrl = useResolvedFileUrl(document?.fileUrl);
  const updateDocument = useUpdateFoundationDocument();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "",
      description: "",
      documentNumber: "",
      issuedDate: "",
      expiryDate: "",
    },
  });

  useEffect(() => {
    if (document) {
      form.reset({
        name: document.name,
        type: document.type,
        description: document.description || "",
        documentNumber: document.documentNumber || "",
        issuedDate: document.issuedDate
          ? new Date(document.issuedDate).toISOString().split("T")[0]
          : "",
        expiryDate: document.expiryDate
          ? new Date(document.expiryDate).toISOString().split("T")[0]
          : "",
      });
    }
  }, [document, form]);

  const onSubmit = async (data: FormData) => {
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("type", data.type);
      if (data.description) formData.append("description", data.description);
      if (data.documentNumber)
        formData.append("documentNumber", data.documentNumber);
      if (data.issuedDate) formData.append("issuedDate", data.issuedDate);
      if (data.expiryDate) formData.append("expiryDate", data.expiryDate);
      if (file) formData.append("file", file);

      await updateDocument.mutateAsync({ id: documentId, data: formData });
      toast.success("Dokumen berhasil diperbarui");
      router.push("/foundation?tab=documents");
    } catch {
      toast.error("Gagal memperbarui dokumen");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Dokumen tidak ditemukan</h2>
        <Button className="mt-4" onClick={() => router.back()}>
          Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Dokumen</h1>
          <p className="text-muted-foreground">{document.name}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Document Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informasi Dokumen</CardTitle>
                <CardDescription>Detail dokumen yayasan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Dokumen</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Akta Pendirian Yayasan"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jenis Dokumen</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih jenis dokumen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {documentTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                  name="documentNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Dokumen</FormLabel>
                      <FormControl>
                        <Input placeholder="001/NOT/2024" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deskripsi</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Deskripsi dokumen..."
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

            {/* Dates & File */}
            <Card>
              <CardHeader>
                <CardTitle>Tanggal & File</CardTitle>
                <CardDescription>Masa berlaku dan file dokumen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="issuedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Terbit</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Kadaluarsa</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription>
                          Kosongkan jika permanen
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Current File */}
                {document.fileUrl && !file && (
                  <div className="space-y-2">
                    <FormLabel>File Saat Ini</FormLabel>
                    <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {document.fileUrl.split("/").pop()}
                        </p>
                        <a
                          href={resolvedDocumentUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Lihat file
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload New File */}
                <div className="space-y-2">
                  <FormLabel>
                    {file ? "File Baru" : "Ganti File (Opsional)"}
                  </FormLabel>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    {file ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFile(null)}
                        >
                          Batalkan
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          Klik untuk upload file baru
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, JPG, PNG (Max 10MB)
                        </p>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const selectedFile = e.target.files?.[0];
                            if (selectedFile) {
                              if (selectedFile.size > 10 * 1024 * 1024) {
                                toast.error("Ukuran file maksimal 10MB");
                                return;
                              }
                              setFile(selectedFile);
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              Batal
            </Button>
            <Button type="submit" disabled={updateDocument.isPending}>
              {updateDocument.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function EditDocumentPage(
  props: Parameters<typeof EditDocumentPageContent>[0],
) {
  return (
    <MainLayout>
      <EditDocumentPageContent {...props} />
    </MainLayout>
  );
}
