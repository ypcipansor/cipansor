"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/zod-resolver";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, Heart, CalendarIcon, User } from "lucide-react";
import { toast } from "sonner";

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  useCampaigns,
  useCreateDonation,
  DONATION_TYPES,
  PAYMENT_METHODS,
  formatCurrency,
  DonationType,
  PaymentMethod,
} from "@/hooks/use-donation";

const donationSchema = z.object({
  campaignId: z.string().optional(),
  donorName: z.string().min(1, "Nama donatur wajib diisi"),
  donorEmail: z
    .string()
    .email("Email tidak valid")
    .optional()
    .or(z.literal("")),
  donorPhone: z.string().optional(),
  amount: z.coerce.number().min(1000, "Minimal donasi Rp 1.000"),
  type: z.enum([
    "INFAK",
    "INFAK_BULANAN",
    "ZAKAT_MAAL",
    "ZAKAT_FITRAH",
    "WAKAF",
    "SEDEKAH_JARIYAH",
    "PEMBANGUNAN",
    "BEASISWA",
    "OTHERS",
  ] as const),
  paymentMethod: z.enum([
    "CASH",
    "BANK_TRANSFER",
    "QRIS",
    "EWALLET",
    "OTHERS",
  ] as const),
  paymentDate: z.date({ error: "Pilih tanggal pembayaran" }),
  notes: z.string().optional(),
  isAnonymous: z.boolean(),
});

type DonationFormData = z.infer<typeof donationSchema>;

export default function NewDonationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCampaignId = searchParams.get("campaignId");

  const { data: campaignsData } = useCampaigns({
    status: "ACTIVE",
    limit: 100,
  });
  const createDonation = useCreateDonation();

  const campaigns = campaignsData?.data || [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DonationFormData>({
    resolver: zodResolver(donationSchema),
    defaultValues: {
      campaignId: preselectedCampaignId || "",
      donorName: "",
      donorEmail: "",
      donorPhone: "",
      amount: 0,
      type: "INFAK",
      paymentMethod: "BANK_TRANSFER",
      paymentDate: new Date(),
      notes: "",
      isAnonymous: false,
    },
  });

  const isAnonymous = watch("isAnonymous");
  const selectedCampaignId = watch("campaignId");
  const paymentDate = watch("paymentDate");
  const selectedType = watch("type");
  const selectedPaymentMethod = watch("paymentMethod");
  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  const onSubmit = async (data: DonationFormData) => {
    try {
      await createDonation.mutateAsync({
        campaignId: data.campaignId || undefined,
        donorName: data.donorName,
        donorEmail: data.donorEmail || undefined,
        donorPhone: data.donorPhone || undefined,
        amount: data.amount,
        type: data.type as DonationType,
        paymentMethod: data.paymentMethod as PaymentMethod,
        notes: data.notes || undefined,
        isAnonymous: data.isAnonymous,
      });
      toast.success("Donasi berhasil dicatat");
      if (preselectedCampaignId) {
        router.push(`/donation/campaigns/${preselectedCampaignId}`);
      } else {
        router.push("/donation");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Gagal mencatat donasi";
      toast.error(errorMessage);
    }
  };

  // Quick amount presets
  const amountPresets = [50000, 100000, 250000, 500000, 1000000, 2500000];

  return (
    <MainLayout>
      <PageHeader
        title="Catat Donasi"
        description="Catat donasi baru dari donatur"
        backHref={
          preselectedCampaignId
            ? `/donation/campaigns/${preselectedCampaignId}`
            : "/donation"
        }
        backLabel="Kembali"
      />

      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Campaign Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                Campaign Donasi
              </CardTitle>
              <CardDescription>
                Pilih campaign atau kosongkan untuk donasi umum
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="campaignId">Campaign</Label>
                <Select
                  value={selectedCampaignId || ""}
                  onValueChange={(value) => setValue("campaignId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih campaign (opsional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      Donasi Umum (Tanpa Campaign)
                    </SelectItem>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCampaign && (
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <p className="text-sm font-medium">
                      {selectedCampaign.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Target: {formatCurrency(selectedCampaign.targetAmount)} |
                      Terkumpul:{" "}
                      {formatCurrency(selectedCampaign.collectedAmount)}
                    </p>
                  </div>
                )}
                {errors.campaignId && (
                  <p className="text-sm text-destructive">
                    {errors.campaignId.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Donor Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informasi Donatur
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Anonymous Checkbox */}
              <div className="flex flex-row items-start space-x-3">
                <Checkbox
                  id="isAnonymous"
                  checked={isAnonymous}
                  onCheckedChange={(checked) =>
                    setValue("isAnonymous", !!checked)
                  }
                />
                <div className="space-y-1 leading-none">
                  <Label htmlFor="isAnonymous">
                    Donatur Anonim (Hamba Allah)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Nama donatur tidak akan ditampilkan
                  </p>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="donorName">Nama Donatur *</Label>
                <Input
                  id="donorName"
                  placeholder={
                    isAnonymous
                      ? "Tetap diisi untuk internal"
                      : "Nama lengkap donatur"
                  }
                  {...register("donorName")}
                />
                {isAnonymous && (
                  <p className="text-sm text-muted-foreground">
                    Nama tetap disimpan untuk keperluan internal
                  </p>
                )}
                {errors.donorName && (
                  <p className="text-sm text-destructive">
                    {errors.donorName.message}
                  </p>
                )}
              </div>

              {/* Phone & Email */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="donorPhone">No. HP</Label>
                  <Input
                    id="donorPhone"
                    placeholder="08123456789"
                    {...register("donorPhone")}
                  />
                  {errors.donorPhone && (
                    <p className="text-sm text-destructive">
                      {errors.donorPhone.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="donorEmail">Email</Label>
                  <Input
                    id="donorEmail"
                    type="email"
                    placeholder="donatur@email.com"
                    {...register("donorEmail")}
                  />
                  {errors.donorEmail && (
                    <p className="text-sm text-destructive">
                      {errors.donorEmail.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Donation Details */}
          <Card>
            <CardHeader>
              <CardTitle>Detail Donasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Type */}
              <div className="space-y-2">
                <Label>Tipe Donasi *</Label>
                <Select
                  value={selectedType}
                  onValueChange={(value) =>
                    setValue("type", value as DonationType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {DONATION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-sm text-destructive">
                    {errors.type.message}
                  </p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">Jumlah Donasi *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    Rp
                  </span>
                  <Input
                    id="amount"
                    type="number"
                    min={1000}
                    step={1000}
                    className="pl-10"
                    placeholder="100000"
                    {...register("amount")}
                  />
                </div>
                {/* Amount Presets */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {amountPresets.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setValue("amount", preset)}
                      className="text-xs"
                    >
                      {formatCurrency(preset)}
                    </Button>
                  ))}
                </div>
                {errors.amount && (
                  <p className="text-sm text-destructive">
                    {errors.amount.message}
                  </p>
                )}
              </div>

              {/* Payment Method & Date */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Metode Pembayaran *</Label>
                  <Select
                    value={selectedPaymentMethod}
                    onValueChange={(value) =>
                      setValue("paymentMethod", value as PaymentMethod)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih metode" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.paymentMethod && (
                    <p className="text-sm text-destructive">
                      {errors.paymentMethod.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Tanggal Pembayaran *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !paymentDate && "text-muted-foreground",
                        )}
                      >
                        {paymentDate ? (
                          format(paymentDate, "PPP")
                        ) : (
                          <span>Pilih tanggal</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={paymentDate}
                        onSelect={(date) =>
                          date && setValue("paymentDate", date)
                        }
                        disabled={(date) => date > new Date()}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.paymentDate && (
                    <p className="text-sm text-destructive">
                      {errors.paymentDate.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Catatan / Pesan</Label>
                <Textarea
                  id="notes"
                  placeholder="Pesan atau doa dari donatur..."
                  rows={3}
                  {...register("notes")}
                />
                {errors.notes && (
                  <p className="text-sm text-destructive">
                    {errors.notes.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={createDonation.isPending}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Batal
            </Button>
            <Button type="submit" disabled={createDonation.isPending}>
              {createDonation.isPending ? "Menyimpan..." : "Simpan Donasi"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
