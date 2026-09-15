"use client";
import { useEffect, useMemo, useState } from "react";
import { authFileUrl, resolveFileUrl } from "@/lib/files";
import { safeFormat } from "@/lib/date";
import {
  useEmployeeDocuments,
  useCreateEmployeeDocument,
  useDeleteEmployeeDocument,
  EmployeeDocumentType,
} from "@/hooks/use-employee-documents";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, FileText, Upload } from "lucide-react";

import api from "@/lib/api";

const DOCUMENT_TYPES: EmployeeDocumentType[] = [
  "KTP",
  "KK",
  "NPWP",
  "IJAZAH",
  "TRANSKRIP_NILAI",
  "SERTIFIKAT",
  "SK_PENGANGKATAN",
  "KONTRAK_KERJA",
  "CV",
  "LAINNYA",
];

export function DocumentsTab({ userId }: { userId: string }) {
  const { data: documents, isLoading } = useEmployeeDocuments(userId);
  const createDocument = useCreateEmployeeDocument();
  const deleteDocument = useDeleteEmployeeDocument();
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Persisted upload references stay stable (no expiring SAS) while Azure
  // private blobs need a fresh SAS to render. Resolve private blob URLs on
  // demand so a document uploaded to Azure can be opened from this list.
  const [resolvedFiles, setResolvedFiles] = useState<Record<string, string>>(
    {},
  );

  const documentUrls = useMemo(() => {
    return (documents ?? [])
      .map((d) => d.fileUrl)
      .filter(
        (u): u is string => !!u && /\.blob\.core\.windows\.net\//.test(u),
      );
  }, [documents]);

  useEffect(() => {
    if (documentUrls.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        documentUrls.map(async (u) => [u, await resolveFileUrl(u)] as const),
      );
      if (cancelled) return;
      setResolvedFiles((prev) => {
        const next = { ...prev };
        for (const [k, v] of entries) next[k] = v;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [documentUrls]);

  /** Prefer the on-demand SAS when a stable reference was resolved. */
  const displayable = (u?: string | null): string => {
    if (!u) return "";
    return resolvedFiles[u] || authFileUrl(u);
  };

  const [formData, setFormData] = useState({
    name: "",
    type: "LAINNYA" as EmployeeDocumentType,
    expiryDate: "",
    file: null as File | null,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, file: e.target.files[0] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) return;

    try {
      setUploading(true);
      // 1. Upload File
      const uploadFormData = new FormData();
      uploadFormData.append("file", formData.file);

      const uploadRes = await api.post("/upload", uploadFormData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Handle response structure { success: true, data: { url: ... } }
      const fileUrl = uploadRes.data.data.url;

      // 2. Create Record
      await createDocument.mutateAsync({
        userId,
        name: formData.name,
        type: formData.type,
        fileUrl,
        expiryDate: formData.expiryDate
          ? new Date(formData.expiryDate).toISOString()
          : undefined,
      });

      setIsOpen(false);
      setFormData({ name: "", type: "LAINNYA", expiryDate: "", file: null });
    } catch (error) {
      console.error("Upload failed", error);
      alert("Upload failed. Check console for details.");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Dokumen Kepegawaian</h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="w-4 h-4 mr-2" /> Upload Dokumen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Dokumen</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nama Dokumen</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Contoh: Ijazah S1"
                  required
                />
              </div>
              <div>
                <Label>Jenis Dokumen</Label>
                <Select
                  value={formData.type}
                  onValueChange={(val) =>
                    setFormData({
                      ...formData,
                      type: val as EmployeeDocumentType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tanggal Kadaluarsa (Opsional)</Label>
                <Input
                  type="date"
                  value={formData.expiryDate}
                  onChange={(e) =>
                    setFormData({ ...formData, expiryDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>File</Label>
                <Input type="file" onChange={handleFileChange} required />
              </div>
              <Button type="submit" disabled={uploading} className="w-full">
                {uploading ? "Mengunggah..." : "Simpan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Kadaluarsa</TableHead>
              <TableHead>Tanggal Upload</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-4 text-muted-foreground"
                >
                  Tidak ada dokumen
                </TableCell>
              </TableRow>
            )}
            {documents?.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  <a
                    href={displayable(doc.fileUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center hover:underline text-blue-600"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {doc.name}
                  </a>
                </TableCell>
                <TableCell>{doc.type}</TableCell>
                <TableCell>
                  {doc.expiryDate
                    ? safeFormat(new Date(doc.expiryDate), "dd MMM yyyy")
                    : "-"}
                </TableCell>
                <TableCell>
                  {safeFormat(new Date(doc.createdAt), "dd MMM yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm("Hapus dokumen ini?"))
                        deleteDocument.mutate(doc.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
