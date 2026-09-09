"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ArrowLeft, Heart, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useUnits } from "@/hooks/use-units";
import {
  useCreateCampaign,
  CAMPAIGN_STATUSES,
  CampaignStatus,
} from "@/hooks/use-donation";

const campaignSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  description: z.string().optional(),
  targetAmount: z.coerce.number().min(100000, "Target minimal Rp 100.000"),
  unitId: z.string().optional(),
  startDate: z.date({ error: "Pilih tanggal mulai" }),
  endDate: z.date().optional(),
  status: z.string(),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const { data: units, isLoading: unitsLoading } = useUnits();
  const createCampaign = useCreateCampaign();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      title: "",
      description: "",
      targetAmount: 0,
      unitId: "",
      startDate: new Date(),
      endDate: undefined,
      status: "DRAFT",
      imageUrl: "",
    },
  });

  const startDate = watch("startDate");
  const endDate = watch("endDate");

  const onSubmit = async (data: CampaignFormData) => {
    try {
      await createCampaign.mutateAsync({
        title: data.title,
        description: data.description || undefined,
        targetAmount: data.targetAmount,
        unitId: data.unitId || undefined,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate?.toISOString(),
        status: data.status as CampaignStatus,
        imageUrl: data.imageUrl || undefined,
      });
      toast.success("Campaign berhasil dibuat");
      router.push("/donation");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal membuat campaign";
      toast.error(errorMessage);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/donation">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Buat Campaign Donasi
            </h1>
            <p className="text-muted-foreground">
              Buat campaign penggalangan dana baru
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                Informasi Campaign
              </CardTitle>
              <CardDescription>
                Isi informasi campaign dengan lengkap untuk memudahkan donatur
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Judul Campaign *</Label>
                  <Input
                    id="title"
                    placeholder="Pembangunan Masjid Tahfidz"
                    {...register("title")}
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive">
                      {errors.title.message}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Deskripsi</Label>
                  <Textarea
                    id="description"
                    placeholder="Jelaskan tujuan dan penggunaan dana..."
                    rows={4}
                    {...register("description")}
                  />
                  <p className="text-sm text-muted-foreground">
                    Deskripsikan detail campaign untuk menarik perhatian donatur
                  </p>
                </div>

                {/* Unit */}
                <div className="space-y-2">
                  <Label htmlFor="unitId">Unit</Label>
                  <Select
                    onValueChange={(value) => setValue("unitId", value)}
                    disabled={unitsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Yayasan (Umum)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Yayasan (Umum)</SelectItem>
                      {units?.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Kosongkan untuk campaign yayasan
                  </p>
                </div>

                {/* Target Amount */}
                <div className="space-y-2">
                  <Label htmlFor="targetAmount">Target Dana *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      Rp
                    </span>
                    <Input
                      id="targetAmount"
                      type="number"
                      min={100000}
                      step={100000}
                      className="pl-10"
                      placeholder="10000000"
                      {...register("targetAmount")}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Minimal target Rp 100.000
                  </p>
                  {errors.targetAmount && (
                    <p className="text-sm text-destructive">
                      {errors.targetAmount.message}
                    </p>
                  )}
                </div>

                {/* Dates */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tanggal Mulai *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate
                            ? format(startDate, "d MMMM yyyy", {
                                locale: localeId,
                              })
                            : "Pilih tanggal"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) =>
                            date && setValue("startDate", date)
                          }
                          autoFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {errors.startDate && (
                      <p className="text-sm text-destructive">
                        {errors.startDate.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Tanggal Berakhir</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate
                            ? format(endDate, "d MMMM yyyy", {
                                locale: localeId,
                              })
                            : "Tanpa batas"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => date && setValue("endDate", date)}
                          disabled={(date) => date < (startDate || new Date())}
                          autoFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-sm text-muted-foreground">
                      Kosongkan jika tanpa batas waktu
                    </p>
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    onValueChange={(value) => setValue("status", value)}
                    defaultValue="DRAFT"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Pilih DRAFT untuk menyimpan dulu, Aktif untuk membuka donasi
                  </p>
                </div>

                {/* Image URL */}
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">URL Gambar</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    {...register("imageUrl")}
                  />
                  <p className="text-sm text-muted-foreground">
                    Gambar banner campaign (opsional)
                  </p>
                  {errors.imageUrl && (
                    <p className="text-sm text-destructive">
                      {errors.imageUrl.message}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <div className="flex gap-4 pt-4">
                  <Button type="button" variant="outline" asChild>
                    <Link href="/donation">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Batal
                    </Link>
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || createCampaign.isPending}
                  >
                    {isSubmitting || createCampaign.isPending
                      ? "Menyimpan..."
                      : "Buat Campaign"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
