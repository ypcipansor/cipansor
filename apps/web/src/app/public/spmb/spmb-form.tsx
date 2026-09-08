"use client";

import Image from "next/image";
import { siteConfig } from "@/config/site";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  useActivePeriod,
  useCreateRegistration,
  Gender,
} from "@/hooks/use-admissions";
import { usePublicUnits } from "@/hooks/use-units";
import {
  TurnstileWidget,
  useTurnstile,
} from "@/components/security/turnstile-widget";
import { getPeriodWindow } from "@/lib/admission-period";
import { RegistrationTracker } from "@/components/admissions/registration-tracker";
import {
  CheckCircle2,
  User,
  Users,
  MapPin,
  Phone,
  Mail,
  BookOpen,
  Upload,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Info,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface FormData {
  // Student info
  fullName: string;
  nickname: string;
  gender: Gender | "";
  birthPlace: string;
  birthDate: string;
  nationalId: string;
  familyCardNumber: string;

  // Previous school
  previousSchool: string;
  previousSchoolAddress: string;
  graduationYear: string;

  // Parent info
  fatherName: string;
  fatherOccupation: string;
  fatherPhone: string;
  fatherEmail: string;
  motherName: string;
  motherOccupation: string;
  motherPhone: string;

  // Address
  address: string;
  village: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;

  // Quran
  quranAbility: string;
  memorizedJuz: string;

  // Unit
  unitId: string;
  periodId: string;
  source?: string;
  campaignId?: string;
}

const initialFormData: FormData = {
  fullName: "",
  nickname: "",
  gender: "",
  birthPlace: "",
  birthDate: "",
  nationalId: "",
  familyCardNumber: "",
  previousSchool: "",
  previousSchoolAddress: "",
  graduationYear: "",
  fatherName: "",
  fatherOccupation: "",
  fatherPhone: "",
  fatherEmail: "",
  motherName: "",
  motherOccupation: "",
  motherPhone: "",
  address: "",
  village: "",
  district: "",
  city: "",
  province: "",
  postalCode: "",
  quranAbility: "",
  memorizedJuz: "",
  unitId: "",
  periodId: "",
};

const QURAN_ABILITIES = [
  { value: "BELUM_BISA", label: "Belum bisa membaca" },
  { value: "IQRO", label: "Masih Iqro" },
  { value: "LANCAR", label: "Lancar membaca Al-Quran" },
  { value: "TARTIL", label: "Tartil dan Tajwid baik" },
  { value: "HAFIDZ", label: "Sudah hafal beberapa juz" },
];

/**
 * The page used to branch on the mere existence of a period, so an expired one
 * rendered the green "Gelombang pendaftaran aktif hingga 31 Mei 2024" banner
 * and the full six-step form. The countdown's `Math.max(0, …)` then displayed
 * "0 Hari" instead of a negative number — the contradiction was on screen but
 * never acted on.
 *
 * The API does reject late submissions (`admissions.controller.ts` re-checks
 * the window server-side), but only at submit: a parent filled in their
 * child's name, NIK, address and documents before being told, in English,
 * "Admission period is not open for registration". The window has to be
 * checked before the form is offered, not after it is completed.
 */
export function SpmbForm({
  photo,
}: {
  /**
   * A photograph of the santri a prospective parent is being asked to join.
   *
   * This is the page every advertisement points at, and it showed nothing of
   * the pesantren at all. Resolved on the server so the alt text follows the
   * visitor's locale.
   */
  photo: { src: string; alt: string };
}) {
  const { data: activePeriod } = useActivePeriod();
  const { data: units = [] } = usePublicUnits();
  const createRegistration = useCreateRegistration();
  const turnstile = useTurnstile();
  const searchParams = useSearchParams();

  const periodWindow = getPeriodWindow(activePeriod);

  const [activeTab, setActiveTab] = useState("info");
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    registrationNumber: string;
    name: string;
  } | null>(null);

  // Capture source/campaign from URL
  useEffect(() => {
    const source = searchParams.get("source");
    const campaignId = searchParams.get("campaign_id");

    if (source || campaignId) {
      setFormData((prev) => ({
        ...prev,
        source: source || undefined,
        campaignId: campaignId || undefined,
      }));
    }
  }, [searchParams]);

  const [files, setFiles] = useState<{
    photo: File | null;
    birthCertificate: File | null;
    familyCard: File | null;
  }>({
    photo: null,
    birthCertificate: null,
    familyCard: null,
  });

  const steps = [
    { id: "student", title: "Data Calon Santri", icon: User },
    { id: "parent", title: "Data Orang Tua", icon: Users },
    { id: "address", title: "Alamat", icon: MapPin },
    { id: "quran", title: "Kemampuan Quran", icon: BookOpen },
    { id: "documents", title: "Dokumen", icon: Upload },
    { id: "confirm", title: "Konfirmasi", icon: CheckCircle2 },
  ];

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    // Validation per step
    if (currentStep === 0) {
      if (
        !formData.fullName ||
        !formData.gender ||
        !formData.birthPlace ||
        !formData.birthDate ||
        !formData.unitId
      ) {
        toast.error("Lengkapi semua data yang wajib diisi");
        return;
      }
    }
    if (currentStep === 1) {
      if (
        !formData.fatherName ||
        !formData.motherName ||
        !formData.fatherPhone
      ) {
        toast.error("Lengkapi data orang tua yang wajib diisi");
        return;
      }
    }
    if (currentStep === 2) {
      if (!formData.address || !formData.city || !formData.province) {
        toast.error("Lengkapi alamat yang wajib diisi");
        return;
      }
    }
    // Quran step (3) is optional or has defaults

    // Document step (4)
    if (currentStep === 4) {
      // Optional for now or mandatory? Let's make photo mandatory
      const requirements = (activePeriod as any)?.requirements;
      if (
        typeof requirements === "string" &&
        requirements.includes("photo") &&
        !files.photo
      ) {
        toast.error("Pas foto wajib diupload");
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof typeof files,
  ) => {
    if (e.target.files && e.target.files[0]) {
      setFiles((prev) => ({ ...prev, [field]: e.target.files![0] }));
    }
  };

  const handleSubmit = async () => {
    if (!turnstile.ready) return;
    setIsSubmitting(true);
    try {
      // Build a plain JSON payload matching the backend's
      // `createRegistrantSchema` in `apps/api/src/modules/admissions/schema.ts`.
      // Notes:
      //   - The schema field is `admissionPeriodId`, not the legacy `periodId`.
      //   - `birthDate` must be an ISO-8601 datetime string (`z.string().datetime()`),
      //     so we promote the date-only `<input type="date">` value to UTC midnight.
      //   - `memorizedJuz` / `graduationYear` are numeric on the backend.
      //   - `unitId` is not part of the schema (the unit is derived from the
      //     admission period), so it's intentionally omitted.
      //   - Files are NOT submitted here: documents have a separate upload flow
      //     under `/admissions/registrants/:id/documents`, and there is no
      //     multipart middleware on `POST /admissions/registrants`.
      const admissionPeriodId = formData.periodId || activePeriod?.id;
      if (!admissionPeriodId) {
        toast.error("Periode pendaftaran tidak ditemukan");
        setIsSubmitting(false);
        return;
      }

      const birthDateIso = formData.birthDate
        ? new Date(`${formData.birthDate}T00:00:00.000Z`).toISOString()
        : "";

      const payload: Record<string, unknown> = {
        admissionPeriodId,
        fullName: formData.fullName,
        gender: formData.gender,
        birthPlace: formData.birthPlace,
        birthDate: birthDateIso,
        address: formData.address,
        fatherName: formData.fatherName,
        motherName: formData.motherName,
      };

      // Optional fields — only include when set so empty strings don't
      // trip schema validators that expect non-empty / typed values.
      if (formData.nickname) payload.nickname = formData.nickname;
      if (formData.nationalId) payload.nationalId = formData.nationalId;
      if (formData.familyCardNumber)
        payload.familyCardNumber = formData.familyCardNumber;
      if (formData.village) payload.village = formData.village;
      if (formData.district) payload.district = formData.district;
      if (formData.city) payload.city = formData.city;
      if (formData.province) payload.province = formData.province;
      if (formData.postalCode) payload.postalCode = formData.postalCode;
      if (formData.previousSchool)
        payload.previousSchool = formData.previousSchool;
      if (formData.previousSchoolAddress)
        payload.previousSchoolAddress = formData.previousSchoolAddress;
      if (formData.graduationYear)
        payload.graduationYear = Number(formData.graduationYear);
      if (formData.fatherOccupation)
        payload.fatherOccupation = formData.fatherOccupation;
      if (formData.fatherPhone) payload.fatherPhone = formData.fatherPhone;
      if (formData.fatherEmail) payload.fatherEmail = formData.fatherEmail;
      if (formData.motherOccupation)
        payload.motherOccupation = formData.motherOccupation;
      if (formData.motherPhone) payload.motherPhone = formData.motherPhone;
      if (formData.quranAbility) payload.quranAbility = formData.quranAbility;
      if (formData.memorizedJuz)
        payload.memorizedJuz = Number(formData.memorizedJuz);
      if (formData.source) payload.source = formData.source;
      if (formData.campaignId) payload.campaignId = formData.campaignId;

      if (turnstile.token) payload.turnstileToken = turnstile.token;

      const result = await createRegistration.mutateAsync(payload);

      setSuccessData({
        registrationNumber:
          result?.registrationNo ||
          result?.registrationNumber ||
          "PSB-" + Date.now(),
        name: formData.fullName,
      });

      // Reset form
      setFormData(initialFormData);
      setFiles({ photo: null, birthCertificate: null, familyCard: null });
      setCurrentStep(0);
    } catch (error) {
      toast.error("Gagal mengirim pendaftaran. Silakan coba lagi.");
      // Token sekali pakai; percobaan berikutnya butuh tantangan baru.
      turnstile.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <LandingNavbar />

      {/*
        The page had no <h1> and only ~650 characters — the thinnest page on the
        site, and the one every ad would point at. Its own header also read
        "PSB Online": Kemendikdasmen replaced PPDB/PSB with SPMB from the
        2025/2026 intake, so the page contradicted the rest of the site.
      */}
      <section className="border-b border-border bg-white pt-16">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Pendaftaran SPMB {siteConfig.name}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            {/*
              This used to end "...dan tidak dipungut biaya." The active period
              in the record carries a registrationFee of Rp 350.000, so the page
              asserted free registration while the system charged for it. Fee
              and unit are period-scoped: they are now stated from the period
              itself, in the banner below, and not fixed here.
            */}
            Sistem Penerimaan Murid Baru (SPMB) Yayasan Pesantren Cipansor
            melayani seluruh unit pendidikan: TK Qur&rsquo;an, SD IT, SMP IT,
            SMA Qur&rsquo;an, dan program Takhosus. Pendaftaran dilakukan
            secara online. Unit dan biaya pendaftaran mengikuti gelombang yang
            sedang dibuka.
          </p>
          <p className="mt-3 text-muted-foreground">
            Isi formulir pada tab <strong>Informasi &amp; Pendaftaran</strong>,
            lalu simpan nomor pendaftaran Anda untuk memantau perkembangan
            seleksi melalui tab <strong>Cek Status</strong>. Bila ada
            pertanyaan, hubungi kami di{" "}
            <a
              href={`tel:+${siteConfig.contact.phoneE164}`}
              className="font-medium text-primary underline underline-offset-4"
            >
              {siteConfig.contact.phone}
            </a>{" "}
            atau melalui{" "}
            <a
              href={siteConfig.contact.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              WhatsApp
            </a>
            .
          </p>

          <figure className="mt-8">
            <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-border shadow-lg">
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority
              />
            </div>
            <figcaption className="mt-2 text-sm text-muted-foreground">
              {photo.alt}
            </figcaption>
          </figure>
        </div>
      </section>

      <main
        id="main-content"
        className="flex-1 max-w-3xl mx-auto px-4 py-8 w-full"
      >
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Informasi & Pendaftaran</TabsTrigger>
            <TabsTrigger value="check">Cek Status</TabsTrigger>
          </TabsList>

          {/* Info & Registration Tab */}
          <TabsContent value="info" className="space-y-6">
            {periodWindow !== "open" ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Calendar
                      className="h-8 w-8 text-gray-400"
                      aria-hidden="true"
                    />
                  </div>
                  {/* h2, matching the period-name heading in the open state:
                      this card replaces it, so the outline stays h1 -> h2 -> h3
                      whichever branch renders. */}
                  <h2 className="text-lg font-semibold">
                    {periodWindow === "upcoming"
                      ? "Pendaftaran Belum Dibuka"
                      : periodWindow === "closed"
                        ? "Pendaftaran Telah Ditutup"
                        : "Pendaftaran Belum Dibuka"}
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-muted-foreground text-pretty">
                    {periodWindow === "upcoming" && activePeriod ? (
                      <>
                        Pendaftaran {activePeriod.name} akan dibuka pada{" "}
                        <strong>
                          {format(
                            new Date(activePeriod.startDate),
                            "d MMMM yyyy",
                            { locale: idLocale },
                          )}
                        </strong>
                        . Silakan kembali pada tanggal tersebut.
                      </>
                    ) : periodWindow === "closed" && activePeriod ? (
                      <>
                        Periode {activePeriod.name} telah ditutup pada{" "}
                        <strong>
                          {format(
                            new Date(activePeriod.endDate),
                            "d MMMM yyyy",
                            { locale: idLocale },
                          )}
                        </strong>
                        . Informasi gelombang berikutnya akan diumumkan melalui
                        halaman ini. Untuk menanyakan ketersediaan kuota,
                        silakan hubungi panitia SPMB.
                      </>
                    ) : (
                      <>
                        Mohon maaf, saat ini belum ada periode penerimaan murid
                        baru yang dibuka. Silakan hubungi panitia untuk
                        informasi lebih lanjut.
                      </>
                    )}
                  </p>
                  {/*
                    No contact buttons here. A closed form needs to offer a way
                    through, but the "Butuh Bantuan?" card below is outside the
                    tabs and always visible with the same number and address —
                    repeating them put the identical pair twice on one screen.
                  */}
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-green-900">
                          {activePeriod.name}
                        </h2>
                        <p className="text-green-700 mt-1">
                          Gelombang pendaftaran aktif hingga{" "}
                          {format(
                            new Date(activePeriod.endDate),
                            "d MMMM yyyy",
                            { locale: idLocale },
                          )}
                        </p>
                        {/*
                          Which unit this period admits to, and what it costs.
                          Both are period-scoped in the data, so stating either
                          as fixed page copy contradicts the record as soon as
                          a different period becomes current.
                        */}
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-green-800">
                          {activePeriod.unit?.name && (
                            <span>
                              Unit: <strong>{activePeriod.unit.name}</strong>
                            </span>
                          )}
                          <span>
                            Biaya pendaftaran:{" "}
                            <strong>
                              {Number(activePeriod.registrationFee) > 0
                                ? new Intl.NumberFormat("id-ID", {
                                    style: "currency",
                                    currency: "IDR",
                                    minimumFractionDigits: 0,
                                  }).format(Number(activePeriod.registrationFee))
                                : "Gratis"}
                            </strong>
                          </span>
                        </div>
                      </div>
                      <div className="bg-white/50 p-3 rounded-lg border border-green-100 backdrop-blur-sm self-start">
                        <div className="text-sm text-green-800 font-medium">
                          Sisa Waktu
                        </div>
                        {/*
                          No `Math.max(0, …)` clamp here any more. This branch
                          only renders while the window is open, so the value
                          cannot be negative; clamping it was what let an
                          expired period display a reassuring "0 Hari".
                        */}
                        <div className="text-2xl font-bold text-green-600">
                          {differenceInDays(
                            new Date(activePeriod.endDate),
                            new Date(),
                          )}{" "}
                          Hari
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Progress Steps */}
                <div className="relative">
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10" />
                  <div className="flex justify-between">
                    {steps.map((step, index) => {
                      const Icon = step.icon;
                      const isActive = index === currentStep;
                      const isCompleted = index < currentStep;

                      return (
                        <div
                          key={step.id}
                          className="flex flex-col items-center gap-2 bg-gray-50 px-2"
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                              isActive
                                ? "bg-green-600 text-white ring-4 ring-green-100"
                                : isCompleted
                                  ? "bg-green-100 text-green-600"
                                  : "bg-gray-200 text-gray-400"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <span
                            className={`text-xs font-medium hidden sm:block ${isActive ? "text-green-600" : "text-gray-500"}`}
                          >
                            {step.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Form Content */}
                <Card>
                  <CardHeader>
                    <CardTitle>{steps[currentStep].title}</CardTitle>
                    <CardDescription>
                      Lengkapi data berikut dengan benar
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Step 1: Student Data */}
                    {currentStep === 0 && (
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label>Pilih Unit Pendidikan</Label>
                          <Select
                            value={formData.unitId}
                            onValueChange={(v) =>
                              setFormData({ ...formData, unitId: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih unit tujuan" />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name} ({unit.type})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Nama Lengkap</Label>
                            <Input
                              value={formData.fullName}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  fullName: e.target.value,
                                })
                              }
                              placeholder="Sesuai Akte Kelahiran"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Nama Panggilan</Label>
                            <Input
                              value={formData.nickname}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  nickname: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Tempat Lahir</Label>
                            <Input
                              value={formData.birthPlace}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  birthPlace: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Tanggal Lahir</Label>
                            <Input
                              type="date"
                              value={formData.birthDate}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  birthDate: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Jenis Kelamin</Label>
                          <Select
                            value={formData.gender}
                            onValueChange={(v) =>
                              setFormData({ ...formData, gender: v as Gender })
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
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>NIK</Label>
                            <Input
                              value={formData.nationalId}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  nationalId: e.target.value,
                                })
                              }
                              maxLength={16}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Nomor Kartu Keluarga</Label>
                            <Input
                              value={formData.familyCardNumber}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  familyCardNumber: e.target.value,
                                })
                              }
                              maxLength={16}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Parent Data */}
                    {currentStep === 1 && (
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <h4 className="font-semibold flex items-center gap-2">
                            <User className="h-4 w-4" /> Data Ayah
                          </h4>
                          <div className="grid gap-4">
                            <div className="space-y-2">
                              <Label>Nama Ayah</Label>
                              <Input
                                value={formData.fatherName}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    fatherName: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Pekerjaan</Label>
                                <Input
                                  value={formData.fatherOccupation}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      fatherOccupation: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>No. WhatsApp</Label>
                                <Input
                                  value={formData.fatherPhone}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      fatherPhone: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="font-semibold flex items-center gap-2">
                            <User className="h-4 w-4" /> Data Ibu
                          </h4>
                          <div className="grid gap-4">
                            <div className="space-y-2">
                              <Label>Nama Ibu</Label>
                              <Input
                                value={formData.motherName}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    motherName: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Pekerjaan</Label>
                                <Input
                                  value={formData.motherOccupation}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      motherOccupation: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>No. WhatsApp</Label>
                                <Input
                                  value={formData.motherPhone}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      motherPhone: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Address */}
                    {currentStep === 2 && (
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label>Alamat Lengkap (Jalan, RT/RW)</Label>
                          <Textarea
                            value={formData.address}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                address: e.target.value,
                              })
                            }
                            rows={3}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Desa/Kelurahan</Label>
                            <Input
                              value={formData.village}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  village: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Kecamatan</Label>
                            <Input
                              value={formData.district}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  district: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Kota/Kabupaten</Label>
                            <Input
                              value={formData.city}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  city: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Provinsi</Label>
                            <Input
                              value={formData.province}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  province: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Kode Pos</Label>
                            <Input
                              value={formData.postalCode}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  postalCode: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Quran Ability */}
                    {currentStep === 3 && (
                      <>
                        <div className="space-y-2">
                          <Label>Kemampuan Membaca Al-Quran</Label>
                          <Select
                            value={formData.quranAbility}
                            onValueChange={(v) =>
                              setFormData({ ...formData, quranAbility: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih kemampuan" />
                            </SelectTrigger>
                            <SelectContent>
                              {QURAN_ABILITIES.map((ability) => (
                                <SelectItem
                                  key={ability.value}
                                  value={ability.value}
                                >
                                  {ability.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Jumlah Hafalan (Juz)</Label>
                          <Input
                            type="number"
                            value={formData.memorizedJuz}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                memorizedJuz: e.target.value,
                              })
                            }
                            placeholder="Jika sudah hafal, tulis jumlah juz"
                            min={0}
                            max={30}
                          />
                          <p className="text-xs text-muted-foreground">
                            Kosongkan jika belum memiliki hafalan
                          </p>
                        </div>

                        <Card className="bg-amber-50 border-amber-200">
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                              <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                              <div className="text-sm">
                                <p className="font-medium text-amber-800">
                                  Catatan:
                                </p>
                                <p className="text-amber-700">
                                  Kemampuan Al-Quran akan diuji saat tahap tes
                                  masuk. Isilah dengan jujur sesuai kondisi
                                  sebenarnya.
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </>
                    )}

                    {/* Step 5: Documents */}
                    {currentStep === 4 && (
                      <div className="space-y-6">
                        <Card className="bg-blue-50 border-blue-200">
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                              <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                              <div className="text-sm">
                                <p className="font-medium text-blue-800">
                                  Instruksi Upload:
                                </p>
                                <p className="text-blue-700">
                                  Format file yang didukung: JPG, PNG, PDF.
                                  Ukuran maksimal 2MB per file.
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Pas Foto (3x4 Latar Biru)</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileChange(e, "photo")}
                            />
                            {files.photo && (
                              <p className="text-xs text-green-600">
                                File terpilih: {files.photo.name}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Akte Kelahiran</Label>
                            <Input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) =>
                                handleFileChange(e, "birthCertificate")
                              }
                            />
                            {files.birthCertificate && (
                              <p className="text-xs text-green-600">
                                File terpilih: {files.birthCertificate.name}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Kartu Keluarga (KK)</Label>
                            <Input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) =>
                                handleFileChange(e, "familyCard")
                              }
                            />
                            {files.familyCard && (
                              <p className="text-xs text-green-600">
                                File terpilih: {files.familyCard.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 6: Confirmation */}
                    {currentStep === 5 && (
                      <div className="space-y-4">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                              Data Calon Santri
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-1">
                            <p>
                              <strong>Nama:</strong> {formData.fullName}
                            </p>
                            <p>
                              <strong>Jenis Kelamin:</strong>{" "}
                              {formData.gender === "MALE"
                                ? "Laki-laki"
                                : "Perempuan"}
                            </p>
                            <p>
                              <strong>TTL:</strong> {formData.birthPlace},{" "}
                              {formData.birthDate &&
                                format(
                                  new Date(formData.birthDate),
                                  "d MMMM yyyy",
                                  { locale: idLocale },
                                )}
                            </p>
                            <p>
                              <strong>Unit:</strong>{" "}
                              {
                                units.find((u) => u.id === formData.unitId)
                                  ?.name
                              }
                            </p>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                              Data Orang Tua
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-1">
                            <p>
                              <strong>Ayah:</strong> {formData.fatherName} (
                              {formData.fatherPhone})
                            </p>
                            <p>
                              <strong>Ibu:</strong> {formData.motherName}
                            </p>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">Alamat</CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm">
                            <p>{formData.address}</p>
                            <p>
                              {formData.village}, {formData.district}
                            </p>
                            <p>
                              {formData.city}, {formData.province}{" "}
                              {formData.postalCode}
                            </p>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">Dokumen</CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-1">
                            <p className="flex items-center gap-2">
                              {files.photo ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-gray-400" />
                              )}
                              Pas Foto:{" "}
                              {files.photo ? "Terupload" : "Belum diupload"}
                            </p>
                            <p className="flex items-center gap-2">
                              {files.birthCertificate ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-gray-400" />
                              )}
                              Akte Kelahiran:{" "}
                              {files.birthCertificate
                                ? "Terupload"
                                : "Belum diupload"}
                            </p>
                            <p className="flex items-center gap-2">
                              {files.familyCard ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-gray-400" />
                              )}
                              Kartu Keluarga:{" "}
                              {files.familyCard
                                ? "Terupload"
                                : "Belum diupload"}
                            </p>
                          </CardContent>
                        </Card>

                        <Card className="bg-blue-50 border-blue-200">
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                              <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                              <div className="text-sm">
                                <p className="font-medium text-blue-800">
                                  Pernyataan:
                                </p>
                                <p className="text-blue-700">
                                  Dengan mengirim formulir ini, saya menyatakan
                                  bahwa data yang saya isikan adalah benar dan
                                  dapat dipertanggungjawabkan.
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </CardContent>
                  {currentStep === steps.length - 1 && (
                    <div className="px-6 pb-2">
                      <TurnstileWidget
                        action="spmb-daftar"
                        {...turnstile.widgetProps}
                      />
                    </div>
                  )}
                  <CardFooter className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={handlePrev}
                      disabled={currentStep === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Sebelumnya
                    </Button>
                    {currentStep < steps.length - 1 ? (
                      <Button onClick={handleNext}>
                        Selanjutnya
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !turnstile.ready}
                      >
                        {isSubmitting ? "Mengirim..." : "Kirim Pendaftaran"}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              </>
            )}
          </TabsContent>

          {/*
            Check Status Tab.

            This was an unbound <Input> beside a <Button> with no onClick — the
            page instructs parents to track their registration here, and the
            button did nothing when pressed. It also promised the registration
            number would arrive "via SMS/WhatsApp", which nothing in the system
            sends; the number is shown once, in the confirmation dialog after
            submitting.
          */}
          <TabsContent value="check">
            <h2 className="mb-1 text-xl font-semibold">
              Cek Status Pendaftaran
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Masukkan nomor pendaftaran dan tanggal lahir calon santri. Nomor
              pendaftaran ditampilkan setelah formulir berhasil dikirim —
              simpan nomor tersebut untuk memantau proses seleksi.
            </p>
            <RegistrationTracker />
          </TabsContent>
        </Tabs>

        {/* Contact */}
        <Card className="mt-8 mb-12">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                {/* h3, not h4: the preceding heading is an h2, and skipping a
                    level breaks the document outline for screen readers. */}
                <h3 className="font-semibold text-lg mb-2">Butuh Bantuan?</h3>
                <p className="text-muted-foreground">
                  Hubungi panitia SPMB untuk informasi lebih lanjut
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={`tel:+${siteConfig.contact.phoneE164}`}
                  className="flex items-center gap-2 text-blue-600 hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {siteConfig.contact.phone}
                </a>
                <a
                  href={`mailto:${siteConfig.contact.email}`}
                  className="flex items-center gap-2 text-blue-600 hover:underline"
                >
                  <Mail className="h-4 w-4" />
                  {siteConfig.contact.email}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Shared site footer. The bespoke one here carried
          "© 2024 Yayasan Pendidikan Islam CIPANSOR" — a stale year and the
          wrong legal name (it is Yayasan Pesantren Cipansor). */}
      <LandingFooter />

      {/* Success Dialog */}
      <Dialog open={!!successData} onOpenChange={() => setSuccessData(null)}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              Pendaftaran Berhasil!
            </h3>
            <p className="text-muted-foreground mb-4">
              Terima kasih, <strong>{successData?.name}</strong>
            </p>
            <Card className="bg-blue-50 mb-4">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  Nomor Pendaftaran:
                </p>
                <p className="text-2xl font-mono font-bold text-blue-600">
                  {successData?.registrationNumber}
                </p>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground mb-6">
              Simpan nomor pendaftaran ini. Informasi selanjutnya akan dikirim
              via WhatsApp/SMS.
            </p>
            <Button onClick={() => setSuccessData(null)} className="w-full">
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
