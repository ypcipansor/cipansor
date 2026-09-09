"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MainLayout } from "@/components/layout";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateEmployee,
  useDepartments,
  EMPLOYEE_TYPES,
  EMPLOYEE_TYPE_LABELS,
} from "@/hooks";
import { useUnits } from "@/hooks";
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  Briefcase,
  CreditCard,
  GraduationCap,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

const employeeSchema = z.object({
  // Personal Info
  nip: z.string().min(1, "NIP wajib diisi"),
  fullName: z.string().min(1, "Nama lengkap wajib diisi"),
  gender: z.enum(["MALE", "FEMALE"], {
    error: "Jenis kelamin wajib dipilih",
  }),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  religion: z.string().optional(),
  maritalStatus: z.string().optional(),
  nik: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),

  // Employment Info
  unitId: z.string().min(1, "Unit wajib dipilih"),
  departmentId: z.string().optional(),
  position: z.string().min(1, "Jabatan wajib diisi"),
  employeeType: z.enum(["PERMANENT", "CONTRACT", "PART_TIME", "INTERN"], {
    error: "Tipe karyawan wajib dipilih",
  }),
  joinDate: z.string().min(1, "Tanggal bergabung wajib diisi"),

  // Bank Info
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountName: z.string().optional(),
  npwp: z.string().optional(),
  bpjsKesehatan: z.string().optional(),
  bpjsKetenagakerjaan: z.string().optional(),

  // Education
  lastEducation: z.string().optional(),
  educationInstitution: z.string().optional(),
  educationMajor: z.string().optional(),
  graduationYear: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

export default function NewEmployeePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("personal");
  const createEmployee = useCreateEmployee();

  const { data: units } = useUnits();
  const { data: departments } = useDepartments();

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      nip: "",
      fullName: "",
      gender: undefined,
      birthPlace: "",
      birthDate: "",
      religion: "Islam",
      maritalStatus: "",
      nik: "",
      email: "",
      phone: "",
      address: "",
      unitId: "",
      departmentId: "",
      position: "",
      employeeType: undefined,
      joinDate: new Date().toISOString().split("T")[0],
      bankName: "",
      bankAccountNumber: "",
      bankAccountName: "",
      npwp: "",
      bpjsKesehatan: "",
      bpjsKetenagakerjaan: "",
      lastEducation: "",
      educationInstitution: "",
      educationMajor: "",
      graduationYear: "",
    },
  });

  const onSubmit = async (data: EmployeeFormData) => {
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          formData.append(key, value);
        }
      });

      await createEmployee.mutateAsync(formData);
      toast.success("Karyawan berhasil ditambahkan");
      router.push("/hr");
    } catch (error) {
      toast.error("Gagal menambahkan karyawan");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Tambah Karyawan
            </h1>
            <p className="text-muted-foreground">
              Isi data lengkap karyawan baru
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="personal">
                  <User className="mr-2 h-4 w-4" />
                  Data Pribadi
                </TabsTrigger>
                <TabsTrigger value="employment">
                  <Briefcase className="mr-2 h-4 w-4" />
                  Kepegawaian
                </TabsTrigger>
                <TabsTrigger value="bank">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Bank & Pajak
                </TabsTrigger>
                <TabsTrigger value="education">
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Pendidikan
                </TabsTrigger>
              </TabsList>

              {/* Personal Info Tab */}
              <TabsContent value="personal" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Informasi Pribadi</CardTitle>
                    <CardDescription>Data pribadi karyawan</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="nip"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>NIP *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nomor Induk Pegawai"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="nik"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>NIK</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nomor Induk Kependudukan"
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
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Lengkap *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Nama lengkap sesuai KTP"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jenis Kelamin *</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih jenis kelamin" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="MALE">Laki-laki</SelectItem>
                                <SelectItem value="FEMALE">
                                  Perempuan
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="religion"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Agama</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih agama" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Islam">Islam</SelectItem>
                                <SelectItem value="Kristen">Kristen</SelectItem>
                                <SelectItem value="Katolik">Katolik</SelectItem>
                                <SelectItem value="Hindu">Hindu</SelectItem>
                                <SelectItem value="Buddha">Buddha</SelectItem>
                                <SelectItem value="Konghucu">
                                  Konghucu
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="birthPlace"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tempat Lahir</FormLabel>
                            <FormControl>
                              <Input placeholder="Kota kelahiran" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="birthDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tanggal Lahir</FormLabel>
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
                      name="maritalStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status Pernikahan</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Belum Menikah">
                                Belum Menikah
                              </SelectItem>
                              <SelectItem value="Menikah">Menikah</SelectItem>
                              <SelectItem value="Cerai Hidup">
                                Cerai Hidup
                              </SelectItem>
                              <SelectItem value="Cerai Mati">
                                Cerai Mati
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Kontak</CardTitle>
                    <CardDescription>Informasi kontak karyawan</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="email@example.com"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>No. Telepon</FormLabel>
                            <FormControl>
                              <Input placeholder="08xxxxxxxxxx" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alamat</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Alamat lengkap" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Employment Tab */}
              <TabsContent value="employment" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Data Kepegawaian</CardTitle>
                    <CardDescription>Informasi pekerjaan</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="unitId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit *</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih unit" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {units?.map((unit) => (
                                  <SelectItem key={unit.id} value={unit.id}>
                                    {unit.name}
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
                        name="departmentId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Departemen</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih departemen" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {departments?.map((dept) => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="position"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jabatan *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Contoh: Guru Matematika"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="employeeType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipe Karyawan *</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pilih tipe" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {EMPLOYEE_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {EMPLOYEE_TYPE_LABELS[type]}
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
                        name="joinDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tanggal Bergabung *</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bank Tab */}
              <TabsContent value="bank" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Informasi Bank</CardTitle>
                    <CardDescription>
                      Data rekening untuk penggajian
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Bank</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih bank" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="BCA">BCA</SelectItem>
                              <SelectItem value="BNI">BNI</SelectItem>
                              <SelectItem value="BRI">BRI</SelectItem>
                              <SelectItem value="Mandiri">Mandiri</SelectItem>
                              <SelectItem value="BSI">BSI</SelectItem>
                              <SelectItem value="BTN">BTN</SelectItem>
                              <SelectItem value="CIMB Niaga">
                                CIMB Niaga
                              </SelectItem>
                              <SelectItem value="Lainnya">Lainnya</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="bankAccountNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nomor Rekening</FormLabel>
                            <FormControl>
                              <Input placeholder="Nomor rekening" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bankAccountName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Atas Nama</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nama pemilik rekening"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pajak & BPJS</CardTitle>
                    <CardDescription>
                      Data pajak dan jaminan sosial
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="npwp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>NPWP</FormLabel>
                          <FormControl>
                            <Input placeholder="Nomor NPWP" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="bpjsKesehatan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>No. BPJS Kesehatan</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nomor BPJS Kesehatan"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bpjsKetenagakerjaan"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>No. BPJS Ketenagakerjaan</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Nomor BPJS Ketenagakerjaan"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Education Tab */}
              <TabsContent value="education" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Pendidikan Terakhir</CardTitle>
                    <CardDescription>
                      Informasi pendidikan karyawan
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="lastEducation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jenjang Pendidikan</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih jenjang" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="SD">SD/Sederajat</SelectItem>
                              <SelectItem value="SMP">SMP/Sederajat</SelectItem>
                              <SelectItem value="SMA">SMA/Sederajat</SelectItem>
                              <SelectItem value="D1">D1</SelectItem>
                              <SelectItem value="D2">D2</SelectItem>
                              <SelectItem value="D3">D3</SelectItem>
                              <SelectItem value="D4">D4</SelectItem>
                              <SelectItem value="S1">S1</SelectItem>
                              <SelectItem value="S2">S2</SelectItem>
                              <SelectItem value="S3">S3</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="educationInstitution"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Institusi</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Nama universitas/sekolah"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="educationMajor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Jurusan</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Program studi/jurusan"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="graduationYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tahun Lulus</FormLabel>
                            <FormControl>
                              <Input placeholder="2020" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Batal
              </Button>
              <Button type="submit" disabled={createEmployee.isPending}>
                {createEmployee.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan Karyawan
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
