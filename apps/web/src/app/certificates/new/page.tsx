"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MainLayout } from "@/components/layout";
import { PageHeader } from "@/components/shared";
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
import { Switch } from "@/components/ui/switch";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { useCreateCertificate } from "@/hooks/use-certificate";
import { useStudents } from "@/hooks/use-students";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Award,
  CalendarIcon,
  Save,
  Loader2,
  User,
  FileText,
} from "lucide-react";

const formSchema = z.object({
  studentId: z.string().min(1, "Santri wajib dipilih"),
  certificateType: z.string().min(1, "Tipe sertifikat wajib dipilih"),
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  rank: z.string().optional().default(""),
  issueDate: z.date({
    error: "Tanggal terbit wajib diisi",
  }),
  signatoryName: z.string().min(3, "Nama penandatangan wajib diisi"),
  signatoryTitle: z.string().min(3, "Jabatan penandatangan wajib diisi"),
  signatureUrl: z.string().optional().default(""),
  isPublic: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

export default function NewCertificatePage() {
  const router = useRouter();

  const { data: studentsData, isLoading: isLoadingStudents } = useStudents({
    limit: 1000,
  });
  const createMutation = useCreateCertificate();

  const form = useForm<any>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      studentId: "",
      certificateType: "",
      title: "",
      description: "",
      grade: "",
      rank: "",
      signatoryName: "",
      signatoryTitle: "",
      signatureUrl: "",
      isPublic: false,
      issueDate: new Date(),
    },
  });

  const selectedType = form.watch("certificateType");

  const onSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync({
        studentId: data.studentId,
        certificateType: data.certificateType,
        title: data.title,
        description: data.description,
        grade: data.grade,
        rank: data.rank ? Number(data.rank) : undefined,
        issueDate: data.issueDate.toISOString(),
        signatoryName: data.signatoryName,
        signatoryTitle: data.signatoryTitle,
        signatureUrl: data.signatureUrl || undefined,
        isPublic: data.isPublic,
      });
      toast.success("Sertifikat berhasil dibuat");
      router.push("/certificates");
    } catch {
      toast.error("Gagal membuat sertifikat");
    }
  };

  // Auto-generate title based on type
  const handleTypeChange = (type: string) => {
    const titles: Record<string, string> = {
      IJAZAH: "Ijazah Pendidikan",
      STTB: "Surat Tanda Tamat Belajar",
      TAHFIDZ: "Sertifikat Tahfidz Al-Quran",
      SANAD: "Sanad Hafidz Al-Quran",
      ACHIEVEMENT: "Piagam Penghargaan",
      GRADUATION: "Sertifikat Kelulusan",
      PARTICIPATION: "Sertifikat Partisipasi",
    };
    if (titles[type] && !form.getValues("title")) {
      form.setValue("title", titles[type]);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/certificates")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader
            title="Buat Sertifikat Baru"
            description="Buat sertifikat digital untuk santri"
            icon={Award}
          />
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit as any)}
            className="space-y-6"
          >
            {/* Student Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Penerima Sertifikat
                </CardTitle>
                <CardDescription>
                  Pilih santri yang akan menerima sertifikat
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control as any}
                  name="studentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Santri *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih santri" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingStudents ? (
                            <SelectItem value="" disabled>
                              Memuat...
                            </SelectItem>
                          ) : (
                            studentsData?.data?.map((student: any) => (
                              <SelectItem key={student.id} value={student.id}>
                                {student.name || student.user?.name} -{" "}
                                {student.nisn}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Certificate Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Detail Sertifikat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Certificate Type */}
                  <FormField
                    control={form.control as any}
                    name="certificateType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipe Sertifikat *</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleTypeChange(value);
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih tipe" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="IJAZAH">Ijazah</SelectItem>
                            <SelectItem value="STTB">STTB</SelectItem>
                            <SelectItem value="TAHFIDZ">
                              Sertifikat Tahfidz
                            </SelectItem>
                            <SelectItem value="SANAD">Sanad Hafidz</SelectItem>
                            <SelectItem value="ACHIEVEMENT">
                              Piagam Prestasi
                            </SelectItem>
                            <SelectItem value="GRADUATION">
                              Kelulusan
                            </SelectItem>
                            <SelectItem value="PARTICIPATION">
                              Partisipasi
                            </SelectItem>
                            <SelectItem value="OTHER">Lainnya</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Issue Date */}
                  <FormField
                    control={form.control as any}
                    name="issueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Tanggal Terbit *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground",
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "dd MMMM yyyy", {
                                    locale: id,
                                  })
                                ) : (
                                  <span>Pilih tanggal</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date > new Date()}
                              autoFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Title */}
                <FormField
                  control={form.control as any}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Judul Sertifikat *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Contoh: Sertifikat Tahfidz Al-Quran 30 Juz"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control as any}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Keterangan</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Keterangan tambahan tentang sertifikat..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Grade */}
                  <FormField
                    control={form.control as any}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Predikat/Nilai</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih predikat" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Mumtaz">
                              Mumtaz (Istimewa)
                            </SelectItem>
                            <SelectItem value="Jayyid Jiddan">
                              Jayyid Jiddan (Sangat Baik)
                            </SelectItem>
                            <SelectItem value="Jayyid">
                              Jayyid (Baik)
                            </SelectItem>
                            <SelectItem value="Maqbul">
                              Maqbul (Cukup)
                            </SelectItem>
                            <SelectItem value="A">A</SelectItem>
                            <SelectItem value="B">B</SelectItem>
                            <SelectItem value="C">C</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Rank */}
                  <FormField
                    control={form.control as any}
                    name="rank"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Peringkat</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="Opsional"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Kosongkan jika tidak ada peringkat
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Signatory */}
            <Card>
              <CardHeader>
                <CardTitle>Penandatangan</CardTitle>
                <CardDescription>
                  Informasi pejabat yang menandatangani sertifikat
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control as any}
                    name="signatoryName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nama Penandatangan *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: Dr. H. Ahmad Fauzi, Lc., M.A."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control as any}
                    name="signatoryTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jabatan *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contoh: Direktur Pesantren"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control as any}
                  name="signatureUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Tanda Tangan Digital</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormDescription>
                        URL gambar tanda tangan (opsional, format PNG
                        transparan)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Pengaturan</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control as any}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Sertifikat Publik
                        </FormLabel>
                        <FormDescription>
                          Jika aktif, sertifikat dapat diakses dan diverifikasi
                          oleh publik
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/certificates")}
              >
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan Sertifikat
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </MainLayout>
  );
}
