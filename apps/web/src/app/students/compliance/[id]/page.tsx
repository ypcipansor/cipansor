"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  User,
  MapPin,
  Car,
  Heart,
  Users,
  CreditCard,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  BLOOD_TYPE_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  INCOME_RANGE_OPTIONS,
  OCCUPATION_OPTIONS,
  TRANSPORT_MODE_OPTIONS,
  updateStudentComplianceSchema,
  type UpdateStudentComplianceRequest,
} from "@cipansor/shared";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

import {
  useStudentCompliance,
  useUpdateStudentCompliance,
  type StudentComplianceData,
} from "@/hooks/use-student-compliance";
import {
  useProvinces,
  useRegencies,
  useDistricts,
  useVillages,
} from "@/hooks/use-wilayah";

/**
 * Isian formulir memakai nama kolom yang sama dengan API dan basis data
 * (`fatherNik`, `kipNumber`, `distanceToSchool`). Sampai 2026-09-14 formulir
 * ini memakai nama sendiri (`fatherNIK`, `isKIP`, `distance`, `pkhNumber`) dan
 * nilai pilihan yang tidak ada di enum ("MOTOR"), sehingga SETIAP simpan
 * dijawab 500. Isian tanpa kolom (nomor PKH/KKS, "memiliki disabilitas")
 * dihapus, bukan dikirim lalu hilang.
 */
type Isian = UpdateStudentComplianceRequest;
type Galat = Partial<Record<keyof Isian, string>>;

const teks = (v?: string | null) => v ?? "";
const angka = (v?: string | number | null) =>
  v === null || v === undefined || v === "" ? null : Number(v);
const angkaDariInput = (v: string) => (v === "" ? null : Number(v));

function isianAwal(s: StudentComplianceData): Isian {
  return {
    nisn: teks(s.nisn),
    nik: teks(s.nik),
    noAkta: teks(s.noAkta),
    noKK: teks(s.noKK),

    address: s.address ?? "",
    rt: teks(s.rt),
    rw: teks(s.rw),
    provinceId: s.provinceId ?? null,
    regencyId: s.regencyId ?? null,
    districtId: s.districtId ?? null,
    villageId: s.villageId ?? null,

    transportMode: s.transportMode ?? null,
    distanceToSchool: angka(s.distanceToSchool),
    travelTime: s.travelTime ?? null,

    kipNumber: teks(s.kipNumber),
    isPkh: s.isPkh ?? false,
    isKks: s.isKks ?? false,

    height: angka(s.height),
    weight: angka(s.weight),
    bloodType: s.bloodType ?? null,
    specialNeeds: teks(s.specialNeeds),

    fatherName: teks(s.fatherName),
    fatherNik: teks(s.fatherNik),
    fatherBirthDate: s.fatherBirthDate?.slice(0, 10) ?? "",
    fatherEducation: s.fatherEducation ?? null,
    fatherOccupation: s.fatherOccupation ?? null,
    fatherIncome: s.fatherIncome ?? null,

    motherName: teks(s.motherName),
    motherNik: teks(s.motherNik),
    motherBirthDate: s.motherBirthDate?.slice(0, 10) ?? "",
    motherEducation: s.motherEducation ?? null,
    motherOccupation: s.motherOccupation ?? null,
    motherIncome: s.motherIncome ?? null,

    guardianName: teks(s.guardianName),
    guardianNik: teks(s.guardianNik),
    guardianRelation: teks(s.guardianRelation),
    guardianPhone: teks(s.guardianPhone),
  };
}

function PesanGalat({ pesan }: { pesan?: string }) {
  if (!pesan) return null;
  return (
    <p data-field-error className="text-sm text-destructive">
      {pesan}
    </p>
  );
}

function PilihanDaftar<T extends string>({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: T | null | undefined;
  options: readonly { value: T; label: string }[];
  placeholder: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ""}
        onValueChange={(v) => onChange(v as T)}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StudentComplianceEditPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: student, isLoading } = useStudentCompliance(id);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!student) {
    return (
      <MainLayout>
        <PageHeader
          title="Santri tidak ditemukan"
          backHref="/students/compliance"
        />
      </MainLayout>
    );
  }

  // Isian diisi SEKALI dari data santri saat komponen formulir dipasang —
  // tanpa efek yang menyalin ulang dan menimpa ketikan petugas.
  return <FormulirKelengkapan key={student.id} student={student} />;
}

function FormulirKelengkapan({ student }: { student: StudentComplianceData }) {
  const router = useRouter();
  const updateCompliance = useUpdateStudentCompliance();

  const [isian, setIsian] = useState<Isian>(() => isianAwal(student));
  const [galat, setGalat] = useState<Galat>({});

  const { data: provinces } = useProvinces();
  const { data: regencies } = useRegencies({
    provinceId: isian.provinceId || undefined,
  });
  const { data: districts } = useDistricts({
    regencyId: isian.regencyId || undefined,
  });
  const { data: villages } = useVillages({
    districtId: isian.districtId || undefined,
  });

  const ubah = <K extends keyof Isian>(field: K, value: Isian[K]) => {
    setIsian((prev) => ({ ...prev, [field]: value }));
    if (galat[field]) {
      setGalat((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Aturan yang sama persis dengan yang dipakai API, dari @cipansor/shared.
    // Tanpa ini penolakan server hanya terbaca "Validation failed".
    const hasil = updateStudentComplianceSchema.safeParse(isian);
    if (!hasil.success) {
      const baru: Galat = {};
      for (const issue of hasil.error.issues) {
        const field = issue.path[0] as keyof Isian | undefined;
        if (field && !baru[field]) baru[field] = issue.message;
      }
      setGalat(baru);
      toast.error("Periksa isian yang ditandai merah.");
      const pertama = Object.keys(baru)[0];
      if (pertama) document.getElementById(pertama)?.focus();
      return;
    }
    setGalat({});

    try {
      await updateCompliance.mutateAsync({
        studentId: student.id,
        data: isian,
      });
      toast.success("Data kelengkapan tersimpan");
      router.push("/students/compliance");
    } catch {
      // Pesan dari API (mis. 409 "NISN ini sudah tercatat pada santri lain")
      // sudah ditampilkan interceptor di lib/api — jangan digandakan.
    }
  };

  const namaSantri = student.user?.name ?? student.name ?? student.nis;

  return (
    <MainLayout>
      <PageHeader
        title={`Edit Kelengkapan Data: ${namaSantri}`}
        description="Lengkapi data siswa untuk kepatuhan Dapodik dan administrasi"
        backHref="/students/compliance"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Siswa", href: "/students" },
          { label: "Kelengkapan Data", href: "/students/compliance" },
          { label: "Edit" },
        ]}
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6">
          {/* Identity Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Data Identitas</CardTitle>
              </div>
              <CardDescription>
                Data identitas resmi siswa (NISN, NIK, Akta, KK)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nisn">
                    NISN (Nomor Induk Siswa Nasional) *
                  </Label>
                  <Input
                    id="nisn"
                    inputMode="numeric"
                    placeholder="10 digit angka"
                    maxLength={10}
                    aria-invalid={!!galat.nisn}
                    value={isian.nisn ?? ""}
                    onChange={(e) => ubah("nisn", e.target.value)}
                  />
                  <PesanGalat pesan={galat.nisn} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nik">NIK (Nomor Induk Kependudukan) *</Label>
                  <Input
                    id="nik"
                    inputMode="numeric"
                    placeholder="16 digit angka"
                    maxLength={16}
                    aria-invalid={!!galat.nik}
                    value={isian.nik ?? ""}
                    onChange={(e) => ubah("nik", e.target.value)}
                  />
                  <PesanGalat pesan={galat.nik} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="noAkta">Nomor Akta Lahir *</Label>
                  <Input
                    id="noAkta"
                    placeholder="Nomor akta kelahiran"
                    aria-invalid={!!galat.noAkta}
                    value={isian.noAkta ?? ""}
                    onChange={(e) => ubah("noAkta", e.target.value)}
                  />
                  <PesanGalat pesan={galat.noAkta} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="noKK">Nomor Kartu Keluarga *</Label>
                  <Input
                    id="noKK"
                    inputMode="numeric"
                    placeholder="16 digit angka"
                    maxLength={16}
                    aria-invalid={!!galat.noKK}
                    value={isian.noKK ?? ""}
                    onChange={(e) => ubah("noKK", e.target.value)}
                  />
                  <PesanGalat pesan={galat.noKK} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Data Alamat</CardTitle>
              </div>
              <CardDescription>Alamat tempat tinggal sesuai KK</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Alamat Lengkap *</Label>
                <Textarea
                  id="address"
                  placeholder="Jalan, nomor rumah, nama gedung, dll."
                  aria-invalid={!!galat.address}
                  value={isian.address ?? ""}
                  onChange={(e) => ubah("address", e.target.value)}
                />
                <PesanGalat pesan={galat.address} />
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="rt">RT</Label>
                  <Input
                    id="rt"
                    placeholder="001"
                    maxLength={5}
                    value={isian.rt ?? ""}
                    onChange={(e) => ubah("rt", e.target.value)}
                  />
                  <PesanGalat pesan={galat.rt} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rw">RW</Label>
                  <Input
                    id="rw"
                    placeholder="001"
                    maxLength={5}
                    value={isian.rw ?? ""}
                    onChange={(e) => ubah("rw", e.target.value)}
                  />
                  <PesanGalat pesan={galat.rw} />
                </div>
              </div>
              <Separator />
              {/* Keempat tingkat wilayah dikirim; server menurunkan ulang
                  induknya dari desa dan menolak yang tidak cocok. */}
              <div className="grid gap-4 md:grid-cols-2">
                <PilihanDaftar
                  id="provinceId"
                  label="Provinsi *"
                  value={isian.provinceId}
                  options={(provinces ?? []).map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  placeholder="Pilih provinsi"
                  onChange={(val) =>
                    setIsian((prev) => ({
                      ...prev,
                      provinceId: val,
                      regencyId: null,
                      districtId: null,
                      villageId: null,
                    }))
                  }
                />
                <PilihanDaftar
                  id="regencyId"
                  label="Kabupaten/Kota *"
                  value={isian.regencyId}
                  options={(regencies ?? []).map((r) => ({
                    value: r.id,
                    label: r.name,
                  }))}
                  placeholder="Pilih kabupaten/kota"
                  disabled={!isian.provinceId}
                  onChange={(val) =>
                    setIsian((prev) => ({
                      ...prev,
                      regencyId: val,
                      districtId: null,
                      villageId: null,
                    }))
                  }
                />
                <PilihanDaftar
                  id="districtId"
                  label="Kecamatan *"
                  value={isian.districtId}
                  options={(districts ?? []).map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  placeholder="Pilih kecamatan"
                  disabled={!isian.regencyId}
                  onChange={(val) =>
                    setIsian((prev) => ({
                      ...prev,
                      districtId: val,
                      villageId: null,
                    }))
                  }
                />
                <PilihanDaftar
                  id="villageId"
                  label="Kelurahan/Desa *"
                  value={isian.villageId}
                  options={(villages ?? []).map((v) => ({
                    value: v.id,
                    label: v.name,
                  }))}
                  placeholder="Pilih kelurahan/desa"
                  disabled={!isian.districtId}
                  onChange={(val) => ubah("villageId", val)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Transport Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Data Transportasi</CardTitle>
              </div>
              <CardDescription>
                Informasi transportasi ke sekolah
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <PilihanDaftar
                  id="transportMode"
                  label="Moda Transportasi"
                  value={isian.transportMode}
                  options={TRANSPORT_MODE_OPTIONS}
                  placeholder="Pilih moda transportasi"
                  onChange={(val) => ubah("transportMode", val)}
                />
                <div className="space-y-2">
                  <Label htmlFor="distanceToSchool">
                    Jarak ke Sekolah (km)
                  </Label>
                  <Input
                    id="distanceToSchool"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    aria-invalid={!!galat.distanceToSchool}
                    value={isian.distanceToSchool ?? ""}
                    onChange={(e) =>
                      ubah("distanceToSchool", angkaDariInput(e.target.value))
                    }
                  />
                  <PesanGalat pesan={galat.distanceToSchool} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="travelTime">Waktu Tempuh (menit)</Label>
                  <Input
                    id="travelTime"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    aria-invalid={!!galat.travelTime}
                    value={isian.travelTime ?? ""}
                    onChange={(e) =>
                      ubah("travelTime", angkaDariInput(e.target.value))
                    }
                  />
                  <PesanGalat pesan={galat.travelTime} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Welfare Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Data Kesejahteraan</CardTitle>
              </div>
              <CardDescription>
                Data program bantuan pemerintah (KIP, PKH, KKS)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="kipNumber">Nomor KIP</Label>
                  <Input
                    id="kipNumber"
                    placeholder="Kosongkan bila bukan penerima KIP"
                    value={isian.kipNumber ?? ""}
                    onChange={(e) => ubah("kipNumber", e.target.value)}
                  />
                  <PesanGalat pesan={galat.kipNumber} />
                </div>
                <div className="flex items-center space-x-2 md:pt-8">
                  <Checkbox
                    id="isPkh"
                    checked={isian.isPkh ?? false}
                    onCheckedChange={(checked) =>
                      ubah("isPkh", checked === true)
                    }
                  />
                  <Label htmlFor="isPkh">Penerima PKH</Label>
                </div>
                <div className="flex items-center space-x-2 md:pt-8">
                  <Checkbox
                    id="isKks"
                    checked={isian.isKks ?? false}
                    onCheckedChange={(checked) =>
                      ubah("isKks", checked === true)
                    }
                  />
                  <Label htmlFor="isKks">Penerima KKS</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Health Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Data Kesehatan</CardTitle>
              </div>
              <CardDescription>
                Informasi kesehatan dan fisik siswa
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="height">Tinggi Badan (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    aria-invalid={!!galat.height}
                    value={isian.height ?? ""}
                    onChange={(e) =>
                      ubah("height", angkaDariInput(e.target.value))
                    }
                  />
                  <PesanGalat pesan={galat.height} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Berat Badan (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    aria-invalid={!!galat.weight}
                    value={isian.weight ?? ""}
                    onChange={(e) =>
                      ubah("weight", angkaDariInput(e.target.value))
                    }
                  />
                  <PesanGalat pesan={galat.weight} />
                </div>
                <PilihanDaftar
                  id="bloodType"
                  label="Golongan Darah"
                  value={isian.bloodType}
                  options={BLOOD_TYPE_OPTIONS}
                  placeholder="Pilih"
                  onChange={(val) => ubah("bloodType", val)}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="specialNeeds">
                  Kebutuhan Khusus / Disabilitas
                </Label>
                <Input
                  id="specialNeeds"
                  placeholder="Kosongkan bila tidak ada"
                  value={isian.specialNeeds ?? ""}
                  onChange={(e) => ubah("specialNeeds", e.target.value)}
                />
                <PesanGalat pesan={galat.specialNeeds} />
              </div>
            </CardContent>
          </Card>

          {(["father", "mother"] as const).map((siapa) => {
            const ayah = siapa === "father";
            const k = {
              name: `${siapa}Name`,
              nik: `${siapa}Nik`,
              birthDate: `${siapa}BirthDate`,
              education: `${siapa}Education`,
              occupation: `${siapa}Occupation`,
              income: `${siapa}Income`,
            } as const;
            return (
              <Card key={siapa}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <CardTitle>{ayah ? "Data Ayah" : "Data Ibu"}</CardTitle>
                  </div>
                  <CardDescription>
                    Informasi data orang tua ({ayah ? "ayah" : "ibu"})
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={k.name}>
                        Nama Lengkap {ayah ? "Ayah" : "Ibu"} *
                      </Label>
                      <Input
                        id={k.name}
                        placeholder={`Nama ${ayah ? "ayah" : "ibu"} sesuai KTP`}
                        value={isian[k.name] ?? ""}
                        onChange={(e) => ubah(k.name, e.target.value)}
                      />
                      <PesanGalat pesan={galat[k.name]} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={k.nik}>NIK {ayah ? "Ayah" : "Ibu"}</Label>
                      <Input
                        id={k.nik}
                        inputMode="numeric"
                        placeholder="16 digit angka"
                        maxLength={16}
                        aria-invalid={!!galat[k.nik]}
                        value={isian[k.nik] ?? ""}
                        onChange={(e) => ubah(k.nik, e.target.value)}
                      />
                      <PesanGalat pesan={galat[k.nik]} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={k.birthDate}>Tanggal Lahir</Label>
                      <Input
                        id={k.birthDate}
                        type="date"
                        aria-invalid={!!galat[k.birthDate]}
                        value={isian[k.birthDate] ?? ""}
                        onChange={(e) => ubah(k.birthDate, e.target.value)}
                      />
                      <PesanGalat pesan={galat[k.birthDate]} />
                    </div>
                    <PilihanDaftar
                      id={k.education}
                      label="Pendidikan Terakhir"
                      value={isian[k.education]}
                      options={EDUCATION_LEVEL_OPTIONS}
                      placeholder="Pilih pendidikan"
                      onChange={(val) => ubah(k.education, val)}
                    />
                    <PilihanDaftar
                      id={k.occupation}
                      label="Pekerjaan"
                      value={isian[k.occupation]}
                      options={OCCUPATION_OPTIONS}
                      placeholder="Pilih pekerjaan"
                      onChange={(val) => ubah(k.occupation, val)}
                    />
                    <PilihanDaftar
                      id={k.income}
                      label="Penghasilan per Bulan"
                      value={isian[k.income]}
                      options={INCOME_RANGE_OPTIONS}
                      placeholder="Pilih rentang penghasilan"
                      onChange={(val) => ubah(k.income, val)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Guardian Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Data Wali (Opsional)</CardTitle>
              </div>
              <CardDescription>
                Informasi wali jika berbeda dengan orang tua
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="guardianName">Nama Wali</Label>
                  <Input
                    id="guardianName"
                    placeholder="Nama wali"
                    value={isian.guardianName ?? ""}
                    onChange={(e) => ubah("guardianName", e.target.value)}
                  />
                  <PesanGalat pesan={galat.guardianName} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardianNik">NIK Wali</Label>
                  <Input
                    id="guardianNik"
                    inputMode="numeric"
                    placeholder="16 digit angka"
                    maxLength={16}
                    aria-invalid={!!galat.guardianNik}
                    value={isian.guardianNik ?? ""}
                    onChange={(e) => ubah("guardianNik", e.target.value)}
                  />
                  <PesanGalat pesan={galat.guardianNik} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardianRelation">
                    Hubungan dengan Siswa
                  </Label>
                  <Input
                    id="guardianRelation"
                    placeholder="Paman, Kakak, dll."
                    value={isian.guardianRelation ?? ""}
                    onChange={(e) => ubah("guardianRelation", e.target.value)}
                  />
                  <PesanGalat pesan={galat.guardianRelation} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardianPhone">No. HP Wali</Label>
                  <Input
                    id="guardianPhone"
                    placeholder="08xxxxxxxxxx"
                    value={isian.guardianPhone ?? ""}
                    onChange={(e) => ubah("guardianPhone", e.target.value)}
                  />
                  <PesanGalat pesan={galat.guardianPhone} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/students/compliance">Batal</Link>
            </Button>
            <Button type="submit" disabled={updateCompliance.isPending}>
              {updateCompliance.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Simpan
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </MainLayout>
  );
}
