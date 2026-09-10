"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, Search, GraduationCap, Loader2 } from "lucide-react";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useAdmissionPeriods,
  useCreateRegistrant,
} from "@/hooks/use-admissions";
import { useLookupAlumni } from "@/hooks/use-students";

const registrantFormSchema = z.object({
  admissionPeriodId: z.string().min(1, "Periode wajib dipilih"),
  fullName: z.string().min(2, "Nama lengkap minimal 2 karakter").max(100),
  gender: z.enum(["MALE", "FEMALE"]),
  birthPlace: z.string().min(2, "Tempat lahir wajib diisi").max(100),
  birthDate: z.string().min(1, "Tanggal lahir wajib diisi"),
  address: z.string().min(5, "Alamat wajib diisi"),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  nisn: z.string().optional(),
  nik: z.string().optional(),
  isInternalAlumni: z.boolean(),
  previousStudentId: z.string().optional(),
  internalNisn: z.string().optional(),
  internalNik: z.string().optional(),
});

type RegistrantFormValues = z.infer<typeof registrantFormSchema>;

export default function NewRegistrantPage() {
  const router = useRouter();
  const createRegistrant = useCreateRegistrant();

  const { data: periodsResponse, isLoading: periodsLoading } =
    useAdmissionPeriods();
  const periods = periodsResponse?.data || [];

  const [lookupIdentifier, setLookupIdentifier] = useState("");
  const [lookupInput, setLookupInput] = useState("");
  const [lookupMessage, setLookupMessage] = useState<
    "idle" | "found" | "notfound"
  >("idle");
  const lookup = useLookupAlumni(lookupIdentifier);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegistrantFormValues>({
    resolver: zodResolver(registrantFormSchema),
    defaultValues: {
      admissionPeriodId: "",
      fullName: "",
      gender: "MALE",
      birthPlace: "",
      birthDate: "",
      address: "",
      phone: "",
      email: "",
      nisn: "",
      nik: "",
      isInternalAlumni: false,
      previousStudentId: "",
      internalNisn: "",
      internalNik: "",
    },
  });

  // When an alumnus matches the lookup, prefill the internal re-enrollment
  // markers and the student's own data so the staff member does not retype them.
  useEffect(() => {
    if (!lookupIdentifier || lookup.isLoading) return;
    if (lookup.data) {
      const alumni = lookup.data;
      setValue("isInternalAlumni", true);
      setValue("previousStudentId", alumni.id);
      setValue("internalNisn", alumni.nisn ?? "");
      setValue("internalNik", alumni.nik ?? "");
      if (alumni.name) setValue("fullName", alumni.name);
      if (alumni.gender) setValue("gender", alumni.gender);
      if (alumni.birthPlace) setValue("birthPlace", alumni.birthPlace);
      if (alumni.birthDate)
        setValue("birthDate", alumni.birthDate.slice(0, 10));
      if (alumni.nisn) setValue("nisn", alumni.nisn);
      if (alumni.nik) setValue("nik", alumni.nik);
      setLookupMessage("found");
    } else if (lookup.isFetched) {
      // A second, failed lookup must not leave a previously-matched alumnus
      // attached to this registration.
      setValue("isInternalAlumni", false);
      setValue("previousStudentId", "");
      setValue("internalNisn", "");
      setValue("internalNik", "");
      setLookupMessage("notfound");
    }
  }, [
    lookupIdentifier,
    lookup.data,
    lookup.isLoading,
    lookup.isFetched,
    setValue,
  ]);

  const handleLookup = () => {
    const id = lookupInput.trim();
    if (id.length < 2) {
      toast.error("Masukkan NISN atau NIK minimal 2 digit.");
      return;
    }
    setLookupMessage("idle");
    setLookupIdentifier(id);
  };

  const onSubmit = async (data: RegistrantFormValues) => {
    try {
      await createRegistrant.mutateAsync({
        admissionPeriodId: data.admissionPeriodId,
        fullName: data.fullName,
        gender: data.gender,
        birthPlace: data.birthPlace,
        birthDate: new Date(`${data.birthDate}T00:00:00.000Z`).toISOString(),
        address: data.address,
        phone: data.phone || undefined,
        email: data.email || undefined,
        nisn: data.nisn || undefined,
        nik: data.nik || undefined,
        isInternalAlumni: data.isInternalAlumni || undefined,
        previousStudentId: data.previousStudentId || undefined,
        internalNisn: data.internalNisn || undefined,
        internalNik: data.internalNik || undefined,
      });
      toast.success("Registrasi berhasil dibuat.");
      router.push("/admissions");
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Gagal membuat registrasi.";
      toast.error(message);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admissions">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Registrasi Baru
            </h1>
            <p className="text-muted-foreground">
              Daftarkan calon santri atau re-enroll alumni internal
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Alumni Internal</CardTitle>
              <CardDescription>
                Jika calon adalah alumni internal, cari lewat NISN/NIK untuk
                mengisi data re-enrollment secara otomatis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="space-y-2 sm:w-80">
                  <Label htmlFor="lookupIdentifier">NISN / NIK Alumni</Label>
                  <Input
                    id="lookupIdentifier"
                    placeholder="Masukkan NISN atau NIK"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookup}
                  disabled={lookup.isLoading}
                >
                  {lookup.isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Cari Alumni
                </Button>
              </div>

              {lookupMessage === "found" && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <GraduationCap className="h-4 w-4" /> Alumni internal
                  ditemukan — data re-enrollment telah diisi otomatis.
                </div>
              )}
              {lookupMessage === "notfound" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Alumni internal tidak ditemukan untuk identifier tersebut.
                  Periksa NISN/NIK atau lanjutkan sebagai pendaftar biasa.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Calon Santri</CardTitle>
              <CardDescription>Data dasar pendaftaran</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="admissionPeriodId">Periode *</Label>
                  <Select
                    onValueChange={(value) =>
                      setValue("admissionPeriodId", value)
                    }
                    disabled={periodsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih periode" />
                    </SelectTrigger>
                    <SelectContent>
                      {periods.map((period: any) => (
                        <SelectItem key={period.id} value={period.id}>
                          {period.name} — {period.unit?.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.admissionPeriodId && (
                    <p className="text-sm text-destructive">
                      {errors.admissionPeriodId.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Nama Lengkap *</Label>
                  <Input
                    id="fullName"
                    placeholder="Nama lengkap"
                    {...register("fullName")}
                  />
                  {errors.fullName && (
                    <p className="text-sm text-destructive">
                      {errors.fullName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Jenis Kelamin *</Label>
                  <Select
                    onValueChange={(value) =>
                      setValue("gender", value as "MALE" | "FEMALE")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis kelamin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Laki-laki</SelectItem>
                      <SelectItem value="FEMALE">Perempuan</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.gender && (
                    <p className="text-sm text-destructive">
                      {errors.gender.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthPlace">Tempat Lahir *</Label>
                  <Input
                    id="birthPlace"
                    placeholder="Tempat lahir"
                    {...register("birthPlace")}
                  />
                  {errors.birthPlace && (
                    <p className="text-sm text-destructive">
                      {errors.birthPlace.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthDate">Tanggal Lahir *</Label>
                  <Input
                    id="birthDate"
                    type="date"
                    {...register("birthDate")}
                  />
                  {errors.birthDate && (
                    <p className="text-sm text-destructive">
                      {errors.birthDate.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Alamat *</Label>
                  <Input
                    id="address"
                    placeholder="Alamat lengkap"
                    {...register("address")}
                  />
                  {errors.address && (
                    <p className="text-sm text-destructive">
                      {errors.address.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">No. HP</Label>
                  <Input
                    id="phone"
                    placeholder="08xxxxxxxxxx"
                    {...register("phone")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@contoh.com"
                    {...register("email")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nisn">NISN</Label>
                  <Input
                    id="nisn"
                    placeholder="NISN (10 digit)"
                    {...register("nisn")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nik">NIK</Label>
                  <Input
                    id="nik"
                    placeholder="NIK (16 digit)"
                    {...register("nik")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" asChild>
              <Link href="/admissions">Batal</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting || periodsLoading}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Simpan Registrasi
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
