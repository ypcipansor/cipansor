"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Search } from "lucide-react";
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
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  usePermit,
  useUpdatePermit,
  PERMIT_TYPES,
  PermitType,
} from "@/hooks/use-permits";
import { useStudents } from "@/hooks/use-students";

import { MainLayout } from "@/components/layout";
const formSchema = z.object({
  studentId: z.string().min(1, "Santri wajib dipilih"),
  permitType: z.string().min(1, "Jenis izin wajib dipilih"),
  reason: z.string().min(10, "Alasan minimal 10 karakter"),
  startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
  endDate: z.string().min(1, "Tanggal selesai wajib diisi"),
  parentPhone: z.string().optional(),
  destination: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

function EditPermitPageContent() {
  const params = useParams();
  const router = useRouter();
  const permitId = params.id as string;

  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    name: string;
    nisn?: string;
  } | null>(null);

  // Track if form has been initialized
  const formInitializedRef = useRef(false);

  const { data: permit, isLoading: permitLoading } = usePermit(permitId);
  const updateMutation = useUpdatePermit();

  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    search: search || undefined,
    limit: 10,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      studentId: "",
      permitType: "",
      reason: "",
      startDate: "",
      endDate: "",
      parentPhone: "",
      destination: "",
    },
  });

  useEffect(() => {
    if (!permit || formInitializedRef.current) return;

    // Check if permit is not pending
    if (permit.status !== "PENDING") {
      toast.error("Hanya izin dengan status PENDING yang dapat diedit");
      router.push(`/permits/${permitId}`);
      return;
    }

    formInitializedRef.current = true;

    form.reset({
      studentId: permit.studentId,
      permitType: permit.permitType,
      reason: permit.reason,
      startDate: permit.startDate.split("T")[0],
      endDate: permit.endDate.split("T")[0],
      parentPhone: permit.parentPhone || "",
      destination: permit.destination || "",
    });

    if (permit.student) {
      setSelectedStudent({
        id: permit.student.id,
        name: permit.student.name,
        nisn: permit.student.nisn,
      });
    }

    // We explicitly only want to run this effect when permit loads for the first time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permit]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        id: permitId,
        data: {
          ...data,
          permitType: data.permitType as PermitType,
          parentPhone: data.parentPhone || undefined,
          destination: data.destination || undefined,
        },
      });
      toast.success("Izin berhasil diperbarui");
      router.push(`/permits/${permitId}`);
    } catch {
      toast.error("Gagal memperbarui izin");
    }
  };

  const handleSelectStudent = (student: {
    id: string;
    name: string;
    nisn?: string;
  }) => {
    setSelectedStudent(student);
    form.setValue("studentId", student.id);
    setSearch("");
  };

  if (permitLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Izin tidak ditemukan</p>
        <Button asChild className="mt-4">
          <Link href="/permits">Kembali ke Daftar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/permits/${permitId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Izin</h1>
          <p className="text-muted-foreground">
            Perbarui data perizinan santri
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Student Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Pilih Santri</CardTitle>
                <CardDescription>
                  Cari dan pilih santri yang mengajukan izin
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedStudent ? (
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">{selectedStudent.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedStudent.nisn}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedStudent(null);
                        form.setValue("studentId", "");
                      }}
                    >
                      Ganti
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Cari nama/NISN santri..."
                        className="pl-10"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>

                    {search && (
                      <div className="max-h-[300px] overflow-auto rounded-md border">
                        {studentsLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          </div>
                        ) : studentsData?.data.length === 0 ? (
                          <div className="py-4 text-center text-muted-foreground">
                            Tidak ada santri ditemukan
                          </div>
                        ) : (
                          <Table>
                            <TableBody>
                              {studentsData?.data.map((student) => (
                                <TableRow
                                  key={student.id}
                                  className="cursor-pointer"
                                  onClick={() =>
                                    handleSelectStudent({
                                      id: student.id,
                                      name: student.name,
                                      nisn: student.nisn,
                                    })
                                  }
                                >
                                  <TableCell>{student.nisn}</TableCell>
                                  <TableCell className="font-medium">
                                    {student.name}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )}
                  </>
                )}

                {form.formState.errors.studentId && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.studentId.message}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Permit Details */}
            <Card>
              <CardHeader>
                <CardTitle>Detail Izin</CardTitle>
                <CardDescription>Informasi perizinan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="permitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jenis Izin</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih jenis izin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PERMIT_TYPES.map((type) => (
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Mulai</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tanggal Kembali</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alasan</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Jelaskan alasan izin..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="destination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tujuan (Opsional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Alamat tujuan" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="parentPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>No. HP Penjemput (Opsional)</FormLabel>
                      <FormControl>
                        <Input placeholder="08xxxxxxxxxx" {...field} />
                      </FormControl>
                      <FormDescription>
                        Nomor telepon orang tua/wali yang akan menjemput
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" asChild>
              <Link href={`/permits/${permitId}`}>Batal</Link>
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function EditPermitPage() {
  return (
    <MainLayout>
      <EditPermitPageContent />
    </MainLayout>
  );
}
